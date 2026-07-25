# tree-sitter-sed

[![CI](https://github.com/konomanoasa/tree-sitter-sed/actions/workflows/ci.yml/badge.svg)](https://github.com/konomanoasa/tree-sitter-sed/actions/workflows/ci.yml)

[Tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammars for
POSIX.1-2024 and GNU `sed` 4.10, with separate languages for Basic Regular
Expressions (BREs) and Extended Regular Expressions (EREs).

![A POSIX sed script with syntax highlighting in Emacs](assets/highlight-preview.png)

_POSIX `sed` syntax highlighting in a customized Emacs setup._

## Grammars

| Dialect | Mode | Directory | Language | Scope |
| --- | --- | --- | --- | --- |
| GNU `sed` 4.10 | BRE | `gnu-bre` | `sed_gnu_bre` | `source.sed.gnu.bre` |
| GNU `sed` 4.10 | ERE | `gnu-ere` | `sed_gnu_ere` | `source.sed.gnu.ere` |
| POSIX.1-2024 `sed` | BRE | `posix-bre` | `sed_posix_bre` | `source.sed.posix.bre` |
| POSIX.1-2024 `sed` | ERE | `posix-ere` | `sed_posix_ere` | `source.sed.posix.ere` |

## Usage

Choose one of the four grammars using its directory and language names.

### Emacs

```elisp
(add-to-list
 'treesit-language-source-alist
 '(sed_posix_bre
   . ("https://github.com/konomanoasa/tree-sitter-sed"
      nil
      "posix-bre/src")))

(treesit-install-language-grammar 'sed_posix_bre)
```

### Neovim

With [nvim-treesitter](https://github.com/nvim-treesitter/nvim-treesitter):

```lua
vim.api.nvim_create_autocmd('User', {
  pattern = 'TSUpdate',
  callback = function()
    require('nvim-treesitter.parsers').sed_posix_bre = {
      install_info = {
        url = 'https://github.com/konomanoasa/tree-sitter-sed',
        location = 'posix-bre',
      },
    }
  end,
})

vim.treesitter.language.register('sed_posix_bre', { 'sed' })
```

Install it with `:TSInstall sed_posix_bre`. Use the directory and language
names in the table above for the other three grammars.

## Specifications

- [POSIX.1-2024 `sed`](https://pubs.opengroup.org/onlinepubs/9799919799.2024edition/utilities/sed.html)
- [GNU `sed` 4.10 manual](https://www.gnu.org/software/sed/manual/html_node/index.html)

## License

[MIT](LICENSE)
