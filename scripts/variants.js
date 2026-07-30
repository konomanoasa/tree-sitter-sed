const languages = Object.freeze([
  Object.freeze({
    id: "posix-sed-bre",
    languageName: "posix_sed_bre",
    directory: "posix-sed-bre",
    wasmName: "tree-sitter-posix-sed-bre.wasm",
  }),
  Object.freeze({
    id: "posix-sed-ere",
    languageName: "posix_sed_ere",
    directory: "posix-sed-ere",
    wasmName: "tree-sitter-posix-sed-ere.wasm",
  }),
]);

module.exports = { languages };
