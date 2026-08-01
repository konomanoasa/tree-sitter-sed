function namedExternal($, external, name) {
  return alias(external, $[name]);
}

function issueField($, reason) {
  return field("issue", alias($[`_${reason}_issue`], $.syntax_issue));
}

function issueNode($, reason) {
  return alias($[`_${reason}_issue`], $.syntax_issue);
}

function functionVerb($, spelling) {
  return field("verb", alias(spelling, $.function_verb));
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
  "incomplete_replacement",
  "incomplete_translation",
  "invalid_delimiter",
  "missing_opening_delimiter",
];

/** POSIX.1-2024 sed editing-command synopses. */
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
const occurrenceFlagPattern = "0*[1-9][[:digit:]]*";

function delimiter($, name) {
  return alias($[`_${name}_delimiter`], $.delimiter);
}

function missingDelimiter($, reason) {
  return alias($[`_${reason}_delimiter`], $.delimiter);
}

function delimiterRules() {
  const rules = {};
  for (const name of delimiterNames) {
    rules[`_${name}_delimiter`] = ($) =>
      seq(field("token", namedExternal($, $[`_${name}`], "delimiter_token")));
  }
  for (const reason of missingDelimiterReasons) {
    rules[`_${reason}_delimiter`] = ($) => seq(issueField($, reason));
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

    command_list: ($) => $._command_list,

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

    _line_content: ($) =>
      choice(
        $._command_sequence,
        seq(
          alias($._leading_empty_commands, $.empty_command),
          optional($._command_sequence),
        ),
      ),

    _leading_empty_commands: ($) =>
      seq(optional($._blanks), $._semicolon_separators),

    _command_sequence: ($) =>
      choice(
        $._line_terminated_command_item,
        seq(
          $._recovered_line_terminated_command_item,
          optional($._line_content),
        ),
        seq(
          $._top_level_chainable_item,
          optional(
            choice(
              $._command_sequence_tail,
              $._unmatched_closing_brace_without_separator,
            ),
          ),
        ),
      ),

    _command_sequence_tail: ($) =>
      seq($._semicolon_separators, optional($._command_sequence)),

    _unmatched_closing_brace_without_separator: ($) =>
      seq(
        alias(
          $._missing_separator_before_unmatched_brace_issue,
          $.syntax_issue,
        ),
        issueNode($, "unmatched_closing_brace"),
        optional($._blanks),
      ),

    _missing_separator_before_unmatched_brace_issue: ($) =>
      seq(
        alias(
          $._missing_separator_before_unmatched_brace_outcome,
          $.nonconforming_syntax,
        ),
      ),

    _missing_separator_before_unmatched_brace_outcome: ($) =>
      seq(
        alias(
          $._missing_separator_before_unmatched_brace_marker,
          $.missing_command_separator,
        ),
      ),

    _top_level_chainable_item: ($) =>
      choice(
        $._chainable_command_item,
        seq(issueNode($, "unmatched_closing_brace"), optional($._blanks)),
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
      choice(
        $._block_command_sequence,
        seq(
          alias($._leading_empty_commands, $.empty_command),
          optional($._block_command_sequence),
        ),
      ),

    _block_line_content_before_close: ($) =>
      choice(
        $._block_command_sequence_before_close,
        seq(
          alias($._leading_empty_commands, $.empty_command),
          optional($._block_command_sequence_before_close),
        ),
      ),

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
        seq(issueNode($, "missing_command_separator")),
        seq(
          $._block_command_sequence,
          issueNode($, "missing_command_separator"),
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

  function contextAddress($, opening) {
    return seq(
      field("opening", opening),
      optional(field("expression", $[expression])),
      field(
        "closing",
        choice(
          delimiter($, "regex_address_end"),
          missingDelimiter($, "incomplete_regular_expression"),
        ),
      ),
    );
  }

  return {
    address_clause: ($) =>
      choice(
        $._single_address_clause,
        $._double_address_clause,
        $._address_clause_with_excess,
      ),

    _single_address_clause: ($) => field("first", $.address),

    _double_address_clause: ($) =>
      choice(
        prec(
          1,
          seq(
            field("first", $.address),
            field(
              "separator",
              alias($._address_separator, $.address_separator),
            ),
            field("second", $.address),
          ),
        ),
        prec(
          -1,
          choice(
            seq(
              field("separator", alias(",", $.address_separator)),
              field("second", $.address),
              issueField($, "omitted_address"),
            ),
            seq(
              field("first", $.address),
              field(
                "separator",
                alias($._comma_address_separator, $.address_separator),
              ),
              issueField($, "omitted_address"),
            ),
            seq(
              field("separator", alias(",", $.address_separator)),
              issueField($, "omitted_address"),
            ),
          ),
        ),
      ),

    _address_clause_with_excess: ($) =>
      prec(
        2,
        seq(
          $._double_address_clause,
          issueField($, "additional_address"),
          repeat1(field("excess", $.excess_address)),
        ),
      ),

    excess_address: ($) =>
      choice(
        seq(
          field("separator", alias($._address_separator, $.address_separator)),
          field("address", $.address),
        ),
        seq(
          field(
            "separator",
            alias($._comma_address_separator, $.address_separator),
          ),
          issueField($, "omitted_address"),
        ),
      ),

    _address_separator: ($) =>
      choice(
        $._comma_address_separator,
        prec(-1, seq(issueField($, "missing_address_separator"), $._blanks)),
      ),

    _comma_address_separator: ($) =>
      choice(
        prec(
          1,
          seq(
            issueField($, "blanks_around_address_separator"),
            choice(
              seq($._blanks, ",", optional($._blanks)),
              seq(",", $._blanks),
            ),
          ),
        ),
        ",",
      ),

    address: ($) =>
      choice(
        $.line_number_address,
        $.last_line_address,
        $.context_address,
        seq(issueField($, "invalid_address")),
      ),

    line_number_address: () => /0*[1-9][[:digit:]]*/,

    last_line_address: () => "$",

    context_address: ($) =>
      choice(
        contextAddress($, delimiter($, "regex_address_start")),
        seq(
          field("escape", alias("\\", $.address_escape)),
          choice(
            contextAddress($, delimiter($, "escaped_regex_address_start")),
            field(
              "opening",
              choice(
                missingDelimiter($, "invalid_delimiter"),
                missingDelimiter($, "missing_opening_delimiter"),
              ),
            ),
          ),
        ),
      ),
  };
}

function operandRules(mode) {
  const expression = mode === "bre" ? "basic_reg_exp" : "extended_reg_exp";

  function substitutionFlagChoice($) {
    const rules = nonWriteSubstitutionFlagRules.map((rule) => $[rule]);
    rules.push(
      seq(issueField($, "zero_substitution_occurrence")),
      seq(issueField($, "invalid_substitution_flag")),
    );
    return choice(...rules);
  }

  return {
    substitute_function: ($) =>
      choice(
        $._substitute_function_without_write,
        $._substitute_function_with_write,
      ),

    // A terminal write flag consumes the rest of the physical line as a file
    // operand, so editingCommandRules routes these two forms separately.
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
          field(
            "opening",
            choice(
              missingDelimiter($, "invalid_delimiter"),
              missingDelimiter($, "missing_opening_delimiter"),
            ),
          ),
          seq(
            field("opening", delimiter($, "substitute_start")),
            optional(field("expression", $[expression])),
            choice(
              seq(
                field("middle", delimiter($, "substitute_middle")),
                optional(field("replacement", $.replacement)),
                field("closing", missingDelimiter($, "incomplete_replacement")),
              ),
              field(
                "middle",
                missingDelimiter($, "incomplete_regular_expression"),
              ),
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
          $.replacement_escape,
          $.escaped_newline,
          seq(issueField($, "unspecified_replacement_escape")),
          seq(issueField($, "incomplete_replacement_escape")),
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
      choice(
        field(
          "token",
          namedExternal(
            $,
            $._replacement_escaped_delimiter,
            "escaped_delimiter_token",
          ),
        ),
        seq(issueField($, "replacement_ampersand_delimiter_escape")),
      ),

    replacement_escape: ($) =>
      namedExternal(
        $,
        $._replacement_escape_sequence,
        "replacement_escape_token",
      ),

    escaped_newline: ($) =>
      namedExternal($, $._replacement_escaped_newline, "escaped_newline_token"),

    substitution_flags: ($) =>
      choice(
        $._substitution_flags_without_write,
        $._substitution_flags_with_write,
      ),

    _substitution_flags_without_write: ($) =>
      choice(
        substitutionFlagChoice($),
        prec.left(
          seq($._substitution_flags_without_write, substitutionFlagChoice($)),
        ),
      ),

    _substitution_flags_with_write: ($) =>
      seq(optional($._substitution_flags_without_write), $.write_flag),

    occurrence_flag: () => new RegExp(occurrenceFlagPattern),

    global_flag: () => "g",

    case_insensitive_flag: () => "i",

    print_flag: () => "p",

    write_flag: ($) =>
      seq(
        field("verb", alias("w", $.substitution_flag)),
        choice(
          seq($._blanks, field("wfile", $.wfile)),
          seq($._blanks, issueField($, "missing_wfile")),
          seq(issueField($, "omitted_file_separator"), field("wfile", $.wfile)),
          seq(issueField($, "missing_wfile")),
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
                choice(
                  field("closing", delimiter($, "translate_end")),
                  field(
                    "closing",
                    missingDelimiter($, "incomplete_translation"),
                  ),
                ),
              ),
              field("middle", missingDelimiter($, "incomplete_translation")),
            ),
          ),
          field(
            "opening",
            choice(
              missingDelimiter($, "invalid_delimiter"),
              missingDelimiter($, "missing_opening_delimiter"),
            ),
          ),
        ),
      ),

    translation_string: ($) =>
      repeat1(
        choice(
          $.translation_literal,
          $.translation_escape,
          $.translation_escaped_delimiter,
          seq(issueField($, "undefined_translation_escape")),
          seq(issueField($, "incomplete_translation_escape")),
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
    function: ($) => choice(...functionDefinitions.map(({ rule }) => $[rule])),

    text: ($) => {
      const atom = choice(
        $.text_literal,
        $.text_backslash_escape,
        $.text_escaped_newline,
        seq(issueField($, "unspecified_text_escape")),
      );
      return choice(
        seq(
          repeat1(atom),
          optional(issueField($, "missing_text")),
          field("terminator", $.text_terminator),
        ),
        field(
          "terminator",
          namedExternal($, $._text_line_end, "text_line_end"),
        ),
        seq(
          issueField($, "missing_text"),
          field("terminator", namedExternal($, $._text_eof, "text_eof")),
        ),
      );
    },

    text_literal: ($) =>
      namedExternal($, $._text_literal, "text_literal_token"),

    text_backslash_escape: ($) =>
      namedExternal($, $._text_backslash_escape, "text_backslash_escape_token"),

    text_escaped_newline: ($) =>
      namedExternal($, $._text_escaped_newline, "text_escaped_newline_token"),

    text_terminator: ($) =>
      choice(
        namedExternal($, $._text_line_end, "text_line_end"),
        namedExternal($, $._text_eof, "text_eof"),
      ),

    text_introducer: ($) =>
      namedExternal($, $._text_command_start, "text_introducer_token"),

    rfile: ($) => namedExternal($, $._file_argument, "rfile_token"),

    wfile: ($) => namedExternal($, $._file_argument, "wfile_token"),

    label: ($) => namedExternal($, $._line_word, "label_token"),

    comment: ($) => namedExternal($, $._comment_text, "comment_text"),

    closing_brace: ($) =>
      choice(
        namedExternal($, $._right_brace, "closing_brace_token"),
        seq(issueField($, "missing_closing_brace")),
      ),
  };

  for (const { rule, spelling } of noArgumentDefinitions) {
    rules[rule] = ($) => seq(functionVerb($, spelling));
  }

  for (const descriptor of functionDefinitions) {
    const { form, rule, spelling } = descriptor;
    if (form === undefined || form === "substitute") {
      continue;
    }
    if (form === "block") {
      rules[rule] = ($) =>
        seq(
          functionVerb($, spelling),
          field("commands", alias($._block_commands, $.command_list)),
          field("closing", $.closing_brace),
          optional($._blanks),
        );
    } else if (form === "text") {
      rules[rule] = ($) =>
        seq(
          functionVerb($, spelling),
          choice(
            seq(field("introducer", $.text_introducer), field("text", $.text)),
            seq(issueField($, "missing_text_introducer")),
          ),
        );
    } else if (form === "optionalLabel") {
      rules[rule] = ($) =>
        seq(
          functionVerb($, spelling),
          optional(
            prec.right(
              seq(
                field("separator", alias(" ", $.argument_separator)),
                optional(field("label", $.label)),
              ),
            ),
          ),
        );
    } else if (form === "requiredLabel") {
      rules[rule] = ($) =>
        seq(
          functionVerb($, spelling),
          choice(field("label", $.label), issueField($, "missing_label")),
        );
    } else if (form === "rfile" || form === "wfile") {
      const missingFileReason =
        form === "rfile" ? "missing_rfile" : "missing_wfile";
      rules[rule] = ($) =>
        seq(
          functionVerb($, spelling),
          choice(
            seq($._blanks, field(form, $[form])),
            seq($._blanks, issueField($, missingFileReason)),
            seq(issueField($, "omitted_file_separator"), field(form, $[form])),
            issueField($, missingFileReason),
          ),
        );
    } else if (form === "comment") {
      rules[rule] = ($) =>
        seq(functionVerb($, spelling), optional(field("comment", $.comment)));
    } else if (form === "translate") {
      // Defined by operandRules.
    }
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

  function addressedForms($, definitions, kind) {
    const forms = [];
    for (const maximum of [0, 1, 2]) {
      const names = functionsByMaximum(definitions, maximum);
      if (names.length === 0) {
        continue;
      }
      const selectedFunction = functionWrapper($, wrapperName(kind, maximum));

      function addressedForm(
        addresses,
        { optionalAddresses = false, reportExcess = false } = {},
      ) {
        const parts = [optional($._blanks)];
        if (addresses !== null) {
          const addressed = seq(
            field("addresses", addresses),
            optional($._blanks),
          );
          parts.push(optionalAddresses ? optional(addressed) : addressed);
        }
        parts.push(
          optional(field("negation", $.negation)),
          field("function", selectedFunction),
        );
        if (reportExcess) {
          parts.push(issueField($, "excess_addresses"));
        }
        return seq(...parts);
      }

      if (maximum === 2) {
        forms.push(
          addressedForm($.address_clause, { optionalAddresses: true }),
        );
        continue;
      }

      const excessAddressForm = addressedForm(
        alias($._address_clause_with_excess, $.address_clause),
        { reportExcess: true },
      );

      if (maximum === 0) {
        forms.push(
          choice(
            addressedForm(null),
            addressedForm(
              alias(
                choice($._single_address_clause, $._double_address_clause),
                $.address_clause,
              ),
              { reportExcess: true },
            ),
            excessAddressForm,
          ),
        );
      } else {
        forms.push(
          choice(
            addressedForm(alias($._single_address_clause, $.address_clause), {
              optionalAddresses: true,
            }),
            addressedForm(alias($._double_address_clause, $.address_clause), {
              reportExcess: true,
            }),
            excessAddressForm,
          ),
        );
      }
    }

    return choice(...forms);
  }

  const rules = {
    editing_command: ($) =>
      choice(
        $._chainable_editing_command,
        $._line_terminated_editing_command,
        $._recovered_line_terminated_editing_command,
        $._recovered_editing_command,
      ),

    _chainable_editing_command: ($) =>
      seq(
        choice(
          addressedForms($, chainable, "chainable"),
          seq(
            optional($._blanks),
            optional(
              seq(field("addresses", $.address_clause), optional($._blanks)),
            ),
            optional(field("negation", $.negation)),
            field(
              "function",
              alias($._chainable_substitute_function, $.function),
            ),
          ),
        ),
        optional(issueField($, "unexpected_command_text")),
      ),

    _line_terminated_editing_command: ($) =>
      seq(
        $._line_terminated_editing_command_body,
        optional(issueField($, "unexpected_command_text")),
      ),

    _recovered_line_terminated_editing_command: ($) =>
      prec.right(
        seq(
          $._line_terminated_editing_command_body,
          optional(issueField($, "unexpected_command_text")),
          issueField($, "forbidden_command_separator"),
          optional($._blanks),
        ),
      ),

    _line_terminated_editing_command_body: ($) =>
      choice(
        addressedForms($, lineTerminated, "line_terminated"),
        seq(
          optional($._blanks),
          optional(
            seq(field("addresses", $.address_clause), optional($._blanks)),
          ),
          optional(field("negation", $.negation)),
          field(
            "function",
            alias($._line_terminated_substitute_function, $.function),
          ),
        ),
      ),

    _recovered_editing_command: ($) =>
      choice(
        seq(
          optional($._blanks),
          optional(
            seq(field("addresses", $.address_clause), optional($._blanks)),
          ),
          optional(field("negation", $.negation)),
          field("function", alias($._unknown_function, $.function)),
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

    _missing_function: ($) => seq(issueField($, "missing_function")),

    _chainable_substitute_function: ($) =>
      seq(alias($._substitute_function_without_write, $.substitute_function)),

    _line_terminated_substitute_function: ($) =>
      seq(alias($._substitute_function_with_write, $.substitute_function)),

    negation: ($) =>
      seq(
        field("operator", alias("!", $.negation_operator)),
        repeat(
          seq(
            optional(issueField($, "blanks_after_negation")),
            field("operator", alias("!", $.negation_operator)),
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
        rules[wrapperName(kind, maximum)] = ($) =>
          seq(choiceForRules($, names));
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

module.exports = sedRules;
