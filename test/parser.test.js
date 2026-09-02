const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { after, before, test } = require("node:test");
const { createTreeSitter, grammars } = require("../scripts/tree-sitter");
const sedNodeTypes = require("../src/node-types.json");
const sedEreNodeTypes = require("../sed_ere/src/node-types.json");
const nodeTypesByName = new Map([
  ["sed", sedNodeTypes],
  ["sed_ere", sedEreNodeTypes],
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
  const lines = tree.split("\n");
  const commands = [];
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].startsWith("    (editing_command")) {
      continue;
    }
    const command = [lines[index]];
    let balance = parenthesisBalance(lines[index]);
    while (balance > 0) {
      index += 1;
      assert.ok(index < lines.length, `unterminated editing_command\n${tree}`);
      command.push(lines[index]);
      balance += parenthesisBalance(lines[index]);
    }
    commands.push(command.join("\n"));
  }
  return commands;
}

function assertIncrementalContract(fresh, incremental, context) {
  assert.equal(
    incremental.status,
    fresh.status,
    `${context}: fresh and incremental statuses differ`,
  );
  const freshIssues = issueSignatures(fresh.stdout);
  assert.deepEqual(
    issueSignatures(incremental.stdout),
    freshIssues,
    `${context}: fresh and incremental issue signatures differ`,
  );
  if (fresh.status === 0 && freshIssues.length === 0) {
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
      const result = parse(grammar.scope, testCase.source, [], {
        ranges: true,
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
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
      assert.doesNotMatch(
        result.stdout,
        /\((ERROR|MISSING)([ \t\r\n)]|$)/,
        `unexpected native parser recovery\n${result.stdout}`,
      );
    });
  }
}

test("marker ranges: missing text introducer stays zero-width before a stray backslash", () => {
  const result = parse("source.sed", "a\\x\n", [], { ranges: true });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(
    result.stdout.includes("(missing_text_introducer [0, 1] - [0, 1])"),
    result.stdout,
  );
});

test("marker ranges: source-end omission stays zero-width after the separator", () => {
  const result = parse("source.sed", "1,", [], { ranges: true });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(
    result.stdout.includes("(omitted_address [0, 2] - [0, 2])"),
    result.stdout,
  );
});

test("ownership: excess address unit owns its separator and address", () => {
  const result = parse("source.sed", "1,2q\n");
  assert.equal(result.status, 0, result.stdout + result.stderr);
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
      const result = parse(grammar.scope, source, [], { ranges: true });
      assert.equal(result.status, 0, result.stdout + result.stderr);
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
      assert.doesNotMatch(
        result.stdout,
        /\((ERROR|MISSING|unknown_function|unexpected_command_text)([ \t\r\n)]|$)/,
        result.stdout,
      );
    }
  });

  test(`ownership: adjacent context address remains excess in ${grammar.name}`, () => {
    const result = parse(grammar.scope, "1/ab/q\n", [], { ranges: true });
    assert.equal(result.status, 0, result.stdout + result.stderr);
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
    assert.doesNotMatch(
      result.stdout,
      /\((ERROR|MISSING|unknown_function|unexpected_command_text)([ \t\r\n)]|$)/,
      result.stdout,
    );
  });
}

test("ownership: separator blanks live inside blank issues on both sides", () => {
  const result = parse("source.sed", "1 \t, \t2p\n", [], { ranges: true });
  assert.equal(result.status, 0, result.stdout + result.stderr);
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
  const result = parse("source.sed", "! \tp\n", [], { ranges: true });
  assert.equal(result.status, 0, result.stdout + result.stderr);
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
  for (const [grammar, nodeTypes] of [
    ["sed", sedNodeTypes],
    ["sed_ere", sedEreNodeTypes],
  ]) {
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

test("schema: bracket terms use anonymous delimiter symbols", () => {
  const obsoleteDelimiterTypes = [
    "open_colon",
    "colon_close",
    "open_dot",
    "dot_close",
    "open_equal",
    "equal_close",
  ];
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

    for (const delimiter of ["[", ":", ".", "=", "]"]) {
      assert.equal(
        nodeType(delimiter)?.named,
        false,
        `${delimiter} must be anonymous in ${grammar.name}`,
      );
    }
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
          multiple: false,
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
    const result = parse(grammar.scope, source, [], {
      cst: true,
      ranges: true,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
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
      const standard = parse(grammar.scope, testCase.source, [], {
        ranges: true,
      });
      assert.equal(standard.status, 0, standard.stdout + standard.stderr);
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

      const result = parse(grammar.scope, testCase.source, [], {
        cst: true,
        ranges: true,
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
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
    const standard = parse(grammar.scope, source, [], { ranges: true });
    assert.equal(standard.status, 0, standard.stdout + standard.stderr);
    assert.deepEqual(
      issueSignatures(standard.stdout).filter(
        ({ reason }) => reason === "malformed_bracket_term",
      ),
      expectedIssues,
      `empty bracket term issues in ${grammar.name}`,
    );

    const result = parse(grammar.scope, source, [], {
      cst: true,
      ranges: true,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
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
    const result = parse("source.sed", testCase.source, [], { ranges: true });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(issueSignatures(result.stdout), testCase.issues);
    assert.ok(
      result.stdout.includes(testCase.separator),
      `the separator must end at its token\n${result.stdout}`,
    );
  }
});

test("ownership: duplicated negation operator lives inside its issue", () => {
  const result = parse("source.sed", "!!p\n", [], { ranges: true });
  assert.equal(result.status, 0, result.stdout + result.stderr);
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
    const result = parse("source.sed", testCase.source, [], { ranges: true });
    assert.equal(result.status, 0, result.stdout + result.stderr);
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
    assert.doesNotMatch(
      result.stdout,
      /\((ERROR|MISSING)([ \t\r\n)]|$)/,
      `unexpected native parser recovery\n${result.stdout}`,
    );
  }
});

test("schema: unmatched BRE closer reasons require their source child", () => {
  const cases = [
    ["unmatched_interval_close", "back_close_brace"],
    ["unmatched_subexpression_close", "back_close_parenthesis_token"],
  ];
  for (const [reason, child] of cases) {
    const nodeType = sedNodeTypes.find(
      (candidate) => candidate.type === reason,
    );
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
      sedEreNodeTypes.some((candidate) => candidate.type === reason),
      false,
      `${reason} must remain BRE-only`,
    );
  }
});

test("recovery localizes a broken top-level editing command", () => {
  const result = parse("source.sed", "p\n/[a\nd\n");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(issuePaths(result.stdout), [
    "undefined_syntax/unclosed_bracket_expression",
    "nonconforming_syntax/unterminated_regular_expression",
    "nonconforming_syntax/missing_function",
  ]);

  const commands = topLevelEditingCommands(result.stdout);
  assert.equal(commands.length, 3, result.stdout);
  assert.equal(
    commands[0],
    topLevelEditingCommands(parse("source.sed", "p\n").stdout)[0],
  );
  assert.equal(
    commands[2],
    topLevelEditingCommands(parse("source.sed", "d\n").stdout)[0],
  );
});

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
    const fresh = parse(testCase.scope, testCase.source, [], { ranges: true });
    assert.equal(fresh.status, 0, fresh.stdout + fresh.stderr);
    if (testCase.issues !== undefined) {
      assert.deepEqual(issueSignatures(fresh.stdout), testCase.issues);
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
