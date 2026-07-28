const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { before, test } = require("node:test");
const { languages: languageDefinitions } = require("../scripts/variants");
const { loadLanguages, Parser } = require("./support/wasm");

let languages;
let parsers;

before(async () => {
  languages = await loadLanguages();
  parsers = Object.fromEntries(
    Object.entries(languages).map(([variant, language]) => {
      const parser = new Parser();
      parser.setLanguage(language);
      return [variant, parser];
    }),
  );
});

function parse(variant, source) {
  return parsers[variant].parse(source);
}

function texts(tree, type) {
  return tree.rootNode.descendantsOfType(type).map((node) => node.text);
}

function bodies(tree) {
  return tree.rootNode
    .descendantsOfType("command")
    .map((command) => command.childForFieldName("body"))
    .filter(Boolean);
}

function only(tree, type) {
  const nodes = tree.rootNode.descendantsOfType(type);
  assert.equal(nodes.length, 1, tree.rootNode.toString());
  return nodes[0];
}

function regexParts(tree) {
  const regex = only(tree, "regex");
  return regex.namedChildren.map((node) => [node.type, node.text]);
}

test("the five Wasm modules expose working languages", () => {
  for (const { id, languageName } of languageDefinitions) {
    const language = languages[id];
    assert.equal(language.name, languageName);
    assert.equal(parsers[id].language, language);

    const tree = parse(id, "1,3s|föö|bår\\1|g\n");
    assert.equal(tree.rootNode.type, "script");
    assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
    assert.deepEqual(
      bodies(tree).map(({ type }) => type),
      ["substitute_command"],
    );
    assert.deepEqual(texts(tree, "backreference"), ["\\1"]);
  }
});

test("sed is the canonical GNU BRE language", () => {
  for (const source of [
    "e echo hi\n",
    "1~2s/\\(foo\\)\\+/\\L\\1/\n",
    "s/[[:alpha:]]\\{1,3\\}/x/g\n",
    "s/\\(unfinished/\np\n",
  ]) {
    const canonical = parse("sed", source);
    const explicit = parse("gnu-bre", source);
    assert.equal(
      canonical.rootNode.toString(),
      explicit.rootNode.toString(),
      source,
    );
    assert.equal(
      canonical.rootNode.hasError,
      explicit.rootNode.hasError,
      source,
    );
  }
});

test("commands expose one-character names and data-only arguments", () => {
  const cases = [
    ["posix-bre", "p\n", "print_command", "p", null, null],
    [
      "posix-bre",
      "r file name\n",
      "read_command",
      "r",
      "file_argument",
      "file name",
    ],
    [
      "posix-bre",
      "a\\\ntext\n",
      "append_command",
      "a",
      "text_argument",
      "text",
    ],
    ["gnu-bre", "q 42\n", "quit_command", "q", "numeric_argument", "42"],
    ["gnu-bre", "v 4.9\n", "version_command", "v", "version_argument", "4.9"],
    [
      "gnu-bre",
      "e echo hi\n",
      "execute_command",
      "e",
      "shell_argument",
      "echo hi",
    ],
  ];

  for (const [
    variant,
    source,
    bodyType,
    name,
    argumentType,
    argumentText,
  ] of cases) {
    const tree = parse(variant, source);
    assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
    const [body] = bodies(tree);
    const nameNode = body.childForFieldName("name");
    const argument = body.childForFieldName("argument");

    assert.deepEqual(
      [
        body.type,
        nameNode.type,
        nameNode.text,
        nameNode.endIndex - nameNode.startIndex,
      ],
      [bodyType, "command_name", name, 1],
    );
    if (argumentType === null) {
      assert.equal(argument, null);
    } else {
      assert.deepEqual(
        [argument.type, argument.text],
        [argumentType, argumentText],
      );
    }
  }

  for (const variant of ["posix-bre", "gnu-bre"]) {
    assert.equal(
      bodies(parse(variant, ": target\n"))[0].childForFieldName("argument")
        .type,
      "label_definition",
    );
    assert.equal(
      bodies(parse(variant, "b target\n"))[0].childForFieldName("argument")
        .type,
      "label_reference",
    );
  }
});

test("dynamic operands expose exact delimiter fields", async (t) => {
  const cases = [
    {
      name: "alternate regexp",
      source: "\\#x#p\n",
      owner: "escaped_regex_address",
      fields: [
        ["opening_delimiter", "#", 1],
        ["closing_delimiter", "#", 3],
      ],
    },
    {
      name: "substitute",
      source: "s|x|y|g\n",
      owner: "substitute_argument",
      fields: [
        ["opening_delimiter", "|", 1],
        ["middle_delimiter", "|", 3],
        ["closing_delimiter", "|", 5],
      ],
    },
    {
      name: "translate",
      source: "y|x|y|\n",
      owner: "translate_argument",
      fields: [
        ["opening_delimiter", "|", 1],
        ["middle_delimiter", "|", 3],
        ["closing_delimiter", "|", 5],
      ],
    },
  ];

  for (const variant of ["posix-bre", "gnu-bre"]) {
    for (const fixture of cases) {
      await t.test(`${variant}: ${fixture.name}`, () => {
        const tree = parse(variant, fixture.source);
        assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
        const owner = only(tree, fixture.owner);

        for (const [field, text, startIndex] of fixture.fields) {
          const delimiter = owner.childForFieldName(field);
          assert.deepEqual(
            [
              delimiter.text,
              delimiter.startIndex,
              delimiter.endIndex,
              delimiter.isNamed,
            ],
            [text, startIndex, startIndex + 1, true],
          );
        }
      });
    }
  }
});

test("regexp and replacement nodes preserve lexical facts", () => {
  const source =
    "/[^]a-z]/p\n/[[:alpha:]][[.ch.]][[=a=]]/p\ns#a\\#b#lit&\\1\\q\\##\n";

  for (const variant of ["posix-bre", "gnu-bre"]) {
    const tree = parse(variant, source);
    assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
    assert.deepEqual(texts(tree, "bracket_expression"), [
      "[^]a-z]",
      "[[:alpha:]]",
      "[[.ch.]]",
      "[[=a=]]",
    ]);
    assert.deepEqual(texts(tree, "posix_character_class"), ["[:alpha:]"]);
    assert.deepEqual(texts(tree, "collating_symbol"), ["[.ch.]"]);
    assert.deepEqual(texts(tree, "equivalence_class"), ["[=a=]"]);
    assert.deepEqual(texts(tree, "replacement_literal"), ["lit"]);
    assert.deepEqual(texts(tree, "match_reference"), ["&"]);
    assert.deepEqual(texts(tree, "backreference"), ["\\1"]);
    assert.deepEqual(texts(tree, "escape_sequence"), ["\\q"]);
    assert.deepEqual(texts(tree, "escaped_delimiter"), ["\\#", "\\#"]);
  }

  assert.deepEqual(
    texts(parse("posix-bre", "s#a#\\Lx\\E#"), "escape_sequence"),
    ["\\L", "\\E"],
  );
  assert.deepEqual(texts(parse("gnu-bre", "s#a#\\Lx\\E#"), "case_conversion"), [
    "\\L",
    "\\E",
  ]);
});

test("regexp punctuation exposes query-ready nodes and bracket fields", () => {
  const source = "s#^a.\\.\\n[^a-z]$#x#";
  const expectedParts = [
    ["regex_beginning_anchor", "^"],
    ["regex_literal", "a"],
    ["regex_wildcard", "."],
    ["regex_quoted_escape", "\\."],
    ["regex_newline_escape", "\\n"],
    ["bracket_expression", "[^a-z]"],
    ["regex_end_anchor", "$"],
  ];

  for (const { id } of languageDefinitions) {
    const tree = parse(id, source);
    assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
    assert.deepEqual(regexParts(tree), expectedParts, id);

    const bracket = only(tree, "bracket_expression");
    const opening = bracket.childForFieldName("opening_delimiter");
    const negation = bracket.childForFieldName("negation");
    const closing = bracket.childForFieldName("closing_delimiter");
    assert.deepEqual(
      [
        [opening.type, opening.text, opening.startIndex, opening.endIndex],
        [negation.type, negation.text, negation.startIndex, negation.endIndex],
        [closing.type, closing.text, closing.startIndex, closing.endIndex],
      ],
      [
        ["regex_bracket_delimiter", "[", 9, 10],
        ["regex_bracket_negation", "^", 10, 11],
        ["regex_bracket_delimiter", "]", 14, 15],
      ],
      id,
    );
    assert.deepEqual(texts(tree, "regex_bracket_literal"), ["a", "z"]);
    assert.deepEqual(texts(tree, "regex_bracket_hyphen"), ["-"]);
  }

  assert.deepEqual(
    texts(parse("posix-ere", "s#[\\n]#x#"), "regex_bracket_literal"),
    ["\\", "n"],
  );
  assert.deepEqual(
    texts(parse("gnu-ere", "s#[\\n]#x#"), "gnu_character_escape"),
    ["\\n"],
  );
});

test("BRE and ERE spellings expose the same normalized regexp nodes", () => {
  const posixExpected = [
    ["regex_group_open", "\\("],
    ["regex_literal", "ab"],
    ["regex_group_close", "\\)"],
    ["regex_interval", "\\{2,3\\}"],
  ];
  assert.deepEqual(
    regexParts(parse("posix-bre", "s#\\(ab\\)\\{2,3\\}#x#")),
    posixExpected,
  );
  assert.deepEqual(
    regexParts(parse("posix-ere", "s#(ab){2,3}#x#")).map(([type]) => type),
    posixExpected.map(([type]) => type),
  );

  const gnuExpectedTypes = [
    "regex_group_open",
    "regex_literal",
    "regex_one_or_more",
    "regex_alternation_operator",
    "regex_literal",
    "regex_zero_or_one",
    "regex_group_close",
    "regex_interval",
  ];
  assert.deepEqual(
    regexParts(parse("gnu-bre", "s#\\(a\\+\\|b\\?\\)\\{2,3\\}#x#")).map(
      ([type]) => type,
    ),
    gnuExpectedTypes,
  );
  assert.deepEqual(
    regexParts(parse("gnu-ere", "s#(a+|b?){2,3}#x#")).map(([type]) => type),
    gnuExpectedTypes,
  );
});

test("inactive BRE and ERE spellings stay literal or escaped", () => {
  assert.deepEqual(regexParts(parse("posix-bre", "s#()+?|{2}#x#")), [
    ["regex_literal", "("],
    ["regex_literal", ")"],
    ["regex_literal", "+"],
    ["regex_literal", "?"],
    ["regex_literal", "|"],
    ["regex_literal", "{"],
    ["regex_literal", "2"],
    ["regex_literal", "}"],
  ]);
  assert.deepEqual(
    regexParts(parse("posix-ere", "s#\\(\\)\\+\\?\\|\\{2\\}#x#")),
    [
      ["regex_quoted_escape", "\\("],
      ["regex_quoted_escape", "\\)"],
      ["regex_quoted_escape", "\\+"],
      ["regex_quoted_escape", "\\?"],
      ["regex_quoted_escape", "\\|"],
      ["regex_quoted_escape", "\\{"],
      ["regex_literal", "2"],
      ["regex_quoted_escape", "\\}"],
    ],
  );
});

test("regexp operator nodes preserve spelling without validating placement", () => {
  assert.deepEqual(regexParts(parse("posix-bre", "/*a**/p")), [
    ["regex_zero_or_more", "*"],
    ["regex_literal", "a"],
    ["regex_zero_or_more", "*"],
    ["regex_zero_or_more", "*"],
  ]);
  assert.deepEqual(regexParts(parse("gnu-bre", "/\\+\\?\\|\\{1\\}/p")), [
    ["regex_one_or_more", "\\+"],
    ["regex_zero_or_one", "\\?"],
    ["regex_alternation_operator", "\\|"],
    ["regex_interval", "\\{1\\}"],
  ]);
  assert.deepEqual(regexParts(parse("posix-ere", "/+a^*??/p")), [
    ["regex_one_or_more", "+"],
    ["regex_literal", "a"],
    ["regex_beginning_anchor", "^"],
    ["regex_zero_or_more", "*"],
    ["regex_zero_or_one", "?"],
    ["regex_zero_or_one", "?"],
  ]);
});

test("BRE anchors depend on branch position while ERE anchors do not", () => {
  assert.deepEqual(regexParts(parse("posix-bre", "/^a^b$c$/p")), [
    ["regex_beginning_anchor", "^"],
    ["regex_literal", "a"],
    ["regex_literal", "^"],
    ["regex_literal", "b"],
    ["regex_literal", "$"],
    ["regex_literal", "c"],
    ["regex_end_anchor", "$"],
  ]);
  assert.deepEqual(regexParts(parse("posix-ere", "/a^b$c/p")), [
    ["regex_literal", "a"],
    ["regex_beginning_anchor", "^"],
    ["regex_literal", "b"],
    ["regex_end_anchor", "$"],
    ["regex_literal", "c"],
  ]);
  assert.deepEqual(regexParts(parse("gnu-bre", "/\\(^a$\\)\\|^b$/p")), [
    ["regex_group_open", "\\("],
    ["regex_beginning_anchor", "^"],
    ["regex_literal", "a"],
    ["regex_end_anchor", "$"],
    ["regex_group_close", "\\)"],
    ["regex_alternation_operator", "\\|"],
    ["regex_beginning_anchor", "^"],
    ["regex_literal", "b"],
    ["regex_end_anchor", "$"],
  ]);
});

test("escaped metacharacter delimiters retain their regexp roles", () => {
  const cases = [
    {
      variant: "posix-ere",
      source: "s)(a\\))x)",
      expected: [
        ["regex_group_open", "("],
        ["regex_literal", "a"],
        ["regex_group_close", "\\)"],
      ],
    },
    {
      variant: "posix-ere",
      source: "s(\\(a)(x(",
      expected: [
        ["regex_group_open", "\\("],
        ["regex_literal", "a"],
        ["regex_group_close", ")"],
      ],
    },
    {
      variant: "posix-ere",
      source: "s|a\\|b|x|",
      expected: [
        ["regex_literal", "a"],
        ["regex_alternation_operator", "\\|"],
        ["regex_literal", "b"],
      ],
    },
    {
      variant: "posix-ere",
      source: "s+a\\++x+",
      expected: [
        ["regex_literal", "a"],
        ["regex_one_or_more", "\\+"],
      ],
    },
    {
      variant: "posix-ere",
      source: "s?a\\??x?",
      expected: [
        ["regex_literal", "a"],
        ["regex_zero_or_one", "\\?"],
      ],
    },
    {
      variant: "posix-bre",
      source: "s*a\\**x*",
      expected: [
        ["regex_literal", "a"],
        ["regex_zero_or_more", "\\*"],
      ],
    },
    {
      variant: "posix-ere",
      source: "s{a\\{1}{x{",
      expected: [
        ["regex_literal", "a"],
        ["regex_interval", "\\{1}"],
      ],
    },
    {
      variant: "posix-bre",
      source: "s[\\[a][x[",
      expected: [
        ["escaped_delimiter", "\\["],
        ["regex_literal", "a]"],
      ],
    },
    {
      variant: "gnu-bre",
      source: "s[\\[a][x[",
      expected: [["bracket_expression", "\\[a]"]],
    },
  ];

  for (const { variant, source, expected } of cases) {
    const tree = parse(variant, source);
    assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
    assert.deepEqual(regexParts(tree), expected, `${variant}: ${source}`);
  }
});

test("ERE intervals include an escaped closing-brace delimiter", () => {
  const tree = parse("posix-ere", "s}a{1\\}}x}");
  assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
  assert.deepEqual(regexParts(tree), [
    ["regex_literal", "a"],
    ["regex_interval", "{1\\}"],
  ]);
  assert.deepEqual(texts(tree, "delimiter"), ["}", "}", "}"]);
});

test("GNU intervals accept omitted lower and upper bounds", () => {
  assert.deepEqual(regexParts(parse("gnu-bre", "s#a\\{,2\\}b\\{,\\}#x#")), [
    ["regex_literal", "a"],
    ["regex_interval", "\\{,2\\}"],
    ["regex_literal", "b"],
    ["regex_interval", "\\{,\\}"],
  ]);
  assert.deepEqual(regexParts(parse("gnu-ere", "s#a{,2}b{,}#x#")), [
    ["regex_literal", "a"],
    ["regex_interval", "{,2}"],
    ["regex_literal", "b"],
    ["regex_interval", "{,}"],
  ]);
});

test("intervals include escaped digit and comma delimiters", () => {
  const cases = [
    {
      variant: "posix-bre",
      source: "s,a\\{1\\,2\\},x,",
      delimiter: ",",
      expectedParts: [
        ["regex_literal", "a"],
        ["regex_interval", "\\{1\\,2\\}"],
      ],
    },
    {
      variant: "posix-ere",
      source: "s,a{1\\,2},x,",
      delimiter: ",",
      expectedParts: [
        ["regex_literal", "a"],
        ["regex_interval", "{1\\,2}"],
      ],
    },
    {
      variant: "posix-bre",
      source: "s2a\\{4\\2\\}2x2",
      delimiter: "2",
      expectedParts: [
        ["regex_literal", "a"],
        ["regex_interval", "\\{4\\2\\}"],
      ],
    },
    {
      variant: "posix-ere",
      source: "s2a{4\\2}2x2",
      delimiter: "2",
      expectedParts: [
        ["regex_literal", "a"],
        ["regex_interval", "{4\\2}"],
      ],
    },
  ];

  for (const { variant, source, delimiter, expectedParts } of cases) {
    const tree = parse(variant, source);
    assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
    assert.deepEqual(regexParts(tree), expectedParts, source);
    assert.deepEqual(texts(tree, "delimiter"), [
      delimiter,
      delimiter,
      delimiter,
    ]);
  }
});

test("raw digit and comma delimiters end interval operands", () => {
  const cases = [
    {
      variant: "posix-bre",
      source: "s,a\\{1,X,",
      delimiter: ",",
      expectedParts: [
        ["regex_literal", "a"],
        ["regex_quoted_escape", "\\{"],
        ["regex_literal", "1"],
      ],
    },
    {
      variant: "posix-ere",
      source: "s,a{1,X,",
      delimiter: ",",
      expectedParts: [
        ["regex_literal", "a"],
        ["regex_literal", "{"],
        ["regex_literal", "1"],
      ],
    },
    {
      variant: "posix-bre",
      source: "s2a\\{42X2",
      delimiter: "2",
      expectedParts: [
        ["regex_literal", "a"],
        ["regex_quoted_escape", "\\{"],
        ["regex_literal", "4"],
      ],
    },
    {
      variant: "posix-ere",
      source: "s2a{42X2",
      delimiter: "2",
      expectedParts: [
        ["regex_literal", "a"],
        ["regex_literal", "{"],
        ["regex_literal", "4"],
      ],
    },
  ];

  for (const { variant, source, delimiter, expectedParts } of cases) {
    const tree = parse(variant, source);
    assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
    assert.deepEqual(regexParts(tree), expectedParts, source);
    assert.deepEqual(texts(tree, "delimiter"), [
      delimiter,
      delimiter,
      delimiter,
    ]);
    assert.deepEqual(texts(tree, "replacement_literal"), ["X"]);
  }
});

test("an invalid interval prefix does not hide a following interval", () => {
  const tree = parse("posix-bre", "s,a\\{\\}b\\{1\\},x,");
  assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
  assert.deepEqual(texts(tree, "regex_interval"), ["\\{1\\}"]);
});

test("GNU numeric escapes stop at raw delimiters and include escaped delimiters", () => {
  const cases = [
    {
      source: "s1\\x41X1p",
      delimiter: "1",
      expectedEscape: "\\x4",
    },
    {
      source: "s1\\x4\\11X1p",
      delimiter: "1",
      expectedEscape: "\\x4\\1",
    },
    {
      source: "s5\\d65X5p",
      delimiter: "5",
      expectedEscape: "\\d6",
    },
    {
      source: "s5\\d6\\55X5p",
      delimiter: "5",
      expectedEscape: "\\d6\\5",
    },
    {
      source: "s2\\o102X2p",
      delimiter: "2",
      expectedEscape: "\\o10",
    },
    {
      source: "s2\\o10\\22X2p",
      delimiter: "2",
      expectedEscape: "\\o10\\2",
    },
  ];

  for (const { source, delimiter, expectedEscape } of cases) {
    const tree = parse("gnu-bre", source);
    assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
    assert.deepEqual(
      texts(tree, "gnu_character_escape"),
      [expectedEscape],
      source,
    );
    assert.deepEqual(texts(tree, "delimiter"), [
      delimiter,
      delimiter,
      delimiter,
    ]);
    assert.deepEqual(texts(tree, "replacement_literal"), ["X"]);
    assert.deepEqual(texts(tree, "substitute_flags"), ["p"]);
  }
});

test("GNU numeric escapes preserve following bracket-local escape text", () => {
  const rawDelimiter = parse("gnu-bre", "s1[\\x41]1X1p");
  assert.equal(
    rawDelimiter.rootNode.hasError,
    false,
    rawDelimiter.rootNode.toString(),
  );
  assert.deepEqual(texts(rawDelimiter, "gnu_character_escape"), ["\\x41"]);

  const escapedDelimiter = parse("gnu-bre", "s1[\\x4\\1]1X1p");
  assert.equal(
    escapedDelimiter.rootNode.hasError,
    false,
    escapedDelimiter.rootNode.toString(),
  );
  assert.deepEqual(texts(escapedDelimiter, "gnu_character_escape"), ["\\x4"]);
  assert.deepEqual(texts(escapedDelimiter, "regex_escape"), ["\\1"]);
});

test("POSIX and GNU keep their syntax boundary", () => {
  const posixLabel = parse("posix-bre", ":loop;p");
  const gnuLabel = parse("gnu-bre", ":loop;p");
  assert.deepEqual(texts(posixLabel, "label_definition"), ["loop;p"]);
  assert.deepEqual(texts(gnuLabel, "label_definition"), ["loop"]);
  assert.deepEqual(
    bodies(gnuLabel).map(({ type }) => type),
    ["label_command", "print_command"],
  );

  for (const source of ["bfoo;p", "rfile", "a text", "{p}"]) {
    assert.equal(parse("posix-bre", source).rootNode.hasError, true, source);
    assert.equal(parse("gnu-bre", source).rootNode.hasError, false, source);
  }
});

test("GNU labels stop before comments and closing braces", () => {
  const source =
    ":commented # definition\n{:closed}\nb commented # reference\n{t closed}\n";

  for (const variant of ["gnu-bre", "gnu-ere"]) {
    const tree = parse(variant, source);
    assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
    assert.deepEqual(texts(tree, "label_definition"), ["commented", "closed"]);
    assert.deepEqual(texts(tree, "label_reference"), ["commented", "closed"]);
  }
});

test("source ranges use JavaScript UTF-16 offsets", () => {
  for (const variant of ["posix-bre", "gnu-bre"]) {
    const tree = parse(variant, "s|😺|犬|g");
    const argument = only(tree, "substitute_argument");
    assert.deepEqual(
      [
        argument.childForFieldName("opening_delimiter"),
        argument.childForFieldName("middle_delimiter"),
        argument.childForFieldName("closing_delimiter"),
      ].map((node) => [node.startIndex, node.endIndex]),
      [
        [1, 2],
        [4, 5],
        [6, 7],
      ],
    );
    assert.deepEqual(
      [only(tree, "regex_literal"), only(tree, "replacement_literal")].map(
        (node) => [node.text, node.startIndex, node.endIndex],
      ),
      [
        ["😺", 2, 4],
        ["犬", 5, 6],
      ],
    );
  }
});

function generated(variant, file) {
  return JSON.parse(
    readFileSync(join(__dirname, "..", variant, "src", `${file}.json`), "utf8"),
  );
}

function generatedNodeTypes(variant) {
  return new Map(
    generated(variant, "node-types")
      .filter(({ named }) => named)
      .map((definition) => [definition.type, definition]),
  );
}

test("generated files expose five languages with shared contracts", () => {
  for (const { dialect, directory, languageName } of languageDefinitions) {
    const grammar = generated(directory, "grammar");
    assert.equal(grammar.name, languageName);

    for (const rule of [
      "execute_command",
      "periodic_address",
      "test_failure_command",
    ]) {
      assert.equal(
        rule in grammar.rules,
        dialect === "gnu",
        `${directory}:${rule}`,
      );
    }
  }

  for (const { directory } of languageDefinitions) {
    const types = generatedNodeTypes(directory);
    assert.deepEqual(Object.keys(types.get("command").fields).sort(), [
      "addresses",
      "body",
      "negation",
    ]);

    for (const argumentType of ["substitute_argument", "translate_argument"]) {
      const fields = types.get(argumentType).fields;
      for (const field of [
        "opening_delimiter",
        "middle_delimiter",
        "closing_delimiter",
      ]) {
        assert.equal(fields[field].required, true);
        assert.deepEqual(
          fields[field].types.map(({ type }) => type),
          ["delimiter"],
        );
      }
    }

    for (const type of [
      "regex_group_open",
      "regex_group_close",
      "regex_alternation_operator",
      "regex_zero_or_more",
      "regex_one_or_more",
      "regex_zero_or_one",
      "regex_interval",
      "regex_backreference",
    ]) {
      assert.equal(types.has(type), true, `${directory}:${type}`);
    }
  }
});
