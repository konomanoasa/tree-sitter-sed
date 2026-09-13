#ifndef TREE_SITTER_SED_COMMON_SCANNER_H_
#define TREE_SITTER_SED_COMMON_SCANNER_H_

#ifndef SED_REGEX_EXTENDED
#error "SED_REGEX_EXTENDED must be defined before including scanner.h"
#endif
#include "tree_sitter/alloc.h"
#include "tree_sitter/parser.h"

#include <stdbool.h>
#include <stdint.h>

enum TokenType {
  REGEX_ADDRESS_START,
  ESCAPED_REGEX_ADDRESS_START,
  REGEX_ADDRESS_END,
  SUBSTITUTE_START,
  SUBSTITUTE_MIDDLE,
  SUBSTITUTE_END,
  TRANSLATE_START,
  TRANSLATE_MIDDLE,
  TRANSLATE_END,
  REGEX_LITERAL,
  INVALID_CHARACTER,
  NUL_CHARACTER,
  REGEX_BEGINNING_ANCHOR,
  REGEX_END_ANCHOR,
  REGEX_PERIOD,
  REGEX_QUOTED_ESCAPE,
  ESCAPE_PREFIX,
  REGEX_NEWLINE_ESCAPE,
  REGEX_ESCAPED_DELIMITER,
  REGEX_SPECIAL_ESCAPED_DELIMITER,
  REGEX_GROUP_OPEN,
  REGEX_GROUP_CLOSE,
  REGEX_UNCLOSED_GROUP,
#if !SED_REGEX_EXTENDED
  REGEX_UNMATCHED_GROUP_CLOSE,
  REGEX_BRE_VERTICAL_LINE_ESCAPE,
  REGEX_BRE_QUESTION_MARK_ESCAPE,
  REGEX_BRE_PLUS_ESCAPE,
  REGEX_BRE_SUBEXPRESSION_CARET,
  REGEX_BRE_SUBEXPRESSION_DOLLAR,
  REGEX_UNMATCHED_INTERVAL_CLOSE,
#endif
#if SED_REGEX_EXTENDED
  REGEX_ALTERNATION_OPERATOR,
#endif
  REGEX_LEADING_DUPLICATION_MARKER,
  REGEX_ADJACENT_DUPLICATION_MARKER,
  REGEX_ZERO_OR_MORE,
#if SED_REGEX_EXTENDED
  REGEX_ONE_OR_MORE,
  REGEX_ZERO_OR_ONE,
  REGEX_REPETITION_MODIFIER,
#endif
  REGEX_INTERVAL_OPEN,
  REGEX_DUP_COUNT,
  REGEX_INTERVAL_SEPARATOR,
  REGEX_INTERVAL_CLOSE,
#if !SED_REGEX_EXTENDED
  REGEX_BACKREFERENCE,
#endif
  REGEX_INVALID_INTERVAL,
  REGEX_NONPORTABLE_ESCAPE,
  REGEX_INCOMPLETE_ESCAPE,
  REGEX_BRACKET_OPEN,
  REGEX_BRACKET_CLOSE,
  REGEX_BRACKET_LITERAL,
  REGEX_BRACKET_NEGATION,
  REGEX_BRACKET_HYPHEN,
  REGEX_BRACKET_RANGE_END_HYPHEN,
  REGEX_BRACKET_TRAILING_HYPHEN,
  REGEX_OPEN_COLON,
  REGEX_CLASS_NAME,
  REGEX_INVALID_CLASS_NAME,
  REGEX_COLON_CLOSE,
  REGEX_OPEN_DOT,
  REGEX_COLL_ELEM_SINGLE,
  REGEX_COLL_ELEM_MULTI,
  REGEX_META_CHAR,
  REGEX_DOT_CLOSE,
  REGEX_OPEN_EQUAL,
  REGEX_EQUAL_CLOSE,
  REGEX_MALFORMED_BRACKET_TERM,
  REGEX_SHARED_RANGE_ENDPOINT,
  AMBIGUOUS_BRACKET_EXPRESSION_MARKER,
  MISSING_BRACKET_LIST_MARKER,
  UNCLOSED_BRACKET_EXPRESSION_MARKER,
  NONPORTABLE_RANGE_START_MARKER,
  NONPORTABLE_RANGE_END_MARKER,
  REGEX_UNTERMINATED_ADDRESS,
  REGEX_UNTERMINATED_SUBSTITUTE,
  REPLACEMENT_LITERAL,
  REPLACEMENT_MATCH_REFERENCE,
  REPLACEMENT_BACKREFERENCE,
  REPLACEMENT_ESCAPED_DELIMITER,
  REPLACEMENT_AMPERSAND_ESCAPED_DELIMITER,
  REPLACEMENT_ESCAPE_SEQUENCE,
  REPLACEMENT_NONPORTABLE_ESCAPE,
  REPLACEMENT_ESCAPED_NEWLINE,
  REPLACEMENT_INCOMPLETE_ESCAPE,
  REPLACEMENT_UNTERMINATED,
  TRANSLATE_LITERAL,
  TRANSLATE_ESCAPED_DELIMITER,
  TRANSLATE_ESCAPE,
  TRANSLATE_NONPORTABLE_ESCAPE,
  TRANSLATE_INCOMPLETE_ESCAPE,
  TRANSLATE_UNTERMINATED_SOURCE,
  TRANSLATE_UNTERMINATED_DESTINATION,
  INVALID_SUBSTITUTION_FLAG,
  FLAG_AFTER_WRITE_MARKER,
  TEXT_COMMAND_START,
  TEXT_INCOMPLETE_INTRODUCER,
  TEXT_LITERAL,
  TEXT_BACKSLASH_ESCAPE,
  TEXT_ESCAPED_NEWLINE,
  TEXT_UNSPECIFIED_ESCAPE,
  TEXT_LINE_END,
  TEXT_EOF,
  DEFAULT_OUTPUT_SUPPRESSION,
  COMMENT_TEXT,
  FILE_ARGUMENT,
  SUBSTITUTION_WFILE_ARGUMENT,
  SUBSTITUTION_WFILE_CONTINUATION,
  LINE_WORD,
  ARGUMENT_SEPARATOR,
  RIGHT_BRACE,
  BLOCK_TRAILING_BLANKS,
  EMPTY_COMMAND_MARKER,
  RESERVED_UNKNOWN_FUNCTION_TOKEN,
  REGEX_INCOMPLETE_GROUP,
  REGEX_INCOMPLETE_BRACKET_TERM,
  REGEX_INCOMPLETE_INTERVAL,
  REGEX_FORBIDDEN_NEWLINE_ESCAPE,
  REGEX_LINE_UNTERMINATED_ADDRESS,
  REGEX_LINE_UNTERMINATED_SUBSTITUTE,
  REPLACEMENT_LINE_UNTERMINATED,
  TRANSLATE_LINE_UNTERMINATED_SOURCE,
  TRANSLATE_LINE_UNTERMINATED_DESTINATION,
  BLANKS_AROUND_ADDRESS_SEPARATOR,
  OMITTED_ADDRESS_MARKER,
  INCOMPLETE_OMITTED_ADDRESS_MARKER,
  OMITTED_FIRST_ADDRESS_MARKER,
  EMPTY_SUBEXPRESSION_MARKER,
  MISSING_SUBEXPRESSION_MARKER,
#if SED_REGEX_EXTENDED
  EMPTY_ALTERNATIVE_MARKER,
#endif
  MISSING_FUNCTION_MARKER,
  MISSING_LABEL_MARKER,
  MISSING_RFILE_MARKER,
  MISSING_WFILE_MARKER,
  OMITTED_FILE_SEPARATOR_MARKER,
  MISSING_TEXT_INTRODUCER_MARKER,
  MISSING_TEXT_MARKER,
  MISSING_COMMAND_SEPARATOR_MARKER,
  MISSING_ADDRESS_SEPARATOR_MARKER,
  MISSING_CLOSING_BRACE_MARKER,
  MISSING_OPENING_DELIMITER_MARKER,
  MISSING_SEPARATOR_BEFORE_UNMATCHED_BRACE_MARKER,
  MISSING_SEPARATOR_AFTER_UNMATCHED_BRACE_MARKER,
  NONCONFORMING_MISSING_FUNCTION_MARKER,
  NONCONFORMING_MISSING_LABEL_MARKER,
  NONCONFORMING_MISSING_RFILE_MARKER,
  NONCONFORMING_MISSING_WFILE_MARKER,
  NONCONFORMING_MISSING_TEXT_INTRODUCER_MARKER,
  NONCONFORMING_MISSING_OPENING_DELIMITER_MARKER,
  MISSING_SUBEXPRESSION_PLACEHOLDER_MARKER,
  INCOMPLETE_BRACKET_LIST_MARKER,
  INCOMPLETE_BRACKET_EXPRESSION_MARKER,
#if SED_REGEX_EXTENDED
  INCOMPLETE_ALTERNATIVE_MARKER,
#endif
  INCOMPLETE_COMMAND_SEPARATOR_MARKER,
  UNEXPECTED_COMMAND_TEXT,
  ERROR_SENTINEL,
};

enum ScannerMode {
  MODE_NONE,
  MODE_REGEX_ADDRESS,
  MODE_SUBSTITUTE_PATTERN,
  MODE_SUBSTITUTE_REPLACEMENT,
  MODE_TRANSLATE_SOURCE,
  MODE_TRANSLATE_DESTINATION,
  MODE_TEXT,
};

enum RegexState {
  REGEX_OUTSIDE_BRACKET,
  REGEX_BRACKET_FIRST,
  REGEX_BRACKET_AFTER_CARET,
  REGEX_BRACKET_BODY,
};

enum RegexPosition {
  REGEX_AFTER_ATOM,
  REGEX_AT_BRANCH_START,
#if SED_REGEX_EXTENDED
  REGEX_AFTER_ALTERNATION,
#else
  REGEX_AFTER_ANCHOR,
#endif
  REGEX_AFTER_DUPLICATION_SYMBOL,
#if SED_REGEX_EXTENDED
  REGEX_AFTER_REPETITION_MODIFIER,
#endif
};

enum RegexBracketTermState {
  REGEX_BRACKET_TERM_NONE,
  REGEX_BRACKET_TERM_COLON,
  REGEX_BRACKET_TERM_DOT,
  REGEX_BRACKET_TERM_EQUAL,
};

enum RegexBracketPendingElement {
  REGEX_BRACKET_PENDING_NONE,
  REGEX_BRACKET_PENDING_OTHER,
  REGEX_BRACKET_PENDING_DOT,
  REGEX_BRACKET_PENDING_EQUAL,
  REGEX_BRACKET_PENDING_COLON,
};

typedef struct {
  int32_t delimiter;
  enum ScannerMode mode;
  enum RegexState regex_state;
  enum RegexPosition regex_position;
  bool text_line_has_content;
  bool regex_in_interval;
  enum RegexBracketTermState regex_bracket_term_state;
  bool regex_bracket_term_has_content;
  enum RegexBracketPendingElement regex_bracket_pending_element;
  enum RegexBracketPendingElement regex_bracket_first_element;
  enum RegexBracketPendingElement regex_bracket_last_element;
  uint8_t regex_bracket_element_count;
  bool regex_bracket_range_pending;
  uint32_t regex_group_depth;
} ScannerState;

enum { SCANNER_SERIALIZED_STATE_SIZE = 17 };

enum {
  SERIALIZED_TEXT_HAS_CONTENT_FLAG = 1 << 0,
  SERIALIZED_IN_INTERVAL_FLAG = 1 << 1,
  SERIALIZED_BRACKET_TERM_HAS_CONTENT_FLAG = 1 << 2,
  SERIALIZED_RANGE_PENDING_FLAG = 1 << 3,
};

static void reset_bracket_tracking(ScannerState *state) {
  state->regex_bracket_term_state = REGEX_BRACKET_TERM_NONE;
  state->regex_bracket_term_has_content = false;
  state->regex_bracket_pending_element = REGEX_BRACKET_PENDING_NONE;
  state->regex_bracket_first_element = REGEX_BRACKET_PENDING_NONE;
  state->regex_bracket_last_element = REGEX_BRACKET_PENDING_NONE;
  state->regex_bracket_element_count = 0;
  state->regex_bracket_range_pending = false;
}

static bool regex_at_branch_start(const ScannerState *state) {
  return state->regex_position ==
    REGEX_AT_BRANCH_START ||
#if SED_REGEX_EXTENDED
    state->regex_position == REGEX_AFTER_ALTERNATION;
#else
    state->regex_position == REGEX_AFTER_ANCHOR;
#endif
}

static void reset_mode_tracking(ScannerState *state) {
  state->regex_state = REGEX_OUTSIDE_BRACKET;
  state->regex_position = REGEX_AFTER_ATOM;
  state->text_line_has_content = false;
  state->regex_in_interval = false;
  reset_bracket_tracking(state);
  state->regex_group_depth = 0;
}

static void reset_state(ScannerState *state) {
  state->delimiter = 0;
  state->mode = MODE_NONE;
  reset_mode_tracking(state);
}

static void *sed_scanner_create(void) {
  return ts_calloc(1, sizeof(ScannerState));
}

static void sed_scanner_destroy(void *payload) {
  ts_free(payload);
}

static void serialize_uint32(char *buffer, unsigned offset, uint32_t value) {
  buffer[offset] = (char)(value & UINT32_C(0xff));
  buffer[offset + 1] = (char)((value >> 8) & UINT32_C(0xff));
  buffer[offset + 2] = (char)((value >> 16) & UINT32_C(0xff));
  buffer[offset + 3] = (char)((value >> 24) & UINT32_C(0xff));
}

static uint32_t deserialize_uint32(const char *buffer, unsigned offset) {
  return (uint32_t)(unsigned char)buffer[offset] |
    ((uint32_t)(unsigned char)buffer[offset + 1] << 8) |
    ((uint32_t)(unsigned char)buffer[offset + 2] << 16) |
    ((uint32_t)(unsigned char)buffer[offset + 3] << 24);
}

static bool is_regex_mode(enum ScannerMode mode) {
  return mode == MODE_REGEX_ADDRESS || mode == MODE_SUBSTITUTE_PATTERN;
}

static unsigned sed_scanner_serialize(void *payload, char *buffer) {
  const ScannerState *state = payload;

  buffer[0] = (char)state->mode;
  buffer[1] = (char)state->regex_state;
  buffer[2] = (char)state->regex_position;
  buffer[3] =
    (state->text_line_has_content ? SERIALIZED_TEXT_HAS_CONTENT_FLAG : 0) |
    (state->regex_in_interval ? SERIALIZED_IN_INTERVAL_FLAG : 0) |
    (state->regex_bracket_term_has_content
        ? SERIALIZED_BRACKET_TERM_HAS_CONTENT_FLAG
        : 0) |
    (state->regex_bracket_range_pending ? SERIALIZED_RANGE_PENDING_FLAG : 0);
  serialize_uint32(buffer, 4, (uint32_t)state->delimiter);
  serialize_uint32(buffer, 8, state->regex_group_depth);
  buffer[12] = (char)state->regex_bracket_term_state;
  buffer[13] = (char)state->regex_bracket_pending_element;
  buffer[14] = (char)state->regex_bracket_first_element;
  buffer[15] = (char)state->regex_bracket_last_element;
  buffer[16] = (char)state->regex_bracket_element_count;
  return SCANNER_SERIALIZED_STATE_SIZE;
}

static bool source_character_is_decoded(int32_t character) {
  const uint32_t code_point = (uint32_t)character;
  return code_point <=
    UINT32_C(0x10ffff) &&
    !(code_point >= UINT32_C(0xd800) && code_point <= UINT32_C(0xdfff));
}

static bool source_character_is_valid(int32_t character) {
  return character != 0 && source_character_is_decoded(character);
}

static TSSymbol source_character_issue_symbol(int32_t character) {
  return character == 0 ? NUL_CHARACTER : INVALID_CHARACTER;
}

static bool delimiter_character_is_valid(int32_t character) {
  return source_character_is_valid(character) &&
    character !=
    '\\' &&
    character != '\n';
}

static void
sed_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  ScannerState *state = payload;
  if (length == 0) {
    reset_state(state);
    return;
  }

  const unsigned char flags = (unsigned char)buffer[3];
  *state = (ScannerState){
    .mode = (enum ScannerMode)(unsigned char)buffer[0],
    .regex_state = (enum RegexState)(unsigned char)buffer[1],
    .regex_position = (enum RegexPosition)(unsigned char)buffer[2],
    .text_line_has_content = (flags & SERIALIZED_TEXT_HAS_CONTENT_FLAG) != 0,
    .regex_in_interval = (flags & SERIALIZED_IN_INTERVAL_FLAG) != 0,
    .regex_bracket_term_has_content =
      (flags & SERIALIZED_BRACKET_TERM_HAS_CONTENT_FLAG) != 0,
    .regex_bracket_range_pending = (flags & SERIALIZED_RANGE_PENDING_FLAG) != 0,
    .delimiter = (int32_t)deserialize_uint32(buffer, 4),
    .regex_group_depth = deserialize_uint32(buffer, 8),
    .regex_bracket_term_state =
      (enum RegexBracketTermState)(unsigned char)buffer[12],
    .regex_bracket_pending_element =
      (enum RegexBracketPendingElement)(unsigned char)buffer[13],
    .regex_bracket_first_element =
      (enum RegexBracketPendingElement)(unsigned char)buffer[14],
    .regex_bracket_last_element =
      (enum RegexBracketPendingElement)(unsigned char)buffer[15],
    .regex_bracket_element_count = (uint8_t)(unsigned char)buffer[16],
  };
}

static void advance(TSLexer *lexer) {
  lexer->advance(lexer, false);
}

static void consume(TSLexer *lexer) {
  advance(lexer);
  lexer->mark_end(lexer);
}

static bool is_blank(int32_t character) {
  return character == ' ' || character == '\t';
}

static bool is_digit(int32_t character) {
  return character >= '0' && character <= '9';
}

static bool is_letter(int32_t character) {
  return (character >= 'a' && character <= 'z') ||
    (character >= 'A' && character <= 'Z');
}

static void advance_past_blanks(TSLexer *lexer) {
  while (is_blank(lexer->lookahead)) {
    advance(lexer);
  }
}

static void skip_blanks(TSLexer *lexer) {
  while (is_blank(lexer->lookahead)) {
    lexer->advance(lexer, true);
  }
}

static bool invalid_delimiter(TSLexer *lexer) {
  return lexer->eof(lexer) || !delimiter_character_is_valid(lexer->lookahead);
}

static bool delimiter_is_missing(TSLexer *lexer) {
  return lexer->eof(lexer) || lexer->lookahead == '\n';
}

static bool scan_simple_delimiter(
  TSLexer *lexer,
  ScannerState *state,
  enum ScannerMode next_mode
) {
  if (invalid_delimiter(lexer)) {
    return false;
  }

  state->delimiter = lexer->lookahead;
  state->mode = next_mode;
  reset_mode_tracking(state);
  state->regex_position =
    is_regex_mode(next_mode) ? REGEX_AT_BRANCH_START : REGEX_AFTER_ATOM;
  consume(lexer);
  return true;
}

static bool
emit_symbol(const bool *valid_symbols, TSSymbol candidate, TSSymbol *symbol) {
  if (!valid_symbols[candidate]) {
    return false;
  }

  *symbol = candidate;
  return true;
}

static bool consume_as(
  TSLexer *lexer,
  const bool *valid_symbols,
  TSSymbol candidate,
  TSSymbol *symbol
) {
  consume(lexer);
  return emit_symbol(valid_symbols, candidate, symbol);
}

static bool end_mode(
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol candidate,
  TSSymbol *symbol
) {
  reset_state(state);
  return emit_symbol(valid_symbols, candidate, symbol);
}

static bool scan_active_mode_delimiter(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  TSSymbol candidate;
  enum ScannerMode next_mode;

  switch (state->mode) {
  case MODE_REGEX_ADDRESS:
    candidate = REGEX_ADDRESS_END;
    next_mode = MODE_NONE;
    break;
  case MODE_SUBSTITUTE_PATTERN:
    candidate = SUBSTITUTE_MIDDLE;
    next_mode = MODE_SUBSTITUTE_REPLACEMENT;
    break;
  case MODE_SUBSTITUTE_REPLACEMENT:
    candidate = SUBSTITUTE_END;
    next_mode = MODE_NONE;
    break;
  case MODE_TRANSLATE_SOURCE:
    candidate = TRANSLATE_MIDDLE;
    next_mode = MODE_TRANSLATE_DESTINATION;
    break;
  case MODE_TRANSLATE_DESTINATION:
    candidate = TRANSLATE_END;
    next_mode = MODE_NONE;
    break;
  case MODE_NONE:
  case MODE_TEXT:
    return false;
  }

  state->mode = next_mode;
  reset_mode_tracking(state);
  if (next_mode == MODE_NONE) {
    state->delimiter = 0;
  }
  return consume_as(lexer, valid_symbols, candidate, symbol);
}

static bool scan_text_command_start(TSLexer *lexer, ScannerState *state) {
  lexer->mark_end(lexer);
  advance(lexer);

  if (lexer->lookahead != '\n') {
    return false;
  }

  consume(lexer);
  state->mode = MODE_TEXT;
  return true;
}

static bool scan_line_rest(TSLexer *lexer, bool ends_at_semicolon) {
  bool consumed = false;
  while (
    !lexer->eof(lexer) &&
    source_character_is_valid(lexer->lookahead) &&
    lexer->lookahead !=
    '\n' &&
    !(ends_at_semicolon && lexer->lookahead == ';')
  ) {
    consume(lexer);
    consumed = true;
  }
  return consumed;
}

static bool scan_file_argument(TSLexer *lexer, bool ends_at_semicolon) {
  return !is_blank(lexer->lookahead) &&
    scan_line_rest(lexer, ends_at_semicolon);
}

static bool scan_unexpected_command_text(
  TSLexer *lexer,
  const bool *valid_symbols,
  TSSymbol *symbol,
  bool consumed
) {
  if (!valid_symbols[UNEXPECTED_COMMAND_TEXT]) {
    return false;
  }
  if (consumed) {
    lexer->mark_end(lexer);
  }
  while (
    !lexer->eof(lexer) &&
    source_character_is_valid(lexer->lookahead) &&
    lexer->lookahead !=
    '\n' &&
    lexer->lookahead !=
    ';' &&
    lexer->lookahead != '}'
  ) {
    consume(lexer);
    consumed = true;
  }
  return consumed &&
    emit_symbol(valid_symbols, UNEXPECTED_COMMAND_TEXT, symbol);
}

enum FlagAfterWriteScan {
  FLAG_AFTER_WRITE_NONE,
  FLAG_AFTER_WRITE_MATCH,
  FLAG_AFTER_WRITE_FALLBACK,
};

static bool is_substitution_flag_character(int32_t character) {
  if (is_digit(character)) {
    return true;
  }

  switch (character) {
  case 'g':
  case 'i':
  case 'p':
  case 'w':
    return true;
  default:
    return false;
  }
}

static enum FlagAfterWriteScan scan_flag_after_write_marker(TSLexer *lexer) {
  if (!is_substitution_flag_character(lexer->lookahead)) {
    return FLAG_AFTER_WRITE_NONE;
  }

  lexer->mark_end(lexer);
  do {
    advance(lexer);
  } while (is_substitution_flag_character(lexer->lookahead));

  return is_blank(lexer->lookahead) ? FLAG_AFTER_WRITE_MATCH
                                    : FLAG_AFTER_WRITE_FALLBACK;
}

enum LiteralScanResult {
  LITERAL_SCAN_NONE,
  LITERAL_SCAN_TOKEN,
  LITERAL_SCAN_INVALID_CHARACTER,
  LITERAL_SCAN_LINE_END,
};

static bool emit_marker(
  TSLexer *lexer,
  const bool *valid_symbols,
  TSSymbol candidate,
  TSSymbol *symbol
) {
  if (!valid_symbols[candidate]) {
    return false;
  }

  lexer->mark_end(lexer);
  if (!lexer->eof(lexer)) {
    advance(lexer);
  }
  *symbol = candidate;
  return true;
}

static bool can_start_address(TSLexer *lexer) {
  return is_digit(lexer->lookahead) ||
    lexer->lookahead ==
    '$' ||
    lexer->lookahead ==
    '/' ||
    lexer->lookahead == '\\';
}

static bool at_command_boundary(TSLexer *lexer) {
  return lexer->eof(lexer) ||
    lexer->lookahead ==
    '\n' ||
    lexer->lookahead ==
    ';' ||
    lexer->lookahead == '}';
}

static TSSymbol missing_command_separator_marker(
  const TSLexer *lexer,
  const bool *valid_symbols
) {
  if (lexer->lookahead == '}') {
    if (valid_symbols[MISSING_SEPARATOR_BEFORE_UNMATCHED_BRACE_MARKER]) {
      return MISSING_SEPARATOR_BEFORE_UNMATCHED_BRACE_MARKER;
    }
    if (valid_symbols[MISSING_COMMAND_SEPARATOR_MARKER]) {
      return MISSING_COMMAND_SEPARATOR_MARKER;
    }
  } else if (
    lexer->eof(lexer) && valid_symbols[INCOMPLETE_COMMAND_SEPARATOR_MARKER]
  ) {
    return INCOMPLETE_COMMAND_SEPARATOR_MARKER;
  }
  return ERROR_SENTINEL;
}

enum PostBlankRecoveryScan {
  POST_BLANK_RECOVERY_SKIPPED,
  POST_BLANK_RECOVERY_TOKEN,
  POST_BLANK_RECOVERY_FAILED,
};

static enum PostBlankRecoveryScan scan_post_blank_recovery(
  TSLexer *lexer,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  if (
    !valid_symbols[OMITTED_ADDRESS_MARKER] &&
    !valid_symbols[INCOMPLETE_OMITTED_ADDRESS_MARKER] &&
    !valid_symbols[BLANKS_AROUND_ADDRESS_SEPARATOR] &&
    !valid_symbols[MISSING_ADDRESS_SEPARATOR_MARKER] &&
    !valid_symbols[MISSING_SEPARATOR_BEFORE_UNMATCHED_BRACE_MARKER] &&
    !valid_symbols[MISSING_COMMAND_SEPARATOR_MARKER] &&
    !valid_symbols[INCOMPLETE_COMMAND_SEPARATOR_MARKER]
  ) {
    return POST_BLANK_RECOVERY_SKIPPED;
  }

  lexer->mark_end(lexer);
  advance_past_blanks(lexer);

  const bool after_separator = valid_symbols[OMITTED_ADDRESS_MARKER] ||
    valid_symbols[INCOMPLETE_OMITTED_ADDRESS_MARKER];

  if (
    valid_symbols[BLANKS_AROUND_ADDRESS_SEPARATOR] &&
    (after_separator ? can_start_address(lexer) : lexer->lookahead == ',')
  ) {
    lexer->mark_end(lexer);
    *symbol = BLANKS_AROUND_ADDRESS_SEPARATOR;
    return POST_BLANK_RECOVERY_TOKEN;
  }
  if (after_separator && !can_start_address(lexer)) {
    *symbol = lexer->eof(lexer) ? INCOMPLETE_OMITTED_ADDRESS_MARKER
                                : OMITTED_ADDRESS_MARKER;
    if (!valid_symbols[*symbol]) {
      return POST_BLANK_RECOVERY_FAILED;
    }
    return POST_BLANK_RECOVERY_TOKEN;
  }
  if (
    valid_symbols[MISSING_ADDRESS_SEPARATOR_MARKER] && can_start_address(lexer)
  ) {
    *symbol = MISSING_ADDRESS_SEPARATOR_MARKER;
    return POST_BLANK_RECOVERY_TOKEN;
  }
  *symbol = missing_command_separator_marker(lexer, valid_symbols);
  return *symbol == ERROR_SENTINEL ? POST_BLANK_RECOVERY_FAILED
                                   : POST_BLANK_RECOVERY_TOKEN;
}

static bool scan_text_token(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  if (lexer->eof(lexer)) {
    if (
      !state->text_line_has_content &&
      emit_marker(lexer, valid_symbols, MISSING_TEXT_MARKER, symbol)
    ) {
      state->text_line_has_content = true;
      return true;
    }
    lexer->mark_end(lexer);
    return end_mode(state, valid_symbols, TEXT_EOF, symbol);
  }

  if (lexer->lookahead == '\n') {
    lexer->mark_end(lexer);
    return end_mode(state, valid_symbols, TEXT_LINE_END, symbol);
  }

  if (!source_character_is_valid(lexer->lookahead)) {
    state->text_line_has_content = true;
    return consume_as(
      lexer,
      valid_symbols,
      source_character_issue_symbol(lexer->lookahead),
      symbol
    );
  }

  if (lexer->lookahead == '\\') {
    consume(lexer);

    if (lexer->eof(lexer)) {
      state->text_line_has_content = true;
      return emit_symbol(valid_symbols, TEXT_UNSPECIFIED_ESCAPE, symbol);
    }
    if (!source_character_is_valid(lexer->lookahead)) {
      state->text_line_has_content = true;
      return emit_symbol(valid_symbols, ESCAPE_PREFIX, symbol);
    }
    if (lexer->lookahead == '\\') {
      consume(lexer);
      state->text_line_has_content = true;
      return emit_symbol(valid_symbols, TEXT_BACKSLASH_ESCAPE, symbol);
    }
    if (lexer->lookahead == '\n') {
      consume(lexer);
      state->text_line_has_content = false;
      return emit_symbol(valid_symbols, TEXT_ESCAPED_NEWLINE, symbol);
    }

    consume(lexer);
    state->text_line_has_content = true;
    return emit_symbol(valid_symbols, TEXT_UNSPECIFIED_ESCAPE, symbol);
  }

  do {
    consume(lexer);
  } while (
    !lexer->eof(lexer) &&
    source_character_is_valid(lexer->lookahead) &&
    lexer->lookahead !=
    '\\' &&
    lexer->lookahead != '\n'
  );
  state->text_line_has_content = true;
  return emit_symbol(valid_symbols, TEXT_LITERAL, symbol);
}

static bool regex_is_inside_bracket(const ScannerState *state) {
  return state->regex_state != REGEX_OUTSIDE_BRACKET;
}

static enum RegexBracketPendingElement
bracket_element_for_character(int32_t character) {
  switch (character) {
  case '.':
    return REGEX_BRACKET_PENDING_DOT;
  case '=':
    return REGEX_BRACKET_PENDING_EQUAL;
  case ':':
    return REGEX_BRACKET_PENDING_COLON;
  default:
    return REGEX_BRACKET_PENDING_OTHER;
  }
}

static void record_bracket_element(
  ScannerState *state,
  enum RegexBracketPendingElement element
) {
  if (state->regex_bracket_element_count == 0) {
    state->regex_bracket_first_element = element;
  }
  if (state->regex_bracket_element_count < 3U) {
    state->regex_bracket_element_count++;
  }
  state->regex_bracket_last_element = element;
}

static void commit_pending_bracket_element(ScannerState *state) {
  if (state->regex_bracket_pending_element == REGEX_BRACKET_PENDING_NONE) {
    return;
  }

  record_bracket_element(state, state->regex_bracket_pending_element);
  state->regex_bracket_pending_element = REGEX_BRACKET_PENDING_NONE;
}

static void
begin_single_bracket_element(ScannerState *state, int32_t character) {
  if (state->regex_bracket_range_pending) {
    record_bracket_element(state, REGEX_BRACKET_PENDING_OTHER);
    state->regex_bracket_range_pending = false;
    return;
  }

  commit_pending_bracket_element(state);
  state->regex_bracket_pending_element =
    bracket_element_for_character(character);
}

static void begin_compound_bracket_element(ScannerState *state) {
  state->regex_bracket_term_has_content = false;
  if (!state->regex_bracket_range_pending) {
    commit_pending_bracket_element(state);
  }
}

static void finish_compound_bracket_element(ScannerState *state) {
  state->regex_bracket_term_state = REGEX_BRACKET_TERM_NONE;
  state->regex_bracket_term_has_content = false;
  if (state->regex_bracket_range_pending) {
    record_bracket_element(state, REGEX_BRACKET_PENDING_OTHER);
    state->regex_bracket_range_pending = false;
    return;
  }

  state->regex_bracket_pending_element = REGEX_BRACKET_PENDING_OTHER;
}

static bool bracket_expression_is_ambiguous(const ScannerState *state) {
  return state->regex_bracket_element_count >=
    3U &&
    state->regex_bracket_first_element >=
    REGEX_BRACKET_PENDING_DOT &&
    state->regex_bracket_first_element == state->regex_bracket_last_element;
}

static void finish_first_bracket_element(ScannerState *state) {
  if (
    state->regex_state ==
    REGEX_BRACKET_FIRST ||
    state->regex_state == REGEX_BRACKET_AFTER_CARET
  ) {
    state->regex_state = REGEX_BRACKET_BODY;
  }
}

static bool
regex_literal_boundary(const ScannerState *state, int32_t character) {
  if (state->regex_state == REGEX_OUTSIDE_BRACKET) {
    switch (character) {
    case '\\':
    case '(':
    case ')':
    case '[':
    case '*':
    case '+':
    case '?':
    case '|':
    case '{':
    case '.':
    case '^':
    case '$':
      return true;
    default:
      return character == state->delimiter;
    }
  }

  switch (character) {
  case '[':
    return true;
  case '^':
    return state->regex_state == REGEX_BRACKET_FIRST;
  case '-':
  case ']':
    return state->regex_state == REGEX_BRACKET_BODY;
  default:
    return false;
  }
}

static enum LiteralScanResult
scan_regex_literal(TSLexer *lexer, ScannerState *state) {
  lexer->mark_end(lexer);

  if (lexer->eof(lexer) || lexer->lookahead == '\n') {
    return LITERAL_SCAN_LINE_END;
  }

  if (regex_literal_boundary(state, lexer->lookahead)) {
    return LITERAL_SCAN_NONE;
  }

  const int32_t character = lexer->lookahead;
  consume(lexer);
  if (regex_is_inside_bracket(state)) {
    begin_single_bracket_element(state, character);
    finish_first_bracket_element(state);
  }
  return source_character_is_valid(character) ? LITERAL_SCAN_TOKEN
                                              : LITERAL_SCAN_INVALID_CHARACTER;
}

static TSSymbol
unterminated_mode_symbol(enum ScannerMode mode, bool at_end_of_source) {
  switch (mode) {
  case MODE_REGEX_ADDRESS:
    return at_end_of_source ? REGEX_UNTERMINATED_ADDRESS
                            : REGEX_LINE_UNTERMINATED_ADDRESS;
  case MODE_SUBSTITUTE_PATTERN:
    return at_end_of_source ? REGEX_UNTERMINATED_SUBSTITUTE
                            : REGEX_LINE_UNTERMINATED_SUBSTITUTE;
  case MODE_SUBSTITUTE_REPLACEMENT:
    return at_end_of_source ? REPLACEMENT_UNTERMINATED
                            : REPLACEMENT_LINE_UNTERMINATED;
  case MODE_TRANSLATE_SOURCE:
    return at_end_of_source ? TRANSLATE_UNTERMINATED_SOURCE
                            : TRANSLATE_LINE_UNTERMINATED_SOURCE;
  case MODE_TRANSLATE_DESTINATION:
    return at_end_of_source ? TRANSLATE_UNTERMINATED_DESTINATION
                            : TRANSLATE_LINE_UNTERMINATED_DESTINATION;
  case MODE_NONE:
  case MODE_TEXT:
    break;
  }
  return ERROR_SENTINEL;
}

static const struct {
  int32_t marker;
  TSSymbol open_symbol;
  TSSymbol close_symbol;
} bracket_terms[] = {
  [REGEX_BRACKET_TERM_COLON] = {':', REGEX_OPEN_COLON, REGEX_COLON_CLOSE},
  [REGEX_BRACKET_TERM_DOT] = {'.', REGEX_OPEN_DOT, REGEX_DOT_CLOSE},
  [REGEX_BRACKET_TERM_EQUAL] = {'=', REGEX_OPEN_EQUAL, REGEX_EQUAL_CLOSE},
};

static enum RegexBracketTermState bracket_term_for_marker(int32_t character) {
  for (
    enum RegexBracketTermState term_state = REGEX_BRACKET_TERM_COLON;
    term_state <= REGEX_BRACKET_TERM_EQUAL;
    term_state++
  ) {
    if (bracket_terms[term_state].marker == character) {
      return term_state;
    }
  }
  return REGEX_BRACKET_TERM_NONE;
}

static bool scan_regex_bracket_opener(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  lexer->mark_end(lexer);
  advance(lexer);

  if (
    valid_symbols[NONPORTABLE_RANGE_END_MARKER] &&
    (lexer->lookahead == ':' || lexer->lookahead == '=')
  ) {
    *symbol = NONPORTABLE_RANGE_END_MARKER;
    return true;
  }

  lexer->mark_end(lexer);

  const enum RegexBracketTermState term_state =
    bracket_term_for_marker(lexer->lookahead);
  if (term_state == REGEX_BRACKET_TERM_NONE) {
    begin_single_bracket_element(state, '[');
    finish_first_bracket_element(state);
    return emit_symbol(valid_symbols, REGEX_BRACKET_LITERAL, symbol);
  }

  begin_compound_bracket_element(state);
  finish_first_bracket_element(state);
  state->regex_bracket_term_state = term_state;
  return emit_symbol(
    valid_symbols,
    bracket_terms[term_state].open_symbol,
    symbol
  );
}

static void record_bracket_term_character(
  uint8_t *character_count,
  int32_t *single_character,
  int32_t character
) {
  if (*character_count == 0) {
    *single_character = character;
  }
  if (*character_count < 2U) {
    (*character_count)++;
  }
}

static bool bracket_meta_character(int32_t character) {
  return character == '-' || character == ']';
}

static TSSymbol regex_bracket_term_content_symbol(
  const ScannerState *state,
  uint8_t character_count,
  int32_t single_character
) {
  if (state->regex_bracket_term_state == REGEX_BRACKET_TERM_COLON) {
    return REGEX_CLASS_NAME;
  }
  if (character_count > 1U) {
    return REGEX_COLL_ELEM_MULTI;
  }
  if (!bracket_meta_character(single_character)) {
    return REGEX_COLL_ELEM_SINGLE;
  }
  return REGEX_META_CHAR;
}

static bool emit_regex_bracket_term_close(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  const TSSymbol closing =
    bracket_terms[state->regex_bracket_term_state].close_symbol;
  lexer->mark_end(lexer);
  if (!lexer->eof(lexer)) {
    finish_compound_bracket_element(state);
  }
  return emit_symbol(valid_symbols, closing, symbol);
}

static bool scan_regex_bracket_term_content(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  const int32_t close_marker =
    bracket_terms[state->regex_bracket_term_state].marker;
  uint8_t character_count = 0;
  int32_t single_character = 0;
  bool stopped_at_close = false;
  bool valid_class_name = true;
  lexer->mark_end(lexer);

  if (!lexer->eof(lexer) && !source_character_is_valid(lexer->lookahead)) {
    state->regex_bracket_term_has_content = true;
    return consume_as(
      lexer,
      valid_symbols,
      source_character_issue_symbol(lexer->lookahead),
      symbol
    );
  }

  for (;;) {
    if (
      lexer->eof(lexer) ||
      lexer->lookahead ==
      '\n' ||
      !source_character_is_valid(lexer->lookahead) ||
      (lexer->lookahead ==
        ']' &&
        state->regex_bracket_term_state == REGEX_BRACKET_TERM_COLON)
    ) {
      break;
    }
    if (lexer->lookahead == close_marker) {
      advance(lexer);
      if (
        lexer->lookahead ==
        ']' ||
        (lexer->eof(lexer) &&
          (character_count >
            0 ||
            state->regex_bracket_term_has_content ||
            state->regex_bracket_term_state == REGEX_BRACKET_TERM_COLON))
      ) {
        stopped_at_close = true;
        break;
      }
      lexer->mark_end(lexer);
      valid_class_name = false;
      record_bracket_term_character(
        &character_count,
        &single_character,
        close_marker
      );
      continue;
    }

    const int32_t character = lexer->lookahead;
    valid_class_name = valid_class_name &&
      (is_letter(character) || (is_digit(character) && character_count > 0));
    consume(lexer);
    record_bracket_term_character(
      &character_count,
      &single_character,
      character
    );
  }

  if (character_count == 0) {
    const TSSymbol closing =
      bracket_terms[state->regex_bracket_term_state].close_symbol;
    if (stopped_at_close && valid_symbols[closing]) {
      return emit_regex_bracket_term_close(lexer, state, valid_symbols, symbol);
    }
    if (!stopped_at_close) {
      finish_compound_bracket_element(state);
    }
    return emit_symbol(valid_symbols, REGEX_MALFORMED_BRACKET_TERM, symbol);
  }
  state->regex_bracket_term_has_content = true;
  const TSSymbol candidate = state->regex_bracket_term_state ==
      REGEX_BRACKET_TERM_COLON &&
      !valid_class_name
    ? REGEX_INVALID_CLASS_NAME
    : regex_bracket_term_content_symbol(
        state,
        character_count,
        single_character
      );
  return emit_symbol(valid_symbols, candidate, symbol);
}

static bool scan_regex_bracket_term_close(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  advance(lexer);
  if (lexer->lookahead != ']' && !lexer->eof(lexer)) {
    return false;
  }
  return emit_regex_bracket_term_close(lexer, state, valid_symbols, symbol);
}

static bool scan_regex_interval_open(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  consume(lexer);
  state->regex_in_interval = true;
  return emit_symbol(valid_symbols, REGEX_INTERVAL_OPEN, symbol);
}

static bool end_interval(
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol candidate,
  TSSymbol *symbol
) {
  state->regex_in_interval = false;
  return emit_symbol(valid_symbols, candidate, symbol);
}

static bool scan_regex_interval_close(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  consume(lexer);
  return end_interval(state, valid_symbols, REGEX_INTERVAL_CLOSE, symbol);
}

#if !SED_REGEX_EXTENDED
static bool
interval_escape_ends_content(const ScannerState *state, int32_t escaped) {
  return (escaped == '}' || escaped == '(' || escaped == ')') &&
    escaped != state->delimiter;
}
#endif

static void finish_malformed_escape(TSLexer *lexer) {
  if (
    !lexer->eof(lexer) &&
    lexer->lookahead !=
    '\n' &&
    source_character_is_valid(lexer->lookahead)
  ) {
    advance(lexer);
  }
  lexer->mark_end(lexer);
}

static void
scan_malformed_interval_content(TSLexer *lexer, const ScannerState *state) {
  for (;;) {
    const int32_t character = lexer->lookahead;
    if (
      lexer->eof(lexer) ||
      !source_character_is_valid(character) ||
      character ==
      '\n' ||
      character ==
      state->delimiter ||
      character == '['
    ) {
      return;
    }
#if SED_REGEX_EXTENDED
    if (
      character ==
      '}' ||
      character ==
      '(' ||
      character ==
      ')' ||
      character == '|'
    ) {
      return;
    }
#endif
    if (character != '\\') {
      consume(lexer);
      continue;
    }

    advance(lexer);
#if !SED_REGEX_EXTENDED
    if (interval_escape_ends_content(state, lexer->lookahead)) {
      return;
    }
#endif
    finish_malformed_escape(lexer);
  }
}

static bool emit_malformed_interval(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  state->regex_in_interval =
    !lexer->eof(lexer) && !source_character_is_valid(lexer->lookahead);
  return emit_symbol(valid_symbols, REGEX_INVALID_INTERVAL, symbol);
}

static bool raw_duplication_symbol_follows(
  const TSLexer *lexer,
  const ScannerState *state
) {
#if SED_REGEX_EXTENDED
  (void)state;
  return lexer->lookahead ==
    '*' ||
    lexer->lookahead ==
    '+' ||
    lexer->lookahead == '?';
#else
  return lexer->lookahead == '*' && !regex_at_branch_start(state);
#endif
}

static TSSymbol regex_duplication_context_marker(
  const TSLexer *lexer,
  const ScannerState *state
) {
  if (regex_at_branch_start(state)) {
    return REGEX_LEADING_DUPLICATION_MARKER;
  }
  if (
    state->regex_position !=
    REGEX_AFTER_DUPLICATION_SYMBOL
#if SED_REGEX_EXTENDED
    && state->regex_position != REGEX_AFTER_REPETITION_MODIFIER
#endif
  ) {
    return ERROR_SENTINEL;
  }
#if SED_REGEX_EXTENDED
  if (
    state->regex_position ==
    REGEX_AFTER_DUPLICATION_SYMBOL &&
    lexer->lookahead == '?'
  ) {
    return ERROR_SENTINEL;
  }
#else
  (void)lexer;
#endif
  return REGEX_ADJACENT_DUPLICATION_MARKER;
}

static bool raw_regex_operator_character(int32_t character) {
  switch (character) {
  case '(':
  case ')':
  case '*':
  case '+':
  case '?':
  case '|':
  case '{':
    return true;
  default:
    return false;
  }
}

static bool scan_raw_regex_operator(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  const int32_t character = lexer->lookahead;

  if (character == '{') {
#if SED_REGEX_EXTENDED
    return scan_regex_interval_open(lexer, state, valid_symbols, symbol);
#else
    return consume_as(lexer, valid_symbols, REGEX_LITERAL, symbol);
#endif
  }

  consume(lexer);

  if (character == '*') {
#if SED_REGEX_EXTENDED
    return emit_symbol(valid_symbols, REGEX_ZERO_OR_MORE, symbol);
#else
    return emit_symbol(
      valid_symbols,
      regex_at_branch_start(state) ? REGEX_LITERAL : REGEX_ZERO_OR_MORE,
      symbol
    );
#endif
  }

#if SED_REGEX_EXTENDED
  if (character == '(') {
    return emit_symbol(valid_symbols, REGEX_GROUP_OPEN, symbol);
  }

  if (character == ')') {
    return emit_symbol(
      valid_symbols,
      state->regex_group_depth > 0 ? REGEX_GROUP_CLOSE : REGEX_LITERAL,
      symbol
    );
  }

  if (character == '|') {
    return emit_symbol(valid_symbols, REGEX_ALTERNATION_OPERATOR, symbol);
  }

  if (character == '+') {
    return emit_symbol(valid_symbols, REGEX_ONE_OR_MORE, symbol);
  }

  if (character == '?') {
    if (
      state->regex_position ==
      REGEX_AFTER_DUPLICATION_SYMBOL &&
      valid_symbols[REGEX_REPETITION_MODIFIER]
    ) {
      return emit_symbol(valid_symbols, REGEX_REPETITION_MODIFIER, symbol);
    }
    return emit_symbol(valid_symbols, REGEX_ZERO_OR_ONE, symbol);
  }
#endif

  return emit_symbol(valid_symbols, REGEX_LITERAL, symbol);
}

static bool regex_delimiter_is_special(int32_t character) {
  switch (character) {
#if SED_REGEX_EXTENDED
  case '(':
  case ')':
  case '+':
  case '?':
  case '{':
  case '|':
#endif
  case '.':
  case '[':
  case '*':
  case '^':
  case '$':
    return true;
  default:
    return false;
  }
}

// The QUOTED_CHAR sequences of XBD 9.5.1 for the selected RE.
static bool escape_quotes_regex_syntax(int32_t character) {
  switch (character) {
#if SED_REGEX_EXTENDED
  case '(':
  case ')':
  case '{':
  case '}':
  case '+':
  case '?':
  case '|':
#endif
  case '.':
  case '*':
  case '^':
  case '$':
  case '[':
  case '\\':
  case ']':
    return true;
  default:
    return false;
  }
}

static bool scan_regex_escaped_delimiter(
  TSLexer *lexer,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  return consume_as(
    lexer,
    valid_symbols,
    regex_delimiter_is_special(lexer->lookahead)
      ? REGEX_SPECIAL_ESCAPED_DELIMITER
      : REGEX_ESCAPED_DELIMITER,
    symbol
  );
}

static bool scan_regex_escape_after_backslash(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  if (lexer->eof(lexer)) {
    return emit_symbol(valid_symbols, REGEX_INCOMPLETE_ESCAPE, symbol);
  }

  if (lexer->lookahead == '\n') {
    return emit_symbol(valid_symbols, REGEX_FORBIDDEN_NEWLINE_ESCAPE, symbol);
  }

  if (!source_character_is_valid(lexer->lookahead)) {
    return emit_symbol(valid_symbols, ESCAPE_PREFIX, symbol);
  }

  if (lexer->lookahead == state->delimiter) {
    return scan_regex_escaped_delimiter(lexer, valid_symbols, symbol);
  }

#if !SED_REGEX_EXTENDED
  if (lexer->lookahead == '}') {
    if (valid_symbols[REGEX_INTERVAL_CLOSE]) {
      return scan_regex_interval_close(lexer, state, valid_symbols, symbol);
    }
    if (valid_symbols[REGEX_UNMATCHED_INTERVAL_CLOSE]) {
      return consume_as(
        lexer,
        valid_symbols,
        REGEX_UNMATCHED_INTERVAL_CLOSE,
        symbol
      );
    }
  }

  if (lexer->lookahead == '(') {
    return consume_as(lexer, valid_symbols, REGEX_GROUP_OPEN, symbol);
  }

  if (lexer->lookahead == ')') {
    return consume_as(
      lexer,
      valid_symbols,
      state->regex_group_depth > 0 ? REGEX_GROUP_CLOSE
                                   : REGEX_UNMATCHED_GROUP_CLOSE,
      symbol
    );
  }

  if (lexer->lookahead >= '1' && lexer->lookahead <= '9') {
    return consume_as(lexer, valid_symbols, REGEX_BACKREFERENCE, symbol);
  }

  if (lexer->lookahead == '{') {
    return scan_regex_interval_open(lexer, state, valid_symbols, symbol);
  }

  if (lexer->lookahead == '|') {
    return consume_as(
      lexer,
      valid_symbols,
      REGEX_BRE_VERTICAL_LINE_ESCAPE,
      symbol
    );
  }

  if (lexer->lookahead == '?' || lexer->lookahead == '+') {
    return consume_as(
      lexer,
      valid_symbols,
      lexer->lookahead == '?' ? REGEX_BRE_QUESTION_MARK_ESCAPE
                              : REGEX_BRE_PLUS_ESCAPE,
      symbol
    );
  }
#endif

  if (lexer->lookahead == 'n') {
    return consume_as(lexer, valid_symbols, REGEX_NEWLINE_ESCAPE, symbol);
  }

  return consume_as(
    lexer,
    valid_symbols,
    escape_quotes_regex_syntax(lexer->lookahead) ? REGEX_QUOTED_ESCAPE
                                                 : REGEX_NONPORTABLE_ESCAPE,
    symbol
  );
}

#if !SED_REGEX_EXTENDED
static bool scan_regex_after_backslash(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  if (
    lexer->lookahead ==
    ')' &&
    state->delimiter !=
    ')' &&
    valid_symbols[EMPTY_SUBEXPRESSION_MARKER]
  ) {
    *symbol = EMPTY_SUBEXPRESSION_MARKER;
    return true;
  }

  lexer->mark_end(lexer);
  return scan_regex_escape_after_backslash(lexer, state, valid_symbols, symbol);
}
#endif

static bool scan_regex_dup_count(
  TSLexer *lexer,
  const ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  do {
    consume(lexer);
  } while (is_digit(lexer->lookahead) && lexer->lookahead != state->delimiter);

  return emit_symbol(valid_symbols, REGEX_DUP_COUNT, symbol);
}

#if SED_REGEX_EXTENDED
static bool scan_empty_regex_construct(
  TSLexer *lexer,
  const ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  if (
    state->regex_group_depth >
    0 &&
    lexer->lookahead ==
    ')' &&
    valid_symbols[EMPTY_SUBEXPRESSION_MARKER]
  ) {
    return emit_marker(
      lexer,
      valid_symbols,
      EMPTY_SUBEXPRESSION_MARKER,
      symbol
    );
  }
  if (
    valid_symbols[EMPTY_ALTERNATIVE_MARKER] &&
    (lexer->lookahead ==
      '|' ||
      (state->regex_group_depth > 0 && lexer->lookahead == ')'))
  ) {
    return emit_marker(lexer, valid_symbols, EMPTY_ALTERNATIVE_MARKER, symbol);
  }
  return false;
}
#endif

static bool scan_regex_special_token(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  if (lexer->lookahead == '^') {
    consume(lexer);
#if !SED_REGEX_EXTENDED
    if (
      !regex_at_branch_start(state) ||
      state->regex_position == REGEX_AFTER_ANCHOR
    ) {
      return emit_symbol(valid_symbols, REGEX_LITERAL, symbol);
    }
    if (state->regex_group_depth > 0) {
      return emit_symbol(valid_symbols, REGEX_BRE_SUBEXPRESSION_CARET, symbol);
    }
#endif
    return emit_symbol(valid_symbols, REGEX_BEGINNING_ANCHOR, symbol);
  }

  if (lexer->lookahead == '$') {
    consume(lexer);
#if !SED_REGEX_EXTENDED
    if (lexer->lookahead == '\\') {
      advance(lexer);
      const bool closes_subexpression = state->regex_group_depth >
        0 &&
        lexer->lookahead ==
        ')' &&
        state->delimiter != ')';
      return emit_symbol(
        valid_symbols,
        closes_subexpression ? REGEX_BRE_SUBEXPRESSION_DOLLAR : REGEX_LITERAL,
        symbol
      );
    }
    const bool at_branch_end = lexer->eof(lexer) ||
      lexer->lookahead ==
      '\n' ||
      lexer->lookahead == state->delimiter;
    if (!lexer->eof(lexer)) {
      advance(lexer);
    }
    if (!at_branch_end) {
      return emit_symbol(valid_symbols, REGEX_LITERAL, symbol);
    }
#endif
    return emit_symbol(valid_symbols, REGEX_END_ANCHOR, symbol);
  }

  if (lexer->lookahead == '.') {
    return consume_as(lexer, valid_symbols, REGEX_PERIOD, symbol);
  }

  if (lexer->lookahead == '\\') {
    consume(lexer);
    return scan_regex_escape_after_backslash(
      lexer,
      state,
      valid_symbols,
      symbol
    );
  }

  if (raw_regex_operator_character(lexer->lookahead)) {
    return scan_raw_regex_operator(lexer, state, valid_symbols, symbol);
  }

  if (lexer->lookahead == '[') {
    consume(lexer);
    reset_bracket_tracking(state);
    state->regex_state = REGEX_BRACKET_FIRST;
    return emit_symbol(valid_symbols, REGEX_BRACKET_OPEN, symbol);
  }

  return false;
}

static bool scan_regex_bracket_close(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  commit_pending_bracket_element(state);
  if (
    bracket_expression_is_ambiguous(state) &&
    valid_symbols[AMBIGUOUS_BRACKET_EXPRESSION_MARKER]
  ) {
    lexer->mark_end(lexer);
    *symbol = AMBIGUOUS_BRACKET_EXPRESSION_MARKER;
    return true;
  }

  consume(lexer);
  state->regex_state = REGEX_OUTSIDE_BRACKET;
  reset_bracket_tracking(state);
  return emit_symbol(valid_symbols, REGEX_BRACKET_CLOSE, symbol);
}

static bool scan_regex_bracket_hyphen(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  lexer->mark_end(lexer);
  advance(lexer);
  if (
    valid_symbols[NONPORTABLE_RANGE_START_MARKER] &&
    !lexer->eof(lexer) &&
    lexer->lookahead !=
    '\n' &&
    lexer->lookahead != ']'
  ) {
    *symbol = NONPORTABLE_RANGE_START_MARKER;
    return true;
  }
  lexer->mark_end(lexer);

  TSSymbol candidate;
  if (valid_symbols[REGEX_BRACKET_RANGE_END_HYPHEN]) {
    candidate = REGEX_BRACKET_RANGE_END_HYPHEN;
  } else if (
    lexer->eof(lexer) || lexer->lookahead == '\n' || lexer->lookahead == ']'
  ) {
    candidate = REGEX_BRACKET_TRAILING_HYPHEN;
  } else {
    candidate = REGEX_BRACKET_HYPHEN;
  }
  if (emit_symbol(valid_symbols, candidate, symbol)) {
    if (candidate == REGEX_BRACKET_RANGE_END_HYPHEN) {
      state->regex_bracket_pending_element = REGEX_BRACKET_PENDING_NONE;
      state->regex_bracket_range_pending = false;
      record_bracket_element(state, REGEX_BRACKET_PENDING_OTHER);
    } else if (candidate == REGEX_BRACKET_TRAILING_HYPHEN) {
      commit_pending_bracket_element(state);
      record_bracket_element(state, REGEX_BRACKET_PENDING_OTHER);
    } else {
      state->regex_bracket_pending_element = REGEX_BRACKET_PENDING_NONE;
      state->regex_bracket_range_pending = true;
    }
    return true;
  }
  if (emit_symbol(valid_symbols, REGEX_SHARED_RANGE_ENDPOINT, symbol)) {
    commit_pending_bracket_element(state);
    state->regex_bracket_range_pending = false;
    return true;
  }
  return false;
}

static bool scan_regex_bracket_special_token(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  if (state->regex_state == REGEX_BRACKET_FIRST && lexer->lookahead == '^') {
    consume(lexer);
    state->regex_state = REGEX_BRACKET_AFTER_CARET;
    return emit_symbol(valid_symbols, REGEX_BRACKET_NEGATION, symbol);
  }

  if (state->regex_state == REGEX_BRACKET_BODY && lexer->lookahead == ']') {
    return scan_regex_bracket_close(lexer, state, valid_symbols, symbol);
  }

  if (state->regex_state == REGEX_BRACKET_BODY && lexer->lookahead == '-') {
    return scan_regex_bracket_hyphen(lexer, state, valid_symbols, symbol);
  }

  if (lexer->lookahead == '[') {
    return scan_regex_bracket_opener(lexer, state, valid_symbols, symbol);
  }

  return false;
}

static bool scan_regex_token(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  const TSSymbol marker = regex_duplication_context_marker(lexer, state);
  if (marker != ERROR_SENTINEL && valid_symbols[marker]) {
    lexer->mark_end(lexer);
#if SED_REGEX_EXTENDED
    if (
      raw_duplication_symbol_follows(lexer, state) || lexer->lookahead == '{'
    ) {
      *symbol = marker;
      return true;
    }
#else
    if (raw_duplication_symbol_follows(lexer, state)) {
      *symbol = marker;
      return true;
    }
    if (lexer->lookahead == '\\') {
      advance(lexer);
      if (lexer->lookahead == '{' && state->delimiter != '{') {
        *symbol = marker;
        return true;
      }
      return scan_regex_after_backslash(lexer, state, valid_symbols, symbol);
    }
#endif
  }

#if SED_REGEX_EXTENDED
  if (scan_empty_regex_construct(lexer, state, valid_symbols, symbol)) {
    return true;
  }
#endif

  if (
    state->regex_in_interval &&
    !lexer->eof(lexer) &&
    !source_character_is_valid(lexer->lookahead)
  ) {
    return consume_as(
      lexer,
      valid_symbols,
      source_character_issue_symbol(lexer->lookahead),
      symbol
    );
  }

  if (valid_symbols[REGEX_DUP_COUNT] && is_digit(lexer->lookahead)) {
    return scan_regex_dup_count(lexer, state, valid_symbols, symbol);
  }

  if (valid_symbols[REGEX_INTERVAL_SEPARATOR] && lexer->lookahead == ',') {
    consume(lexer);
    *symbol = REGEX_INTERVAL_SEPARATOR;
    return true;
  }

#if SED_REGEX_EXTENDED
  if (valid_symbols[REGEX_INTERVAL_CLOSE] && lexer->lookahead == '}') {
    return scan_regex_interval_close(lexer, state, valid_symbols, symbol);
  }
#else
  if (state->regex_in_interval && lexer->lookahead == '\\') {
    lexer->mark_end(lexer);
    advance(lexer);
    if (
      valid_symbols[REGEX_INTERVAL_CLOSE] &&
      lexer->lookahead ==
      '}' &&
      lexer->lookahead != state->delimiter
    ) {
      return scan_regex_interval_close(lexer, state, valid_symbols, symbol);
    }
    if (
      lexer->eof(lexer) &&
      state->delimiter !=
      '}' &&
      valid_symbols[REGEX_INTERVAL_CLOSE] &&
      valid_symbols[REGEX_INCOMPLETE_INTERVAL]
    ) {
      lexer->mark_end(lexer);
      return end_interval(
        state,
        valid_symbols,
        REGEX_INCOMPLETE_INTERVAL,
        symbol
      );
    }
    if (!interval_escape_ends_content(state, lexer->lookahead)) {
      finish_malformed_escape(lexer);
      scan_malformed_interval_content(lexer, state);
    }
    return emit_malformed_interval(lexer, state, valid_symbols, symbol);
  }
#endif

  if (state->regex_in_interval && valid_symbols[REGEX_INVALID_INTERVAL]) {
    lexer->mark_end(lexer);
    scan_malformed_interval_content(lexer, state);
    return emit_malformed_interval(lexer, state, valid_symbols, symbol);
  }

  const bool inside_bracket = regex_is_inside_bracket(state);
  if (inside_bracket) {
    if (
      valid_symbols[REGEX_CLASS_NAME] ||
      valid_symbols[REGEX_INVALID_CLASS_NAME] ||
      valid_symbols[REGEX_COLL_ELEM_SINGLE] ||
      valid_symbols[REGEX_COLL_ELEM_MULTI] ||
      valid_symbols[REGEX_META_CHAR]
    ) {
      return scan_regex_bracket_term_content(
        lexer,
        state,
        valid_symbols,
        symbol
      );
    }
    if (
      state->regex_bracket_term_state !=
      REGEX_BRACKET_TERM_NONE &&
      lexer->lookahead ==
      ']' &&
      valid_symbols[REGEX_MALFORMED_BRACKET_TERM]
    ) {
      lexer->mark_end(lexer);
      finish_compound_bracket_element(state);
      *symbol = REGEX_MALFORMED_BRACKET_TERM;
      return true;
    }
    if (
      state->regex_bracket_term_state !=
      REGEX_BRACKET_TERM_NONE &&
      valid_symbols[bracket_terms[state->regex_bracket_term_state]
          .close_symbol] &&
      lexer->lookahead == bracket_terms[state->regex_bracket_term_state].marker
    ) {
      return scan_regex_bracket_term_close(lexer, state, valid_symbols, symbol);
    }
  }

  const int32_t character = lexer->lookahead;
  const enum LiteralScanResult literal_result =
    scan_regex_literal(lexer, state);
  if (literal_result == LITERAL_SCAN_INVALID_CHARACTER) {
    return emit_symbol(
      valid_symbols,
      source_character_issue_symbol(character),
      symbol
    );
  }
  if (literal_result == LITERAL_SCAN_TOKEN) {
    return emit_symbol(
      valid_symbols,
      inside_bracket ? REGEX_BRACKET_LITERAL : REGEX_LITERAL,
      symbol
    );
  }
  if (literal_result == LITERAL_SCAN_LINE_END) {
    return end_mode(
      state,
      valid_symbols,
      unterminated_mode_symbol(state->mode, lexer->eof(lexer)),
      symbol
    );
  }

  if (state->regex_state == REGEX_OUTSIDE_BRACKET) {
    return scan_regex_special_token(lexer, state, valid_symbols, symbol);
  }
  return scan_regex_bracket_special_token(lexer, state, valid_symbols, symbol);
}

static enum LiteralScanResult scan_operand_literal(
  TSLexer *lexer,
  const ScannerState *state,
  bool ampersand_is_special
) {
  bool consumed = false;
  lexer->mark_end(lexer);

  for (;;) {
    if (lexer->eof(lexer) || lexer->lookahead == '\n') {
      return consumed ? LITERAL_SCAN_TOKEN : LITERAL_SCAN_LINE_END;
    }

    if (!source_character_is_valid(lexer->lookahead)) {
      return consumed ? LITERAL_SCAN_TOKEN : LITERAL_SCAN_INVALID_CHARACTER;
    }

    if (
      lexer->lookahead ==
      state->delimiter ||
      lexer->lookahead ==
      '\\' ||
      (ampersand_is_special && lexer->lookahead == '&')
    ) {
      if (consumed && lexer->lookahead == state->delimiter) {
        advance(lexer);
      }
      return consumed ? LITERAL_SCAN_TOKEN : LITERAL_SCAN_NONE;
    }

    consume(lexer);
    consumed = true;
  }
}

static bool scan_replacement_escape(
  TSLexer *lexer,
  const ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  consume(lexer);

  if (lexer->eof(lexer)) {
    return emit_symbol(valid_symbols, REPLACEMENT_INCOMPLETE_ESCAPE, symbol);
  }

  if (!source_character_is_valid(lexer->lookahead)) {
    return emit_symbol(valid_symbols, ESCAPE_PREFIX, symbol);
  }

  if (lexer->lookahead == '\n') {
    return consume_as(
      lexer,
      valid_symbols,
      REPLACEMENT_ESCAPED_NEWLINE,
      symbol
    );
  }

  TSSymbol candidate = REPLACEMENT_ESCAPE_SEQUENCE;
  if (
    lexer->lookahead !=
    state->delimiter &&
    lexer->lookahead !=
    '&' &&
    lexer->lookahead !=
    '\\' &&
    !is_digit(lexer->lookahead)
  ) {
    return consume_as(
      lexer,
      valid_symbols,
      REPLACEMENT_NONPORTABLE_ESCAPE,
      symbol
    );
  }
  if (lexer->lookahead == state->delimiter) {
    candidate = state->delimiter == '&'
      ? REPLACEMENT_AMPERSAND_ESCAPED_DELIMITER
      : REPLACEMENT_ESCAPED_DELIMITER;
  } else if (is_digit(lexer->lookahead)) {
    candidate = REPLACEMENT_BACKREFERENCE;
  }

  return consume_as(lexer, valid_symbols, candidate, symbol);
}

static bool scan_translate_escape(
  TSLexer *lexer,
  const ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  consume(lexer);

  if (lexer->eof(lexer)) {
    return emit_symbol(valid_symbols, TRANSLATE_INCOMPLETE_ESCAPE, symbol);
  }

  if (!source_character_is_valid(lexer->lookahead)) {
    return emit_symbol(valid_symbols, ESCAPE_PREFIX, symbol);
  }

  if (lexer->lookahead == '\n') {
    return emit_symbol(valid_symbols, TRANSLATE_NONPORTABLE_ESCAPE, symbol);
  }

  TSSymbol candidate;
  if (lexer->lookahead == 'n' || lexer->lookahead == '\\') {
    candidate = TRANSLATE_ESCAPE;
  } else if (lexer->lookahead == state->delimiter) {
    candidate = TRANSLATE_ESCAPED_DELIMITER;
  } else {
    candidate = TRANSLATE_NONPORTABLE_ESCAPE;
  }
  return consume_as(lexer, valid_symbols, candidate, symbol);
}

static bool scan_operand_token(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  const bool is_replacement = state->mode == MODE_SUBSTITUTE_REPLACEMENT;
  const enum LiteralScanResult literal_result =
    scan_operand_literal(lexer, state, is_replacement);
  if (literal_result == LITERAL_SCAN_TOKEN) {
    return emit_symbol(
      valid_symbols,
      is_replacement ? REPLACEMENT_LITERAL : TRANSLATE_LITERAL,
      symbol
    );
  }
  if (literal_result == LITERAL_SCAN_INVALID_CHARACTER) {
    return consume_as(
      lexer,
      valid_symbols,
      source_character_issue_symbol(lexer->lookahead),
      symbol
    );
  }
  if (literal_result == LITERAL_SCAN_LINE_END) {
    return end_mode(
      state,
      valid_symbols,
      unterminated_mode_symbol(state->mode, lexer->eof(lexer)),
      symbol
    );
  }

  if (lexer->lookahead == '\\') {
    return is_replacement
      ? scan_replacement_escape(lexer, state, valid_symbols, symbol)
      : scan_translate_escape(lexer, state, valid_symbols, symbol);
  }

  if (is_replacement && lexer->lookahead == '&') {
    return consume_as(
      lexer,
      valid_symbols,
      REPLACEMENT_MATCH_REFERENCE,
      symbol
    );
  }

  return false;
}

static bool scan_regex_recovery_marker(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  const bool at_line_boundary = lexer->eof(lexer) || lexer->lookahead == '\n';
  const bool at_regex_end =
    at_line_boundary || lexer->lookahead == state->delimiter;

  if (
    state->regex_state ==
    REGEX_OUTSIDE_BRACKET &&
    state->regex_group_depth >
    0 &&
#if SED_REGEX_EXTENDED
    state->regex_position !=
    REGEX_AFTER_ALTERNATION &&
#endif
    at_regex_end &&
    emit_marker(
      lexer,
      valid_symbols,
      lexer->eof(lexer) ? MISSING_SUBEXPRESSION_MARKER
                        : MISSING_SUBEXPRESSION_PLACEHOLDER_MARKER,
      symbol
    )
  ) {
    return true;
  }

  if (
    (state->regex_state ==
      REGEX_BRACKET_FIRST ||
      state->regex_state == REGEX_BRACKET_AFTER_CARET) &&
    at_line_boundary &&
    emit_marker(
      lexer,
      valid_symbols,
      lexer->eof(lexer) ? INCOMPLETE_BRACKET_LIST_MARKER
                        : MISSING_BRACKET_LIST_MARKER,
      symbol
    )
  ) {
    return true;
  }

  if (
    state->regex_bracket_term_state !=
    REGEX_BRACKET_TERM_NONE &&
    at_line_boundary &&
    emit_marker(
      lexer,
      valid_symbols,
      lexer->eof(lexer) ? REGEX_INCOMPLETE_BRACKET_TERM
                        : REGEX_MALFORMED_BRACKET_TERM,
      symbol
    )
  ) {
    finish_compound_bracket_element(state);
    return true;
  }

  if (
    regex_is_inside_bracket(state) &&
    at_line_boundary &&
    emit_marker(
      lexer,
      valid_symbols,
      lexer->eof(lexer) ? INCOMPLETE_BRACKET_EXPRESSION_MARKER
                        : UNCLOSED_BRACKET_EXPRESSION_MARKER,
      symbol
    )
  ) {
    state->regex_state = REGEX_OUTSIDE_BRACKET;
    reset_bracket_tracking(state);
    return true;
  }

#if SED_REGEX_EXTENDED
  if (
    state->regex_state ==
    REGEX_OUTSIDE_BRACKET &&
    state->regex_position ==
    REGEX_AFTER_ALTERNATION &&
    at_regex_end &&
    emit_marker(
      lexer,
      valid_symbols,
      lexer->eof(lexer) ? INCOMPLETE_ALTERNATIVE_MARKER
                        : EMPTY_ALTERNATIVE_MARKER,
      symbol
    )
  ) {
    state->regex_position = REGEX_AT_BRANCH_START;
    return true;
  }
#endif

  if (
    state->regex_in_interval &&
    at_regex_end &&
    emit_marker(
      lexer,
      valid_symbols,
      lexer->eof(lexer) && state->delimiter != '}' ? REGEX_INCOMPLETE_INTERVAL
                                                   : REGEX_INVALID_INTERVAL,
      symbol
    )
  ) {
    state->regex_in_interval = false;
    return true;
  }

  if (
    state->regex_state ==
    REGEX_OUTSIDE_BRACKET &&
    state->regex_group_depth >
    0 &&
    at_line_boundary &&
    emit_marker(
      lexer,
      valid_symbols,
      lexer->eof(lexer) && state->delimiter != ')' ? REGEX_INCOMPLETE_GROUP
                                                   : REGEX_UNCLOSED_GROUP,
      symbol
    )
  ) {
    state->regex_group_depth--;
    return true;
  }

  return false;
}

static TSSymbol missing_text_introducer_symbol(const TSLexer *lexer) {
  return lexer->eof(lexer) ? MISSING_TEXT_INTRODUCER_MARKER
                           : NONCONFORMING_MISSING_TEXT_INTRODUCER_MARKER;
}

static bool
scan_right_brace(TSLexer *lexer, const bool *valid_symbols, TSSymbol *symbol) {
  skip_blanks(lexer);

  if (lexer->lookahead == '}') {
    consume(lexer);
    *symbol = RIGHT_BRACE;
    return true;
  }
  if (lexer->eof(lexer)) {
    return emit_marker(
      lexer,
      valid_symbols,
      MISSING_CLOSING_BRACE_MARKER,
      symbol
    );
  }
  return false;
}

static bool scan_command_recovery(
  TSLexer *lexer,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  if (
    lexer->lookahead ==
    ',' &&
    emit_marker(lexer, valid_symbols, OMITTED_FIRST_ADDRESS_MARKER, symbol)
  ) {
    return true;
  }

  if (
    (valid_symbols[OMITTED_ADDRESS_MARKER] ||
      valid_symbols[INCOMPLETE_OMITTED_ADDRESS_MARKER]) &&
    !can_start_address(lexer) &&
    !is_blank(lexer->lookahead)
  ) {
    return emit_marker(
      lexer,
      valid_symbols,
      lexer->eof(lexer) ? INCOMPLETE_OMITTED_ADDRESS_MARKER
                        : OMITTED_ADDRESS_MARKER,
      symbol
    );
  }

  if (is_blank(lexer->lookahead)) {
    switch (scan_post_blank_recovery(lexer, valid_symbols, symbol)) {
    case POST_BLANK_RECOVERY_TOKEN:
      return true;
    case POST_BLANK_RECOVERY_FAILED:
      return scan_unexpected_command_text(lexer, valid_symbols, symbol, true);
    case POST_BLANK_RECOVERY_SKIPPED:
      break;
    }
  }

  if (
    !at_command_boundary(lexer) &&
    !is_blank(lexer->lookahead) &&
    emit_marker(lexer, valid_symbols, OMITTED_FILE_SEPARATOR_MARKER, symbol)
  ) {
    return true;
  }

  if (at_command_boundary(lexer)) {
    static const TSSymbol boundary_markers[][2] = {
      {MISSING_FUNCTION_MARKER, NONCONFORMING_MISSING_FUNCTION_MARKER},
      {MISSING_LABEL_MARKER, NONCONFORMING_MISSING_LABEL_MARKER},
      {MISSING_RFILE_MARKER, NONCONFORMING_MISSING_RFILE_MARKER},
      {MISSING_WFILE_MARKER, NONCONFORMING_MISSING_WFILE_MARKER},
    };
    const unsigned variant = lexer->eof(lexer) ? 0 : 1;
    for (
      unsigned index = 0;
      index < sizeof(boundary_markers) / sizeof(boundary_markers[0]);
      index++
    ) {
      if (
        emit_marker(
          lexer,
          valid_symbols,
          boundary_markers[index][variant],
          symbol
        )
      ) {
        return true;
      }
    }
  }

  if (
    emit_marker(
      lexer,
      valid_symbols,
      missing_text_introducer_symbol(lexer),
      symbol
    )
  ) {
    return true;
  }

  if (
    lexer->eof(lexer) &&
    emit_marker(lexer, valid_symbols, MISSING_CLOSING_BRACE_MARKER, symbol)
  ) {
    return true;
  }

  if (
    !at_command_boundary(lexer) &&
    !is_blank(lexer->lookahead) &&
    emit_marker(
      lexer,
      valid_symbols,
      MISSING_SEPARATOR_AFTER_UNMATCHED_BRACE_MARKER,
      symbol
    )
  ) {
    return true;
  }

  const TSSymbol separator_marker =
    missing_command_separator_marker(lexer, valid_symbols);
  if (separator_marker != ERROR_SENTINEL) {
    return emit_marker(lexer, valid_symbols, separator_marker, symbol);
  }

  const TSSymbol missing_opening_delimiter = lexer->eof(lexer)
    ? MISSING_OPENING_DELIMITER_MARKER
    : NONCONFORMING_MISSING_OPENING_DELIMITER_MARKER;
  if (
    delimiter_is_missing(lexer) &&
    emit_marker(lexer, valid_symbols, missing_opening_delimiter, symbol)
  ) {
    return true;
  }

  return scan_unexpected_command_text(lexer, valid_symbols, symbol, false);
}

static bool scan_command_token(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  if (valid_symbols[BLOCK_TRAILING_BLANKS] && is_blank(lexer->lookahead)) {
    advance_past_blanks(lexer);
    lexer->mark_end(lexer);
    *symbol = BLOCK_TRAILING_BLANKS;
    return true;
  }

  if (
    valid_symbols[EMPTY_COMMAND_MARKER] &&
    (lexer->lookahead == ';' || lexer->lookahead == '\n')
  ) {
    return emit_marker(lexer, valid_symbols, EMPTY_COMMAND_MARKER, symbol);
  }

  if (
    valid_symbols[NUL_CHARACTER] && !lexer->eof(lexer) && lexer->lookahead == 0
  ) {
    return consume_as(lexer, valid_symbols, NUL_CHARACTER, symbol);
  }

  if (
    valid_symbols[INVALID_CHARACTER] &&
    !lexer->eof(lexer) &&
    !source_character_is_decoded(lexer->lookahead)
  ) {
    return consume_as(lexer, valid_symbols, INVALID_CHARACTER, symbol);
  }

  if (
    valid_symbols[SUBSTITUTION_WFILE_CONTINUATION] &&
    scan_line_rest(lexer, true)
  ) {
    *symbol = SUBSTITUTION_WFILE_CONTINUATION;
    return true;
  }

  if (valid_symbols[LINE_WORD] && scan_line_rest(lexer, false)) {
    *symbol = LINE_WORD;
    return true;
  }

  // Read label separators before recovery markers can claim the space in
  // front of a label starting with '}'.
  if (valid_symbols[ARGUMENT_SEPARATOR] && lexer->lookahead == ' ') {
    consume(lexer);
    *symbol = ARGUMENT_SEPARATOR;
    return true;
  }

  if (valid_symbols[FLAG_AFTER_WRITE_MARKER]) {
    switch (scan_flag_after_write_marker(lexer)) {
    case FLAG_AFTER_WRITE_MATCH:
      *symbol = FLAG_AFTER_WRITE_MARKER;
      return true;
    case FLAG_AFTER_WRITE_FALLBACK:
      return emit_symbol(valid_symbols, OMITTED_FILE_SEPARATOR_MARKER, symbol);
    case FLAG_AFTER_WRITE_NONE:
      break;
    }
  }

  if (
    valid_symbols[SUBSTITUTION_WFILE_ARGUMENT] &&
    scan_file_argument(lexer, true)
  ) {
    *symbol = SUBSTITUTION_WFILE_ARGUMENT;
    return true;
  }

  if (valid_symbols[FILE_ARGUMENT] && scan_file_argument(lexer, false)) {
    *symbol = FILE_ARGUMENT;
    return true;
  }

  if (
    valid_symbols[INVALID_SUBSTITUTION_FLAG] &&
    !at_command_boundary(lexer) &&
    !is_blank(lexer->lookahead) &&
    !is_substitution_flag_character(lexer->lookahead)
  ) {
    consume(lexer);
    *symbol = INVALID_SUBSTITUTION_FLAG;
    return true;
  }

  if (
    valid_symbols[INVALID_SUBSTITUTION_FLAG] &&
    is_substitution_flag_character(lexer->lookahead)
  ) {
    return false;
  }

  if (valid_symbols[TEXT_COMMAND_START] && lexer->lookahead == '\\') {
    if (scan_text_command_start(lexer, state)) {
      *symbol = TEXT_COMMAND_START;
      return true;
    }
    if (lexer->eof(lexer)) {
      lexer->mark_end(lexer);
      return emit_symbol(valid_symbols, TEXT_INCOMPLETE_INTRODUCER, symbol);
    }
    return emit_symbol(
      valid_symbols,
      NONCONFORMING_MISSING_TEXT_INTRODUCER_MARKER,
      symbol
    );
  }

  if (valid_symbols[DEFAULT_OUTPUT_SUPPRESSION] && lexer->lookahead == 'n') {
    consume(lexer);
    *symbol = DEFAULT_OUTPUT_SUPPRESSION;
    return true;
  }

  if (valid_symbols[COMMENT_TEXT] && scan_line_rest(lexer, false)) {
    *symbol = COMMENT_TEXT;
    return true;
  }

  if (
    can_start_address(lexer) &&
    emit_marker(lexer, valid_symbols, MISSING_ADDRESS_SEPARATOR_MARKER, symbol)
  ) {
    return true;
  }

  if (
    valid_symbols[RESERVED_UNKNOWN_FUNCTION_TOKEN] && can_start_address(lexer)
  ) {
    consume(lexer);
    *symbol = RESERVED_UNKNOWN_FUNCTION_TOKEN;
    return true;
  }

  static const struct {
    TSSymbol symbol;
    enum ScannerMode mode;
    int32_t required_delimiter;
  } delimited_openers[] = {
    {REGEX_ADDRESS_START, MODE_REGEX_ADDRESS, '/'},
    {ESCAPED_REGEX_ADDRESS_START, MODE_REGEX_ADDRESS, 0},
    {SUBSTITUTE_START, MODE_SUBSTITUTE_PATTERN, 0},
    {TRANSLATE_START, MODE_TRANSLATE_SOURCE, 0},
  };
  for (
    unsigned index = 0;
    index < sizeof(delimited_openers) / sizeof(delimited_openers[0]);
    index++
  ) {
    const int32_t required = delimited_openers[index].required_delimiter;
    if (
      valid_symbols[delimited_openers[index].symbol] &&
      (required == 0 || lexer->lookahead == required) &&
      scan_simple_delimiter(lexer, state, delimited_openers[index].mode)
    ) {
      *symbol = delimited_openers[index].symbol;
      return true;
    }
  }

  if (
    valid_symbols[RIGHT_BRACE] &&
    (is_blank(lexer->lookahead) || lexer->lookahead == '}')
  ) {
    return scan_right_brace(lexer, valid_symbols, symbol);
  }

  return scan_command_recovery(lexer, valid_symbols, symbol);
}

static bool sed_scanner_scan_impl(
  ScannerState *state,
  TSLexer *lexer,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  if (valid_symbols[ERROR_SENTINEL]) {
    return false;
  }

  if (state->mode == MODE_TEXT) {
    return scan_text_token(lexer, state, valid_symbols, symbol);
  }

  if (
    is_regex_mode(state->mode) &&
    scan_regex_recovery_marker(lexer, state, valid_symbols, symbol)
  ) {
    return true;
  }

  const bool delimiter_is_active = state->mode !=
    MODE_NONE &&
    lexer->lookahead ==
    state->delimiter &&
    (!is_regex_mode(state->mode) ||
      state->regex_state == REGEX_OUTSIDE_BRACKET);
  if (delimiter_is_active) {
    if (
      state->regex_group_depth >
      0 &&
      emit_marker(lexer, valid_symbols, REGEX_UNCLOSED_GROUP, symbol)
    ) {
      state->regex_group_depth--;
      return true;
    }
    return scan_active_mode_delimiter(lexer, state, valid_symbols, symbol);
  }

  switch (state->mode) {
  case MODE_REGEX_ADDRESS:
  case MODE_SUBSTITUTE_PATTERN:
    return scan_regex_token(lexer, state, valid_symbols, symbol);
  case MODE_SUBSTITUTE_REPLACEMENT:
  case MODE_TRANSLATE_SOURCE:
  case MODE_TRANSLATE_DESTINATION:
    return scan_operand_token(lexer, state, valid_symbols, symbol);
  case MODE_TEXT:
    return false;
  case MODE_NONE:
    break;
  }

  return scan_command_token(lexer, state, valid_symbols, symbol);
}

static void
update_regex_position_after_symbol(ScannerState *state, TSSymbol symbol) {
  if (!is_regex_mode(state->mode)) {
    return;
  }

  switch (symbol) {
  case REGEX_GROUP_OPEN:
    state->regex_group_depth++;
    state->regex_position = REGEX_AT_BRANCH_START;
    return;
  case REGEX_GROUP_CLOSE:
    state->regex_group_depth--;
    state->regex_position = REGEX_AFTER_ATOM;
    return;
#if SED_REGEX_EXTENDED
  case REGEX_ALTERNATION_OPERATOR:
    state->regex_position = REGEX_AFTER_ALTERNATION;
    return;
#endif
  case REGEX_BEGINNING_ANCHOR:
  case REGEX_END_ANCHOR:
#if !SED_REGEX_EXTENDED
  case REGEX_BRE_SUBEXPRESSION_CARET:
  case REGEX_BRE_SUBEXPRESSION_DOLLAR:
#endif
#if SED_REGEX_EXTENDED
    state->regex_position = REGEX_AT_BRANCH_START;
#else
    state->regex_position = REGEX_AFTER_ANCHOR;
#endif
    return;
  case REGEX_ZERO_OR_MORE:
  case REGEX_INTERVAL_CLOSE:
  case REGEX_INVALID_INTERVAL:
#if SED_REGEX_EXTENDED
  case REGEX_ONE_OR_MORE:
  case REGEX_ZERO_OR_ONE:
#endif
    state->regex_position = REGEX_AFTER_DUPLICATION_SYMBOL;
    return;
#if SED_REGEX_EXTENDED
  case REGEX_REPETITION_MODIFIER:
    state->regex_position = REGEX_AFTER_REPETITION_MODIFIER;
    return;
#endif
  case REGEX_LITERAL:
  case INVALID_CHARACTER:
  case NUL_CHARACTER:
  case REGEX_PERIOD:
  case REGEX_QUOTED_ESCAPE:
  case ESCAPE_PREFIX:
  case REGEX_NEWLINE_ESCAPE:
  case REGEX_ESCAPED_DELIMITER:
  case REGEX_SPECIAL_ESCAPED_DELIMITER:
  case REGEX_UNCLOSED_GROUP:
#if !SED_REGEX_EXTENDED
  case REGEX_UNMATCHED_GROUP_CLOSE:
  case REGEX_BRE_VERTICAL_LINE_ESCAPE:
  case REGEX_BRE_QUESTION_MARK_ESCAPE:
  case REGEX_BRE_PLUS_ESCAPE:
  case REGEX_UNMATCHED_INTERVAL_CLOSE:
  case REGEX_BACKREFERENCE:
#endif
  case REGEX_INTERVAL_OPEN:
  case REGEX_DUP_COUNT:
  case REGEX_INTERVAL_SEPARATOR:
  case REGEX_NONPORTABLE_ESCAPE:
  case REGEX_INCOMPLETE_ESCAPE:
  case REGEX_BRACKET_OPEN:
  case REGEX_BRACKET_CLOSE:
  case REGEX_BRACKET_LITERAL:
  case REGEX_BRACKET_NEGATION:
  case REGEX_BRACKET_HYPHEN:
  case REGEX_BRACKET_RANGE_END_HYPHEN:
  case REGEX_BRACKET_TRAILING_HYPHEN:
  case REGEX_OPEN_COLON:
  case REGEX_CLASS_NAME:
  case REGEX_INVALID_CLASS_NAME:
  case REGEX_COLON_CLOSE:
  case REGEX_OPEN_DOT:
  case REGEX_COLL_ELEM_SINGLE:
  case REGEX_COLL_ELEM_MULTI:
  case REGEX_META_CHAR:
  case REGEX_DOT_CLOSE:
  case REGEX_OPEN_EQUAL:
  case REGEX_EQUAL_CLOSE:
  case REGEX_MALFORMED_BRACKET_TERM:
    state->regex_position = REGEX_AFTER_ATOM;
    return;
  default:
    return;
  }
}

static bool
sed_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  ScannerState next = *(ScannerState *)payload;
  TSSymbol symbol;

  if (!sed_scanner_scan_impl(&next, lexer, valid_symbols, &symbol)) {
    return false;
  }

  update_regex_position_after_symbol(&next, symbol);
  *(ScannerState *)payload = next;
  lexer->result_symbol = symbol;
  return true;
}

#endif
