const {
  issueField,
  issueNode,
  issueRuleName,
  namedExternal,
} = require("./dsl");
const regularExpressionRules = require("./regex");

function outcomeRuleName(id) {
  return `_${id}_outcome`;
}

function reasonRuleName(id) {
  return `_${id}_reason`;
}

function defineIssueRules(definitions) {
  const rules = {};

  for (const definition of definitions) {
    const { outcome, reason, rule } = definition;
    const id = definition.id ?? reason;
    rules[reasonRuleName(id)] = rule;
    rules[outcomeRuleName(id)] = ($) => alias($[reasonRuleName(id)], $[reason]);
    rules[issueRuleName(id)] = ($) => alias($[outcomeRuleName(id)], $[outcome]);
  }

  return rules;
}

function missingAtEndOrBoundary($, reason) {
  return choice(
    issueField($, reason),
    issueField($, `nonconforming_${reason}`),
  );
}

function missingCommandSeparator($) {
  return choice(
    issueNode($, "missing_command_separator"),
    issueNode($, "incomplete_missing_command_separator"),
  );
}

function functionVerb($, spelling) {
  return field("verb", alias(spelling, $.function_verb));
}

function leadingEmptyCommands($) {
  return alias($._leading_empty_commands, $.empty_command);
}

function withLeadingEmptyCommands($, commands) {
  return choice(commands, seq(leadingEmptyCommands($), optional(commands)));
}

const delimiterNames = [
  "regex_address_start",
  "escaped_regex_address_start",
  "regex_address_end",
  "substitute_start",
  "substitute_middle",
  "substitute_end",
  "translate_start",
  "translate_middle",
  "translate_end",
];

const missingDelimiterReasons = [
  "incomplete_regular_expression",
  "unterminated_regular_expression",
  "incomplete_replacement",
  "unterminated_replacement",
  "incomplete_translation",
  "unterminated_translation",
  "invalid_delimiter",
  "missing_opening_delimiter",
  "nonconforming_missing_opening_delimiter",
];

const functionDefinitions = [
  { rule: "block_function", spelling: "{", form: "block" },
  {
    rule: "append_function",
    spelling: "a",
    form: "text",
    maxAddresses: 1,
    lineTerminated: true,
  },
  {
    rule: "branch_function",
    spelling: "b",
    form: "optionalLabel",
    lineTerminated: true,
  },
  {
    rule: "change_function",
    spelling: "c",
    form: "text",
    lineTerminated: true,
  },
  { rule: "delete_function", spelling: "d" },
  { rule: "delete_first_line_function", spelling: "D" },
  { rule: "get_function", spelling: "g" },
  { rule: "get_append_function", spelling: "G" },
  { rule: "hold_function", spelling: "h" },
  { rule: "hold_append_function", spelling: "H" },
  {
    rule: "insert_function",
    spelling: "i",
    form: "text",
    maxAddresses: 1,
    lineTerminated: true,
  },
  { rule: "list_function", spelling: "l" },
  { rule: "next_function", spelling: "n" },
  { rule: "next_append_function", spelling: "N" },
  { rule: "print_function", spelling: "p" },
  { rule: "print_first_line_function", spelling: "P" },
  { rule: "quit_function", spelling: "q", maxAddresses: 1 },
  {
    rule: "read_function",
    spelling: "r",
    form: "rfile",
    maxAddresses: 1,
    lineTerminated: true,
  },
  { rule: "substitute_function", spelling: "s", form: "substitute" },
  {
    rule: "test_function",
    spelling: "t",
    form: "optionalLabel",
    lineTerminated: true,
  },
  {
    rule: "write_function",
    spelling: "w",
    form: "wfile",
    lineTerminated: true,
  },
  { rule: "exchange_function", spelling: "x" },
  { rule: "translate_function", spelling: "y", form: "translate" },
  {
    rule: "label_function",
    spelling: ":",
    form: "requiredLabel",
    maxAddresses: 0,
    lineTerminated: true,
  },
  {
    rule: "line_number_function",
    spelling: "=",
    maxAddresses: 1,
  },
  {
    rule: "comment_function",
    spelling: "#",
    form: "comment",
    maxAddresses: 0,
    lineTerminated: true,
  },
];

const nonWriteSubstitutionFlagRules = [
  "occurrence_flag",
  "global_flag",
  "case_insensitive_flag",
  "print_flag",
];

function postWriteSubstitutionFlagChoice($) {
  return choice(
    ...nonWriteSubstitutionFlagRules.map((rule) => $[rule]),
    alias("w", $.substitution_flag),
  );
}

function delimiter($, name) {
  return alias($[`_${name}_delimiter`], $.delimiter);
}

function missingOpeningDelimiter($) {
  return field(
    "opening",
    choice(
      delimiter($, "invalid_delimiter"),
      delimiter($, "missing_opening_delimiter"),
      delimiter($, "nonconforming_missing_opening_delimiter"),
    ),
  );
}

function unterminatedDelimiter($, construct) {
  return choice(
    delimiter($, `incomplete_${construct}`),
    delimiter($, `unterminated_${construct}`),
  );
}

function delimiterRules() {
  const rules = {};
  for (const name of delimiterNames) {
    rules[`_${name}_delimiter`] = ($) =>
      field("token", namedExternal($, $[`_${name}`], "delimiter_token"));
  }
  for (const reason of missingDelimiterReasons) {
    rules[`_${reason}_delimiter`] = ($) => issueField($, reason);
  }
  return rules;
}

function choiceForRules($, names) {
  const rules = names.map((name) => $[name]);
  return rules.length === 1 ? rules[0] : choice(...rules);
}

function commandListRules() {
  return {
    script: ($) => optional(alias($._script_command_list, $.command_list)),

    _script_command_list: ($) =>
      choice($._initial_suppressing_comment_command_list, $._command_list),

    _initial_suppressing_comment_command_list: ($) =>
      seq(
        alias($._initial_suppressing_comment_command, $.editing_command),
        optional(seq($._newline_separator, optional($._command_list))),
      ),

    _initial_suppressing_comment_command: ($) =>
      field(
        "function",
        alias($._initial_suppressing_comment_function, $.function),
      ),

    _initial_suppressing_comment_function: ($) =>
      alias($._initial_suppressing_comment_function_body, $.comment_function),

    _initial_suppressing_comment_function_body: ($) =>
      seq(
        functionVerb($, "#"),
        field("comment", alias($._initial_suppressing_comment, $.comment)),
      ),

    _initial_suppressing_comment: ($) =>
      seq(
        field(
          "suppression",
          namedExternal(
            $,
            $._default_output_suppression,
            "default_output_suppression",
          ),
        ),
        optional(namedExternal($, $._comment_text, "comment_text")),
      ),

    _command_list: ($) =>
      choice($._final_line, seq($._terminated_line, optional($._command_list))),

    _final_line: ($) =>
      choice($._line_content, alias($._blanks, $.empty_command)),

    _terminated_line: ($) =>
      choice(
        seq($._line_content, $._newline_separator),
        alias($._empty_terminated_line, $.empty_command),
      ),

    _empty_terminated_line: ($) =>
      seq(optional($._blanks), $._newline_separator),

    _line_content: ($) => withLeadingEmptyCommands($, $._command_sequence),

    _leading_empty_commands: ($) =>
      seq(optional($._blanks), $._semicolon_separators),

    _command_sequence: ($) =>
      choice(
        seq(
          $._line_terminated_command_item,
          optional($._unmatched_closing_brace_tail),
        ),
        seq(
          $._recovered_line_terminated_command_item,
          optional($._line_content),
        ),
        seq($._chainable_command_item, optional($._command_sequence_tail)),
        seq(
          $._unmatched_closing_brace_item,
          optional($._unmatched_closing_brace_tail_content),
        ),
      ),

    _command_sequence_tail: ($) =>
      choice(
        seq($._semicolon_separators, optional($._command_sequence)),
        $._unmatched_closing_brace_tail,
      ),

    _unmatched_closing_brace_tail: ($) =>
      seq(
        issueNode($, "missing_separator_before_unmatched_brace"),
        $._unmatched_closing_brace_item,
        optional($._unmatched_closing_brace_tail_content),
      ),

    _unmatched_closing_brace_item: ($) =>
      seq(issueNode($, "unmatched_closing_brace"), optional($._blanks)),

    _unmatched_closing_brace_tail_content: ($) =>
      choice(
        $._command_sequence_tail,
        seq(
          issueNode($, "missing_separator_after_unmatched_brace"),
          $._command_sequence,
        ),
      ),

    _chainable_command_item: ($) =>
      choice(
        alias($._chainable_editing_command, $.editing_command),
        alias($._recovered_editing_command, $.editing_command),
      ),

    _line_terminated_command_item: ($) =>
      alias($._line_terminated_editing_command, $.editing_command),

    _recovered_line_terminated_command_item: ($) =>
      alias($._recovered_line_terminated_editing_command, $.editing_command),

    _block_command_sequence: ($) =>
      choice(
        $._line_terminated_command_item,
        seq(
          $._recovered_line_terminated_command_item,
          optional($._block_line_content),
        ),
        seq(
          $._chainable_command_item,
          optional($._block_command_sequence_tail),
        ),
      ),

    _block_command_sequence_tail: ($) =>
      seq($._semicolon_separators, optional($._block_command_sequence)),

    _block_line_content: ($) =>
      withLeadingEmptyCommands($, $._block_command_sequence),

    _block_line_content_before_close: ($) =>
      withLeadingEmptyCommands($, $._block_command_sequence_before_close),

    _block_command_sequence_before_close: ($) =>
      choice(
        seq(
          $._chainable_command_item,
          $._semicolon_separators,
          optional($._block_command_sequence_before_close),
        ),
        seq(
          $._recovered_line_terminated_command_item,
          optional($._block_line_content_before_close),
        ),
      ),

    _block_command_list: ($) =>
      choice(
        $._block_line_content_before_close,
        seq($._terminated_block_line, optional($._block_command_list)),
      ),

    _block_commands: ($) =>
      choice($._block_command_list, $._block_command_list_missing_separator),

    _block_command_list_missing_separator: ($) =>
      choice(
        missingCommandSeparator($),
        seq(
          optional(leadingEmptyCommands($)),
          $._block_command_sequence,
          missingCommandSeparator($),
        ),
        seq($._terminated_block_line, $._block_command_list_missing_separator),
      ),

    _terminated_block_line: ($) =>
      choice(
        seq($._block_line_content, $._newline_separator),
        alias($._empty_terminated_line, $.empty_command),
      ),

    _newline_separator: ($) => alias("\n", $.command_separator),

    _semicolon_separators: ($) => prec.right(repeat1($._semicolon_separator)),

    _semicolon_separator: ($) =>
      prec.right(seq(alias(";", $.command_separator), optional($._blanks))),

    _blanks: () => token(/[[:blank:]]+/),
  };
}

function addressRules(mode) {
  const expression = mode === "bre" ? "basic_reg_exp" : "extended_reg_exp";

  function addressChoice($) {
    return choice(
      $.line_number_address,
      $.last_line_address,
      $.context_address,
    );
  }

  function contextAddress($, opening) {
    return seq(
      field("opening", opening),
      optional(field("expression", $[expression])),
      field(
        "closing",
        choice(
          delimiter($, "regex_address_end"),
          unterminatedDelimiter($, "regular_expression"),
        ),
      ),
    );
  }

  function commaSeparator($) {
    return field(
      "separator",
      alias($._comma_address_separator, $.address_separator),
    );
  }

  return {
    address_clause: ($) =>
      choice(
        $._single_address_clause,
        $._double_address_clause,
        $._max2_excess_address_clause,
      ),

    _single_address_clause: ($) => field("first", $.address),

    _double_address_clause: ($) =>
      choice(
        seq(
          field("first", $.address),
          field("separator", alias($._address_separator, $.address_separator)),
          field("second", $.address),
        ),
        seq(
          issueField($, "omitted_first_address"),
          commaSeparator($),
          field("second", $.address),
        ),
        seq(
          field("first", $.address),
          commaSeparator($),
          $._omitted_second_address_issue,
        ),
        seq(
          issueField($, "omitted_first_address"),
          commaSeparator($),
          $._omitted_second_address_issue,
        ),
      ),

    _omitted_second_address_issue: ($) =>
      choice(
        issueField($, "omitted_address"),
        issueField($, "incomplete_omitted_address"),
      ),

    _max2_excess_address_clause: ($) =>
      prec.dynamic(
        1,
        choice(
          seq($._double_address_clause, $._max2_excess_address_tail),
          seq($._max2_excess_address_clause, $._max2_excess_address_tail),
        ),
      ),

    _max1_address_clause: ($) =>
      choice($._single_address_clause, $._max1_excess_address_clause),

    _max1_excess_address_clause: ($) =>
      prec.dynamic(
        1,
        choice(
          seq(field("first", $.address), $._max1_excess_address_tail),
          seq(
            issueField($, "omitted_first_address_unit1"),
            $._max1_excess_address_tail,
          ),
          seq($._max1_excess_address_clause, $._max1_excess_address_tail),
        ),
      ),

    _max0_address_clause: ($) =>
      prec.dynamic(
        1,
        choice(
          issueField($, "excess_address"),
          seq(
            issueField($, "omitted_first_address_unit0"),
            $._max0_excess_address_tail,
          ),
          seq($._max0_address_clause, $._max0_excess_address_tail),
        ),
      ),

    _max0_excess_address_tail: ($) => issueField($, "excess_address_unit0"),

    _max1_excess_address_tail: ($) => issueField($, "excess_address_unit1"),

    _max2_excess_address_tail: ($) => issueField($, "excess_address_unit2"),

    _address_separator: ($) =>
      choice(
        $._comma_address_separator,
        prec(
          -1,
          seq(issueField($, "missing_address_separator"), optional($._blanks)),
        ),
      ),

    _comma_address_separator: ($) =>
      seq(
        optional(issueField($, "blanks_around_address_separator")),
        $._address_separator_token,
        optional(issueField($, "blanks_around_address_separator")),
      ),

    _address_separator_token: ($) =>
      field("token", alias(",", $.address_separator_token)),

    address: addressChoice,

    // Keep maximum-specific GLR paths distinct until the function verb.
    _max0_address: addressChoice,

    _max1_address: addressChoice,

    _max2_address: addressChoice,

    line_number_address: () => /[[:digit:]]+/,

    last_line_address: () => "$",

    context_address: ($) =>
      choice(
        contextAddress($, delimiter($, "regex_address_start")),
        seq(
          field("escape", alias("\\", $.address_escape)),
          choice(
            contextAddress($, delimiter($, "escaped_regex_address_start")),
            missingOpeningDelimiter($),
          ),
        ),
      ),
  };
}

function operandRules(mode) {
  const expression = mode === "bre" ? "basic_reg_exp" : "extended_reg_exp";

  function substitutionFlagChoice($) {
    const rules = nonWriteSubstitutionFlagRules.map((rule) => $[rule]);
    rules.push(issueField($, "invalid_substitution_flag"));
    return choice(...rules);
  }

  return {
    _substitute_function_without_write: ($) =>
      choice(
        seq(
          $._complete_substitute_function,
          optional(
            field(
              "flags",
              alias($._substitution_flags_without_write, $.substitution_flags),
            ),
          ),
        ),
        $._incomplete_substitute_function,
      ),

    _substitute_function_with_write: ($) =>
      seq(
        $._complete_substitute_function,
        field(
          "flags",
          alias($._substitution_flags_with_write, $.substitution_flags),
        ),
      ),

    _complete_substitute_function: ($) =>
      seq(
        functionVerb($, "s"),
        field("opening", delimiter($, "substitute_start")),
        optional(field("expression", $[expression])),
        field("middle", delimiter($, "substitute_middle")),
        optional(field("replacement", $.replacement)),
        field("closing", delimiter($, "substitute_end")),
      ),

    _incomplete_substitute_function: ($) =>
      seq(
        functionVerb($, "s"),
        choice(
          missingOpeningDelimiter($),
          seq(
            field("opening", delimiter($, "substitute_start")),
            optional(field("expression", $[expression])),
            choice(
              seq(
                field("middle", delimiter($, "substitute_middle")),
                optional(field("replacement", $.replacement)),
                field("closing", unterminatedDelimiter($, "replacement")),
              ),
              field("middle", unterminatedDelimiter($, "regular_expression")),
            ),
          ),
        ),
      ),

    replacement: ($) =>
      repeat1(
        choice(
          $.replacement_literal,
          $.matched_text_reference,
          $.replacement_backreference,
          $.replacement_escaped_delimiter,
          $.ambiguous_replacement_delimiter_escape,
          $.replacement_escape,
          $.escaped_newline,
          issueField($, "unspecified_replacement_escape"),
          issueField($, "incomplete_replacement_escape"),
        ),
      ),

    replacement_literal: ($) =>
      namedExternal($, $._replacement_literal, "replacement_literal_token"),

    matched_text_reference: ($) =>
      namedExternal(
        $,
        $._replacement_match_reference,
        "matched_text_reference_token",
      ),

    replacement_backreference: ($) =>
      namedExternal(
        $,
        $._replacement_backreference,
        "replacement_backreference_token",
      ),

    replacement_escaped_delimiter: ($) =>
      field(
        "token",
        namedExternal(
          $,
          $._replacement_escaped_delimiter,
          "escaped_delimiter_token",
        ),
      ),

    ambiguous_replacement_delimiter_escape: ($) =>
      issueField($, "replacement_ampersand_delimiter_escape"),

    replacement_escape: ($) =>
      namedExternal(
        $,
        $._replacement_escape_sequence,
        "replacement_escape_token",
      ),

    escaped_newline: ($) =>
      namedExternal($, $._replacement_escaped_newline, "escaped_newline_token"),

    _substitution_flags_without_write: ($) =>
      choice(
        substitutionFlagChoice($),
        prec.left(
          seq($._substitution_flags_without_write, substitutionFlagChoice($)),
        ),
      ),

    _substitution_flags_with_write: ($) =>
      seq(optional($._substitution_flags_without_write), $.write_flag),

    occurrence_flag: () => /[[:digit:]]+/,

    global_flag: () => "g",

    case_insensitive_flag: () => "i",

    print_flag: () => "p",

    write_flag: ($) =>
      seq(
        field("verb", alias("w", $.substitution_flag)),
        choice(
          seq(
            $._flag_after_write_marker,
            issueField($, "flag_after_write_flag"),
            repeat(postWriteSubstitutionFlagChoice($)),
            $._blanks,
            choice(
              field("wfile", alias($._substitution_wfile, $.wfile)),
              missingAtEndOrBoundary($, "missing_wfile"),
            ),
          ),
          seq($._blanks, field("wfile", alias($._substitution_wfile, $.wfile))),
          seq($._blanks, missingAtEndOrBoundary($, "missing_wfile")),
          seq(
            issueField($, "omitted_file_separator"),
            field("wfile", alias($._substitution_wfile, $.wfile)),
          ),
          missingAtEndOrBoundary($, "missing_wfile"),
        ),
      ),

    translate_function: ($) =>
      seq(
        functionVerb($, "y"),
        choice(
          seq(
            field("opening", delimiter($, "translate_start")),
            optional(field("string1", $.translation_string)),
            choice(
              seq(
                field("middle", delimiter($, "translate_middle")),
                optional(field("string2", $.translation_string)),
                field(
                  "closing",
                  choice(
                    delimiter($, "translate_end"),
                    unterminatedDelimiter($, "translation"),
                  ),
                ),
              ),
              field("middle", unterminatedDelimiter($, "translation")),
            ),
          ),
          missingOpeningDelimiter($),
        ),
      ),

    translation_string: ($) =>
      repeat1(
        choice(
          $.translation_literal,
          $.translation_escape,
          $.translation_escaped_delimiter,
          issueField($, "undefined_translation_escape"),
          issueField($, "incomplete_translation_escape"),
        ),
      ),

    translation_literal: ($) =>
      namedExternal($, $._translate_literal, "translation_literal_token"),

    translation_escape: ($) =>
      namedExternal($, $._translate_escape, "translation_escape_token"),

    translation_escaped_delimiter: ($) =>
      namedExternal(
        $,
        $._translate_escaped_delimiter,
        "escaped_delimiter_token",
      ),
  };
}

function functionRules() {
  const noArgumentDefinitions = functionDefinitions.filter(
    ({ form }) => form === undefined,
  );

  const rules = {
    text: ($) =>
      seq(
        repeat1(
          choice(
            $.text_literal,
            $.text_backslash_escape,
            $.text_escaped_newline,
            issueField($, "unspecified_text_escape"),
          ),
        ),
        optional(issueField($, "missing_text")),
        $._text_end,
      ),

    _text_end: ($) => choice($._text_line_end, $._text_eof),

    text_literal: ($) =>
      namedExternal($, $._text_literal, "text_literal_token"),

    text_backslash_escape: ($) =>
      namedExternal($, $._text_backslash_escape, "text_backslash_escape_token"),

    text_escaped_newline: ($) =>
      namedExternal($, $._text_escaped_newline, "text_escaped_newline_token"),

    text_introducer: ($) =>
      namedExternal($, $._text_command_start, "text_introducer_token"),

    rfile: ($) => namedExternal($, $._file_argument, "rfile_token"),

    wfile: ($) => namedExternal($, $._file_argument, "wfile_token"),

    _substitution_wfile: ($) =>
      namedExternal($, $._substitution_wfile_argument, "wfile_token"),

    label: ($) => namedExternal($, $._line_word, "label_token"),

    comment: ($) => namedExternal($, $._comment_text, "comment_text"),

    closing_brace: ($) =>
      choice(
        namedExternal($, $._right_brace, "closing_brace_token"),
        issueField($, "missing_closing_brace"),
      ),
  };

  function fileForm(form) {
    const missingFileReason = `missing_${form}`;
    return ($) => [
      choice(
        seq($._blanks, field(form, $[form])),
        seq($._blanks, missingAtEndOrBoundary($, missingFileReason)),
        seq(issueField($, "omitted_file_separator"), field(form, $[form])),
        missingAtEndOrBoundary($, missingFileReason),
      ),
    ];
  }

  const formArguments = {
    block: ($) => [
      field("commands", alias($._block_commands, $.command_list)),
      field("closing", $.closing_brace),
      optional($._blanks),
    ],
    text: ($) => [
      choice(
        seq(
          field("introducer", $.text_introducer),
          choice(
            field("text", $.text),
            seq(optional(issueField($, "missing_text")), $._text_end),
          ),
        ),
        missingAtEndOrBoundary($, "missing_text_introducer"),
      ),
    ],
    optionalLabel: ($) => [
      optional(
        prec.right(
          seq(
            field("separator", alias(" ", $.argument_separator)),
            optional(field("label", $.label)),
          ),
        ),
      ),
    ],
    requiredLabel: ($) => [
      choice(
        field("label", $.label),
        missingAtEndOrBoundary($, "missing_label"),
      ),
    ],
    rfile: fileForm("rfile"),
    wfile: fileForm("wfile"),
    comment: ($) => [optional(field("comment", $.comment))],
  };

  for (const { rule, spelling } of noArgumentDefinitions) {
    rules[rule] = ($) => functionVerb($, spelling);
  }

  for (const { form, rule, spelling } of functionDefinitions) {
    const argumentParts = formArguments[form];
    if (argumentParts === undefined) {
      continue;
    }
    rules[rule] = ($) => seq(functionVerb($, spelling), ...argumentParts($));
  }

  return rules;
}

function editingCommandRules() {
  const regularDefinitions = functionDefinitions.filter(
    ({ form }) => form !== "substitute",
  );
  const chainable = regularDefinitions.filter(
    ({ lineTerminated }) => !lineTerminated,
  );
  const lineTerminated = regularDefinitions.filter(
    ({ lineTerminated: isLineTerminated }) => isLineTerminated,
  );

  function functionsByMaximum(definitions, maximum) {
    return definitions
      .filter(({ maxAddresses = 2 }) => maxAddresses === maximum)
      .map(({ rule }) => rule);
  }

  function wrapperName(kind, maximum) {
    return `_${kind}_${maximum}_address_function`;
  }

  function functionWrapper($, name) {
    return alias($[name], $.function);
  }

  function addressClauseForMaximum($, maximum) {
    if (maximum === 0) {
      return alias($._max0_address_clause, $.address_clause);
    }
    if (maximum === 1) {
      return alias($._max1_address_clause, $.address_clause);
    }
    return $.address_clause;
  }

  function addressedCommand($, addresses, selectedFunction) {
    return seq(
      optional($._blanks),
      optional(seq(field("addresses", addresses), optional($._blanks))),
      optional(field("negation", $.negation)),
      field("function", selectedFunction),
    );
  }

  function addressedFunction($, functionRule) {
    return addressedCommand(
      $,
      $.address_clause,
      alias(functionRule, $.function),
    );
  }

  function addressedForms($, definitions, kind) {
    const forms = [];
    for (const maximum of [0, 1, 2]) {
      const names = functionsByMaximum(definitions, maximum);
      if (names.length === 0) {
        continue;
      }
      forms.push(
        addressedCommand(
          $,
          addressClauseForMaximum($, maximum),
          functionWrapper($, wrapperName(kind, maximum)),
        ),
      );
    }

    return choice(...forms);
  }

  const rules = {
    _chainable_editing_command: ($) =>
      seq(
        choice(
          addressedForms($, chainable, "chainable"),
          addressedFunction($, $._chainable_substitute_function),
        ),
        optional(issueField($, "unexpected_command_text")),
      ),

    _line_terminated_editing_command: ($) =>
      seq(
        choice(
          $._line_terminated_regular_editing_command_body,
          $._line_terminated_substitute_editing_command_body,
        ),
        optional(issueField($, "unexpected_command_text")),
      ),

    _recovered_line_terminated_editing_command: ($) =>
      choice(
        prec.right(
          seq(
            $._line_terminated_regular_editing_command_body,
            optional(issueField($, "unexpected_command_text")),
            issueField($, "forbidden_command_separator"),
            optional($._blanks),
          ),
        ),
        prec.right(
          seq(
            $._line_terminated_substitute_editing_command_body,
            optional(issueField($, "unexpected_command_text")),
            issueField($, "command_after_write_flag"),
            optional($._blanks),
          ),
        ),
      ),

    _line_terminated_regular_editing_command_body: ($) =>
      addressedForms($, lineTerminated, "line_terminated"),

    _line_terminated_substitute_editing_command_body: ($) =>
      addressedFunction($, $._line_terminated_substitute_function),

    _recovered_editing_command: ($) =>
      choice(
        addressedFunction($, $._unknown_function),
        seq(
          optional($._blanks),
          optional(
            seq(field("addresses", $.address_clause), optional($._blanks)),
          ),
          field("negation", $.negation),
          field("function", alias($._reserved_unknown_function, $.function)),
        ),
        seq(
          optional($._blanks),
          field("addresses", alias($._double_address_clause, $.address_clause)),
          optional($._blanks),
          field("function", alias($._reserved_unknown_function, $.function)),
        ),
        seq(
          optional($._blanks),
          choice(
            seq(
              field("addresses", $.address_clause),
              optional($._blanks),
              optional(field("negation", $.negation)),
            ),
            field("negation", $.negation),
          ),
          field("function", alias($._missing_function, $.function)),
        ),
      ),

    _unknown_function: ($) =>
      seq(
        issueField($, "unknown_function"),
        optional(issueField($, "unexpected_command_text")),
      ),

    _reserved_unknown_function: ($) =>
      seq(
        issueField($, "reserved_unknown_function"),
        optional(issueField($, "unexpected_command_text")),
      ),

    _missing_function: ($) => missingAtEndOrBoundary($, "missing_function"),

    _chainable_substitute_function: ($) =>
      alias($._substitute_function_without_write, $.substitute_function),

    _line_terminated_substitute_function: ($) =>
      alias($._substitute_function_with_write, $.substitute_function),

    negation: ($) =>
      seq(
        field("operator", alias("!", $.negation_operator)),
        repeat(
          seq(
            optional(issueField($, "blanks_after_negation")),
            issueField($, "duplicate_negation"),
          ),
        ),
        optional(issueField($, "blanks_after_negation")),
      ),
  };

  for (const [kind, definitions] of [
    ["chainable", chainable],
    ["line_terminated", lineTerminated],
  ]) {
    for (const maximum of [0, 1, 2]) {
      const names = functionsByMaximum(definitions, maximum);
      if (names.length > 0) {
        rules[wrapperName(kind, maximum)] = ($) => choiceForRules($, names);
      }
    }
  }

  return rules;
}

function sedRules(mode) {
  return {
    ...commandListRules(),
    ...delimiterRules(),
    ...addressRules(mode),
    ...operandRules(mode),
    ...functionRules(),
    ...editingCommandRules(),
  };
}

function missingMarkerNames(mode) {
  return [
    "omitted_address",
    "incomplete_omitted_address",
    "omitted_first_address",
    "empty_subexpression",
    "missing_subexpression",
    ...(mode === "ere" ? ["empty_alternative"] : []),
    "missing_function",
    "missing_label",
    "missing_rfile",
    "missing_wfile",
    "omitted_file_separator",
    "missing_text_introducer",
    "missing_text",
    "missing_command_separator",
    "missing_address_separator",
    "missing_closing_brace",
    "missing_opening_delimiter",
    "missing_separator_before_unmatched_brace",
    "missing_separator_after_unmatched_brace",
    "nonconforming_missing_function",
    "nonconforming_missing_label",
    "nonconforming_missing_rfile",
    "nonconforming_missing_wfile",
    "nonconforming_missing_text_introducer",
    "nonconforming_missing_opening_delimiter",
    "missing_subexpression_placeholder",
    "incomplete_bracket_list",
    "incomplete_bracket_expression",
    ...(mode === "ere" ? ["incomplete_alternative"] : []),
    "incomplete_command_separator",
  ];
}

function issueDefinitions(mode) {
  function missing(reason) {
    return ($) => $[`_${reason}_marker`];
  }

  const boundaryMissingReasons = [
    "missing_function",
    "missing_label",
    "missing_rfile",
    "missing_wfile",
    "missing_text_introducer",
    "missing_opening_delimiter",
  ];

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
      id: "incomplete_omitted_address",
      reason: "omitted_address",
      outcome: "incomplete_syntax",
      rule: missing("incomplete_omitted_address"),
    },
    {
      id: "omitted_first_address",
      reason: "omitted_address",
      outcome: "undefined_syntax",
      rule: missing("omitted_first_address"),
    },
    // The marker is shared, but maximum-specific reductions must not merge.
    ...[0, 1].map((maximum) => ({
      id: `omitted_first_address_unit${maximum}`,
      reason: "omitted_address",
      outcome: "undefined_syntax",
      rule: missing("omitted_first_address"),
    })),
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
            rule: ($) =>
              namedExternal(
                $,
                $._regex_unmatched_group_close,
                "back_close_parenthesis_token",
              ),
          },
          {
            reason: "unmatched_interval_close",
            outcome: "undefined_syntax",
            rule: ($) =>
              namedExternal(
                $,
                $._regex_unmatched_interval_close,
                "back_close_brace",
              ),
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
    ...(mode === "ere"
      ? [
          {
            reason: "empty_alternative",
            outcome: "undefined_syntax",
            rule: missing("empty_alternative"),
          },
        ]
      : []),
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
      reason: "command_after_write_flag",
      outcome: "undefined_syntax",
      rule: () => token.immediate(";"),
    },
    {
      reason: "flag_after_write_flag",
      outcome: "undefined_syntax",
      rule: ($) => postWriteSubstitutionFlagChoice($),
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
      rule: ($) => alias(token.immediate(/[[:blank:]]+/), $.blank),
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
            rule: ($) => $._regex_bre_subexpression_caret,
          },
          {
            reason: "bre_subexpression_right_anchor",
            outcome: "implementation_option_syntax",
            rule: ($) => $._regex_bre_subexpression_dollar,
          },
        ]
      : []),
    {
      reason: "omitted_file_separator",
      outcome: "implementation_option_syntax",
      rule: missing("omitted_file_separator"),
    },
    {
      reason: "excess_address",
      outcome: "nonconforming_syntax",
      rule: ($) => field("address", alias($._max0_address, $.address)),
    },
    ...[0, 1, 2].map((maximum) => ({
      id: `excess_address_unit${maximum}`,
      reason: "excess_address",
      outcome: "nonconforming_syntax",
      rule: ($) =>
        choice(
          seq(
            field(
              "separator",
              alias($._address_separator, $.address_separator),
            ),
            field("address", alias($[`_max${maximum}_address`], $.address)),
          ),
          seq(
            field(
              "separator",
              alias($._comma_address_separator, $.address_separator),
            ),
            $._omitted_second_address_issue,
          ),
        ),
    })),
    {
      reason: "unknown_function",
      outcome: "nonconforming_syntax",
      rule: () => token(prec(-2, /[^[:blank:][:digit:]$\/\\!;{}#\n]/)),
    },
    {
      id: "reserved_unknown_function",
      reason: "unknown_function",
      outcome: "nonconforming_syntax",
      rule: ($) => $._reserved_unknown_function_token,
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
      rule: ($) => alias($._blanks_around_address_separator, $.blank),
    },
    {
      reason: "missing_address_separator",
      outcome: "nonconforming_syntax",
      rule: missing("missing_address_separator"),
    },
    {
      reason: "duplicate_negation",
      outcome: "nonconforming_syntax",
      rule: ($) => field("operator", alias("!", $.negation_operator)),
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
      id: "missing_separator_before_unmatched_brace",
      reason: "missing_command_separator",
      outcome: "nonconforming_syntax",
      rule: missing("missing_separator_before_unmatched_brace"),
    },
    {
      id: "missing_separator_after_unmatched_brace",
      reason: "missing_command_separator",
      outcome: "nonconforming_syntax",
      rule: missing("missing_separator_after_unmatched_brace"),
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
      reason: "unterminated_regular_expression",
      outcome: "nonconforming_syntax",
      rule: ($) =>
        choice(
          $._regex_line_unterminated_address,
          $._regex_line_unterminated_substitute,
        ),
    },
    {
      reason: "forbidden_regular_expression_newline",
      outcome: "nonconforming_syntax",
      rule: ($) => $._regex_forbidden_newline_escape,
    },
    {
      reason: "unterminated_replacement",
      outcome: "nonconforming_syntax",
      rule: ($) => $._replacement_line_unterminated,
    },
    {
      reason: "unterminated_translation",
      outcome: "nonconforming_syntax",
      rule: ($) =>
        choice(
          $._translate_line_unterminated_source,
          $._translate_line_unterminated_destination,
        ),
    },
    ...boundaryMissingReasons.map((reason) => ({
      id: `nonconforming_${reason}`,
      reason,
      outcome: "nonconforming_syntax",
      rule: missing(`nonconforming_${reason}`),
    })),
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
      id: "incomplete_unclosed_subexpression",
      reason: "unclosed_subexpression",
      outcome: "incomplete_syntax",
      rule: ($) => $._regex_incomplete_group,
    },
    {
      reason: "incomplete_bracket_term",
      outcome: "incomplete_syntax",
      rule: ($) => $._regex_incomplete_bracket_term,
    },
    {
      id: "incomplete_missing_bracket_list",
      reason: "missing_bracket_list",
      outcome: "incomplete_syntax",
      rule: ($) => $._incomplete_bracket_list_marker,
    },
    {
      id: "incomplete_unclosed_bracket_expression",
      reason: "unclosed_bracket_expression",
      outcome: "incomplete_syntax",
      rule: ($) => $._incomplete_bracket_expression_marker,
    },
    ...(mode === "ere"
      ? [
          {
            reason: "incomplete_alternative",
            outcome: "incomplete_syntax",
            rule: ($) => $._incomplete_alternative_marker,
          },
        ]
      : []),
    {
      reason: "incomplete_interval",
      outcome: "incomplete_syntax",
      rule: ($) => $._regex_incomplete_interval,
    },
    {
      id: "incomplete_missing_command_separator",
      reason: "missing_command_separator",
      outcome: "incomplete_syntax",
      rule: ($) => $._incomplete_command_separator_marker,
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
    $._regex_period,
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
          $._regex_bre_vertical_line_escape,
          $._regex_bre_question_mark_escape,
          $._regex_bre_plus_escape,
          $._regex_bre_subexpression_caret,
          $._regex_bre_subexpression_dollar,
          $._bre_vertical_line_escape_marker,
          $._bre_question_mark_escape_marker,
          $._bre_plus_escape_marker,
          $._regex_unmatched_interval_close,
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
    $._flag_after_write_marker,
    $._text_command_start,
    $._text_literal,
    $._text_backslash_escape,
    $._text_escaped_newline,
    $._text_unspecified_escape,
    $._text_line_end,
    $._text_eof,
    $._default_output_suppression,
    $._comment_text,
    $._file_argument,
    $._substitution_wfile_argument,
    $._line_word,
    $._right_brace,
    $._reserved_unknown_function_token,
    $._regex_incomplete_group,
    $._regex_incomplete_bracket_term,
    $._regex_incomplete_interval,
    $._regex_forbidden_newline_escape,
    $._regex_line_unterminated_address,
    $._regex_line_unterminated_substitute,
    $._replacement_line_unterminated,
    $._translate_line_unterminated_source,
    $._translate_line_unterminated_destination,
    $._blanks_around_address_separator,
    ...missingMarkerNames(mode).map((name) => $[`_${name}_marker`]),
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
      [$.address_clause, $._recovered_editing_command],
      [$.address_clause, $._max1_address_clause],
      [$._double_address_clause, $._excess_address_unit1_reason],
      [$.address, $._max0_address],
      [$.address, $._max1_address],
      [
        $._omitted_first_address_reason,
        $._omitted_first_address_unit0_reason,
        $._omitted_first_address_unit1_reason,
      ],
      [
        $._omitted_first_address_unit0_reason,
        $._omitted_first_address_unit1_reason,
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
