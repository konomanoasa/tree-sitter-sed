/**
 * @file Tree-sitter grammar for POSIX.1-2024 sed scripts using BREs.
 * @author konomanoasa
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const defineGrammar = require("../common/factory");
const posix = require("../common/posix");

module.exports = defineGrammar("sed_posix_bre", posix, "bre");
