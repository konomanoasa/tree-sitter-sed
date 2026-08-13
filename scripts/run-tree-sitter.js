#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const { executable, missingCliMessage } = require("./tree-sitter-cli");

const root = join(__dirname, "..");
const temporaryDirectory = mkdtempSync(
  join(tmpdir(), "tree-sitter-posix-sed-run-"),
);
const cacheDirectory = join(temporaryDirectory, "cache");
const configDirectory = join(temporaryDirectory, "config");
const treeSitterConfigDirectory = join(configDirectory, "tree-sitter");

let result;
try {
  mkdirSync(cacheDirectory);
  mkdirSync(treeSitterConfigDirectory, { recursive: true });
  writeFileSync(
    join(treeSitterConfigDirectory, "config.json"),
    `${JSON.stringify({ "parser-directories": [dirname(root)] }, null, 2)}\n`,
  );

  result = spawnSync(executable, process.argv.slice(2), {
    cwd: root,
    env: {
      ...process.env,
      APPDATA: configDirectory,
      LOCALAPPDATA: cacheDirectory,
      TREE_SITTER_DIR: treeSitterConfigDirectory,
      TREE_SITTER_LIBDIR: cacheDirectory,
      XDG_CACHE_HOME: cacheDirectory,
      XDG_CONFIG_HOME: configDirectory,
    },
    stdio: "inherit",
    windowsHide: true,
  });
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

if (result.error) {
  if (result.error.code === "ENOENT") {
    console.error(missingCliMessage);
    process.exit(1);
  }
  throw result.error;
}
process.exit(result.status ?? 1);
