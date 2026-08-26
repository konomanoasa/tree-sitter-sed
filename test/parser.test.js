const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { after, before, test } = require("node:test");
const { createTreeSitter, grammars } = require("../scripts/tree-sitter");

let temporaryDirectory;
let treeSitter;
let fixtureNumber = 0;

before(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "tree-sitter-sed-parser-"));
  try {
    treeSitter = createTreeSitter();
  } catch (error) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
});

after(() => {
  try {
    treeSitter?.close();
  } finally {
    if (temporaryDirectory !== undefined) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
});

function parse(scope, source, edits = [], { ranges = false } = {}) {
  const sourcePath = join(temporaryDirectory, `fixture-${fixtureNumber}.sed`);
  fixtureNumber += 1;
  writeFileSync(sourcePath, source);
  const result = treeSitter.run(
    [
      "parse",
      "--scope",
      scope,
      ...(ranges ? [] : ["--no-ranges"]),
      sourcePath,
      ...(edits.length === 0 ? [] : ["--edits", ...edits]),
    ],
    {
      encoding: "utf8",
      env: { NO_COLOR: "1" },
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.error) {
    throw result.error;
  }
  return result;
}

function issuePaths(tree) {
  const pattern =
    /\(syntax_issue[ \t\r\n]+\(([a-z_]+)[ \t\r\n]+\(([a-z_]+)\)\)\)/g;
  return [...tree.matchAll(pattern)].map(
    ([, outcome, reason]) => `${outcome}/${reason}`,
  );
}

function applyEdits(source, edits) {
  let edited = Buffer.from(source);
  for (const edit of edits) {
    const firstSeparator = edit.indexOf(" ");
    const secondSeparator = edit.indexOf(" ", firstSeparator + 1);
    assert.ok(firstSeparator > 0 && secondSeparator > firstSeparator);

    const position = Number(edit.slice(0, firstSeparator));
    const deleted = Number(edit.slice(firstSeparator + 1, secondSeparator));
    assert.ok(Number.isSafeInteger(position) && position >= 0);
    assert.ok(Number.isSafeInteger(deleted) && deleted >= 0);
    assert.ok(position + deleted <= edited.length);

    edited = Buffer.concat([
      edited.subarray(0, position),
      Buffer.from(edit.slice(secondSeparator + 1)),
      edited.subarray(position + deleted),
    ]);
  }
  return edited;
}

const boundaryCases = [
  {
    name: "missing function at source end",
    scope: "source.sed",
    source: "1",
    issues: ["incomplete_syntax/missing_function"],
    nodes: ["line_number_address"],
  },
  {
    name: "missing function at source end in ERE mode",
    scope: "source.sed.ere",
    source: "1",
    issues: ["incomplete_syntax/missing_function"],
    nodes: ["line_number_address"],
  },
  {
    name: "missing label at source end",
    scope: "source.sed",
    source: ":",
    issues: ["incomplete_syntax/missing_label"],
    nodes: ["label_function"],
  },
  {
    name: "missing read file at source end",
    scope: "source.sed",
    source: "r",
    issues: ["incomplete_syntax/missing_rfile"],
    nodes: ["read_function"],
  },
  {
    name: "missing write file at source end",
    scope: "source.sed",
    source: "w",
    issues: ["incomplete_syntax/missing_wfile"],
    nodes: ["write_function"],
  },
  {
    name: "missing text introducer at source end",
    scope: "source.sed",
    source: "a",
    issues: ["incomplete_syntax/missing_text_introducer"],
    nodes: ["append_function"],
  },
  {
    name: "complete text at source end",
    scope: "source.sed",
    source: "a\\\nfoo",
    issues: [],
    nodes: ["append_function", "text_introducer", "text"],
  },
  {
    name: "empty text at source end",
    scope: "source.sed",
    source: "a\\\n",
    issues: ["incomplete_syntax/missing_text"],
    nodes: ["append_function", "text_introducer"],
  },
  {
    name: "missing opening delimiter at source end",
    scope: "source.sed",
    source: "s",
    issues: ["incomplete_syntax/missing_opening_delimiter"],
    nodes: ["substitute_function"],
  },
  {
    name: "missing block separator and closing brace at source end",
    scope: "source.sed",
    source: "{p",
    issues: [
      "incomplete_syntax/missing_command_separator",
      "incomplete_syntax/missing_closing_brace",
    ],
    nodes: ["block_function", "print_function"],
  },
  {
    name: "block leading empty command with missing separator at source end",
    scope: "source.sed",
    source: "{;p",
    issues: [
      "incomplete_syntax/missing_command_separator",
      "incomplete_syntax/missing_closing_brace",
    ],
    nodes: ["block_function", "empty_command", "print_function"],
  },
  {
    name: "blank-separated block end at source end",
    scope: "source.sed",
    source: "{ ",
    issues: [
      "incomplete_syntax/missing_command_separator",
      "incomplete_syntax/missing_closing_brace",
    ],
    nodes: ["block_function"],
  },
  {
    name: "unclosed BRE bracket expression at source end",
    scope: "source.sed",
    source: "/[a",
    issues: [
      "incomplete_syntax/unclosed_bracket_expression",
      "incomplete_syntax/incomplete_regular_expression",
      "incomplete_syntax/missing_function",
    ],
    nodes: ["bracket_expression"],
  },
  {
    name: "unclosed BRE bracket expression at a physical line boundary",
    scope: "source.sed",
    source: "/[a\np\n",
    issues: [
      "undefined_syntax/unclosed_bracket_expression",
      "nonconforming_syntax/unterminated_regular_expression",
      "nonconforming_syntax/missing_function",
    ],
    nodes: ["bracket_expression", "print_function"],
  },
  {
    name: "unfinished ERE alternative and group at source end",
    scope: "source.sed.ere",
    source: "/(a|",
    issues: [
      "incomplete_syntax/incomplete_alternative",
      "incomplete_syntax/unclosed_subexpression",
      "incomplete_syntax/incomplete_regular_expression",
      "incomplete_syntax/missing_function",
    ],
    nodes: ["ere_alternation_operator", "open_parenthesis"],
  },
  {
    name: "unfinished ERE interval at source end",
    scope: "source.sed.ere",
    source: "/a{1",
    issues: [
      "incomplete_syntax/incomplete_interval",
      "incomplete_syntax/incomplete_regular_expression",
      "incomplete_syntax/missing_function",
    ],
    nodes: ["ere_dupl_symbol", "open_brace"],
  },
  {
    name: "unfinished BRE escape at source end",
    scope: "source.sed",
    source: "/a\\",
    issues: [
      "incomplete_syntax/incomplete_regular_expression_escape",
      "incomplete_syntax/incomplete_regular_expression",
      "incomplete_syntax/missing_function",
    ],
    nodes: ["quoted_character"],
  },
  {
    name: "unfinished escape inside a BRE interval at source end",
    scope: "source.sed",
    source: "/a\\{2\\",
    issues: [
      "incomplete_syntax/incomplete_interval",
      "incomplete_syntax/incomplete_regular_expression",
      "incomplete_syntax/missing_function",
    ],
    nodes: ["back_open_brace", "dup_count"],
  },
  {
    name: "text introducer backslash without a newline at source end",
    scope: "source.sed",
    source: "a\\",
    issues: [
      "incomplete_syntax/missing_text_introducer",
      "nonconforming_syntax/unexpected_command_text",
    ],
    nodes: ["append_function"],
  },
  {
    name: "BRE extension escape remains neutral after duplication",
    scope: "source.sed",
    source: "/a*\\+/p\n",
    issues: ["implementation_defined_syntax/bre_plus_escape"],
    nodes: ["zero_or_more_operator", "bre_extension_escape", "print_function"],
  },
  {
    name: "unfinished replacement at source end",
    scope: "source.sed",
    source: "s/a/b",
    issues: ["incomplete_syntax/incomplete_replacement"],
    nodes: ["replacement"],
  },
  {
    name: "unfinished translation at source end",
    scope: "source.sed",
    source: "y/a/b",
    issues: ["incomplete_syntax/incomplete_translation"],
    nodes: ["translation_string"],
  },
  {
    name: "NUL remains native parser recovery",
    scope: "source.sed",
    source: "s\0p\n",
    issues: [],
    nodes: ["ERROR", "print_function"],
    nativeRecovery: true,
  },
];

for (const testCase of boundaryCases) {
  test(`boundary: ${testCase.name}`, () => {
    const result = parse(testCase.scope, testCase.source);
    const expectedStatus = testCase.nativeRecovery ? 1 : 0;
    assert.equal(
      result.status,
      expectedStatus,
      `unexpected parse status\n${result.stdout}${result.stderr}`,
    );
    assert.deepEqual(issuePaths(result.stdout), testCase.issues, result.stdout);
    for (const node of testCase.nodes) {
      assert.ok(
        result.stdout.includes(`(${node}`),
        `missing ${node}\n${result.stdout}`,
      );
    }
    if (!testCase.nativeRecovery) {
      assert.doesNotMatch(
        result.stdout,
        /\((ERROR|MISSING)([ \t\r\n)]|$)/,
        `unexpected native parser recovery\n${result.stdout}`,
      );
    }
  });
}

test("marker ranges: missing text introducer stays zero-width before a stray backslash", () => {
  const result = parse("source.sed", "a\\x\n", [], { ranges: true });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(
    result.stdout.includes("(missing_text_introducer [0, 1] - [0, 1])"),
    result.stdout,
  );
});

const explicitConvergenceCases = [
  {
    name: "unclosed bracket expression at source end",
    scope: "source.sed",
    source: "/[a",
    histories: [
      { source: "/[", edits: ["2 0 a"] },
      { source: "/[b", edits: ["2 1 a"] },
    ],
  },
  {
    name: "missing separator after an unmatched closing brace",
    scope: "source.sed",
    source: "}p\n",
    histories: [
      { source: "}\n", edits: ["1 0 p"] },
      { source: "};p\n", edits: ["1 1 "] },
    ],
  },
  {
    name: "reserved unknown function after negation",
    scope: "source.sed",
    source: "1!/\np\n",
    histories: [
      { source: "1!x\np\n", edits: ["2 1 /"] },
      { source: "1!$\np\n", edits: ["2 1 /"] },
    ],
  },
];

for (const testCase of explicitConvergenceCases) {
  test(`incremental: ${testCase.name}`, () => {
    const fresh = parse(testCase.scope, testCase.source);
    assert.equal(fresh.status, 0, fresh.stdout + fresh.stderr);
    for (const history of testCase.histories) {
      assert.deepEqual(
        applyEdits(history.source, history.edits),
        Buffer.from(testCase.source),
      );
      const incremental = parse(testCase.scope, history.source, history.edits);
      assert.equal(
        incremental.status,
        0,
        incremental.stdout + incremental.stderr,
      );
      assert.equal(incremental.stdout, fresh.stdout);
    }
  });
}

const fragments = [
  "p",
  "d",
  "x",
  "=",
  "q",
  "1p",
  "$p",
  "1,2p",
  "1 , 2p",
  ", 2p",
  "1,p",
  "/a/p",
  "/a*b/p",
  "/\\(a\\)/p",
  "/[abc]/p",
  "/[.a.]/p",
  "/[a-m-o]/p",
  "s/a/b/",
  "s/a/b/g",
  "s/a/b/w f",
  "s/a/b/2",
  "y/ab/cd/",
  "b x",
  "t",
  ":l",
  "a\\\ntext",
  "i\\\nfoo",
  "c\\\nbar",
  "r file",
  "w file",
  "{p;d}",
  "{p\nd\n}",
  "{ }",
  "#comment",
  "#n",
  "!p",
  "1!p",
  "}",
  "{p",
  "s/a",
  "/[a",
  "\\%re%p",
  "s;a;b;",
];
const insertions = "psdxq!{};,\n\\/*[]().^$|+?-:=# \tabw12".split("");
let seed = 42;

function random() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

function pick(list) {
  return list[Math.floor(random() * list.length)];
}

function randomCase() {
  const lineCount = 1 + Math.floor(random() * 3);
  const lines = [];
  for (let line = 0; line < lineCount; line++) {
    lines.push(pick(fragments));
  }
  const base = `${lines.join("\n")}\n`;
  const position = Math.floor(random() * (base.length + 1));
  if (random() < 0.5) {
    const text = pick(insertions);
    if (text === "\n") {
      return null;
    }
    return {
      base,
      edit: `${position} 0 ${text}`,
      edited: base.slice(0, position) + text + base.slice(position),
    };
  }
  const deleted = Math.min(
    1 + Math.floor(random() * 2),
    base.length - position,
  );
  if (deleted <= 0) {
    return null;
  }
  return {
    base,
    edit: `${position} ${deleted} `,
    edited: base.slice(0, position) + base.slice(position + deleted),
  };
}

test("incremental: fixed-seed generated histories converge", () => {
  const failures = [];
  for (const grammar of grammars) {
    for (let index = 0; index < 100; index++) {
      const testCase = randomCase();
      if (testCase === null) {
        continue;
      }
      assert.deepEqual(
        applyEdits(testCase.base, [testCase.edit]),
        Buffer.from(testCase.edited),
      );
      const fresh = parse(grammar.scope, testCase.edited);
      const incremental = parse(grammar.scope, testCase.base, [testCase.edit]);
      assert.equal(
        incremental.status,
        fresh.status,
        `${grammar.scope}: fresh and incremental statuses differ`,
      );
      if (fresh.stdout !== incremental.stdout) {
        failures.push(
          grammar.scope +
            ": base=" +
            JSON.stringify(testCase.base) +
            ", edit=" +
            JSON.stringify(testCase.edit) +
            ", edited=" +
            JSON.stringify(testCase.edited),
        );
        if (failures.length === 5) {
          break;
        }
      }
    }
    if (failures.length === 5) {
      break;
    }
  }
  assert.deepEqual(failures, []);
});
