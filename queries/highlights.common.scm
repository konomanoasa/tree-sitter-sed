[
  (first_line_silent)
  (comment_command)
] @comment

[
  (line_number_address)
  (occurrence_flag)
] @number

(last_line_address) @constant.builtin

(regex) @string.regexp

[
  (replacement)
  (translate_source)
  (translate_destination)
  (text_argument)
] @string

[
  (match_reference)
  (backreference)
] @string.special

(escape_sequence) @string.escape

(file_argument) @string.special
[
  (label_definition)
  (label_reference)
] @constant
(negation) @operator

(append_command
  name: (command_name) @function.builtin)
(branch_command
  name: (command_name) @function.builtin)
(change_command
  name: (command_name) @function.builtin)
(delete_command
  name: (command_name) @function.builtin)
(delete_first_line_command
  name: (command_name) @function.builtin)
(exchange_command
  name: (command_name) @function.builtin)
(get_append_command
  name: (command_name) @function.builtin)
(get_command
  name: (command_name) @function.builtin)
(hold_append_command
  name: (command_name) @function.builtin)
(hold_command
  name: (command_name) @function.builtin)
(insert_command
  name: (command_name) @function.builtin)
(label_command
  name: (command_name) @function.builtin)
(line_number_command
  name: (command_name) @function.builtin)
(list_command
  name: (command_name) @function.builtin)
(next_append_command
  name: (command_name) @function.builtin)
(next_command
  name: (command_name) @function.builtin)
(print_command
  name: (command_name) @function.builtin)
(print_first_line_command
  name: (command_name) @function.builtin)
(quit_command
  name: (command_name) @function.builtin)
(read_command
  name: (command_name) @function.builtin)
(substitute_command
  name: (command_name) @function.builtin)
(test_command
  name: (command_name) @function.builtin)
(translate_command
  name: (command_name) @function.builtin)
(write_command
  name: (command_name) @function.builtin)

(write_flag
  name: (substitute_flag_name) @function.builtin)

[
  (global_flag)
  (ignore_case_flag)
  (print_flag)
] @attribute

(block_command
  name: (command_name) @punctuation.bracket
  "}" @punctuation.bracket)

(address_range
  operator: (address_operator) @punctuation.delimiter)

((separator) @punctuation.delimiter
  (#match? @punctuation.delimiter ";"))
