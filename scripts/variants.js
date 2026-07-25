const variants = Object.freeze([
  Object.freeze({
    languageName: "sed_posix_bre",
    dialect: "posix",
    regexMode: "bre",
    directory: "posix-bre",
    wasmName: "tree-sitter-sed-posix-bre.wasm",
  }),
  Object.freeze({
    languageName: "sed_posix_ere",
    dialect: "posix",
    regexMode: "ere",
    directory: "posix-ere",
    wasmName: "tree-sitter-sed-posix-ere.wasm",
  }),
  Object.freeze({
    languageName: "sed_gnu_bre",
    dialect: "gnu",
    regexMode: "bre",
    directory: "gnu-bre",
    wasmName: "tree-sitter-sed-gnu-bre.wasm",
  }),
  Object.freeze({
    languageName: "sed_gnu_ere",
    dialect: "gnu",
    regexMode: "ere",
    directory: "gnu-ere",
    wasmName: "tree-sitter-sed-gnu-ere.wasm",
  }),
]);

module.exports = { variants };
