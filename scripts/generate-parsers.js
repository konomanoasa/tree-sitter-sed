#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const root = join(__dirname, "..");
const executable = join(
  root,
  "node_modules",
  "tree-sitter-cli",
  process.platform === "win32" ? "tree-sitter.exe" : "tree-sitter",
);
const grammars = Object.freeze([
  Object.freeze({
    grammarPath: join("posix", "grammar.js"),
    outputPath: join("posix", "src"),
  }),
  Object.freeze({
    grammarPath: join("gnu", "grammar.js"),
    outputPath: join("gnu", "src"),
  }),
]);

function generateParsers() {
  for (const { grammarPath, outputPath } of grammars) {
    const result = spawnSync(
      executable,
      ["generate", grammarPath, "--output", outputPath],
      {
        cwd: root,
        stdio: "inherit",
        windowsHide: true,
      },
    );

    if (result.error) {
      if (result.error.code === "ENOENT") {
        throw new Error("Tree-sitter CLI is missing; run npm ci.", {
          cause: result.error,
        });
      }
      throw result.error;
    }

    if (result.status !== 0) {
      return result.status ?? 1;
    }
  }

  return 0;
}

if (require.main === module) {
  process.exitCode = generateParsers();
}

module.exports = { generateParsers, grammars };
