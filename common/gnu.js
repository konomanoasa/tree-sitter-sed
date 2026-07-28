const { addressOperator, commandArgument, commandName } = require("./schema");
const posix = require("./posix");

const commandNames = {
  ...posix.commandNames,
  silent_quit_command: "Q",
  file_name_command: "F",
  clear_command: "z",
  read_line_command: "R",
  write_first_line_command: "W",
  test_failure_command: "T",
  version_command: "v",
  execute_command: "e",
};

const substituteFlags = [
  {
    rule: "occurrence_flag",
    pattern: "[[:digit:]]+",
  },
  {
    rule: "global_flag",
    spellings: ["g"],
  },
  {
    rule: "ignore_case_flag",
    spellings: ["i", "I"],
  },
  {
    rule: "print_flag",
    spellings: ["p"],
  },
  {
    rule: "write_flag",
    spellings: ["w"],
    form: "write",
  },
  {
    rule: "multiline_flag",
    spellings: ["m", "M"],
  },
  {
    rule: "execute_flag",
    spellings: ["e"],
  },
];

const regexAddressFlags = [
  {
    rule: "_address_ignore_case_flag",
    alias: "ignore_case_flag",
    spellings: ["I"],
  },
  {
    rule: "_address_multiline_flag",
    alias: "multiline_flag",
    spellings: ["M"],
  },
];

function commandSpelling(rule) {
  return commandNames[rule];
}

function substituteFlagSpellings(rule) {
  return substituteFlags.find((definition) => definition.rule === rule)
    .spellings;
}

function regexAddressFlagSpelling(rule) {
  return regexAddressFlags.find((definition) => definition.rule === rule)
    .spellings[0];
}

function requiredFileCommand($, rule) {
  return seq(
    commandName($, commandSpelling(rule)),
    optional($._blanks),
    commandArgument($.file_argument),
  );
}

/** GNU sed 4.10 syntax. */
module.exports = {
  commandNames,
  substituteFlags,
  syntax: {
    extendedCommandLoopWhitespace: true,
    optionalBranchSeparator: true,
    optionalFileSeparator: true,
    trailingComment: true,
    compactBlockClose: true,
    addressRules: [...posix.syntax.addressRules, "periodic_address"],
    commandAddressRules: [
      "address",
      { rule: "_zero_address", alias: "address" },
      "relative_address",
      "next_multiple_address",
    ],
    rangeStartRules: ["address", { rule: "_zero_address", alias: "address" }],
    rangeEndRules: [
      ...posix.syntax.rangeEndRules,
      { rule: "_zero_address", alias: "address" },
      "relative_address",
      "next_multiple_address",
    ],
    regexAddressFlags,
    textArgumentRules: [
      ...posix.syntax.textArgumentRules,
      "_inline_text_argument",
    ],
    quitStatus: true,
    listWidth: true,
  },
  rules: {
    ...posix.rules,

    periodic_address: ($) =>
      choice(
        seq(
          field("start", $.line_number_address),
          optional($._blanks),
          addressOperator($, "~"),
          optional($._blanks),
          field("step", $.step_value),
        ),
        seq(
          field(
            "start",
            alias($._zero_line_number_address, $.line_number_address),
          ),
          optional($._blanks),
          addressOperator($, "~"),
          optional($._blanks),
          field("step", alias($._positive_step_value, $.step_value)),
        ),
      ),

    step_value: () => /[[:digit:]]+/,

    _positive_step_value: () => /0*[1-9][[:digit:]]*/,

    _zero_line_number_address: () => /0+/,

    _zero_address: ($) =>
      alias($._zero_line_number_address, $.line_number_address),

    _zero_regex_range_end: ($) =>
      choice($.regex_address, $.escaped_regex_address),

    relative_address: ($) =>
      seq(
        addressOperator($, "+"),
        optional($._blanks),
        field("value", $.line_offset),
      ),

    line_offset: () => /[[:digit:]]+/,

    next_multiple_address: ($) =>
      seq(
        addressOperator($, "~"),
        optional($._blanks),
        field("value", $.step_value),
      ),

    _address_ignore_case_flag: () =>
      regexAddressFlagSpelling("_address_ignore_case_flag"),

    _address_multiline_flag: () =>
      regexAddressFlagSpelling("_address_multiline_flag"),

    silent_quit_command: ($) =>
      seq(
        commandName($, commandSpelling("silent_quit_command")),
        optional(
          seq(
            optional($._blanks),
            commandArgument(alias($.exit_status, $.numeric_argument)),
          ),
        ),
      ),

    exit_status: () => /[[:digit:]]+/,

    line_wrap_length: () => /[[:digit:]]+/,

    file_name_command: ($) =>
      commandName($, commandSpelling("file_name_command")),

    clear_command: ($) => commandName($, commandSpelling("clear_command")),

    read_line_command: ($) => requiredFileCommand($, "read_line_command"),

    write_first_line_command: ($) =>
      requiredFileCommand($, "write_first_line_command"),

    test_failure_command: ($) =>
      seq(
        commandName($, commandSpelling("test_failure_command")),
        optional(seq(optional($._blanks), commandArgument($._branch_argument))),
      ),

    version_command: ($) =>
      seq(
        commandName($, commandSpelling("version_command")),
        optional(seq(optional($._blanks), commandArgument($.version_argument))),
      ),

    version_argument: ($) => $._version_argument,

    multiline_flag: () => choice(...substituteFlagSpellings("multiline_flag")),

    execute_flag: () => substituteFlagSpellings("execute_flag")[0],

    execute_command: ($) =>
      seq(
        commandName($, commandSpelling("execute_command")),
        optional(
          seq(
            optional($._blanks),
            commandArgument(alias($.shell_command, $.shell_argument)),
          ),
        ),
      ),

    _inline_text_argument: ($) => seq(optional($._blanks), $.text_argument),
  },
  commandGroups: {
    chainable: [
      { rule: "quit_command" },
      { rule: "line_number_command" },
      { rule: "delete_command" },
      { rule: "print_command" },
      { rule: "next_command" },
      { rule: "delete_first_line_command" },
      { rule: "get_command" },
      { rule: "get_append_command" },
      { rule: "hold_command" },
      { rule: "hold_append_command" },
      { rule: "next_append_command" },
      { rule: "print_first_line_command" },
      { rule: "exchange_command" },
      { rule: "list_command" },
      { rule: "block_command" },
      {
        rule: "_substitute_command_without_write",
        alias: "substitute_command",
      },
      { rule: "translate_command" },
      { rule: "silent_quit_command" },
      { rule: "file_name_command" },
      { rule: "version_command" },
      { rule: "clear_command" },
    ],
    line: [
      { rule: "append_command" },
      { rule: "insert_command" },
      { rule: "read_command" },
      { rule: "comment_command" },
      { rule: "write_command" },
      {
        rule: "_substitute_command_with_write",
        alias: "substitute_command",
      },
      { rule: "change_command" },
      { rule: "execute_command" },
      { rule: "read_line_command" },
      { rule: "write_first_line_command" },
    ],
    label: [
      { rule: "label_command" },
      { rule: "branch_command" },
      { rule: "test_command" },
      { rule: "test_failure_command" },
    ],
  },
};
