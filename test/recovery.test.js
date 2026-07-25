const assert = require("node:assert/strict");
const { before, test } = require("node:test");
const { loadLanguages, Parser } = require("./support/wasm");

let parsers;

before(async () => {
  const languages = await loadLanguages();
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

function bodyTypes(tree) {
  return tree.rootNode
    .descendantsOfType("command")
    .map((command) => command.childForFieldName("body")?.type);
}

test("incomplete operands stop before the next physical line", () => {
  const cases = [
    ["posix-bre", "s/foo\np", "incomplete_regex"],
    ["gnu-bre", "s/a/b\np", "incomplete_replacement"],
    ["posix-bre", "y/foo\np", "incomplete_translate"],
    ["gnu-bre", "/foo\np", "incomplete_regex"],
  ];

  for (const [variant, source, marker] of cases) {
    const tree = parse(variant, source);
    assert.equal(
      tree.rootNode.descendantsOfType(marker).length,
      1,
      `${variant}: ${source}\n${tree.rootNode.toString()}`,
    );
    assert.ok(bodyTypes(tree).includes("print_command"), source);
  }
});

test("invalid intervals and an unclosed bracket preserve the next command", () => {
  const cases = [
    ["gnu-bre", "s#a\\{1,2,3\\}#x#\np\n"],
    ["gnu-ere", "s#a{1,2,3}#x#\np\n"],
    ["posix-bre", "s#[abc#x#\np\n"],
  ];

  for (const [variant, source] of cases) {
    const tree = parse(variant, source);
    assert.ok(
      bodyTypes(tree).includes("print_command"),
      `${variant}: ${source}\n${tree.rootNode.toString()}`,
    );
  }
});

test("malformed input preserves later command boundaries", () => {
  for (const source of ["r\np", ":\np"]) {
    for (const variant of ["posix-bre", "gnu-bre"]) {
      assert.ok(
        bodyTypes(parse(variant, source)).includes("print_command"),
        `${variant}: ${source}`,
      );
    }
  }

  for (const [variant, source, followingBody] of [
    ["posix-bre", "k junk;p", "print_command"],
    ["gnu-bre", "1,,,p;q", "quit_command"],
    ["posix-bre", "{k;p};q", "quit_command"],
  ]) {
    const tree = parse(variant, source);
    assert.ok(
      bodyTypes(tree).includes(followingBody),
      `${variant}: ${source}\n${tree.rootNode.toString()}`,
    );
  }

  for (const variant of ["posix-bre", "gnu-bre"]) {
    const tree = parse(variant, "{p");
    assert.equal(
      tree.rootNode.descendantsOfType("command_name")[0]?.text,
      "{",
      tree.rootNode.toString(),
    );
    assert.ok(bodyTypes(tree).includes("print_command"));
  }
});

test("CRLF separates commands while bare carriage returns remain data", () => {
  for (const variant of ["posix-bre", "gnu-bre"]) {
    const lines = parse(variant, "p\r\nd\n");
    assert.equal(lines.rootNode.hasError, false, lines.rootNode.toString());
    assert.deepEqual(texts(lines, "separator"), ["\r\n", "\n"]);

    const operand = parse(variant, `s/a\rb/c\rd/\np\n`);
    assert.equal(operand.rootNode.hasError, false, operand.rootNode.toString());
    assert.deepEqual(texts(operand, "regex"), ["a\rb"]);
    assert.deepEqual(texts(operand, "replacement"), ["c\rd"]);
  }

  assert.deepEqual(
    texts(parse("gnu-bre", "#x\rdata\np\n"), "comment_command"),
    ["#x\rdata"],
  );
});

test("line-consuming arguments keep punctuation as data", () => {
  const gnu = parse(
    "gnu-bre",
    "r input;#}\ne echo one;#}\na inline;#}\ns/a/b/w out;#}\n",
  );
  assert.equal(gnu.rootNode.hasError, false, gnu.rootNode.toString());
  assert.deepEqual(texts(gnu, "file_argument"), ["input;#}", "out;#}"]);
  assert.deepEqual(texts(gnu, "shell_argument"), ["echo one;#}"]);
  assert.deepEqual(texts(gnu, "text_argument"), ["inline;#}"]);

  const posix = parse("posix-bre", "r input;p\na\\\ntext\n");
  assert.equal(posix.rootNode.hasError, false, posix.rootNode.toString());
  assert.deepEqual(texts(posix, "file_argument"), ["input;p"]);
  assert.deepEqual(texts(posix, "text_argument"), ["text"]);
});

test("text continuation depends on trailing backslash parity", () => {
  const odd = parse("gnu-bre", "a hello\\\nworld\np\n");
  assert.equal(odd.rootNode.hasError, false, odd.rootNode.toString());
  assert.deepEqual(texts(odd, "text_argument"), ["hello\\\nworld"]);
  assert.deepEqual(texts(odd, "print_command"), ["p"]);

  const even = parse("gnu-bre", "a hello\\\\\np\n");
  assert.equal(even.rootNode.hasError, false, even.rootNode.toString());
  assert.deepEqual(texts(even, "text_argument"), ["hello\\\\"]);
  assert.deepEqual(texts(even, "print_command"), ["p"]);

  const posix = parse("posix-bre", "a\\\nhello\\\nworld\np\n");
  assert.equal(posix.rootNode.hasError, false, posix.rootNode.toString());
  assert.deepEqual(texts(posix, "text_argument"), ["hello\\\nworld"]);
});

test("EOF and control whitespace retain their syntax boundaries", () => {
  for (const variant of ["posix-bre", "gnu-bre"]) {
    for (const source of ["p", "s/a/b/", "y/a/b/"]) {
      assert.equal(parse(variant, source).rootNode.hasError, false, source);
    }
  }

  assert.deepEqual(texts(parse("posix-bre", "s/a"), "incomplete_regex"), [""]);
  assert.deepEqual(texts(parse("gnu-bre", "y/a/b"), "incomplete_translate"), [
    "",
  ]);

  const accepted = parse("gnu-bre", "\fp;\v q\n");
  assert.equal(accepted.rootNode.hasError, false, accepted.rootNode.toString());
  assert.equal(parse("gnu-bre", "1\fp\n").rootNode.hasError, true);
  assert.deepEqual(texts(parse("gnu-bre", "p\f"), "unexpected_text"), ["\f"]);
});

test("backslash and physical line endings are not delimiters", () => {
  for (const variant of ["posix-bre", "gnu-bre"]) {
    for (const source of ["s\\a\\b\\\n", "y\ra\rb\r\n", "s\na\nb\n"]) {
      assert.equal(parse(variant, source).rootNode.hasError, true, source);
    }
  }
});
