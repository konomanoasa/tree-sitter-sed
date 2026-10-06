import { issueField, namedExternal } from "./dsl.js";

function intervalExpression($, opening, closing) {
  const piece = (name) =>
    choice(
      field(name, $.duplication_count),
      field(
        name,
        namedExternal($, $._regex_interval_escaped_count, "escaped_delimiter"),
      ),
      issueField($, "invalid_interval_character"),
      issueField($, "invalid_regular_expression_character"),
      issueField($, "invalid_encoding"),
      seq(
        $._escape_prefix,
        choice(
          issueField($, "escaped_invalid_regular_expression_character"),
          issueField($, "invalid_encoding"),
        ),
      ),
    );
  return seq(
    alias($._regex_interval_open, opening),
    choice(
      repeat1(piece("minimum")),
      issueField($, "missing_interval_minimum"),
      issueField($, "incomplete_interval_minimum"),
    ),
    optional(
      seq(
        choice(
          alias($._regex_interval_separator, ","),
          namedExternal(
            $,
            $._regex_interval_escaped_separator,
            "escaped_delimiter",
          ),
        ),
        repeat(
          choice(
            piece("maximum"),
            issueField($, "unexpected_interval_separator"),
          ),
        ),
      ),
    ),
    choice(
      alias($._regex_interval_close, closing),
      issueField($, "missing_interval_close"),
      issueField($, "incomplete_interval"),
      issueField($, "invalid_interval_close"),
      issueField($, "incomplete_interval_close"),
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
  ...payloadIssues
) {
  const closing = seq(
    alias(closingExternal, marker),
    choice(
      "]",
      issueField($, "missing_bracket_term_close"),
      issueField($, "incomplete_bracket_term"),
    ),
  );
  const payload = repeat1(
    choice(
      field(contentField, content),
      issueField($, "invalid_regular_expression_character"),
      issueField($, "invalid_encoding"),
      ...payloadIssues.map((reason) => issueField($, reason)),
    ),
  );
  return seq(
    alias(openingExternal, "["),
    marker,
    choice(
      payload,
      issueField($, "missing_bracket_term_payload"),
      issueField($, "incomplete_bracket_term_payload"),
    ),
    choice(
      closing,
      issueField($, "missing_bracket_term_close"),
      issueField($, "incomplete_bracket_term"),
    ),
  );
}

function bracketListBody($) {
  return choice(
    $.bracket_list,
    issueField($, "missing_bracket_list"),
    issueField($, "incomplete_missing_bracket_list"),
  );
}

function subexpressionClose($, closing) {
  return choice(
    field("closing", alias($._regex_group_close, closing)),
    issueField($, "unclosed_subexpression"),
    issueField($, "incomplete_unclosed_subexpression"),
  );
}

function bracketExpression($, ambiguous) {
  return seq(
    alias($._regex_bracket_open, "["),
    choice(
      choice($.matching_list, $.nonmatching_list),
      issueField($, "missing_bracket_list"),
      issueField($, "incomplete_missing_bracket_list"),
    ),
    ...(ambiguous ? [$._ambiguous_bracket_expression_marker] : []),
    choice(
      alias($._regex_bracket_close, "]"),
      issueField($, "unclosed_bracket_expression"),
      issueField($, "incomplete_unclosed_bracket_expression"),
    ),
  );
}

const nonportableRangeClasses = ["character_class", "equivalence_class"];

function rangeOperator($) {
  return alias($._regex_bracket_hyphen, "-");
}

function nonportableRangeRules() {
  const rules = {};
  for (const kind of nonportableRangeClasses) {
    rules[`_${kind}_start_range`] = ($) =>
      seq(issueField($, `${kind}_range_start`), rangeOperator($));
  }
  for (const kind of nonportableRangeClasses) {
    rules[`_${kind}_end_range`] = ($) => issueField($, `${kind}_range_end`);
  }
  return rules;
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

    matching_list: ($) => $.bracket_list,

    nonmatching_list: ($) =>
      seq(alias($._regex_bracket_negation, "^"), bracketListBody($)),

    bracket_list: ($) =>
      seq(
        $.follow_list,
        optional(alias($._regex_bracket_trailing_hyphen, "-")),
      ),

    follow_list: ($) => repeat1($.expression_term),

    expression_term: ($) =>
      choice(
        $.single_expression,
        $.range_expression,
        issueField($, "shared_range_endpoint"),
      ),

    single_expression: ($) =>
      choice($.end_range, $.character_class, $.equivalence_class),

    range_expression: ($) =>
      seq(
        choice(
          $.start_range,
          ...nonportableRangeClasses.map((kind) =>
            alias($[`_${kind}_start_range`], $.start_range),
          ),
        ),
        choice(
          $.end_range,
          ...nonportableRangeClasses.map((kind) =>
            alias($[`_${kind}_end_range`], $.end_range),
          ),
          alias($._regex_bracket_range_end_hyphen, "-"),
        ),
      ),

    ...nonportableRangeRules(),

    start_range: ($) => seq($.end_range, rangeOperator($)),

    end_range: ($) =>
      choice(
        namedExternal($, $._regex_bracket_literal, "collating_element_single"),
        $.collating_symbol,
        issueField($, "invalid_regular_expression_character"),
        issueField($, "invalid_encoding"),
      ),

    collating_symbol: ($) =>
      compoundBracketExpression(
        $,
        $._regex_open_dot,
        ".",
        "element",
        choice(
          namedExternal(
            $,
            $._regex_coll_elem_single,
            "collating_element_single",
          ),
          namedExternal($, $._regex_coll_elem_multi, "collating_element_multi"),
          namedExternal($, $._regex_meta_char, "meta_character"),
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
          namedExternal(
            $,
            $._regex_coll_elem_single,
            "collating_element_single",
          ),
          namedExternal($, $._regex_coll_elem_multi, "collating_element_multi"),
        ),
        $._regex_equal_close,
        "equivalence_class_meta_character",
        "incomplete_equivalence_class_meta_character",
      ),

    character_class: ($) =>
      compoundBracketExpression(
        $,
        $._regex_open_colon,
        ":",
        "name",
        namedExternal($, $._regex_class_name, "class_name"),
        $._regex_colon_close,
        "invalid_character_class_name",
      ),
  };
}

function regularExpressionEscape($) {
  return choice(
    $.quoted_character,
    seq(
      $._escape_prefix,
      choice(
        issueField($, "escaped_invalid_regular_expression_character"),
        issueField($, "invalid_encoding"),
      ),
    ),
    $.escaped_delimiter,
    issueField($, "ordinary_character_escape"),
    issueField($, "incomplete_regular_expression_escape"),
    issueField($, "forbidden_regular_expression_newline"),
  );
}

function oneCharOrCollElem($, ...additional) {
  return choice(
    issueField($, "invalid_regular_expression_character"),
    issueField($, "invalid_encoding"),
    $.ordinary_character,
    regularExpressionEscape($),
    $.sed_newline_escape,
    alias($._regex_period, "."),
    $._bracket_expression,
    issueField($, "special_delimiter_escape"),
    ...additional,
  );
}

function commonRegularExpressionRules() {
  return {
    duplication_count: ($) => $._regex_dup_count,

    ordinary_character: ($) => $._regex_literal,

    quoted_character: ($) => $._regex_quoted_escape,

    escaped_delimiter: ($) => $._regex_escaped_delimiter,

    sed_newline_escape: ($) => $._regex_newline_escape,

    ...bracketRules(),
  };
}

function breDuplicationSymbol($) {
  return choice(alias($._regex_zero_or_more, "*"), $._bre_interval);
}

export function breRules() {
  return {
    ...commonRegularExpressionRules(),
    basic_reg_exp: ($) => $.bre_branch,

    bre_branch: ($) => repeat1($.bre_expression),

    bre_expression: ($) =>
      prec.right(
        choice(
          seq(
            alias($._regex_beginning_anchor, "^"),
            optional($.simple_bre),
            optional(alias($._regex_end_anchor, "$")),
          ),
          seq($.simple_bre, optional(alias($._regex_end_anchor, "$"))),
          alias($._regex_end_anchor, "$"),
        ),
      ),

    simple_bre: ($) =>
      seq(
        choice(
          seq($.nondupl_bre, optional($.bre_dupl_symbol)),
          issueField($, "leading_duplication_symbol"),
        ),
        repeat(issueField($, "adjacent_duplication_symbol")),
      ),

    nondupl_bre: ($) =>
      choice(
        $.one_char_or_coll_elem_bre,
        seq(
          field("opening", alias($._regex_group_open, "\\(")),
          optional(field("expression", $.basic_reg_exp)),
          subexpressionClose($, "\\)"),
        ),
        $.backreference,
        issueField($, "unmatched_subexpression_close"),
        issueField($, "unmatched_interval_close"),
      ),

    backreference: ($) => $._regex_backreference,

    one_char_or_coll_elem_bre: ($) =>
      oneCharOrCollElem(
        $,
        issueField($, "bre_vertical_line_escape"),
        issueField($, "bre_question_mark_escape"),
        issueField($, "bre_plus_escape"),
        issueField($, "bre_subexpression_right_anchor"),
        issueField($, "bre_subexpression_left_anchor"),
      ),

    bre_dupl_symbol: ($) => breDuplicationSymbol($),

    _bre_interval: ($) => intervalExpression($, "\\{", "\\}"),
  };
}

function ereDuplicationSymbol($) {
  return choice(
    alias($._regex_zero_or_more, "*"),
    alias($._regex_one_or_more, "+"),
    alias($._regex_zero_or_one, "?"),
    $._ere_interval,
  );
}

export function ereRules() {
  return {
    ...commonRegularExpressionRules(),
    extended_reg_exp: ($) =>
      choice(
        $.ere_branch,
        seq(
          choice($.ere_branch, $._empty_ere_branch),
          repeat1(
            seq(
              alias($._regex_alternation_operator, "|"),
              choice($.ere_branch, $._empty_ere_branch),
            ),
          ),
        ),
      ),

    _empty_ere_branch: ($) =>
      choice(
        issueField($, "empty_alternative"),
        issueField($, "incomplete_alternative"),
      ),

    ere_branch: ($) => repeat1($.ere_expression),

    ere_expression: ($) =>
      prec.left(
        1,
        seq(
          choice(
            $.one_char_or_coll_elem_ere,
            alias($._regex_beginning_anchor, "^"),
            alias($._regex_end_anchor, "$"),
            seq(
              field("opening", alias($._regex_group_open, "(")),
              optional(field("expression", $.extended_reg_exp)),
              subexpressionClose($, ")"),
            ),
            issueField($, "leading_duplication_symbol"),
          ),
          repeat(
            choice(
              $.ere_dupl_symbol,
              issueField($, "adjacent_duplication_symbol"),
            ),
          ),
        ),
      ),

    one_char_or_coll_elem_ere: ($) => oneCharOrCollElem($),

    ere_dupl_symbol: ($) =>
      seq(
        ereDuplicationSymbol($),
        optional(field("modifier", $.repetition_modifier)),
      ),

    _ere_interval: ($) => intervalExpression($, "{", "}"),

    repetition_modifier: ($) => $._regex_repetition_modifier,
  };
}
