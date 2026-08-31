const { issueField, namedExternal } = require("./dsl");

function subexpressionBody($, expression) {
  return choice(
    field("expression", expression),
    issueField($, "empty_subexpression"),
    issueField($, "missing_subexpression"),
    $._missing_subexpression_placeholder_marker,
  );
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
          issueField($, "incomplete_interval"),
        ),
      ),
      seq(
        choice(
          issueField($, "malformed_interval"),
          issueField($, "incomplete_interval"),
        ),
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
          issueField($, "incomplete_bracket_term"),
        ),
      ),
      seq(
        choice(
          issueField($, "malformed_bracket_term"),
          issueField($, "incomplete_bracket_term"),
        ),
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
        issueField($, "unclosed_bracket_expression"),
        issueField($, "incomplete_unclosed_bracket_expression"),
      ),

    matching_list: ($) =>
      choice(
        field("elements", $.bracket_list),
        issueField($, "missing_bracket_list"),
        issueField($, "incomplete_missing_bracket_list"),
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
          issueField($, "missing_bracket_list"),
          issueField($, "incomplete_missing_bracket_list"),
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
        issueField($, "malformed_bracket_term"),
        issueField($, "shared_range_endpoint"),
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
        issueField($, "ordinary_character_escape"),
        issueField($, "incomplete_regular_expression_escape"),
        issueField($, "forbidden_regular_expression_newline"),
      ),

    escaped_delimiter: ($) =>
      field(
        "token",
        namedExternal($, $._regex_escaped_delimiter, "escaped_delimiter_token"),
      ),

    ambiguous_delimiter_escape: ($) =>
      issueField($, "special_delimiter_escape"),

    sed_newline_escape: ($) =>
      namedExternal($, $._regex_newline_escape, "sed_newline_escape_token"),

    period: ($) => namedExternal($, $._regex_period, "period_token"),

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
  );
}

function misplacedBreDuplSymbol($, reason) {
  return choice(
    seq(issueField($, reason), field("operator", $.bre_dupl_symbol)),
    issueField($, "malformed_interval"),
    issueField($, "incomplete_interval"),
  );
}

function breRules() {
  return {
    bre_extension_escape: ($) =>
      choice(
        seq(
          field(
            "token",
            namedExternal($, $._regex_bre_vertical_line_escape, "back_bar"),
          ),
          issueField($, "bre_vertical_line_escape"),
        ),
        seq(
          field(
            "token",
            namedExternal($, $._regex_bre_question_mark_escape, "back_qm"),
          ),
          issueField($, "bre_question_mark_escape"),
        ),
        seq(
          field(
            "token",
            namedExternal($, $._regex_bre_plus_escape, "back_plus"),
          ),
          issueField($, "bre_plus_escape"),
        ),
      ),

    bre_subexpression_anchor: ($) =>
      choice(
        issueField($, "bre_subexpression_right_anchor"),
        issueField($, "bre_subexpression_left_anchor"),
      ),

    basic_reg_exp: ($) => $.bre_branch,

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
          subexpressionBody($, $.basic_reg_exp),
          field("closing", $.back_close_parenthesis),
        ),
        $.backreference,
        issueField($, "unmatched_subexpression_close"),
        issueField($, "unmatched_interval_close"),
      ),

    back_close_parenthesis: ($) =>
      choice(
        namedExternal($, $._regex_group_close, "back_close_parenthesis_token"),
        issueField($, "unclosed_subexpression"),
        issueField($, "incomplete_unclosed_subexpression"),
      ),

    backreference: ($) =>
      namedExternal($, $._regex_backreference, "backreference_token"),

    one_char_or_coll_elem_bre: ($) =>
      choice(
        $.ordinary_character,
        $.quoted_character,
        $.sed_newline_escape,
        $.period,
        $.bracket_expression,
        $.ambiguous_delimiter_escape,
        $.bre_extension_escape,
        $.bre_subexpression_anchor,
      ),

    bre_dupl_symbol: ($) => breDuplicationSymbol($),

    _bre_interval: ($) =>
      intervalExpression($, "back_open_brace", "back_close_brace"),

    leading_bre_dupl_symbol: ($) =>
      misplacedBreDuplSymbol($, "leading_duplication_symbol"),

    adjacent_bre_dupl_symbol: ($) =>
      misplacedBreDuplSymbol($, "adjacent_duplication_symbol"),
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

    _empty_ere_branch: ($) =>
      choice(
        issueField($, "empty_alternative"),
        issueField($, "incomplete_alternative"),
      ),

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
          subexpressionBody($, $.extended_reg_exp),
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
        issueField($, "unclosed_subexpression"),
        issueField($, "incomplete_unclosed_subexpression"),
      ),

    one_char_or_coll_elem_ere: ($) =>
      choice(
        $.ordinary_character,
        $.quoted_character,
        $.sed_newline_escape,
        $.period,
        $.bracket_expression,
        $.ambiguous_delimiter_escape,
      ),

    ere_dupl_symbol: ($) =>
      seq(
        choice(
          ereDuplicationSymbol($),
          seq(
            issueField($, "adjacent_duplication_symbol"),
            ereDuplicationSymbol($),
          ),
          issueField($, "malformed_interval"),
          issueField($, "incomplete_interval"),
        ),
        optional(field("modifier", $.repetition_modifier)),
      ),

    _ere_interval: ($) => intervalExpression($, "open_brace", "close_brace"),

    repetition_modifier: ($) => $._regex_repetition_modifier,

    _leading_ere_dupl_symbol: ($) =>
      seq(
        ereDuplicationSymbol($),
        optional(field("modifier", $.repetition_modifier)),
      ),

    leading_ere_dupl_symbol: ($) =>
      choice(
        seq(
          issueField($, "leading_duplication_symbol"),
          field(
            "operator",
            alias($._leading_ere_dupl_symbol, $.ere_dupl_symbol),
          ),
        ),
        seq(
          choice(
            issueField($, "malformed_interval"),
            issueField($, "incomplete_interval"),
          ),
          optional(field("modifier", $.repetition_modifier)),
        ),
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
