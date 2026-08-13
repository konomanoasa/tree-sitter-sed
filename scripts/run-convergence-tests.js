#!/usr/bin/env node

const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { parseFixture } = require("./parse-fixture");
const { languages } = require("./variants");

const temporaryDirectory = mkdtempSync(
  join(tmpdir(), "tree-sitter-posix-sed-convergence-"),
);

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
  ", 2p",
  "1,p",
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
  "1!p",
  "}",
  "{p",
  "s/a",
  "/[a",
  "\\%re%p",
  "s;a;b;",
];
const insertions = "psdxq!{};,\n\\/*[]().^$|+?-:=# \tabw12".split("");

let seed = 0;
function random() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

function pick(list) {
  return list[Math.floor(random() * list.length)];
}

function parse(scope, source, name, edits) {
  return parseFixture(temporaryDirectory, scope, source, name, edits);
}

function randomCase() {
  const lineCount = 1 + Math.floor(random() * 3);
  const lines = [];
  for (let line = 0; line < lineCount; line++) {
    lines.push(pick(fragments));
  }
  const base = `${lines.join("\n")}\n`;

  const position = Math.floor(random() * (base.length + 1));
  if (random() < 0.5) {
    const text = pick(insertions);
    if (text === "\n") {
      return null;
    }
    return {
      base,
      edit: `${position} 0 ${text}`,
      edited: base.slice(0, position) + text + base.slice(position),
    };
  }
  const deleted = Math.min(
    1 + Math.floor(random() * 2),
    base.length - position,
  );
  if (deleted <= 0) {
    return null;
  }
  return {
    base,
    edit: `${position} ${deleted} `,
    edited: base.slice(0, position) + base.slice(position + deleted),
  };
}

function main() {
  const iterations = Number(process.argv[2] ?? 100);
  seed = Number(process.argv[3] ?? 42);
  let failures = 0;
  let histories = 0;

  for (const { scope } of languages) {
    for (let index = 0; index < iterations; index++) {
      const testCase = randomCase();
      if (testCase === null) {
        continue;
      }
      histories += 1;

      const fresh = parse(scope, testCase.edited, `fresh-${index}`, []);
      if (fresh.error) {
        throw fresh.error;
      }
      const incremental = parse(scope, testCase.base, `incremental-${index}`, [
        testCase.edit,
      ]);
      if (incremental.error) {
        throw incremental.error;
      }

      if (fresh.stdout !== incremental.stdout) {
        failures += 1;
        console.error(`Divergent history for ${scope}:`);
        console.error(`  base=${JSON.stringify(testCase.base)}`);
        console.error(`  edit=${JSON.stringify(testCase.edit)}`);
        console.error(`  edited=${JSON.stringify(testCase.edited)}`);
        if (failures >= 5) {
          return 1;
        }
      }
    }
  }

  if (failures > 0) {
    return 1;
  }
  console.log(`Convergence tests passed: ${histories} random histories`);
  return 0;
}

try {
  process.exitCode = main();
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
