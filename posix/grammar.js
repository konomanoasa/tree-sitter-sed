/**
 * @file Tree-sitter grammar for POSIX.1-2024 sed scripts.
 * @author konomanoasa
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const defineGrammar = require("../grammar/factory");
const posix = require("../grammar/posix");

module.exports = defineGrammar("sed_posix", posix);
