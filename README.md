# tree-sitter-sed

[![CI](https://github.com/konomanoasa/tree-sitter-sed/actions/workflows/ci.yaml/badge.svg)](https://github.com/konomanoasa/tree-sitter-sed/actions/workflows/ci.yaml)
[![crates.io](https://img.shields.io/crates/v/tree-sitter-sed)](https://crates.io/crates/tree-sitter-sed)
[![npm](https://img.shields.io/npm/v/tree-sitter-sed)](https://www.npmjs.com/package/tree-sitter-sed)

[Tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammars for
POSIX.1-2024 sed.

For GNU sed, see [tree-sitter-gsed](https://github.com/konomanoasa/tree-sitter-gsed).

## Installation

```sh
npm install tree-sitter-sed
```

## Parsing Option

For POSIX ERE parsing, use `sed_ere`.

## Development

```sh
npm install
npm run build
npm test
```

## Specifications

- [POSIX.1-2024 sed](https://pubs.opengroup.org/onlinepubs/9799919799.2024edition/utilities/sed.html)
- [POSIX.1-2024 regular expressions](https://pubs.opengroup.org/onlinepubs/9799919799.2024edition/basedefs/V1_chap09.html)

## Used By

[sed-ts-mode](https://github.com/konomanoasa/sed-ts-mode)

## License

[MIT](LICENSE)
