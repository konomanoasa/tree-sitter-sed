import assert from "node:assert/strict";
import { test } from "node:test";
import { issueSignatures } from "./support/cst.js";
import {
  applyEdits,
  assertIncrementalContract,
  parse,
  parseSuccessfully,
  relexedTokens,
} from "./support/parser.js";

const reuseCommandCount = 100;
const maxRelexedTokens = 10;

for (const scope of ["source.sed", "source.sed.ere"]) {
  const group = scope.endsWith("ere") ? "(a|b)+" : "\\(a\\|b\\)\\+";

  for (const source of [
    `s/${group}/\\U&/g\np\n`,
    "{\n/ab/Ip;a hello\n}\n",
    "s/\\x5ba\\x5d/x/\n",
    "s/\\xce\\xa3*/x/\n",
    String.raw`s\b\X\p`,
    String.raw`y\abc\xyz\;p`,
    String.raw`\\b\p`,
    "a x\\t\\",
    "a x\\c\\.\\",
    "a x\\t\\\ny\\n\\",
    "e x\\t\\",
    "e\\\nx\\t",
    "e\\\\t\\",
    "a\\\\\\",
    "e\\\\\\",
    String.raw`e x\c\y`,
    String.raw`s5\x6\55X5p`,
    String.raw`s5\x6\65X5p`,
    String.raw`s5\x\5ba\x\5d5X5`,
    "p;   ,2p",
    "{   ,2p}",
    "/[!---0]/p",
    "/[a-b---c]/p",
    String.raw`/[a-\x2d-c]/p`,
    String.raw`/[a--\x2dc]/p`,
    String.raw`s/[\\-\\-a]/x/`,
    String.raw`s-[\-\\-\]--`,
    String.raw`s/\x5b\\-\\-a]/x/`,
    String.raw`s/[\\n]/x/`,
    String.raw`s/[[.\\.]]/x/`,
    scope.endsWith("ere")
      ? String.raw`s/a{1b2,\q34d5}/x/`
      : String.raw`s/a\{1b2,\q34d5\}/x/`,
    scope.endsWith("ere")
      ? String.raw`s/a{ab,2x,,y3\q4\x615}/x/`
      : String.raw`s/a\{}a}c},2x,,y3\q4\x615\}/x/`,
  ]) {
    test(`${scope}: deletion and restoration in ${JSON.stringify(source)}`, () => {
      const expected = parseSuccessfully(scope, source);
      for (let byte = 0; byte < Buffer.byteLength(source); byte++) {
        const edits = [{ byte, deleteBytes: 1, insert: "" }];
        const edited = applyEdits(source, edits);
        const fresh = parse(scope, edited);
        assertIncrementalContract(
          fresh,
          parse(scope, source, edits),
          `delete byte ${byte}`,
        );
        const restored = [{ byte, deleteBytes: 0, insert: source[byte] }];
        assertIncrementalContract(
          expected,
          parse(scope, source, [...edits, ...restored]),
          `restore byte ${byte}`,
        );
      }
    });
  }

  for (const source of [
    "s/[[:alpha:]]/word/g\n",
    "0~2p;0,/a/p\n",
    "3,0~4p\n",
    "/[[....]]/p\n",
    "/[[:alpha:]-]/p\n",
    "/[a-b-]/p\n",
    "s/a\\{1\\x2c\\}/x/\n",
    "/a{1\\x2c}/p\n",
    "/a\\{1\\x5c\\x7d/p\n",
    "/a\\b\\{1\\x5c}/p\n",
    "/\\o510/p\n",
    "/\\d420/p\n",
    "/[[:alpha\\x3a]:]]/p\n",
    "s3a\\{1\\x\\30\\}3x3\n",
    "s3a{1\\x\\30}3x3\n",
    "/[0-z-\\o135]/p\n",
    "/[!---0]/p\n",
    "/[a-b---c]/p\n",
    String.raw`/[a-b-\x2d-c]/p`,
    String.raw`/[a-b--\x2dc]/p`,
    "ax\\c\\.\\",
    "e x\\c\\y\\",
    "a\\\nx\\c\\.\\",
    "e x\\c\\\np\\",
  ]) {
    test(`${scope}: appending source through incomplete states: ${JSON.stringify(source)}`, () => {
      for (let end = 1; end <= source.length; end++) {
        const before = source.slice(0, end - 1);
        const edits = [
          { byte: end - 1, deleteBytes: 0, insert: source[end - 1] },
        ];
        const fresh = parse(scope, source.slice(0, end));
        assert.deepEqual(
          issueSignatures(fresh.nodes).filter(
            ({ outcome }) => outcome !== "incomplete_syntax",
          ),
          [],
          `${JSON.stringify(source.slice(0, end))} has determined issues`,
        );
        assertIncrementalContract(
          fresh,
          parse(scope, before, edits),
          `prefix ${end} of ${JSON.stringify(source)}`,
        );
      }
    });
  }

  for (const [description, source, edit] of [
    [
      "insert a line before blank-led commands",
      "  p\n".repeat(reuseCommandCount),
      { byte: 0, deleteBytes: 0, insert: "p\n" },
    ],
    [
      "insert #n before blank-led commands",
      "  p\n".repeat(reuseCommandCount),
      { byte: 0, deleteBytes: 0, insert: "#n\n" },
    ],
    [
      "delete the first line",
      `q\n${"s/a/b/\n".repeat(reuseCommandCount)}`,
      { byte: 0, deleteBytes: 2, insert: "" },
    ],
    [
      "delete #n",
      `#n\n${"{p}\n".repeat(reuseCommandCount)}`,
      { byte: 0, deleteBytes: 3, insert: "" },
    ],
    [
      "insert #n",
      "{p}\n".repeat(reuseCommandCount),
      { byte: 0, deleteBytes: 0, insert: "#n\n" },
    ],
    [
      "delete a leading blank",
      ` ${"s/a/b/\n".repeat(reuseCommandCount)}`,
      { byte: 0, deleteBytes: 1, insert: "" },
    ],
    [
      "insert a leading blank",
      "s/a/b/\n".repeat(reuseCommandCount),
      { byte: 0, deleteBytes: 0, insert: " " },
    ],
  ]) {
    test(`${scope}: script start edits reuse the following commands: ${description}`, () => {
      const count = relexedTokens(scope, source, [edit]);
      assert.ok(
        count <= maxRelexedTokens,
        `${description}: ${count} tokens re-lexed`,
      );
    });
  }

  for (const source of [
    "b;t;T;e\n",
    ":x p\nb x#hi\n",
    "v0alpha p\n",
    "\rp;\vp;\fp",
    "s[\\c[[x[",
    "s/[:alpha:]/x/",
    "s/[^\\x3aalpha:\\x5d]/x/",
    "\\Σp\n",
    "pΣ;p Σ\n",
    "\\\np\n",
    "0,/a/p\n",
    "0r file\n",
    "1,2q\n",
    ",2q\n",
    "1/a/p\n",
    "p\0p\n",
    "!#c\np\n",
    ":loop; b loop\n",
    "#n hi\na text\n",
    "\r#n\n:",
    "w file;p\n",
    "s/[[:\\x61lpha:]]/x/\n",
    "s/[\\x5b\\x3aalpha\\x3a\\x5d]/x/\n",
    "s$\\$$x$",
    "s/[a-\\x5d]/x/",
    "s@[a\\x5d@]@x@",
    "s/\\x5b/x/",
    "s/[a-b-c]/x/",
    "s/[a-[=z=]]/x/",
  ]) {
    test(`${scope}: address and opaque operand edits preserve incremental CST: ${JSON.stringify(source)}`, () => {
      for (let byte = 0; byte < Buffer.byteLength(source); byte++) {
        const edits = [{ byte, deleteBytes: 1, insert: "" }];
        assertIncrementalContract(
          parse(scope, applyEdits(source, edits)),
          parse(scope, source, edits),
          `${JSON.stringify(source)} delete ${byte}`,
        );
      }
    });
  }
}

for (const scope of ["source.sed", "source.sed.ere"]) {
  for (const { source, byte, deleteBytes, insert } of [
    { source: "{p;!}", byte: 3, deleteBytes: 0, insert: "1" },
    { source: "{p;1!}", byte: 3, deleteBytes: 1, insert: "" },
    { source: "{p;1!}", byte: 5, deleteBytes: 1, insert: "" },
    { source: "1, p", byte: 2, deleteBytes: 0, insert: "2" },
    { source: "1,2,  p", byte: 4, deleteBytes: 0, insert: "3" },
    { source: ":\0x", byte: 1, deleteBytes: 0, insert: "a" },
    { source: ":a\0x", byte: 1, deleteBytes: 1, insert: "" },
    { source: "/[[:alpha:]--", byte: 13, deleteBytes: 0, insert: "-]/p" },
    {
      source: String.raw`s/\x5c\\x5e/x/`,
      byte: 7,
      deleteBytes: 1,
      insert: "",
    },
    {
      source: String.raw`s/\x5c\x5e/x/`,
      byte: 7,
      deleteBytes: 0,
      insert: "\\",
    },
  ]) {
    test(`${scope}: boundary decisions survive edits: ${JSON.stringify({ source, byte, deleteBytes, insert })}`, () => {
      const edits = [{ byte, deleteBytes, insert }];
      const fresh = parseSuccessfully(scope, applyEdits(source, edits));
      assertIncrementalContract(
        fresh,
        parseSuccessfully(scope, source, edits),
        JSON.stringify([source, edits]),
      );
    });
  }

  for (const { source, byte, deleteBytes, insert } of [
    { source: "ax\\c\\", byte: 5, deleteBytes: 0, insert: "." },
    { source: "ax\\c\\.", byte: 5, deleteBytes: 0, insert: "\\" },
    { source: "r x\0tail", byte: 2, deleteBytes: 1, insert: "" },
    { source: "s\0", byte: 1, deleteBytes: 1, insert: "/" },
    { source: "0~0", byte: 3, deleteBytes: 0, insert: "r x" },
    { source: "0~0,", byte: 4, deleteBytes: 0, insert: "/a/p" },
    { source: "0~0r x", byte: 2, deleteBytes: 1, insert: "2" },
  ]) {
    test(`${scope}: control escape, NUL and zero address edits agree with fresh parsing: ${JSON.stringify({ source, byte, deleteBytes, insert })}`, () => {
      const edits = [{ byte, deleteBytes, insert }];
      assertIncrementalContract(
        parseSuccessfully(scope, applyEdits(source, edits)),
        parseSuccessfully(scope, source, edits),
        source,
      );
    });
  }

  for (const { source, byte, deleteBytes, insert } of [
    { source: "+p", byte: 1, deleteBytes: 0, insert: "3" },
    { source: "+3p", byte: 1, deleteBytes: 1, insert: "0" },
    { source: "+0p", byte: 1, deleteBytes: 1, insert: "" },
    { source: "1,+p", byte: 3, deleteBytes: 0, insert: "2" },
    { source: "1~2p", byte: 2, deleteBytes: 1, insert: "" },
    { source: String.raw`s/\c\./x/`, byte: 5, deleteBytes: 0, insert: "\\" },
    { source: String.raw`s/\c\\./x/`, byte: 5, deleteBytes: 1, insert: "" },
    { source: String.raw`s/\c\\c/x/`, byte: 6, deleteBytes: 1, insert: "." },
    { source: String.raw`sc\c\.cxc`, byte: 1, deleteBytes: 1, insert: "/" },
    {
      source: String.raw`sx\c\\\\x5dxYx`,
      byte: 7,
      deleteBytes: 1,
      insert: "",
    },
    {
      source: String.raw`sx\c\\\x5dxYx`,
      byte: 7,
      deleteBytes: 0,
      insert: "\\",
    },
    { source: "s/\\c\\\\\\\\\n/x/", byte: 7, deleteBytes: 1, insert: "" },
    { source: "s/\\c\\\\\\\n/x/", byte: 6, deleteBytes: 0, insert: "\\" },
  ]) {
    test(`${scope}: address and control escape edits preserve the public CST: ${JSON.stringify({ source, byte, deleteBytes, insert })}`, () => {
      const edits = [{ byte, deleteBytes, insert }];
      const fresh = parseSuccessfully(scope, applyEdits(source, edits));
      assertIncrementalContract(
        fresh,
        parseSuccessfully(scope, source, edits),
        JSON.stringify({ source, edits }),
      );
    });
  }
}

for (const scope of ["source.sed", "source.sed.ere"]) {
  for (const { prefix, bytes } of [
    { prefix: "", bytes: [0xff, 0xce, 0xa3] },
    { prefix: ":", bytes: [0xff, 0xce, 0xa3] },
    { prefix: "s/", bytes: [0xff, 0xce, 0xa3] },
    { prefix: "s/a/", bytes: [0xff, 0xce, 0xa3] },
    { prefix: "s/[\\", bytes: [0xce, 0xa3] },
  ]) {
    test(`${scope}: editing UTF-8 after ${JSON.stringify(prefix)} preserves incremental CST`, () => {
      const source = Buffer.concat([
        Buffer.from(prefix),
        Buffer.from(bytes),
        Buffer.from("\n"),
      ]);
      const byte = Buffer.byteLength(prefix) + bytes.length - 1;
      for (const [deleteBytes, insert] of [
        [1, ""],
        [0, "x"],
      ]) {
        const edits = [{ byte, deleteBytes, insert }];
        assertIncrementalContract(
          parse(scope, applyEdits(source, edits)),
          parse(scope, source, edits),
          `${JSON.stringify(edits)}`,
        );
      }
    });
  }
}
