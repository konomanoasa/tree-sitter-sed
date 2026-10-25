import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { grammars, root } from "../scripts/tree-sitter.js";
import { issueSignatures, parseCst, publicNodes } from "./support/cst.js";
import {
  applyEdits,
  assertIncrementalContract,
  parse,
  parseSuccessfully,
  parseSummary,
} from "./support/parser.js";

function parseCorpus(text) {
  const sections = text.split("==================\n");
  assert.equal(sections.shift(), "", "corpus must begin with a header");
  assert.equal(sections.length % 2, 0, "corpus headers must be paired");
  const cases = [];
  for (let index = 0; index < sections.length; index += 2) {
    const [name, ...attributes] = sections[index].trimEnd().split("\n");
    assert.ok(name, "corpus case must have a name");
    const languages = [];
    for (const attribute of attributes) {
      if (attribute === ":cst") continue;
      const match = /^:language\(([a-z_]+)\)$/.exec(attribute);
      assert.ok(match, `unsupported corpus attribute: ${attribute}`);
      assert.ok(!languages.includes(match[1]), `${name}: duplicate language`);
      languages.push(match[1]);
    }
    assert.ok(languages.length > 0, `${name}: missing language`);
    const parts = sections[index + 1].split("\n------------------\n");
    assert.equal(parts.length, 2, `${name}: expected one output separator`);
    const source = parts[0].endsWith("\r") ? parts[0].slice(0, -1) : parts[0];
    cases.push({ name, languages, source });
  }
  return cases;
}

const largeCommandCount = 100_000;
const largeTextCharacters = 1024 * 1024;
const largeRegexCharacters = 100_000;
const nestedBlockDepth = 2_000;
const nestedGroupDepth = 2_000;
const resourceTimeoutMicros = 10_000_000;
const invalidUtf8 = Buffer.from([0xff, 0xfe]);

for (const grammar of grammars) {
  test(`${grammar.name}: layout stays outside commands and empty lists`, () => {
    for (const { source, commands, lists } of [
      { source: " \t", commands: [], lists: [] },
      { source: " p; ", commands: [[1, 2]], lists: [[1, 3]] },
      { source: " 1 p", commands: [[1, 4]], lists: [[1, 4]] },
      { source: " ; ", commands: [], lists: [[1, 2]] },
      {
        source: "{ p; } ",
        commands: [
          [0, 6],
          [2, 3],
        ],
        lists: [
          [0, 6],
          [2, 4],
        ],
      },
      { source: "r file ", commands: [[0, 7]], lists: [[0, 7]] },
      { source: "a\\\n ", commands: [[0, 4]], lists: [[0, 4]] },
    ]) {
      const result = parseSuccessfully(grammar.scope, source);
      const ranges = (kind) =>
        result.nodes
          .filter((node) => node.kind === kind)
          .map(({ startByte, endByte }) => [startByte, endByte]);
      assert.deepEqual(ranges("command"), commands, source);
      assert.deepEqual(ranges("command_list"), lists, source);
      for (let byte = 0; byte < source.length; byte++) {
        if (source[byte] !== " " && source[byte] !== "\t") continue;
        assertIncrementalContract(
          result,
          parse(grammar.scope, source, [
            { byte, deleteBytes: 1, insert: "" },
            { byte, deleteBytes: 0, insert: source[byte] },
          ]),
          source,
        );
      }
    }
  });

  test(`${grammar.name}: missing elements follow permitted layout before completion`, () => {
    for (const { source, reason, completed } of [
      { source: "1 \t", reason: "missing_command", completed: "1 \tp" },
      { source: "r \t", reason: "missing_operand", completed: "r \tfile" },
      {
        source: "{; \t",
        reason: "missing_closing_delimiter",
        completed: "{; \t}",
      },
    ]) {
      const result = parseSuccessfully(grammar.scope, source);
      assert.deepEqual(
        result.nodes
          .filter((node) => node.kind === reason)
          .map(({ startByte, endByte }) => [startByte, endByte]),
        [[source.length, source.length]],
        source,
      );
      const fresh = parseSuccessfully(grammar.scope, completed);
      assert.deepEqual(issueSignatures(fresh.nodes), []);
      assertIncrementalContract(
        fresh,
        parse(grammar.scope, source, [
          {
            byte: source.length,
            deleteBytes: 0,
            insert: completed.slice(source.length),
          },
        ]),
        completed,
      );
      assertIncrementalContract(
        result,
        parse(grammar.scope, completed, [
          {
            byte: source.length,
            deleteBytes: completed.length - source.length,
            insert: "",
          },
        ]),
        source,
      );
    }
  });
}
for (const scope of ["source.sed", "source.sed.ere"]) {
  test(`${scope}: command layout preserves blank ownership and missing closer positions`, () => {
    for (const blanks of [" ", "\t", "\r", "\v", "\f", " \t\r\v\f"]) {
      for (const [prefix, suffix] of [
        ["", ""],
        ["", "p"],
        ["", "#n"],
        ["{", "}"],
        ["{;", ""],
        ["{{;", ""],
        ["{;p;", "}"],
        ["p;", "#n"],
      ]) {
        const source = prefix + blanks + suffix;
        const reference = prefix + " ".repeat(blanks.length) + suffix;
        const expected = parseSuccessfully(scope, reference);
        const actual = parseSuccessfully(scope, source);
        assert.deepEqual(actual.nodes, expected.nodes, JSON.stringify(source));
        assertIncrementalContract(
          actual,
          parseSuccessfully(scope, reference, [
            { byte: prefix.length, deleteBytes: blanks.length, insert: blanks },
          ]),
          JSON.stringify(source),
        );
        assertIncrementalContract(
          expected,
          parseSuccessfully(scope, source, [
            {
              byte: prefix.length,
              deleteBytes: blanks.length,
              insert: " ".repeat(blanks.length),
            },
          ]),
          `${JSON.stringify(source)}: restore spaces`,
        );
      }
    }
  });
}

test("sed: corpus reader preserves source and language selection", () => {
  const header = "==================\n";
  const separator = "\n------------------\n";
  const source = "p\0\n";
  assert.deepEqual(
    parseCorpus(
      `${header}Shared input\n:language(sed)\n:language(sed_ere)\n:cst\n${header}${source}${separator}expected\n\n` +
        `${header}Input at EOF\n:language(sed)\n${header}p${separator}(script)\n`,
    ),
    [
      { name: "Shared input", languages: ["sed", "sed_ere"], source },
      { name: "Input at EOF", languages: ["sed"], source: "p" },
    ],
  );
});

const corpusDirectory = join(root, "test", "corpus");
for (const file of readdirSync(corpusDirectory).sort()) {
  const cases = parseCorpus(readFileSync(join(corpusDirectory, file), "utf8"));
  for (const { name, languages, source } of cases) {
    for (const language of languages) {
      const grammar = grammars.find(({ name }) => name === language);
      assert.ok(grammar, `${file}: unknown language ${language}`);
      test(`${language}: ${file}: ${name}: CST invariants and fresh determinism`, () => {
        const first = parseSuccessfully(grammar.scope, source);
        const second = parseSuccessfully(grammar.scope, source);
        issueSignatures(first.nodes);
        assert.deepEqual(second.nodes, first.nodes);
      });
    }
  }
}

const cstSource = "# é\n1,";
const cstOutput = [
  "0:0 - 1:2   script",
  "0:0 - 1:2     command_list",
  "0:0 - 0:4       comment",
  "0:0 - 0:4         comment_text `# é`",
  "0:4 - 1:0       command_separator",
  "0:4 - 0:5         `\\n`",
  "1:0 - 1:2       command",
  "1:0 - 1:2         address: address_clause",
  "1:0 - 1:1           address",
  "1:0 - 1:1             line_address",
  "1:0 - 1:1               first: number `1`",
  "1:1 - 1:2           address_separator `,`",
  "1:2 - 1:2           issue: syntax_issue",
  "1:2 - 1:2             incomplete_syntax",
  "1:2 - 1:2               missing_address",
  "1:2 - 1:2         issue: syntax_issue",
  "1:2 - 1:2           incomplete_syntax",
  "1:2 - 1:2             missing_command",
].join("\n");

test("sed: CST helpers retain fields, UTF-8 byte offsets and zero-width issues", () => {
  const nodes = parseCst(cstOutput, cstSource);
  assert.deepEqual(
    nodes.map(({ kind, field, parent, start, end, startByte, endByte }) => [
      kind,
      field,
      parent,
      start,
      end,
      startByte,
      endByte,
    ]),
    [
      ["script", null, null, [0, 0], [1, 2], 0, 7],
      ["command_list", null, 0, [0, 0], [1, 2], 0, 7],
      ["comment", null, 1, [0, 0], [0, 4], 0, 4],
      ["comment_text", null, 2, [0, 0], [0, 4], 0, 4],
      ["command_separator", null, 1, [0, 4], [1, 0], 4, 5],
      ["command", null, 1, [1, 0], [1, 2], 5, 7],
      ["address_clause", "address", 5, [1, 0], [1, 2], 5, 7],
      ["address", null, 6, [1, 0], [1, 1], 5, 6],
      ["line_address", null, 7, [1, 0], [1, 1], 5, 6],
      ["number", "first", 8, [1, 0], [1, 1], 5, 6],
      ["address_separator", null, 6, [1, 1], [1, 2], 6, 7],
      ["syntax_issue", "issue", 6, [1, 2], [1, 2], 7, 7],
      ["incomplete_syntax", null, 11, [1, 2], [1, 2], 7, 7],
      ["missing_address", null, 12, [1, 2], [1, 2], 7, 7],
      ["syntax_issue", "issue", 5, [1, 2], [1, 2], 7, 7],
      ["incomplete_syntax", null, 14, [1, 2], [1, 2], 7, 7],
      ["missing_command", null, 15, [1, 2], [1, 2], 7, 7],
    ],
  );
  assert.deepEqual(issueSignatures(nodes), [
    {
      outcome: "incomplete_syntax",
      reason: "missing_address",
      range: "[1, 2] - [1, 2]",
    },
    {
      outcome: "incomplete_syntax",
      reason: "missing_command",
      range: "[1, 2] - [1, 2]",
    },
  ]);
});

test("sed: CST helpers reject truncated roots and malformed issue ownership", () => {
  assert.throws(() => parseCst("", cstSource), assert.AssertionError);
  assert.throws(
    () => parseCst(cstOutput, `${cstSource}p`),
    /root must reach the edited source end/,
  );
  for (const [name, before, after] of [
    ["wrong field", "issue: syntax_issue", "reason: syntax_issue"],
    [
      "outcome without an issue owner",
      "1:2 - 1:2             incomplete_syntax",
      "1:2 - 1:2           incomplete_syntax",
    ],
    [
      "reason without an outcome owner",
      "1:2 - 1:2               missing_address",
      "1:2 - 1:2             missing_address",
    ],
    [
      "outcome range differs",
      "1:2 - 1:2             incomplete_syntax",
      "1:1 - 1:2             incomplete_syntax",
    ],
    [
      "reason range differs",
      "1:2 - 1:2               missing_address",
      "1:1 - 1:2               missing_address",
    ],
  ]) {
    const nodes = parseCst(cstOutput.replace(before, after), cstSource);
    assert.throws(() => issueSignatures(nodes), assert.AssertionError, name);
  }
});

test("sed: public CST comparison retains source children inside native recovery", () => {
  const nodes = parseCst(
    [
      "0:0 - 0:1   script",
      "0:0 - 0:1     command_list",
      "0:0 - 0:1       •ERROR",
      "0:0 - 0:1         command: command",
      "0:0 - 0:1           function: simple_command",
      '0:0 - 0:1             "p"',
      "0:1 - 0:1       •MISSING",
      "0:1 - 0:1         command",
    ].join("\n"),
    "p",
  );
  assert.deepEqual(
    publicNodes(nodes).map(({ kind, field, parent }) => [kind, field, parent]),
    [
      ["script", null, null],
      ["command_list", null, 0],
      ["command", null, 1],
      ["simple_command", "function", 2],
      ['"p"', null, 3],
    ],
  );
});

for (const scope of ["source.sed", "source.sed.ere"]) {
  for (const [prefix, suffix, owner] of [
    ["s/a/", "/", "replacement"],
    ["y/", "/x/", "translation_string"],
    ["a ", "\n", "text"],
    ["r ", "\n", "filename"],
    ["b ", "\n", "label"],
    ["v ", "\n", "version"],
    ["e ", "\n", "shell_command"],
    ["s/[[:", ":]]/x/", "class_name"],
    ["s/[[.", ".]]/x/", "collating_element"],
    ["#", "\n", "comment"],
    ["s/", "/x/", "regex_branch"],
  ]) {
    test(`${scope}: invalid UTF-8 remains inside ${owner}`, () => {
      const before = Buffer.from(`${prefix}a`);
      const source = Buffer.concat([
        before,
        invalidUtf8,
        Buffer.from(`b${suffix}`),
      ]);
      const result = parseSuccessfully(scope, source);
      assert.deepEqual(
        issueSignatures(result.nodes).map(
          ({ outcome, reason }) => `${outcome}/${reason}`,
        ),
        [
          ...(owner === "class_name"
            ? ["invalid_syntax/unknown_character_class"]
            : []),
          "invalid_syntax/invalid_encoding",
        ],
        result.stdout,
      );
      const reason = result.nodes.find(
        (node) => node.kind === "invalid_encoding",
      );
      const issue = result.nodes[result.nodes[reason.parent].parent];
      assert.equal(result.nodes[issue.parent].kind, owner, result.stdout);
      assert.deepEqual(
        [issue.startByte, issue.endByte],
        [before.length, before.length + invalidUtf8.length],
      );
    });
  }

  for (const [prefix, suffix, owner] of [
    ["s", ";p", "substitute_command"],
    ["y", ";p", "translate_command"],
    ["\\", "p", "regex_address"],
    ["1", ";p", "command"],
    ["!", ";p", "command"],
    ["s/a/x/", "p", "substitution_flags"],
  ]) {
    test(`${scope}: invalid UTF-8 at ${owner} syntax boundary`, () => {
      const before = Buffer.from(prefix);
      const source = Buffer.concat([before, invalidUtf8, Buffer.from(suffix)]);
      const result = parseSuccessfully(scope, source);
      assert.deepEqual(
        issueSignatures(result.nodes).map(({ reason }) => reason),
        ["invalid_encoding"],
        result.stdout,
      );
      const issue = result.nodes.find((node) => node.kind === "syntax_issue");
      assert.equal(result.nodes[issue.parent].kind, owner, result.stdout);
      assert.deepEqual(
        [issue.startByte, issue.endByte],
        [before.length, before.length + invalidUtf8.length],
      );
      for (let offset = 0; offset < invalidUtf8.length; offset++) {
        const byte = before.length + offset;
        const edits = [{ byte, deleteBytes: 1, insert: "" }];
        assertIncrementalContract(
          parse(scope, applyEdits(source, edits)),
          parse(scope, source, edits),
          `${prefix} invalid byte ${byte}`,
        );
      }
    });
  }
}

for (const scope of ["source.sed", "source.sed.ere"]) {
  const open = scope.endsWith("ere") ? "(" : "\\(";
  const close = scope.endsWith("ere") ? ")" : "\\)";
  for (const [name, source] of [
    [`${largeCommandCount} commands`, "p;".repeat(largeCommandCount)],
    ["one MiB text operand", `a ${"x".repeat(largeTextCharacters)}`],
    [
      `${largeRegexCharacters} regex characters`,
      `s/${"a".repeat(largeRegexCharacters)}/b/`,
    ],
    [
      `${nestedBlockDepth} nested blocks`,
      `${"{".repeat(nestedBlockDepth)}p${"}".repeat(nestedBlockDepth)}`,
    ],
    [
      `${nestedGroupDepth} nested groups`,
      `s/${open.repeat(nestedGroupDepth)}a${close.repeat(nestedGroupDepth)}/b/`,
    ],
    [
      `${nestedGroupDepth} unclosed groups`,
      `s/${open.repeat(nestedGroupDepth)}a`,
    ],
  ]) {
    test(`${scope}: resources ${name}`, () => {
      const result = parseSummary(scope, source, resourceTimeoutMicros);
      assert.equal(result.successful, true, JSON.stringify(result));
    });
  }
}
