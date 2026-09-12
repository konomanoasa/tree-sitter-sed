import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createTreeSitter, grammars, root } from "../scripts/tree-sitter.js";

let temporaryDirectory;
let treeSitter;

before(() => {
  temporaryDirectory = mkdtempSync(
    join(tmpdir(), "tree-sitter-sed-highlight-"),
  );
  try {
    treeSitter = createTreeSitter();
    for (const grammar of grammars) {
      const query = grammar.highlights
        .map((path) => readFileSync(join(root, path), "utf8"))
        .join("\n");
      writeFileSync(join(temporaryDirectory, `${grammar.name}.scm`), query);
    }
  } catch (error) {
    treeSitter?.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
});

after(() => {
  try {
    treeSitter?.close();
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

for (const grammar of grammars) {
  test(`${grammar.name} highlight query`, () => {
    assert.ok(grammar.highlights.length > 0, "missing highlight queries");
    const fixture = join(root, "test", "highlight", `${grammar.name}.sed`);
    const highlightResult = treeSitter.run(
      ["highlight", "--check", "--quiet", "--scope", grammar.scope, fixture],
      {
        encoding: "utf8",
        env: { NO_COLOR: "1" },
        maxBuffer: 1024 * 1024,
      },
    );
    if (highlightResult.error) {
      throw highlightResult.error;
    }
    assert.equal(
      highlightResult.status,
      0,
      highlightResult.stdout + highlightResult.stderr,
    );

    const queryResult = treeSitter.run(
      [
        "query",
        "--test",
        "--scope",
        grammar.scope,
        join(temporaryDirectory, `${grammar.name}.scm`),
        fixture,
      ],
      {
        encoding: "utf8",
        env: { NO_COLOR: "1" },
        maxBuffer: 1024 * 1024,
      },
    );
    if (queryResult.error) {
      throw queryResult.error;
    }
    assert.equal(
      queryResult.status,
      0,
      queryResult.stdout + queryResult.stderr,
    );
  });
}

const lexicalCaptureCases = [
  {
    name: "invalid encoding splits comment text",
    source: Buffer.from([35, 97, 255, 98, 10]),
    capture: "comment",
    ranges: [
      [0, 0, 0, 1],
      [0, 1, 0, 2],
      [0, 3, 0, 4],
    ],
  },
  ...[
    [
      "replacement",
      [115, 47, 97, 47, 120, 255, 121, 47, 10],
      [
        [0, 4, 0, 5],
        [0, 6, 0, 7],
      ],
    ],
    [
      "translation",
      [121, 47, 120, 255, 121, 47, 47, 10],
      [
        [0, 2, 0, 3],
        [0, 4, 0, 5],
      ],
    ],
    [
      "text",
      [97, 92, 10, 120, 255, 121, 10],
      [
        [1, 0, 1, 1],
        [1, 2, 1, 3],
      ],
    ],
  ].map(([name, bytes, ranges]) => ({
    name: `invalid encoding splits ${name} literals`,
    source: Buffer.from(bytes),
    capture: "string",
    ranges,
  })),
  ...[
    ["replacement", [115, 47, 97, 47, 92, 255, 47, 10]],
    ["translation", [121, 47, 92, 255, 47, 47, 10]],
    ["text", [97, 92, 10, 92, 255, 10]],
  ].map(([name, bytes]) => ({
    name: `invalid encoding does not become a ${name} escape`,
    source: Buffer.from(bytes),
    capture: "string.escape",
    ranges: [],
  })),
  ...[
    ["character class", "s/[[:alpha:", 10],
    ["collating symbol", "s/[[.a.", 6],
    ["equivalence class", "s/[[=a=", 6],
  ].flatMap(([name, source, closing]) =>
    ["", "]]/x/"].map((suffix) => ({
      name: `${name} ${suffix === "" ? "partial" : "complete"} closing delimiter`,
      source: source + suffix,
      capture: "punctuation.delimiter",
      ranges: [
        [0, 1, 0, 2],
        [0, 4, 0, 5],
        [0, closing, 0, closing + 1],
        ...(suffix === ""
          ? []
          : [
              [0, closing + 3, 0, closing + 4],
              [0, closing + 5, 0, closing + 6],
            ]),
      ],
    })),
  ),
  {
    name: "complete quoted escape",
    source: Buffer.from("/\\*/p\n"),
    capture: "string.escape",
    ranges: [[0, 1, 0, 3]],
  },
  {
    name: "NUL after a backslash",
    source: Buffer.from([47, 92, 0, 47, 112, 10]),
    capture: "string.escape",
    ranges: [],
  },
  {
    name: "invalid UTF-8 after a backslash",
    source: Buffer.from([47, 92, 255, 47, 112, 10]),
    capture: "string.escape",
    ranges: [],
  },
  {
    name: "special regular expression delimiter escape",
    source: "s.\\..x.",
    capture: "string.escape",
    ranges: [[0, 2, 0, 4]],
  },
  {
    name: "replacement ampersand delimiter escape",
    source: "s&a&\\&&",
    capture: "string.escape",
    ranges: [[0, 4, 0, 6]],
  },
  {
    name: "equivalence class meta characters",
    source: "/[[=-=]][[=]=]]/p\n",
    capture: "character.special",
    ranges: [
      [0, 4, 0, 5],
      [0, 11, 0, 12],
    ],
  },
  {
    name: "closing brackets inside multi-character collating elements",
    source: "/[[.a]b.]][[=c]d=]]/p\n",
    capture: "character.special",
    ranges: [
      [0, 4, 0, 7],
      [0, 13, 0, 16],
    ],
  },
  {
    name: "shared range endpoint operator",
    source: "/[a-b-c]/p\n",
    capture: "operator",
    ranges: [
      [0, 3, 0, 4],
      [0, 5, 0, 6],
    ],
  },
  ...["1", "a-b", "α", "\0" + "1"].map((name) => ({
    name: `invalid class name ${JSON.stringify(name)}`,
    source: `s/[[:${name}:]]/x/\n`,
    capture: "character.special",
    ranges: [],
  })),
  {
    name: "valid class name prefix before NUL and a digit",
    source: "s/[[:a\0" + "1:]]/x/\n",
    capture: "character.special",
    ranges: [[0, 5, 0, 6]],
  },
  {
    name: "valid class name",
    source: "s/[[:Alpha:]]/x/\n",
    capture: "character.special",
    ranges: [[0, 5, 0, 10]],
  },
];

for (const grammar of grammars) {
  test(`${grammar.name} highlights only identified lexical source`, () => {
    const path = join(temporaryDirectory, `${grammar.name}-lexical.sed`);
    for (const testCase of lexicalCaptureCases) {
      writeFileSync(path, testCase.source);
      const result = treeSitter.run(
        [
          "query",
          "--captures",
          "--scope",
          grammar.scope,
          join(temporaryDirectory, `${grammar.name}.scm`),
          path,
        ],
        { encoding: "utf8", env: { NO_COLOR: "1" } },
      );
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const captures = result.stdout
        .split("\n")
        .filter(
          (line) =>
            /capture: [0-9]+ - ([a-z_.]+),/.exec(line)?.[1] ===
            testCase.capture,
        )
        .map((line) => {
          const range =
            /start: \(([0-9]+), ([0-9]+)\), end: \(([0-9]+), ([0-9]+)\)/.exec(
              line,
            );
          assert.notEqual(range, null, line);
          return range.slice(1).map(Number);
        });
      assert.deepEqual(captures, testCase.ranges, testCase.name);
    }
  });
}
