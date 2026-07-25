const { join } = require("node:path");
const { Language, Parser } = require("web-tree-sitter");

const wasmDirectory = process.env.TREE_SITTER_SED_TEST_WASM_DIRECTORY;
let languagesPromise;

async function initializeLanguages() {
  if (wasmDirectory === undefined) {
    throw new Error("Run Wasm tests with npm run test:wasm.");
  }

  await Parser.init();
  const entries = await Promise.all(
    ["posix", "gnu"].map(async (dialect) => [
      dialect,
      await Language.load(
        join(wasmDirectory, `tree-sitter-sed-${dialect}.wasm`),
      ),
    ]),
  );
  return Object.fromEntries(entries);
}

function loadLanguages() {
  languagesPromise ??= initializeLanguages();
  return languagesPromise;
}

module.exports = { loadLanguages, Parser };
