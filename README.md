# tree-sitter-sed

[![CI](https://github.com/konomanoasa/tree-sitter-sed/actions/workflows/ci.yaml/badge.svg)](https://github.com/konomanoasa/tree-sitter-sed/actions/workflows/ci.yaml)
[![crates.io](https://img.shields.io/crates/v/tree-sitter-sed)](https://crates.io/crates/tree-sitter-sed)
[![npm](https://img.shields.io/npm/v/tree-sitter-sed)](https://www.npmjs.com/package/tree-sitter-sed)

[Tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammars for
GNU sed 4.10.

For POSIX sed, see [tree-sitter-posix-sed](https://github.com/konomanoasa/tree-sitter-posix-sed).

## Installation

```sh
npm install tree-sitter-sed
```

## Parsing Option

For GNU ERE parsing, use `sed_ere`.

## Development

```sh
npm install
npm run build
npm test
```

## Specification

[GNU sed Manual 4.10](https://www.gnu.org/software/sed/manual/sed.html)

## Used By

[sed-ts-mode](https://github.com/konomanoasa/sed-ts-mode)

## License

[MIT](LICENSE)
