#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { languages } = require("./variants");

const root = join(__dirname, "..");
const runner = join(__dirname, "run-tree-sitter.js");
const libraryExtension =
  process.platform === "win32"
    ? ".dll"
    : process.platform === "darwin"
      ? ".dylib"
      : ".so";

function run(arguments_) {
  const result = spawnSync(process.execPath, [runner, ...arguments_], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

function main() {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "tree-sitter-posix-sed-fuzz-"),
  );

  try {
    for (const { directory, id, languageName } of languages) {
      const libraryPath = join(
        temporaryDirectory,
        `tree-sitter-${id}${libraryExtension}`,
      );
      const buildStatus = run([
        "build",
        "--output",
        libraryPath,
        join(root, directory),
      ]);
      if (buildStatus !== 0) {
        return buildStatus;
      }

      const fuzzStatus = run([
        "fuzz",
        "--lib-path",
        libraryPath,
        "--lang-name",
        languageName,
        ...process.argv.slice(2),
      ]);
      if (fuzzStatus !== 0) {
        return fuzzStatus;
      }
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  return 0;
}

process.exitCode = main();
