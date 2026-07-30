/**
 * @file Tree-sitter grammar for POSIX.1-2024 sed scripts using EREs.
 * @author konomanoasa
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const defineGrammar = require("../common/factory");

module.exports = defineGrammar("posix_sed_ere", "ere");
