const languages = Object.freeze([
  Object.freeze({
    id: "sed",
    languageName: "sed",
    dialect: "gnu",
    regexMode: "bre",
    directory: ".",
    scope: "source.sed",
    wasmName: "tree-sitter-sed.wasm",
  }),
  Object.freeze({
    id: "posix-bre",
    languageName: "sed_posix_bre",
    dialect: "posix",
    regexMode: "bre",
    directory: "posix-bre",
    scope: "source.sed.posix.bre",
    wasmName: "tree-sitter-sed-posix-bre.wasm",
  }),
  Object.freeze({
    id: "posix-ere",
    languageName: "sed_posix_ere",
    dialect: "posix",
    regexMode: "ere",
    directory: "posix-ere",
    scope: "source.sed.posix.ere",
    wasmName: "tree-sitter-sed-posix-ere.wasm",
  }),
  Object.freeze({
    id: "gnu-bre",
    languageName: "sed_gnu_bre",
    dialect: "gnu",
    regexMode: "bre",
    directory: "gnu-bre",
    scope: "source.sed.gnu.bre",
    wasmName: "tree-sitter-sed-gnu-bre.wasm",
  }),
  Object.freeze({
    id: "gnu-ere",
    languageName: "sed_gnu_ere",
    dialect: "gnu",
    regexMode: "ere",
    directory: "gnu-ere",
    scope: "source.sed.gnu.ere",
    wasmName: "tree-sitter-sed-gnu-ere.wasm",
  }),
]);

module.exports = { languages };
