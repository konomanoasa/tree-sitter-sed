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
}
