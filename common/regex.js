const { issueField, issueNode, namedExternal } = require("./dsl");

function subexpressionBody($, expression) {
  return choice(
    field("expression", expression),
    issueField($, "empty_subexpression"),
    issueField($, "missing_subexpression"),
    $._missing_subexpression_placeholder_marker,
  );
}

function intervalExpression($, openingName, closingName) {
  const closing = field(
    "closing",
    namedExternal($, $._regex_interval_close, closingName),
  );
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
          closing,
          seq(issueField($, "malformed_interval"), optional(closing)),
          issueField($, "incomplete_interval"),
        ),
      ),
      seq(
        choice(
          issueField($, "malformed_interval"),
          issueField($, "incomplete_interval"),
        ),
        optional(closing),
      ),
    ),
  );
}

function compoundBracketExpression(
  $,
  openingExternal,
  marker,
  contentField,
  content,
  closingExternal,
) {
  const closing = seq(alias(closingExternal, marker), "]");
  return seq(
    alias(openingExternal, "["),
    marker,
    choice(
      seq(
        repeat1(
          choice(
            field(contentField, content),
            issueField($, "invalid_regular_expression_character"),
            ...(marker === ":"
              ? [issueField($, "invalid_character_class_name")]
              : []),
          ),
        ),
        choice(
          closing,
          seq(issueField($, "malformed_bracket_term"), optional(closing)),
          issueField($, "incomplete_bracket_term"),
        ),
      ),
      seq(
        choice(
          issueField($, "malformed_bracket_term"),
          issueField($, "incomplete_bracket_term"),
        ),
        optional(closing),
      ),
    ),
  );
}

function bracketListBody($) {
  return choice(
    field("elements", $.bracket_list),
    issueField($, "missing_bracket_list"),
    issueField($, "incomplete_missing_bracket_list"),
  );
}

function subexpressionClose($, tokenName) {
  return choice(
    namedExternal($, $._regex_group_close, tokenName),
    issueField($, "unclosed_subexpression"),
    issueField($, "incomplete_unclosed_subexpression"),
  );
}

function bracketExpression($, ambiguous) {
  return seq(
    field("opening", namedExternal($, $._regex_bracket_open, "open_bracket")),
    field("list", choice($.matching_list, $.nonmatching_list)),
    ...(ambiguous ? [$._ambiguous_bracket_expression_marker] : []),
    field("closing", $.close_bracket),
  );
}

function bracketRules() {
  return {
    bracket_expression: ($) => bracketExpression($, false),

    _ambiguous_bracket_expression: ($) => bracketExpression($, true),

    _bracket_expression: ($) =>
      choice(
        $.bracket_expression,
        issueField($, "ambiguous_bracket_expression"),
      ),

    close_bracket: ($) =>
      choice(
        namedExternal($, $._regex_bracket_close, "close_bracket_token"),
        issueField($, "unclosed_bracket_expression"),
        issueField($, "incomplete_unclosed_bracket_expression"),
      ),

    matching_list: bracketListBody,

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
        bracketListBody($),
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
        field("start", issueNode($, "character_class_range_start")),
        field(
          "operator",
          namedExternal($, $._regex_bracket_hyphen, "range_operator"),
        ),
      ),

    _equivalence_class_start_range: ($) =>
      seq(
        field("start", issueNode($, "equivalence_class_range_start")),
        field(
          "operator",
          namedExternal($, $._regex_bracket_hyphen, "range_operator"),
        ),
      ),

    _character_class_end_range: ($) =>
      field("term", issueNode($, "character_class_range_end")),

    _equivalence_class_end_range: ($) =>
      field("term", issueNode($, "equivalence_class_range_end")),

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
      choice(
        namedExternal($, $._regex_bracket_literal, "collating_element_token"),
        issueField($, "invalid_regular_expression_character"),
      ),

    collating_symbol: ($) =>
      compoundBracketExpression(
        $,
        $._regex_open_dot,
        ".",
        "element",
        choice(
          namedExternal($, $._regex_coll_elem_single, "coll_elem_single"),
          namedExternal($, $._regex_coll_elem_multi, "coll_elem_multi"),
          namedExternal($, $._regex_meta_char, "meta_char"),
        ),
        $._regex_dot_close,
      ),

    equivalence_class: ($) =>
      compoundBracketExpression(
        $,
        $._regex_open_equal,
        "=",
        "element",
        choice(
          namedExternal($, $._regex_coll_elem_single, "coll_elem_single"),
          namedExternal($, $._regex_coll_elem_multi, "coll_elem_multi"),
        ),
        $._regex_equal_close,
      ),

    character_class: ($) =>
      compoundBracketExpression(
        $,
        $._regex_open_colon,
        ":",
        "name",
        namedExternal($, $._regex_class_name, "class_name"),
        $._regex_colon_close,
      ),
  };
}

function commonRegularExpressionRules() {
  return {
    dup_count: ($) => $._regex_dup_count,

    ordinary_character: ($) => $._regex_literal,

    quoted_character: ($) =>
      choice(
        namedExternal($, $._regex_quoted_escape, "quoted_character_token"),
        seq(
          $._regex_escape_prefix,
          issueField($, "invalid_regular_expression_character"),
        ),
        $.escaped_delimiter,
        issueField($, "ordinary_character_escape"),
        issueField($, "incomplete_regular_expression_escape"),
        issueField($, "forbidden_regular_expression_newline"),
      ),

    escaped_delimiter: ($) => $._regex_escaped_delimiter,

    sed_newline_escape: ($) => $._regex_newline_escape,

    period: ($) => $._regex_period,

    left_anchor: ($) => $._regex_beginning_anchor,

    right_anchor: ($) => $._regex_end_anchor,

    ...bracketRules(),
  };
}

function breDuplicationSymbol($) {
  return choice(
    namedExternal($, $._regex_zero_or_more, "zero_or_more_operator"),
    $._bre_interval,
  );
}

function breRules() {
  return {
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
            field("operator", issueNode($, "adjacent_duplication_symbol")),
          ),
        ),
        field("operator", issueNode($, "leading_duplication_symbol")),
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
      subexpressionClose($, "back_close_parenthesis_token"),

    backreference: ($) => $._regex_backreference,

    one_char_or_coll_elem_bre: ($) =>
      choice(
        issueField($, "invalid_regular_expression_character"),
        $.ordinary_character,
        $.quoted_character,
        $.sed_newline_escape,
        $.period,
        $._bracket_expression,
        issueField($, "special_delimiter_escape"),
        issueField($, "bre_vertical_line_escape"),
        issueField($, "bre_question_mark_escape"),
        issueField($, "bre_plus_escape"),
        issueField($, "bre_subexpression_right_anchor"),
        issueField($, "bre_subexpression_left_anchor"),
      ),

    bre_dupl_symbol: ($) => breDuplicationSymbol($),

    _bre_interval: ($) =>
      intervalExpression($, "back_open_brace", "back_close_brace"),
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
    extended_reg_exp: ($) => {
      const emptyBranch = alias($._empty_ere_branch, $.ere_branch);
      return choice(
        $.ere_branch,
        prec.left(
          1,
          seq(
            field("left", choice($.extended_reg_exp, emptyBranch)),
            field("operator", $.ere_alternation_operator),
            field("right", choice($.ere_branch, emptyBranch)),
          ),
        ),
      );
    },

    _empty_ere_branch: ($) =>
      choice(
        issueField($, "empty_alternative"),
        issueField($, "incomplete_alternative"),
      ),

    ere_alternation_operator: ($) => $._regex_alternation_operator,

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
            field(
              "operator",
              choice(
                $.ere_dupl_symbol,
                issueNode($, "adjacent_duplication_symbol"),
              ),
            ),
          ),
        ),
        field("operator", issueNode($, "leading_duplication_symbol")),
      ),

    close_parenthesis: ($) => subexpressionClose($, "close_parenthesis_token"),

    one_char_or_coll_elem_ere: ($) =>
      choice(
        issueField($, "invalid_regular_expression_character"),
        $.ordinary_character,
        $.quoted_character,
        $.sed_newline_escape,
        $.period,
        $._bracket_expression,
        issueField($, "special_delimiter_escape"),
      ),

    ere_dupl_symbol: ($) =>
      seq(
        ereDuplicationSymbol($),
        optional(field("modifier", $.repetition_modifier)),
      ),

    _ere_interval: ($) => intervalExpression($, "open_brace", "close_brace"),

    repetition_modifier: ($) => $._regex_repetition_modifier,
  };
}

function regularExpressionRules(mode) {
  return {
    ...commonRegularExpressionRules(),
    ...(mode === "bre" ? breRules() : ereRules()),
  };
}

module.exports = regularExpressionRules;
