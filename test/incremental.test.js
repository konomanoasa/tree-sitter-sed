import assert from "node:assert/strict";
import { test } from "node:test";
import { grammars } from "../scripts/tree-sitter.js";
import {
  applyEdits,
  assertIncrementalContract,
  assertNoNodes,
  directDelimiterLeafLines,
  issueSignatures,
  parse,
  parseSuccessfully,
  publicNodes,
  syntaxSignatures,
} from "./support/parser.js";

const bracketDelimiterConvergenceCases = grammars.flatMap((grammar) => [
  {
    name: `bracket term opening marker`,
    scope: grammar.scope,
    source: "/[[:alpha:]]/p\n",
    issues: [],
    histories: [
      {
        source: "/[[xalpha:]]/p\n",
        edits: [{ byte: 3, deleteBytes: 1, insert: ":" }],
      },
      {
        source: "/[[=alpha=]]/p\n",
        edits: [
          { byte: 3, deleteBytes: 1, insert: ":" },
          { byte: 9, deleteBytes: 1, insert: ":" },
        ],
      },
    ],
  },
  {
    name: `bracket term closing bracket restoration`,
    scope: grammar.scope,
    source: "/[[:alpha:]x]/p\n",
    issues: [],
    histories: [
      {
        source: "/[[:alpha:x]/p\n",
        edits: [{ byte: 10, deleteBytes: 0, insert: "]" }],
      },
    ],
  },
  {
    name: `bracket term closing bracket deletion`,
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
    histories: [
      {
        source: "/[[:alpha:]x]/p\n",
        edits: [{ byte: 10, deleteBytes: 1, insert: "" }],
      },
    ],
  },
]);

const explicitConvergenceCases = [
  ...bracketDelimiterConvergenceCases,
  {
    name: "recovery-free substitution",
    scope: "source.sed",
    source: "s/a/b/g\n",
    histories: [
      {
        source: "s/a/c/g\n",
        edits: [{ byte: 4, deleteBytes: 1, insert: "b" }],
      },
      { source: "s/a/b/\n", edits: [{ byte: 6, deleteBytes: 0, insert: "g" }] },
    ],
  },
  {
    name: "unclosed bracket expression at source end",
    scope: "source.sed",
    source: "/[a",
    histories: [
      { source: "/[", edits: [{ byte: 2, deleteBytes: 0, insert: "a" }] },
      { source: "/[b", edits: [{ byte: 2, deleteBytes: 1, insert: "a" }] },
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
      { source: "//p\n", edits: [{ byte: 1, deleteBytes: 0, insert: "\\)" }] },
      {
        source: "/\\(\\)/p\n",
        edits: [{ byte: 1, deleteBytes: 2, insert: "" }],
      },
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
      { source: "//p\n", edits: [{ byte: 1, deleteBytes: 0, insert: "\\}" }] },
      {
        source: "/a\\{1\\}/p\n",
        edits: [{ byte: 1, deleteBytes: 4, insert: "" }],
      },
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
      { source: "}\n", edits: [{ byte: 1, deleteBytes: 0, insert: "p" }] },
      { source: "};p\n", edits: [{ byte: 1, deleteBytes: 1, insert: "" }] },
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
      {
        source: "/\\(a\\)/p\n",
        edits: [
          { byte: 3, deleteBytes: 0, insert: "^" },
          { byte: 5, deleteBytes: 0, insert: "$" },
        ],
      },
      {
        source: "/^a$/p\n",
        edits: [
          { byte: 1, deleteBytes: 0, insert: "\\(" },
          { byte: 6, deleteBytes: 0, insert: "\\)" },
        ],
      },
    ],
  },
  {
    name: "reserved unknown function after negation",
    scope: "source.sed",
    source: "1!/\np\n",
    histories: [
      { source: "1!x\np\n", edits: [{ byte: 2, deleteBytes: 1, insert: "/" }] },
      { source: "1!$\np\n", edits: [{ byte: 2, deleteBytes: 1, insert: "/" }] },
    ],
  },
  ...grammars.map((grammar) => ({
    name: `flags after write remain deterministic`,
    scope: grammar.scope,
    source: "s/a/b/wp file\n",
    issues: [],
    histories: [
      {
        source: "s/a/b/wg file\n",
        edits: [{ byte: 7, deleteBytes: 1, insert: "p" }],
      },
      {
        source: "s/a/b/w file\n",
        edits: [{ byte: 7, deleteBytes: 0, insert: "p" }],
      },
    ],
  })),
  ...grammars.map((grammar) => ({
    name: `command after write remains deterministic`,
    scope: grammar.scope,
    source: "s/a/b/w file;p\n",
    issues: [],
    histories: [
      {
        source: "s/a/b/w file\np\n",
        edits: [{ byte: 12, deleteBytes: 1, insert: ";" }],
      },
      {
        source: "s/a/b/w file;d\n",
        edits: [{ byte: 13, deleteBytes: 1, insert: "p" }],
      },
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
        name: `omitted first address before the separator`,
        source: ",2p\n",
        issues: [omitted("[0, 0] - [0, 0]")],
        histories: [
          {
            source: "1,2p\n",
            edits: [{ byte: 0, deleteBytes: 1, insert: "" }],
          },
          { source: "2p\n", edits: [{ byte: 0, deleteBytes: 0, insert: "," }] },
        ],
      },
      {
        name: `omitted first and second addresses`,
        source: ",p\n",
        issues: [omitted("[0, 0] - [0, 0]"), omitted("[0, 1] - [0, 1]")],
        histories: [
          { source: "1,p\n", edits: [{ byte: 0, deleteBytes: 1, insert: "" }] },
          { source: ",2p\n", edits: [{ byte: 1, deleteBytes: 1, insert: "" }] },
        ],
      },
      {
        name: `omitted second address after the separator`,
        source: "1,p\n",
        issues: [omitted("[0, 2] - [0, 2]")],
        histories: [
          {
            source: "1,2p\n",
            edits: [{ byte: 2, deleteBytes: 1, insert: "" }],
          },
          { source: "1p\n", edits: [{ byte: 1, deleteBytes: 0, insert: "," }] },
        ],
      },
      {
        name: `excess address unit on a one-address function`,
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
          {
            source: "1,2p\n",
            edits: [{ byte: 3, deleteBytes: 1, insert: "q" }],
          },
          {
            source: "1q\n",
            edits: [{ byte: 1, deleteBytes: 0, insert: ",2" }],
          },
        ],
      },
      {
        name: `leading excess address on a zero-address function`,
        source: "1:x\n",
        issues: [excess("[0, 0] - [0, 1]")],
        histories: [
          { source: ":x\n", edits: [{ byte: 0, deleteBytes: 0, insert: "1" }] },
          {
            source: "1,2:x\n",
            edits: [{ byte: 1, deleteBytes: 2, insert: "" }],
          },
        ],
      },
      {
        name: `blank-separated excess addresses on a zero-address function`,
        source: "1 2:x\n",
        issues: [
          excess("[0, 0] - [0, 1]"),
          excess("[0, 1] - [0, 3]"),
          missingAddressSeparator("[0, 1] - [0, 1]"),
        ],
        histories: [
          {
            source: "1,2:x\n",
            edits: [{ byte: 1, deleteBytes: 1, insert: " " }],
          },
          {
            source: "1 2q\n",
            edits: [{ byte: 3, deleteBytes: 1, insert: ":x" }],
          },
          {
            source: "1 2p\n",
            edits: [{ byte: 3, deleteBytes: 1, insert: ":x" }],
          },
          {
            source: ":x\n",
            edits: [{ byte: 0, deleteBytes: 0, insert: "1 2" }],
          },
        ],
      },
      {
        name: `third address unit on a two-address function`,
        source: "1,2,3p\n",
        issues: [excess("[0, 3] - [0, 5]")],
        histories: [
          {
            source: "1,2p\n",
            edits: [{ byte: 3, deleteBytes: 0, insert: ",3" }],
          },
          {
            source: "1,2,3q\n",
            edits: [{ byte: 5, deleteBytes: 1, insert: "p" }],
          },
        ],
      },
      {
        name: `omission nested inside an excess address unit`,
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
          {
            source: "1,2q\n",
            edits: [{ byte: 2, deleteBytes: 1, insert: "" }],
          },
          { source: "1q\n", edits: [{ byte: 1, deleteBytes: 0, insert: "," }] },
        ],
      },
      {
        name: `blank runs around one separator`,
        source: "1 , 2p\n",
        issues: [
          blanksAroundSeparator("[0, 1] - [0, 2]"),
          blanksAroundSeparator("[0, 3] - [0, 4]"),
        ],
        histories: [
          {
            source: "1,2p\n",
            edits: [
              { byte: 1, deleteBytes: 0, insert: " " },
              { byte: 3, deleteBytes: 0, insert: " " },
            ],
          },
          {
            source: "1 ,2p\n",
            edits: [{ byte: 3, deleteBytes: 0, insert: " " }],
          },
        ],
      },
      {
        name: `pre-function blanks after separator blanks`,
        source: "1 , p\n",
        issues: [
          blanksAroundSeparator("[0, 1] - [0, 2]"),
          omitted("[0, 3] - [0, 3]"),
        ],
        histories: [
          {
            source: "1 , 2p\n",
            edits: [{ byte: 4, deleteBytes: 1, insert: "" }],
          },
          {
            source: "1,p\n",
            edits: [
              { byte: 1, deleteBytes: 0, insert: " " },
              { byte: 3, deleteBytes: 0, insert: " " },
            ],
          },
        ],
      },
      {
        name: `blank run after negation`,
        source: "! \tp\n",
        issues: [blanksAfterNegation("[0, 1] - [0, 3]")],
        histories: [
          {
            source: "! p\n",
            edits: [{ byte: 2, deleteBytes: 0, insert: "\t" }],
          },
          {
            source: "!\tp\n",
            edits: [{ byte: 1, deleteBytes: 0, insert: " " }],
          },
        ],
      },
      {
        name: `duplicated negation after an address`,
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
          {
            source: "1!p\n",
            edits: [{ byte: 2, deleteBytes: 0, insert: "!" }],
          },
          {
            source: "!!p\n",
            edits: [{ byte: 0, deleteBytes: 0, insert: "1" }],
          },
        ],
      },
    ].map((testCase) => ({ ...testCase, scope: grammar.scope }));
  }),
];

for (const testCase of explicitConvergenceCases) {
  const grammar = grammars.find(({ scope }) => scope === testCase.scope);
  assert.ok(grammar);
  test(`${grammar.name}: ${testCase.name}`, () => {
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

test("sed: BRE dollar classification tracks every byte of multibyte lookahead", () => {
  for (const [delimiter, alternative] of [
    ["é", "è"],
    ["あ", "ぃ"],
    ["😀", "😁"],
  ]) {
    const width = Buffer.byteLength(delimiter);
    const dollarStart = 1 + width;
    const edits = [{ byte: 2 * width + 1, deleteBytes: width, insert: "" }];
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

function createEditHistoryGenerator() {
  let seed = 1n;
  function next(maximum) {
    seed = BigInt.asUintN(64, seed * 6364136223846793005n + 1n);
    return Number(seed >> 32n) % maximum;
  }
  return function* (fragments, insertions, joinSource) {
    for (let iteration = 0; iteration < 100; iteration++) {
      const parts = [];
      const count = 1 + next(3);
      for (let part = 0; part < count; part++) {
        parts.push(fragments[next(fragments.length)]);
      }
      const initial = joinSource(parts);
      let source = Buffer.from(initial);
      const edits = [];
      for (let step = 0; step < 5; step++) {
        const position = next(source.length + 1);
        const insert = next(2) === 0 || position === source.length;
        const edit = insert
          ? {
              byte: position,
              deleteBytes: 0,
              insert: insertions[next(insertions.length)],
            }
          : {
              byte: position,
              deleteBytes: Math.min(next(2) + 1, source.length - position),
              insert: "",
            };
        edits.push(edit);
        source = applyEdits(source, [edit]);
        yield {
          initial,
          source,
          edits: [...edits],
          context: `seed 1, iteration ${iteration}, source ${JSON.stringify(initial)}, edits ${JSON.stringify(edits)}`,
        };
      }
    }
  };
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

test("sed: fixed-seed generated histories converge", (context) => {
  const generateHistories = createEditHistoryGenerator();
  for (const grammar of grammars) {
    let checked = 0;
    for (const history of generateHistories(
      fragments,
      insertions,
      (parts) => `${parts.join("\n")}\n`,
    )) {
      const fresh = parse(grammar.scope, history.source);
      const incremental = parse(grammar.scope, history.initial, history.edits);
      assertIncrementalContract(
        fresh,
        incremental,
        `${grammar.name}: ${history.context}`,
      );
      checked += 1;
    }
    assert.equal(checked, 500);
    context.diagnostic(
      `${grammar.name}: checked ${checked} generated edit states`,
    );
  }
});

for (const grammar of grammars) {
  test(`${grammar.name}: every byte inside a Unicode payload can be deleted and repaired through an edit history`, () => {
    const brokenPayloads = [
      [0xa9, 0xf0, 0x9f, 0x98, 0x80],
      [0xc3, 0xf0, 0x9f, 0x98, 0x80],
      [0xc3, 0xa9, 0x9f, 0x98, 0x80],
      [0xc3, 0xa9, 0xf0, 0x98, 0x80],
      [0xc3, 0xa9, 0xf0, 0x9f, 0x80],
      [0xc3, 0xa9, 0xf0, 0x9f, 0x98],
    ];
    for (const [source, changed, payloadByte, owner, literal, suffix] of [
      [
        "s/a/é😀/p\np\n",
        "s/a/x/p\np\n",
        4,
        "replacement",
        "replacement_literal",
        "/p\np\n",
      ],
      [":é😀\np\n", ":x\np\n", 1, "label", "label_literal", "\np\n"],
      ["b é😀\np\n", "b x\np\n", 2, "label", "label_literal", "\np\n"],
      ["t é😀\np\n", "t x\np\n", 2, "label", "label_literal", "\np\n"],
      ["r é😀\np\n", "r x\np\n", 2, "rfile", "file_literal", "\np\n"],
      ["w é😀\np\n", "w x\np\n", 2, "wfile", "file_literal", "\np\n"],
      [
        "s/a/b/w é😀\np\n",
        "s/a/b/w x\np\n",
        8,
        "wfile",
        "file_literal",
        "\np\n",
      ],
    ]) {
      const prefix = Buffer.from(source).subarray(0, payloadByte);
      for (const [removedByte, brokenPayload] of brokenPayloads.entries()) {
        const edits = [
          { byte: payloadByte + removedByte, deleteBytes: 1, insert: "" },
          { byte: payloadByte, deleteBytes: 5, insert: "é😀" },
          { byte: payloadByte, deleteBytes: 6, insert: "x" },
          { byte: payloadByte, deleteBytes: 1, insert: "é😀" },
        ];
        const expected = [
          Buffer.concat([
            Buffer.from(prefix),
            Buffer.from(brokenPayload),
            Buffer.from(suffix),
          ]),
          Buffer.from(source),
          Buffer.from(changed),
          Buffer.from(source),
        ];
        for (const [step, expectedSource] of expected.entries()) {
          const history = edits.slice(0, step + 1);
          const label = `${JSON.stringify(source)}: UTF-8 byte ${removedByte}, edit ${step + 1}`;
          assert.deepEqual(applyEdits(source, history), expectedSource, label);
          const fresh = parse(grammar.scope, expectedSource);
          const incremental = parse(grammar.scope, source, history);
          assertIncrementalContract(fresh, incremental, label);
          for (const result of [fresh, incremental]) {
            const issues = issueSignatures(result.nodes);
            if (step === 0) {
              assert.ok(issues.length > 0, label);
              for (const issue of issues) {
                assert.equal(issue.outcome, "invalid_syntax", label);
                assert.equal(issue.reason, "invalid_encoding", label);
              }
              continue;
            }
            assert.equal(result.status, 0, label);
            assertNoNodes(result.nodes, "syntax_issue", "ERROR", "MISSING");
            const end = payloadByte + (step === 2 ? 1 : 6);
            assert.deepEqual(
              syntaxSignatures(result.nodes, [owner, literal]),
              [
                `${owner}: ${owner} [0, ${payloadByte}] - [0, ${end}]`,
                `  ${literal} [0, ${payloadByte}] - [0, ${end}]`,
              ],
              label,
            );
          }
        }
      }
    }
  });
}
