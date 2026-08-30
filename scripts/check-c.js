#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const {
  constants,
  accessSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { delimiter, dirname, isAbsolute, join } = require("node:path");
const { grammars, root } = require("./tree-sitter");

const bindingHeader = join(
  root,
  "bindings",
  "c",
  "tree_sitter",
  "tree-sitter-sed.h",
);
const bindingContract = join(root, "test", "binding.test.c");
const scannerHeader = join(root, "common", "scanner.h");
const scannerContract = join(root, "test", "scanner.test.c");
const scannerVariants = grammars.map((grammar) => {
  let extended;
  if (grammar.name === "sed") {
    extended = false;
  } else if (grammar.name === "sed_ere") {
    extended = true;
  } else {
    throw new Error(`Unsupported scanner grammar ${grammar.name}.`);
  }
  const includeDirectory = join(root, grammar.path, "src");
  return {
    extended,
    includeDirectory,
    name: grammar.name,
    source: join(includeDirectory, "scanner.c"),
  };
});
const sources = [
  bindingHeader,
  bindingContract,
  scannerHeader,
  ...scannerVariants.map((variant) => variant.source),
  scannerContract,
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
    const error = new Error(`${command} exited with ${result.status}.`);
    error.exitStatus = result.status ?? 1;
    throw error;
  }
}

function llvmCommands() {
  if (process.platform === "darwin") {
    const llvmDirectory = join(output("brew", ["--prefix", "llvm"]), "bin");
    return {
      clang: findExecutable(join(llvmDirectory, "clang"), []),
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
    clang: findExecutable(
      process.env.CLANG ?? "clang",
      process.env.CLANG === undefined ? [clangDirectory] : pathDirectories,
    ),
    clangd: findExecutable(
      process.env.CLANGD ?? "clangd",
      process.env.CLANGD === undefined ? [clangDirectory] : pathDirectories,
    ),
    clangFormat,
  };
}

function main() {
  const arguments_ = process.argv.slice(2);
  if (
    arguments_.length > 1 ||
    (arguments_.length === 1 && arguments_[0] !== "--write")
  ) {
    throw new Error("Usage: node scripts/check-c.js [--write]");
  }

  const { clang, clangd, clangFormat } = llvmCommands();
  if (
    new Set([
      versionMajor(clang),
      versionMajor(clangd),
      versionMajor(clangFormat),
    ]).size !== 1
  ) {
    throw new Error(
      "clang, clangd, and clang-format must use the same LLVM release.",
    );
  }

  if (arguments_[0] === "--write") {
    run(clangFormat, ["-i", ...sources]);
    return;
  }

  run(clangFormat, ["--dry-run", "--Werror", ...sources]);
  for (const source of sources) {
    run(clangd, ["--log=error", "--tweaks=", `--check=${source}`]);
  }

  const testDirectory = mkdtempSync(join(tmpdir(), "tree-sitter-sed-c."));
  try {
    for (const standard of ["c99", "c17"]) {
      run(clang, [
        `-std=${standard}`,
        "-Wall",
        "-Wextra",
        "-Werror",
        "-pedantic",
        "-I",
        join(root, "bindings", "c"),
        "-fsyntax-only",
        bindingContract,
      ]);

      for (const variant of scannerVariants) {
        const compilerArguments = [
          `-std=${standard}`,
          "-Wall",
          "-Wextra",
          "-Werror",
          "-pedantic",
          "-I",
          variant.includeDirectory,
        ];
        run(clang, [...compilerArguments, "-fsyntax-only", variant.source]);

        const executableSuffix = process.platform === "win32" ? ".exe" : "";
        const testBinary = join(
          testDirectory,
          `scanner-${variant.name}-${standard}${executableSuffix}`,
        );
        run(clang, [
          ...compilerArguments,
          `-DSED_REGEX_EXTENDED=${variant.extended ? 1 : 0}`,
          scannerContract,
          "-o",
          testBinary,
        ]);
        run(testBinary, []);
      }
    }
  } finally {
    rmSync(testDirectory, { force: true, recursive: true });
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = error.exitStatus ?? 1;
}
