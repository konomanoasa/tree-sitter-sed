# tree-sitter-sed

[![CI](https://github.com/konomanoasa/tree-sitter-sed/actions/workflows/ci.yml/badge.svg)](https://github.com/konomanoasa/tree-sitter-sed/actions/workflows/ci.yml)

[Tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammars for
POSIX.1-2024 and GNU `sed` 4.10. The repository includes separate grammars,
generated C parsers, and highlighting queries for both dialects.

![A POSIX sed script with syntax highlighting in Emacs](assets/highlight-preview.png)

_POSIX `sed` syntax highlighting in a customized Emacs setup._

## Grammars

| Dialect | Language | Scope | Selection |
| --- | --- | --- | --- |
| GNU `sed` 4.10 | `sed_gnu` | `source.sed.gnu` | Default for `.sed` files and `sed`/`gsed` shebangs |
| POSIX.1-2024 `sed` | `sed_posix` | `source.sed.posix` | Select explicitly when strict POSIX syntax matters |

The grammars provide nodes for commands, addresses, regular expressions,
replacements, dynamic delimiters, and dialect-specific syntax. Error recovery
keeps later commands parseable while a script is incomplete.

## Usage

Requires Node.js 24.18+, npm 11.16+, and a C compiler.

```sh
npm ci
npm run cli -- parse --scope source.sed.gnu path/to/script.sed
npm run cli -- highlight --scope source.sed.gnu path/to/script.sed
```

Use `source.sed.posix` instead to parse a script as POSIX `sed`.

## Layout

- `gnu/` — GNU grammar and generated C parser
- `posix/` — POSIX grammar and generated C parser
- `common/scanner.h` — shared external scanner implementation
- `queries/` — common and GNU-specific highlighting queries

Language-specific bindings are not bundled.

## Development

| Command | Purpose |
| --- | --- |
| `npm run check` | Run formatting checks, verify generated files, and run the full test suite |
| `npm test` | Run corpus tests and WebAssembly API tests |
| `npm run test:fuzz` | Exercise both parsers with randomized edits |
| `npm run generate` | Regenerate both C parsers |

## Specifications

- [POSIX.1-2024 `sed`](https://pubs.opengroup.org/onlinepubs/9799919799.2024edition/utilities/sed.html)
- [GNU `sed` 4.10 manual](https://www.gnu.org/software/sed/manual/html_node/index.html)

## License

[MIT](LICENSE)
