#!/usr/bin/env node

const { constants, accessSync, realpathSync } = require("node:fs");
const { delimiter, dirname, isAbsolute, join } = require("node:path");
const { spawnSync } = require("node:child_process");

const sources = [
  "common/scanner.h",
  "posix-sed-bre/src/scanner.c",
  "posix-sed-ere/src/scanner.c",
];

function executableCandidates(name) {
  if (process.platform !== "win32") {
    return [name];
  }
  const extensions = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT")
    .split(";")
    .filter(Boolean);
  return extensions.map((extension) => `${name}${extension.toLowerCase()}`);
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

function versionMajor(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const match = output.match(/version ([0-9]+)/);
  if (result.status !== 0 || match === null) {
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

const pathDirectories = (process.env.PATH ?? "").split(delimiter);
const clangFormat = findExecutable(
  process.env.CLANG_FORMAT ?? "clang-format",
  pathDirectories,
);
const clangDirectory = dirname(realpathSync(clangFormat));
const clangd = findExecutable(
  process.env.CLANGD ?? "clangd",
  process.env.CLANGD === undefined ? [clangDirectory] : pathDirectories,
);
const formatVersion = versionMajor(clangFormat);
const clangdVersion = versionMajor(clangd);
if (formatVersion !== clangdVersion) {
  throw new Error(
    `clang-format ${formatVersion} and clangd ${clangdVersion} must use the same LLVM release.`,
  );
}

run(clangFormat, ["--dry-run", "--Werror", ...sources]);
for (const source of sources) {
  run(clangd, ["--log=error", `--check=${source}`]);
}
