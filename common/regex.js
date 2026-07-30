function namedExternal($, external, name) {
  return alias(external, $[name]);
}

function issueField($, reason) {
  return field("issue", alias($[`_${reason}_issue`], $.syntax_issue));
}

function intervalExpression($, openingName, closingName) {
  return seq(
    field("opening", namedExternal($, $._regex_interval_open, openingName)),
    choice(
      seq(
        field("minimum", $.dup_count),
        optional(
          seq(
            field(
              "separator",
              namedExternal(
                $,
                $._regex_interval_separator,
                "interval_separator",
              ),
            ),
            optional(field("maximum", $.dup_count)),
          ),
        ),
        choice(
          field(
            "closing",
            namedExternal($, $._regex_interval_close, closingName),
          ),
          seq(
            issueField($, "malformed_interval"),
            optional(
              field(
                "closing",
                namedExternal($, $._regex_interval_close, closingName),
              ),
            ),
          ),
        ),
      ),
      seq(
        issueField($, "malformed_interval"),
        optional(
          field(
            "closing",
            namedExternal($, $._regex_interval_close, closingName),
          ),
        ),
      ),
    ),
  );
}

function compoundBracketExpression(
  $,
  openingExternal,
  openingName,
  contentField,
  content,
  closingExternal,
  closingName,
) {
  const closing = namedExternal($, closingExternal, closingName);
  return seq(
    field("opening", namedExternal($, openingExternal, openingName)),
    choice(
      seq(
        field(contentField, content),
        choice(
          field("closing", closing),
          seq(
            issueField($, "malformed_bracket_term"),
            optional(field("closing", closing)),
          ),
        ),
      ),
      seq(
        issueField($, "malformed_bracket_term"),
        optional(field("closing", closing)),
      ),
    ),
  );
}

function bracketRules() {
  return {
    bracket_expression: ($) =>
      seq(
        field(
          "opening",
          namedExternal($, $._regex_bracket_open, "open_bracket"),
        ),
        field("list", choice($.matching_list, $.nonmatching_list)),
        optional(issueField($, "ambiguous_bracket_expression")),
        field("closing", $.close_bracket),
      ),

    close_bracket: ($) =>
      choice(
        namedExternal($, $._regex_bracket_close, "close_bracket_token"),
        seq(issueField($, "unclosed_bracket_expression")),
      ),

    matching_list: ($) =>
      choice(
        field("elements", $.bracket_list),
        seq(issueField($, "missing_bracket_list")),
      ),

    nonmatching_list: ($) =>
      seq(
        field(
          "operator",
          namedExternal(
            $,
            $._regex_bracket_negation,
            "nonmatching_list_operator",
          ),
        ),
        choice(
          field("elements", $.bracket_list),
          seq(issueField($, "missing_bracket_list")),
        ),
      ),

    bracket_list: ($) =>
      choice(
        $.follow_list,
        seq(
          $.follow_list,
          field(
            "trailing_hyphen",
            namedExternal(
              $,
              $._regex_bracket_trailing_hyphen,
              "trailing_hyphen",
            ),
          ),
        ),
      ),

    follow_list: ($) =>
      choice(
        $.expression_term,
        prec.left(
          seq(field("left", $.follow_list), field("right", $.expression_term)),
        ),
      ),

    expression_term: ($) =>
      choice(
        $.single_expression,
        $.range_expression,
        seq(issueField($, "malformed_bracket_term")),
        seq(issueField($, "shared_range_endpoint")),
      ),

    single_expression: ($) =>
      choice($.end_range, $.character_class, $.equivalence_class),

    range_expression: ($) =>
      seq(
        field(
          "start",
          choice(
            $.start_range,
            alias($._character_class_start_range, $.start_range),
            alias($._equivalence_class_start_range, $.start_range),
          ),
        ),
        choice(
          field(
            "end",
            choice(
              $.end_range,
              alias($._character_class_end_range, $.end_range),
              alias($._equivalence_class_end_range, $.end_range),
            ),
          ),
          field(
            "ending_hyphen",
            namedExternal(
              $,
              $._regex_bracket_range_end_hyphen,
              "range_end_hyphen",
            ),
          ),
        ),
      ),

    _character_class_start_range: ($) =>
      seq(
        field("start", $.character_class),
        issueField($, "character_class_range_start"),
        field(
          "operator",
          namedExternal($, $._regex_bracket_hyphen, "range_operator"),
        ),
      ),

    _equivalence_class_start_range: ($) =>
      seq(
        field("start", $.equivalence_class),
        issueField($, "equivalence_class_range_start"),
        field(
          "operator",
          namedExternal($, $._regex_bracket_hyphen, "range_operator"),
        ),
      ),

    _character_class_end_range: ($) =>
      seq(
        issueField($, "character_class_range_end"),
        field("term", $.character_class),
      ),

    _equivalence_class_end_range: ($) =>
      seq(
        issueField($, "equivalence_class_range_end"),
        field("term", $.equivalence_class),
      ),

    start_range: ($) =>
      seq(
        field("start", $.end_range),
        field(
          "operator",
          namedExternal($, $._regex_bracket_hyphen, "range_operator"),
        ),
      ),

    end_range: ($) => choice($.collating_element, $.collating_symbol),

    collating_element: ($) =>
      namedExternal($, $._regex_bracket_literal, "collating_element_token"),

    collating_symbol: ($) =>
      compoundBracketExpression(
        $,
        $._regex_open_dot,
        "open_dot",
        "element",
        choice(
          namedExternal($, $._regex_coll_elem_single, "coll_elem_single"),
          namedExternal($, $._regex_coll_elem_multi, "coll_elem_multi"),
          namedExternal($, $._regex_meta_char, "meta_char"),
        ),
        $._regex_dot_close,
        "dot_close",
      ),

    equivalence_class: ($) =>
      compoundBracketExpression(
        $,
        $._regex_open_equal,
        "open_equal",
        "element",
        choice(
          namedExternal($, $._regex_coll_elem_single, "coll_elem_single"),
          namedExternal($, $._regex_coll_elem_multi, "coll_elem_multi"),
        ),
        $._regex_equal_close,
        "equal_close",
      ),

    character_class: ($) =>
      compoundBracketExpression(
        $,
        $._regex_open_colon,
        "open_colon",
        "name",
        namedExternal($, $._regex_class_name, "class_name"),
        $._regex_colon_close,
        "colon_close",
      ),
  };
}

function commonRegularExpressionRules() {
  return {
    dup_count: ($) => namedExternal($, $._regex_dup_count, "dup_count_token"),

    ordinary_character: ($) =>
      namedExternal($, $._regex_literal, "ordinary_character_token"),

    quoted_character: ($) =>
      choice(
        namedExternal($, $._regex_quoted_escape, "quoted_character_token"),
        $.escaped_delimiter,
        seq(issueField($, "ordinary_character_escape")),
        seq(issueField($, "incomplete_regular_expression_escape")),
      ),

    escaped_delimiter: ($) =>
      choice(
        field(
          "token",
          namedExternal(
            $,
            $._regex_escaped_delimiter,
            "escaped_delimiter_token",
          ),
        ),
        seq(issueField($, "special_delimiter_escape")),
      ),

    sed_newline_escape: ($) =>
      namedExternal($, $._regex_newline_escape, "sed_newline_escape_token"),

    wildcard: ($) => namedExternal($, $._regex_wildcard, "wildcard_token"),

    left_anchor: ($) =>
      namedExternal($, $._regex_beginning_anchor, "left_anchor_token"),

    right_anchor: ($) =>
      namedExternal($, $._regex_end_anchor, "right_anchor_token"),

    ...bracketRules(),
  };
}

function breDuplicationSymbol($) {
  return choice(
    namedExternal($, $._regex_zero_or_more, "zero_or_more_operator"),
    $._bre_interval,
    seq(
      field("token", namedExternal($, $._regex_bre_zero_or_one, "back_qm")),
      issueField($, "bre_question_mark_escape"),
    ),
    seq(
      field("token", namedExternal($, $._regex_bre_one_or_more, "back_plus")),
      issueField($, "bre_plus_escape"),
    ),
  );
}

function breRules() {
  return {
    left_anchor: ($) =>
      choice(
        namedExternal($, $._regex_beginning_anchor, "left_anchor_token"),
        seq(issueField($, "bre_subexpression_left_anchor")),
      ),

    right_anchor: ($) =>
      choice(
        namedExternal($, $._regex_end_anchor, "right_anchor_token"),
        seq(issueField($, "bre_subexpression_right_anchor")),
      ),

    basic_reg_exp: ($) =>
      choice(
        $.bre_branch,
        prec.left(
          1,
          seq(
            field("left", $.basic_reg_exp),
            field("operator", $.bre_alternation_operator),
            field("right", $.bre_branch),
          ),
        ),
        prec.left(
          1,
          seq(
            field("left", alias($._empty_bre_branch, $.bre_branch)),
            field("operator", $.bre_alternation_operator),
            field("right", $.bre_branch),
          ),
        ),
        prec.left(
          1,
          seq(
            field("left", $.basic_reg_exp),
            field("operator", $.bre_alternation_operator),
            field("right", alias($._empty_bre_branch, $.bre_branch)),
          ),
        ),
        prec.left(
          1,
          seq(
            field("left", alias($._empty_bre_branch, $.bre_branch)),
            field("operator", $.bre_alternation_operator),
            field("right", alias($._empty_bre_branch, $.bre_branch)),
          ),
        ),
      ),

    _empty_bre_branch: ($) => seq(issueField($, "empty_alternative")),

    bre_alternation_operator: ($) =>
      seq(
        field("token", namedExternal($, $._regex_bre_alternation, "back_bar")),
        issueField($, "bre_vertical_line_escape"),
      ),

    bre_branch: ($) =>
      choice(
        $.bre_expression,
        prec.left(
          seq(field("left", $.bre_branch), field("right", $.bre_expression)),
        ),
      ),

    bre_expression: ($) =>
      choice(
        $.simple_bre,
        field("left_anchor", $.left_anchor),
        field("right_anchor", $.right_anchor),
        prec(
          1,
          seq(
            field("left_anchor", $.left_anchor),
            field("right_anchor", $.right_anchor),
          ),
        ),
        prec(
          1,
          seq(
            field("left_anchor", $.left_anchor),
            field("expression", $.simple_bre),
          ),
        ),
        prec(
          1,
          seq(
            field("expression", $.simple_bre),
            field("right_anchor", $.right_anchor),
          ),
        ),
        prec(
          2,
          seq(
            field("left_anchor", $.left_anchor),
            field("expression", $.simple_bre),
            field("right_anchor", $.right_anchor),
          ),
        ),
      ),

    simple_bre: ($) =>
      choice(
        field("operand", $.nondupl_bre),
        prec(
          1,
          seq(
            field("operand", $.nondupl_bre),
            field("operator", $.bre_dupl_symbol),
          ),
        ),
        prec.left(
          -1,
          seq(
            field("operand", $.simple_bre),
            field("operator", $.adjacent_bre_dupl_symbol),
          ),
        ),
        field("operator", $.leading_bre_dupl_symbol),
      ),

    nondupl_bre: ($) =>
      choice(
        $.one_char_or_coll_elem_bre,
        seq(
          field(
            "opening",
            namedExternal($, $._regex_group_open, "back_open_parenthesis"),
          ),
          choice(
            field("expression", $.basic_reg_exp),
            issueField($, "empty_subexpression"),
            issueField($, "missing_subexpression"),
          ),
          field("closing", $.back_close_parenthesis),
        ),
        $.backreference,
        seq(issueField($, "unmatched_subexpression_close")),
        seq(
          field(
            "closing",
            namedExternal(
              $,
              $._regex_unmatched_interval_close,
              "back_close_brace",
            ),
          ),
          issueField($, "unmatched_interval_close"),
        ),
      ),

    back_close_parenthesis: ($) =>
      choice(
        namedExternal($, $._regex_group_close, "back_close_parenthesis_token"),
        seq(issueField($, "unclosed_subexpression")),
      ),

    backreference: ($) =>
      namedExternal($, $._regex_backreference, "backreference_token"),

    one_char_or_coll_elem_bre: ($) =>
      choice(
        $.ordinary_character,
        $.quoted_character,
        $.sed_newline_escape,
        $.wildcard,
        $.bracket_expression,
      ),

    bre_dupl_symbol: ($) => breDuplicationSymbol($),

    _bre_interval: ($) =>
      intervalExpression($, "back_open_brace", "back_close_brace"),

    _leading_bre_dupl_symbol: ($) => breDuplicationSymbol($),

    leading_bre_dupl_symbol: ($) =>
      choice(
        seq(
          issueField($, "leading_duplication_symbol"),
          field(
            "operator",
            alias($._leading_bre_dupl_symbol, $.bre_dupl_symbol),
          ),
        ),
        seq(issueField($, "malformed_interval")),
      ),

    _adjacent_bre_dupl_symbol: ($) => breDuplicationSymbol($),

    adjacent_bre_dupl_symbol: ($) =>
      choice(
        seq(
          issueField($, "adjacent_duplication_symbol"),
          field(
            "operator",
            alias($._adjacent_bre_dupl_symbol, $.bre_dupl_symbol),
          ),
        ),
        seq(issueField($, "malformed_interval")),
      ),
  };
}

function ereDuplicationSymbol($) {
  return choice(
    namedExternal($, $._regex_zero_or_more, "zero_or_more_operator"),
    namedExternal($, $._regex_one_or_more, "one_or_more_operator"),
    namedExternal($, $._regex_zero_or_one, "zero_or_one_operator"),
    $._ere_interval,
  );
}

function ereRules() {
  return {
    extended_reg_exp: ($) =>
      choice(
        $.ere_branch,
        prec.left(
          1,
          seq(
            field("left", $.extended_reg_exp),
            field("operator", $.ere_alternation_operator),
            field("right", $.ere_branch),
          ),
        ),
        prec.left(
          1,
          seq(
            field("left", alias($._empty_ere_branch, $.ere_branch)),
            field("operator", $.ere_alternation_operator),
            field("right", $.ere_branch),
          ),
        ),
        prec.left(
          1,
          seq(
            field("left", $.extended_reg_exp),
            field("operator", $.ere_alternation_operator),
            field("right", alias($._empty_ere_branch, $.ere_branch)),
          ),
        ),
        prec.left(
          1,
          seq(
            field("left", alias($._empty_ere_branch, $.ere_branch)),
            field("operator", $.ere_alternation_operator),
            field("right", alias($._empty_ere_branch, $.ere_branch)),
          ),
        ),
      ),

    _empty_ere_branch: ($) => seq(issueField($, "empty_alternative")),

    ere_alternation_operator: ($) =>
      namedExternal(
        $,
        $._regex_alternation_operator,
        "ere_alternation_operator_token",
      ),

    ere_branch: ($) =>
      choice(
        $.ere_expression,
        prec.left(
          seq(field("left", $.ere_branch), field("right", $.ere_expression)),
        ),
      ),

    ere_expression: ($) =>
      choice(
        $.one_char_or_coll_elem_ere,
        field("left_anchor", $.left_anchor),
        field("right_anchor", $.right_anchor),
        seq(
          field(
            "opening",
            namedExternal($, $._regex_group_open, "open_parenthesis"),
          ),
          choice(
            field("expression", $.extended_reg_exp),
            issueField($, "empty_subexpression"),
            issueField($, "missing_subexpression"),
          ),
          field("closing", $.close_parenthesis),
        ),
        prec.left(
          1,
          seq(
            field("operand", $.ere_expression),
            field("operator", $.ere_dupl_symbol),
          ),
        ),
        field("operator", $.leading_ere_dupl_symbol),
      ),

    close_parenthesis: ($) =>
      choice(
        namedExternal($, $._regex_group_close, "close_parenthesis_token"),
        seq(issueField($, "unclosed_subexpression")),
      ),

    one_char_or_coll_elem_ere: ($) =>
      choice(
        $.ordinary_character,
        $.quoted_character,
        $.sed_newline_escape,
        $.wildcard,
        $.bracket_expression,
      ),

    ere_dupl_symbol: ($) =>
      choice(
        ereDuplicationSymbol($),
        $.repetition_modifier,
        seq(
          issueField($, "adjacent_duplication_symbol"),
          ereDuplicationSymbol($),
        ),
        seq(issueField($, "malformed_interval")),
      ),

    _ere_interval: ($) => intervalExpression($, "open_brace", "close_brace"),

    repetition_modifier: ($) =>
      field(
        "operator",
        namedExternal($, $._regex_repetition_modifier, "zero_or_one_operator"),
      ),

    _leading_ere_dupl_symbol: ($) => ereDuplicationSymbol($),

    leading_ere_dupl_symbol: ($) =>
      choice(
        seq(
          issueField($, "leading_duplication_symbol"),
          field(
            "operator",
            alias($._leading_ere_dupl_symbol, $.ere_dupl_symbol),
          ),
        ),
        seq(issueField($, "malformed_interval")),
      ),
  };
}

function regularExpressionRules(mode) {
  return {
    ...commonRegularExpressionRules(),
    ...(mode === "bre" ? breRules() : ereRules()),
  };
}

module.exports = regularExpressionRules;
