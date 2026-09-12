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

for (const grammar of grammars) {
  test(`${grammar.name} highlights only complete quoted escapes`, () => {
    const path = join(temporaryDirectory, `${grammar.name}-escape.sed`);
    for (const [source, expected] of [
      [Buffer.from("/\\*/p\n"), 1],
      [Buffer.from([47, 92, 0, 47, 112, 10]), 0],
      [Buffer.from([47, 92, 255, 47, 112, 10]), 0],
    ]) {
      writeFileSync(path, source);
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
        .filter((line) => line.includes("string.escape"));
      assert.equal(captures.length, expected, result.stdout);
      if (expected === 1)
        assert.match(captures[0], /start: \(0, 1\), end: \(0, 3\)/);
    }
  });
}
