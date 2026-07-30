const { defineIssueRules } = require("./issues");
const regularExpressionRules = require("./regex");
const sedRules = require("./sed");

const missingMarkerNames = [
  "omitted_address",
  "empty_subexpression",
  "missing_subexpression",
  "empty_alternative",
  "excess_addresses",
  "additional_address",
  "missing_function",
  "missing_label",
  "missing_rfile",
  "missing_wfile",
  "omitted_file_separator",
  "missing_text_introducer",
  "missing_text",
  "missing_command_separator",
  "blanks_around_address_separator",
  "missing_address_separator",
  "duplicate_negation",
  "missing_closing_brace",
  "missing_opening_delimiter",
  "missing_separator_before_unmatched_brace",
];

function issueDefinitions(mode) {
  function missing(reason) {
    return ($) => $[`_${reason}_marker`];
  }

  return [
    {
      reason: "malformed_bracket_term",
      outcome: "undefined_syntax",
      rule: ($) => $._regex_malformed_bracket_term,
    },
    {
      reason: "character_class_range_start",
      outcome: "undefined_syntax",
      rule: ($) => $._nonportable_range_start_marker,
    },
    {
      reason: "character_class_range_end",
      outcome: "undefined_syntax",
      rule: ($) => $._nonportable_range_end_marker,
    },
    {
      reason: "shared_range_endpoint",
      outcome: "undefined_syntax",
      rule: ($) => $._regex_shared_range_endpoint,
    },
    {
      reason: "omitted_address",
      outcome: "undefined_syntax",
      rule: missing("omitted_address"),
    },
    {
      reason: "ordinary_character_escape",
      outcome: "undefined_syntax",
      rule: ($) => $._regex_nonportable_escape,
    },
    {
      reason: "empty_subexpression",
      outcome: "undefined_syntax",
      rule: missing("empty_subexpression"),
    },
    {
      reason: "unclosed_subexpression",
      outcome: "undefined_syntax",
      rule: ($) => $._regex_unclosed_group,
    },
    ...(mode === "bre"
      ? [
          {
            reason: "unmatched_subexpression_close",
            outcome: "undefined_syntax",
            rule: ($) => $._regex_unmatched_group_close,
          },
          {
            reason: "unmatched_interval_close",
            outcome: "undefined_syntax",
            rule: ($) => $._unmatched_interval_close_marker,
          },
        ]
      : []),
    {
      reason: "malformed_interval",
      outcome: "undefined_syntax",
      rule: ($) => $._regex_invalid_interval,
    },
    {
      reason: "leading_duplication_symbol",
      outcome: "undefined_syntax",
      rule: ($) => $._regex_leading_duplication_marker,
    },
    {
      reason: "adjacent_duplication_symbol",
      outcome: "undefined_syntax",
      rule: ($) => $._regex_adjacent_duplication_marker,
    },
    {
      reason: "empty_alternative",
      outcome: "undefined_syntax",
      rule: missing("empty_alternative"),
    },
    {
      reason: "missing_bracket_list",
      outcome: "undefined_syntax",
      rule: ($) => $._missing_bracket_list_marker,
    },
    {
      reason: "unclosed_bracket_expression",
      outcome: "undefined_syntax",
      rule: ($) => $._unclosed_bracket_expression_marker,
    },
    {
      reason: "undefined_translation_escape",
      outcome: "undefined_syntax",
      rule: ($) => $._translate_nonportable_escape,
    },
    {
      reason: "equivalence_class_range_start",
      outcome: "unspecified_syntax",
      rule: ($) => $._nonportable_range_start_marker,
    },
    {
      reason: "equivalence_class_range_end",
      outcome: "unspecified_syntax",
      rule: ($) => $._nonportable_range_end_marker,
    },
    {
      reason: "ambiguous_bracket_expression",
      outcome: "unspecified_syntax",
      rule: ($) => $._ambiguous_bracket_expression_marker,
    },
    {
      reason: "blanks_after_negation",
      outcome: "unspecified_syntax",
      rule: () => token.immediate(/[[:blank:]]+/),
    },
    {
      reason: "unspecified_replacement_escape",
      outcome: "unspecified_syntax",
      rule: ($) => $._replacement_nonportable_escape,
    },
    {
      reason: "special_delimiter_escape",
      outcome: "unspecified_syntax",
      rule: ($) => $._regex_special_escaped_delimiter,
    },
    {
      reason: "replacement_ampersand_delimiter_escape",
      outcome: "unspecified_syntax",
      rule: ($) => $._replacement_ampersand_escaped_delimiter,
    },
    {
      reason: "unspecified_text_escape",
      outcome: "unspecified_syntax",
      rule: ($) => $._text_unspecified_escape,
    },
    ...(mode === "bre"
      ? [
          {
            reason: "bre_vertical_line_escape",
            outcome: "implementation_defined_syntax",
            rule: ($) => $._bre_vertical_line_escape_marker,
          },
          {
            reason: "bre_question_mark_escape",
            outcome: "implementation_defined_syntax",
            rule: ($) => $._bre_question_mark_escape_marker,
          },
          {
            reason: "bre_plus_escape",
            outcome: "implementation_defined_syntax",
            rule: ($) => $._bre_plus_escape_marker,
          },
          {
            reason: "bre_subexpression_left_anchor",
            outcome: "implementation_option_syntax",
            rule: ($) => $._regex_bre_subexpression_left_anchor,
          },
          {
            reason: "bre_subexpression_right_anchor",
            outcome: "implementation_option_syntax",
            rule: ($) => $._regex_bre_subexpression_right_anchor,
          },
        ]
      : []),
    {
      reason: "omitted_file_separator",
      outcome: "implementation_option_syntax",
      rule: missing("omitted_file_separator"),
    },
    {
      reason: "excess_addresses",
      outcome: "nonconforming_syntax",
      rule: missing("excess_addresses"),
    },
    {
      reason: "additional_address",
      outcome: "nonconforming_syntax",
      rule: missing("additional_address"),
    },
    {
      reason: "invalid_address",
      outcome: "nonconforming_syntax",
      rule: () => token(prec(-1, /0+/)),
    },
    {
      reason: "unknown_function",
      outcome: "nonconforming_syntax",
      rule: () => token(prec(-2, /[^[:blank:][:digit:]$\/\\!;{}#\n]/)),
    },
    {
      reason: "unexpected_command_text",
      outcome: "nonconforming_syntax",
      rule: () =>
        choice(
          token.immediate(prec(-10, /[[:blank:]]+/)),
          token.immediate(prec(-10, /[[:blank:]]*[^[:blank:];}\n][^;}\n]*/)),
        ),
    },
    {
      reason: "forbidden_command_separator",
      outcome: "nonconforming_syntax",
      rule: () => token.immediate(";"),
    },
    {
      reason: "blanks_around_address_separator",
      outcome: "nonconforming_syntax",
      rule: missing("blanks_around_address_separator"),
    },
    {
      reason: "missing_address_separator",
      outcome: "nonconforming_syntax",
      rule: missing("missing_address_separator"),
    },
    {
      reason: "duplicate_negation",
      outcome: "nonconforming_syntax",
      rule: missing("duplicate_negation"),
    },
    {
      reason: "unmatched_closing_brace",
      outcome: "nonconforming_syntax",
      rule: ($) => $._right_brace,
    },
    {
      reason: "missing_command_separator",
      outcome: "nonconforming_syntax",
      rule: missing("missing_command_separator"),
    },
    {
      reason: "invalid_substitution_flag",
      outcome: "nonconforming_syntax",
      rule: ($) => $._invalid_substitution_flag,
    },
    {
      reason: "invalid_delimiter",
      outcome: "nonconforming_syntax",
      rule: () => "\\",
    },
    {
      reason: "zero_substitution_occurrence",
      outcome: "nonconforming_syntax",
      rule: ($) => $._nonportable_substitution_occurrence,
    },
    {
      reason: "missing_function",
      outcome: "incomplete_syntax",
      rule: missing("missing_function"),
    },
    {
      reason: "missing_label",
      outcome: "incomplete_syntax",
      rule: missing("missing_label"),
    },
    {
      reason: "missing_rfile",
      outcome: "incomplete_syntax",
      rule: missing("missing_rfile"),
    },
    {
      reason: "missing_wfile",
      outcome: "incomplete_syntax",
      rule: missing("missing_wfile"),
    },
    {
      reason: "missing_text_introducer",
      outcome: "incomplete_syntax",
      rule: missing("missing_text_introducer"),
    },
    {
      reason: "missing_text",
      outcome: "incomplete_syntax",
      rule: missing("missing_text"),
    },
    {
      reason: "missing_closing_brace",
      outcome: "incomplete_syntax",
      rule: missing("missing_closing_brace"),
    },
    {
      reason: "missing_opening_delimiter",
      outcome: "incomplete_syntax",
      rule: missing("missing_opening_delimiter"),
    },
    {
      reason: "missing_subexpression",
      outcome: "incomplete_syntax",
      rule: missing("missing_subexpression"),
    },
    {
      reason: "incomplete_regular_expression",
      outcome: "incomplete_syntax",
      rule: ($) =>
        choice($._regex_unterminated_address, $._regex_unterminated_substitute),
    },
    {
      reason: "incomplete_regular_expression_escape",
      outcome: "incomplete_syntax",
      rule: ($) => $._regex_incomplete_escape,
    },
    {
      reason: "incomplete_replacement",
      outcome: "incomplete_syntax",
      rule: ($) => $._replacement_unterminated,
    },
    {
      reason: "incomplete_replacement_escape",
      outcome: "incomplete_syntax",
      rule: ($) => $._replacement_incomplete_escape,
    },
    {
      reason: "incomplete_translation",
      outcome: "incomplete_syntax",
      rule: ($) =>
        choice(
          $._translate_unterminated_source,
          $._translate_unterminated_destination,
        ),
    },
    {
      reason: "incomplete_translation_escape",
      outcome: "incomplete_syntax",
      rule: ($) => $._translate_incomplete_escape,
    },
  ];
}

function externalTokens($, mode) {
  return [
    $._regex_address_start,
    $._escaped_regex_address_start,
    $._regex_address_end,
    $._substitute_start,
    $._substitute_middle,
    $._substitute_end,
    $._translate_start,
    $._translate_middle,
    $._translate_end,
    $._regex_literal,
    $._regex_beginning_anchor,
    $._regex_end_anchor,
    $._regex_wildcard,
    $._regex_quoted_escape,
    $._regex_newline_escape,
    $._regex_escaped_delimiter,
    $._regex_special_escaped_delimiter,
    $._regex_group_open,
    $._regex_group_close,
    $._regex_unclosed_group,
    ...(mode === "bre"
      ? [
          $._regex_unmatched_group_close,
          $._regex_bre_alternation,
          $._regex_bre_zero_or_one,
          $._regex_bre_one_or_more,
          $._regex_bre_subexpression_left_anchor,
          $._regex_bre_subexpression_right_anchor,
          $._bre_vertical_line_escape_marker,
          $._bre_question_mark_escape_marker,
          $._bre_plus_escape_marker,
          $._regex_unmatched_interval_close,
          $._unmatched_interval_close_marker,
        ]
      : []),
    ...(mode === "ere" ? [$._regex_alternation_operator] : []),
    $._regex_leading_duplication_marker,
    $._regex_adjacent_duplication_marker,
    $._regex_zero_or_more,
    ...(mode === "ere"
      ? [
          $._regex_one_or_more,
          $._regex_zero_or_one,
          $._regex_repetition_modifier,
        ]
      : []),
    $._regex_interval_open,
    $._regex_dup_count,
    $._regex_interval_separator,
    $._regex_interval_close,
    ...(mode === "bre" ? [$._regex_backreference] : []),
    $._regex_invalid_interval,
    $._regex_nonportable_escape,
    $._regex_incomplete_escape,
    $._regex_bracket_open,
    $._regex_bracket_close,
    $._regex_bracket_literal,
    $._regex_bracket_negation,
    $._regex_bracket_hyphen,
    $._regex_bracket_range_end_hyphen,
    $._regex_bracket_trailing_hyphen,
    $._regex_open_colon,
    $._regex_class_name,
    $._regex_colon_close,
    $._regex_open_dot,
    $._regex_coll_elem_single,
    $._regex_coll_elem_multi,
    $._regex_meta_char,
    $._regex_dot_close,
    $._regex_open_equal,
    $._regex_equal_close,
    $._regex_malformed_bracket_term,
    $._regex_shared_range_endpoint,
    $._ambiguous_bracket_expression_marker,
    $._missing_bracket_list_marker,
    $._unclosed_bracket_expression_marker,
    $._nonportable_range_start_marker,
    $._nonportable_range_end_marker,
    $._regex_unterminated_address,
    $._regex_unterminated_substitute,
    $._replacement_literal,
    $._replacement_match_reference,
    $._replacement_backreference,
    $._replacement_escaped_delimiter,
    $._replacement_ampersand_escaped_delimiter,
    $._replacement_escape_sequence,
    $._replacement_nonportable_escape,
    $._replacement_escaped_newline,
    $._replacement_incomplete_escape,
    $._replacement_unterminated,
    $._translate_literal,
    $._translate_escaped_delimiter,
    $._translate_escape,
    $._translate_nonportable_escape,
    $._translate_incomplete_escape,
    $._translate_unterminated_source,
    $._translate_unterminated_destination,
    $._invalid_substitution_flag,
    $._nonportable_substitution_occurrence,
    $._text_command_start,
    $._text_literal,
    $._text_backslash_escape,
    $._text_escaped_newline,
    $._text_unspecified_escape,
    $._text_line_end,
    $._text_eof,
    $._comment_text,
    $._file_argument,
    $._line_word,
    $._right_brace,
    ...missingMarkerNames.map((name) => $[`_${name}_marker`]),
    $._error_sentinel,
  ];
}

function defineGrammar(name, mode) {
  if (mode !== "bre" && mode !== "ere") {
    throw new Error(`Unsupported regular-expression mode: ${mode}`);
  }

  return grammar({
    name,

    externals: ($) => externalTokens($, mode),

    extras: () => [],

    conflicts: ($) => [
      [
        $.address_clause,
        $._chainable_editing_command,
        $._line_terminated_editing_command_body,
      ],
    ],

    rules: {
      ...sedRules(mode),
      ...regularExpressionRules(mode),
      ...defineIssueRules(issueDefinitions(mode)),
    },
  });
}

module.exports = defineGrammar;
