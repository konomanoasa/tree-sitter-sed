#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readdirSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const root = join(__dirname, "..");
const executable = join(
  root,
  "node_modules",
  "tree-sitter-cli",
  process.platform === "win32" ? "tree-sitter.exe" : "tree-sitter",
);

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
  if (result.error) {
    if (result.error.code === "ENOENT" && command === executable) {
      throw new Error("Tree-sitter CLI is missing; run npm ci.", {
        cause: result.error,
      });
    }
    throw result.error;
  }
  return result.status ?? 1;
}

function main() {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "tree-sitter-sed-wasm-test-"),
  );

  try {
    for (const dialect of ["posix", "gnu"]) {
      const status = run(executable, [
        "build",
        "--wasm",
        "--output",
        join(temporaryDirectory, `tree-sitter-sed-${dialect}.wasm`),
        join(root, dialect),
      ]);
      if (status !== 0) {
        return status;
      }
    }

    const testFiles = readdirSync(join(root, "test"))
      .filter((file) => file.endsWith(".test.js"))
      .sort()
      .map((file) => join(root, "test", file));
    return run(process.execPath, ["--test", ...testFiles], {
      env: {
        ...process.env,
        TREE_SITTER_SED_TEST_WASM_DIRECTORY: temporaryDirectory,
      },
    });
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

process.exitCode = main();
