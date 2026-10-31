import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyEdits,
  assertIncrementalContract,
  assertValidHistory,
  parse,
  parseSuccessfully,
  relexedTokens,
} from "./support/parser.js";

for (const scope of ["source.sed", "source.sed.ere"]) {
  const group = scope.endsWith("ere") ? "(a|b)+" : "\\(a\\|b\\)\\+";
  for (const [name, source, steps] of [
    [
      "substitution delimiter",
      "s/a/b/",
      [
        { byte: 5, deleteBytes: 1, insert: "", source: "s/a/b", valid: false },
        { byte: 5, deleteBytes: 0, insert: "/", source: "s/a/b/", valid: true },
      ],
    ],
    [
      "duplicate flag",
      "s/a/b/g",
      [
        {
          byte: 7,
          deleteBytes: 0,
          insert: "g",
          source: "s/a/b/gg",
          valid: false,
        },
        {
          byte: 7,
          deleteBytes: 1,
          insert: "p",
          source: "s/a/b/gp",
          valid: true,
        },
      ],
    ],
    [
      "missing filename",
      "r ",
      [
        {
          byte: 2,
          deleteBytes: 0,
          insert: "file",
          source: "r file",
          valid: true,
        },
        { byte: 2, deleteBytes: 4, insert: "", source: "r ", valid: false },
        {
          byte: 2,
          deleteBytes: 0,
          insert: "next",
          source: "r next",
          valid: true,
        },
      ],
    ],
    [
      "zero address restriction",
      "0p",
      [
        {
          byte: 1,
          deleteBytes: 0,
          insert: ",/a/",
          source: "0,/a/p",
          valid: true,
        },
        { byte: 1, deleteBytes: 4, insert: "~2", source: "0~2p", valid: true },
        { byte: 2, deleteBytes: 1, insert: "0", source: "0~0p", valid: false },
        { byte: 2, deleteBytes: 1, insert: "3", source: "0~3p", valid: true },
      ],
    ],
    [
      "block closure",
      "{p",
      [
        { byte: 2, deleteBytes: 0, insert: "}", source: "{p}", valid: true },
        { byte: 1, deleteBytes: 0, insert: "1!", source: "{1!p}", valid: true },
      ],
    ],
    [
      "control escape pairing",
      String.raw`s/\c\./x/`,
      [
        {
          byte: 5,
          deleteBytes: 0,
          insert: "\\",
          source: String.raw`s/\c\\./x/`,
          valid: true,
        },
        {
          byte: 5,
          deleteBytes: 1,
          insert: "",
          source: String.raw`s/\c\./x/`,
          valid: false,
        },
        {
          byte: 5,
          deleteBytes: 0,
          insert: "\\",
          source: String.raw`s/\c\\./x/`,
          valid: true,
        },
      ],
    ],
    [
      "text EOF escape processing",
      "a x\\t",
      [
        {
          byte: 5,
          deleteBytes: 0,
          insert: "\\",
          source: "a x\\t\\",
          valid: true,
        },
        {
          byte: 6,
          deleteBytes: 0,
          insert: "\ny",
          source: "a x\\t\\\ny",
          valid: true,
        },
        {
          byte: 8,
          deleteBytes: 0,
          insert: "\np",
          source: "a x\\t\\\ny\np",
          valid: true,
        },
      ],
    ],
    [
      "BOM moves to byte zero",
      " \uFEFFp",
      [
        { byte: 0, deleteBytes: 1, insert: "", source: "\uFEFFp", valid: true },
        {
          byte: 0,
          deleteBytes: 0,
          insert: " ",
          source: " \uFEFFp",
          valid: false,
        },
        { byte: 0, deleteBytes: 1, insert: "", source: "\uFEFFp", valid: true },
      ],
    ],
    [
      "NUL filename prefix",
      "r x\0tail",
      [
        {
          byte: 2,
          deleteBytes: 1,
          insert: "",
          source: "r \0tail",
          valid: false,
        },
        {
          byte: 2,
          deleteBytes: 0,
          insert: "x",
          source: "r x\0tail",
          valid: true,
        },
      ],
    ],
  ]) {
    test(`${scope}: ${name} edits restore normal structure`, () => {
      assertValidHistory(scope, source, steps);
    });
  }

  for (const source of [
    `s/${group}/\\U&/g\np\n`,
    "{\n/ab/Ip;a hello\n}\n",
    String.raw`s5\x\5ba\x\5d5X5`,
    "s/[a-b---c]/x/",
    "s/[[:alpha:]]/x/",
    String.raw`s/\xce\xa3*/x/`,
    String.raw`s/[\xc3\xa9-\xff]/x/`,
    String.raw`y\abc\xyz\;p`,
    "a\\\nx\\c\\.\\",
    "0~2p;0,/a/p\n",
  ]) {
    test(`${scope}: deleting and restoring every byte of ${JSON.stringify(source)}`, () => {
      const expected = parseSuccessfully(scope, source);
      for (let byte = 0; byte < Buffer.byteLength(source); byte++) {
        const edits = [
          { byte, deleteBytes: 1, insert: "" },
          { byte, deleteBytes: 0, insert: source[byte] },
        ];
        assertIncrementalContract(
          expected,
          parse(scope, source, edits),
          `restore byte ${byte}`,
        );
      }
    });
  }

  test(`${scope}: NUL delimiters retain their boundaries across operand edits`, () => {
    for (const [source, changed] of [
      ["s\0a\0b\0p", "s\0c\0b\0p"],
      ["y\0a\0b\0;p", "y\0c\0b\0;p"],
      ["\\\0a\0p", "\\\0c\0p"],
    ]) {
      assertValidHistory(scope, source, [
        { byte: 2, deleteBytes: 1, insert: "c", source: changed, valid: true },
        { byte: 2, deleteBytes: 1, insert: "a", source, valid: true },
      ]);
    }
  });

  test(`${scope}: bounded seeded edits recover the normal CST`, () => {
    const source = `0,/a/{s/${group}/\\U&/g;p}\n`;
    const expected = parseSuccessfully(scope, source);
    const insertions = ["", "\\", "/", "[", "}", "Σ", "\n", "#"];
    let state = 0x5ed2026;
    for (let index = 0; index < 24; index++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const byte = state % source.length;
      const insert = insertions[index % insertions.length];
      const edit = { byte, deleteBytes: 1, insert };
      const damaged = applyEdits(source, [edit]);
      parse(scope, damaged);
      assertIncrementalContract(
        expected,
        parse(scope, source, [
          edit,
          {
            byte,
            deleteBytes: Buffer.byteLength(insert),
            insert: source[byte],
          },
        ]),
        `seeded edit ${index}`,
      );
    }
  });

  for (const [description, source, edit] of [
    [
      "insert first command",
      "  p\n".repeat(100),
      { byte: 0, deleteBytes: 0, insert: "p\n" },
    ],
    [
      "insert directive",
      "{p}\n".repeat(100),
      { byte: 0, deleteBytes: 0, insert: "#n\n" },
    ],
    [
      "delete directive",
      `#n\n${"{p}\n".repeat(100)}`,
      { byte: 0, deleteBytes: 3, insert: "" },
    ],
    [
      "replace middle regex character",
      "s/a/b/\n".repeat(100),
      { byte: 352, deleteBytes: 1, insert: "c" },
    ],
  ]) {
    test(`${scope}: ${description} reuses unchanged commands`, () => {
      const expected = parseSuccessfully(scope, applyEdits(source, [edit]));
      assertIncrementalContract(
        expected,
        parse(scope, source, [edit]),
        description,
      );
      const count = relexedTokens(scope, source, [edit]);
      assert.ok(count <= 10, `${description}: ${count} tokens re-lexed`);
    });
  }

  for (const [prefix, suffix] of [
    ["s/", "/x/"],
    ["s/a/", "/"],
    ["a ", "\n"],
    ["r ", "\n"],
    ["b ", "\n"],
    ["#", "\n"],
    ["y/", "/x/"],
  ]) {
    test(`${scope}: malformed UTF-8 in ${JSON.stringify(prefix)} repairs to a normal scalar`, () => {
      const source = Buffer.concat([
        Buffer.from(prefix),
        Buffer.from([0xff, 0xfe]),
        Buffer.from(suffix),
      ]);
      const expected = parseSuccessfully(scope, `${prefix}Σ${suffix}`);
      assert.equal(parse(scope, source).hasError, true);
      assertIncrementalContract(
        expected,
        parse(scope, source, [
          { byte: Buffer.byteLength(prefix), deleteBytes: 2, insert: "Σ" },
        ]),
        prefix,
      );
    });
  }
}

for (const scope of ["source.sed", "source.sed.ere"]) {
  for (const verb of ["a", "e"]) {
    for (const [name, suffix] of [
      ["four backslashes before a terminating newline", `${"\\".repeat(4)}\nx`],
      ["four backslashes at EOF", "\\".repeat(4)],
      [
        "two backslashes after the introducer continue the line",
        `${"\\".repeat(3)}\nx`,
      ],
    ]) {
      test(`${scope}: ${verb} ${name} preserves source boundaries across EOF edits`, () => {
        const source = `1${verb}${suffix}`;
        const original = parseSuccessfully(scope, source);
        const edit = source.endsWith("\nx")
          ? { byte: source.length - 2, deleteBytes: 2, insert: "" }
          : { byte: source.length, deleteBytes: 0, insert: "\nx" };
        const edited = applyEdits(source, [edit]);
        assertIncrementalContract(
          parseSuccessfully(scope, edited),
          parseSuccessfully(scope, source, [edit]),
          name,
        );
        const undo = {
          byte: edit.byte,
          deleteBytes: edit.insert.length,
          insert: source.slice(edit.byte, edit.byte + edit.deleteBytes),
        };
        assertIncrementalContract(
          original,
          parseSuccessfully(scope, source, [edit, undo]),
          `${name}: restored`,
        );
      });
    }
  }

  for (const { name, source } of [
    {
      name: "pattern",
      source: "s/\\cΣ*/x/",
    },
    {
      name: "address",
      source: "/^\\cΣ*$/p",
    },
    {
      name: "bracket",
      source: "s/[\\cΣ]/x/",
    },
    {
      name: "replacement",
      source: "s/x/\\cΣ/",
    },
    {
      name: "translation",
      source: "y/\\cΣ/x/",
    },
    { name: "text", source: "a x\\cΣ" },
    {
      name: "shell operand",
      source: "e x\\cΣ",
    },
  ]) {
    test(`${scope}: non-ASCII control escape in ${name} survives ASCII replacement and restoration`, () => {
      const original = parseSuccessfully(scope, source);
      const byte = Buffer.byteLength(source.slice(0, source.indexOf("Σ")));
      const edit = { byte, deleteBytes: Buffer.byteLength("Σ"), insert: "A" };
      assertIncrementalContract(
        parseSuccessfully(scope, applyEdits(source, [edit])),
        parseSuccessfully(scope, source, [edit]),
        `${name}: ASCII operand`,
      );
      assertIncrementalContract(
        original,
        parseSuccessfully(scope, source, [
          edit,
          { byte, deleteBytes: Buffer.byteLength(edit.insert), insert: "Σ" },
        ]),
        `${name}: restored UTF-8 operand`,
      );
    });
  }
}

for (const scope of ["source.sed", "source.sed.ere"]) {
  test(`${scope}: optional operands after a zero step range follow appended text`, () => {
    for (const [source, insert] of [
      ["0~0,/a/e ", ";"],
      ["0~0,/a/b ", "x"],
      ["0~0,/a/T ", "x"],
      ["0~0,/a/v ", "4"],
      ["0~,/a/l ", "5"],
    ]) {
      const edits = [
        { byte: Buffer.byteLength(source), deleteBytes: 0, insert },
      ];
      const fresh = parseSuccessfully(scope, applyEdits(source, edits));
      assertIncrementalContract(
        fresh,
        parseSuccessfully(scope, source, edits),
        `${JSON.stringify(source)} + ${JSON.stringify(insert)}`,
      );
    }
  });

  test(`${scope}: leading layout edits preserve directive placement`, () => {
    for (const edits of [
      [{ byte: 0, deleteBytes: 0, insert: " " }],
      [
        { byte: 0, deleteBytes: 0, insert: " " },
        { byte: 0, deleteBytes: 1, insert: "" },
      ],
    ]) {
      const source = "#n\np";
      assertIncrementalContract(
        parseSuccessfully(scope, applyEdits(source, edits)),
        parseSuccessfully(scope, source, edits),
        "leading layout",
      );
    }
  });

  for (const { source, suffix } of [
    {
      source: String.raw`/[[:a\c`,
      suffix: ",pha:]]/p",
    },
    { source: "/[[:a\\", suffix: "x6cpha:]]/p" },
    {
      source: String.raw`/[[:a\x6`,
      suffix: "cpha:]]/p",
    },
    {
      source: String.raw`/[[:a\o1`,
      suffix: "54pha:]]/p",
    },
    {
      source: String.raw`/[[:a\d1`,
      suffix: "08pha:]]/p",
    },
    {
      source: String.raw`/[[:a\x`,
      suffix: "6cpha:]]/p",
    },
    { source: String.raw`/[[:alph\d97`, suffix: ":]]/p" },
  ]) {
    test(`${scope}: character class escape completion ${JSON.stringify(source)}`, () => {
      const edits = [
        { byte: Buffer.byteLength(source), deleteBytes: 0, insert: suffix },
      ];
      const fresh = parseSuccessfully(scope, applyEdits(source, edits));
      assertIncrementalContract(
        fresh,
        parseSuccessfully(scope, source, edits),
        source,
      );
    });
  }

  test(`${scope}: incomplete control backslash can be completed at EOF`, () => {
    const source = "s/\\c\\";
    const edits = [{ byte: 5, deleteBytes: 0, insert: "\\./x/" }];
    const fresh = parseSuccessfully(scope, applyEdits(source, edits));
    assertIncrementalContract(
      fresh,
      parseSuccessfully(scope, source, edits),
      source,
    );
  });
}

for (const scope of ["source.sed", "source.sed.ere"]) {
  for (const flags of ["", "g"]) {
    test(`${scope}: CRLF completion and repair after flags ${JSON.stringify(flags)}`, () => {
      const prefix = `s/a/b/${flags}`;
      assertValidHistory(scope, `${prefix}\r`, [
        {
          byte: prefix.length + 1,
          deleteBytes: 0,
          insert: "\np",
          source: `${prefix}\r\np`,
          valid: true,
        },
        {
          byte: prefix.length + 1,
          deleteBytes: 0,
          insert: " ",
          source: `${prefix}\r \np`,
          valid: false,
        },
        {
          byte: prefix.length + 1,
          deleteBytes: 1,
          insert: "",
          source: `${prefix}\r\np`,
          valid: true,
        },
        {
          byte: prefix.length,
          deleteBytes: 1,
          insert: "",
          source: `${prefix}\np`,
          valid: true,
        },
      ]);
    });
  }
  for (const hyphens of ["------", "--------", String.raw`---\x2d-\o055`]) {
    test(`${scope}: edits through ${JSON.stringify(hyphens)} restore range grouping`, () => {
      const source = `/[a${hyphens}[:alpha:]]/p`;
      const expected = parseSuccessfully(scope, source);
      for (let byte = 3; byte < 3 + hyphens.length; byte++) {
        for (const insert of ["", "b", "--"]) {
          assertIncrementalContract(
            expected,
            parse(scope, source, [
              { byte, deleteBytes: 1, insert },
              { byte, deleteBytes: insert.length, insert: source[byte] },
            ]),
            `${source}: byte ${byte}, insertion ${insert}`,
          );
        }
      }
    });
  }
}

test("source.sed: literal interval syntax survives completion and repair", () => {
  assertValidHistory("source.sed", String.raw`s/a\b\{1\}/x/`, [
    {
      byte: 7,
      deleteBytes: 1,
      insert: "x",
      source: String.raw`s/a\b\{x\}/x/`,
      valid: false,
    },
    {
      byte: 7,
      deleteBytes: 1,
      insert: "1",
      source: String.raw`s/a\b\{1\}/x/`,
      valid: true,
    },
  ]);
  assertValidHistory("source.sed", String.raw`s/a\b\{`, [
    {
      byte: 7,
      deleteBytes: 0,
      insert: "1",
      source: String.raw`s/a\b\{1`,
      valid: false,
    },
    {
      byte: 8,
      deleteBytes: 0,
      insert: String.raw`\}/x/`,
      source: String.raw`s/a\b\{1\}/x/`,
      valid: true,
    },
  ]);
});
