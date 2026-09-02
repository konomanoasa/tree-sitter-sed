[
  (address_escape)
  (escaped_delimiter_token)
  (quoted_character_token)
  (replacement_escape_token)
  (sed_newline_escape_token)
  (text_backslash_escape_token)
  (translation_escape_token)
] @string.escape

[
  (back_bar)
  (back_plus)
  (back_qm)
  (left_anchor_token)
  (negation_operator)
  (right_anchor_token)
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
  (escaped_newline_token)
  (text_introducer_token)
  (text_escaped_newline_token)
] @punctuation.special

(label_token) @label

(last_line_address) @constant.builtin

[
  (dup_count_token)
  (line_number_address)
  (occurrence_flag)
] @number

[
  (backreference_token)
  (matched_text_reference_token)
  (replacement_backreference_token)
] @string.special.symbol

[
  (rfile_token)
  (wfile_token)
] @string.special.path

[
  (back_close_brace)
  (back_close_parenthesis_token)
  (back_open_brace)
  (back_open_parenthesis)
  (close_bracket_token)
  (closing_brace_token)
  (open_bracket)
] @punctuation.bracket

(character_class
  "[" @punctuation.bracket
  .
  ":" @punctuation.delimiter)

(character_class
  ":" @punctuation.delimiter
  .
  "]" @punctuation.bracket)

(collating_symbol
  "[" @punctuation.bracket
  .
  "." @punctuation.delimiter)

(collating_symbol
  "." @punctuation.delimiter
  .
  "]" @punctuation.bracket)

(equivalence_class
  "[" @punctuation.bracket
  .
  "=" @punctuation.delimiter)

(equivalence_class
  "=" @punctuation.delimiter
  .
  "]" @punctuation.bracket)

[
  (nonmatching_list_operator)
  (range_operator)
] @punctuation.special

[
  (range_end_hyphen)
  (trailing_hyphen)
] @string.regexp

[
  (class_name)
  (coll_elem_multi)
  (coll_elem_single)
  (collating_element_token)
  (meta_char)
  (period_token)
] @character.special

[
  (address_separator_token)
  (delimiter_token)
  (interval_separator)
] @punctuation.delimiter

((command_separator) @punctuation.delimiter
  (#eq? @punctuation.delimiter ";"))

(ordinary_character_token) @string.regexp

[
  (replacement_literal_token)
  (text_literal_token)
  (translation_literal_token)
] @string

(block_function
  verb: (function_verb) @punctuation.bracket)

(comment_function
  verb: (function_verb) @comment)

(comment_function
  verb: (function_verb) @keyword.directive
  comment: (comment
    suppression: (default_output_suppression)))
