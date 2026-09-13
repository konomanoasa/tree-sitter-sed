import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { grammars, root } from "../scripts/tree-sitter.js";
import {
  applyEdits,
  assertIncrementalContract,
  assertNoNodes,
  directDelimiterLeafLines,
  issuePaths,
  issueSignatures,
  nodeRange,
  parse,
  parseSuccessfully,
  parseSummary,
  publicNodes,
  subtree,
  syntaxSignatures,
  topLevelEditingCommands,
} from "./support/parser.js";

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
  test(`${grammar.name}: CST reader retains Unicode line separators in ordinary and issue leaves`, () => {
    const cases = [
      ["/\u2028/p\n", "ordinary_character", 1, "\u2028"],
      ["/\u2029/p\n", "ordinary_character", 1, "\u2029"],
      [
        grammar.name === "sed" ? "/a\\{\u2028/p\n" : "/a{\u2028/p\n",
        "malformed_interval",
        grammar.name === "sed" ? 4 : 3,
        "\u2028",
      ],
      [
        grammar.name === "sed" ? "/a\\{\u2029/p\n" : "/a{\u2029/p\n",
        "malformed_interval",
        grammar.name === "sed" ? 4 : 3,
        "\u2029",
      ],
    ];
    for (const [source, kind, byte, character] of cases) {
      const fresh = parseSuccessfully(grammar.scope, source);
      const range = `[0, ${byte}] - [0, ${byte + 3}]`;
      assert.deepEqual(
        fresh.nodes.filter((node) => node.kind === kind).map(nodeRange),
        [range],
        JSON.stringify(source),
      );
      assert.deepEqual(
        issueSignatures(fresh.nodes),
        kind === "ordinary_character"
          ? []
          : [{ outcome: "undefined_syntax", reason: kind, range }],
      );
      const incremental = parse(grammar.scope, source, [
        { byte, deleteBytes: 3, insert: "" },
        { byte, deleteBytes: 0, insert: character },
      ]);
      assertIncrementalContract(fresh, incremental, JSON.stringify(source));
    }
  });
}

for (const grammar of grammars) {
  test(`${grammar.name}: block functions own permitted trailing blanks at every boundary`, () => {
    const cases = [
      ["source end", "{p;} \t", [[0, 6]], 4, " \t"],
      ["newline", "{p;}\t \n", [[0, 6]], 4, "\t "],
      ["semicolon", "{p;} \t;q\n", [[0, 6]], 4, " \t"],
      [
        "nested block",
        "{{p;}\t ;} \n",
        [
          [0, 10],
          [1, 7],
        ],
        5,
        "\t ",
      ],
    ];
    for (const [name, source, ranges, byte, blanks] of cases) {
      const fresh = parseSuccessfully(grammar.scope, source);
      assertNoNodes(fresh.nodes, "syntax_issue", "ERROR", "MISSING");
      assert.deepEqual(
        fresh.nodes
          .filter(({ kind }) => kind === "block_function")
          .map(({ startByte, endByte }) => [startByte, endByte]),
        ranges,
        `${name}: ${JSON.stringify(source)}\n${fresh.stdout}`,
      );
      const incremental = parse(grammar.scope, source, [
        { byte, deleteBytes: blanks.length, insert: "" },
        { byte, deleteBytes: 0, insert: blanks },
      ]);
      assertIncrementalContract(fresh, incremental, name);
    }
  });

  test(`${grammar.name}: unexpected text after a block excludes permitted trailing blanks`, () => {
    const source = "{p;} \tq\n";
    const fresh = parseSuccessfully(grammar.scope, source);
    assert.deepEqual(issueSignatures(fresh.nodes), [
      {
        outcome: "nonconforming_syntax",
        reason: "unexpected_command_text",
        range: "[0, 6] - [0, 7]",
      },
    ]);
    assert.equal(
      nodeRange(fresh.nodes.find(({ kind }) => kind === "block_function")),
      "[0, 0] - [0, 6]",
    );
    const incremental = parse(grammar.scope, "{p;};q\n", [
      { byte: 4, deleteBytes: 1, insert: " \t" },
    ]);
    assertIncrementalContract(fresh, incremental, source);
  });
}

for (const grammar of grammars) {
  test(`${grammar.name}: known verbs stay functions after address blanks and negation`, () => {
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

test("sed: bracket terms directly own one-byte delimiter leaves", () => {
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

for (const grammar of grammars) {
  const collatingTerms = [
    ["collating_symbol", "."],
    ["equivalence_class", "="],
  ];

  test(`${grammar.name}: bracket term payloads retain closing brackets`, () => {
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
          parse(grammar.scope, withoutBracket, [
            { byte: position, deleteBytes: 0, insert: "]" },
          ]),
          `${label}: insert payload bracket`,
        );
        assertIncrementalContract(
          parseSuccessfully(grammar.scope, withoutBracket),
          parse(grammar.scope, source, [
            { byte: position, deleteBytes: 1, insert: "" },
          ]),
          `${label}: remove payload bracket`,
        );
      }
    }
  });

  test(`${grammar.name}: unterminated collating terms own brackets through the source boundary`, () => {
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
          parse(grammar.scope, repaired, [
            { byte: 7, deleteBytes: 1, insert: "" },
          ]),
          `${label}: remove closing marker`,
        );
        assertIncrementalContract(
          fresh,
          parse(grammar.scope, source, [
            { byte: 7, deleteBytes: 0, insert: marker },
          ]),
          `${label}: restore closing marker`,
        );
      }
    }
  });

  test(`${grammar.name}: bracket payload fragments retain closing brackets across NUL`, () => {
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
        parse(grammar.scope, history, [
          { byte: 6, deleteBytes: 1, insert: "" },
        ]),
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
        parse(grammar.scope, source, [
          { byte: 6, deleteBytes: 1, insert: "c" },
        ]),
        `${type}: replace NUL with a character`,
      );
    }
  });
}

test("sed: blanks before the function stay outside the separator", () => {
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

test("sed: empty commands own their blanks and end before their separator", () => {
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

test("sed: unterminated blanks and separators before a closing brace form no empty command", () => {
  for (const source of ["p;", " ", "p; ", "{p;}", "{p; }\n", "{}"]) {
    const result = parseSuccessfully("source.sed", source);
    assertNoNodes(result.nodes, "empty_command", "ERROR", "MISSING");
  }
});

test("sed: empty ERE alternatives do not invent branches or operand fields", () => {
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

const issueOutcomeNames = new Set([
  "undefined_syntax",
  "unspecified_syntax",
  "implementation_defined_syntax",
  "invalid_syntax",
  "nonconforming_syntax",
  "incomplete_syntax",
]);

function namedNode(nodeTypes, type, path) {
  const matches = nodeTypes.filter((node) => node.named && node.type === type);
  if (matches.length !== 1) {
    throw new Error(`${path}: expected one named ${type} node`);
  }
  return matches[0];
}

function requiredSingleChildren(node, path) {
  const { children } = node;
  if (
    !children?.required ||
    children.multiple ||
    Object.keys(node.fields ?? {}).length !== 0
  ) {
    throw new Error(`${path}: expected one required child`);
  }
  if (
    children.types.length === 0 ||
    children.types.some((type) => !type.named)
  ) {
    throw new Error(`${path}: expected named child types`);
  }
  return children.types;
}

function checkSourceChildren(nodeTypes, grammar, displayPath) {
  const expectedChildren = [
    ["blanks_after_negation", "blank"],
    ["blanks_around_address_separator", "blank"],
    ["shared_range_endpoint", "range_operator"],
    ["special_delimiter_escape", "escaped_delimiter"],
    ["replacement_ampersand_delimiter_escape", "replacement_escaped_delimiter"],
  ];
  const unmatchedClosers = [
    ["unmatched_interval_close", "back_close_brace"],
    ["unmatched_subexpression_close", "back_close_parenthesis"],
  ];
  if (grammar.name === "sed") {
    expectedChildren.push(...unmatchedClosers);
  } else {
    for (const [reason] of unmatchedClosers) {
      assert.ok(
        !nodeTypes.some((node) => node.named && node.type === reason),
        `${displayPath}: ${reason} must remain BRE-only`,
      );
    }
  }
  for (const [reason, child] of expectedChildren) {
    const node = namedNode(nodeTypes, reason, displayPath);
    assert.deepEqual(
      requiredSingleChildren(node, `${displayPath}:${reason}`),
      [{ type: child, named: true }],
      `${displayPath}: ${reason} must own one ${child} source child`,
    );
  }
}

function checkBracketTerms(nodeTypes, displayPath) {
  const malformed = namedNode(nodeTypes, "malformed_bracket_term", displayPath);
  assert.deepEqual(
    malformed.fields,
    {},
    `${displayPath}: malformed_bracket_term must not own fields`,
  );
  assert.deepEqual(
    malformed.children,
    {
      multiple: false,
      required: false,
      types: [{ type: "meta_char", named: true }],
    },
    `${displayPath}: malformed_bracket_term may only own one meta_char source child`,
  );
  assert.deepEqual(
    nodeTypes
      .filter((node) => !node.named)
      .map((node) => node.type)
      .sort(),
    ["[", ":", ".", "=", "]"].sort(),
    `${displayPath}: only bracket term delimiters may be anonymous`,
  );
  for (const obsolete of [
    "open_colon",
    "colon_close",
    "open_dot",
    "dot_close",
    "open_equal",
    "equal_close",
  ]) {
    assert.ok(
      !nodeTypes.some((node) => node.type === obsolete),
      `${displayPath}: ${obsolete} must not be public`,
    );
  }
  for (const [type, field, payloadTypes] of [
    ["character_class", "name", ["class_name"]],
    [
      "collating_symbol",
      "element",
      ["coll_elem_multi", "coll_elem_single", "meta_char"],
    ],
    ["equivalence_class", "element", ["coll_elem_multi", "coll_elem_single"]],
  ]) {
    const node = namedNode(nodeTypes, type, displayPath);
    assert.deepEqual(
      Object.keys(node.fields).sort(),
      [field, "issue"].sort(),
      `${displayPath}: ${type} fields`,
    );
    assert.deepEqual(
      node.fields[field],
      {
        multiple: true,
        required: false,
        types: payloadTypes.map((payload) => ({ type: payload, named: true })),
      },
      `${displayPath}: ${type}.${field} payload`,
    );
  }
}

function checkPublicCst(grammar, generatedRoot) {
  const path = join(generatedRoot, grammar.path, "src", "node-types.json");
  const displayPath = relative(generatedRoot, path);
  const nodeTypes = JSON.parse(readFileSync(path, "utf8"));
  const syntaxIssue = namedNode(nodeTypes, "syntax_issue", displayPath);
  const outcomeTypes = requiredSingleChildren(
    syntaxIssue,
    `${displayPath}:syntax_issue`,
  );
  const actualOutcomes = new Set(outcomeTypes.map(({ type }) => type));
  const reasons = new Set();

  for (const { type } of outcomeTypes) {
    if (!issueOutcomeNames.has(type)) {
      throw new Error(
        `${displayPath}: unexpected syntax_issue outcome ${type}`,
      );
    }
    const outcome = namedNode(nodeTypes, type, displayPath);
    for (const reason of requiredSingleChildren(
      outcome,
      `${displayPath}:${type}`,
    )) {
      if (
        reason.type === "syntax_issue" ||
        issueOutcomeNames.has(reason.type)
      ) {
        throw new Error(`${displayPath}: invalid issue reason ${reason.type}`);
      }
      namedNode(nodeTypes, reason.type, displayPath);
      reasons.add(reason.type);
    }
  }

  for (const outcome of issueOutcomeNames) {
    const present = nodeTypes.some(
      (node) => node.named && node.type === outcome,
    );
    if (present !== actualOutcomes.has(outcome)) {
      throw new Error(`${displayPath}: ${outcome} bypasses syntax_issue`);
    }
  }

  for (const node of nodeTypes) {
    if (
      node.named &&
      /(^_|(^|_)(recovery|control|marker|placeholder)($|_)|_token$)/.test(
        node.type,
      )
    ) {
      throw new Error(`${displayPath}: internal node ${node.type} is public`);
    }
    for (const reference of [
      node.children,
      ...Object.values(node.fields ?? {}),
    ]) {
      for (const child of reference?.types ?? []) {
        if (!child.named) {
          continue;
        }
        if (actualOutcomes.has(child.type) && node.type !== "syntax_issue") {
          throw new Error(
            `${displayPath}: ${node.type} owns ${child.type} outside syntax_issue`,
          );
        }
        if (reasons.has(child.type) && !actualOutcomes.has(node.type)) {
          throw new Error(
            `${displayPath}: ${node.type} owns reason ${child.type} outside an outcome`,
          );
        }
      }
    }
  }

  for (const type of [
    "address_separator",
    "delimiter",
    "closing_brace",
    "text_introducer",
    "close_bracket",
    "collating_element",
    "quoted_character",
    "invalid_encoding",
    "class_name",
    "meta_char",
    "range_operator",
    "escaped_delimiter",
    "replacement_escaped_delimiter",
    grammar.name === "sed" ? "back_close_parenthesis" : "close_parenthesis",
  ]) {
    const node = namedNode(nodeTypes, type, displayPath);
    assert.ok(
      node.children === undefined &&
        Object.keys(node.fields ?? {}).length === 0,
      `${displayPath}: ${type} must be a lexical leaf`,
    );
  }

  checkSourceChildren(nodeTypes, grammar, displayPath);
  checkBracketTerms(nodeTypes, displayPath);
}

for (const grammar of grammars) {
  test(`${grammar.name}: public nodes preserve issue ownership, source children and bracket fields`, () => {
    checkPublicCst(grammar, root);
  });
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
    name: "missing function at source end",
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

for (const testCase of boundaryCases) {
  const grammar = grammars.find(({ scope }) => scope === testCase.scope);
  assert.ok(grammar);
  test(`${grammar.name}: ${testCase.name}`, () => {
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
  test(`${grammar.name}: healthy line operands expose one literal with their exact source range`, () => {
    const cases = [
      [":é\uFFFD \\x;\t}", "label", "label_literal", 1, 12],
      ["b é\uFFFD \\x;\t}", "label", "label_literal", 2, 13],
      ["t é\uFFFD \\x;\t}", "label", "label_literal", 2, 13],
      ["r \té\uFFFD \\x;\t}", "rfile", "file_literal", 3, 14],
      ["w   é\uFFFD \\x;\t}", "wfile", "file_literal", 4, 15],
      ["s/a/b/w é\uFFFD \\x\t}", "wfile", "file_literal", 8, 18],
      ["s/a/b/w é\uFFFD \\x\t};q", "wfile", "file_literal", 8, 18],
    ];
    for (const [command, ownerKind, literalKind, start, end] of cases) {
      for (const suffix of ["", "\n"]) {
        const source = command + suffix;
        const result = parseSuccessfully(grammar.scope, source);
        assertNoNodes(result.nodes, "syntax_issue", "ERROR", "MISSING");
        const owner = result.nodes.findIndex(({ kind }) => kind === ownerKind);
        assert.notEqual(owner, -1, source);
        const owned = subtree(result.nodes, owner);
        assert.deepEqual(
          owned.map(({ kind, field, startByte, endByte }) => [
            kind,
            field,
            startByte,
            endByte,
          ]),
          [
            [ownerKind, ownerKind, start, end],
            [literalKind, null, start, end],
          ],
          JSON.stringify(source),
        );
        assert.equal(owned[1].parent, owner, source);
      }
    }
  });

  test(`${grammar.name}: absent line operands do not invent literal leaves`, () => {
    for (const source of ["b\n", "t\n", ":\n", "r \n", "w \n", "s/a/b/w \n"]) {
      const result = parseSuccessfully(grammar.scope, source);
      assertNoNodes(
        result.nodes,
        "label",
        "rfile",
        "wfile",
        "label_literal",
        "file_literal",
      );
    }
  });
}

for (const grammar of grammars) {
  for (const testCase of omittedFileSeparatorCases) {
    test(`${grammar.name}: omitted file separator: ${testCase.name}`, () => {
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
        syntaxSignatures(result.nodes, [testCase.operand, "file_literal"]),
        [
          `${testCase.operand}: ${testCase.operand} [0, ${testCase.operandStart}] - [0, ${testCase.operandEnd}]`,
          `  file_literal [0, ${testCase.operandStart}] - [0, ${testCase.operandEnd}]`,
        ],
        `missing ${testCase.operand} operand\n${result.stdout}`,
      );
      assertNoNodes(result.nodes, "ERROR", "MISSING");
    });
  }
}

test("sed: missing text introducer stays zero-width before a stray backslash", () => {
  const result = parseSuccessfully("source.sed", "a\\x\n");
  assert.deepEqual(
    syntaxSignatures(result.nodes, ["missing_text_introducer"]),
    ["missing_text_introducer [0, 1] - [0, 1]"],
    result.stdout,
  );
});

test("sed: incomplete text introducer is a direct issue on append", () => {
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

test("sed: source-end omission stays zero-width after the separator", () => {
  const result = parseSuccessfully("source.sed", "1,");
  assert.deepEqual(
    syntaxSignatures(result.nodes, ["omitted_address"]),
    ["omitted_address [0, 2] - [0, 2]"],
    result.stdout,
  );
});

test("sed: excess address unit owns its separator and address", () => {
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
  test(`${grammar.name}: blank-separated addresses on a zero-address function remain excess`, () => {
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

  test(`${grammar.name}: an adjacent context address remains excess`, () => {
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

test("sed: separator blanks live inside sibling blank issues", () => {
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

test("sed: blank after negation lives inside its issue reason", () => {
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

test("sed: leading blanks stay inside a command that omits its first address", () => {
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

test("sed: duplicated negation operator lives inside its issue", () => {
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

const commandRecoveryCases = [
  {
    name: "raw newline after an unclosed bracket expression",
    before: "  1,2!p\n",
    broken: "/[a\n",
    after: "\t/[[.a.]][[=b=]][[:alpha:]]/d\n",
    initial: "/[a]/p\n",
    edit: { byte: 3, deleteBytes: 3, insert: "" },
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
    edit: { byte: 0, deleteBytes: 1, insert: "Z" },
    boundary: 1,
    issues: ["nonconforming_syntax/unknown_function"],
  },
  {
    name: "closed block containing an unknown function",
    before: "  1{\np\n};",
    broken: "{Z\n};",
    after: "\t2s/a/b/\n",
    initial: "{p\n};",
    edit: { byte: 1, deleteBytes: 1, insert: "Z" },
    boundary: 3,
    issues: ["nonconforming_syntax/unknown_function"],
  },
];

for (const grammar of grammars) {
  for (const testCase of commandRecoveryCases) {
    test(`${grammar.name}: recovery preserves surrounding commands across ${testCase.name}`, () => {
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
      const boundaryPosition = offset + testCase.boundary;
      const histories = [
        { name: "fresh", source, edits: [] },
        {
          name: "damage a normal command",
          source: before + testCase.initial + after,
          edits: [{ ...testCase.edit, byte: offset + testCase.edit.byte }],
        },
        {
          name: "remove and restore the recovery boundary",
          source,
          edits: [
            { byte: boundaryPosition, deleteBytes: 1, insert: "" },
            {
              byte: boundaryPosition,
              deleteBytes: 0,
              insert: broken[testCase.boundary],
            },
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

for (const grammar of grammars) {
  test(`${grammar.name}: partial commands retain prefixes without invented functions`, () => {
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
        ? [{ byte: boundary - 1, deleteBytes: 1, insert: "Z" }]
        : [{ byte: boundary, deleteBytes: 1, insert: "" }];
      const incremental = parseSuccessfully(grammar.scope, complete, edits);
      assertIncrementalContract(fresh, incremental, source);
    }
  });

  test(`${grammar.name}: lexical classes are direct leaves with exact ranges`, () => {
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

  test(`${grammar.name}: missing components attach issues to confirmed owners`, () => {
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

const regularExpressionEofCases = [
  {
    name: "BRE interval escape without a minimum",
    scope: "source.sed",
    source: "s/a\\{\\",
    outcome: "undefined_syntax",
    reason: "malformed_interval",
    range: "[0, 5] - [0, 6]",
    repaired: "s/a\\{1\\}//",
    damage: [
      { byte: 5, deleteBytes: 1, insert: "" },
      { byte: 6, deleteBytes: 3, insert: "" },
    ],
    repair: [{ byte: 5, deleteBytes: 1, insert: "1\\}//" }],
  },
  {
    name: "BRE interval escape after an exact count",
    scope: "source.sed",
    source: "s/a\\{1\\",
    outcome: "incomplete_syntax",
    reason: "incomplete_interval",
    range: "[0, 6] - [0, 7]",
    repaired: "s/a\\{1\\}//",
    damage: [{ byte: 7, deleteBytes: 3, insert: "" }],
    repair: [{ byte: 7, deleteBytes: 0, insert: "}//" }],
  },
  {
    name: "BRE interval escape after an unbounded minimum",
    scope: "source.sed",
    source: "s/a\\{1,\\",
    outcome: "incomplete_syntax",
    reason: "incomplete_interval",
    range: "[0, 7] - [0, 8]",
    repaired: "s/a\\{1,\\}//",
    damage: [{ byte: 8, deleteBytes: 3, insert: "" }],
    repair: [{ byte: 8, deleteBytes: 0, insert: "}//" }],
  },
  {
    name: "BRE interval escape after a maximum",
    scope: "source.sed",
    source: "s/a\\{1,2\\",
    outcome: "incomplete_syntax",
    reason: "incomplete_interval",
    range: "[0, 8] - [0, 9]",
    repaired: "s/a\\{1,2\\}//",
    damage: [{ byte: 9, deleteBytes: 3, insert: "" }],
    repair: [{ byte: 9, deleteBytes: 0, insert: "}//" }],
  },
  {
    name: "ERE group closer conflicts with the delimiter",
    scope: "source.sed.ere",
    source: "s)(a",
    outcome: "undefined_syntax",
    reason: "unclosed_subexpression",
    range: "[0, 4] - [0, 4]",
    repaired: "s/(a)//",
    damage: [
      { byte: 1, deleteBytes: 1, insert: ")" },
      { byte: 4, deleteBytes: 3, insert: "" },
    ],
    repair: [
      { byte: 1, deleteBytes: 1, insert: "/" },
      { byte: 4, deleteBytes: 0, insert: ")//" },
    ],
  },
  {
    name: "BRE group closer conflicts with the delimiter",
    scope: "source.sed",
    source: "s)\\(a",
    outcome: "undefined_syntax",
    reason: "unclosed_subexpression",
    range: "[0, 5] - [0, 5]",
    repaired: "s/\\(a\\)//",
    damage: [
      { byte: 1, deleteBytes: 1, insert: ")" },
      { byte: 5, deleteBytes: 4, insert: "" },
    ],
    repair: [
      { byte: 1, deleteBytes: 1, insert: "/" },
      { byte: 5, deleteBytes: 0, insert: "\\)//" },
    ],
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
    damage: [
      { byte: 1, deleteBytes: 1, insert: ")" },
      { byte: 3, deleteBytes: 4, insert: "" },
    ],
    repair: [
      { byte: 1, deleteBytes: 1, insert: "/" },
      { byte: 3, deleteBytes: 0, insert: "a)//" },
    ],
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
    damage: [
      { byte: 1, deleteBytes: 1, insert: ")" },
      { byte: 4, deleteBytes: 5, insert: "" },
    ],
    repair: [
      { byte: 1, deleteBytes: 1, insert: "/" },
      { byte: 4, deleteBytes: 0, insert: "a\\)//" },
    ],
  },
  {
    name: "ERE interval closer conflicts with the delimiter",
    scope: "source.sed.ere",
    source: "s}a{1",
    outcome: "undefined_syntax",
    reason: "malformed_interval",
    range: "[0, 5] - [0, 5]",
    repaired: "s/a{1}//",
    damage: [
      { byte: 1, deleteBytes: 1, insert: "}" },
      { byte: 5, deleteBytes: 3, insert: "" },
    ],
    repair: [
      { byte: 1, deleteBytes: 1, insert: "/" },
      { byte: 5, deleteBytes: 0, insert: "}//" },
    ],
  },
  {
    name: "BRE interval closer conflicts with the delimiter",
    scope: "source.sed",
    source: "s}a\\{1",
    outcome: "undefined_syntax",
    reason: "malformed_interval",
    range: "[0, 6] - [0, 6]",
    repaired: "s/a\\{1\\}//",
    damage: [
      { byte: 1, deleteBytes: 1, insert: "}" },
      { byte: 6, deleteBytes: 4, insert: "" },
    ],
    repair: [
      { byte: 1, deleteBytes: 1, insert: "/" },
      { byte: 6, deleteBytes: 0, insert: "\\}//" },
    ],
  },
];

for (const testCase of regularExpressionEofCases) {
  const grammar = grammars.find(({ scope }) => scope === testCase.scope);
  assert.ok(grammar);
  test(`${grammar.name}: ${testCase.name}`, () => {
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

test("sed: a malformed interval ends before a following construct", () => {
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
      name: `character class range start`,
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
      name: `character class range end`,
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
      name: `equivalence class range start`,
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
      name: `equivalence class range end`,
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
      name: `ambiguous bracket expression`,
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
      name: `ambiguous bracket expression with a nonportable endpoint`,
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
  const grammar = grammars.find(({ scope }) => scope === testCase.scope);
  assert.ok(grammar);
  test(`${grammar.name}: ${testCase.name}`, () => {
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

    const replacementEdit = {
      byte: testCase.source.length - 3,
      deleteBytes: 1,
      insert: "y",
    };
    const changedReplacement = applyEdits(testCase.source, [replacementEdit]);
    const incremental = parseSuccessfully(testCase.scope, changedReplacement, [
      { byte: testCase.source.length - 3, deleteBytes: 1, insert: "x" },
    ]);
    assertIncrementalContract(fresh, incremental, testCase.name);
    assert.deepEqual(
      syntaxSignatures(incremental.nodes, retainedTypes),
      retained,
    );

    const patternEnd = testCase.source.lastIndexOf("/x/");
    const inserted = parseSuccessfully(testCase.scope, "s//x/\n", [
      {
        byte: 2,
        deleteBytes: 0,
        insert: testCase.source.slice(2, patternEnd),
      },
    ]);
    assertIncrementalContract(fresh, inserted, testCase.name);
    assert.deepEqual(syntaxSignatures(inserted.nodes, retainedTypes), retained);
  });
}

test("sed: incomplete bracket terms do not synthesize closing leaves", () => {
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

test("sed: bracket term marker prefixes preserve payloads and converge after edits", () => {
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
              { edit: { byte: eof, deleteBytes: 1, insert: "" }, source },
              {
                edit: { byte: eof, deleteBytes: 0, insert: "]" },
                source: initial,
              },
              {
                edit: { byte: eof + 1, deleteBytes: 0, insert: "]/x/" },
                source: complete,
              },
              {
                edit: { byte: eof, deleteBytes: 1, insert: "x" },
                source: `${source}x]/x/`,
              },
              {
                edit: { byte: eof, deleteBytes: 1, insert: "]" },
                source: complete,
              },
            ]
          : [
              {
                edit: { byte: eof, deleteBytes: 0, insert: suffix },
                source: complete,
              },
              {
                edit: { byte: eof, deleteBytes: suffix.length, insert: "" },
                source,
              },
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

test("sed: invalid class prefixes exclude a pending closing marker from their malformed name", () => {
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

test("sed: malformed empty bracket terms preserve every source delimiter", () => {
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

const identifiedIssueLeafCases = [
  {
    name: "special regular expression delimiter escape",
    source: "s.\\..x.",
    outcome: "unspecified_syntax",
    reason: "special_delimiter_escape",
    child: "escaped_delimiter",
    ranges: ["[0, 2] - [0, 4]"],
    repaired: "s.a.x.",
    damage: [{ byte: 2, deleteBytes: 1, insert: "\\." }],
    repair: [{ byte: 2, deleteBytes: 2, insert: "a" }],
  },
  {
    name: "replacement ampersand delimiter escape",
    source: "s&a&\\&&",
    outcome: "unspecified_syntax",
    reason: "replacement_ampersand_delimiter_escape",
    child: "replacement_escaped_delimiter",
    ranges: ["[0, 4] - [0, 6]"],
    repaired: "s&a&a&",
    damage: [{ byte: 4, deleteBytes: 1, insert: "\\&" }],
    repair: [{ byte: 4, deleteBytes: 2, insert: "a" }],
  },
  {
    name: "equivalence class meta characters",
    source: "/[[=-=]][[=]=]]/p\n",
    outcome: "undefined_syntax",
    reason: "malformed_bracket_term",
    child: "meta_char",
    ranges: ["[0, 4] - [0, 5]", "[0, 11] - [0, 12]"],
    repaired: "/[[.-.]][[.].]]/p\n",
    damage: [
      { byte: 3, deleteBytes: 1, insert: "=" },
      { byte: 5, deleteBytes: 1, insert: "=" },
      { byte: 10, deleteBytes: 1, insert: "=" },
      { byte: 12, deleteBytes: 1, insert: "=" },
    ],
    repair: [
      { byte: 3, deleteBytes: 1, insert: "." },
      { byte: 5, deleteBytes: 1, insert: "." },
      { byte: 10, deleteBytes: 1, insert: "." },
      { byte: 12, deleteBytes: 1, insert: "." },
    ],
  },
  {
    name: "shared range endpoint operator",
    source: "/[a-b-c]/p\n",
    outcome: "undefined_syntax",
    reason: "shared_range_endpoint",
    child: "range_operator",
    ranges: ["[0, 5] - [0, 6]"],
    repaired: "/[a-bc]/p\n",
    damage: [{ byte: 5, deleteBytes: 0, insert: "-" }],
    repair: [{ byte: 5, deleteBytes: 1, insert: "" }],
  },
];

for (const grammar of grammars) {
  for (const testCase of identifiedIssueLeafCases) {
    test(`${grammar.name}: ${testCase.name} retains its source leaf`, () => {
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

test("sed: unmatched BRE closers own one source child", () => {
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

for (const grammar of grammars) {
  test(`${grammar.name}: invalid interval characters preserve boundaries`, () => {
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
            ? [
                { byte: position, deleteBytes: 0, insert: closing },
                { byte: position, deleteBytes: closing.length, insert: "" },
              ]
            : [
                { byte: position, deleteBytes: 1, insert: "" },
                {
                  byte: position,
                  deleteBytes: 0,
                  insert: testCase.suffix[0],
                },
              ];
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

  test(`${grammar.name}: character class names: invalid spellings own their source`, () => {
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
      const edits = [{ byte: 5, deleteBytes: 5, insert: name }];
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
        parse(grammar.scope, source, [
          { byte: 5, deleteBytes: Buffer.byteLength(name), insert: "Alpha" },
        ]),
        `${source}: repair`,
      );
    }
  });

  test(`${grammar.name}: character class names: valid names retain one payload`, () => {
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

  test(`${grammar.name}: invalid regular expression characters retain byte ranges through repair`, () => {
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
        const edits = [{ byte: prefix.length, deleteBytes: 1, insert: "" }];
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
            {
              byte: prefix.length,
              deleteBytes: invalid.bytes.length,
              insert: repair,
            },
          ]),
          `${label}: repair`,
        );
      }
    }
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
      test(`${grammar.name}: ${name}: ${testCase.name}`, () => {
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
          [{ byte: 0, deleteBytes: 2, insert: "" }],
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
  test(`${grammar.name}: unexpected command text owns nested NUL issues`, () => {
    const source = "{\npX\0Y\0\nq\n}\n";
    const fresh = parseSuccessfully(grammar.scope, source);
    const incremental = parseSuccessfully(grammar.scope, `p\n${source}`, [
      { byte: 0, deleteBytes: 2, insert: "" },
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
    const edits = [
      { byte: 6, deleteBytes: 1, insert: "" },
      { byte: 4, deleteBytes: 1, insert: "" },
    ];
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
    types: ["label", "label_literal", "nul_character"],
    structure: [
      "label: label [0, 1] - [0, 4]",
      "  label_literal [0, 1] - [0, 2]",
      "  nul_character [0, 2] - [0, 3]",
      "  label_literal [0, 3] - [0, 4]",
    ],
  },
  {
    name: "branch label begins with NUL",
    source: "b \0ab\nq\n",
    nulRanges: ["[0, 2] - [0, 3]"],
    types: ["label", "label_literal", "nul_character"],
    structure: [
      "label: label [0, 2] - [0, 5]",
      "  nul_character [0, 2] - [0, 3]",
      "  label_literal [0, 3] - [0, 5]",
    ],
  },
  {
    name: "test label ends with NUL",
    source: "t ab\0\nq\n",
    nulRanges: ["[0, 4] - [0, 5]"],
    types: ["label", "label_literal", "nul_character"],
    structure: [
      "label: label [0, 2] - [0, 5]",
      "  label_literal [0, 2] - [0, 4]",
      "  nul_character [0, 4] - [0, 5]",
    ],
  },
  {
    name: "read file keeps whitespace and semicolon after NUL",
    source: "r \0 a;\0\nq\n",
    nulRanges: ["[0, 2] - [0, 3]", "[0, 6] - [0, 7]"],
    types: ["rfile", "file_literal", "nul_character"],
    structure: [
      "rfile: rfile [0, 2] - [0, 7]",
      "  nul_character [0, 2] - [0, 3]",
      "  file_literal [0, 3] - [0, 6]",
      "  nul_character [0, 6] - [0, 7]",
    ],
  },
  {
    name: "write file keeps its semicolon after NUL",
    source: "w a\0;b\nq\n",
    nulRanges: ["[0, 3] - [0, 4]"],
    types: ["wfile", "file_literal", "nul_character"],
    structure: [
      "wfile: wfile [0, 2] - [0, 6]",
      "  file_literal [0, 2] - [0, 3]",
      "  nul_character [0, 3] - [0, 4]",
      "  file_literal [0, 4] - [0, 6]",
    ],
  },
  {
    name: "substitution write file ends before its semicolon",
    source: "s/a/b/w \0 a;q\n",
    nulRanges: ["[0, 8] - [0, 9]"],
    types: ["wfile", "file_literal", "nul_character"],
    structure: [
      "wfile: wfile [0, 8] - [0, 11]",
      "  nul_character [0, 8] - [0, 9]",
      "  file_literal [0, 9] - [0, 11]",
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
  test(`${grammar.name}: NUL payloads preserve issues, owners, and following commands`, () => {
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
      const edits = [{ byte: firstNul, deleteBytes: 1, insert: "" }];
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
          repairs.push({ byte: index, deleteBytes: 1, insert: repair });
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
  test(`${grammar.name}: Unicode source retains byte ranges without normalization`, () => {
    const result = parseSuccessfully(grammar.scope, "s/é😀/e\u0301/\n# é😀\n");
    assertNoNodes(result.nodes, "syntax_issue", "ERROR", "MISSING");
    assert.deepEqual(
      syntaxSignatures(result.nodes, [
        "ordinary_character",
        "replacement_literal",
        "comment_text",
      ]),
      [
        "ordinary_character [0, 2] - [0, 4]",
        "ordinary_character [0, 4] - [0, 8]",
        "replacement_literal [0, 9] - [0, 12]",
        "comment_text [1, 1] - [1, 8]",
      ],
    );
  });

  test(`${grammar.name}: large tokens, command lists and nested blocks parse through EOF`, () => {
    for (const [name, source] of [
      ["long replacement", `s/a/${"x".repeat(80_000)}/\n`],
      ["wide command list", "p;".repeat(16_000)],
      ["deep blocks", `${"{".repeat(2000)}p;${"}".repeat(2000)}\n`],
    ]) {
      assert.equal(parseSummary(grammar.scope, source).successful, true, name);
    }
  });

  test(`${grammar.name}: long unterminated replacements parse through EOF`, () => {
    const source = `s/a/${"x".repeat(80_000)}`;
    const result = parseSuccessfully(grammar.scope, source);
    assert.deepEqual(issuePaths(result.nodes), [
      "incomplete_syntax/incomplete_replacement",
    ]);
  });

  test(`${grammar.name}: a parser timeout cannot pass as complete recovery`, () => {
    assert.throws(() => parseSummary(grammar.scope, "p;".repeat(16_000), 1));
  });
}

test("sed: corpus fuzz propagates CLI failures even when its exit status is zero", () => {
  const directory = mkdtempSync(join(tmpdir(), "tree-sitter-fuzz-exit-#-"));
  const preload = join(directory, "cli.mjs");
  const script = join(import.meta.dirname, "..", "scripts", "tree-sitter.js");
  const fixtures = [
    {
      name: "successful CLI output",
      status: 0,
      stdout: "0 test_language corpus tests failed fuzzing\n",
      stderr: "",
      expectedStatus: 0,
    },
    {
      name: "failed fuzz case with successful CLI exit status",
      status: 0,
      stdout: "1 test_language corpus tests failed fuzzing\n",
      stderr: "",
      expectedStatus: 1,
    },
    {
      name: "failed CLI exit status",
      status: 1,
      stdout: "",
      stderr: "fuzz command failed\n",
      expectedStatus: 1,
    },
  ];
  try {
    for (const fixture of fixtures) {
      writeFileSync(
        preload,
        `
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
const fixture = ${JSON.stringify(fixture)};
childProcess.spawnSync = (_command, arguments_) => {
  if (arguments_.includes("build")) return { status: 0, stdout: "", stderr: "" };
  if (arguments_.includes("fuzz")) return fixture;
  throw new Error("unexpected CLI invocation");
};
syncBuiltinESMExports();
`,
      );
      const result = spawnSync(
        process.execPath,
        ["--import", pathToFileURL(preload).href, script, "fuzz-all"],
        {
          encoding: "utf8",
          timeout: 60_000,
          killSignal: "SIGKILL",
        },
      );
      assert.ifError(result.error);
      assert.equal(
        result.status,
        fixture.expectedStatus,
        `${fixture.name}\n${result.stdout}${result.stderr}`,
      );
      assert.ok(
        result.stdout.includes(fixture.stdout),
        `${fixture.name}: CLI stdout is missing`,
      );
      assert.ok(
        result.stderr.includes(fixture.stderr),
        `${fixture.name}: CLI stderr is missing`,
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
