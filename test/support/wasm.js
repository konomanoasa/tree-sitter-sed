const { join } = require("node:path");
const { Language, Parser } = require("web-tree-sitter");
const { languages } = require("../../scripts/variants");

const wasmDirectory = process.env.TREE_SITTER_POSIX_SED_TEST_WASM_DIRECTORY;
let languagesPromise;

async function initializeLanguages() {
  if (wasmDirectory === undefined) {
    throw new Error("Run Wasm tests with npm run test:wasm.");
  }

  await Parser.init();
  const entries = await Promise.all(
    languages.map(async ({ id, wasmName }) => [
      id,
      await Language.load(join(wasmDirectory, wasmName)),
    ]),
  );
  return Object.fromEntries(entries);
}

function loadLanguages() {
  languagesPromise ??= initializeLanguages();
  return languagesPromise;
}

module.exports = { loadLanguages, Parser };
