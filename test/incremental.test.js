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
      variant: "posix-sed-bre",
      name: "BRE substitution",
      source: "s|ab|cd|g\n",
      before: "s|ab|cd|",
      after: "s#ab#cd#",
    },
    {
      variant: "posix-sed-bre",
      name: "BRE escaped delimiter",
      source: "s#\\|#x#\n",
      before: "s#\\|#x#",
      after: "s|\\||x|",
    },
    {
      variant: "posix-sed-bre",
      name: "BRE context address",
      source: "\\|ab|p\n",
      before: "\\|ab|",
      after: "\\#ab#",
    },
    {
      variant: "posix-sed-bre",
      name: "BRE translation",
      source: "y|ab|cd|\n",
      before: "y|ab|cd|",
      after: "y#ab#cd#",
    },
    {
      variant: "posix-sed-ere",
      name: "ERE substitution",
      source: "s|a+?|cd|g\n",
      before: "s|a+?|cd|",
      after: "s#a+?#cd#",
    },
    {
      variant: "posix-sed-ere",
      name: "ERE context address",
      source: "\\|a+?|p\n",
      before: "\\|a+?|",
      after: "\\#a+?#",
    },
    {
      variant: "posix-sed-ere",
      name: "ERE translation",
      source: "y|ab|cd|\n",
      before: "y|ab|cd|",
      after: "y#ab#cd#",
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, () => {
      const tree = assertIncrementalEqualsFull(
        languages[fixture.variant],
        fixture.source,
        (source) => changedCharacters(source, fixture.before, fixture.after),
      );
      assert.equal(tree.rootNode.hasError, false);
    });
  }
});

test("edits between recovery and canonical syntax match full parses", () => {
  const cases = [
    {
      variant: "posix-sed-bre",
      source: "s|a|b\np\n",
      search: "b\n",
      replacement: "b|\n",
    },
    {
      variant: "posix-sed-ere",
      source: "/(ab/p\n",
      search: "ab/",
      replacement: "ab)/",
    },
    {
      variant: "posix-sed-ere",
      source: "/a{2/p\n",
      search: "2/",
      replacement: "2}/",
    },
    {
      variant: "posix-sed-ere",
      source: "/[a-[:alpha:]]/p\n",
      search: "[:alpha:]",
      replacement: "[.z.]",
    },
    {
      variant: "posix-sed-bre",
      source: "1, 2p\n",
      search: ", ",
      replacement: ",",
    },
    {
      variant: "posix-sed-bre",
      source: "1,2,3p\n",
      search: ",3",
      replacement: "",
    },
    {
      variant: "posix-sed-bre",
      source: "b;p\n",
      search: "b",
      replacement: "p",
    },
    {
      variant: "posix-sed-bre",
      source: "{ }\np\n",
      search: " ",
      replacement: ";",
    },
    {
      variant: "posix-sed-bre",
      source: "a\\\ntext\\\n",
      search: "text\\\n",
      replacement: "text\n",
    },
  ];

  for (const { variant, source, search, replacement } of cases) {
    const tree = assertIncrementalEqualsFull(
      languages[variant],
      source,
      (current) => [replace(current, search, replacement)],
    );
    assert.equal(tree.rootNode.hasError, false);
    assert.equal(
      tree.rootNode.descendantsOfType("syntax_issue").length,
      0,
      tree.rootNode.toString(),
    );
  }
});

test("script-leading #n suppression follows incremental edits", () => {
  for (const variant of ["posix-sed-bre", "posix-sed-ere"]) {
    const parser = parserFor(languages[variant]);
    let source = "#x\n";
    let tree = parser.parse(source);
    const stages = [
      { edit: (current) => replace(current, "x", "n"), expected: 1 },
      {
        edit: () => ({ startIndex: 0, oldEndIndex: 0, text: " " }),
        expected: 0,
      },
      { edit: (current) => replace(current, " ", ""), expected: 1 },
      { edit: (current) => replace(current, "n", "x"), expected: 0 },
    ];

    for (const { edit, expected } of stages) {
      source = applyEdits(tree, source, [edit(source)]);
      const incrementalTree = parser.parse(source, tree);
      const fullTree = parser.parse(source);

      assert.deepEqual(
        snapshot(incrementalTree.rootNode),
        snapshot(fullTree.rootNode),
      );
      assert.equal(
        incrementalTree.rootNode.descendantsOfType("default_output_suppression")
          .length,
        expected,
        `${variant}: ${JSON.stringify(source)}`,
      );
      tree = incrementalTree;
    }
  }
});

test("multiline operand edits match full parses", () => {
  assertIncrementalEqualsFull(
    languages["posix-sed-bre"],
    "a\\\nhello\\\nworld\np\n",
    (source) => [replace(source, "hello", "greeting")],
  );

  assertIncrementalEqualsFull(
    languages["posix-sed-bre"],
    "s|a|first\\\nsecond|\np\n",
    (source) => [replace(source, "first", "updated")],
  );

  assertIncrementalEqualsFull(
    languages["posix-sed-bre"],
    "y|ab|cd|\np\n",
    (source) => [replace(source, "ab", "a\\n")],
  );
});

test("substitution flag edits match full parses", () => {
  const tree = assertIncrementalEqualsFull(
    languages["posix-sed-bre"],
    "s/a/b/giw output\n",
    (source) => [replace(source, "gi", "gip")],
  );
  assert.equal(tree.rootNode.hasError, false);
  assert.equal(tree.rootNode.descendantsOfType("syntax_issue").length, 0);
  assert.deepEqual(
    tree.rootNode
      .descendantsOfType("substitution_flags")[0]
      ?.namedChildren.map(({ type }) => type),
    ["global_flag", "case_insensitive_flag", "print_flag", "write_flag"],
  );
});

test("regular-expression state edits match full parses", () => {
  const cases = [
    {
      variant: "posix-sed-bre",
      source: "/\\(a\\)/p\n",
      search: "\\)",
      replacement: "",
    },
    {
      variant: "posix-sed-ere",
      source: "/[[.].]]/p\n",
      search: "]",
      replacement: "a",
    },
    {
      variant: "posix-sed-ere",
      source: "/[.a.]/p\n",
      search: "a.",
      replacement: "a:",
    },
    {
      variant: "posix-sed-ere",
      source: "/a*b/p\n",
      search: "*",
      replacement: "*?",
    },
    {
      variant: "posix-sed-ere",
      source: "/a*?/p\n",
      search: "*?",
      replacement: "*+",
    },
    {
      variant: "posix-sed-ere",
      source: "/a*{2}/p\n",
      search: "{2}",
      replacement: "+??",
    },
    {
      variant: "posix-sed-bre",
      source: "/a*\\{2\\}/p\n",
      search: "*",
      replacement: "b",
    },
    {
      variant: "posix-sed-bre",
      source: "/a\\{255\\}/p\n",
      search: "255",
      replacement: "999999999999999999999999",
    },
    {
      variant: "posix-sed-bre",
      source: "/^a/p\n",
      search: "a",
      replacement: "^",
    },
    {
      variant: "posix-sed-ere",
      source: "/[[.a.]]/p\n",
      search: "a",
      replacement: "ch",
    },
    {
      variant: "posix-sed-bre",
      source: "/[%--]/p\n",
      search: "-]",
      replacement: "@]",
    },
  ];

  for (const { variant, source, search, replacement } of cases) {
    assertIncrementalEqualsFull(languages[variant], source, (current) => [
      replace(current, search, replacement),
    ]);
  }
});

test("incremental ranges remain UTF-16 based for atomic characters", () => {
  const tree = assertIncrementalEqualsFull(
    languages["posix-sed-bre"],
    "/cat/p\n",
    (source) => [replace(source, "cat", "😺犬")],
  );
  const characters = tree.rootNode.descendantsOfType("ordinary_character");
  assert.deepEqual(
    characters.map((node) => [node.text, node.startIndex, node.endIndex]),
    [
      ["😺", 1, 3],
      ["犬", 3, 4],
    ],
  );
});
