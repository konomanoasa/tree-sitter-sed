const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { after, before, test } = require("node:test");
const { createTreeSitter, grammars } = require("../scripts/tree-sitter");
const nodeTypesByName = new Map([
  ["sed", require("../src/node-types.json")],
  ["sed_ere", require("../sed_ere/src/node-types.json")],
]);

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

function parse(
  scope,
  source,
  edits = [],
  { cst = false, ranges = false } = {},
) {
  const sourcePath = join(temporaryDirectory, `fixture-${fixtureNumber}.sed`);
  fixtureNumber += 1;
  writeFileSync(sourcePath, source);
  const result = treeSitter.run(
    [
      "parse",
      "--scope",
      scope,
      ...(cst ? ["--cst"] : []),
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

function parseSuccessfully(scope, source, edits = [], options = {}) {
  const result = parse(scope, source, edits, options);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result;
}

function cstLines(tree) {
  return tree
    .split("\n")
    .map((line) => line.trim().replaceAll("\t", " ").replaceAll(/ +/g, " "));
}

function directDelimiterLeafLines(tree, ownerType) {
  const rowPattern = /^([0-9]+:[0-9]+) +- +([0-9]+:[0-9]+)( +)([^ ].*)$/;
  const rows = tree
    .split("\n")
    .map((line) => {
      const match = rowPattern.exec(line);
      if (match === null) {
        return null;
      }
      return {
        column: line.length - match[4].length,
        content: match[4],
        line: `${match[1]} - ${match[2]} ${match[4]}`,
      };
    })
    .filter((row) => row !== null);
  const ownerIndex = rows.findIndex(({ content }) => content === ownerType);
  assert.notEqual(ownerIndex, -1, `missing ${ownerType}\n${tree}`);
  const ownerColumn = rows[ownerIndex].column;
  const descendants = [];
  for (let index = ownerIndex + 1; index < rows.length; index++) {
    if (rows[index].column <= ownerColumn) {
      break;
    }
    descendants.push(rows[index]);
  }
  const directColumn = Math.min(...descendants.map(({ column }) => column));
  const delimiterLeaves = new Set(['"["', '":"', '"."', '"="', '"]"']);
  return descendants
    .filter(
      ({ column, content }) =>
        column === directColumn && delimiterLeaves.has(content),
    )
    .map(({ line }) => line);
}

function nodeHeader(line) {
  const match = /\(([a-z_]+)( \[[0-9]+, [0-9]+\] - \[[0-9]+, [0-9]+\])?/.exec(
    line,
  );
  if (match === null) {
    return null;
  }
  return {
    type: match[1],
    range: match[2] === undefined ? null : match[2].slice(1),
  };
}

function issueSignatures(tree) {
  const lines = tree.split("\n");
  const signatures = [];
  for (let index = 0; index < lines.length; index++) {
    const issue = nodeHeader(lines[index]);
    if (issue?.type !== "syntax_issue") {
      continue;
    }
    const outcome = nodeHeader(lines[index + 1] ?? "");
    const reason = nodeHeader(lines[index + 2] ?? "");
    assert.ok(outcome !== null, `missing issue outcome\n${tree}`);
    assert.ok(reason !== null, `missing issue reason\n${tree}`);
    signatures.push({
      outcome: outcome.type,
      reason: reason.type,
      range: issue.range,
    });
  }
  return signatures;
}

function issuePaths(tree) {
  return issueSignatures(tree).map(
    ({ outcome, reason }) => `${outcome}/${reason}`,
  );
}

function syntaxSignatures(tree, types) {
  const selected = new Set(types);
  const ancestors = [];
  const signatures = [];
  for (const line of tree.split("\n")) {
    const node = nodeHeader(line);
    if (node === null) {
      continue;
    }
    const indentation = line.length - line.trimStart().length;
    while (
      ancestors.length > 0 &&
      ancestors.at(-1).indentation >= indentation
    ) {
      ancestors.pop();
    }
    if (selected.has(node.type)) {
      const field = /^ *([a-z_]+: )?\(/.exec(line)?.[1] ?? "";
      const depth = ancestors.filter(({ type }) => selected.has(type)).length;
      signatures.push(
        `${"  ".repeat(depth)}${field}${node.type} ${node.range}`,
      );
    }
    ancestors.push({ type: node.type, indentation });
  }
  return signatures;
}

function assertNoNodes(tree, ...types) {
  assert.doesNotMatch(
    tree,
    new RegExp(`\\((${types.join("|")})([ \\t\\r\\n)]|$)`),
    `unexpected ${types.join(", ")} node\n${tree}`,
  );
}

function parenthesisBalance(line) {
  let balance = 0;
  for (const character of line) {
    if (character === "(") {
      balance += 1;
    } else if (character === ")") {
      balance -= 1;
    }
  }
  return balance;
}

function topLevelEditingCommands(tree) {
  const rows = tree.split("\n").flatMap((line) => {
    const match =
      /^([0-9]+):([0-9]+) +- +([0-9]+):([0-9]+)( +)([a-z_"].*)$/.exec(line);
    return match === null
      ? []
      : [
          {
            start: [Number(match[1]), Number(match[2])],
            end: [Number(match[3]), Number(match[4])],
            column: line.length - match[6].length,
            content: match[6],
          },
        ];
  });
  const commandList = rows.find(({ content }) => content === "command_list");
  assert.ok(commandList !== undefined, `missing command_list\n${tree}`);
  const commands = [];
  for (let index = 0; index < rows.length; index++) {
    const command = rows[index];
    if (
      command.column !== commandList.column + 2 ||
      command.content !== "editing_command"
    ) {
      continue;
    }
    function relativePoint([row, column]) {
      return [
        row - command.start[0],
        row === command.start[0] ? column - command.start[1] : column,
      ];
    }
    const nodes = [];
    do {
      const row = rows[index];
      nodes.push({
        depth: row.column - command.column,
        content: row.content,
        start: relativePoint(row.start),
        end: relativePoint(row.end),
      });
      index += 1;
    } while (index < rows.length && rows[index].column > command.column);
    index -= 1;
    commands.push({ start: command.start, nodes });
  }
  return commands;
}

function assertIncrementalContract(fresh, incremental, context) {
  for (const result of [fresh, incremental]) {
    assert.ok(
      result.status === 0 || result.status === 1,
      `${context}: parser failed\n${result.stdout}${result.stderr}`,
    );
    assert.equal(nodeHeader(result.stdout.split("\n")[0])?.type, "script");
  }
  const freshIssues = issueSignatures(fresh.stdout);
  assert.deepEqual(
    issueSignatures(incremental.stdout),
    freshIssues,
    `${context}: fresh and incremental issue signatures differ`,
  );
  if (fresh.status === 0 && freshIssues.length === 0) {
    assert.equal(incremental.status, 0, `${context}: normal source has errors`);
    assert.equal(
      incremental.stdout,
      fresh.stdout,
      `${context}: fresh and incremental public CSTs differ`,
    );
  }
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
    name: "empty BRE subexpression at source end",
    scope: "source.sed",
    source: "/\\(",
    issues: [
      "incomplete_syntax/missing_subexpression",
      "incomplete_syntax/unclosed_subexpression",
      "incomplete_syntax/incomplete_regular_expression",
      "incomplete_syntax/missing_function",
    ],
    nodes: ["back_open_parenthesis"],
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
    issues: ["incomplete_syntax/incomplete_text_introducer"],
    nodes: ["append_function", "text_introducer"],
  },
  {
    name: "BRE extension escape remains neutral after duplication",
    scope: "source.sed",
    source: "/a*\\+/p\n",
    issues: ["implementation_defined_syntax/bre_plus_escape"],
    nodes: ["zero_or_more_operator", "bre_plus_escape", "print_function"],
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
    name: "omitted second address at source end",
    scope: "source.sed",
    source: "1,",
    issues: [
      "incomplete_syntax/omitted_address",
      "incomplete_syntax/missing_function",
    ],
    nodes: ["line_number_address", "address_separator_token"],
  },
  {
    name: "omitted second address at a command boundary",
    scope: "source.sed",
    source: "1,\np\n",
    issues: [
      "undefined_syntax/omitted_address",
      "nonconforming_syntax/missing_function",
    ],
    nodes: ["address_separator_token", "print_function"],
  },
  {
    name: "omitted first and second addresses at source end",
    scope: "source.sed",
    source: ",",
    issues: [
      "undefined_syntax/omitted_address",
      "incomplete_syntax/omitted_address",
      "incomplete_syntax/missing_function",
    ],
    nodes: ["address_separator_token"],
  },
  {
    name: "excess address unit with an omission at source end",
    scope: "source.sed",
    source: "1,2,",
    issues: [
      "nonconforming_syntax/excess_address",
      "incomplete_syntax/omitted_address",
      "incomplete_syntax/missing_function",
    ],
    nodes: ["line_number_address"],
  },
  {
    name: "omitted second address after separator blanks at source end",
    scope: "source.sed",
    source: "1 , ",
    issues: [
      "nonconforming_syntax/blanks_around_address_separator",
      "incomplete_syntax/omitted_address",
      "incomplete_syntax/missing_function",
    ],
    nodes: ["line_number_address", "address_separator_token"],
  },
];

const invalidCharacterCases = [
  {
    name: "function at source end",
    source: "\0",
    issues: [["unknown_function", "[0, 0] - [0, 1]"]],
  },
  {
    name: "function between complete commands",
    source: "p\n\0\nq\n",
    issues: [["unknown_function", "[1, 0] - [1, 1]"]],
  },
  {
    name: "trailing command text",
    source: "pX\0q\0\n",
    issues: [["unexpected_command_text", "[0, 1] - [0, 5]"]],
  },
  ...["s", "y"].map((verb) => ({
    name: `${verb} opening delimiter`,
    source: `${verb}\0p\n`,
    issues: [
      ["invalid_delimiter", "[0, 1] - [0, 2]"],
      ["unexpected_command_text", "[0, 2] - [0, 3]"],
    ],
  })),
  {
    name: "context address opening delimiter",
    source: "\\\0p\n",
    issues: [["invalid_delimiter", "[0, 1] - [0, 2]"]],
  },
];

for (const grammar of grammars) {
  for (const [name, character] of [
    ["NUL", "\0"],
    ["decode error", "\xff"],
  ]) {
    for (const testCase of invalidCharacterCases) {
      test(`${name}: ${testCase.name} in ${grammar.name}`, () => {
        const source = Buffer.from(
          testCase.source.replaceAll("\0", character),
          "latin1",
        );
        const fresh = parseSuccessfully(grammar.scope, source, [], {
          ranges: true,
        });
        assert.deepEqual(
          issueSignatures(fresh.stdout),
          testCase.issues.map(([reason, range]) => ({
            outcome: "nonconforming_syntax",
            reason,
            range,
          })),
          fresh.stdout,
        );
        assertNoNodes(fresh.stdout, "ERROR", "MISSING");
        const incremental = parse(
          grammar.scope,
          Buffer.concat([Buffer.from("p\n"), source]),
          ["0,0 2 "],
          { ranges: true },
        );
        assertIncrementalContract(
          fresh,
          incremental,
          `${name}: ${testCase.name}`,
        );
      });
    }
  }
}

for (const testCase of boundaryCases) {
  test(`boundary: ${testCase.name}`, () => {
    const result = parse(testCase.scope, testCase.source);
    assert.equal(
      result.status,
      0,
      `unexpected parse status\n${result.stdout}${result.stderr}`,
    );
    assert.deepEqual(issuePaths(result.stdout), testCase.issues, result.stdout);
    for (const node of testCase.nodes) {
      assert.ok(
        result.stdout.includes(`(${node}`),
        `missing ${node}\n${result.stdout}`,
      );
    }
    assertNoNodes(result.stdout, "ERROR", "MISSING");
  });
}

const omittedFileSeparatorCases = [
  {
    name: "read function",
    source: "rfile\n",
    owner: "read_function",
    operand: "rfile",
    issueColumn: 1,
    operandStart: 1,
    operandEnd: 5,
  },
  {
    name: "write function",
    source: "wfile\n",
    owner: "write_function",
    operand: "wfile",
    issueColumn: 1,
    operandStart: 1,
    operandEnd: 5,
  },
  {
    name: "substitution write flag",
    source: "s///wfile\n",
    owner: "write_flag",
    operand: "wfile",
    issueColumn: 5,
    operandStart: 5,
    operandEnd: 9,
  },
];

for (const grammar of grammars) {
  for (const testCase of omittedFileSeparatorCases) {
    test(`omitted file separator: ${testCase.name} in ${grammar.name}`, () => {
      const result = parseSuccessfully(grammar.scope, testCase.source, [], {
        ranges: true,
      });
      assert.deepEqual(issueSignatures(result.stdout), [
        {
          outcome: "invalid_syntax",
          reason: "omitted_file_separator",
          range: `[0, ${testCase.issueColumn}] - [0, ${testCase.issueColumn}]`,
        },
      ]);
      assert.ok(
        result.stdout.includes(`(${testCase.owner} `),
        `missing ${testCase.owner}\n${result.stdout}`,
      );
      assert.ok(
        result.stdout.includes(
          `${testCase.operand}: (${testCase.operand} [0, ${testCase.operandStart}] - [0, ${testCase.operandEnd}]`,
        ),
        `missing ${testCase.operand} operand\n${result.stdout}`,
      );
      assertNoNodes(result.stdout, "ERROR", "MISSING");
    });
  }
}

test("marker ranges: missing text introducer stays zero-width before a stray backslash", () => {
  const result = parseSuccessfully("source.sed", "a\\x\n", [], {
    ranges: true,
  });
  assert.ok(
    result.stdout.includes("(missing_text_introducer [0, 1] - [0, 1])"),
    result.stdout,
  );
});

test("ownership: an incomplete text introducer owns its backslash", () => {
  const result = parseSuccessfully("source.sed", "a\\", [], { ranges: true });
  assert.ok(
    result.stdout.includes(
      [
        "          introducer: (text_introducer [0, 1] - [0, 2]",
        "            issue: (syntax_issue [0, 1] - [0, 2]",
        "              (incomplete_syntax [0, 1] - [0, 2]",
        "                (incomplete_text_introducer [0, 1] - [0, 2]))))))",
      ].join("\n"),
    ),
    `the introducer must own the backslash\n${result.stdout}`,
  );
  assertNoNodes(result.stdout, "ERROR", "MISSING", "unexpected_command_text");
});

test("ownership: a malformed interval ends before a following construct", () => {
  const cases = [
    {
      scope: "source.sed",
      source: "/a\\{1[bc]\\}/p\n",
      issues: [
        {
          outcome: "undefined_syntax",
          reason: "malformed_interval",
          range: "[0, 5] - [0, 5]",
        },
        {
          outcome: "undefined_syntax",
          reason: "unmatched_interval_close",
          range: "[0, 9] - [0, 11]",
        },
      ],
      nodes: ["bracket_expression", "back_close_brace"],
    },
    {
      scope: "source.sed",
      source: "/\\(a\\{2\\)/p\n",
      issues: [
        {
          outcome: "undefined_syntax",
          reason: "malformed_interval",
          range: "[0, 7] - [0, 7]",
        },
      ],
      nodes: ["back_close_parenthesis_token"],
    },
    {
      scope: "source.sed",
      source: "/a\\{1,2,3\\}/p\n",
      issues: [
        {
          outcome: "undefined_syntax",
          reason: "malformed_interval",
          range: "[0, 7] - [0, 9]",
        },
      ],
      nodes: ["back_close_brace"],
    },
    {
      scope: "source.sed.ere",
      source: "/a{1[bc]}/p\n",
      issues: [
        {
          outcome: "undefined_syntax",
          reason: "malformed_interval",
          range: "[0, 4] - [0, 4]",
        },
      ],
      nodes: ["bracket_expression"],
    },
    {
      scope: "source.sed.ere",
      source: "/(a{2)/p\n",
      issues: [
        {
          outcome: "undefined_syntax",
          reason: "malformed_interval",
          range: "[0, 5] - [0, 5]",
        },
      ],
      nodes: ["close_parenthesis_token"],
    },
  ];
  for (const testCase of cases) {
    const result = parseSuccessfully(testCase.scope, testCase.source, [], {
      ranges: true,
    });
    assert.deepEqual(
      issueSignatures(result.stdout),
      testCase.issues,
      `${testCase.scope}: ${JSON.stringify(testCase.source)}\n${result.stdout}`,
    );
    for (const node of testCase.nodes) {
      assert.ok(
        result.stdout.includes(`(${node}`),
        `missing ${node}\n${result.stdout}`,
      );
    }
    assertNoNodes(result.stdout, "ERROR", "MISSING", "unclosed_subexpression");
  }
});

const regexIssueOwnershipCases = [
  ...[
    ["vertical line", "s/a\\|/x/\n", "bre_vertical_line_escape", "back_bar"],
    ["question mark", "s/a\\?/x/\n", "bre_question_mark_escape", "back_qm"],
    ["plus", "s/a\\+/x/\n", "bre_plus_escape", "back_plus"],
  ].map(([name, source, reason, child]) => ({
    name: `BRE ${name} escape`,
    scope: "source.sed",
    source,
    issues: [
      {
        outcome: "implementation_defined_syntax",
        reason,
        range: "[0, 3] - [0, 5]",
      },
    ],
    child,
  })),
  {
    name: "leading BRE interval",
    scope: "source.sed",
    source: "s/\\{2\\}/x/\n",
    issues: [
      {
        outcome: "undefined_syntax",
        reason: "leading_duplication_symbol",
        range: "[0, 2] - [0, 7]",
      },
    ],
    child: "bre_dupl_symbol",
  },
  {
    name: "adjacent BRE star",
    scope: "source.sed",
    source: "s/a**/x/\n",
    issues: [
      {
        outcome: "undefined_syntax",
        reason: "adjacent_duplication_symbol",
        range: "[0, 4] - [0, 5]",
      },
    ],
    child: "bre_dupl_symbol",
  },
  {
    name: "adjacent malformed BRE interval",
    scope: "source.sed",
    source: "s/a*\\{2x\\}/x/\n",
    issues: [
      {
        outcome: "undefined_syntax",
        reason: "adjacent_duplication_symbol",
        range: "[0, 4] - [0, 10]",
      },
      {
        outcome: "undefined_syntax",
        reason: "malformed_interval",
        range: "[0, 7] - [0, 8]",
      },
    ],
    child: "bre_dupl_symbol",
  },
  {
    name: "leading ERE repetition and modifier",
    scope: "source.sed.ere",
    source: "s/+?/x/\n",
    issues: [
      {
        outcome: "undefined_syntax",
        reason: "leading_duplication_symbol",
        range: "[0, 2] - [0, 4]",
      },
    ],
    child: "ere_dupl_symbol",
  },
  {
    name: "adjacent ERE repetition and modifier",
    scope: "source.sed.ere",
    source: "s/a**?/x/\n",
    issues: [
      {
        outcome: "undefined_syntax",
        reason: "adjacent_duplication_symbol",
        range: "[0, 4] - [0, 6]",
      },
    ],
    child: "ere_dupl_symbol",
  },
  {
    name: "adjacent malformed ERE interval",
    scope: "source.sed.ere",
    source: "s/a*{2x}/x/\n",
    issues: [
      {
        outcome: "undefined_syntax",
        reason: "adjacent_duplication_symbol",
        range: "[0, 4] - [0, 8]",
      },
      {
        outcome: "undefined_syntax",
        reason: "malformed_interval",
        range: "[0, 6] - [0, 7]",
      },
    ],
    child: "ere_dupl_symbol",
  },
  ...grammars.flatMap((grammar) => [
    {
      name: `character class range start in ${grammar.name}`,
      scope: grammar.scope,
      source: "s/[[:alpha:]-z]/x/\n",
      issues: [
        {
          outcome: "undefined_syntax",
          reason: "character_class_range_start",
          range: "[0, 3] - [0, 12]",
        },
      ],
      child: "character_class",
    },
    {
      name: `character class range end in ${grammar.name}`,
      scope: grammar.scope,
      source: "s/[a-[:alpha:]]/x/\n",
      issues: [
        {
          outcome: "undefined_syntax",
          reason: "character_class_range_end",
          range: "[0, 5] - [0, 14]",
        },
      ],
      child: "character_class",
    },
    {
      name: `equivalence class range start in ${grammar.name}`,
      scope: grammar.scope,
      source: "s/[[=a=]-z]/x/\n",
      issues: [
        {
          outcome: "unspecified_syntax",
          reason: "equivalence_class_range_start",
          range: "[0, 3] - [0, 8]",
        },
      ],
      child: "equivalence_class",
    },
    {
      name: `equivalence class range end in ${grammar.name}`,
      scope: grammar.scope,
      source: "s/[a-[=b=]]/x/\n",
      issues: [
        {
          outcome: "unspecified_syntax",
          reason: "equivalence_class_range_end",
          range: "[0, 5] - [0, 10]",
        },
      ],
      child: "equivalence_class",
    },
    {
      name: `ambiguous bracket expression in ${grammar.name}`,
      scope: grammar.scope,
      source: "s/[.a.]/x/\n",
      issues: [
        {
          outcome: "unspecified_syntax",
          reason: "ambiguous_bracket_expression",
          range: "[0, 2] - [0, 7]",
        },
      ],
      child: "bracket_expression",
    },
    {
      name: `ambiguous bracket expression with a nonportable endpoint in ${grammar.name}`,
      scope: grammar.scope,
      source: "s/[.[=a=]-z.]/x/\n",
      issues: [
        {
          outcome: "unspecified_syntax",
          reason: "ambiguous_bracket_expression",
          range: "[0, 2] - [0, 13]",
        },
        {
          outcome: "unspecified_syntax",
          reason: "equivalence_class_range_start",
          range: "[0, 4] - [0, 9]",
        },
      ],
      child: "bracket_expression",
    },
  ]),
];

for (const testCase of regexIssueOwnershipCases) {
  test(`ownership and incremental ranges: ${testCase.name}`, () => {
    const fresh = parseSuccessfully(testCase.scope, testCase.source, [], {
      ranges: true,
    });
    assert.deepEqual(
      issueSignatures(fresh.stdout),
      testCase.issues,
      fresh.stdout,
    );
    assertNoNodes(fresh.stdout, "ERROR", "MISSING");
    const lines = fresh.stdout.split("\n");
    const { reason, range } = testCase.issues[0];
    const reasonIndex = lines.findIndex(
      (line) => nodeHeader(line)?.type === reason,
    );
    assert.ok(reasonIndex >= 0, fresh.stdout);
    assert.deepEqual(
      nodeHeader(lines[reasonIndex + 1]),
      { type: testCase.child, range },
      fresh.stdout,
    );
    assert.equal(
      lines.filter((line) => {
        const header = nodeHeader(line);
        return header?.type === testCase.child && header.range === range;
      }).length,
      1,
      fresh.stdout,
    );
    if (testCase.issues.length > 1) {
      let balance = parenthesisBalance(lines[reasonIndex]);
      const nested = [];
      for (let index = reasonIndex + 1; balance > 0; index++) {
        assert.ok(index < lines.length, fresh.stdout);
        nested.push(lines[index]);
        balance += parenthesisBalance(lines[index]);
      }
      assert.deepEqual(
        issueSignatures(nested.join("\n")),
        testCase.issues.slice(1),
        fresh.stdout,
      );
    }

    const retainedTypes = [
      testCase.child,
      ...testCase.issues.map(({ reason }) => reason),
      "dup_count",
      "interval_separator",
      "class_name",
      "coll_elem_single",
      "coll_elem_multi",
      "meta_char",
      "repetition_modifier",
    ];
    const retained = syntaxSignatures(fresh.stdout, retainedTypes);

    const replacementEdit = `${testCase.source.length - 3} 1 y`;
    const changedReplacement = applyEdits(testCase.source, [replacementEdit]);
    const incremental = parseSuccessfully(
      testCase.scope,
      changedReplacement,
      [`${testCase.source.length - 3} 1 x`],
      { ranges: true },
    );
    assertIncrementalContract(fresh, incremental, testCase.name);
    assert.deepEqual(
      syntaxSignatures(incremental.stdout, retainedTypes),
      retained,
    );

    const patternEnd = testCase.source.lastIndexOf("/x/");
    const inserted = parseSuccessfully(
      testCase.scope,
      "s//x/\n",
      [`2 0 ${testCase.source.slice(2, patternEnd)}`],
      { ranges: true },
    );
    assertIncrementalContract(fresh, inserted, testCase.name);
    assert.deepEqual(
      syntaxSignatures(inserted.stdout, retainedTypes),
      retained,
    );
  });
}

test("marker ranges: source-end omission stays zero-width after the separator", () => {
  const result = parseSuccessfully("source.sed", "1,", [], { ranges: true });
  assert.ok(
    result.stdout.includes("(omitted_address [0, 2] - [0, 2])"),
    result.stdout,
  );
});

test("ownership: excess address unit owns its separator and address", () => {
  const result = parseSuccessfully("source.sed", "1,2q\n");
  assert.ok(
    result.stdout.includes(
      [
        "        issue: (syntax_issue",
        "          (nonconforming_syntax",
        "            (excess_address",
        "              separator: (address_separator",
        "                token: (address_separator_token))",
        "              address: (address",
        "                (line_number_address)))))",
      ].join("\n"),
    ),
    `excess unit must own separator and address inside the clause\n${result.stdout}`,
  );
  assert.ok(
    !/^ {6}issue:/m.test(result.stdout),
    `editing_command must not carry a trailing address issue\n${result.stdout}`,
  );
});

for (const grammar of grammars) {
  test(`ownership: blank-separated max-zero addresses in ${grammar.name}`, () => {
    for (const source of ["1 2:x\n", "1 2:x"]) {
      const result = parseSuccessfully(grammar.scope, source, [], {
        ranges: true,
      });
      assert.deepEqual(issueSignatures(result.stdout), [
        {
          outcome: "nonconforming_syntax",
          reason: "excess_address",
          range: "[0, 0] - [0, 1]",
        },
        {
          outcome: "nonconforming_syntax",
          reason: "excess_address",
          range: "[0, 1] - [0, 3]",
        },
        {
          outcome: "nonconforming_syntax",
          reason: "missing_address_separator",
          range: "[0, 1] - [0, 1]",
        },
      ]);
      assert.ok(result.stdout.includes("(label_function "), result.stdout);
      assertNoNodes(
        result.stdout,
        "ERROR",
        "MISSING",
        "unknown_function",
        "unexpected_command_text",
      );
    }
  });

  test(`ownership: adjacent context address remains excess in ${grammar.name}`, () => {
    const result = parseSuccessfully(grammar.scope, "1/ab/q\n", [], {
      ranges: true,
    });
    assert.deepEqual(issueSignatures(result.stdout), [
      {
        outcome: "nonconforming_syntax",
        reason: "excess_address",
        range: "[0, 1] - [0, 5]",
      },
      {
        outcome: "nonconforming_syntax",
        reason: "missing_address_separator",
        range: "[0, 1] - [0, 1]",
      },
    ]);
    assert.ok(result.stdout.includes("(quit_function "), result.stdout);
    assertNoNodes(
      result.stdout,
      "ERROR",
      "MISSING",
      "unknown_function",
      "unexpected_command_text",
    );
  });
}

const verbOperands = {
  "{": "p;}",
  a: "\\\nx",
  b: "",
  c: "\\\nx",
  d: "",
  D: "",
  g: "",
  G: "",
  h: "",
  H: "",
  i: "\\\nx",
  l: "",
  n: "",
  N: "",
  p: "",
  P: "",
  q: "",
  r: " file",
  s: "/a/b/",
  t: "",
  w: " file",
  x: "",
  y: "/a/b/",
  ":": "x",
  "=": "",
  "#": "c",
};
const addressPrefixes = ["1 ", "1\t", "1!", "1 !", "$ ", "/x/ ", "\\,x, "];

for (const grammar of grammars) {
  test(`known verbs stay functions after address blanks and negation in ${grammar.name}`, () => {
    for (const [verb, operand] of Object.entries(verbOperands)) {
      for (const prefix of addressPrefixes) {
        const source = `${prefix}${verb}${operand}\n`;
        const result = parseSuccessfully(grammar.scope, source);
        assert.deepEqual(
          issuePaths(result.stdout),
          verb === ":" || verb === "#"
            ? ["nonconforming_syntax/excess_address"]
            : [],
          `${JSON.stringify(source)}\n${result.stdout}`,
        );
        assertNoNodes(result.stdout, "ERROR", "MISSING", "unknown_function");
      }
    }
  });
}

test("ownership: separator blanks live inside blank issues on both sides", () => {
  const result = parseSuccessfully("source.sed", "1 \t, \t2p\n", [], {
    ranges: true,
  });
  assert.ok(
    result.stdout.includes(
      [
        "        separator: (address_separator [0, 1] - [0, 6]",
        "          issue: (syntax_issue [0, 1] - [0, 3]",
        "            (nonconforming_syntax [0, 1] - [0, 3]",
        "              (blanks_around_address_separator [0, 1] - [0, 3]",
        "                (blank [0, 1] - [0, 3]))))",
        "          token: (address_separator_token [0, 3] - [0, 4])",
        "          issue: (syntax_issue [0, 4] - [0, 6]",
        "            (nonconforming_syntax [0, 4] - [0, 6]",
        "              (blanks_around_address_separator [0, 4] - [0, 6]",
        "                (blank [0, 4] - [0, 6])))))",
      ].join("\n"),
    ),
    `each blank run must be owned by its own separator issue\n${result.stdout}`,
  );
});

test("ownership: blank after negation lives inside its issue reason", () => {
  const result = parseSuccessfully("source.sed", "! \tp\n", [], {
    ranges: true,
  });
  assert.ok(
    result.stdout.includes(
      [
        "        issue: (syntax_issue [0, 1] - [0, 3]",
        "          (unspecified_syntax [0, 1] - [0, 3]",
        "            (blanks_after_negation [0, 1] - [0, 3]",
        "              (blank [0, 1] - [0, 3])))))",
      ].join("\n"),
    ),
    `the negation blank run must be owned by its issue reason\n${result.stdout}`,
  );
});

test("schema: blank issue reasons require one blank source child", () => {
  for (const [grammar, nodeTypes] of nodeTypesByName) {
    for (const reason of [
      "blanks_after_negation",
      "blanks_around_address_separator",
    ]) {
      const nodeType = nodeTypes.find((candidate) => candidate.type === reason);
      assert.deepEqual(
        nodeType?.children,
        {
          multiple: false,
          required: true,
          types: [{ type: "blank", named: true }],
        },
        `${reason} must own one blank child in ${grammar}`,
      );
    }
  }
});

test("schema: bracket term delimiters are the only anonymous symbols", () => {
  const obsoleteDelimiterTypes = [
    "open_colon",
    "colon_close",
    "open_dot",
    "dot_close",
    "open_equal",
    "equal_close",
  ];
  const anonymousDelimiters = ["[", ":", ".", "=", "]"];
  const payloadFields = [
    ["character_class", "name", ["class_name"]],
    [
      "collating_symbol",
      "element",
      ["coll_elem_multi", "coll_elem_single", "meta_char"],
    ],
    ["equivalence_class", "element", ["coll_elem_multi", "coll_elem_single"]],
  ];

  for (const grammar of grammars) {
    const nodeTypes = nodeTypesByName.get(grammar.name);
    assert.ok(
      nodeTypes !== undefined,
      `missing node-types for ${grammar.name}`,
    );
    const nodeType = (type) =>
      nodeTypes.find((candidate) => candidate.type === type);

    assert.deepEqual(
      nodeTypes
        .filter((candidate) => !candidate.named)
        .map((candidate) => candidate.type)
        .sort(),
      [...anonymousDelimiters].sort(),
      `only bracket term delimiters may be anonymous in ${grammar.name}`,
    );
    for (const obsolete of obsoleteDelimiterTypes) {
      assert.equal(
        nodeType(obsolete),
        undefined,
        `${obsolete} must not be public in ${grammar.name}`,
      );
    }
    for (const [type, field, types] of payloadFields) {
      const term = nodeType(type);
      assert.deepEqual(
        Object.keys(term?.fields ?? {}).sort(),
        [field, "issue"].sort(),
        `${type} fields in ${grammar.name}`,
      );
      assert.deepEqual(
        term?.fields[field],
        {
          multiple: true,
          required: false,
          types: types.map((payloadType) => ({
            type: payloadType,
            named: true,
          })),
        },
        `${type}.${field} in ${grammar.name}`,
      );
    }
  }
});

test("bracket terms directly own one-byte delimiter leaves", () => {
  const source = "/[[:alpha:][.].][=a=]]/p\n";
  const expectedBlocks = {
    character_class: [
      "0:2 - 0:11 character_class",
      '0:2 - 0:3 "["',
      '0:3 - 0:4 ":"',
      "0:4 - 0:9 name: class_name `alpha`",
      '0:9 - 0:10 ":"',
      '0:10 - 0:11 "]"',
    ],
    collating_symbol: [
      "0:11 - 0:16 collating_symbol",
      '0:11 - 0:12 "["',
      '0:12 - 0:13 "."',
      "0:13 - 0:14 element: meta_char `]`",
      '0:14 - 0:15 "."',
      '0:15 - 0:16 "]"',
    ],
    equivalence_class: [
      "0:16 - 0:21 equivalence_class",
      '0:16 - 0:17 "["',
      '0:17 - 0:18 "="',
      "0:18 - 0:19 element: coll_elem_single `a`",
      '0:19 - 0:20 "="',
      '0:20 - 0:21 "]"',
    ],
  };

  for (const grammar of grammars) {
    const result = parseSuccessfully(grammar.scope, source, [], {
      cst: true,
      ranges: true,
    });
    const lines = cstLines(result.stdout);
    for (const [type, expected] of Object.entries(expectedBlocks)) {
      const start = lines.indexOf(expected[0]);
      assert.notEqual(start, -1, `${type} is missing in ${grammar.name}`);
      assert.deepEqual(
        lines.slice(start, start + expected.length),
        expected,
        `${type} delimiter leaves in ${grammar.name}`,
      );
    }
  }
});

test("incomplete bracket terms do not synthesize closing leaves", () => {
  const cases = [
    {
      source: "/[[:alpha",
      type: "character_class",
      marker: ":",
      eof: 9,
    },
    {
      source: "/[[.a",
      type: "collating_symbol",
      marker: ".",
      eof: 5,
    },
    {
      source: "/[[=a",
      type: "equivalence_class",
      marker: "=",
      eof: 5,
    },
  ];

  for (const grammar of grammars) {
    for (const testCase of cases) {
      const standard = parseSuccessfully(grammar.scope, testCase.source, [], {
        ranges: true,
      });
      assert.deepEqual(
        issueSignatures(standard.stdout).filter(
          ({ reason }) => reason === "incomplete_bracket_term",
        ),
        [
          {
            outcome: "incomplete_syntax",
            reason: "incomplete_bracket_term",
            range: `[0, ${testCase.eof}] - [0, ${testCase.eof}]`,
          },
        ],
        `${testCase.type} issue in ${grammar.name}`,
      );

      const result = parseSuccessfully(grammar.scope, testCase.source, [], {
        cst: true,
        ranges: true,
      });
      assert.ok(
        cstLines(result.stdout).some((line) =>
          line.endsWith(` ${testCase.type}`),
        ),
        `${testCase.type} is missing in ${grammar.name}`,
      );
      assert.deepEqual(
        directDelimiterLeafLines(result.stdout, testCase.type),
        ['0:2 - 0:3 "["', `0:3 - 0:4 "${testCase.marker}"`],
        `${testCase.type} delimiter leaves in ${grammar.name}`,
      );
      assert.doesNotMatch(
        result.stdout,
        /(^|[^A-Za-z0-9_])MISSING([^A-Za-z0-9_]|$)/,
        `${testCase.type} must not synthesize a closing delimiter in ${grammar.name}`,
      );
    }
  }
});

test("malformed empty bracket terms preserve every source delimiter", () => {
  const source = "/[[::]][[..]][[==]]/p\n";
  const expectedIssues = [4, 10, 16].map((column) => ({
    outcome: "undefined_syntax",
    reason: "malformed_bracket_term",
    range: `[0, ${column}] - [0, ${column}]`,
  }));
  const expectedLeaves = {
    character_class: [
      '0:2 - 0:3 "["',
      '0:3 - 0:4 ":"',
      '0:4 - 0:5 ":"',
      '0:5 - 0:6 "]"',
    ],
    collating_symbol: [
      '0:8 - 0:9 "["',
      '0:9 - 0:10 "."',
      '0:10 - 0:11 "."',
      '0:11 - 0:12 "]"',
    ],
    equivalence_class: [
      '0:14 - 0:15 "["',
      '0:15 - 0:16 "="',
      '0:16 - 0:17 "="',
      '0:17 - 0:18 "]"',
    ],
  };

  for (const grammar of grammars) {
    const standard = parseSuccessfully(grammar.scope, source, [], {
      ranges: true,
    });
    assert.deepEqual(
      issueSignatures(standard.stdout).filter(
        ({ reason }) => reason === "malformed_bracket_term",
      ),
      expectedIssues,
      `empty bracket term issues in ${grammar.name}`,
    );

    const result = parseSuccessfully(grammar.scope, source, [], {
      cst: true,
      ranges: true,
    });
    for (const [type, leaves] of Object.entries(expectedLeaves)) {
      assert.deepEqual(
        directDelimiterLeafLines(result.stdout, type),
        leaves,
        `${type} delimiter leaves in ${grammar.name}`,
      );
    }
  }
});

test("ownership: blanks before the function stay outside the separator", () => {
  const cases = [
    {
      source: "1, p\n",
      issues: [
        {
          outcome: "undefined_syntax",
          reason: "omitted_address",
          range: "[0, 2] - [0, 2]",
        },
      ],
      separator: "separator: (address_separator [0, 1] - [0, 2]",
    },
    {
      source: ", p\n",
      issues: [
        {
          outcome: "undefined_syntax",
          reason: "omitted_address",
          range: "[0, 0] - [0, 0]",
        },
        {
          outcome: "undefined_syntax",
          reason: "omitted_address",
          range: "[0, 1] - [0, 1]",
        },
      ],
      separator: "separator: (address_separator [0, 0] - [0, 1]",
    },
  ];
  for (const testCase of cases) {
    const result = parseSuccessfully("source.sed", testCase.source, [], {
      ranges: true,
    });
    assert.deepEqual(issueSignatures(result.stdout), testCase.issues);
    assert.ok(
      result.stdout.includes(testCase.separator),
      `the separator must end at its token\n${result.stdout}`,
    );
  }
});

test("ownership: empty commands own their blanks and end before their separator", () => {
  const result = parseSuccessfully("source.sed", "  ;;  ;p\np; \n \n", [], {
    ranges: true,
  });
  assert.deepEqual(
    result.stdout
      .split("\n")
      .filter((line) => line.includes("(empty_command"))
      .map((line) => line.trim()),
    [
      "(empty_command [0, 0] - [0, 2])",
      "(empty_command [0, 3] - [0, 3])",
      "(empty_command [0, 4] - [0, 6])",
      "(empty_command [1, 2] - [1, 3])",
      "(empty_command [2, 0] - [2, 1])",
    ],
    result.stdout,
  );
  assert.ok(
    result.stdout.includes("(editing_command [1, 0] - [1, 1]"),
    `the command before the separator must not own the blank\n${result.stdout}`,
  );
});

test("ownership: unterminated blanks and separators before a closing brace form no empty command", () => {
  for (const source of ["p;", " ", "p; ", "{p;}", "{p; }\n", "{}"]) {
    const result = parseSuccessfully("source.sed", source);
    assertNoNodes(result.stdout, "empty_command", "ERROR", "MISSING");
  }
});

test("ownership: leading blanks stay inside a command that omits its first address", () => {
  const cases = [
    { source: " ,p\n", command: "(editing_command [0, 0] - [0, 3]" },
    { source: "\t,2p\n", command: "(editing_command [0, 0] - [0, 4]" },
    { source: "{\n ,p\n}\n", command: "(editing_command [1, 0] - [1, 3]" },
  ];
  for (const testCase of cases) {
    const result = parseSuccessfully("source.sed", testCase.source, [], {
      ranges: true,
    });
    assert.ok(
      result.stdout.startsWith("(script [0, 0] - "),
      `the script must own the leading blank\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes(testCase.command),
      `the editing command must own its leading blank\n${result.stdout}`,
    );
  }
});

test("ownership: equivalence class meta characters are malformed terms", () => {
  for (const grammar of grammars) {
    const result = parseSuccessfully(grammar.scope, "/[[=-=]][[=]=]]/p\n", [], {
      ranges: true,
    });
    assert.deepEqual(issueSignatures(result.stdout), [
      {
        outcome: "undefined_syntax",
        reason: "malformed_bracket_term",
        range: "[0, 4] - [0, 5]",
      },
      {
        outcome: "undefined_syntax",
        reason: "malformed_bracket_term",
        range: "[0, 11] - [0, 12]",
      },
    ]);
    assertNoNodes(
      result.stdout,
      "ERROR",
      "MISSING",
      "coll_elem_single",
      "coll_elem_multi",
      "meta_char",
    );
  }
});

test("ownership: duplicated negation operator lives inside its issue", () => {
  const result = parseSuccessfully("source.sed", "!!p\n", [], { ranges: true });
  assert.ok(
    result.stdout.includes(
      [
        "      negation: (negation [0, 0] - [0, 2]",
        "        operator: (negation_operator [0, 0] - [0, 1])",
        "        issue: (syntax_issue [0, 1] - [0, 2]",
        "          (nonconforming_syntax [0, 1] - [0, 2]",
        "            (duplicate_negation [0, 1] - [0, 2]",
        "              operator: (negation_operator [0, 1] - [0, 2])))))",
      ].join("\n"),
    ),
    `the duplicate operator must appear only inside the issue\n${result.stdout}`,
  );
});

test("ownership: unmatched BRE closers own one source child", () => {
  const cases = [
    {
      source: "/\\}/p\n",
      reason: "unmatched_interval_close",
      child: "back_close_brace",
    },
    {
      source: "/\\)/p\n",
      reason: "unmatched_subexpression_close",
      child: "back_close_parenthesis_token",
    },
  ];
  for (const testCase of cases) {
    const result = parseSuccessfully("source.sed", testCase.source, [], {
      ranges: true,
    });
    assert.deepEqual(issueSignatures(result.stdout), [
      {
        outcome: "undefined_syntax",
        reason: testCase.reason,
        range: "[0, 1] - [0, 3]",
      },
    ]);
    const tree = result.stdout
      .split("\n")
      .map((line) => line.trimStart())
      .join("\n");
    assert.ok(
      tree.includes(
        [
          "issue: (syntax_issue [0, 1] - [0, 3]",
          "(undefined_syntax [0, 1] - [0, 3]",
          `(${testCase.reason} [0, 1] - [0, 3]`,
          `(${testCase.child} [0, 1] - [0, 3]))))`,
        ].join("\n"),
      ),
      `the issue must own the unmatched closer\n${result.stdout}`,
    );
    assert.equal(
      result.stdout.split(`(${testCase.child} `).length - 1,
      1,
      `the source child must appear exactly once\n${result.stdout}`,
    );
    assertNoNodes(result.stdout, "ERROR", "MISSING");
  }
});

test("schema: unmatched BRE closer reasons require their source child", () => {
  const cases = [
    ["unmatched_interval_close", "back_close_brace"],
    ["unmatched_subexpression_close", "back_close_parenthesis_token"],
  ];
  for (const [reason, child] of cases) {
    const nodeType = nodeTypesByName
      .get("sed")
      .find((candidate) => candidate.type === reason);
    assert.deepEqual(
      nodeType?.children,
      {
        multiple: false,
        required: true,
        types: [{ type: child, named: true }],
      },
      `${reason} must own one ${child} child`,
    );
    assert.equal(
      nodeTypesByName
        .get("sed_ere")
        .some((candidate) => candidate.type === reason),
      false,
      `${reason} must remain BRE-only`,
    );
  }
});

const commandRecoveryCases = [
  {
    name: "raw newline after an unclosed bracket expression",
    before: "  1,2!p\n",
    broken: "/[a\n",
    after: "\t/[[.a.]][[=b=]][[:alpha:]]/d\n",
    initial: "/[a]/p\n",
    edit: "3 3 ",
    boundary: 3,
    issues: [
      "undefined_syntax/unclosed_bracket_expression",
      "nonconforming_syntax/unterminated_regular_expression",
      "nonconforming_syntax/missing_function",
    ],
  },
  {
    name: "semicolon after an unknown function",
    before: "  1,2!p;",
    broken: "Z;",
    after: "\t/[[.a.]][[=b=]][[:alpha:]]/d\n",
    initial: "p;",
    edit: "0 1 Z",
    boundary: 1,
    issues: ["nonconforming_syntax/unknown_function"],
  },
  {
    name: "closed block containing an unknown function",
    before: "  1{\np\n};",
    broken: "{Z\n};",
    after: "\t2s/a/b/\n",
    initial: "{p\n};",
    edit: "1 1 Z",
    boundary: 3,
    issues: ["nonconforming_syntax/unknown_function"],
  },
];

for (const grammar of grammars) {
  for (const testCase of commandRecoveryCases) {
    test(`recovery preserves surrounding commands across ${testCase.name} in ${grammar.name}`, () => {
      const { before, broken, after } = testCase;
      const source = before + broken + after;
      assert.deepEqual(
        issuePaths(parseSuccessfully(grammar.scope, source).stdout),
        testCase.issues,
      );
      const options = { cst: true, ranges: true };
      const followingLines = (before + broken).split("\n");
      const expected = [
        { source: before, start: [0, 0] },
        {
          source: after,
          start: [
            followingLines.length - 1,
            Buffer.byteLength(followingLines.at(-1)),
          ],
        },
      ].map(({ source: commandSource, start }) => {
        const result = parseSuccessfully(
          grammar.scope,
          commandSource,
          [],
          options,
        );
        return {
          start,
          nodes: topLevelEditingCommands(result.stdout)[0].nodes,
        };
      });
      const offset = Buffer.byteLength(before);
      const editPosition = Number(testCase.edit.split(" ")[0]);
      const boundaryPosition = offset + testCase.boundary;
      const histories = [
        { name: "fresh", source, edits: [] },
        {
          name: "damage a normal command",
          source: before + testCase.initial + after,
          edits: [
            `${offset + editPosition}${testCase.edit.slice(testCase.edit.indexOf(" "))}`,
          ],
        },
        {
          name: "remove and restore the recovery boundary",
          source,
          edits: [
            `${boundaryPosition} 1 `,
            `${boundaryPosition} 0 ${broken[testCase.boundary]}`,
          ],
        },
      ];
      for (const history of histories) {
        assert.deepEqual(
          applyEdits(history.source, history.edits),
          Buffer.from(source),
          history.name,
        );
        const result = parseSuccessfully(
          grammar.scope,
          history.source,
          history.edits,
          options,
        );
        const commands = topLevelEditingCommands(result.stdout);
        for (const command of expected) {
          assert.deepEqual(
            commands.find(
              ({ start }) =>
                start[0] === command.start[0] && start[1] === command.start[1],
            ),
            command,
            `${history.name}: intact command at ${command.start}\n${result.stdout}`,
          );
        }
      }
    });
  }
}

const bracketDelimiterConvergenceCases = grammars.flatMap((grammar) => [
  {
    name: `bracket term opening marker in ${grammar.name}`,
    scope: grammar.scope,
    source: "/[[:alpha:]]/p\n",
    issues: [],
    compareCst: true,
    histories: [
      { source: "/[[xalpha:]]/p\n", edits: ["3 1 :"] },
      {
        source: "/[[=alpha=]]/p\n",
        edits: ["3 1 :", "9 1 :"],
      },
    ],
  },
  {
    name: `bracket term closing bracket restoration in ${grammar.name}`,
    scope: grammar.scope,
    source: "/[[:alpha:]x]/p\n",
    issues: [],
    compareCst: true,
    histories: [{ source: "/[[:alpha:x]/p\n", edits: ["10 0 ]"] }],
  },
  {
    name: `bracket term closing bracket deletion in ${grammar.name}`,
    scope: grammar.scope,
    source: "/[[:alpha:x]/p\n",
    issues: [
      {
        outcome: "undefined_syntax",
        reason: "malformed_bracket_term",
        range: "[0, 4] - [0, 11]",
      },
      {
        outcome: "undefined_syntax",
        reason: "malformed_bracket_term",
        range: "[0, 11] - [0, 11]",
      },
    ],
    compareCst: true,
    delimiterOwner: "character_class",
    histories: [{ source: "/[[:alpha:]x]/p\n", edits: ["10 1 "] }],
  },
]);

const explicitConvergenceCases = [
  ...bracketDelimiterConvergenceCases,
  {
    name: "recovery-free substitution",
    scope: "source.sed",
    source: "s/a/b/g\n",
    histories: [
      { source: "s/a/c/g\n", edits: ["4 1 b"] },
      { source: "s/a/b/\n", edits: ["6 0 g"] },
    ],
  },
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
    name: "unmatched BRE subexpression close",
    scope: "source.sed",
    source: "/\\)/p\n",
    issues: [
      {
        outcome: "undefined_syntax",
        reason: "unmatched_subexpression_close",
        range: "[0, 1] - [0, 3]",
      },
    ],
    histories: [
      { source: "//p\n", edits: ["1 0 \\)"] },
      { source: "/\\(\\)/p\n", edits: ["1 2 "] },
    ],
  },
  {
    name: "unmatched BRE interval close",
    scope: "source.sed",
    source: "/\\}/p\n",
    issues: [
      {
        outcome: "undefined_syntax",
        reason: "unmatched_interval_close",
        range: "[0, 1] - [0, 3]",
      },
    ],
    histories: [
      { source: "//p\n", edits: ["1 0 \\}"] },
      { source: "/a\\{1\\}/p\n", edits: ["1 4 "] },
    ],
  },
  {
    name: "missing separator after an unmatched closing brace",
    scope: "source.sed",
    source: "}p\n",
    issues: [
      {
        outcome: "nonconforming_syntax",
        reason: "unmatched_closing_brace",
        range: "[0, 0] - [0, 1]",
      },
      {
        outcome: "nonconforming_syntax",
        reason: "missing_command_separator",
        range: "[0, 1] - [0, 1]",
      },
    ],
    syntax: [
      "unmatched_closing_brace [0, 0] - [0, 1]",
      "  closing_brace [0, 0] - [0, 1]",
      "    closing_brace_token [0, 0] - [0, 1]",
      "function: function [0, 1] - [0, 2]",
      "  print_function [0, 1] - [0, 2]",
      "    verb: function_verb [0, 1] - [0, 2]",
    ],
    histories: [
      { source: "}\n", edits: ["1 0 p"] },
      { source: "};p\n", edits: ["1 1 "] },
    ],
  },
  {
    name: "BRE subexpression anchor application requirements",
    scope: "source.sed",
    source: "/\\(^a$\\)/p\n",
    issues: [
      {
        outcome: "nonconforming_syntax",
        reason: "bre_subexpression_left_anchor",
        range: "[0, 3] - [0, 4]",
      },
      {
        outcome: "nonconforming_syntax",
        reason: "bre_subexpression_right_anchor",
        range: "[0, 5] - [0, 6]",
      },
    ],
    histories: [
      { source: "/\\(a\\)/p\n", edits: ["3 0 ^", "5 0 $"] },
      { source: "/^a$/p\n", edits: ["1 0 \\(", "6 0 \\)"] },
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
  ...grammars.map((grammar) => ({
    name: `flags after write remain deterministic in ${grammar.name}`,
    scope: grammar.scope,
    source: "s/a/b/wp file\n",
    issues: [],
    histories: [
      { source: "s/a/b/wg file\n", edits: ["7 1 p"] },
      { source: "s/a/b/w file\n", edits: ["7 0 p"] },
    ],
  })),
  ...grammars.map((grammar) => ({
    name: `command after write remains deterministic in ${grammar.name}`,
    scope: grammar.scope,
    source: "s/a/b/w file;p\n",
    issues: [],
    histories: [
      { source: "s/a/b/w file\np\n", edits: ["12 1 ;"] },
      { source: "s/a/b/w file;d\n", edits: ["13 1 p"] },
    ],
  })),
  ...grammars.flatMap((grammar) => {
    function omitted(range) {
      return { outcome: "undefined_syntax", reason: "omitted_address", range };
    }
    function excess(range) {
      return {
        outcome: "nonconforming_syntax",
        reason: "excess_address",
        range,
      };
    }
    function missingAddressSeparator(range) {
      return {
        outcome: "nonconforming_syntax",
        reason: "missing_address_separator",
        range,
      };
    }
    function blanksAroundSeparator(range) {
      return {
        outcome: "nonconforming_syntax",
        reason: "blanks_around_address_separator",
        range,
      };
    }
    function blanksAfterNegation(range) {
      return {
        outcome: "unspecified_syntax",
        reason: "blanks_after_negation",
        range,
      };
    }
    return [
      {
        name: `omitted first address before the separator in ${grammar.name}`,
        source: ",2p\n",
        issues: [omitted("[0, 0] - [0, 0]")],
        histories: [
          { source: "1,2p\n", edits: ["0 1 "] },
          { source: "2p\n", edits: ["0 0 ,"] },
        ],
      },
      {
        name: `omitted first and second addresses in ${grammar.name}`,
        source: ",p\n",
        issues: [omitted("[0, 0] - [0, 0]"), omitted("[0, 1] - [0, 1]")],
        histories: [
          { source: "1,p\n", edits: ["0 1 "] },
          { source: ",2p\n", edits: ["1 1 "] },
        ],
      },
      {
        name: `omitted second address after the separator in ${grammar.name}`,
        source: "1,p\n",
        issues: [omitted("[0, 2] - [0, 2]")],
        histories: [
          { source: "1,2p\n", edits: ["2 1 "] },
          { source: "1p\n", edits: ["1 0 ,"] },
        ],
      },
      {
        name: `excess address unit on a one-address function in ${grammar.name}`,
        source: "1,2q\n",
        issues: [excess("[0, 1] - [0, 3]")],
        syntax: [
          "addresses: address_clause [0, 0] - [0, 3]",
          "  first: address [0, 0] - [0, 1]",
          "    line_number_address [0, 0] - [0, 1]",
          "  excess_address [0, 1] - [0, 3]",
          "    separator: address_separator [0, 1] - [0, 2]",
          "      token: address_separator_token [0, 1] - [0, 2]",
          "    address: address [0, 2] - [0, 3]",
          "      line_number_address [0, 2] - [0, 3]",
          "function: function [0, 3] - [0, 4]",
          "  quit_function [0, 3] - [0, 4]",
          "    verb: function_verb [0, 3] - [0, 4]",
        ],
        histories: [
          { source: "1,2p\n", edits: ["3 1 q"] },
          { source: "1q\n", edits: ["1 0 ,2"] },
        ],
      },
      {
        name: `leading excess address on a zero-address function in ${grammar.name}`,
        source: "1:x\n",
        issues: [excess("[0, 0] - [0, 1]")],
        histories: [
          { source: ":x\n", edits: ["0 0 1"] },
          { source: "1,2:x\n", edits: ["1 2 "] },
        ],
      },
      {
        name: `blank-separated excess addresses on a zero-address function in ${grammar.name}`,
        source: "1 2:x\n",
        issues: [
          excess("[0, 0] - [0, 1]"),
          excess("[0, 1] - [0, 3]"),
          missingAddressSeparator("[0, 1] - [0, 1]"),
        ],
        histories: [
          { source: "1,2:x\n", edits: ["1 1  "] },
          { source: "1 2q\n", edits: ["3 1 :x"] },
          { source: "1 2p\n", edits: ["3 1 :x"] },
          { source: ":x\n", edits: ["0 0 1 2"] },
        ],
      },
      {
        name: `third address unit on a two-address function in ${grammar.name}`,
        source: "1,2,3p\n",
        issues: [excess("[0, 3] - [0, 5]")],
        histories: [
          { source: "1,2p\n", edits: ["3 0 ,3"] },
          { source: "1,2,3q\n", edits: ["5 1 p"] },
        ],
      },
      {
        name: `omission nested inside an excess address unit in ${grammar.name}`,
        source: "1,q\n",
        issues: [excess("[0, 1] - [0, 2]"), omitted("[0, 2] - [0, 2]")],
        syntax: [
          "addresses: address_clause [0, 0] - [0, 2]",
          "  first: address [0, 0] - [0, 1]",
          "    line_number_address [0, 0] - [0, 1]",
          "  excess_address [0, 1] - [0, 2]",
          "    separator: address_separator [0, 1] - [0, 2]",
          "      token: address_separator_token [0, 1] - [0, 2]",
          "    omitted_address [0, 2] - [0, 2]",
          "function: function [0, 2] - [0, 3]",
          "  quit_function [0, 2] - [0, 3]",
          "    verb: function_verb [0, 2] - [0, 3]",
        ],
        histories: [
          { source: "1,2q\n", edits: ["2 1 "] },
          { source: "1q\n", edits: ["1 0 ,"] },
        ],
      },
      {
        name: `blank runs around one separator in ${grammar.name}`,
        source: "1 , 2p\n",
        issues: [
          blanksAroundSeparator("[0, 1] - [0, 2]"),
          blanksAroundSeparator("[0, 3] - [0, 4]"),
        ],
        histories: [
          { source: "1,2p\n", edits: ["1 0  ", "3 0  "] },
          { source: "1 ,2p\n", edits: ["3 0  "] },
        ],
      },
      {
        name: `pre-function blanks after separator blanks in ${grammar.name}`,
        source: "1 , p\n",
        issues: [
          blanksAroundSeparator("[0, 1] - [0, 2]"),
          omitted("[0, 3] - [0, 3]"),
        ],
        histories: [
          { source: "1 , 2p\n", edits: ["4 1 "] },
          { source: "1,p\n", edits: ["1 0  ", "3 0  "] },
        ],
      },
      {
        name: `blank run after negation in ${grammar.name}`,
        source: "! \tp\n",
        issues: [blanksAfterNegation("[0, 1] - [0, 3]")],
        histories: [
          { source: "! p\n", edits: ["2 0 \t"] },
          { source: "!\tp\n", edits: ["1 0  "] },
        ],
      },
      {
        name: `duplicated negation after an address in ${grammar.name}`,
        source: "1!!p\n",
        issues: [
          {
            outcome: "nonconforming_syntax",
            reason: "duplicate_negation",
            range: "[0, 2] - [0, 3]",
          },
        ],
        syntax: [
          "addresses: address_clause [0, 0] - [0, 1]",
          "  first: address [0, 0] - [0, 1]",
          "    line_number_address [0, 0] - [0, 1]",
          "negation: negation [0, 1] - [0, 3]",
          "  operator: negation_operator [0, 1] - [0, 2]",
          "  duplicate_negation [0, 2] - [0, 3]",
          "    operator: negation_operator [0, 2] - [0, 3]",
          "function: function [0, 3] - [0, 4]",
          "  print_function [0, 3] - [0, 4]",
          "    verb: function_verb [0, 3] - [0, 4]",
        ],
        histories: [
          { source: "1!p\n", edits: ["2 0 !"] },
          { source: "!!p\n", edits: ["0 0 1"] },
        ],
      },
    ].map((testCase) => ({ ...testCase, scope: grammar.scope }));
  }),
];

for (const testCase of explicitConvergenceCases) {
  test(`incremental: ${testCase.name}`, () => {
    const fresh = parseSuccessfully(testCase.scope, testCase.source, [], {
      ranges: true,
    });
    if (testCase.issues !== undefined) {
      assert.deepEqual(issueSignatures(fresh.stdout), testCase.issues);
    }
    const retainedTypes = testCase.syntax?.map(
      (line) => /^ *([a-z_]+: )?([a-z_]+) \[/.exec(line)[2],
    );
    if (retainedTypes !== undefined) {
      assert.deepEqual(
        syntaxSignatures(fresh.stdout, retainedTypes),
        testCase.syntax,
      );
    }
    const freshCst = testCase.compareCst
      ? parse(testCase.scope, testCase.source, [], {
          cst: true,
          ranges: true,
        })
      : null;
    if (freshCst !== null) {
      assert.equal(freshCst.status, 0, freshCst.stdout + freshCst.stderr);
    }
    for (const history of testCase.histories) {
      assert.deepEqual(
        applyEdits(history.source, history.edits),
        Buffer.from(testCase.source),
      );
      const incremental = parse(testCase.scope, history.source, history.edits, {
        ranges: true,
      });
      assertIncrementalContract(
        fresh,
        incremental,
        `${testCase.scope}: ${testCase.name}`,
      );
      if (retainedTypes !== undefined) {
        assert.deepEqual(
          syntaxSignatures(incremental.stdout, retainedTypes),
          testCase.syntax,
        );
      }
      if (freshCst !== null) {
        const incrementalCst = parse(
          testCase.scope,
          history.source,
          history.edits,
          { cst: true, ranges: true },
        );
        assert.equal(
          incrementalCst.status,
          0,
          incrementalCst.stdout + incrementalCst.stderr,
        );
        if ((testCase.issues ?? []).length === 0) {
          assert.equal(
            incrementalCst.stdout,
            freshCst.stdout,
            `${testCase.scope}: ${testCase.name}: fresh and incremental CSTs differ`,
          );
        } else {
          assert.deepEqual(
            directDelimiterLeafLines(
              incrementalCst.stdout,
              testCase.delimiterOwner,
            ),
            directDelimiterLeafLines(freshCst.stdout, testCase.delimiterOwner),
            `${testCase.scope}: ${testCase.name}: fresh and incremental delimiter leaves differ`,
          );
        }
      }
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
  "1, p",
  ", 2p",
  ",2p",
  "1,p",
  "1,q",
  "1,2q",
  "1 2q",
  "1:x",
  "1 2:x",
  "1 2#x",
  "1,2,3p",
  "1,2 3p",
  "1,2 ,3p",
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
  "b }x",
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
  "! \tp",
  "1!p",
  "!!p",
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
      const fresh = parse(grammar.scope, testCase.edited, [], { ranges: true });
      const incremental = parse(grammar.scope, testCase.base, [testCase.edit], {
        ranges: true,
      });
      assertIncrementalContract(
        fresh,
        incremental,
        grammar.scope +
          ": base=" +
          JSON.stringify(testCase.base) +
          ", edit=" +
          JSON.stringify(testCase.edit) +
          ", edited=" +
          JSON.stringify(testCase.edited),
      );
    }
  }
});

for (const grammar of grammars) {
  test(`invalid interval characters preserve boundaries in ${grammar.name}`, () => {
    const opening = grammar.name === "sed" ? "\\{" : "{";
    const closing = grammar.name === "sed" ? "\\}" : "}";
    const prefix = Buffer.from(`/a${opening}1,x`);
    const start = prefix.length - 1;
    for (const testCase of [
      {
        name: "surrounding invalid text",
        count: 1,
        suffix: `y${closing}/p\n`,
        length: 3,
      },
      {
        name: "consecutive invalid bytes",
        count: 2,
        suffix: `${closing}/p\n`,
        length: 3,
      },
      {
        name: "end of source",
        count: 1,
        suffix: "",
        length: 2,
        boundary: "incomplete_syntax",
      },
      {
        name: "physical newline",
        count: 1,
        suffix: "\np\n",
        length: 2,
        boundary: "nonconforming_syntax",
      },
      {
        name: "following bracket expression",
        count: 1,
        suffix: `[bc]${closing}/p\n`,
        length: 2,
        unmatchedCloser: grammar.name === "sed",
      },
    ]) {
      for (const byte of [0, 0xff]) {
        const source = Buffer.concat([
          prefix,
          Buffer.alloc(testCase.count, byte),
          Buffer.from(testCase.suffix),
        ]);
        const range = (first, last) => `[0, ${first}] - [0, ${last}]`;
        const expected = [
          {
            outcome: "undefined_syntax",
            reason: "malformed_interval",
            range: range(start, start + testCase.length),
          },
          ...Array.from({ length: testCase.count }, (_, index) => ({
            outcome: "invalid_syntax",
            reason: "invalid_regular_expression_character",
            range: range(start + index + 1, start + index + 2),
          })),
        ];
        if (testCase.boundary !== undefined) {
          expected.push(
            {
              outcome: testCase.boundary,
              reason:
                testCase.boundary === "incomplete_syntax"
                  ? "incomplete_regular_expression"
                  : "unterminated_regular_expression",
              range: range(start + 2, start + 2),
            },
            {
              outcome: testCase.boundary,
              reason: "missing_function",
              range: range(start + 2, start + 2),
            },
          );
        }
        if (testCase.unmatchedCloser) {
          expected.push({
            outcome: "undefined_syntax",
            reason: "unmatched_interval_close",
            range: range(start + 6, start + 8),
          });
        }
        const position = prefix.length + testCase.count;
        const edits =
          testCase.suffix === ""
            ? [`${position} 0 ${closing}`, `${position} ${closing.length} `]
            : [`${position} 1 `, `${position} 0 ${testCase.suffix[0]}`];
        assert.deepEqual(applyEdits(source, edits), source);
        const fresh = parse(grammar.scope, source, [], { ranges: true });
        const incremental = parse(grammar.scope, source, edits, {
          ranges: true,
        });
        const label = `${testCase.name}, byte ${byte}`;
        assertIncrementalContract(fresh, incremental, label);
        const retained = [
          `minimum: dup_count ${range(start - 2, start - 1)}`,
          `malformed_interval ${range(start, start + testCase.length)}`,
          ...expected
            .filter(
              ({ reason }) => reason === "invalid_regular_expression_character",
            )
            .map(
              ({ range }) => `  invalid_regular_expression_character ${range}`,
            ),
        ];
        for (const result of [fresh, incremental]) {
          assert.deepEqual(issueSignatures(result.stdout), expected, label);
          assert.deepEqual(
            syntaxSignatures(result.stdout, [
              "dup_count",
              "malformed_interval",
              "invalid_regular_expression_character",
            ]),
            retained,
            label,
          );
        }
      }
    }
  });

  test(`character class names: invalid spellings own their source in ${grammar.name}`, () => {
    for (const name of ["1", "1alpha", "a-b", "a_b", " a ", "é", "a:b"]) {
      const source = `s/[[:${name}:]]/x/\n`;
      const result = parseSuccessfully(grammar.scope, source, [], {
        ranges: true,
      });
      const range = `[0, 5] - [0, ${5 + Buffer.byteLength(name)}]`;
      assert.deepEqual(
        issueSignatures(result.stdout),
        [
          {
            outcome: "undefined_syntax",
            reason: "malformed_bracket_term",
            range,
          },
        ],
        source,
      );
      const lines = result.stdout.split("\n");
      const reason = lines.findIndex(
        (line) => nodeHeader(line)?.type === "malformed_bracket_term",
      );
      assert.deepEqual(nodeHeader(lines[reason + 1]), {
        type: "class_name",
        range,
      });
      assertNoNodes(result.stdout, "ERROR", "MISSING");
      const history = `s/[[:Alpha:]]/x/\n`;
      const edits = [`5 5 ${name}`];
      assertIncrementalContract(
        result,
        parse(grammar.scope, history, edits, { ranges: true }),
        source,
      );
    }
  });

  test(`character class names: valid names retain one payload in ${grammar.name}`, () => {
    const names = [
      "alnum",
      "alpha",
      "blank",
      "cntrl",
      "digit",
      "graph",
      "lower",
      "print",
      "punct",
      "space",
      "upper",
      "xdigit",
      "A1",
      "Custom9",
    ];
    for (const name of names) {
      const source = `s/[[:${name}:]]/x/\n`;
      const result = parseSuccessfully(grammar.scope, source, [], {
        ranges: true,
      });
      assertNoNodes(result.stdout, "syntax_issue", "ERROR", "MISSING");
      assert.deepEqual(
        result.stdout
          .split("\n")
          .map(nodeHeader)
          .filter((node) => node?.type === "class_name"),
        [
          {
            type: "class_name",
            range: `[0, 5] - [0, ${5 + name.length}]`,
          },
        ],
      );
    }
  });

  test(`invalid RE characters: exact byte ranges and incremental recovery in ${grammar.name}`, () => {
    const invalidValues = [
      { name: "NUL", bytes: Buffer.from([0]) },
      { name: "invalid UTF-8 byte", bytes: Buffer.from([0xff]) },
      { name: "overlong UTF-8 sequence", bytes: Buffer.from([0xc0, 0x80]) },
    ];
    const contexts = [
      { name: "ordinary character", prefix: "s/", suffix: "//\n" },
      { name: "bracket element", prefix: "/[", suffix: "]/p\n" },
      { name: "range start", prefix: "/[", suffix: "-z]/p\n" },
      { name: "range end", prefix: "/[a-", suffix: "]/p\n" },
      { name: "collating symbol middle", prefix: "/[[.a", suffix: "b.]]/p\n" },
      { name: "collating symbol end", prefix: "/[[.a", suffix: ".]]/p\n" },
      { name: "equivalence class", prefix: "/[[=", suffix: "=]]/p\n" },
      { name: "class name middle", prefix: "/[[:a", suffix: "1:]]/p\n" },
      { name: "class name start", prefix: "/[[:", suffix: "1:]]/p\n" },
      {
        name: "escaped repetition operand",
        prefix: "/\\",
        suffix: "*/p\n",
        repair: "*",
      },
      {
        name: "escaped grouped character",
        prefix: grammar.name === "sed" ? "/\\(\\" : "/(\\",
        suffix: grammar.name === "sed" ? "\\)/p\n" : ")/p\n",
        repair: "*",
      },
    ];
    for (const invalid of invalidValues) {
      for (const context of contexts) {
        const prefix = Buffer.from(context.prefix);
        const suffix = Buffer.from(context.suffix);
        const source = Buffer.concat([prefix, invalid.bytes, suffix]);
        const label = `${invalid.name}: ${context.name}`;
        const result = parseSuccessfully(grammar.scope, source, [], {
          ranges: true,
        });
        assert.deepEqual(
          issueSignatures(result.stdout),
          [...invalid.bytes].map((_, index) => ({
            outcome: "invalid_syntax",
            reason: "invalid_regular_expression_character",
            range: `[0, ${prefix.length + index}] - [0, ${prefix.length + index + 1}]`,
          })),
          label,
        );
        assertNoNodes(result.stdout, "invalid_character_token");
        assertNoNodes(result.stdout, "ERROR", "MISSING");
        const history = Buffer.concat([
          prefix,
          Buffer.from("q"),
          invalid.bytes,
          suffix,
        ]);
        const edits = [`${prefix.length} 1 `];
        assertIncrementalContract(
          result,
          parse(grammar.scope, history, edits, { ranges: true }),
          label,
        );
        const repair = context.repair ?? "a";
        const repaired = Buffer.concat([prefix, Buffer.from(repair), suffix]);
        const fresh = parseSuccessfully(grammar.scope, repaired, [], {
          ranges: true,
        });
        assertNoNodes(fresh.stdout, "syntax_issue", "ERROR", "MISSING");
        assertIncrementalContract(
          fresh,
          parse(
            grammar.scope,
            source,
            [`${prefix.length} ${invalid.bytes.length} ${repair}`],
            { ranges: true },
          ),
          `${label}: repair`,
        );
      }
    }
  });
}
