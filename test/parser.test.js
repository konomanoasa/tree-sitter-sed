import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createTreeSitter, grammars } from "../scripts/tree-sitter.js";
import ereNodeTypes from "../sed_ere/src/node-types.json" with { type: "json" };
import breNodeTypes from "../src/node-types.json" with { type: "json" };

const nodeTypesByName = new Map([
  ["sed", breNodeTypes],
  ["sed_ere", ereNodeTypes],
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

function parse(scope, source, edits = []) {
  const sourcePath = join(temporaryDirectory, `fixture-${fixtureNumber}.sed`);
  fixtureNumber += 1;
  writeFileSync(sourcePath, source);
  const result = treeSitter.run(
    [
      "parse",
      "--scope",
      scope,
      "--cst",
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
  assert.ok(
    result.status === 0 || result.status === 1,
    result.stdout + result.stderr,
  );
  result.nodes = readCst(result.stdout, applyEdits(source, edits));
  assert.equal(result.nodes[0]?.kind, "script", result.stdout);
  return result;
}

function parseSuccessfully(scope, source, edits = []) {
  const result = parse(scope, source, edits);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result;
}

function readCst(tree, source) {
  const bytes = Buffer.from(source);
  const lineStarts = [0];
  for (let index = 0; index < bytes.length; index++) {
    if (bytes[index] === 10) lineStarts.push(index + 1);
  }
  const nodes = [];
  const ancestors = [];
  for (const line of tree.split("\n")) {
    const row = /^([0-9]+):([0-9]+) +- +([0-9]+):([0-9]+)( +)(.*)$/.exec(line);
    if (row === null) continue;
    const match =
      /^(([a-z_][a-z_0-9]*): )?([a-z_][a-z_0-9]*|ERROR|MISSING|"[^"]+")/.exec(
        row[6],
      );
    if (match === null) continue;
    const indentation = line.length - row[6].length;
    while (ancestors.length && ancestors.at(-1).indentation >= indentation) {
      ancestors.pop();
    }
    const [, , field, kind] = match;
    const start = [Number(row[1]), Number(row[2])];
    const end = [Number(row[3]), Number(row[4])];
    const index = nodes.length;
    nodes.push({
      parent: ancestors.at(-1)?.index ?? null,
      kind,
      field: field ?? null,
      start,
      end,
      startByte: lineStarts[start[0]] + start[1],
      endByte: lineStarts[end[0]] + end[1],
    });
    ancestors.push({ indentation, index });
  }
  return nodes;
}

function nodeRange(node) {
  return `[${node.start.join(", ")}] - [${node.end.join(", ")}]`;
}

function subtree(nodes, index) {
  let end = index + 1;
  while (
    end < nodes.length &&
    nodes[end].parent !== null &&
    nodes[end].parent >= index
  )
    end++;
  return nodes.slice(index, end);
}

function directDelimiterLeafLines(nodes, ownerType) {
  const owner = nodes.findIndex(({ kind }) => kind === ownerType);
  assert.notEqual(owner, -1, `missing ${ownerType}`);
  return nodes
    .filter(({ parent, kind }) => parent === owner && kind.startsWith('"'))
    .map(
      ({ start, end, kind }) => `${start.join(":")} - ${end.join(":")} ${kind}`,
    );
}

function issueSignatures(nodes, root = 0) {
  return subtree(nodes, root).flatMap((issue, offset) => {
    if (issue.kind !== "syntax_issue") return [];
    const index = root + offset;
    const outcome = nodes[index + 1];
    const reason = nodes[index + 2];
    assert.ok(outcome !== undefined, "missing issue outcome");
    assert.ok(reason !== undefined, "missing issue reason");
    assert.equal(outcome.parent, index, "issue must directly own its outcome");
    assert.equal(
      reason.parent,
      index + 1,
      "outcome must directly own its reason",
    );
    const range = nodeRange(issue);
    assert.equal(
      nodeRange(outcome),
      range,
      "outcome range must match its issue",
    );
    assert.equal(nodeRange(reason), range, "reason range must match its issue");
    return [{ outcome: outcome.kind, reason: reason.kind, range }];
  });
}

function issuePaths(nodes) {
  return issueSignatures(nodes).map(
    ({ outcome, reason }) => `${outcome}/${reason}`,
  );
}

function syntaxSignatures(
  nodes,
  types = nodes.map(({ kind }) => kind),
  root = 0,
) {
  const selected = new Set(types);
  const depths = [];
  return subtree(nodes, root).flatMap((node, index) => {
    const depth = index === 0 ? 0 : depths[node.parent - root];
    const included = selected.has(node.kind);
    depths[index] = depth + Number(included);
    if (!included) return [];
    const field = node.field === null ? "" : `${node.field}: `;
    return [`${"  ".repeat(depth)}${field}${node.kind} ${nodeRange(node)}`];
  });
}

function assertNoNodes(nodes, ...types) {
  assert.deepEqual(
    nodes.filter(({ kind }) => types.includes(kind)),
    [],
    `unexpected ${types.join(", ")} node`,
  );
}

function publicNodes(nodes) {
  const visible = [];
  const parents = [];
  const missing = [];
  for (const [index, node] of nodes.entries()) {
    const parent = node.parent === null ? null : parents[node.parent];
    parents[index] = parent;
    missing[index] = node.kind === "MISSING" || missing[node.parent] === true;
    if (missing[index] || node.kind === "ERROR") continue;
    if (
      node.kind.startsWith('"') &&
      !["character_class", "collating_symbol", "equivalence_class"].includes(
        visible[parent]?.kind,
      )
    )
      continue;
    parents[index] = visible.length;
    visible.push({
      ...node,
      parent,
      field: nodes[node.parent]?.kind === "ERROR" ? null : node.field,
    });
  }
  return visible;
}

function topLevelEditingCommands(nodes) {
  const publicTree = publicNodes(nodes);
  const list = publicTree.findIndex(({ kind }) => kind === "command_list");
  assert.notEqual(list, -1, "missing command_list");
  return publicTree.flatMap((command, index) => {
    if (command.parent !== list || command.kind !== "editing_command")
      return [];
    const relativePoint = ([row, column]) => [
      row - command.start[0],
      row === command.start[0] ? column - command.start[1] : column,
    ];
    const nodes = subtree(publicTree, index).map((node, offset) => ({
      kind: node.kind,
      parent: offset === 0 ? null : node.parent - index,
      field: offset === 0 ? null : node.field,
      start: relativePoint(node.start),
      end: relativePoint(node.end),
      startByte: node.startByte - command.startByte,
      endByte: node.endByte - command.startByte,
    }));
    return [{ start: command.start, nodes }];
  });
}

function assertIncrementalContract(fresh, incremental, context) {
  const freshIssues = issueSignatures(fresh.nodes);
  assert.deepEqual(
    issueSignatures(incremental.nodes),
    freshIssues,
    `${context}: fresh and incremental issue signatures differ`,
  );
  assert.deepEqual(
    publicNodes(incremental.nodes),
    publicNodes(fresh.nodes),
    `${context}: fresh and incremental public CSTs differ`,
  );
  if (fresh.status === 0 && freshIssues.length === 0) {
    assert.equal(incremental.status, 0, `${context}: normal source has errors`);
    assert.deepEqual(
      incremental.nodes,
      fresh.nodes,
      `${context}: fresh and incremental CSTs differ`,
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
    nodes: ["incomplete_regular_expression_escape"],
  },
  {
    name: "text introducer backslash without a newline at source end",
    scope: "source.sed",
    source: "a\\",
    issues: ["incomplete_syntax/incomplete_text_introducer"],
    nodes: ["append_function", "incomplete_text_introducer"],
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
    nodes: ["line_number_address", "address_separator"],
  },
  {
    name: "omitted second address at a command boundary",
    scope: "source.sed",
    source: "1,\np\n",
    issues: [
      "undefined_syntax/omitted_address",
      "nonconforming_syntax/missing_function",
    ],
    nodes: ["address_separator", "print_function"],
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
    nodes: ["address_separator"],
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
    nodes: ["line_number_address", "address_separator"],
  },
];

const regularExpressionEofCases = [
  {
    name: "BRE interval escape without a minimum",
    scope: "source.sed",
    source: "s/a\\{\\",
    outcome: "undefined_syntax",
    reason: "malformed_interval",
    range: "[0, 5] - [0, 6]",
    repaired: "s/a\\{1\\}//",
    damage: ["5 1 ", "6 3 "],
    repair: ["5 1 1\\}//"],
  },
  {
    name: "BRE interval escape after an exact count",
    scope: "source.sed",
    source: "s/a\\{1\\",
    outcome: "incomplete_syntax",
    reason: "incomplete_interval",
    range: "[0, 6] - [0, 7]",
    repaired: "s/a\\{1\\}//",
    damage: ["7 3 "],
    repair: ["7 0 }//"],
  },
  {
    name: "BRE interval escape after an unbounded minimum",
    scope: "source.sed",
    source: "s/a\\{1,\\",
    outcome: "incomplete_syntax",
    reason: "incomplete_interval",
    range: "[0, 7] - [0, 8]",
    repaired: "s/a\\{1,\\}//",
    damage: ["8 3 "],
    repair: ["8 0 }//"],
  },
  {
    name: "BRE interval escape after a maximum",
    scope: "source.sed",
    source: "s/a\\{1,2\\",
    outcome: "incomplete_syntax",
    reason: "incomplete_interval",
    range: "[0, 8] - [0, 9]",
    repaired: "s/a\\{1,2\\}//",
    damage: ["9 3 "],
    repair: ["9 0 }//"],
  },
  {
    name: "ERE group closer conflicts with the delimiter",
    scope: "source.sed.ere",
    source: "s)(a",
    outcome: "undefined_syntax",
    reason: "unclosed_subexpression",
    range: "[0, 4] - [0, 4]",
    repaired: "s/(a)//",
    damage: ["1 1 )", "4 3 "],
    repair: ["1 1 /", "4 0 )//"],
  },
  {
    name: "BRE group closer conflicts with the delimiter",
    scope: "source.sed",
    source: "s)\\(a",
    outcome: "undefined_syntax",
    reason: "unclosed_subexpression",
    range: "[0, 5] - [0, 5]",
    repaired: "s/\\(a\\)//",
    damage: ["1 1 )", "5 4 "],
    repair: ["1 1 /", "5 0 \\)//"],
  },
  {
    name: "empty ERE group with a conflicting delimiter",
    scope: "source.sed.ere",
    source: "s)(",
    outcome: "undefined_syntax",
    reason: "unclosed_subexpression",
    range: "[0, 3] - [0, 3]",
    missingBody: true,
    repaired: "s/(a)//",
    damage: ["1 1 )", "3 4 "],
    repair: ["1 1 /", "3 0 a)//"],
  },
  {
    name: "empty BRE group with a conflicting delimiter",
    scope: "source.sed",
    source: "s)\\(",
    outcome: "undefined_syntax",
    reason: "unclosed_subexpression",
    range: "[0, 4] - [0, 4]",
    missingBody: true,
    repaired: "s/\\(a\\)//",
    damage: ["1 1 )", "4 5 "],
    repair: ["1 1 /", "4 0 a\\)//"],
  },
  {
    name: "ERE interval closer conflicts with the delimiter",
    scope: "source.sed.ere",
    source: "s}a{1",
    outcome: "undefined_syntax",
    reason: "malformed_interval",
    range: "[0, 5] - [0, 5]",
    repaired: "s/a{1}//",
    damage: ["1 1 }", "5 3 "],
    repair: ["1 1 /", "5 0 }//"],
  },
  {
    name: "BRE interval closer conflicts with the delimiter",
    scope: "source.sed",
    source: "s}a\\{1",
    outcome: "undefined_syntax",
    reason: "malformed_interval",
    range: "[0, 6] - [0, 6]",
    repaired: "s/a\\{1\\}//",
    damage: ["1 1 }", "6 4 "],
    repair: ["1 1 /", "6 0 \\}//"],
  },
];

for (const testCase of regularExpressionEofCases) {
  test(`source-end recovery: ${testCase.name}`, () => {
    const result = parseSuccessfully(testCase.scope, testCase.source);
    const end = testCase.source.length;
    const expected = [];
    if (testCase.missingBody) {
      expected.push({
        outcome: "incomplete_syntax",
        reason: "missing_subexpression",
        range: testCase.range,
      });
    }
    expected.push(
      {
        outcome: testCase.outcome,
        reason: testCase.reason,
        range: testCase.range,
      },
      {
        outcome: "incomplete_syntax",
        reason: "incomplete_regular_expression",
        range: `[0, ${end}] - [0, ${end}]`,
      },
    );
    assert.deepEqual(issueSignatures(result.nodes), expected);
    assertNoNodes(
      result.nodes,
      "ERROR",
      "MISSING",
      "back_close_brace",
      "close_brace",
      "back_close_parenthesis",
      "close_parenthesis",
    );
    assert.deepEqual(
      applyEdits(testCase.repaired, testCase.damage),
      Buffer.from(testCase.source),
    );
    assertIncrementalContract(
      result,
      parse(testCase.scope, testCase.repaired, testCase.damage),
      testCase.name,
    );
    const repaired = parseSuccessfully(testCase.scope, testCase.repaired);
    assertNoNodes(repaired.nodes, "syntax_issue", "ERROR", "MISSING");
    assert.deepEqual(
      applyEdits(testCase.source, testCase.repair),
      Buffer.from(testCase.repaired),
    );
    assertIncrementalContract(
      repaired,
      parse(testCase.scope, testCase.source, testCase.repair),
      `${testCase.name}: repair`,
    );
  });
}

const invalidCharacterCases = [
  {
    name: "function at source end",
    source: "\0",
    issues: [["unknown_function", "[0, 0] - [0, 1]"]],
    encodingIssues: [
      ["unknown_function", "[0, 0] - [0, 1]"],
      ["invalid_encoding", "[0, 0] - [0, 1]"],
    ],
  },
  {
    name: "function between complete commands",
    source: "p\n\0\nq\n",
    issues: [["unknown_function", "[1, 0] - [1, 1]"]],
    encodingIssues: [
      ["unknown_function", "[1, 0] - [1, 1]"],
      ["invalid_encoding", "[1, 0] - [1, 1]"],
    ],
  },
  {
    name: "trailing command text",
    source: "pX\0q\0\n",
    issues: [["unexpected_command_text", "[0, 1] - [0, 5]"]],
    encodingIssues: [
      ["unexpected_command_text", "[0, 1] - [0, 5]"],
      ["invalid_encoding", "[0, 2] - [0, 3]"],
      ["invalid_encoding", "[0, 4] - [0, 5]"],
    ],
    nulIssues: [
      ["unexpected_command_text", "[0, 1] - [0, 5]"],
      ["nul_character", "[0, 2] - [0, 3]"],
      ["nul_character", "[0, 4] - [0, 5]"],
    ],
  },
  ...["s", "y"].map((verb) => ({
    name: `${verb} opening delimiter`,
    encodingIssues: [
      ["invalid_delimiter", "[0, 1] - [0, 2]"],
      ["invalid_encoding", "[0, 1] - [0, 2]"],
      ["unexpected_command_text", "[0, 2] - [0, 3]"],
    ],
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
    encodingIssues: [
      ["invalid_delimiter", "[0, 1] - [0, 2]"],
      ["invalid_encoding", "[0, 1] - [0, 2]"],
    ],
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
        const fresh = parseSuccessfully(grammar.scope, source);
        assert.deepEqual(
          issueSignatures(fresh.nodes),
          (character === "\0"
            ? (testCase.nulIssues ?? testCase.issues)
            : testCase.encodingIssues
          ).map(([reason, range]) => ({
            outcome:
              reason === "invalid_encoding"
                ? "invalid_syntax"
                : "nonconforming_syntax",
            reason,
            range,
          })),
          fresh.stdout,
        );
        assertNoNodes(fresh.nodes, "ERROR", "MISSING");
        const incremental = parse(
          grammar.scope,
          Buffer.concat([Buffer.from("p\n"), source]),
          ["0 2 "],
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

for (const grammar of grammars) {
  test(`unexpected command text owns nested NUL issues in ${grammar.name}`, () => {
    const source = "{\npX\0Y\0\nq\n}\n";
    const fresh = parseSuccessfully(grammar.scope, source);
    const incremental = parseSuccessfully(grammar.scope, `p\n${source}`, [
      "0 2 ",
    ]);
    assertIncrementalContract(
      fresh,
      incremental,
      "nested unexpected command text",
    );
    for (const result of [fresh, incremental]) {
      assertNoNodes(result.nodes, "ERROR", "MISSING");
      assert.deepEqual(
        syntaxSignatures(result.nodes, [
          "block_function",
          "print_function",
          "quit_function",
          "unexpected_command_text",
          "nul_character",
        ]),
        [
          "block_function [0, 0] - [3, 1]",
          "  print_function [1, 0] - [1, 1]",
          "  unexpected_command_text [1, 1] - [1, 5]",
          "    nul_character [1, 2] - [1, 3]",
          "    nul_character [1, 4] - [1, 5]",
          "  quit_function [2, 0] - [2, 1]",
        ],
      );
    }
    const edits = ["6 1 ", "4 1 "];
    const repaired = "{\npXY\nq\n}\n";
    assert.deepEqual(applyEdits(source, edits), Buffer.from(repaired));
    const repairedFresh = parseSuccessfully(grammar.scope, repaired);
    assert.deepEqual(issueSignatures(repairedFresh.nodes), [
      {
        outcome: "nonconforming_syntax",
        reason: "unexpected_command_text",
        range: "[1, 1] - [1, 3]",
      },
    ]);
    assertIncrementalContract(
      repairedFresh,
      parseSuccessfully(grammar.scope, source, edits),
      "remove only the nested NUL issues",
    );
  });
}

for (const testCase of boundaryCases) {
  test(`boundary: ${testCase.name}`, () => {
    const result = parse(testCase.scope, testCase.source);
    assert.equal(
      result.status,
      0,
      `unexpected parse status\n${result.stdout}${result.stderr}`,
    );
    assert.deepEqual(issuePaths(result.nodes), testCase.issues, result.stdout);
    for (const node of testCase.nodes) {
      assert.ok(
        result.nodes.some(({ kind }) => kind === node),
        `missing ${node}\n${result.stdout}`,
      );
    }
    assertNoNodes(result.nodes, "ERROR", "MISSING");
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
      const result = parseSuccessfully(grammar.scope, testCase.source);
      assert.deepEqual(issueSignatures(result.nodes), [
        {
          outcome: "nonconforming_syntax",
          reason: "omitted_file_separator",
          range: `[0, ${testCase.issueColumn}] - [0, ${testCase.issueColumn}]`,
        },
      ]);
      assert.ok(
        result.nodes.some(({ kind }) => kind === testCase.owner),
        `missing ${testCase.owner}\n${result.stdout}`,
      );
      assert.deepEqual(
        syntaxSignatures(result.nodes, [testCase.operand]),
        [
          `${testCase.operand}: ${testCase.operand} [0, ${testCase.operandStart}] - [0, ${testCase.operandEnd}]`,
        ],
        `missing ${testCase.operand} operand\n${result.stdout}`,
      );
      assertNoNodes(result.nodes, "ERROR", "MISSING");
    });
  }
}

test("marker ranges: missing text introducer stays zero-width before a stray backslash", () => {
  const result = parseSuccessfully("source.sed", "a\\x\n");
  assert.deepEqual(
    syntaxSignatures(result.nodes, ["missing_text_introducer"]),
    ["missing_text_introducer [0, 1] - [0, 1]"],
    result.stdout,
  );
});

test("ownership: incomplete text introducer is a direct issue on append", () => {
  const result = parseSuccessfully("source.sed", "a\\");
  assert.deepEqual(
    syntaxSignatures(result.nodes, [
      "append_function",
      "syntax_issue",
      "incomplete_text_introducer",
    ]),
    [
      "append_function [0, 0] - [0, 2]",
      "  issue: syntax_issue [0, 1] - [0, 2]",
      "    incomplete_text_introducer [0, 1] - [0, 2]",
    ],
  );
  assertNoNodes(
    result.nodes,
    "text_introducer",
    "ERROR",
    "MISSING",
    "unexpected_command_text",
  );
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
      nodes: ["back_close_parenthesis"],
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
      nodes: ["close_parenthesis"],
    },
  ];
  for (const testCase of cases) {
    const result = parseSuccessfully(testCase.scope, testCase.source);
    assert.deepEqual(
      issueSignatures(result.nodes),
      testCase.issues,
      `${testCase.scope}: ${JSON.stringify(testCase.source)}\n${result.stdout}`,
    );
    for (const node of testCase.nodes) {
      assert.ok(
        result.nodes.some(({ kind }) => kind === node),
        `missing ${node}\n${result.stdout}`,
      );
    }
    assertNoNodes(result.nodes, "ERROR", "MISSING", "unclosed_subexpression");
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
    const fresh = parseSuccessfully(testCase.scope, testCase.source);
    assert.deepEqual(
      issueSignatures(fresh.nodes),
      testCase.issues,
      fresh.stdout,
    );
    assertNoNodes(fresh.nodes, "ERROR", "MISSING");
    const nodes = fresh.nodes;
    const { reason, range } = testCase.issues[0];
    const reasonIndex = nodes.findIndex(({ kind }) => kind === reason);
    assert.ok(reasonIndex >= 0, fresh.stdout);
    const child = nodes[reasonIndex + 1];
    assert.deepEqual(
      { parent: child.parent, type: child.kind, range: nodeRange(child) },
      { parent: reasonIndex, type: testCase.child, range },
      fresh.stdout,
    );
    assert.equal(
      nodes.filter(
        (node) => node.kind === testCase.child && nodeRange(node) === range,
      ).length,
      1,
      fresh.stdout,
    );
    if (testCase.issues.length > 1) {
      assert.deepEqual(
        issueSignatures(nodes, reasonIndex),
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
    const retained = syntaxSignatures(fresh.nodes, retainedTypes);

    const replacementEdit = `${testCase.source.length - 3} 1 y`;
    const changedReplacement = applyEdits(testCase.source, [replacementEdit]);
    const incremental = parseSuccessfully(testCase.scope, changedReplacement, [
      `${testCase.source.length - 3} 1 x`,
    ]);
    assertIncrementalContract(fresh, incremental, testCase.name);
    assert.deepEqual(
      syntaxSignatures(incremental.nodes, retainedTypes),
      retained,
    );

    const patternEnd = testCase.source.lastIndexOf("/x/");
    const inserted = parseSuccessfully(testCase.scope, "s//x/\n", [
      `2 0 ${testCase.source.slice(2, patternEnd)}`,
    ]);
    assertIncrementalContract(fresh, inserted, testCase.name);
    assert.deepEqual(syntaxSignatures(inserted.nodes, retainedTypes), retained);
  });
}

test("marker ranges: source-end omission stays zero-width after the separator", () => {
  const result = parseSuccessfully("source.sed", "1,");
  assert.deepEqual(
    syntaxSignatures(result.nodes, ["omitted_address"]),
    ["omitted_address [0, 2] - [0, 2]"],
    result.stdout,
  );
});

test("ownership: excess address unit owns its separator and address", () => {
  const result = parseSuccessfully("source.sed", "1,2q\n");
  const issue = result.nodes.findIndex(({ kind }) => kind === "syntax_issue");
  assert.notEqual(issue, -1);
  assert.deepEqual(
    syntaxSignatures(result.nodes, undefined, issue),
    [
      "issue: syntax_issue [0, 1] - [0, 3]",
      "  nonconforming_syntax [0, 1] - [0, 3]",
      "    excess_address [0, 1] - [0, 3]",
      "      separator: address_separator [0, 1] - [0, 2]",
      "      address: address [0, 2] - [0, 3]",
      "        line_number_address [0, 2] - [0, 3]",
    ],
    `excess unit must own separator and address inside the clause\n${result.stdout}`,
  );
  assert.equal(result.nodes[result.nodes[issue].parent].kind, "address_clause");
  assert.ok(
    !result.nodes.some(
      (node) =>
        node.kind === "syntax_issue" &&
        result.nodes[node.parent]?.kind === "editing_command",
    ),
    `editing_command must not carry a trailing address issue\n${result.stdout}`,
  );
});

for (const grammar of grammars) {
  test(`ownership: blank-separated max-zero addresses in ${grammar.name}`, () => {
    for (const source of ["1 2:x\n", "1 2:x"]) {
      const result = parseSuccessfully(grammar.scope, source);
      assert.deepEqual(issueSignatures(result.nodes), [
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
      assert.ok(
        result.nodes.some(({ kind }) => kind === "label_function"),
        result.stdout,
      );
      assertNoNodes(
        result.nodes,
        "ERROR",
        "MISSING",
        "unknown_function",
        "unexpected_command_text",
      );
    }
  });

  test(`ownership: adjacent context address remains excess in ${grammar.name}`, () => {
    const result = parseSuccessfully(grammar.scope, "1/ab/q\n", []);
    assert.deepEqual(issueSignatures(result.nodes), [
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
    assert.ok(
      result.nodes.some(({ kind }) => kind === "quit_function"),
      result.stdout,
    );
    assertNoNodes(
      result.nodes,
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
          issuePaths(result.nodes),
          verb === ":" || verb === "#"
            ? ["nonconforming_syntax/excess_address"]
            : [],
          `${JSON.stringify(source)}\n${result.stdout}`,
        );
        assertNoNodes(result.nodes, "ERROR", "MISSING", "unknown_function");
      }
    }
  });
}

test("ownership: separator blanks live inside sibling blank issues", () => {
  const result = parseSuccessfully("source.sed", "1 \t, \t2p\n", []);
  assert.deepEqual(
    syntaxSignatures(result.nodes, [
      "address_clause",
      "address_separator",
      "syntax_issue",
      "blanks_around_address_separator",
      "blank",
    ]),
    [
      "addresses: address_clause [0, 0] - [0, 7]",
      "  issue: syntax_issue [0, 1] - [0, 3]",
      "    blanks_around_address_separator [0, 1] - [0, 3]",
      "      blank [0, 1] - [0, 3]",
      "  separator: address_separator [0, 3] - [0, 4]",
      "  issue: syntax_issue [0, 4] - [0, 6]",
      "    blanks_around_address_separator [0, 4] - [0, 6]",
      "      blank [0, 4] - [0, 6]",
    ],
  );
});

test("ownership: blank after negation lives inside its issue reason", () => {
  const result = parseSuccessfully("source.sed", "! \tp\n");
  const issue = result.nodes.findIndex(({ kind }) => kind === "syntax_issue");
  assert.notEqual(issue, -1);
  assert.equal(result.nodes[result.nodes[issue].parent].kind, "negation");
  assert.deepEqual(
    syntaxSignatures(result.nodes, undefined, issue),
    [
      "issue: syntax_issue [0, 1] - [0, 3]",
      "  unspecified_syntax [0, 1] - [0, 3]",
      "    blanks_after_negation [0, 1] - [0, 3]",
      "      blank [0, 1] - [0, 3]",
    ],
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
      "character_class [0, 2] - [0, 11]",
      '  "[" [0, 2] - [0, 3]',
      '  ":" [0, 3] - [0, 4]',
      "  name: class_name [0, 4] - [0, 9]",
      '  ":" [0, 9] - [0, 10]',
      '  "]" [0, 10] - [0, 11]',
    ],
    collating_symbol: [
      "collating_symbol [0, 11] - [0, 16]",
      '  "[" [0, 11] - [0, 12]',
      '  "." [0, 12] - [0, 13]',
      "  element: meta_char [0, 13] - [0, 14]",
      '  "." [0, 14] - [0, 15]',
      '  "]" [0, 15] - [0, 16]',
    ],
    equivalence_class: [
      "equivalence_class [0, 16] - [0, 21]",
      '  "[" [0, 16] - [0, 17]',
      '  "=" [0, 17] - [0, 18]',
      "  element: coll_elem_single [0, 18] - [0, 19]",
      '  "=" [0, 19] - [0, 20]',
      '  "]" [0, 20] - [0, 21]',
    ],
  };

  for (const grammar of grammars) {
    const result = parseSuccessfully(grammar.scope, source);
    for (const [type, expected] of Object.entries(expectedBlocks)) {
      const start = result.nodes.findIndex(({ kind }) => kind === type);
      assert.notEqual(start, -1, `${type} is missing in ${grammar.name}`);
      assert.deepEqual(
        syntaxSignatures(result.nodes, undefined, start),
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
      const result = parseSuccessfully(grammar.scope, testCase.source);
      assert.deepEqual(
        issueSignatures(result.nodes).filter(
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

      assert.ok(
        result.nodes.some(({ kind }) => kind === testCase.type),
        `${testCase.type} is missing in ${grammar.name}`,
      );
      assert.deepEqual(
        directDelimiterLeafLines(result.nodes, testCase.type),
        ['0:2 - 0:3 "["', `0:3 - 0:4 "${testCase.marker}"`],
        `${testCase.type} delimiter leaves in ${grammar.name}`,
      );
      assertNoNodes(result.nodes, "MISSING");
    }
  }
});

for (const grammar of grammars) {
  const collatingTerms = [
    ["collating_symbol", "."],
    ["equivalence_class", "="],
  ];

  test(`bracket term payloads retain closing brackets in ${grammar.name}`, () => {
    for (const [type, marker] of collatingTerms) {
      for (const [name, payload] of [
        ["leading bracket", "]a"],
        ["middle bracket", "a]b"],
        ["trailing bracket", "a]"],
        ["consecutive brackets", "a]]b"],
        ["regular expression delimiter", "a]/b"],
        ["other term closing delimiter", marker === "." ? "a]=]b" : "a].]b"],
      ]) {
        const source = `/[[${marker}${payload}${marker}]]/p\n`;
        const end = 4 + payload.length;
        const label = `${type}: ${name}`;
        const result = parseSuccessfully(grammar.scope, source);
        assertNoNodes(result.nodes, "syntax_issue", "ERROR", "MISSING");
        const owner = result.nodes.findIndex(({ kind }) => kind === type);
        assert.notEqual(owner, -1, label);
        assert.deepEqual(
          syntaxSignatures(result.nodes, undefined, owner),
          [
            `${type} [0, 2] - [0, ${end + 2}]`,
            '  "[" [0, 2] - [0, 3]',
            `  "${marker}" [0, 3] - [0, 4]`,
            `  element: coll_elem_multi [0, 4] - [0, ${end}]`,
            `  "${marker}" [0, ${end}] - [0, ${end + 1}]`,
            `  "]" [0, ${end + 1}] - [0, ${end + 2}]`,
          ],
          label,
        );
        assert.deepEqual(
          syntaxSignatures(result.nodes, ["close_bracket"]),
          [`closing: close_bracket [0, ${end + 2}] - [0, ${end + 3}]`],
          label,
        );
        const position = 4 + payload.indexOf("]");
        const withoutBracket =
          source.slice(0, position) + source.slice(position + 1);
        assertIncrementalContract(
          result,
          parse(grammar.scope, withoutBracket, [`${position} 0 ]`]),
          `${label}: insert payload bracket`,
        );
        assertIncrementalContract(
          parseSuccessfully(grammar.scope, withoutBracket),
          parse(grammar.scope, source, [`${position} 1 `]),
          `${label}: remove payload bracket`,
        );
      }
    }
  });

  test(`unterminated collating terms own brackets through the source boundary in ${grammar.name}`, () => {
    for (const [type, marker] of collatingTerms) {
      for (const suffix of ["", "\np\n"]) {
        const source = `/[[${marker}a]b]]/p${suffix}`;
        const label = `${type}: ${suffix === "" ? "EOF" : "physical newline"}`;
        const result = parseSuccessfully(grammar.scope, source);
        const outcome =
          suffix === "" ? "incomplete_syntax" : "undefined_syntax";
        const commandOutcome =
          suffix === "" ? "incomplete_syntax" : "nonconforming_syntax";
        assert.deepEqual(
          issueSignatures(result.nodes),
          [
            {
              outcome,
              reason:
                suffix === ""
                  ? "incomplete_bracket_term"
                  : "malformed_bracket_term",
              range: "[0, 11] - [0, 11]",
            },
            {
              outcome,
              reason: "unclosed_bracket_expression",
              range: "[0, 11] - [0, 11]",
            },
            {
              outcome: commandOutcome,
              reason:
                suffix === ""
                  ? "incomplete_regular_expression"
                  : "unterminated_regular_expression",
              range: "[0, 11] - [0, 11]",
            },
            {
              outcome: commandOutcome,
              reason: "missing_function",
              range: "[0, 11] - [0, 11]",
            },
          ],
          label,
        );
        const owner = result.nodes.findIndex(({ kind }) => kind === type);
        assert.notEqual(owner, -1, label);
        assert.equal(nodeRange(result.nodes[owner]), "[0, 2] - [0, 11]", label);
        assert.deepEqual(
          syntaxSignatures(result.nodes, ["coll_elem_multi"]),
          ["element: coll_elem_multi [0, 4] - [0, 11]"],
          label,
        );
        assert.deepEqual(
          directDelimiterLeafLines(result.nodes, type),
          ['0:2 - 0:3 "["', `0:3 - 0:4 "${marker}"`],
          label,
        );
        assertNoNodes(result.nodes, "close_bracket", "ERROR", "MISSING");
        assert.deepEqual(
          syntaxSignatures(result.nodes, ["print_function"]),
          suffix === "" ? [] : ["print_function [1, 0] - [1, 1]"],
          label,
        );
        const repaired = `/[[${marker}a]b${marker}]]/p${suffix}`;
        const fresh = parseSuccessfully(grammar.scope, repaired);
        assertNoNodes(fresh.nodes, "syntax_issue", "ERROR", "MISSING");
        assertIncrementalContract(
          result,
          parse(grammar.scope, repaired, ["7 1 "]),
          `${label}: remove closing marker`,
        );
        assertIncrementalContract(
          fresh,
          parse(grammar.scope, source, [`7 0 ${marker}`]),
          `${label}: restore closing marker`,
        );
      }
    }
  });

  test(`bracket payload fragments retain closing brackets across NUL in ${grammar.name}`, () => {
    for (const [type, marker] of collatingTerms) {
      const source = `/[[${marker}a]\0]b${marker}]]/p\n`;
      const result = parseSuccessfully(grammar.scope, source);
      assert.deepEqual(
        issueSignatures(result.nodes),
        [
          {
            outcome: "invalid_syntax",
            reason: "invalid_regular_expression_character",
            range: "[0, 6] - [0, 7]",
          },
        ],
        type,
      );
      const owner = result.nodes.findIndex(({ kind }) => kind === type);
      assert.notEqual(owner, -1, type);
      assert.deepEqual(
        syntaxSignatures(result.nodes, undefined, owner),
        [
          `${type} [0, 2] - [0, 11]`,
          '  "[" [0, 2] - [0, 3]',
          `  "${marker}" [0, 3] - [0, 4]`,
          "  element: coll_elem_multi [0, 4] - [0, 6]",
          "  issue: syntax_issue [0, 6] - [0, 7]",
          "    invalid_syntax [0, 6] - [0, 7]",
          "      invalid_regular_expression_character [0, 6] - [0, 7]",
          "  element: coll_elem_multi [0, 7] - [0, 9]",
          `  "${marker}" [0, 9] - [0, 10]`,
          '  "]" [0, 10] - [0, 11]',
        ],
        type,
      );
      assertNoNodes(result.nodes, "ERROR", "MISSING");
      const history = `/[[${marker}a]q\0]b${marker}]]/p\n`;
      assertIncrementalContract(
        result,
        parse(grammar.scope, history, ["6 1 "]),
        `${type}: remove character before NUL`,
      );
      const repaired = `/[[${marker}a]c]b${marker}]]/p\n`;
      const fresh = parseSuccessfully(grammar.scope, repaired);
      assertNoNodes(fresh.nodes, "syntax_issue", "ERROR", "MISSING");
      assert.deepEqual(
        syntaxSignatures(fresh.nodes, ["coll_elem_multi"]),
        ["element: coll_elem_multi [0, 4] - [0, 9]"],
        type,
      );
      assertIncrementalContract(
        fresh,
        parse(grammar.scope, source, ["6 1 c"]),
        `${type}: replace NUL with a character`,
      );
    }
  });
}

test("bracket term marker prefixes preserve payloads and converge after edits", () => {
  const cases = [
    {
      type: "character_class",
      marker: ":",
      payload: "alpha",
      kind: "class_name",
      field: "name",
    },
    {
      type: "collating_symbol",
      marker: ".",
      payload: "a",
      kind: "coll_elem_single",
      field: "element",
    },
    {
      type: "equivalence_class",
      marker: "=",
      payload: "a",
      kind: "coll_elem_single",
      field: "element",
    },
  ];

  for (const grammar of grammars) {
    for (const testCase of cases) {
      for (const payload of [testCase.payload, ""]) {
        const source = `s/[[${testCase.marker}${payload}${testCase.marker}`;
        const eof = source.length;
        const label = `${grammar.name}: ${source}`;
        const closingMarker = payload !== "" || testCase.marker === ":";
        const missingPayload = payload === "" && closingMarker;
        const result = parseSuccessfully(grammar.scope, source);
        assert.deepEqual(
          issueSignatures(result.nodes).filter(({ reason }) =>
            ["malformed_bracket_term", "incomplete_bracket_term"].includes(
              reason,
            ),
          ),
          [
            ...(missingPayload
              ? [
                  {
                    outcome: "undefined_syntax",
                    reason: "malformed_bracket_term",
                    range: "[0, 5] - [0, 5]",
                  },
                ]
              : []),
            {
              outcome: "incomplete_syntax",
              reason: "incomplete_bracket_term",
              range: `[0, ${eof}] - [0, ${eof}]`,
            },
          ],
          label,
        );
        assertNoNodes(result.nodes, "ERROR", "MISSING");
        const nodes = publicNodes(result.nodes);
        const owner = nodes.findIndex(({ kind }) => kind === testCase.type);
        assert.notEqual(owner, -1, label);
        assert.deepEqual(
          [nodes[owner].startByte, nodes[owner].endByte],
          [3, eof],
          label,
        );
        assert.deepEqual(
          nodes
            .filter(({ kind }) => kind === testCase.kind)
            .map(({ parent, field, startByte, endByte }) => [
              parent,
              field,
              startByte,
              endByte,
            ]),
          missingPayload
            ? []
            : [[owner, testCase.field, 5, closingMarker ? eof - 1 : eof]],
          label,
        );
        assert.deepEqual(
          nodes
            .filter(
              ({ kind, parent }) => kind === "syntax_issue" && parent === owner,
            )
            .map(({ field, startByte, endByte }) => [
              field,
              startByte,
              endByte,
            ]),
          [...(missingPayload ? [["issue", 5, 5]] : []), ["issue", eof, eof]],
          label,
        );
        assert.deepEqual(
          directDelimiterLeafLines(result.nodes, testCase.type),
          [
            '0:3 - 0:4 "["',
            `0:4 - 0:5 "${testCase.marker}"`,
            ...(closingMarker
              ? [`0:${eof - 1} - 0:${eof} "${testCase.marker}"`]
              : []),
          ],
          label,
        );
        if (missingPayload) continue;

        const suffix = `x${testCase.marker}]]/x/`;
        const initial = closingMarker ? `${source}]` : source;
        const complete = closingMarker
          ? `${source}]]/x/`
          : `${source}${suffix}`;
        const histories = closingMarker
          ? [
              { edit: `${eof} 1 `, source },
              { edit: `${eof} 0 ]`, source: initial },
              { edit: `${eof + 1} 0 ]/x/`, source: complete },
              { edit: `${eof} 1 x`, source: `${source}x]/x/` },
              { edit: `${eof} 1 ]`, source: complete },
            ]
          : [
              { edit: `${eof} 0 ${suffix}`, source: complete },
              { edit: `${eof} ${suffix.length} `, source },
            ];
        const edits = [];
        for (const history of histories) {
          edits.push(history.edit);
          assert.deepEqual(
            applyEdits(initial, edits),
            Buffer.from(history.source),
          );
          const fresh = parse(grammar.scope, history.source);
          assertIncrementalContract(
            fresh,
            parse(grammar.scope, initial, edits),
            `${label}: ${history.source}`,
          );
          if (history.source === complete) {
            assert.equal(fresh.status, 0, fresh.stdout + fresh.stderr);
            assert.deepEqual(issueSignatures(fresh.nodes), [], label);
            assertNoNodes(fresh.nodes, "ERROR", "MISSING");
            if (!closingMarker) {
              assert.deepEqual(
                syntaxSignatures(fresh.nodes, ["coll_elem_multi"]),
                ["element: coll_elem_multi [0, 5] - [0, 7]"],
                label,
              );
            }
          }
        }
      }
    }
  }
});

test("invalid class prefixes exclude a pending closing marker from their malformed name", () => {
  const source = "s/[[:al pha:";
  for (const grammar of grammars) {
    const result = parseSuccessfully(grammar.scope, source);
    assert.deepEqual(
      issueSignatures(result.nodes).filter(({ reason }) =>
        ["malformed_bracket_term", "incomplete_bracket_term"].includes(reason),
      ),
      [
        {
          outcome: "undefined_syntax",
          reason: "malformed_bracket_term",
          range: "[0, 5] - [0, 11]",
        },
        {
          outcome: "incomplete_syntax",
          reason: "incomplete_bracket_term",
          range: "[0, 12] - [0, 12]",
        },
      ],
      grammar.name,
    );
    assert.deepEqual(
      syntaxSignatures(result.nodes, ["malformed_bracket_term", "class_name"]),
      ["malformed_bracket_term [0, 5] - [0, 11]"],
      grammar.name,
    );
    assert.deepEqual(
      directDelimiterLeafLines(result.nodes, "character_class"),
      ['0:3 - 0:4 "["', '0:4 - 0:5 ":"', '0:11 - 0:12 ":"'],
      grammar.name,
    );
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
    const result = parseSuccessfully(grammar.scope, source);
    assert.deepEqual(
      issueSignatures(result.nodes).filter(
        ({ reason }) => reason === "malformed_bracket_term",
      ),
      expectedIssues,
      `empty bracket term issues in ${grammar.name}`,
    );

    for (const [type, leaves] of Object.entries(expectedLeaves)) {
      assert.deepEqual(
        directDelimiterLeafLines(result.nodes, type),
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
      separator: "separator: address_separator [0, 1] - [0, 2]",
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
      separator: "separator: address_separator [0, 0] - [0, 1]",
    },
  ];
  for (const testCase of cases) {
    const result = parseSuccessfully("source.sed", testCase.source);
    assert.deepEqual(issueSignatures(result.nodes), testCase.issues);
    assert.deepEqual(
      syntaxSignatures(result.nodes, ["address_separator"]),
      [testCase.separator],
      `the separator must end at its token\n${result.stdout}`,
    );
  }
});

test("ownership: empty commands own their blanks and end before their separator", () => {
  const result = parseSuccessfully("source.sed", "  ;;  ;p\np; \n \n");
  assert.deepEqual(
    syntaxSignatures(result.nodes, ["empty_command"]),
    [
      "empty_command [0, 0] - [0, 2]",
      "empty_command [0, 3] - [0, 3]",
      "empty_command [0, 4] - [0, 6]",
      "empty_command [1, 2] - [1, 3]",
      "empty_command [2, 0] - [2, 1]",
    ],
    result.stdout,
  );
  assert.ok(
    syntaxSignatures(result.nodes, ["editing_command"]).includes(
      "editing_command [1, 0] - [1, 1]",
    ),
    `the command before the separator must not own the blank\n${result.stdout}`,
  );
});

test("ownership: unterminated blanks and separators before a closing brace form no empty command", () => {
  for (const source of ["p;", " ", "p; ", "{p;}", "{p; }\n", "{}"]) {
    const result = parseSuccessfully("source.sed", source);
    assertNoNodes(result.nodes, "empty_command", "ERROR", "MISSING");
  }
});

test("ownership: leading blanks stay inside a command that omits its first address", () => {
  const cases = [
    { source: " ,p\n", command: "editing_command [0, 0] - [0, 3]" },
    { source: "\t,2p\n", command: "editing_command [0, 0] - [0, 4]" },
    { source: "{\n ,p\n}\n", command: "  editing_command [1, 0] - [1, 3]" },
  ];
  for (const testCase of cases) {
    const result = parseSuccessfully("source.sed", testCase.source);
    assert.deepEqual(
      result.nodes[0].start,
      [0, 0],
      `the script must own the leading blank\n${result.stdout}`,
    );
    assert.ok(
      syntaxSignatures(result.nodes, ["editing_command"]).includes(
        testCase.command,
      ),
      `the editing command must own its leading blank\n${result.stdout}`,
    );
  }
});

const identifiedIssueLeafCases = [
  {
    name: "special regular expression delimiter escape",
    source: "s.\\..x.",
    outcome: "unspecified_syntax",
    reason: "special_delimiter_escape",
    child: "escaped_delimiter",
    ranges: ["[0, 2] - [0, 4]"],
    repaired: "s.a.x.",
    damage: ["2 1 \\."],
    repair: ["2 2 a"],
  },
  {
    name: "replacement ampersand delimiter escape",
    source: "s&a&\\&&",
    outcome: "unspecified_syntax",
    reason: "replacement_ampersand_delimiter_escape",
    child: "replacement_escaped_delimiter",
    ranges: ["[0, 4] - [0, 6]"],
    repaired: "s&a&a&",
    damage: ["4 1 \\&"],
    repair: ["4 2 a"],
  },
  {
    name: "equivalence class meta characters",
    source: "/[[=-=]][[=]=]]/p\n",
    outcome: "undefined_syntax",
    reason: "malformed_bracket_term",
    child: "meta_char",
    ranges: ["[0, 4] - [0, 5]", "[0, 11] - [0, 12]"],
    repaired: "/[[.-.]][[.].]]/p\n",
    damage: ["3 1 =", "5 1 =", "10 1 =", "12 1 ="],
    repair: ["3 1 .", "5 1 .", "10 1 .", "12 1 ."],
  },
  {
    name: "shared range endpoint operator",
    source: "/[a-b-c]/p\n",
    outcome: "undefined_syntax",
    reason: "shared_range_endpoint",
    child: "range_operator",
    ranges: ["[0, 5] - [0, 6]"],
    repaired: "/[a-bc]/p\n",
    damage: ["5 0 -"],
    repair: ["5 1 "],
  },
];

for (const grammar of grammars) {
  for (const testCase of identifiedIssueLeafCases) {
    test(`ownership: ${testCase.name} retains its source leaf in ${grammar.name}`, () => {
      const result = parseSuccessfully(grammar.scope, testCase.source);
      assert.deepEqual(
        issueSignatures(result.nodes),
        testCase.ranges.map((range) => ({
          outcome: testCase.outcome,
          reason: testCase.reason,
          range,
        })),
      );
      const reasons = result.nodes.flatMap(({ kind }, index) =>
        kind === testCase.reason ? [index] : [],
      );
      for (const [index, reason] of reasons.entries()) {
        const range = testCase.ranges[index];
        assert.deepEqual(syntaxSignatures(result.nodes, undefined, reason), [
          `${testCase.reason} ${range}`,
          `  ${testCase.child} ${range}`,
        ]);
      }
      assertNoNodes(result.nodes, "ERROR", "MISSING");
      assertIncrementalContract(
        result,
        parse(grammar.scope, testCase.repaired, testCase.damage),
        testCase.name,
      );
      const repaired = parseSuccessfully(grammar.scope, testCase.repaired);
      assertNoNodes(repaired.nodes, "syntax_issue", "ERROR", "MISSING");
      assertIncrementalContract(
        repaired,
        parse(grammar.scope, testCase.source, testCase.repair),
        `${testCase.name}: repair`,
      );
    });
  }
}

test("ownership: duplicated negation operator lives inside its issue", () => {
  const result = parseSuccessfully("source.sed", "!!p\n");
  const negation = result.nodes.findIndex(({ kind }) => kind === "negation");
  assert.notEqual(negation, -1);
  assert.equal(
    result.nodes[result.nodes[negation].parent].kind,
    "editing_command",
  );
  assert.deepEqual(
    syntaxSignatures(result.nodes, undefined, negation),
    [
      "negation: negation [0, 0] - [0, 2]",
      "  operator: negation_operator [0, 0] - [0, 1]",
      "  issue: syntax_issue [0, 1] - [0, 2]",
      "    nonconforming_syntax [0, 1] - [0, 2]",
      "      duplicate_negation [0, 1] - [0, 2]",
      "        operator: negation_operator [0, 1] - [0, 2]",
    ],
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
      child: "back_close_parenthesis",
    },
  ];
  for (const testCase of cases) {
    const result = parseSuccessfully("source.sed", testCase.source);
    assert.deepEqual(issueSignatures(result.nodes), [
      {
        outcome: "undefined_syntax",
        reason: testCase.reason,
        range: "[0, 1] - [0, 3]",
      },
    ]);
    const issue = result.nodes.findIndex(({ kind }) => kind === "syntax_issue");
    assert.notEqual(issue, -1);
    assert.deepEqual(
      syntaxSignatures(result.nodes, undefined, issue),
      [
        "issue: syntax_issue [0, 1] - [0, 3]",
        "  undefined_syntax [0, 1] - [0, 3]",
        `    ${testCase.reason} [0, 1] - [0, 3]`,
        `      ${testCase.child} [0, 1] - [0, 3]`,
      ],
      `the issue must own the unmatched closer\n${result.stdout}`,
    );
    assert.equal(
      result.nodes.filter(({ kind }) => kind === testCase.child).length,
      1,
      `the source child must appear exactly once\n${result.stdout}`,
    );
    assertNoNodes(result.nodes, "ERROR", "MISSING");
  }
});

test("schema: unmatched BRE closer reasons require their source child", () => {
  const cases = [
    ["unmatched_interval_close", "back_close_brace"],
    ["unmatched_subexpression_close", "back_close_parenthesis"],
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
        const result = parseSuccessfully(grammar.scope, commandSource);
        return {
          start,
          nodes: topLevelEditingCommands(result.nodes)[0].nodes,
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
        );
        assert.deepEqual(issuePaths(result.nodes), testCase.issues);
        const commands = topLevelEditingCommands(result.nodes);
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
    const fresh = parseSuccessfully(testCase.scope, testCase.source);
    if (testCase.issues !== undefined) {
      assert.deepEqual(issueSignatures(fresh.nodes), testCase.issues);
    }
    const retainedTypes = testCase.syntax?.map(
      (line) => /^ *([a-z_]+: )?([a-z_]+) \[/.exec(line)[2],
    );
    if (retainedTypes !== undefined) {
      assert.deepEqual(
        syntaxSignatures(fresh.nodes, retainedTypes),
        testCase.syntax,
      );
    }
    for (const history of testCase.histories) {
      assert.deepEqual(
        applyEdits(history.source, history.edits),
        Buffer.from(testCase.source),
      );
      const incremental = parse(testCase.scope, history.source, history.edits);
      assertIncrementalContract(
        fresh,
        incremental,
        `${testCase.scope}: ${testCase.name}`,
      );
      if (retainedTypes !== undefined) {
        assert.deepEqual(
          syntaxSignatures(incremental.nodes, retainedTypes),
          testCase.syntax,
        );
      }
      if (testCase.delimiterOwner !== undefined) {
        assert.equal(
          incremental.status,
          0,
          incremental.stdout + incremental.stderr,
        );
        assert.deepEqual(
          directDelimiterLeafLines(incremental.nodes, testCase.delimiterOwner),
          directDelimiterLeafLines(fresh.nodes, testCase.delimiterOwner),
          `${testCase.scope}: ${testCase.name}: fresh and incremental delimiter leaves differ`,
        );
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
const insertions = "psdxq!{};,\n\\/*[]().^$|+?-:=# \tabw12";

test("incremental: fixed-seed generated histories converge", () => {
  let seed = 1n;
  function next(maximum) {
    seed = BigInt.asUintN(64, seed * 6364136223846793005n + 1n);
    return Number(seed >> 32n) % maximum;
  }
  for (const grammar of grammars) {
    for (let iteration = 0; iteration < 100; iteration++) {
      const lines = [];
      const count = 1 + next(3);
      for (let line = 0; line < count; line++)
        lines.push(fragments[next(fragments.length)]);
      const initial = `${lines.join("\n")}\n`;
      let source = Buffer.from(initial);
      const edits = [];
      for (let step = 0; step < 5; step++) {
        const position = next(source.length + 1);
        const insert = next(2) === 0 || position === source.length;
        const edit = insert
          ? `${position} 0 ${insertions[next(insertions.length)]}`
          : `${position} ${Math.min(next(2) + 1, source.length - position)} `;
        edits.push(edit);
        source = applyEdits(source, [edit]);
        const fresh = parse(grammar.scope, source);
        const incremental = parse(grammar.scope, initial, edits);
        assertIncrementalContract(
          fresh,
          incremental,
          `seed 1, ${grammar.name}, iteration ${iteration}, source ${JSON.stringify(initial)}, edits ${JSON.stringify(edits)}`,
        );
      }
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
        const invalidReason =
          byte === 0
            ? "invalid_regular_expression_character"
            : "invalid_encoding";
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
            reason: invalidReason,
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
        const fresh = parse(grammar.scope, source);
        const incremental = parse(grammar.scope, source, edits);
        const label = `${testCase.name}, byte ${byte}`;
        assertIncrementalContract(fresh, incremental, label);
        const retained = [
          `minimum: dup_count ${range(start - 2, start - 1)}`,
          `malformed_interval ${range(start, start + testCase.length)}`,
          ...expected
            .filter(({ reason }) => reason === invalidReason)
            .map(({ range }) => `  ${invalidReason} ${range}`),
        ];
        for (const result of [fresh, incremental]) {
          assert.deepEqual(issueSignatures(result.nodes), expected, label);
          assert.deepEqual(
            syntaxSignatures(result.nodes, [
              "dup_count",
              "malformed_interval",
              invalidReason,
            ]),
            retained,
            label,
          );
        }
      }
    }
  });

  test(`character class names: invalid spellings own their source in ${grammar.name}`, () => {
    for (const name of ["1", "1alpha", "a-b", "a_b", " a ", "α", "a:b"]) {
      const source = `s/[[:${name}:]]/x/\n`;
      const result = parseSuccessfully(grammar.scope, source);
      const range = `[0, 5] - [0, ${5 + Buffer.byteLength(name)}]`;
      assert.deepEqual(
        issueSignatures(result.nodes),
        [
          {
            outcome: "undefined_syntax",
            reason: "malformed_bracket_term",
            range,
          },
        ],
        source,
      );
      const reason = result.nodes.findIndex(
        ({ kind }) => kind === "malformed_bracket_term",
      );
      assert.notEqual(reason, -1);
      assert.deepEqual(syntaxSignatures(result.nodes, undefined, reason), [
        `malformed_bracket_term ${range}`,
      ]);
      assertNoNodes(result.nodes, "class_name", "ERROR", "MISSING");
      const history = `s/[[:Alpha:]]/x/\n`;
      const edits = [`5 5 ${name}`];
      assertIncrementalContract(
        result,
        parse(grammar.scope, history, edits),
        source,
      );
      const repaired = parseSuccessfully(grammar.scope, history);
      assertNoNodes(repaired.nodes, "syntax_issue", "ERROR", "MISSING");
      assert.deepEqual(syntaxSignatures(repaired.nodes, ["class_name"]), [
        "name: class_name [0, 5] - [0, 10]",
      ]);
      assertIncrementalContract(
        repaired,
        parse(grammar.scope, source, [`5 ${Buffer.byteLength(name)} Alpha`]),
        `${source}: repair`,
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
      const result = parseSuccessfully(grammar.scope, source);
      assertNoNodes(result.nodes, "syntax_issue", "ERROR", "MISSING");
      assert.deepEqual(syntaxSignatures(result.nodes, ["class_name"]), [
        `name: class_name [0, 5] - [0, ${5 + name.length}]`,
      ]);
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
      {
        name: "class name middle",
        prefix: "/[[:a",
        suffix: "1:]]/p\n",
        classNames: ["name: class_name [0, 4] - [0, 5]"],
        repairedClassNameRange: "[0, 4] - [0, 7]",
      },
      {
        name: "class name start",
        prefix: "/[[:",
        suffix: "1:]]/p\n",
        classNames: [],
        repairedClassNameRange: "[0, 4] - [0, 6]",
      },
      {
        name: "escaped repetition operand",
        prefix: "/\\",
        suffix: "*/p\n",
        repair: "*",
        quotedCharacterRange: "[0, 1] - [0, 3]",
      },
      {
        name: "escaped grouped character",
        prefix: grammar.name === "sed" ? "/\\(\\" : "/(\\",
        suffix: grammar.name === "sed" ? "\\)/p\n" : ")/p\n",
        repair: "*",
        quotedCharacterRange:
          grammar.name === "sed" ? "[0, 3] - [0, 5]" : "[0, 2] - [0, 4]",
      },
    ];
    for (const invalid of invalidValues) {
      for (const context of contexts) {
        const prefix = Buffer.from(context.prefix);
        const suffix = Buffer.from(context.suffix);
        const source = Buffer.concat([prefix, invalid.bytes, suffix]);
        const label = `${invalid.name}: ${context.name}`;
        const result = parseSuccessfully(grammar.scope, source);
        const expectedIssues = [...invalid.bytes].map((_, index) => ({
          outcome: "invalid_syntax",
          reason:
            invalid.name === "NUL"
              ? "invalid_regular_expression_character"
              : "invalid_encoding",
          range: `[0, ${prefix.length + index}] - [0, ${prefix.length + index + 1}]`,
        }));
        if (context.classNames !== undefined) {
          const digit = prefix.length + invalid.bytes.length;
          expectedIssues.push({
            outcome: "undefined_syntax",
            reason: "malformed_bracket_term",
            range: `[0, ${digit}] - [0, ${digit + 1}]`,
          });
          assert.deepEqual(
            syntaxSignatures(result.nodes, ["class_name"]),
            context.classNames,
            label,
          );
        }
        assert.deepEqual(issueSignatures(result.nodes), expectedIssues, label);
        assertNoNodes(
          result.nodes,
          "invalid_character_token",
          "quoted_character",
          "ERROR",
          "MISSING",
        );
        const history = Buffer.concat([
          prefix,
          Buffer.from("q"),
          invalid.bytes,
          suffix,
        ]);
        const edits = [`${prefix.length} 1 `];
        assertIncrementalContract(
          result,
          parse(grammar.scope, history, edits),
          label,
        );
        const repair = context.repair ?? "a";
        const repaired = Buffer.concat([prefix, Buffer.from(repair), suffix]);
        const fresh = parseSuccessfully(grammar.scope, repaired);
        assertNoNodes(fresh.nodes, "syntax_issue", "ERROR", "MISSING");
        if (context.repairedClassNameRange !== undefined) {
          assert.deepEqual(
            syntaxSignatures(fresh.nodes, ["class_name"]),
            [`name: class_name ${context.repairedClassNameRange}`],
            `${label}: repaired class name`,
          );
        }
        if (context.quotedCharacterRange !== undefined) {
          assert.deepEqual(
            syntaxSignatures(fresh.nodes, ["quoted_character"]),
            [`quoted_character ${context.quotedCharacterRange}`],
            `${label}: repaired quoted character range`,
          );
          const quoted = fresh.nodes.findIndex(
            ({ kind }) => kind === "quoted_character",
          );
          assert.equal(
            subtree(fresh.nodes, quoted).length,
            1,
            `${label}: repaired quoted character must be a leaf`,
          );
        }
        assertIncrementalContract(
          fresh,
          parse(grammar.scope, source, [
            `${prefix.length} ${invalid.bytes.length} ${repair}`,
          ]),
          `${label}: repair`,
        );
      }
    }
  });
}

const nulPayloadCases = [
  {
    name: "leading replacement NUL",
    source: "s/a/\0bc/\nq\n",
    nulRanges: ["[0, 4] - [0, 5]"],
    types: ["replacement", "replacement_literal", "nul_character"],
    structure: [
      "replacement: replacement [0, 4] - [0, 7]",
      "  nul_character [0, 4] - [0, 5]",
      "  replacement_literal [0, 5] - [0, 7]",
    ],
  },
  {
    name: "consecutive replacement NULs between literals",
    source: "s/a/a\0\0b/\nq\n",
    nulRanges: ["[0, 5] - [0, 6]", "[0, 6] - [0, 7]"],
    types: ["replacement", "replacement_literal", "nul_character"],
    structure: [
      "replacement: replacement [0, 4] - [0, 8]",
      "  replacement_literal [0, 4] - [0, 5]",
      "  nul_character [0, 5] - [0, 6]",
      "  nul_character [0, 6] - [0, 7]",
      "  replacement_literal [0, 7] - [0, 8]",
    ],
  },
  {
    name: "trailing replacement NUL",
    source: "s/a/ab\0/\nq\n",
    nulRanges: ["[0, 6] - [0, 7]"],
    types: ["replacement", "replacement_literal", "nul_character"],
    structure: [
      "replacement: replacement [0, 4] - [0, 7]",
      "  replacement_literal [0, 4] - [0, 6]",
      "  nul_character [0, 6] - [0, 7]",
    ],
  },
  {
    name: "leading translation source NUL",
    source: "y/\0ab/xy/\nq\n",
    nulRanges: ["[0, 2] - [0, 3]"],
    types: ["translation_string", "translation_literal", "nul_character"],
    structure: [
      "string1: translation_string [0, 2] - [0, 5]",
      "  nul_character [0, 2] - [0, 3]",
      "  translation_literal [0, 3] - [0, 5]",
      "string2: translation_string [0, 6] - [0, 8]",
      "  translation_literal [0, 6] - [0, 8]",
    ],
  },
  {
    name: "trailing translation destination NUL",
    source: "y/ab/xy\0/\nq\n",
    nulRanges: ["[0, 7] - [0, 8]"],
    types: ["translation_string", "translation_literal", "nul_character"],
    structure: [
      "string1: translation_string [0, 2] - [0, 4]",
      "  translation_literal [0, 2] - [0, 4]",
      "string2: translation_string [0, 5] - [0, 8]",
      "  translation_literal [0, 5] - [0, 7]",
      "  nul_character [0, 7] - [0, 8]",
    ],
  },
  {
    name: "NUL as the only text character",
    source: "a\\\n\0\nq\n",
    nulRanges: ["[1, 0] - [1, 1]"],
    types: ["text", "text_literal", "nul_character"],
    structure: [
      "text: text [1, 0] - [1, 1]",
      "  nul_character [1, 0] - [1, 1]",
    ],
  },
  {
    name: "NULs on both sides of a continued text line",
    source: "a\\\n\0a\\\nb\0\nq\n",
    nulRanges: ["[1, 0] - [1, 1]", "[2, 1] - [2, 2]"],
    types: ["text", "text_literal", "text_escaped_newline", "nul_character"],
    structure: [
      "text: text [1, 0] - [2, 2]",
      "  nul_character [1, 0] - [1, 1]",
      "  text_literal [1, 1] - [1, 2]",
      "  text_escaped_newline [1, 2] - [2, 0]",
      "  text_literal [2, 0] - [2, 1]",
      "  nul_character [2, 1] - [2, 2]",
    ],
  },
  {
    name: "label definition keeps one owner around NUL",
    source: ":a\0b\nq\n",
    nulRanges: ["[0, 2] - [0, 3]"],
    types: ["label", "nul_character"],
    structure: [
      "label: label [0, 1] - [0, 4]",
      "  nul_character [0, 2] - [0, 3]",
    ],
  },
  {
    name: "branch label begins with NUL",
    source: "b \0ab\nq\n",
    nulRanges: ["[0, 2] - [0, 3]"],
    types: ["label", "nul_character"],
    structure: [
      "label: label [0, 2] - [0, 5]",
      "  nul_character [0, 2] - [0, 3]",
    ],
  },
  {
    name: "test label ends with NUL",
    source: "t ab\0\nq\n",
    nulRanges: ["[0, 4] - [0, 5]"],
    types: ["label", "nul_character"],
    structure: [
      "label: label [0, 2] - [0, 5]",
      "  nul_character [0, 4] - [0, 5]",
    ],
  },
  {
    name: "read file keeps whitespace and semicolon after NUL",
    source: "r \0 a;\0\nq\n",
    nulRanges: ["[0, 2] - [0, 3]", "[0, 6] - [0, 7]"],
    types: ["rfile", "nul_character"],
    structure: [
      "rfile: rfile [0, 2] - [0, 7]",
      "  nul_character [0, 2] - [0, 3]",
      "  nul_character [0, 6] - [0, 7]",
    ],
  },
  {
    name: "write file keeps its semicolon after NUL",
    source: "w a\0;b\nq\n",
    nulRanges: ["[0, 3] - [0, 4]"],
    types: ["wfile", "nul_character"],
    structure: [
      "wfile: wfile [0, 2] - [0, 6]",
      "  nul_character [0, 3] - [0, 4]",
    ],
  },
  {
    name: "substitution write file ends before its semicolon",
    source: "s/a/b/w \0 a;q\n",
    nulRanges: ["[0, 8] - [0, 9]"],
    types: ["wfile", "nul_character"],
    structure: [
      "wfile: wfile [0, 8] - [0, 11]",
      "  nul_character [0, 8] - [0, 9]",
    ],
  },
  {
    name: "ordinary comment text splits around NUL",
    source: "#a\0b\nq\n",
    nulRanges: ["[0, 2] - [0, 3]"],
    types: ["comment", "comment_text", "nul_character"],
    structure: [
      "comment: comment [0, 1] - [0, 4]",
      "  comment_text [0, 1] - [0, 2]",
      "  nul_character [0, 2] - [0, 3]",
      "  comment_text [0, 3] - [0, 4]",
    ],
  },
  {
    name: "default-output directive keeps its NUL-containing tail",
    source: "#n\0a\0\nq\n",
    nulRanges: ["[0, 2] - [0, 3]", "[0, 4] - [0, 5]"],
    types: [
      "default_output_suppression",
      "comment",
      "comment_text",
      "nul_character",
    ],
    structure: [
      "comment: comment [0, 1] - [0, 5]",
      "  suppression: default_output_suppression [0, 1] - [0, 2]",
      "  nul_character [0, 2] - [0, 3]",
      "  comment_text [0, 3] - [0, 4]",
      "  nul_character [0, 4] - [0, 5]",
    ],
  },
  {
    name: "replacement escape retains its nested NUL issue",
    source: "s/a/\\\0/\nq\n",
    nulRanges: ["[0, 5] - [0, 6]"],
    outerIssue: {
      outcome: "unspecified_syntax",
      reason: "unspecified_replacement_escape",
      range: "[0, 4] - [0, 6]",
    },
    repair: "\\",
    types: ["replacement", "unspecified_replacement_escape", "nul_character"],
    structure: [
      "replacement: replacement [0, 4] - [0, 6]",
      "  unspecified_replacement_escape [0, 4] - [0, 6]",
      "    nul_character [0, 5] - [0, 6]",
    ],
  },
  {
    name: "translation escape retains its nested NUL issue",
    source: "y/\\\0/x/\nq\n",
    nulRanges: ["[0, 3] - [0, 4]"],
    outerIssue: {
      outcome: "undefined_syntax",
      reason: "undefined_translation_escape",
      range: "[0, 2] - [0, 4]",
    },
    repair: "\\",
    types: [
      "translation_string",
      "undefined_translation_escape",
      "nul_character",
    ],
    structure: [
      "string1: translation_string [0, 2] - [0, 4]",
      "  undefined_translation_escape [0, 2] - [0, 4]",
      "    nul_character [0, 3] - [0, 4]",
      "string2: translation_string [0, 5] - [0, 6]",
    ],
  },
  {
    name: "text escape retains its nested NUL issue",
    source: "a\\\n\\\0\nq\n",
    nulRanges: ["[1, 1] - [1, 2]"],
    outerIssue: {
      outcome: "unspecified_syntax",
      reason: "unspecified_text_escape",
      range: "[1, 0] - [1, 2]",
    },
    repair: "\\",
    types: ["text", "unspecified_text_escape", "nul_character"],
    structure: [
      "text: text [1, 0] - [1, 2]",
      "  unspecified_text_escape [1, 0] - [1, 2]",
      "    nul_character [1, 1] - [1, 2]",
    ],
  },
];

for (const grammar of grammars) {
  test(`NUL payloads preserve issues, owners, and following commands in ${grammar.name}`, () => {
    const isolatedQuit = topLevelEditingCommands(
      parseSuccessfully(grammar.scope, "q\n").nodes,
    )[0].nodes;
    for (const testCase of nulPayloadCases) {
      const expectedIssues = [
        ...(testCase.outerIssue === undefined ? [] : [testCase.outerIssue]),
        ...testCase.nulRanges.map((range) => ({
          outcome: "nonconforming_syntax",
          reason: "nul_character",
          range,
        })),
      ];
      const firstNul = testCase.source.indexOf("\0");
      const history = `${testCase.source.slice(0, firstNul)}x${testCase.source.slice(firstNul)}`;
      const edits = [`${firstNul} 1 `];
      assert.deepEqual(
        applyEdits(history, edits),
        Buffer.from(testCase.source),
      );
      const fresh = parseSuccessfully(grammar.scope, testCase.source);
      const incremental = parseSuccessfully(grammar.scope, history, edits);
      assertIncrementalContract(fresh, incremental, testCase.name);
      for (const result of [fresh, incremental]) {
        assert.deepEqual(
          issueSignatures(result.nodes),
          expectedIssues,
          testCase.name,
        );
        assert.deepEqual(
          syntaxSignatures(result.nodes, testCase.types),
          testCase.structure,
          testCase.name,
        );
        assertNoNodes(result.nodes, "ERROR", "MISSING");
        const commands = topLevelEditingCommands(result.nodes);
        assert.deepEqual(commands.at(-1).nodes, isolatedQuit, testCase.name);
      }
      const repair = testCase.repair ?? "a";
      const repaired = testCase.source.replaceAll("\0", repair);
      const repairs = [];
      for (let index = testCase.source.length - 1; index >= 0; index--) {
        if (testCase.source[index] === "\0") {
          repairs.push(`${index} 1 ${repair}`);
        }
      }
      assert.deepEqual(
        applyEdits(testCase.source, repairs),
        Buffer.from(repaired),
      );
      const repairedFresh = parseSuccessfully(grammar.scope, repaired);
      assertNoNodes(repairedFresh.nodes, "syntax_issue", "ERROR", "MISSING");
      assertIncrementalContract(
        repairedFresh,
        parse(grammar.scope, testCase.source, repairs),
        `${testCase.name}: repair`,
      );
    }
  });
}

for (const grammar of grammars) {
  test(`partial commands retain prefixes without invented functions in ${grammar.name}`, () => {
    for (const [source, outcome, position] of [
      ["1", "incomplete_syntax/missing_function", 1],
      ["1\n", "nonconforming_syntax/missing_function", 1],
      ["!", "incomplete_syntax/missing_function", 1],
      ["1!", "incomplete_syntax/missing_function", 2],
      ["Z", "nonconforming_syntax/unknown_function", 0],
      ["1Z", "nonconforming_syntax/unknown_function", 1],
    ]) {
      const fresh = parseSuccessfully(grammar.scope, source);
      const [classification, reason] = outcome.split("/");
      const end = position + Number(source[position] === "Z");
      assert.deepEqual(issueSignatures(fresh.nodes), [
        {
          outcome: classification,
          reason,
          range: `[0, ${position}] - [0, ${end}]`,
        },
      ]);
      const nodes = publicNodes(fresh.nodes);
      assert.ok(
        nodes.some(({ kind }) => kind === "editing_command"),
        source,
      );
      assert.ok(
        !nodes.some(
          ({ kind, field }) =>
            kind === "function" ||
            kind === "function_verb" ||
            field === "function",
        ),
        source,
      );
      if (source.startsWith("1")) {
        for (const kind of ["address_clause", "line_number_address"])
          assert.ok(
            nodes.some((node) => node.kind === kind),
            source,
          );
      }
      if (source.includes("!"))
        assert.ok(
          nodes.some(({ kind }) => kind === "negation"),
          source,
        );
      const boundary =
        source.indexOf("\n") < 0 ? source.length : source.indexOf("\n");
      const complete = source.includes("Z")
        ? source.replace("Z", "p")
        : `${source.slice(0, boundary)}p${source.slice(boundary)}`;
      const edits = source.includes("Z")
        ? [`${boundary - 1} 1 Z`]
        : [`${boundary} 1 `];
      const incremental = parseSuccessfully(grammar.scope, complete, edits);
      assertIncrementalContract(fresh, incremental, source);
    }
  });

  test(`lexical classes are direct leaves with exact ranges in ${grammar.name}`, () => {
    const cases = [
      [
        "s/a/b/\n",
        "delimiter",
        [
          [0, 1, 0, 2],
          [0, 3, 0, 4],
          [0, 5, 0, 6],
        ],
      ],
      ["1,2p\n", "address_separator", [[0, 1, 0, 2]]],
      ["{p;}\n", "closing_brace", [[0, 3, 0, 4]]],
      ["a\\\nx\n", "text_introducer", [[0, 1, 1, 0]]],
      ["/[a]/p\n", "close_bracket", [[0, 3, 0, 4]]],
      ["/[a]/p\n", "collating_element", [[0, 2, 0, 3]]],
      ["/a\\./p\n", "quoted_character", [[0, 2, 0, 4]]],
      grammar.name === "sed"
        ? ["/\\(a\\)/p\n", "back_close_parenthesis", [[0, 4, 0, 6]]]
        : ["/(a)/p\n", "close_parenthesis", [[0, 3, 0, 4]]],
    ];
    for (const [source, kind, expected] of cases) {
      const result = parseSuccessfully(grammar.scope, source);
      const nodes = publicNodes(result.nodes);
      assert.deepEqual(
        nodes
          .filter((node) => node.kind === kind)
          .map(({ start, end }) => [...start, ...end]),
        expected,
        kind,
      );
      for (const [index, node] of nodes.entries()) {
        if (node.kind === kind)
          assert.ok(
            !nodes.some(({ parent }) => parent === index),
            `${kind} must be a leaf`,
          );
      }
    }
  });

  test(`missing components attach issues to confirmed owners in ${grammar.name}`, () => {
    for (const [source, owner, reason, forbidden] of [
      ["s", "substitute_function", "missing_opening_delimiter", "delimiter"],
      ["s/a/b", "substitute_function", "incomplete_replacement", "delimiter"],
      ["{p\n", "block_function", "missing_closing_brace", "closing_brace"],
      [
        "a\\",
        "append_function",
        "incomplete_text_introducer",
        "text_introducer",
      ],
      [
        "/[a",
        "bracket_expression",
        "unclosed_bracket_expression",
        "close_bracket",
      ],
    ]) {
      const result = parseSuccessfully(grammar.scope, source);
      const nodes = publicNodes(result.nodes);
      const reasonNode = nodes.find(({ kind }) => kind === reason);
      assert.ok(reasonNode, source);
      const issue = nodes[nodes[reasonNode.parent].parent];
      assert.equal(issue.kind, "syntax_issue");
      assert.equal(nodes[issue.parent].kind, owner);
      assert.equal(issue.field, "issue");
      assert.ok(
        !nodes.some(
          (node) =>
            node.kind === forbidden &&
            node.startByte === issue.startByte &&
            node.endByte === issue.endByte,
        ),
        source,
      );
    }
    for (const source of ["/[", "/[^"]) {
      const result = parseSuccessfully(grammar.scope, source);
      const nodes = publicNodes(result.nodes);
      assert.ok(!nodes.some(({ kind }) => kind === "matching_list"), source);
      assert.equal(
        nodes.filter(({ kind }) => kind === "nonmatching_list").length,
        Number(source.endsWith("^")),
        source,
      );
    }
  });
}

test("empty ERE alternatives do not invent branches or operand fields", () => {
  for (const [source, count] of [
    ["/|a/p\n", 1],
    ["/a|/p\n", 1],
    ["/|/p\n", 0],
    ["/(|)/p\n", 1],
    ["/(a|", 2],
  ]) {
    const result = parseSuccessfully("source.sed.ere", source);
    const nodes = publicNodes(result.nodes);
    const branches = nodes.filter(({ kind }) => kind === "ere_branch");
    assert.equal(branches.length, count, source);
    assert.ok(
      branches.every(({ startByte, endByte }) => endByte > startByte),
      source,
    );
    for (const reason of nodes.filter(({ kind }) =>
      ["empty_alternative", "incomplete_alternative"].includes(kind),
    )) {
      const issue = nodes[nodes[reason.parent].parent];
      assert.equal(issue.field, "issue");
      assert.equal(nodes[issue.parent].kind, "extended_reg_exp");
    }
  }
});

test("BRE dollar classification tracks every byte of multibyte lookahead", () => {
  for (const [delimiter, alternative] of [
    ["é", "è"],
    ["あ", "ぃ"],
    ["😀", "😁"],
  ]) {
    const width = Buffer.byteLength(delimiter);
    const dollarStart = 1 + width;
    const edits = [`${2 * width + 1} ${width} `];
    for (const [source, expected, beforeKind, afterKind] of [
      [
        `s${delimiter}$${alternative}${delimiter}x${delimiter}\n`,
        `s${delimiter}$${delimiter}x${delimiter}\n`,
        "ordinary_character",
        "right_anchor",
      ],
      [
        `s${delimiter}$${delimiter}${alternative}${delimiter}x${delimiter}\n`,
        `s${delimiter}$${alternative}${delimiter}x${delimiter}\n`,
        "right_anchor",
        "ordinary_character",
      ],
    ]) {
      const context = `${width}-byte lookahead: ${beforeKind} to ${afterKind}`;
      assert.deepEqual(
        applyEdits(source, edits),
        Buffer.from(expected),
        context,
      );
      const original = parseSuccessfully("source.sed", source);
      const fresh = parseSuccessfully("source.sed", expected);
      const incremental = parseSuccessfully("source.sed", source, edits);
      assertIncrementalContract(fresh, incremental, context);
      for (const [result, kind] of [
        [original, beforeKind],
        [fresh, afterKind],
        [incremental, afterKind],
      ]) {
        assert.deepEqual(
          publicNodes(result.nodes)
            .filter(
              (node) =>
                ["ordinary_character", "right_anchor"].includes(node.kind) &&
                node.startByte === dollarStart,
            )
            .map((node) => ({
              kind: node.kind,
              startByte: node.startByte,
              endByte: node.endByte,
              start: node.start,
              end: node.end,
            })),
          [
            {
              kind,
              startByte: dollarStart,
              endByte: dollarStart + 1,
              start: [0, dollarStart],
              end: [0, dollarStart + 1],
            },
          ],
          context,
        );
      }
    }
  }
});
