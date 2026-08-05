#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { languages } = require("./variants");

const root = join(__dirname, "..");
const executable = join(
  root,
  "node_modules",
  "tree-sitter-cli",
  process.platform === "win32" ? "tree-sitter.exe" : "tree-sitter",
);

function generateParsers() {
  for (const { directory } of languages) {
    const result = spawnSync(
      executable,
      [
        "generate",
        join(directory, "grammar.js"),
        "--output",
        join(directory, "src"),
      ],
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

module.exports = { generateParsers };
