const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { before, test } = require("node:test");
const { loadLanguages, Parser } = require("./support/wasm");

let languages;
let parsers;

before(async () => {
  languages = await loadLanguages();
  parsers = Object.fromEntries(
    Object.entries(languages).map(([dialect, language]) => {
      const parser = new Parser();
      parser.setLanguage(language);
      return [dialect, parser];
    }),
  );
});

function parse(dialect, source) {
  return parsers[dialect].parse(source);
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

test("the Wasm modules expose working POSIX and GNU languages", () => {
  for (const [dialect, language] of Object.entries(languages)) {
    assert.equal(language.name, `sed_${dialect}`);
    assert.equal(parsers[dialect].language, language);

    const tree = parse(dialect, "1,3s|föö|bår\\1|g\n");
    assert.equal(tree.rootNode.type, "script");
    assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
    assert.deepEqual(
      bodies(tree).map(({ type }) => type),
      ["substitute_command"],
    );
    assert.deepEqual(texts(tree, "backreference"), ["\\1"]);
  }
});

test("commands expose one-character names and data-only arguments", () => {
  const cases = [
    ["posix", "p\n", "print_command", "p", null, null],
    [
      "posix",
      "r file name\n",
      "read_command",
      "r",
      "file_argument",
      "file name",
    ],
    ["posix", "a\\\ntext\n", "append_command", "a", "text_argument", "text"],
    ["gnu", "q 42\n", "quit_command", "q", "numeric_argument", "42"],
    ["gnu", "v 4.9\n", "version_command", "v", "version_argument", "4.9"],
    ["gnu", "e echo hi\n", "execute_command", "e", "shell_argument", "echo hi"],
  ];

  for (const [
    dialect,
    source,
    bodyType,
    name,
    argumentType,
    argumentText,
  ] of cases) {
    const tree = parse(dialect, source);
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

  for (const dialect of ["posix", "gnu"]) {
    assert.equal(
      bodies(parse(dialect, ": target\n"))[0].childForFieldName("argument")
        .type,
      "label_definition",
    );
    assert.equal(
      bodies(parse(dialect, "b target\n"))[0].childForFieldName("argument")
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

  for (const dialect of ["posix", "gnu"]) {
    for (const fixture of cases) {
      await t.test(`${dialect}: ${fixture.name}`, () => {
        const tree = parse(dialect, fixture.source);
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

  for (const dialect of ["posix", "gnu"]) {
    const tree = parse(dialect, source);
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

  assert.deepEqual(texts(parse("posix", "s#a#\\Lx\\E#"), "escape_sequence"), [
    "\\L",
    "\\E",
  ]);
  assert.deepEqual(texts(parse("gnu", "s#a#\\Lx\\E#"), "case_conversion"), [
    "\\L",
    "\\E",
  ]);
});

test("POSIX and GNU keep their syntax boundary", () => {
  const posixLabel = parse("posix", ":loop;p");
  const gnuLabel = parse("gnu", ":loop;p");
  assert.deepEqual(texts(posixLabel, "label_definition"), ["loop;p"]);
  assert.deepEqual(texts(gnuLabel, "label_definition"), ["loop"]);
  assert.deepEqual(
    bodies(gnuLabel).map(({ type }) => type),
    ["label_command", "print_command"],
  );

  for (const source of ["bfoo;p", "rfile", "a text", "{p}"]) {
    assert.equal(parse("posix", source).rootNode.hasError, true, source);
    assert.equal(parse("gnu", source).rootNode.hasError, false, source);
  }
});

test("source ranges use JavaScript UTF-16 offsets", () => {
  for (const dialect of ["posix", "gnu"]) {
    const tree = parse(dialect, "s|😺|犬|g");
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

function generated(dialect, file) {
  return JSON.parse(
    readFileSync(join(__dirname, "..", dialect, "src", `${file}.json`), "utf8"),
  );
}

function generatedNodeTypes(dialect) {
  return new Map(
    generated(dialect, "node-types")
      .filter(({ named }) => named)
      .map((definition) => [definition.type, definition]),
  );
}

test("generated files expose the same two language contracts", () => {
  const posixGrammar = generated("posix", "grammar");
  const gnuGrammar = generated("gnu", "grammar");
  assert.equal(posixGrammar.name, "sed_posix");
  assert.equal(gnuGrammar.name, "sed_gnu");

  for (const rule of [
    "execute_command",
    "periodic_address",
    "test_failure_command",
  ]) {
    assert.equal(rule in posixGrammar.rules, false, rule);
    assert.equal(rule in gnuGrammar.rules, true, rule);
  }

  for (const dialect of ["posix", "gnu"]) {
    const types = generatedNodeTypes(dialect);
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
  }
});
