#!/usr/bin/env node
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const { languages } = require("./variants");

const root = join(__dirname, "..");
const executable = join(
  root,
  "node_modules",
  "tree-sitter-cli",
  process.platform === "win32" ? "tree-sitter.exe" : "tree-sitter",
);

function commandOutput(result) {
  return [result.stdout, result.stderr].filter(Boolean).join("\n");
}

function assertCommandSucceeded(result, description) {
  if (result.error) {
    throw new Error(`Failed to ${description}.`, { cause: result.error });
  }
  assert.equal(
    result.status,
    0,
    `${description} failed.\n${commandOutput(result)}`,
  );
}

function assertQueryCaptured(result, capture, description) {
  assertCommandSucceeded(result, description);
  assert.ok(
    commandOutput(result).includes(` - ${capture},`),
    `${description} did not produce @${capture}.`,
  );
}

function main() {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "tree-sitter-sed-integrations-"),
  );
  const cacheDirectory = join(temporaryDirectory, "cache");
  const configDirectory = join(temporaryDirectory, "config");
  const fixtureDirectory = join(temporaryDirectory, "fixtures");
  const configPath = join(configDirectory, "config.json");

  try {
    mkdirSync(cacheDirectory);
    mkdirSync(configDirectory);
    mkdirSync(fixtureDirectory);
    writeFileSync(
      configPath,
      `${JSON.stringify({ "parser-directories": [dirname(root)] }, null, 2)}\n`,
    );

    const environment = {
      ...process.env,
      APPDATA: configDirectory,
      LOCALAPPDATA: cacheDirectory,
      NO_COLOR: "1",
      TREE_SITTER_DIR: configDirectory,
      TREE_SITTER_LIBDIR: cacheDirectory,
      XDG_CACHE_HOME: cacheDirectory,
      XDG_CONFIG_HOME: configDirectory,
    };
    const run = (arguments_) =>
      spawnSync(executable, [...arguments_, "--config-path", configPath], {
        cwd: fixtureDirectory,
        encoding: "utf8",
        env: environment,
        windowsHide: true,
      });

    const highlightFixture = join(fixtureDirectory, "highlight-input");

    writeFileSync(highlightFixture, "s/(a)+/x/\n");

    const annotatedHighlightDirectory = join(root, "test", "fixtures");
    const structureFixture = join(
      annotatedHighlightDirectory,
      "comments-and-structure.sed",
    );
    const gnuCommandFixture = join(
      annotatedHighlightDirectory,
      "gnu-commands.sed",
    );
    for (const file of readdirSync(annotatedHighlightDirectory).sort()) {
      assertCommandSucceeded(
        run([
          "highlight",
          "--check",
          "--quiet",
          "--scope",
          "source.sed.gnu.bre",
          join(annotatedHighlightDirectory, file),
        ]),
        `check highlighting assertions in ${file}`,
      );
    }

    for (const { dialect, languageName, scope } of languages) {
      assertCommandSucceeded(
        run([
          "highlight",
          "--check",
          "--quiet",
          "--scope",
          scope,
          highlightFixture,
        ]),
        `check highlighting for ${scope}`,
      );

      const queryChecks =
        dialect === "gnu"
          ? [
              ["folds.scm", structureFixture, "fold"],
              ["indents.scm", structureFixture, "indent.begin"],
              ["injections.scm", gnuCommandFixture, "injection.content"],
            ]
          : [
              ["folds.scm", structureFixture, "fold"],
              ["indents.scm", structureFixture, "indent.begin"],
            ];
      for (const [queryName, fixture, capture] of queryChecks) {
        assertQueryCaptured(
          run([
            "query",
            "--captures",
            "--scope",
            scope,
            join(root, "queries", languageName, queryName),
            fixture,
          ]),
          capture,
          `compile ${queryName} for ${scope}`,
        );
      }
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

main();
