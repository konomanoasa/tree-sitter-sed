export const symbols = [
  "group_open",
  "group_close",
  "alternation",
  "quantifier",
  "interval_open",
  "interval_close",
  "interval_comma",
  "count",
  "bracket_open",
  "bracket_close",
  "bracket_negation",
  "range_dash",
  "range_continuation",
  "regex_dot",
  "regex_anchor",
  "class_open",
  "collating_open",
  "equivalence_open",
  "term_open_marker",
  "term_close_marker",
  "term_close",
  "term_text",
];
const quotedSymbols = [
  "regex_boundary",
  "regex_class_escape",
  "regex_backreference",
];
export const tokens = [
  "error_sentinel",
  ...symbols.flatMap((name) => [name, `${name}_encoded`, `${name}_escaped`]),
  ...quotedSymbols.flatMap((name) => [name, `${name}_encoded`]),
  "blank",
  "separator",
  "command_end",
  "block_close",
  "comment",
  "directive",
  "comment_tail",
  "comment_end",
  "opaque_end",
  "number",
  "zero_number",
  "zero_line_number",
  "address_modifier",
  "regex_start",
  "pattern_start",
  "translation_start",
  "regex_end",
  "pattern_end",
  "replacement_end",
  "translation_middle",
  "translation_end",
  "regex_character",
  "regex_escape",
  "regex_character_escape",
  "bracket_character",
  "bracket_escape",
  "bracket_character_escape",
  "class_valid",
  "literal",
  "escape",
  "character_escape",
  "line_continuation",
  "backreference",
  "match_reference",
  "case_conversion",
  "text_start",
  "inline_text_start",
  "shell_start",
  "inline_shell_start",
  "text_end",
  "filename",
  "label",
  "required_label",
  "version",
  "global_flag",
  "print_flag",
  "evaluate_flag",
  "match_flag",
  "write_flag",
  "occurrence",
];
const GLOBAL_FLAG = 1;
const PRINT_FLAG = 2;
const OCCURRENCE_FLAG = 4;
const EVALUATE_FLAG = 8;
const countedFlags = [
  { token: "global_flag", type: "flag", bit: GLOBAL_FLAG },
  { token: "print_flag", type: "flag", bit: PRINT_FLAG },
  { token: "occurrence", type: "number", bit: OCCURRENCE_FLAG },
];
const leaf = ($, token, name) => alias($[`_${token}`], $[name]);
const quotedSymbol = ($, name, type) =>
  choice(leaf($, name, type), leaf($, `${name}_encoded`, "character_escape"));
const symbol = ($, name, type) =>
  choice(quotedSymbol($, name, type), leaf($, `${name}_escaped`, "escape"));
const verb = ($, ...spellings) =>
  field(
    "name",
    alias(
      spellings.length === 1 ? spellings[0] : choice(...spellings),
      $.command_name,
    ),
  );
const step = ($, number) =>
  optional(
    seq(alias("~", $.address_operator), optional(field("step", number))),
  );
const relative = ($, count) =>
  prec.right(
    seq(
      alias(choice("+", "~"), $.address_operator),
      optional(field("count", count)),
    ),
  );
const fileCommand = ($, ...spellings) =>
  seq(verb($, ...spellings), field("file", $.filename));
const argumentCommand = ($, ...spellings) =>
  seq(verb($, ...spellings), optional(field("argument", $.number)));
const opaque = ($, token, name) => seq(leaf($, token, name), $._opaque_end);
const commentLine = ($, token, name) =>
  seq(
    leaf($, token, name),
    optional(leaf($, "comment_tail", "comment_text")),
    $._comment_end,
  );
const textOperand = ($, kind, body) =>
  seq(
    choice(
      leaf($, `${kind}_start`, "text_introducer"),
      $[`_inline_${kind}_start`],
    ),
    optional(body),
    $._text_end,
  );
const characterForms = ($, prefix) => [
  leaf($, `${prefix}_character`, "literal"),
  leaf($, `${prefix}_escape`, "escape"),
  leaf($, `${prefix}_character_escape`, "character_escape"),
];
const compoundTerm = ($, opening, closing, name, content) =>
  seq(
    symbol($, opening, opening),
    symbol($, "term_open_marker", "compound_marker"),
    field(name, content),
    symbol($, "term_close_marker", "compound_marker"),
    symbol($, "term_close", closing),
  );
const substitutionTail = ($, flags) => [
  field("separator", leaf($, "pattern_end", "delimiter")),
  optional($.replacement),
  field("closing", leaf($, "replacement_end", "delimiter")),
  optional(alias(flags, $.substitution_flags)),
];
function flagRules() {
  const rules = {};
  for (const empty of [0, 1]) {
    for (let seen = 0; seen < 16; seen++) {
      rules[`_flags_${empty}_${seen}`] = ($) => {
        const then = (next) => optional($[`_flags_${empty}_${next}`]);
        return prec.right(
          choice(
            ...countedFlags
              .filter(({ bit }) => !(seen & bit))
              .map(({ token, type, bit }) =>
                seq(leaf($, token, type), then(seen | bit)),
              ),
            seq(
              leaf($, "evaluate_flag", "flag"),
              then(
                seen & EVALUATE_FLAG
                  ? seen
                  : (seen | EVALUATE_FLAG) & ~PRINT_FLAG,
              ),
            ),
            ...(!empty ? [seq(leaf($, "match_flag", "flag"), then(seen))] : []),
            $.write_flag,
          ),
        );
      };
    }
  }
  return rules;
}
export default function defineGrammar(name) {
  return grammar({
    name,
    extras: ($) => [$._blank, /[ \t]/],
    conflicts: ($) => [
      [$.command_list],
      [$.address_clause, $._single_address_clause],
    ],
    externals: ($) => tokens.map((token) => $[`_${token}`]),
    rules: {
      script: ($) =>
        choice(
          alias($._directed_commands, $.command_list),
          seq(
            optional($._blank),
            optional(alias($._root_commands, $.command_list)),
          ),
        ),
      _directed_commands: ($) => seq($.directive, optional($._root_commands)),
      // Share item states between scripts with and without a leading directive.
      _root_commands: ($) =>
        seq(repeat1(choice($.command, $.command_separator, $.comment))),
      command_list: ($) =>
        repeat1(choice($.command, $.command_separator, $.comment)),
      command_separator: ($) => $._separator,
      command: ($) =>
        choice(
          seq(
            optional(field("address", $.address_clause)),
            optional(field("negation", $.negation)),
            $._function,
          ),
          seq(
            optional(
              field(
                "address",
                alias($._single_address_clause, $.address_clause),
              ),
            ),
            optional(field("negation", $.negation)),
            alias($._quit_command, $.numeric_command),
            $._command_end,
          ),
          seq(optional(field("negation", $.negation)), $.label_command),
          seq(field("negation", $.negation), $.comment),
          seq(
            field("address", alias($._read_zero_clause, $.address_clause)),
            alias($._read_command, $.file_command),
            $._command_end,
          ),
        ),
      address_clause: ($) =>
        choice(
          seq($._first_address, optional($._address_tail)),
          seq(
            alias($._zero_address, $.address),
            alias(",", $.address_separator),
            alias($._regex_only_address, $.address),
          ),
        ),
      _single_address_clause: ($) => $._first_address,
      _first_address: ($) =>
        choice($.address, alias($._first_relative_address, $.relative_address)),
      _first_relative_address: ($) =>
        relative($, leaf($, "zero_number", "number")),
      _read_zero_clause: ($) => alias($._zero_address, $.address),
      _address_tail: ($) =>
        seq(
          alias(",", $.address_separator),
          choice($.address, $.relative_address),
        ),
      address: ($) =>
        choice($.line_address, $.last_line_address, $.regex_address),
      _regex_only_address: ($) => $.regex_address,
      _zero_address: ($) => alias($._zero_line_address, $.line_address),
      _zero_line_address: ($) =>
        seq(
          field("first", leaf($, "zero_line_number", "number")),
          step($, leaf($, "zero_number", "number")),
        ),
      line_address: ($) =>
        seq(field("first", leaf($, "number", "number")), step($, $.number)),
      last_line_address: () => "$",
      relative_address: ($) => relative($, $.number),
      number: ($) => choice($._number, $._zero_number),
      negation: () => alias(/!/, "!"),
      regex_address: ($) =>
        seq(
          field("opening", leaf($, "regex_start", "delimiter")),
          choice(
            seq(
              $.regular_expression,
              field("closing", leaf($, "regex_end", "delimiter")),
              repeat($.address_modifier),
            ),
            field("closing", leaf($, "regex_end", "delimiter")),
          ),
        ),
      address_modifier: ($) => $._address_modifier,
      _function: ($) =>
        choice(
          $.branch_command,
          $.version_command,
          seq(
            choice(
              $.simple_command,
              $.block,
              $.substitute_command,
              $.translate_command,
              $.text_command,
              $.file_command,
              $.execute_command,
              $.numeric_command,
            ),
            $._command_end,
          ),
        ),
      simple_command: ($) =>
        verb(
          $,
          "d",
          "D",
          "g",
          "G",
          "h",
          "H",
          "n",
          "N",
          "p",
          "P",
          "x",
          "=",
          "F",
          "z",
        ),
      numeric_command: ($) => argumentCommand($, "l"),
      _quit_command: ($) => argumentCommand($, "q", "Q"),
      version_command: ($) =>
        prec.right(seq(verb($, "v"), optional(field("version", $.version)))),
      version: ($) => opaque($, "version", "version_text"),
      block: ($) =>
        seq(
          field("opening", "{"),
          optional($.command_list),
          optional(field("negation", $.negation)),
          field("closing", alias($._block_close, "}")),
        ),
      branch_command: ($) =>
        prec.right(
          seq(verb($, "b", "t", "T"), optional(field("label", $.label))),
        ),
      label_command: ($) =>
        seq(
          verb($, ":"),
          field("label", alias($._required_label_body, $.label)),
        ),
      label: ($) => opaque($, "label", "label_text"),
      _required_label_body: ($) => opaque($, "required_label", "label_text"),
      file_command: ($) => fileCommand($, "r", "R", "w", "W"),
      _read_command: ($) => fileCommand($, "r"),
      filename: ($) => opaque($, "filename", "filename_text"),
      shell_command: ($) =>
        repeat1(choice(leaf($, "literal", "shell_text"), $._operand_escape)),
      execute_command: ($) =>
        seq(
          verb($, "e"),
          optional(textOperand($, "shell", field("command", $.shell_command))),
        ),
      text_command: ($) =>
        seq(verb($, "a", "c", "i"), textOperand($, "text", $.text)),
      text: ($) => repeat1($._operand_piece),
      substitute_command: ($) =>
        prec.right(
          seq(
            verb($, "s"),
            field("opening", leaf($, "pattern_start", "delimiter")),
            choice(
              seq($.regular_expression, ...substitutionTail($, $._flags_0_0)),
              seq(...substitutionTail($, $._flags_1_0)),
            ),
          ),
        ),
      write_flag: ($) => seq(leaf($, "write_flag", "flag"), $.filename),
      replacement: ($) =>
        repeat1(
          choice(
            $._operand_piece,
            leaf($, "backreference", "replacement_reference"),
            leaf($, "match_reference", "matched_text_reference"),
            leaf($, "case_conversion", "case_conversion"),
          ),
        ),
      translate_command: ($) =>
        seq(
          verb($, "y"),
          field("opening", leaf($, "translation_start", "delimiter")),
          optional(field("source", $.translation_string)),
          field("separator", leaf($, "translation_middle", "delimiter")),
          optional(field("destination", $.translation_string)),
          field("closing", leaf($, "translation_end", "delimiter")),
        ),
      translation_string: ($) => repeat1($._operand_piece),
      _operand_piece: ($) =>
        choice(leaf($, "literal", "literal"), $._operand_escape),
      _operand_escape: ($) =>
        choice(
          leaf($, "escape", "escape"),
          leaf($, "character_escape", "character_escape"),
          leaf($, "line_continuation", "line_continuation"),
        ),
      comment: ($) => commentLine($, "comment", "comment_text"),
      directive: ($) => commentLine($, "directive", "directive_text"),
      regular_expression: ($) => $.alternation,
      alternation: ($) =>
        choice(
          $.regex_branch,
          seq(
            optional($.regex_branch),
            repeat1(
              seq(
                symbol($, "alternation", "regex_operator"),
                optional($.regex_branch),
              ),
            ),
          ),
        ),
      regex_branch: ($) => repeat1(choice($.repetition, $._regex_atom)),
      repetition: ($) =>
        prec.right(
          1,
          seq(
            field("expression", $._regex_atom),
            repeat1(
              field(
                "operator",
                choice(symbol($, "quantifier", "regex_operator"), $.interval),
              ),
            ),
          ),
        ),
      _regex_atom: ($) =>
        choice(
          $.regex_character,
          $.wildcard,
          $.anchor,
          $.word_boundary,
          $.regex_character_class,
          $.backreference,
          $.group,
          $.bracket_expression,
        ),
      regex_character: ($) => choice(...characterForms($, "regex")),
      wildcard: ($) => symbol($, "regex_dot", "regex_operator"),
      anchor: ($) => symbol($, "regex_anchor", "regex_operator"),
      word_boundary: ($) => quotedSymbol($, "regex_boundary", "regex_operator"),
      regex_character_class: ($) =>
        quotedSymbol($, "regex_class_escape", "regex_operator"),
      backreference: ($) =>
        quotedSymbol($, "regex_backreference", "regex_reference"),
      group: ($) =>
        seq(
          field("opening", symbol($, "group_open", "group_open")),
          optional($.regular_expression),
          field("closing", symbol($, "group_close", "group_close")),
        ),
      interval_count: ($) => prec.right(repeat1(symbol($, "count", "number"))),
      interval: ($) =>
        seq(
          field("opening", symbol($, "interval_open", "interval_open")),
          choice(
            seq(
              field("minimum", $.interval_count),
              optional(
                seq(
                  symbol($, "interval_comma", "interval_separator"),
                  optional(field("maximum", $.interval_count)),
                ),
              ),
            ),
            seq(
              symbol($, "interval_comma", "interval_separator"),
              optional(field("maximum", $.interval_count)),
            ),
          ),
          field("closing", symbol($, "interval_close", "interval_close")),
        ),
      bracket_expression: ($) =>
        seq(
          field("opening", symbol($, "bracket_open", "bracket_open")),
          optional(symbol($, "bracket_negation", "regex_operator")),
          repeat1(choice($.range, $._bracket_atom)),
          field("closing", symbol($, "bracket_close", "bracket_close")),
        ),
      _bracket_atom: ($) =>
        choice(
          $.bracket_character,
          $.character_class,
          $.collating_symbol,
          $.equivalence_class,
        ),
      bracket_character: ($) => choice(...characterForms($, "bracket")),
      range: ($) =>
        prec.right(
          1,
          seq(
            field("start", $._range_endpoint),
            symbol($, "range_dash", "range_operator"),
            field("end", $._range_endpoint),
            repeat(
              seq(
                symbol($, "range_continuation", "range_operator"),
                field("end", $._range_endpoint),
              ),
            ),
          ),
        ),
      _range_endpoint: ($) => choice($.bracket_character, $.collating_symbol),
      _class_payload: ($) => repeat1(symbol($, "term_text", "class_name_text")),
      collating_element: ($) =>
        repeat1(symbol($, "term_text", "collating_text")),
      character_class: ($) =>
        compoundTerm(
          $,
          "class_open",
          "class_close",
          "name",
          seq($._class_valid, alias($._class_payload, $.class_name)),
        ),
      collating_symbol: ($) =>
        compoundTerm(
          $,
          "collating_open",
          "collating_close",
          "element",
          $.collating_element,
        ),
      equivalence_class: ($) =>
        compoundTerm(
          $,
          "equivalence_open",
          "equivalence_close",
          "element",
          $.collating_element,
        ),
      ...flagRules(),
    },
  });
}
