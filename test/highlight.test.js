const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { after, before, test } = require("node:test");
const { createTreeSitter, grammars, root } = require("../scripts/tree-sitter");

let temporaryDirectory;
let treeSitter;

before(() => {
  temporaryDirectory = mkdtempSync(
    join(tmpdir(), "tree-sitter-sed-highlight-"),
  );
  try {
    treeSitter = createTreeSitter();
    for (const grammar of grammars) {
      const query = grammar.highlights
        .map((path) => readFileSync(join(root, path), "utf8"))
        .join("\n");
      writeFileSync(join(temporaryDirectory, `${grammar.name}.scm`), query);
    }
  } catch (error) {
    treeSitter?.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
});

after(() => {
  try {
    treeSitter?.close();
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

for (const grammar of grammars) {
  test(`${grammar.name} highlight query`, () => {
    assert.ok(grammar.highlights.length > 0, "missing highlight queries");
    const fixture = join(root, "test", "highlight", `${grammar.name}.sed`);
    const highlightResult = treeSitter.run(
      ["highlight", "--check", "--quiet", "--scope", grammar.scope, fixture],
      {
        encoding: "utf8",
        env: { NO_COLOR: "1" },
        maxBuffer: 1024 * 1024,
      },
    );
    if (highlightResult.error) {
      throw highlightResult.error;
    }
    assert.equal(
      highlightResult.status,
      0,
      highlightResult.stdout + highlightResult.stderr,
    );

    const queryResult = treeSitter.run(
      [
        "query",
        "--test",
        "--scope",
        grammar.scope,
        join(temporaryDirectory, `${grammar.name}.scm`),
        fixture,
      ],
      {
        encoding: "utf8",
        env: { NO_COLOR: "1" },
        maxBuffer: 1024 * 1024,
      },
    );
    if (queryResult.error) {
      throw queryResult.error;
    }
    assert.equal(
      queryResult.status,
      0,
      queryResult.stdout + queryResult.stderr,
    );
  });
}
