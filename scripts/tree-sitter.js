#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");

const root = join(__dirname, "..");
const configuration = JSON.parse(
  readFileSync(join(root, "tree-sitter.json"), "utf8"),
);
if (
  !Array.isArray(configuration.grammars) ||
  configuration.grammars.length === 0
) {
  throw new Error("tree-sitter.json must define at least one grammar.");
}
for (const grammar of configuration.grammars) {
  for (const field of ["name", "path", "scope"]) {
    if (typeof grammar[field] !== "string" || grammar[field].length === 0) {
      throw new Error(
        `tree-sitter.json grammar ${field} must be a non-empty string.`,
      );
    }
  }
}
const grammars = Object.freeze(
  configuration.grammars.map(({ name, path, scope }) =>
    Object.freeze({ name, path, scope }),
  ),
);
const executable = join(
  root,
  "node_modules",
  "tree-sitter-cli",
  process.platform === "win32" ? "tree-sitter.exe" : "tree-sitter",
);
const missingCliMessage = "Tree-sitter CLI is missing; run npm ci.";

function resultStatus(result) {
  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error(missingCliMessage, { cause: result.error });
    }
    throw result.error;
  }
  return result.status ?? 1;
}

function createTreeSitter(environment = {}) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "tree-sitter-sed-"));
  const cacheDirectory = join(
    root,
    "node_modules",
    ".cache",
    "tree-sitter-sed",
  );
  const configDirectory = join(temporaryDirectory, "config");
  const libraryDirectory = join(temporaryDirectory, "lib");
  const treeSitterConfigDirectory = join(configDirectory, "tree-sitter");

  try {
    mkdirSync(cacheDirectory, { recursive: true });
    mkdirSync(libraryDirectory);
    mkdirSync(treeSitterConfigDirectory, { recursive: true });
    writeFileSync(
      join(treeSitterConfigDirectory, "config.json"),
      `${JSON.stringify({ "parser-directories": [dirname(root)] }, null, 2)}\n`,
    );
  } catch (error) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }

  let closed = false;
  return Object.freeze({
    close() {
      if (!closed) {
        closed = true;
        rmSync(temporaryDirectory, { recursive: true, force: true });
      }
    },
    run(arguments_, options = {}) {
      if (closed) {
        throw new Error("Tree-sitter runner is closed.");
      }
      const { env = {}, ...spawnOptions } = options;
      return spawnSync(executable, arguments_, {
        cwd: root,
        windowsHide: true,
        ...spawnOptions,
        env: {
          ...process.env,
          APPDATA: configDirectory,
          LOCALAPPDATA: cacheDirectory,
          TREE_SITTER_DIR: treeSitterConfigDirectory,
          TREE_SITTER_LIBDIR: libraryDirectory,
          XDG_CACHE_HOME: cacheDirectory,
          XDG_CONFIG_HOME: configDirectory,
          ...environment,
          ...env,
        },
      });
    },
  });
}

function runChecked(runner, arguments_, options = { stdio: "inherit" }) {
  return resultStatus(runner.run(arguments_, options));
}

function generateParsers(outputRoot = root) {
  const runner = createTreeSitter();
  try {
    for (const grammar of grammars) {
      const output = join(outputRoot, grammar.path, "src");
      mkdirSync(output, { recursive: true });
      const status = runChecked(runner, [
        "generate",
        join(root, grammar.path, "grammar.js"),
        "--output",
        output,
      ]);
      if (status !== 0) {
        return status;
      }
    }
    return 0;
  } finally {
    runner.close();
  }
}

function fuzzParsers(arguments_) {
  const buildDirectory = mkdtempSync(join(tmpdir(), "tree-sitter-sed-fuzz-"));
  let runner;
  const extension =
    process.platform === "win32"
      ? ".dll"
      : process.platform === "darwin"
        ? ".dylib"
        : ".so";

  try {
    runner = createTreeSitter({ TREE_SITTER_SEED: "1" });
    for (const grammar of grammars) {
      const library = join(buildDirectory, grammar.name + extension);
      let status = runChecked(runner, [
        "build",
        "--output",
        library,
        join(root, grammar.path),
      ]);
      if (status !== 0) {
        return status;
      }
      status = runChecked(runner, [
        "fuzz",
        "--lib-path",
        library,
        "--lang-name",
        grammar.name,
        ...arguments_,
      ]);
      if (status !== 0) {
        return status;
      }
    }
    return 0;
  } finally {
    try {
      runner?.close();
    } finally {
      rmSync(buildDirectory, { recursive: true, force: true });
    }
  }
}

function testCorpus(arguments_) {
  const testRoot = mkdtempSync(join(root, ".tree-sitter-sed-test-"));
  let runner;

  try {
    for (const path of [
      "common",
      "grammar.js",
      "src",
      join("sed_ere", "grammar.js"),
      join("sed_ere", "src"),
      join("test", "corpus"),
      "tree-sitter.json",
    ]) {
      const destination = join(testRoot, path);
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(join(root, path), destination, { recursive: true });
    }
    runner = createTreeSitter();
    return runChecked(runner, ["test", ...arguments_], {
      cwd: testRoot,
      stdio: "inherit",
    });
  } finally {
    try {
      runner?.close();
    } finally {
      rmSync(testRoot, { recursive: true, force: true });
    }
  }
}

function main(arguments_) {
  const [command, ...rest] = arguments_;
  if (command === "generate-all") {
    if (rest.length !== 0) {
      throw new Error("Usage: node scripts/tree-sitter.js generate-all");
    }
    return generateParsers();
  }
  if (command === "fuzz-all") {
    return fuzzParsers(rest);
  }
  if (command === "test-corpus") {
    return testCorpus(rest);
  }

  const runner = createTreeSitter();
  try {
    return runChecked(runner, arguments_);
  } finally {
    runner.close();
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  createTreeSitter,
  generateParsers,
  grammars,
  root,
};
