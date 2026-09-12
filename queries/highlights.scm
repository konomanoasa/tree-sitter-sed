[
  (address_escape)
  (escaped_delimiter)
  (replacement_escaped_delimiter)
  (translation_escaped_delimiter)
  (quoted_character)
  (replacement_escape)
  (sed_newline_escape)
  (text_backslash_escape)
  (translation_escape)
] @string.escape

[
  (back_bar)
  (back_plus)
  (back_qm)
  (left_anchor)
  (negation_operator)
  (nonmatching_list_operator)
  (range_operator)
  (right_anchor)
  (zero_or_more_operator)
] @operator

[
  (case_insensitive_flag)
  (global_flag)
  (print_flag)
  (substitution_flag)
] @keyword.modifier

(function_verb) @keyword

(comment_text) @comment

(default_output_suppression) @keyword.directive

[
  (escaped_newline)
  (text_introducer)
  (text_escaped_newline)
] @punctuation.special

(label) @label

(last_line_address) @constant.builtin

[
  (dup_count)
  (line_number_address)
  (occurrence_flag)
] @number

[
  (backreference)
  (matched_text_reference)
  (replacement_backreference)
] @string.special.symbol

[
  (rfile)
  (wfile)
] @string.special.path

[
  (back_close_brace)
  (back_close_parenthesis)
  (back_open_brace)
  (back_open_parenthesis)
  (close_bracket)
  (closing_brace)
  (open_bracket)
] @punctuation.bracket

(character_class
  [
    "["
    "]"
  ] @punctuation.bracket)

(character_class
  ":" @punctuation.delimiter)

(collating_symbol
  [
    "["
    "]"
  ] @punctuation.bracket)

(collating_symbol
  "." @punctuation.delimiter)

(equivalence_class
  [
    "["
    "]"
  ] @punctuation.bracket)

(equivalence_class
  "=" @punctuation.delimiter)

[
  (range_end_hyphen)
  (trailing_hyphen)
] @string.regexp

[
  (class_name)
  (coll_elem_multi)
  (coll_elem_single)
  (collating_element)
  (meta_char)
  (period)
] @character.special

[
  (address_separator)
  (delimiter)
  (interval_separator)
] @punctuation.delimiter

((command_separator) @punctuation.delimiter
  (#eq? @punctuation.delimiter ";"))

(ordinary_character) @string.regexp

[
  (replacement_literal)
  (text_literal)
  (translation_literal)
] @string

(block_function
  verb: (function_verb) @punctuation.bracket)

(comment_function
  verb: (function_verb) @comment)

(comment_function
  verb: (function_verb) @keyword.directive
  comment: (comment
    suppression: (default_output_suppression)))
