const { join } = require("node:path");

const executable = join(
  __dirname,
  "..",
  "node_modules",
  "tree-sitter-cli",
  process.platform === "win32" ? "tree-sitter.exe" : "tree-sitter",
);

const missingCliMessage = "Tree-sitter CLI is missing; run npm ci.";

module.exports = { executable, missingCliMessage };
