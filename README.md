# tree-sitter-sed

[![CI](https://github.com/konomanoasa/tree-sitter-sed/actions/workflows/ci.yml/badge.svg)](https://github.com/konomanoasa/tree-sitter-sed/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/tree-sitter-sed)](https://www.npmjs.com/package/tree-sitter-sed)

[Tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammars for
POSIX.1-2024 `sed`.

## Installation

```sh
npm install tree-sitter-sed
```

## C

The C library contains both grammars. Use `tree_sitter_sed()` for BRE and
`tree_sitter_sed_ere()` for ERE.

```c
#include <tree_sitter/tree-sitter-sed.h>

const TSLanguage *bre = tree_sitter_sed();
const TSLanguage *ere = tree_sitter_sed_ere();
```

## Grammars

This repository contains two grammars. You can find [`sed_ere`](sed_ere) here.

## Specifications

- [POSIX.1-2024 `sed`](https://pubs.opengroup.org/onlinepubs/9799919799.2024edition/utilities/sed.html)
- [POSIX.1-2024 regular expressions](https://pubs.opengroup.org/onlinepubs/9799919799.2024edition/basedefs/V1_chap09.html)

## License

[MIT](LICENSE)
