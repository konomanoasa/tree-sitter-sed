[
  (step_value)
  (line_offset)
  (numeric_argument)
] @number

[
  (shell_argument)
] @string

(case_conversion) @string.escape

(version_argument) @constant

[
  (multiline_flag)
  (execute_flag)
] @attribute

(clear_command
  name: (command_name) @function.builtin)
(execute_command
  name: (command_name) @function.builtin)
(file_name_command
  name: (command_name) @function.builtin)
(read_line_command
  name: (command_name) @function.builtin)
(silent_quit_command
  name: (command_name) @function.builtin)
(test_failure_command
  name: (command_name) @function.builtin)
(version_command
  name: (command_name) @function.builtin)
(write_first_line_command
  name: (command_name) @function.builtin)

(periodic_address
  operator: (address_operator) @operator)
(next_multiple_address
  operator: (address_operator) @operator)
(relative_address
  operator: (address_operator) @operator)
