#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const { constants, accessSync, realpathSync } = require("node:fs");
const { delimiter, dirname, isAbsolute, join } = require("node:path");
const { grammars, root } = require("./tree-sitter");

const sources = [
  join(root, "common", "scanner.h"),
  ...grammars.map((grammar) => join(root, grammar.path, "src", "scanner.c")),
];

function executableCandidates(name) {
  if (process.platform !== "win32") {
    return [name];
  }
  const extensions = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT")
    .split(";")
    .filter(Boolean);
  return extensions.map((extension) => name + extension.toLowerCase());
}

function isExecutable(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findExecutable(name, directories) {
  if (isAbsolute(name) || name.includes("/") || name.includes("\\")) {
    if (isExecutable(name)) {
      return name;
    }
    throw new Error(`Cannot execute ${name}.`);
  }
  for (const directory of directories) {
    for (const candidate of executableCandidates(name)) {
      const path = join(directory, candidate);
      if (isExecutable(path)) {
        return path;
      }
    }
  }
  throw new Error(`Cannot find ${name} on PATH.`);
}

function output(command, arguments_) {
  const result = spawnSync(command, arguments_, { encoding: "utf8" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      (result.stderr || result.stdout).trim() ||
        `${command} exited with ${result.status}.`,
    );
  }
  return result.stdout.trim();
}

function versionMajor(command) {
  const version = output(command, ["--version"]);
  const match = version.match(/version ([0-9]+)/);
  if (match === null) {
    throw new Error(`Cannot determine the version of ${command}.`);
  }
  return Number(match[1]);
}

function run(command, arguments_) {
  const result = spawnSync(command, arguments_, { stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function llvmCommands() {
  if (process.platform === "darwin") {
    const llvmDirectory = join(output("brew", ["--prefix", "llvm"]), "bin");
    return {
      clangd: findExecutable(join(llvmDirectory, "clangd"), []),
      clangFormat: findExecutable(join(llvmDirectory, "clang-format"), []),
    };
  }

  const pathDirectories = (process.env.PATH ?? "").split(delimiter);
  const clangFormat = findExecutable(
    process.env.CLANG_FORMAT ?? "clang-format",
    pathDirectories,
  );
  const clangDirectory = dirname(realpathSync(clangFormat));
  return {
    clangd: findExecutable(
      process.env.CLANGD ?? "clangd",
      process.env.CLANGD === undefined ? [clangDirectory] : pathDirectories,
    ),
    clangFormat,
  };
}

const arguments_ = process.argv.slice(2);
if (
  arguments_.length > 1 ||
  (arguments_.length === 1 && arguments_[0] !== "--write")
) {
  throw new Error("Usage: node scripts/check-scanner.js [--write]");
}

const { clangd, clangFormat } = llvmCommands();
if (versionMajor(clangFormat) !== versionMajor(clangd)) {
  throw new Error("clang-format and clangd must use the same LLVM release.");
}

if (arguments_[0] === "--write") {
  run(clangFormat, ["-i", ...sources]);
} else {
  run(clangFormat, ["--dry-run", "--Werror", ...sources]);
  for (const source of sources) {
    run(clangd, ["--log=error", `--check=${source}`]);
  }
}
