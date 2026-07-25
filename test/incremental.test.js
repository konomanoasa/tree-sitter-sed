const assert = require("node:assert/strict");
const { before, test } = require("node:test");
const { loadLanguages, Parser } = require("./support/wasm");

let languages;

before(async () => {
  languages = await loadLanguages();
});

function parserFor(language) {
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}

function pointAt(source, index) {
  let row = 0;
  let column = 0;
  for (let offset = 0; offset < index; offset += 1) {
    if (source[offset] === "\n") {
      row += 1;
      column = 0;
    } else {
      column += 1;
    }
  }
  return { row, column };
}

function applyEdits(tree, source, edits) {
  let updated = source;
  for (const { startIndex, oldEndIndex, text } of edits) {
    const next =
      updated.slice(0, startIndex) + text + updated.slice(oldEndIndex);
    tree.edit({
      startIndex,
      oldEndIndex,
      newEndIndex: startIndex + text.length,
      startPosition: pointAt(updated, startIndex),
      oldEndPosition: pointAt(updated, oldEndIndex),
      newEndPosition: pointAt(next, startIndex + text.length),
    });
    updated = next;
  }
  return updated;
}

function replace(source, search, text) {
  const startIndex = source.indexOf(search);
  assert.notEqual(startIndex, -1, `missing edit target: ${search}`);
  return {
    startIndex,
    oldEndIndex: startIndex + search.length,
    text,
  };
}

function changedCharacters(source, before, after) {
  assert.equal(before.length, after.length);
  const startIndex = source.indexOf(before);
  assert.notEqual(startIndex, -1, `missing edit target: ${before}`);

  const edits = [];
  for (let index = 0; index < before.length; index += 1) {
    if (before[index] !== after[index]) {
      edits.push({
        startIndex: startIndex + index,
        oldEndIndex: startIndex + index + 1,
        text: after[index],
      });
    }
  }
  return edits;
}

function snapshot(node, field = null) {
  return {
    type: node.type,
    named: node.isNamed,
    missing: node.isMissing,
    range: [
      node.startIndex,
      node.endIndex,
      node.startPosition.row,
      node.startPosition.column,
      node.endPosition.row,
      node.endPosition.column,
    ],
    field,
    children: Array.from({ length: node.childCount }, (_, index) =>
      snapshot(node.child(index), node.fieldNameForChild(index) ?? null),
    ),
  };
}

function assertIncrementalEqualsFull(language, source, makeEdits) {
  const parser = parserFor(language);
  const previousTree = parser.parse(source);
  const updatedSource = applyEdits(previousTree, source, makeEdits(source));
  const incrementalTree = parser.parse(updatedSource, previousTree);
  const fullTree = parser.parse(updatedSource);

  assert.deepEqual(
    snapshot(incrementalTree.rootNode),
    snapshot(fullTree.rootNode),
  );
  return incrementalTree;
}

test("dynamic delimiter edits restore every scanner mode", async (t) => {
  const cases = [
    {
      language: languages.posix,
      name: "substitute",
      source: "s|a\\|b|c\\|d|g\n",
      before: "s|a\\|b|c\\|d|",
      after: "s#a\\|b#c\\|d#",
    },
    {
      language: languages.posix,
      name: "regexp address",
      source: "\\|a\\|b|p\n",
      before: "\\|a\\|b|",
      after: "\\#a\\|b#",
    },
    {
      language: languages.posix,
      name: "translate",
      source: "y|a\\|b|c\\|d|\n",
      before: "y|a\\|b|c\\|d|",
      after: "y#a\\|b#c\\|d#",
    },
    {
      language: languages.gnu,
      name: "GNU substitute",
      source: "s|a\\|b|c\\|d|g\n",
      before: "s|a\\|b|c\\|d|",
      after: "s#a\\|b#c\\|d#",
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, () => {
      const tree = assertIncrementalEqualsFull(
        fixture.language,
        fixture.source,
        (source) => changedCharacters(source, fixture.before, fixture.after),
      );
      assert.equal(tree.rootNode.hasError, false);
    });
  }
});

test("line-ending and multiline edits match full parses", () => {
  assertIncrementalEqualsFull(languages.posix, "s/a/b/\np\n", (source) => [
    replace(source, "\n", "\r\n"),
  ]);
  assertIncrementalEqualsFull(languages.gnu, "s|a\\\nb|c|g\np\n", (source) => [
    replace(source, "a\\\nb", "a\\\n😺b"),
  ]);
  assertIncrementalEqualsFull(languages.gnu, "a hello\\\\\np\n", (source) => [
    replace(source, "hello\\\\", "hello\\"),
  ]);
});

test("completing and removing delimiters match full parses", () => {
  const completed = assertIncrementalEqualsFull(
    languages.posix,
    "s|a|b\np\n",
    (source) => [replace(source, "b\n", "b|\n")],
  );
  assert.equal(completed.rootNode.hasError, false);

  assertIncrementalEqualsFull(languages.gnu, "y|ab|cd|\np\n", (source) => [
    replace(source, "cd|", "cd"),
  ]);
});

test("incremental ranges remain UTF-16 based", () => {
  const tree = assertIncrementalEqualsFull(
    languages.gnu,
    "s|cat|犬|g\n",
    (source) => [replace(source, "cat", "😺cat")],
  );
  const pattern = tree.rootNode.descendantsOfType("regex_literal")[0];
  assert.deepEqual(
    [pattern.text, pattern.startIndex, pattern.endIndex],
    ["😺cat", 2, 7],
  );
});

function countNodes(node) {
  let count = 1;
  for (let index = 0; index < node.childCount; index += 1) {
    count += countNodes(node.child(index));
  }
  return count;
}

test("a long unterminated operand produces a bounded tree", () => {
  for (const language of [languages.posix, languages.gnu]) {
    const parser = parserFor(language);
    const small = parser.parse(`s|${"a".repeat(32 * 1_024)}`);
    const large = parser.parse(`s|${"a".repeat(128 * 1_024)}`);

    assert.ok(countNodes(large.rootNode) <= countNodes(small.rootNode) + 8);
  }
});
