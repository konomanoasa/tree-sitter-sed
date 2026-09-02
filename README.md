# tree-sitter-sed

[![CI](https://github.com/konomanoasa/tree-sitter-sed/actions/workflows/ci.yml/badge.svg)](https://github.com/konomanoasa/tree-sitter-sed/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/tree-sitter-sed)](https://www.npmjs.com/package/tree-sitter-sed)

[Tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammars for
POSIX.1-2024 `sed`.

## Installation

### npm

```sh
npm install tree-sitter-sed
```

### Cargo

```sh
cargo add tree-sitter-sed
```

## Grammars

This repository contains the following two grammars.

| Grammar   | Regexp | C function              | Rust constant  |
| --------- | ------ | ----------------------- | -------------- |
| `sed`     | BRE    | `tree_sitter_sed()`     | `LANGUAGE`     |
| `sed_ere` | ERE    | `tree_sitter_sed_ere()` | `LANGUAGE_ERE` |

## Specifications

- [POSIX.1-2024 `sed`](https://pubs.opengroup.org/onlinepubs/9799919799.2024edition/utilities/sed.html)
- [POSIX.1-2024 regular expressions](https://pubs.opengroup.org/onlinepubs/9799919799.2024edition/basedefs/V1_chap09.html)

## License

[MIT](LICENSE)
