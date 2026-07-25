const assert = require("node:assert/strict");
const { before, test } = require("node:test");
const { loadLanguages, Parser } = require("./support/wasm");

let parsers;

before(async () => {
  const languages = await loadLanguages();
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

function bodyTypes(tree) {
  return tree.rootNode
    .descendantsOfType("command")
    .map((command) => command.childForFieldName("body")?.type);
}

test("incomplete operands stop before the next physical line", () => {
  const cases = [
    ["posix", "s/foo\np", "incomplete_regex"],
    ["gnu", "s/a/b\np", "incomplete_replacement"],
    ["posix", "y/foo\np", "incomplete_translate"],
    ["gnu", "/foo\np", "incomplete_regex"],
  ];

  for (const [dialect, source, marker] of cases) {
    const tree = parse(dialect, source);
    assert.equal(
      tree.rootNode.descendantsOfType(marker).length,
      1,
      `${dialect}: ${source}\n${tree.rootNode.toString()}`,
    );
    assert.ok(bodyTypes(tree).includes("print_command"), source);
  }
});

test("malformed input preserves later command boundaries", () => {
  for (const source of ["r\np", ":\np"]) {
    for (const dialect of ["posix", "gnu"]) {
      assert.ok(
        bodyTypes(parse(dialect, source)).includes("print_command"),
        `${dialect}: ${source}`,
      );
    }
  }

  for (const [dialect, source, followingBody] of [
    ["posix", "k junk;p", "print_command"],
    ["gnu", "1,,,p;q", "quit_command"],
    ["posix", "{k;p};q", "quit_command"],
  ]) {
    const tree = parse(dialect, source);
    assert.ok(
      bodyTypes(tree).includes(followingBody),
      `${dialect}: ${source}\n${tree.rootNode.toString()}`,
    );
  }

  for (const dialect of ["posix", "gnu"]) {
    const tree = parse(dialect, "{p");
    assert.equal(
      tree.rootNode.descendantsOfType("command_name")[0]?.text,
      "{",
      tree.rootNode.toString(),
    );
    assert.ok(bodyTypes(tree).includes("print_command"));
  }
});

test("CRLF separates commands while bare carriage returns remain data", () => {
  for (const dialect of ["posix", "gnu"]) {
    const lines = parse(dialect, "p\r\nd\n");
    assert.equal(lines.rootNode.hasError, false, lines.rootNode.toString());
    assert.deepEqual(texts(lines, "separator"), ["\r\n", "\n"]);

    const operand = parse(dialect, `s/a\rb/c\rd/\np\n`);
    assert.equal(operand.rootNode.hasError, false, operand.rootNode.toString());
    assert.deepEqual(texts(operand, "regex"), ["a\rb"]);
    assert.deepEqual(texts(operand, "replacement"), ["c\rd"]);
  }

  assert.deepEqual(texts(parse("gnu", "#x\rdata\np\n"), "comment_command"), [
    "#x\rdata",
  ]);
});

test("line-consuming arguments keep punctuation as data", () => {
  const gnu = parse(
    "gnu",
    "r input;#}\ne echo one;#}\na inline;#}\ns/a/b/w out;#}\n",
  );
  assert.equal(gnu.rootNode.hasError, false, gnu.rootNode.toString());
  assert.deepEqual(texts(gnu, "file_argument"), ["input;#}", "out;#}"]);
  assert.deepEqual(texts(gnu, "shell_argument"), ["echo one;#}"]);
  assert.deepEqual(texts(gnu, "text_argument"), ["inline;#}"]);

  const posix = parse("posix", "r input;p\na\\\ntext\n");
  assert.equal(posix.rootNode.hasError, false, posix.rootNode.toString());
  assert.deepEqual(texts(posix, "file_argument"), ["input;p"]);
  assert.deepEqual(texts(posix, "text_argument"), ["text"]);
});

test("text continuation depends on trailing backslash parity", () => {
  const odd = parse("gnu", "a hello\\\nworld\np\n");
  assert.equal(odd.rootNode.hasError, false, odd.rootNode.toString());
  assert.deepEqual(texts(odd, "text_argument"), ["hello\\\nworld"]);
  assert.deepEqual(texts(odd, "print_command"), ["p"]);

  const even = parse("gnu", "a hello\\\\\np\n");
  assert.equal(even.rootNode.hasError, false, even.rootNode.toString());
  assert.deepEqual(texts(even, "text_argument"), ["hello\\\\"]);
  assert.deepEqual(texts(even, "print_command"), ["p"]);

  const posix = parse("posix", "a\\\nhello\\\nworld\np\n");
  assert.equal(posix.rootNode.hasError, false, posix.rootNode.toString());
  assert.deepEqual(texts(posix, "text_argument"), ["hello\\\nworld"]);
});

test("EOF and control whitespace retain their syntax boundaries", () => {
  for (const dialect of ["posix", "gnu"]) {
    for (const source of ["p", "s/a/b/", "y/a/b/"]) {
      assert.equal(parse(dialect, source).rootNode.hasError, false, source);
    }
  }

  assert.deepEqual(texts(parse("posix", "s/a"), "incomplete_regex"), [""]);
  assert.deepEqual(texts(parse("gnu", "y/a/b"), "incomplete_translate"), [""]);

  const accepted = parse("gnu", "\fp;\v q\n");
  assert.equal(accepted.rootNode.hasError, false, accepted.rootNode.toString());
  assert.equal(parse("gnu", "1\fp\n").rootNode.hasError, true);
  assert.deepEqual(texts(parse("gnu", "p\f"), "unexpected_text"), ["\f"]);
});

test("backslash and physical line endings are not delimiters", () => {
  for (const dialect of ["posix", "gnu"]) {
    for (const source of ["s\\a\\b\\\n", "y\ra\rb\r\n", "s\na\nb\n"]) {
      assert.equal(parse(dialect, source).rootNode.hasError, true, source);
    }
  }
});
