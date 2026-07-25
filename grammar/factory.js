const { addressOperator, commandArgument, commandName } = require("./schema");

function defineGrammar(name, dialect, regexMode) {
  if (regexMode !== "bre" && regexMode !== "ere") {
    throw new Error(`Unsupported regular-expression mode: ${regexMode}`);
  }
  const commandGroups = dialect.commandGroups;
  const commandNames = dialect.commandNames;
  const dialectRules = dialect.rules;
  const substituteFlags = dialect.substituteFlags;
  const syntaxCapabilities = dialect.syntax;

  function commandSpelling(rule) {
    return commandNames[rule];
  }

  function substituteFlagDefinition(rule) {
    return substituteFlags.find((definition) => definition.rule === rule);
  }

  function spellingChoice(spellings) {
    return spellings.length === 1 ? spellings[0] : choice(...spellings);
  }

  function conflictSets($) {
    const conflicts = [
      [$.command_list],
      [$._command_sequence],
      [$._block_command_sequence],
      [$._substitute_argument_without_write, $._substitute_argument_with_write],
      [$._substitute_argument_without_write],
      [$._substitute_flags_without_write],
      [$._substitute_flags_without_write, $._substitute_flags_with_write],
    ];

    if (dialectRules.periodic_address) {
      conflicts.push(
        [$.address, $.periodic_address],
        [$.periodic_address, $._zero_address],
      );
    }

    if (syntaxCapabilities.regexAddressFlags.length > 0) {
      conflicts.push(
        [$.regex_address],
        [$.escaped_regex_address],
        [$.regex_flags],
      );
    }

    if (syntaxCapabilities.quitStatus) {
      conflicts.push([$.quit_command]);
    }

    if (syntaxCapabilities.listWidth) {
      conflicts.push([$.list_command]);
    }

    if (syntaxCapabilities.optionalBranchSeparator) {
      conflicts.push([$.branch_command], [$.test_command]);
    }

    if (hasCommandsForTermination("label")) {
      conflicts.push(
        [$._command_sequence, $._trailing_comment_item],
        [$._block_command_sequence, $._trailing_comment_item],
      );
    }

    if (!syntaxCapabilities.compactBlockClose) {
      conflicts.push([
        $._block_command_sequence,
        $._block_line_content_before_close,
      ]);
    }

    for (const rule of [
      "silent_quit_command",
      "test_failure_command",
      "version_command",
      "execute_command",
    ]) {
      if (dialectRules[rule]) {
        conflicts.push([$[rule]]);
      }
    }

    return conflicts;
  }

  function namedDelimiter($, token, role) {
    return field(role, alias(token, $.delimiter));
  }

  function regexTokenChoice($) {
    const tokens = [
      $.regex_literal,
      $.regex_escape,
      $.escaped_delimiter,
      $.escaped_newline,
      $.regex_group_open,
      $.regex_group_close,
      $.regex_alternation_operator,
      $.regex_zero_or_more,
      $.regex_one_or_more,
      $.regex_zero_or_one,
      $.regex_interval,
      $.regex_backreference,
      $.incomplete_escape,
      $.bracket_expression,
    ];

    if (syntaxCapabilities.extendedCommandLoopWhitespace) {
      tokens.push(
        $.gnu_character_escape,
        $.gnu_control_escape,
        $.invalid_control_escape,
      );
    }

    return choice(...tokens);
  }

  function bracketTokenChoice($) {
    const tokens = [
      $.regex_literal,
      $.regex_escape,
      $.escaped_delimiter,
      $.escaped_newline,
      $.incomplete_escape,
      $.posix_character_class,
      $.collating_symbol,
      $.equivalence_class,
    ];

    if (syntaxCapabilities.extendedCommandLoopWhitespace) {
      tokens.push(
        $.gnu_character_escape,
        $.gnu_control_escape,
        $.invalid_control_escape,
      );
    }

    return choice(...tokens);
  }

  function replacementTokenChoice($) {
    const tokens = [
      $.replacement_literal,
      $.match_reference,
      $.backreference,
      $.escaped_delimiter,
      $.escape_sequence,
      $.escaped_newline,
      $.incomplete_escape,
    ];

    if (syntaxCapabilities.extendedCommandLoopWhitespace) {
      tokens.push($.case_conversion);
    }

    return choice(...tokens);
  }

  function translateTokenChoice($) {
    return choice(
      $.translate_literal,
      $.escaped_delimiter,
      $.translate_escape,
      $.escaped_newline,
      $.incomplete_escape,
    );
  }

  function syntaxRuleChoice($, descriptors) {
    const rules = [];
    const seen = new Set();

    for (const descriptor of descriptors) {
      const normalized =
        typeof descriptor === "string" ? { rule: descriptor } : descriptor;
      const key = JSON.stringify({
        alias: normalized.alias,
        rule: normalized.rule,
      });

      if (!seen.has(key)) {
        const symbol = $[normalized.rule];
        rules.push(
          normalized.alias ? alias(symbol, $[normalized.alias]) : symbol,
        );
        seen.add(key);
      }
    }

    return rules.length === 1 ? rules[0] : choice(...rules);
  }

  function commandBodyChoice($, descriptors) {
    return choice(
      ...descriptors.map((descriptor) => {
        const symbol = $[descriptor.rule];
        return descriptor.alias ? alias(symbol, $[descriptor.alias]) : symbol;
      }),
    );
  }

  function commandAddress($) {
    return choice(
      $.address_range,
      syntaxRuleChoice($, syntaxCapabilities.commandAddressRules),
    );
  }

  function rangeStartAddress($) {
    return syntaxRuleChoice($, syntaxCapabilities.rangeStartRules);
  }

  function optionalCommandLoopWhitespace($) {
    return syntaxCapabilities.extendedCommandLoopWhitespace
      ? seq(optional($._blanks), optional($._gnu_outer_loop_whitespace))
      : optional($._blanks);
  }

  function gnuOuterLoopPadding($) {
    return seq(optional($._blanks), $._gnu_outer_loop_whitespace);
  }

  function lineContent($, separator, commandSequence) {
    const forms = [commandSequence, seq(separator, optional(commandSequence))];

    if (syntaxCapabilities.extendedCommandLoopWhitespace) {
      forms.push(
        gnuOuterLoopPadding($),
        seq(gnuOuterLoopPadding($), separator, optional(commandSequence)),
      );
    }

    return prec.right(choice(...forms));
  }

  function semicolonSeparator($) {
    const parts = [
      optional($._blanks),
      alias(";", $.separator),
      optional($._blanks),
    ];

    if (syntaxCapabilities.extendedCommandLoopWhitespace) {
      parts.push(optional($._gnu_outer_loop_whitespace));
    }

    return prec.right(seq(...parts));
  }

  function hasCommandsForTermination(termination) {
    return commandGroups[termination].length > 0;
  }

  function addressedCommand($, descriptors) {
    const parts = [];

    parts.push(
      optional(seq(field("addresses", commandAddress($)), optional($._blanks))),
    );

    parts.push(
      optional(seq(field("negation", $.negation), optional($._blanks))),
      field("body", commandBodyChoice($, descriptors)),
    );

    return seq(...parts);
  }

  function commandsForTermination($, termination) {
    return addressedCommand($, commandGroups[termination]);
  }

  function commandsWithUnexpectedTail($) {
    return addressedCommand(
      $,
      commandGroups.chainable.filter(
        ({ alias, rule }) =>
          alias !== "substitute_command" &&
          !rule.startsWith("_substitute_command"),
      ),
    );
  }

  function commandChoice($) {
    const forms = [$._chainable_command, $._line_terminated_command];
    if (hasCommandsForTermination("label")) {
      forms.push($._label_terminated_command);
    }
    return choice(...forms);
  }

  function commandSequence($, separator, inBlock = false) {
    const unexpectedCommandItem = inBlock
      ? $._unexpected_block_command_item
      : $._unexpected_command_item;
    const repeatedForms = [
      seq($._chainable_command_item, separator),
      seq($._invalid_command_item, separator),
    ];
    const endingForms = [
      seq($._chainable_command_item, optional(separator)),
      $._line_terminated_command_item,
      seq($._invalid_command_item, optional(separator)),
    ];

    repeatedForms.unshift(seq(unexpectedCommandItem, separator));
    endingForms.unshift(seq(unexpectedCommandItem, optional(separator)));

    if (syntaxCapabilities.trailingComment) {
      endingForms.unshift(
        seq($._chainable_command_item, $._trailing_comment_item),
      );
    }

    if (hasCommandsForTermination("label")) {
      repeatedForms.push(
        seq($._label_terminated_command_item, separator),
        seq($._label_terminated_command_item, $._blanks),
      );
      endingForms.unshift(
        seq($._label_terminated_command_item, optional(separator)),
      );

      if (syntaxCapabilities.trailingComment) {
        endingForms.unshift(
          seq($._label_terminated_command_item, $._trailing_comment_item),
        );
      }
    }

    return seq(repeat(choice(...repeatedForms)), choice(...endingForms));
  }

  function blockCommandList($) {
    return choice(
      syntaxCapabilities.compactBlockClose
        ? $._block_line_content
        : $._block_line_content_before_close,
      seq(
        optional($._block_line_content),
        $._line_end,
        repeat(seq(optional($._block_line_content), $._line_end)),
        optional(
          syntaxCapabilities.compactBlockClose
            ? $._block_line_content
            : $._block_line_content_before_close,
        ),
      ),
    );
  }

  function fileCommand($, rule) {
    const spelling = commandSpelling(rule);
    const standard = seq(
      commandName($, spelling),
      syntaxCapabilities.optionalFileSeparator
        ? optional($._blanks)
        : $._blanks,
      commandArgument($.file_argument),
    );

    return standard;
  }

  function branchCommand($, rule) {
    const standard = seq(
      commandName($, commandSpelling(rule)),
      optional(
        syntaxCapabilities.optionalBranchSeparator
          ? seq(optional($._blanks), commandArgument($._branch_argument))
          : prec.right(
              seq(
                $._branch_separator,
                optional($._blanks),
                optional(commandArgument($._branch_argument)),
              ),
            ),
      ),
    );

    return standard;
  }

  function textCommand($, rule) {
    const standard = seq(
      commandName($, commandSpelling(rule)),
      commandArgument($._text_argument),
    );

    return standard;
  }

  function externalTokens($) {
    const tokens = [
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
      $._regex_escape,
      $._regex_escaped_delimiter,
      $._regex_escaped_newline,
      $._regex_group_open,
      $._regex_group_close,
      $._regex_alternation_operator,
      $._regex_zero_or_more,
      $._regex_one_or_more,
      $._regex_zero_or_one,
      $._regex_interval,
      $._regex_backreference,
      $._regex_bracket_open,
      $._regex_bracket_close,
      $._regex_posix_character_class,
      $._regex_collating_symbol,
      $._regex_equivalence_class,
      $._regex_incomplete_escape,
      $._regex_unterminated_address,
      $._regex_unterminated_substitute,
      $._replacement_literal,
      $._replacement_match_reference,
      $._replacement_backreference,
      $._replacement_escaped_delimiter,
      $._replacement_escape_sequence,
      $._replacement_escaped_newline,
      $._replacement_incomplete_escape,
      $._replacement_unterminated,
      $._translate_literal,
      $._translate_escaped_delimiter,
      $._translate_escape,
      $._translate_escaped_newline,
      $._translate_incomplete_escape,
      $._translate_unterminated_source,
      $._translate_unterminated_destination,
      $._text_command_start,
      $._text_block,
      $.first_line_silent,
      $._comment_text,
      $.file_argument,
      $._line_word,
      $._right_brace,
    ];

    if (syntaxCapabilities.extendedCommandLoopWhitespace) {
      tokens.push(
        $._regex_gnu_character_escape,
        $._regex_gnu_control_escape,
        $._regex_invalid_control_escape,
        $._replacement_case_conversion,
        $._version_argument,
        $.shell_command,
        $._gnu_outer_loop_whitespace,
      );
    }

    tokens.push($._error_sentinel);
    return tokens;
  }

  return grammar({
    name,

    externals: ($) => externalTokens($),

    extras: () => [],

    conflicts: ($) => conflictSets($),

    rules: {
      script: ($) =>
        seq(
          optional($.first_line_silent),
          optional($.command_list),
          optional($._blanks),
        ),

      command_list: ($) =>
        choice(
          $._line_content,
          seq(
            optional($._line_content),
            $._line_end,
            repeat(seq(optional($._line_content), $._line_end)),
            optional($._line_content),
          ),
        ),

      _line_content: ($) =>
        lineContent($, $._semicolon_separators, $._command_sequence),

      _command_sequence: ($) => commandSequence($, $._semicolon_separators),

      _block_command_sequence: ($) =>
        commandSequence($, $._block_semicolon_separators, true),

      ...(syntaxCapabilities.compactBlockClose
        ? {}
        : {
            _block_line_content_before_close: ($) =>
              choice(
                $._block_command_sequence_before_close,
                seq(
                  $._block_semicolon_separators,
                  optional($._block_command_sequence_before_close),
                ),
              ),

            _block_command_sequence_before_close: ($) =>
              repeat1(
                seq(
                  choice(
                    $._chainable_command_item,
                    $._invalid_command_item,
                    $._unexpected_block_command_item,
                  ),
                  $._block_semicolon_separators,
                ),
              ),
          }),

      _chainable_command_item: ($) =>
        seq(
          optionalCommandLoopWhitespace($),
          alias($._chainable_command, $.command),
        ),

      _line_terminated_command_item: ($) =>
        seq(
          optionalCommandLoopWhitespace($),
          alias($._line_terminated_command, $.command),
        ),

      _invalid_command_item: ($) =>
        seq(
          optionalCommandLoopWhitespace($),
          alias($._invalid_command, $.command),
        ),

      _invalid_command: ($) =>
        seq(field("body", $.invalid_command), optional($.unexpected_text)),

      ...(hasCommandsForTermination("label")
        ? {
            _label_terminated_command_item: ($) =>
              seq(
                optionalCommandLoopWhitespace($),
                alias($._label_terminated_command, $.command),
              ),
          }
        : {}),

      _trailing_comment_item: ($) =>
        seq(optional($._blanks), alias($._trailing_comment_command, $.command)),

      _trailing_comment_command: ($) => field("body", $.comment_command),

      _unexpected_command_item: ($) =>
        seq(
          optionalCommandLoopWhitespace($),
          alias($._unexpected_command, $.command),
        ),

      _unexpected_command: ($) =>
        prec(
          -1,
          seq(
            $._chainable_command_with_unexpected_tail,
            alias($._known_command_tail, $.unexpected_text),
          ),
        ),

      _unexpected_block_command_item: ($) =>
        seq(
          optionalCommandLoopWhitespace($),
          alias($._unexpected_block_command, $.command),
        ),

      _unexpected_block_command: ($) =>
        prec(
          200,
          seq(
            $._chainable_command_with_unexpected_tail,
            alias($._known_block_command_tail, $.unexpected_text),
          ),
        ),

      _known_command_tail: () =>
        syntaxCapabilities.trailingComment
          ? token.immediate(prec(-1, /[ \t]*[^ \t;#}\r\n][^;#}\r\n]*/))
          : token.immediate(prec(-1, /[ \t]*[^ \t;\r\n][^;\r\n]*/)),

      _known_block_command_tail: () =>
        syntaxCapabilities.trailingComment
          ? token.immediate(prec(100, /[ \t]*[^ \t;#}\r\n][^;#}\r\n]*/))
          : token.immediate(prec(100, /[ \t]*[^ \t;}\r\n][^;}\r\n]*/)),

      _line_end: ($) => seq(optional($._blanks), $._line_separator),

      _line_separator: ($) => alias($._newline, $.separator),

      _semicolon_separators: ($) => prec.right(repeat1($._semicolon_separator)),

      _semicolon_separator: ($) => semicolonSeparator($),

      _block_semicolon_separators: ($) =>
        prec.right(repeat1($._block_semicolon_separator)),

      _block_semicolon_separator: ($) => semicolonSeparator($),

      _blanks: () => token(/[ \t]+/),

      _newline: () => token(/\r?\n/),

      invalid_command: () => token(prec(-1, /[^\s0-9$/\\!;{}#]/)),

      unexpected_text: () =>
        syntaxCapabilities.trailingComment
          ? token(prec(1, /[^;#}\r\n]+/))
          : token(prec(1, /[^;}\r\n]+/)),

      command: ($) => commandChoice($),

      _chainable_command: ($) => commandsForTermination($, "chainable"),

      _chainable_command_with_unexpected_tail: ($) =>
        commandsWithUnexpectedTail($),

      _line_terminated_command: ($) => commandsForTermination($, "line"),

      ...(hasCommandsForTermination("label")
        ? {
            _label_terminated_command: ($) =>
              commandsForTermination($, "label"),
          }
        : {}),

      address_range: ($) =>
        prec(
          100,
          seq(
            field("start", rangeStartAddress($)),
            optional($._blanks),
            addressOperator($, ","),
            optional($._blanks),
            field("end", syntaxRuleChoice($, syntaxCapabilities.rangeEndRules)),
          ),
        ),

      address: ($) => syntaxRuleChoice($, syntaxCapabilities.addressRules),

      line_number_address: () => /0*[1-9]\d*/,

      last_line_address: () => "$",

      regex_address: ($) =>
        seq(
          namedDelimiter($, $._regex_address_start, "opening_delimiter"),
          optional(field("pattern", $.regex)),
          optional(
            field(
              "incomplete",
              alias($._regex_unterminated_address, $.incomplete_regex),
            ),
          ),
          namedDelimiter($, $._regex_address_end, "closing_delimiter"),
          ...(syntaxCapabilities.regexAddressFlags.length > 0
            ? [optional(field("flags", $.regex_flags))]
            : []),
        ),

      escaped_regex_address: ($) =>
        seq(
          "\\",
          namedDelimiter(
            $,
            $._escaped_regex_address_start,
            "opening_delimiter",
          ),
          optional(field("pattern", $.regex)),
          optional(
            field(
              "incomplete",
              alias($._regex_unterminated_address, $.incomplete_regex),
            ),
          ),
          namedDelimiter($, $._regex_address_end, "closing_delimiter"),
          ...(syntaxCapabilities.regexAddressFlags.length > 0
            ? [optional(field("flags", $.regex_flags))]
            : []),
        ),

      regex: ($) => repeat1(regexTokenChoice($)),

      regex_literal: ($) => $._regex_literal,

      regex_escape: ($) => $._regex_escape,

      escaped_delimiter: ($) =>
        choice(
          $._regex_escaped_delimiter,
          $._replacement_escaped_delimiter,
          $._translate_escaped_delimiter,
        ),

      escaped_newline: ($) =>
        choice(
          $._regex_escaped_newline,
          $._replacement_escaped_newline,
          $._translate_escaped_newline,
        ),

      regex_group_open: ($) => $._regex_group_open,

      regex_group_close: ($) => $._regex_group_close,

      regex_alternation_operator: ($) => $._regex_alternation_operator,

      regex_zero_or_more: ($) => $._regex_zero_or_more,

      regex_one_or_more: ($) => $._regex_one_or_more,

      regex_zero_or_one: ($) => $._regex_zero_or_one,

      regex_interval: ($) => $._regex_interval,

      regex_backreference: ($) => $._regex_backreference,

      incomplete_escape: ($) =>
        choice(
          $._regex_incomplete_escape,
          $._replacement_incomplete_escape,
          $._translate_incomplete_escape,
        ),

      bracket_expression: ($) =>
        seq(
          $._regex_bracket_open,
          repeat(bracketTokenChoice($)),
          choice(
            $._regex_bracket_close,
            alias($._regex_unterminated_address, $.unclosed_bracket),
            alias($._regex_unterminated_substitute, $.unclosed_bracket),
          ),
        ),

      posix_character_class: ($) => $._regex_posix_character_class,

      collating_symbol: ($) => $._regex_collating_symbol,

      equivalence_class: ($) => $._regex_equivalence_class,

      ...(syntaxCapabilities.extendedCommandLoopWhitespace
        ? {
            gnu_character_escape: ($) => $._regex_gnu_character_escape,
            gnu_control_escape: ($) => $._regex_gnu_control_escape,
            invalid_control_escape: ($) => $._regex_invalid_control_escape,
          }
        : {}),

      ...(syntaxCapabilities.regexAddressFlags.length > 0
        ? {
            regex_flags: ($) =>
              seq(
                optional($._blanks),
                syntaxRuleChoice($, syntaxCapabilities.regexAddressFlags),
                repeat(
                  seq(
                    optional($._blanks),
                    syntaxRuleChoice($, syntaxCapabilities.regexAddressFlags),
                  ),
                ),
              ),
          }
        : {}),

      negation: () => "!",

      delete_command: ($) => commandName($, commandSpelling("delete_command")),

      print_command: ($) => commandName($, commandSpelling("print_command")),

      quit_command: ($) =>
        syntaxCapabilities.quitStatus
          ? seq(
              commandName($, commandSpelling("quit_command")),
              optional(
                seq(
                  optional($._blanks),
                  commandArgument(alias($.exit_status, $.numeric_argument)),
                ),
              ),
            )
          : commandName($, commandSpelling("quit_command")),

      next_command: ($) => commandName($, commandSpelling("next_command")),

      delete_first_line_command: ($) =>
        commandName($, commandSpelling("delete_first_line_command")),

      get_command: ($) => commandName($, commandSpelling("get_command")),

      get_append_command: ($) =>
        commandName($, commandSpelling("get_append_command")),

      hold_command: ($) => commandName($, commandSpelling("hold_command")),

      hold_append_command: ($) =>
        commandName($, commandSpelling("hold_append_command")),

      next_append_command: ($) =>
        commandName($, commandSpelling("next_append_command")),

      print_first_line_command: ($) =>
        commandName($, commandSpelling("print_first_line_command")),

      exchange_command: ($) =>
        commandName($, commandSpelling("exchange_command")),

      line_number_command: ($) =>
        commandName($, commandSpelling("line_number_command")),

      list_command: ($) =>
        syntaxCapabilities.listWidth
          ? seq(
              commandName($, commandSpelling("list_command")),
              optional(
                seq(
                  optional($._blanks),
                  commandArgument(
                    alias($.line_wrap_length, $.numeric_argument),
                  ),
                ),
              ),
            )
          : commandName($, commandSpelling("list_command")),

      read_command: ($) => fileCommand($, "read_command"),

      write_command: ($) => fileCommand($, "write_command"),

      block_command: ($) => {
        const body = alias($._block_command_list, $.command_list);
        return seq(
          commandName($, commandSpelling("block_command")),
          syntaxCapabilities.compactBlockClose
            ? optional(commandArgument(body))
            : commandArgument(body),
          alias($._right_brace, "}"),
        );
      },

      _block_command_list: ($) => blockCommandList($),

      _block_line_content: ($) =>
        lineContent(
          $,
          $._block_semicolon_separators,
          $._block_command_sequence,
        ),

      substitute_command: ($) =>
        choice(
          $._substitute_command_without_write,
          $._substitute_command_with_write,
        ),

      _substitute_command_without_write: ($) =>
        seq(
          commandName($, commandSpelling("_substitute_command_without_write")),
          commandArgument(
            alias($._substitute_argument_without_write, $.substitute_argument),
          ),
        ),

      _substitute_command_with_write: ($) =>
        prec.right(
          seq(
            commandName($, commandSpelling("_substitute_command_with_write")),
            commandArgument(
              alias($._substitute_argument_with_write, $.substitute_argument),
            ),
          ),
        ),

      _substitute_argument_without_write: ($) =>
        seq(
          namedDelimiter($, $._substitute_start, "opening_delimiter"),
          optional(field("pattern", $.regex)),
          optional(
            field(
              "incomplete_pattern",
              alias($._regex_unterminated_substitute, $.incomplete_regex),
            ),
          ),
          namedDelimiter($, $._substitute_middle, "middle_delimiter"),
          optional(field("replacement", $.replacement)),
          optional(
            field(
              "incomplete_replacement",
              alias($._replacement_unterminated, $.incomplete_replacement),
            ),
          ),
          namedDelimiter($, $._substitute_end, "closing_delimiter"),
          optional(
            field(
              "flags",
              alias($._substitute_flags_without_write, $.substitute_flags),
            ),
          ),
        ),

      _substitute_argument_with_write: ($) =>
        seq(
          namedDelimiter($, $._substitute_start, "opening_delimiter"),
          optional(field("pattern", $.regex)),
          optional(
            field(
              "incomplete_pattern",
              alias($._regex_unterminated_substitute, $.incomplete_regex),
            ),
          ),
          namedDelimiter($, $._substitute_middle, "middle_delimiter"),
          optional(field("replacement", $.replacement)),
          optional(
            field(
              "incomplete_replacement",
              alias($._replacement_unterminated, $.incomplete_replacement),
            ),
          ),
          namedDelimiter($, $._substitute_end, "closing_delimiter"),
          field(
            "flags",
            alias($._substitute_flags_with_write, $.substitute_flags),
          ),
        ),

      translate_command: ($) =>
        seq(
          commandName($, commandSpelling("translate_command")),
          commandArgument($.translate_argument),
        ),

      translate_argument: ($) =>
        seq(
          namedDelimiter($, $._translate_start, "opening_delimiter"),
          optional(field("source", $.translate_source)),
          optional(
            field(
              "incomplete_source",
              alias($._translate_unterminated_source, $.incomplete_translate),
            ),
          ),
          namedDelimiter($, $._translate_middle, "middle_delimiter"),
          optional(field("destination", $.translate_destination)),
          optional(
            field(
              "incomplete_destination",
              alias(
                $._translate_unterminated_destination,
                $.incomplete_translate,
              ),
            ),
          ),
          namedDelimiter($, $._translate_end, "closing_delimiter"),
        ),

      replacement: ($) => repeat1(replacementTokenChoice($)),

      replacement_literal: ($) => $._replacement_literal,

      match_reference: ($) => $._replacement_match_reference,

      backreference: ($) => $._replacement_backreference,

      escape_sequence: ($) => $._replacement_escape_sequence,

      ...(syntaxCapabilities.extendedCommandLoopWhitespace
        ? {
            case_conversion: ($) => $._replacement_case_conversion,
          }
        : {}),

      translate_source: ($) => repeat1(translateTokenChoice($)),

      translate_destination: ($) => repeat1(translateTokenChoice($)),

      translate_literal: ($) => $._translate_literal,

      translate_escape: ($) => $._translate_escape,

      substitute_flags: ($) =>
        choice(
          $._substitute_flags_without_write,
          $._substitute_flags_with_write,
        ),

      _substitute_flags_without_write: ($) =>
        seq(
          optional($._blanks),
          $._substitute_flag,
          repeat(seq(optional($._blanks), $._substitute_flag)),
        ),

      _substitute_flags_with_write: ($) =>
        seq(
          optional($._blanks),
          repeat(seq($._substitute_flag, optional($._blanks))),
          $.write_flag,
        ),

      _substitute_flag: ($) =>
        choice(
          syntaxRuleChoice(
            $,
            substituteFlags.filter(({ form }) => form !== "write"),
          ),
          $.invalid_flag,
        ),

      invalid_flag: () =>
        syntaxCapabilities.trailingComment
          ? token(prec(-1, /[^w \t;#}\r\n]/))
          : token(prec(-1, /[^w \t;}\r\n]/)),

      occurrence_flag: () =>
        new RegExp(substituteFlagDefinition("occurrence_flag").pattern),

      global_flag: () =>
        spellingChoice(substituteFlagDefinition("global_flag").spellings),

      ignore_case_flag: () =>
        spellingChoice(substituteFlagDefinition("ignore_case_flag").spellings),

      print_flag: () =>
        spellingChoice(substituteFlagDefinition("print_flag").spellings),

      write_flag: ($) => {
        const name = field(
          "name",
          alias(
            substituteFlagDefinition("write_flag").spellings[0],
            $.substitute_flag_name,
          ),
        );
        const separator = syntaxCapabilities.optionalFileSeparator
          ? optional($._blanks)
          : $._blanks;

        return seq(name, separator, field("argument", $.file_argument));
      },

      label_command: ($) =>
        seq(
          commandName($, commandSpelling("label_command")),
          optional($._blanks),
          commandArgument(alias($.label, $.label_definition)),
        ),

      branch_command: ($) => branchCommand($, "branch_command"),

      test_command: ($) => branchCommand($, "test_command"),

      _branch_argument: ($) => alias($.label, $.label_reference),

      _branch_separator: () => token(prec(1, " ")),

      label: ($) => $._line_word,

      append_command: ($) => textCommand($, "append_command"),

      insert_command: ($) => textCommand($, "insert_command"),

      change_command: ($) => textCommand($, "change_command"),

      _text_argument: ($) =>
        syntaxRuleChoice($, syntaxCapabilities.textArgumentRules),

      text_argument: ($) => $._text_block,

      comment_command: ($) =>
        seq(
          commandName($, commandSpelling("comment_command")),
          optional(commandArgument($.comment_argument)),
        ),

      comment_argument: ($) => $._comment_text,

      ...dialectRules,
    },
  });
}

module.exports = defineGrammar;
