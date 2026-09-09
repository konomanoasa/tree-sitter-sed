//! POSIX sed grammars for the Tree-sitter parsing library.
//!
//! [`LANGUAGE`] parses basic regular expressions, while [`LANGUAGE_ERE`] parses
//! extended regular expressions.
//!
//! ```
//! let mut parser = tree_sitter::Parser::new();
//! parser
//!     .set_language(&tree_sitter_sed::LANGUAGE.into())
//!     .expect("POSIX sed grammar must load");
//! let tree = parser.parse("p\n", None).expect("parser must return a tree");
//! assert!(!tree.root_node().has_error());
//! ```

use tree_sitter_language::LanguageFn;

unsafe extern "C" {
    fn tree_sitter_sed() -> *const ();
    fn tree_sitter_sed_ere() -> *const ();
}

/// The Tree-sitter [`LanguageFn`] for POSIX sed with basic regular expressions.
pub const LANGUAGE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_sed) };

/// The Tree-sitter [`LanguageFn`] for POSIX sed with extended regular expressions.
pub const LANGUAGE_ERE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_sed_ere) };

/// The node type definitions for [`LANGUAGE`].
pub const NODE_TYPES: &str = include_str!("../../src/node-types.json");

/// The node type definitions for [`LANGUAGE_ERE`].
pub const NODE_TYPES_ERE: &str = include_str!("../../sed_ere/src/node-types.json");

/// The syntax highlighting query for [`LANGUAGE`].
pub const HIGHLIGHTS_QUERY: &str = include_str!("../../queries/highlights.scm");

/// The syntax highlighting query for [`LANGUAGE_ERE`].
pub const HIGHLIGHTS_QUERY_ERE: &str = include_str!("../../sed_ere/queries/highlights.scm");

#[cfg(test)]
mod tests {
    fn assert_parses(language: tree_sitter_language::LanguageFn) {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&language.into())
            .expect("generated grammar must be compatible with the Tree-sitter runtime");
        let tree = parser
            .parse("p\n", None)
            .expect("parser must return a tree");
        assert_eq!(tree.root_node().kind(), "script");
        assert!(!tree.root_node().has_error());
    }

    #[test]
    fn sed_grammar_loads_and_parses() {
        assert_parses(super::LANGUAGE);
    }

    #[test]
    fn sed_ere_grammar_loads_and_parses() {
        assert_parses(super::LANGUAGE_ERE);
    }

    #[test]
    fn sed_and_sed_ere_are_distinct_grammars() {
        let sed = tree_sitter::Language::new(super::LANGUAGE);
        let sed_ere = tree_sitter::Language::new(super::LANGUAGE_ERE);
        assert_ne!(sed, sed_ere);
    }

    #[test]
    fn balanced_regex_groups_preserve_depth_across_the_16_bit_boundary() {
        for (language, mode, opening, closing, opening_kind, closing_kind) in [
            (
                super::LANGUAGE,
                "BRE",
                "\\(",
                "\\)",
                "back_open_parenthesis",
                "back_close_parenthesis_token",
            ),
            (
                super::LANGUAGE_ERE,
                "ERE",
                "(",
                ")",
                "open_parenthesis",
                "close_parenthesis_token",
            ),
        ] {
            let mut parser = tree_sitter::Parser::new();
            parser
                .set_language(&language.into())
                .expect("generated grammar must load");
            for depth in [65_535, 65_536] {
                let source = format!("/{}a{}/p\n", opening.repeat(depth), closing.repeat(depth));
                let tree = parser
                    .parse(&source, None)
                    .expect("parser must return a tree");
                let root = tree.root_node();
                assert_eq!(root.kind(), "script", "{mode}, depth {depth}");
                assert_eq!(root.byte_range(), 0..source.len(), "{mode}, depth {depth}");
                assert!(!root.has_error(), "{mode}, depth {depth}");

                let mut cursor = root.walk();
                let mut openings = 0;
                let mut closings = 0;
                'walk: loop {
                    let node = cursor.node();
                    assert_ne!(node.kind(), "syntax_issue", "{mode}, depth {depth}");
                    if node.kind() == opening_kind {
                        openings += 1;
                    } else if node.kind() == closing_kind {
                        closings += 1;
                    }
                    if cursor.goto_first_child() {
                        continue;
                    }
                    while !cursor.goto_next_sibling() {
                        if !cursor.goto_parent() {
                            break 'walk;
                        }
                    }
                }
                assert_eq!(openings, depth, "{mode}, depth {depth}");
                assert_eq!(closings, depth, "{mode}, depth {depth}");
            }
        }
    }
}
