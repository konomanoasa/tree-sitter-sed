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
  REGEX_BEGINNING_ANCHOR,
  REGEX_END_ANCHOR,
  REGEX_PERIOD,
  REGEX_QUOTED_ESCAPE,
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
  BRE_VERTICAL_LINE_ESCAPE_MARKER,
  BRE_QUESTION_MARK_ESCAPE_MARKER,
  BRE_PLUS_ESCAPE_MARKER,
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
  LINE_WORD,
  RIGHT_BRACE,
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

enum TextState {
  TEXT_EMPTY,
  TEXT_HAS_CONTENT,
  TEXT_AFTER_ESCAPED_NEWLINE,
};

enum RegexIntervalState {
  REGEX_INTERVAL_NONE,
  REGEX_INTERVAL_EXPECT_MINIMUM,
  REGEX_INTERVAL_AFTER_MINIMUM,
  REGEX_INTERVAL_EXPECT_MAXIMUM,
  REGEX_INTERVAL_AFTER_MAXIMUM,
};

enum RegexDuplicationState {
  REGEX_DUPLICATION_NONE,
  REGEX_AFTER_DUPLICATION_SYMBOL,
  REGEX_AFTER_REPETITION_MODIFIER,
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
  bool regex_at_branch_start;
  enum RegexDuplicationState regex_duplication_state;
  bool regex_after_alternation;
  bool regex_after_anchor;
  enum TextState text_state;
  enum RegexIntervalState regex_interval_state;
  enum RegexBracketTermState regex_bracket_term_state;
  enum RegexBracketPendingElement regex_bracket_pending_element;
  enum RegexBracketPendingElement regex_bracket_first_element;
  enum RegexBracketPendingElement regex_bracket_last_element;
  uint8_t regex_bracket_element_count;
  bool regex_bracket_range_pending;
  uint16_t regex_group_depth;
} ScannerState;

enum {
  SCANNER_SERIALIZATION_VERSION = 14,
  SCANNER_SERIALIZED_STATE_SIZE = 17,
};

enum {
  SERIALIZED_AT_BRANCH_START_FLAG = 1 << 0,
  SERIALIZED_AFTER_ALTERNATION_FLAG = 1 << 1,
  SERIALIZED_AFTER_ANCHOR_FLAG = 1 << 2,
  SERIALIZED_TEXT_STATE_SHIFT = 3,
  SERIALIZED_MODE_FLAGS_MAXIMUM = 31,
  SERIALIZED_RANGE_PENDING_FLAG = 1 << 0,
  SERIALIZED_DUPLICATION_STATE_SHIFT = 1,
  SERIALIZED_BRACKET_FLAGS_MAXIMUM = 7,
};

static void reset_bracket_tracking(ScannerState *state) {
  state->regex_bracket_term_state = REGEX_BRACKET_TERM_NONE;
  state->regex_bracket_pending_element = REGEX_BRACKET_PENDING_NONE;
  state->regex_bracket_first_element = REGEX_BRACKET_PENDING_NONE;
  state->regex_bracket_last_element = REGEX_BRACKET_PENDING_NONE;
  state->regex_bracket_element_count = 0;
  state->regex_bracket_range_pending = false;
}

static void set_regex_position(
  ScannerState *state,
  bool at_branch_start,
  enum RegexDuplicationState duplication_state,
  bool after_alternation,
  bool after_anchor
) {
  state->regex_at_branch_start = at_branch_start;
  state->regex_duplication_state = duplication_state;
  state->regex_after_alternation = after_alternation;
  state->regex_after_anchor = after_anchor;
}

static void reset_mode_tracking(ScannerState *state) {
  state->regex_state = REGEX_OUTSIDE_BRACKET;
  state->regex_at_branch_start = false;
  state->regex_duplication_state = REGEX_DUPLICATION_NONE;
  state->regex_after_alternation = false;
  state->regex_after_anchor = false;
  state->text_state = TEXT_EMPTY;
  state->regex_interval_state = REGEX_INTERVAL_NONE;
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

static void serialize_uint16(char *buffer, unsigned offset, uint16_t value) {
  buffer[offset] = (char)(value & UINT16_C(0xff));
  buffer[offset + 1] = (char)((value >> 8) & UINT16_C(0xff));
}

static uint16_t deserialize_uint16(const char *buffer, unsigned offset) {
  return (uint16_t)((uint16_t)(unsigned char)buffer[offset] |
    ((uint16_t)(unsigned char)buffer[offset + 1] << 8));
}

static bool is_regex_mode(enum ScannerMode mode) {
  return mode == MODE_REGEX_ADDRESS || mode == MODE_SUBSTITUTE_PATTERN;
}

static unsigned sed_scanner_serialize(void *payload, char *buffer) {
  const ScannerState *state = payload;
  const uint32_t delimiter = (uint32_t)state->delimiter;

  buffer[0] = SCANNER_SERIALIZATION_VERSION;
  buffer[1] = (char)state->mode;
  buffer[2] = (char)state->regex_state;
  buffer[3] =
    (state->regex_at_branch_start ? SERIALIZED_AT_BRANCH_START_FLAG : 0) |
    (state->regex_after_alternation ? SERIALIZED_AFTER_ALTERNATION_FLAG : 0) |
    (state->regex_after_anchor ? SERIALIZED_AFTER_ANCHOR_FLAG : 0) |
    ((unsigned char)state->text_state << SERIALIZED_TEXT_STATE_SHIFT);
  buffer[4] = (char)(delimiter & UINT32_C(0xff));
  buffer[5] = (char)((delimiter >> 8) & UINT32_C(0xff));
  buffer[6] = (char)((delimiter >> 16) & UINT32_C(0xff));
  buffer[7] = (char)((delimiter >> 24) & UINT32_C(0xff));
  serialize_uint16(buffer, 8, state->regex_group_depth);
  buffer[10] = (char)state->regex_interval_state;
  buffer[11] = (char)state->regex_bracket_term_state;
  buffer[12] = (char)state->regex_bracket_pending_element;
  buffer[13] = (char)state->regex_bracket_first_element;
  buffer[14] = (char)state->regex_bracket_last_element;
  buffer[15] = (char)state->regex_bracket_element_count;
  buffer[16] =
    (state->regex_bracket_range_pending ? SERIALIZED_RANGE_PENDING_FLAG : 0) |
    ((unsigned char)state->regex_duplication_state
      << SERIALIZED_DUPLICATION_STATE_SHIFT);
  return SCANNER_SERIALIZED_STATE_SIZE;
}

static bool bracket_tracking_is_reset(const ScannerState *state) {
  return state->regex_bracket_term_state ==
    REGEX_BRACKET_TERM_NONE &&
    state->regex_bracket_pending_element ==
    REGEX_BRACKET_PENDING_NONE &&
    state->regex_bracket_first_element ==
    REGEX_BRACKET_PENDING_NONE &&
    state->regex_bracket_last_element ==
    REGEX_BRACKET_PENDING_NONE &&
    state->regex_bracket_element_count ==
    0 &&
    !state->regex_bracket_range_pending;
}

static bool regex_position_is_reset(const ScannerState *state) {
  return !state->regex_at_branch_start &&
    state->regex_duplication_state ==
    REGEX_DUPLICATION_NONE &&
    !state->regex_after_alternation &&
    !state->regex_after_anchor;
}

static bool deserialized_delimiter_is_valid(uint32_t delimiter) {
  return delimiter !=
    0 &&
    delimiter <=
    UINT32_C(0x10ffff) &&
    !(delimiter >= UINT32_C(0xd800) && delimiter <= UINT32_C(0xdfff)) &&
    delimiter !=
    (uint32_t)'\\' &&
    delimiter != (uint32_t)'\n';
}

static bool deserialized_state_is_valid(const ScannerState *candidate) {
  if (candidate->mode == MODE_NONE) {
    return false;
  }

  if (candidate->mode == MODE_TEXT) {
    return candidate->delimiter ==
      0 &&
      candidate->regex_state ==
      REGEX_OUTSIDE_BRACKET &&
      regex_position_is_reset(candidate) &&
      candidate->regex_group_depth ==
      0 &&
      candidate->regex_interval_state ==
      REGEX_INTERVAL_NONE &&
      bracket_tracking_is_reset(candidate);
  }

  if (!deserialized_delimiter_is_valid((uint32_t)candidate->delimiter)) {
    return false;
  }

  if (!is_regex_mode(candidate->mode)) {
    return candidate->regex_state ==
      REGEX_OUTSIDE_BRACKET &&
      regex_position_is_reset(candidate) &&
      candidate->text_state ==
      TEXT_EMPTY &&
      candidate->regex_interval_state ==
      REGEX_INTERVAL_NONE &&
      bracket_tracking_is_reset(candidate) &&
      candidate->regex_group_depth == 0;
  }

  if (candidate->text_state != TEXT_EMPTY) {
    return false;
  }

  if (candidate->regex_state == REGEX_OUTSIDE_BRACKET) {
    return bracket_tracking_is_reset(candidate);
  }

  if (!regex_position_is_reset(candidate)) {
    return false;
  }

  if (
    candidate->regex_state ==
    REGEX_BRACKET_FIRST ||
    candidate->regex_state == REGEX_BRACKET_AFTER_CARET
  ) {
    return bracket_tracking_is_reset(candidate);
  }

  return true;
}

static void
sed_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  ScannerState *state = payload;
  reset_state(state);

  if (
    length !=
    SCANNER_SERIALIZED_STATE_SIZE ||
    (unsigned char)buffer[0] != SCANNER_SERIALIZATION_VERSION
  ) {
    return;
  }

  const unsigned char mode_flags = (unsigned char)buffer[3];
  const unsigned char regex_bracket_flags = (unsigned char)buffer[16];
  const ScannerState candidate = {
    .delimiter = (int32_t)((uint32_t)(unsigned char)buffer[4] |
      ((uint32_t)(unsigned char)buffer[5] << 8) |
      ((uint32_t)(unsigned char)buffer[6] << 16) |
      ((uint32_t)(unsigned char)buffer[7] << 24)),
    .mode = (enum ScannerMode)(unsigned char)buffer[1],
    .regex_state = (enum RegexState)(unsigned char)buffer[2],
    .regex_at_branch_start =
      (mode_flags & SERIALIZED_AT_BRANCH_START_FLAG) != 0,
    .regex_duplication_state = (enum RegexDuplicationState)(
      (regex_bracket_flags >> SERIALIZED_DUPLICATION_STATE_SHIFT) & 3U
    ),
    .regex_after_alternation =
      (mode_flags & SERIALIZED_AFTER_ALTERNATION_FLAG) != 0,
    .regex_after_anchor = (mode_flags & SERIALIZED_AFTER_ANCHOR_FLAG) != 0,
    .text_state =
      (enum TextState)((mode_flags >> SERIALIZED_TEXT_STATE_SHIFT) & 3U),
    .regex_interval_state = (enum RegexIntervalState)(unsigned char)buffer[10],
    .regex_bracket_term_state =
      (enum RegexBracketTermState)(unsigned char)buffer[11],
    .regex_bracket_pending_element =
      (enum RegexBracketPendingElement)(unsigned char)buffer[12],
    .regex_bracket_first_element =
      (enum RegexBracketPendingElement)(unsigned char)buffer[13],
    .regex_bracket_last_element =
      (enum RegexBracketPendingElement)(unsigned char)buffer[14],
    .regex_bracket_element_count = (uint8_t)(unsigned char)buffer[15],
    .regex_bracket_range_pending =
      (regex_bracket_flags & SERIALIZED_RANGE_PENDING_FLAG) != 0,
    .regex_group_depth = deserialize_uint16(buffer, 8),
  };

  if (candidate.mode > MODE_TEXT) {
    return;
  }

  if (candidate.regex_state > REGEX_BRACKET_BODY) {
    return;
  }

  if ((mode_flags & (unsigned char)~SERIALIZED_MODE_FLAGS_MAXIMUM) != 0) {
    return;
  }
  if (candidate.text_state > TEXT_AFTER_ESCAPED_NEWLINE) {
    return;
  }
#if !SED_REGEX_EXTENDED
  if (candidate.regex_after_alternation) {
    return;
  }
#endif

  if (candidate.regex_interval_state > REGEX_INTERVAL_AFTER_MAXIMUM) {
    return;
  }
  if (candidate.regex_bracket_term_state > REGEX_BRACKET_TERM_EQUAL) {
    return;
  }
  if (
    candidate.regex_bracket_pending_element >
    REGEX_BRACKET_PENDING_COLON ||
    candidate.regex_bracket_first_element >
    REGEX_BRACKET_PENDING_COLON ||
    candidate.regex_bracket_last_element >
    REGEX_BRACKET_PENDING_COLON ||
    candidate.regex_bracket_element_count >
    3U ||
    (regex_bracket_flags & (unsigned char)~SERIALIZED_BRACKET_FLAGS_MAXIMUM) !=
    0 ||
#if SED_REGEX_EXTENDED
    candidate.regex_duplication_state > REGEX_AFTER_REPETITION_MODIFIER
#else
    candidate.regex_duplication_state > REGEX_AFTER_DUPLICATION_SYMBOL
#endif
  ) {
    return;
  }
  if (
    (candidate.regex_bracket_element_count ==
      0 &&
      (candidate.regex_bracket_first_element !=
        REGEX_BRACKET_PENDING_NONE ||
        candidate.regex_bracket_last_element != REGEX_BRACKET_PENDING_NONE)) ||
    (candidate.regex_bracket_element_count >
      0 &&
      (candidate.regex_bracket_first_element ==
        REGEX_BRACKET_PENDING_NONE ||
        candidate.regex_bracket_last_element == REGEX_BRACKET_PENDING_NONE)) ||
    (candidate.regex_bracket_pending_element !=
      REGEX_BRACKET_PENDING_NONE &&
      candidate.regex_bracket_range_pending)
  ) {
    return;
  }

  if (deserialized_state_is_valid(&candidate)) {
    *state = candidate;
  }
}

static void advance(TSLexer *lexer) {
  lexer->advance(lexer, false);
}

static bool is_blank(int32_t character) {
  return character == ' ' || character == '\t';
}

static bool is_digit(int32_t character) {
  return character >= '0' && character <= '9';
}

static void advance_past_blanks(TSLexer *lexer) {
  while (is_blank(lexer->lookahead)) {
    advance(lexer);
  }
}

static void advance_past_escaped_character(TSLexer *lexer) {
  if (!lexer->eof(lexer) && lexer->lookahead != '\n') {
    advance(lexer);
  }
}

static void skip_blanks(TSLexer *lexer) {
  while (is_blank(lexer->lookahead)) {
    lexer->advance(lexer, true);
  }
}

static bool invalid_delimiter(TSLexer *lexer) {
  return lexer->eof(lexer) ||
    lexer->lookahead ==
    0 ||
    lexer->lookahead ==
    '\\' ||
    lexer->lookahead == '\n';
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
  state->regex_at_branch_start =
    next_mode == MODE_REGEX_ADDRESS || next_mode == MODE_SUBSTITUTE_PATTERN;
  advance(lexer);
  lexer->mark_end(lexer);
  return true;
}

static bool scan_mode_delimiter(
  TSLexer *lexer,
  ScannerState *state,
  enum ScannerMode next_mode
) {
  if (lexer->lookahead != state->delimiter) {
    return false;
  }

  state->mode = next_mode;
  reset_mode_tracking(state);
  if (next_mode == MODE_NONE) {
    state->delimiter = 0;
  }
  advance(lexer);
  lexer->mark_end(lexer);
  return true;
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

  if (
    !valid_symbols[candidate] || !scan_mode_delimiter(lexer, state, next_mode)
  ) {
    return false;
  }

  *symbol = candidate;
  return true;
}

static void consume(TSLexer *lexer) {
  advance(lexer);
  lexer->mark_end(lexer);
}

static bool scan_text_command_start(TSLexer *lexer, ScannerState *state) {
  if (state->mode != MODE_NONE || lexer->lookahead != '\\') {
    return false;
  }

  lexer->mark_end(lexer);
  advance(lexer);

  if (lexer->lookahead != '\n') {
    return false;
  }

  consume(lexer);
  state->mode = MODE_TEXT;
  return true;
}

static bool scan_to_physical_line_end(TSLexer *lexer, bool consumed) {
  while (!lexer->eof(lexer)) {
    if (lexer->lookahead == '\n') {
      return consumed;
    }

    consume(lexer);
    consumed = true;
  }

  return consumed;
}

static bool scan_file_argument(TSLexer *lexer) {
  if (
    lexer->eof(lexer) || is_blank(lexer->lookahead) || lexer->lookahead == '\n'
  ) {
    return false;
  }

  consume(lexer);
  return scan_to_physical_line_end(lexer, true);
}

static bool scan_substitution_wfile_argument(TSLexer *lexer) {
  if (
    lexer->eof(lexer) ||
    is_blank(lexer->lookahead) ||
    lexer->lookahead ==
    '\n' ||
    lexer->lookahead == ';'
  ) {
    return false;
  }

  do {
    consume(lexer);
  } while (
    !lexer->eof(lexer) && lexer->lookahead != '\n' && lexer->lookahead != ';'
  );
  return true;
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

static bool scan_right_brace(TSLexer *lexer, ScannerState *state) {
  if (state->mode != MODE_NONE) {
    return false;
  }

  skip_blanks(lexer);

  if (lexer->lookahead != '}') {
    return false;
  }

  consume(lexer);
  return true;
}

static bool scan_reserved_unknown_function(TSLexer *lexer) {
  const int32_t character = lexer->lookahead;
  if (
    !is_digit(character) &&
    character !=
    '$' &&
    character !=
    '/' &&
    character != '\\'
  ) {
    return false;
  }

  consume(lexer);
  return true;
}

enum LiteralScanResult {
  LITERAL_SCAN_NONE,
  LITERAL_SCAN_TOKEN,
  LITERAL_SCAN_LINE_END,
};

static bool
emit_symbol(const bool *valid_symbols, TSSymbol candidate, TSSymbol *symbol) {
  if (!valid_symbols[candidate]) {
    return false;
  }

  *symbol = candidate;
  return true;
}

static bool emit_missing_marker(
  TSLexer *lexer,
  const bool *valid_symbols,
  TSSymbol candidate,
  TSSymbol *symbol
) {
  if (!valid_symbols[candidate]) {
    return false;
  }

  lexer->mark_end(lexer);
  *symbol = candidate;
  return true;
}

static bool at_command_boundary(TSLexer *lexer) {
  return lexer->eof(lexer) ||
    lexer->lookahead ==
    '\n' ||
    lexer->lookahead ==
    ';' ||
    lexer->lookahead == '}';
}

static bool can_start_address(TSLexer *lexer) {
  return is_digit(lexer->lookahead) ||
    lexer->lookahead ==
    '$' ||
    lexer->lookahead ==
    '/' ||
    lexer->lookahead == '\\';
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
  if (lexer->lookahead == '}') {
    if (valid_symbols[MISSING_SEPARATOR_BEFORE_UNMATCHED_BRACE_MARKER]) {
      *symbol = MISSING_SEPARATOR_BEFORE_UNMATCHED_BRACE_MARKER;
      return POST_BLANK_RECOVERY_TOKEN;
    }
    if (valid_symbols[MISSING_COMMAND_SEPARATOR_MARKER]) {
      *symbol = MISSING_COMMAND_SEPARATOR_MARKER;
      return POST_BLANK_RECOVERY_TOKEN;
    }
    return POST_BLANK_RECOVERY_FAILED;
  }
  if (lexer->eof(lexer) && valid_symbols[INCOMPLETE_COMMAND_SEPARATOR_MARKER]) {
    *symbol = INCOMPLETE_COMMAND_SEPARATOR_MARKER;
    return POST_BLANK_RECOVERY_TOKEN;
  }
  return POST_BLANK_RECOVERY_FAILED;
}

static bool scan_text_token(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  if (lexer->eof(lexer)) {
    if (state->text_state == TEXT_AFTER_ESCAPED_NEWLINE) {
      if (!emit_missing_marker(
            lexer,
            valid_symbols,
            MISSING_TEXT_MARKER,
            symbol
          )) {
        return false;
      }
      state->text_state = TEXT_HAS_CONTENT;
      return true;
    }
    if (
      state->text_state ==
      TEXT_EMPTY &&
      emit_missing_marker(lexer, valid_symbols, MISSING_TEXT_MARKER, symbol)
    ) {
      state->text_state = TEXT_HAS_CONTENT;
      return true;
    }
    if (!valid_symbols[TEXT_EOF]) {
      return false;
    }
    lexer->mark_end(lexer);
    reset_state(state);
    *symbol = TEXT_EOF;
    return true;
  }

  if (lexer->lookahead == '\n') {
    if (!valid_symbols[TEXT_LINE_END]) {
      return false;
    }
    lexer->mark_end(lexer);
    reset_state(state);
    *symbol = TEXT_LINE_END;
    return true;
  }

  if (lexer->lookahead == '\\') {
    advance(lexer);
    lexer->mark_end(lexer);

    if (lexer->eof(lexer)) {
      state->text_state = TEXT_HAS_CONTENT;
      return emit_symbol(valid_symbols, TEXT_UNSPECIFIED_ESCAPE, symbol);
    }
    if (lexer->lookahead == '\\') {
      consume(lexer);
      state->text_state = TEXT_HAS_CONTENT;
      return emit_symbol(valid_symbols, TEXT_BACKSLASH_ESCAPE, symbol);
    }
    if (lexer->lookahead == '\n') {
      consume(lexer);
      state->text_state = TEXT_AFTER_ESCAPED_NEWLINE;
      return emit_symbol(valid_symbols, TEXT_ESCAPED_NEWLINE, symbol);
    }

    consume(lexer);
    state->text_state = TEXT_HAS_CONTENT;
    return emit_symbol(valid_symbols, TEXT_UNSPECIFIED_ESCAPE, symbol);
  }

  if (!valid_symbols[TEXT_LITERAL]) {
    return false;
  }
  do {
    consume(lexer);
  } while (
    !lexer->eof(lexer) && lexer->lookahead != '\\' && lexer->lookahead != '\n'
  );
  state->text_state = TEXT_HAS_CONTENT;
  *symbol = TEXT_LITERAL;
  return true;
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
  if (!state->regex_bracket_range_pending) {
    commit_pending_bracket_element(state);
  }
}

static void finish_compound_bracket_element(ScannerState *state) {
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

static void
update_bracket_state_after_literal(ScannerState *state, int32_t character) {
  if (state->regex_state == REGEX_BRACKET_FIRST) {
    state->regex_state =
      character == '^' ? REGEX_BRACKET_AFTER_CARET : REGEX_BRACKET_BODY;
  } else if (state->regex_state == REGEX_BRACKET_AFTER_CARET) {
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
  }
  update_bracket_state_after_literal(state, character);
  return LITERAL_SCAN_TOKEN;
}

static TSSymbol
regex_unterminated_symbol(enum ScannerMode mode, bool at_end_of_source) {
  if (mode == MODE_REGEX_ADDRESS) {
    return at_end_of_source ? REGEX_UNTERMINATED_ADDRESS
                            : REGEX_LINE_UNTERMINATED_ADDRESS;
  }
  return at_end_of_source ? REGEX_UNTERMINATED_SUBSTITUTE
                          : REGEX_LINE_UNTERMINATED_SUBSTITUTE;
}

static bool emit_unterminated(
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol candidate,
  TSSymbol *symbol
) {
  if (!emit_symbol(valid_symbols, candidate, symbol)) {
    return false;
  }

  reset_state(state);
  return true;
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

  TSSymbol candidate;
  enum RegexBracketTermState term_state;
  switch (lexer->lookahead) {
  case ':':
    candidate = REGEX_OPEN_COLON;
    term_state = REGEX_BRACKET_TERM_COLON;
    break;
  case '.':
    candidate = REGEX_OPEN_DOT;
    term_state = REGEX_BRACKET_TERM_DOT;
    break;
  case '=':
    candidate = REGEX_OPEN_EQUAL;
    term_state = REGEX_BRACKET_TERM_EQUAL;
    break;
  default:
    begin_single_bracket_element(state, '[');
    finish_first_bracket_element(state);
    return emit_symbol(valid_symbols, REGEX_BRACKET_LITERAL, symbol);
  }

  if (!valid_symbols[candidate]) {
    return false;
  }
  consume(lexer);
  begin_compound_bracket_element(state);
  finish_first_bracket_element(state);
  state->regex_bracket_term_state = term_state;
  *symbol = candidate;
  return true;
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
  return character == '^' || character == '-' || character == ']';
}

static int32_t
bracket_term_close_marker(enum RegexBracketTermState term_state) {
  switch (term_state) {
  case REGEX_BRACKET_TERM_COLON:
    return ':';
  case REGEX_BRACKET_TERM_DOT:
    return '.';
  default:
    return '=';
  }
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
  if (
    state->regex_bracket_term_state ==
    REGEX_BRACKET_TERM_DOT &&
    bracket_meta_character(single_character)
  ) {
    return REGEX_META_CHAR;
  }
  return REGEX_COLL_ELEM_SINGLE;
}

static bool scan_regex_bracket_term_content(
  TSLexer *lexer,
  ScannerState *state,
  int32_t close_marker,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  uint8_t character_count = 0;
  int32_t single_character = 0;
  bool stopped_at_close = false;
  lexer->mark_end(lexer);

  if (
    lexer->lookahead ==
    ']' &&
    state->regex_bracket_term_state != REGEX_BRACKET_TERM_COLON
  ) {
    advance(lexer);
    lexer->mark_end(lexer);
    record_bracket_term_character(&character_count, &single_character, ']');
    if (lexer->lookahead == close_marker) {
      advance(lexer);
      if (lexer->lookahead == ']') {
        const TSSymbol candidate = regex_bracket_term_content_symbol(
          state,
          character_count,
          single_character
        );
        return emit_symbol(valid_symbols, candidate, symbol);
      }
      lexer->mark_end(lexer);
      record_bracket_term_character(
        &character_count,
        &single_character,
        close_marker
      );
    }
  }

  for (;;) {
    if (
      lexer->eof(lexer) || lexer->lookahead == '\n' || lexer->lookahead == ']'
    ) {
      break;
    }

    if (lexer->lookahead == close_marker) {
      advance(lexer);
      if (lexer->lookahead == ']') {
        stopped_at_close = true;
        break;
      }
      lexer->mark_end(lexer);
      record_bracket_term_character(
        &character_count,
        &single_character,
        close_marker
      );
      continue;
    }

    const int32_t character = lexer->lookahead;
    consume(lexer);
    record_bracket_term_character(
      &character_count,
      &single_character,
      character
    );
  }

  if (character_count == 0) {
    if (!stopped_at_close) {
      state->regex_bracket_term_state = REGEX_BRACKET_TERM_NONE;
      finish_compound_bracket_element(state);
    }
    return emit_symbol(valid_symbols, REGEX_MALFORMED_BRACKET_TERM, symbol);
  }
  const TSSymbol candidate =
    regex_bracket_term_content_symbol(state, character_count, single_character);
  return emit_symbol(valid_symbols, candidate, symbol);
}

static bool scan_regex_bracket_term_close(
  TSLexer *lexer,
  ScannerState *state,
  int32_t marker,
  TSSymbol candidate,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  if (lexer->lookahead != marker) {
    return false;
  }

  advance(lexer);
  if (lexer->lookahead != ']') {
    return false;
  }
  consume(lexer);
  state->regex_bracket_term_state = REGEX_BRACKET_TERM_NONE;
  finish_compound_bracket_element(state);
  return emit_symbol(valid_symbols, candidate, symbol);
}

enum RegexIntervalPartResult {
  REGEX_INTERVAL_PART_END,
  REGEX_INTERVAL_PART_ESCAPED_CLOSE,
  REGEX_INTERVAL_PART_INVALID,
};

static enum RegexIntervalPartResult scan_regex_interval_digits(
  TSLexer *lexer,
  const ScannerState *state,
  bool escaped_close,
  bool *has_digits
) {
  for (;;) {
    if (is_digit(lexer->lookahead) && lexer->lookahead != state->delimiter) {
      advance(lexer);
      if (has_digits != NULL) {
        *has_digits = true;
      }
      continue;
    }

    if (escaped_close && lexer->lookahead == '\\') {
      advance(lexer);
      if (lexer->lookahead == '}' && state->delimiter != '}') {
        return REGEX_INTERVAL_PART_ESCAPED_CLOSE;
      }
      advance_past_escaped_character(lexer);
      return REGEX_INTERVAL_PART_INVALID;
    }

    return REGEX_INTERVAL_PART_END;
  }
}

static bool
scan_regex_interval_separator(TSLexer *lexer, const ScannerState *state) {
  if (lexer->lookahead != ',' || state->delimiter == ',') {
    return false;
  }

  advance(lexer);
  return true;
}

static bool scan_regex_interval_tail(
  TSLexer *lexer,
  const ScannerState *state,
  bool escaped_close
) {
  bool has_minimum = false;
  enum RegexIntervalPartResult result =
    scan_regex_interval_digits(lexer, state, escaped_close, &has_minimum);
  if (result == REGEX_INTERVAL_PART_INVALID) {
    return false;
  }
  if (result == REGEX_INTERVAL_PART_ESCAPED_CLOSE) {
    advance(lexer);
    return has_minimum;
  }

  const bool has_separator = scan_regex_interval_separator(lexer, state);
  if (!has_minimum) {
    return false;
  }

  if (has_separator) {
    result = scan_regex_interval_digits(lexer, state, escaped_close, NULL);
    if (result == REGEX_INTERVAL_PART_INVALID) {
      return false;
    }
    if (result == REGEX_INTERVAL_PART_ESCAPED_CLOSE) {
      advance(lexer);
      return true;
    }
  }

  if (escaped_close) {
    if (lexer->lookahead != '\\') {
      return false;
    }
    advance(lexer);
    if (lexer->lookahead != '}' || state->delimiter == '}') {
      advance_past_escaped_character(lexer);
      return false;
    }
  }

  if (lexer->lookahead != '}' || state->delimiter == '}') {
    return false;
  }

  advance(lexer);
  return true;
}

static bool scan_regex_interval(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  advance(lexer);
  lexer->mark_end(lexer);
  state->regex_interval_state = REGEX_INTERVAL_EXPECT_MINIMUM;
  return emit_symbol(valid_symbols, REGEX_INTERVAL_OPEN, symbol);
}

static bool emit_interval_issue(
  TSLexer *lexer,
  ScannerState *state,
  TSSymbol candidate,
  TSSymbol *symbol
) {
  lexer->mark_end(lexer);
  state->regex_interval_state = REGEX_INTERVAL_NONE;
  *symbol = candidate;
  return true;
}

static bool
scan_invalid_interval_remainder(TSLexer *lexer, ScannerState *state);

#if !SED_REGEX_EXTENDED
static bool scan_regex_after_backslash(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
);
#endif

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
  return lexer->lookahead == '*' && !state->regex_at_branch_start;
#endif
}

enum DuplicationContextScan {
  DUPLICATION_CONTEXT_SKIPPED,
  DUPLICATION_CONTEXT_TOKEN,
  DUPLICATION_CONTEXT_CONSUMED,
};

static enum DuplicationContextScan scan_regex_duplication_context_marker(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  TSSymbol candidate;
  if (state->regex_at_branch_start) {
    candidate = REGEX_LEADING_DUPLICATION_MARKER;
  } else if (state->regex_duplication_state != REGEX_DUPLICATION_NONE) {
#if SED_REGEX_EXTENDED
    if (
      state->regex_duplication_state ==
      REGEX_AFTER_DUPLICATION_SYMBOL &&
      lexer->lookahead == '?'
    ) {
      return DUPLICATION_CONTEXT_SKIPPED;
    }
#endif
    candidate = REGEX_ADJACENT_DUPLICATION_MARKER;
  } else {
    return DUPLICATION_CONTEXT_SKIPPED;
  }

  if (!valid_symbols[candidate]) {
    return DUPLICATION_CONTEXT_SKIPPED;
  }

  lexer->mark_end(lexer);
  if (raw_duplication_symbol_follows(lexer, state)) {
    *symbol = candidate;
    return DUPLICATION_CONTEXT_TOKEN;
  }

#if SED_REGEX_EXTENDED
  if (lexer->lookahead != '{' || state->delimiter == '{') {
    return DUPLICATION_CONTEXT_SKIPPED;
  }
  advance(lexer);
  if (scan_regex_interval_tail(lexer, state, false)) {
    *symbol = candidate;
    return DUPLICATION_CONTEXT_TOKEN;
  }
#else
  if (lexer->lookahead != '\\') {
    return DUPLICATION_CONTEXT_SKIPPED;
  }
  advance(lexer);
  if (lexer->lookahead != '{' || state->delimiter == '{') {
    return scan_regex_after_backslash(lexer, state, valid_symbols, symbol)
      ? DUPLICATION_CONTEXT_TOKEN
      : DUPLICATION_CONTEXT_CONSUMED;
  }
  advance(lexer);
  if (scan_regex_interval_tail(lexer, state, true)) {
    *symbol = candidate;
    return DUPLICATION_CONTEXT_TOKEN;
  }
#endif

  if (lexer->eof(lexer) && valid_symbols[REGEX_INCOMPLETE_INTERVAL]) {
    emit_interval_issue(lexer, state, REGEX_INCOMPLETE_INTERVAL, symbol);
    return DUPLICATION_CONTEXT_TOKEN;
  }

  if (!valid_symbols[REGEX_INVALID_INTERVAL]) {
    *symbol = candidate;
    return DUPLICATION_CONTEXT_TOKEN;
  }
  scan_invalid_interval_remainder(lexer, state);
  emit_interval_issue(lexer, state, REGEX_INVALID_INTERVAL, symbol);
  return DUPLICATION_CONTEXT_TOKEN;
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
    return scan_regex_interval(lexer, state, valid_symbols, symbol);
#else
    consume(lexer);
    return emit_symbol(valid_symbols, REGEX_LITERAL, symbol);
#endif
  }

  consume(lexer);

  if (character == '*') {
#if SED_REGEX_EXTENDED
    return emit_symbol(valid_symbols, REGEX_ZERO_OR_MORE, symbol);
#else
    return emit_symbol(
      valid_symbols,
      state->regex_at_branch_start ? REGEX_LITERAL : REGEX_ZERO_OR_MORE,
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
      state->regex_duplication_state ==
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

static bool escape_quotes_regex_syntax(int32_t character) {
  switch (character) {
#if SED_REGEX_EXTENDED
  case '}':
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
  const bool special = regex_delimiter_is_special(lexer->lookahead);
  consume(lexer);
  return emit_symbol(
    valid_symbols,
    special ? REGEX_SPECIAL_ESCAPED_DELIMITER : REGEX_ESCAPED_DELIMITER,
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

  if (lexer->lookahead == state->delimiter) {
    return scan_regex_escaped_delimiter(lexer, valid_symbols, symbol);
  }

#if !SED_REGEX_EXTENDED
  if (lexer->lookahead == '}') {
    if (valid_symbols[REGEX_INTERVAL_CLOSE]) {
      consume(lexer);
      state->regex_interval_state = REGEX_INTERVAL_NONE;
      return emit_symbol(valid_symbols, REGEX_INTERVAL_CLOSE, symbol);
    }
    if (valid_symbols[REGEX_UNMATCHED_INTERVAL_CLOSE]) {
      consume(lexer);
      return emit_symbol(valid_symbols, REGEX_UNMATCHED_INTERVAL_CLOSE, symbol);
    }
  }
#endif

  if (lexer->lookahead == '(' || lexer->lookahead == ')') {
#if !SED_REGEX_EXTENDED
    const int32_t character = lexer->lookahead;
#endif
    consume(lexer);
#if SED_REGEX_EXTENDED
    return emit_symbol(valid_symbols, REGEX_QUOTED_ESCAPE, symbol);
#else
    return character == '('
      ? emit_symbol(valid_symbols, REGEX_GROUP_OPEN, symbol)
      : emit_symbol(
          valid_symbols,
          state->regex_group_depth > 0 ? REGEX_GROUP_CLOSE
                                       : REGEX_UNMATCHED_GROUP_CLOSE,
          symbol
        );
#endif
  }

  if (lexer->lookahead >= '1' && lexer->lookahead <= '9') {
#if SED_REGEX_EXTENDED
    consume(lexer);
    return emit_symbol(valid_symbols, REGEX_NONPORTABLE_ESCAPE, symbol);
#else
    consume(lexer);
    return emit_symbol(valid_symbols, REGEX_BACKREFERENCE, symbol);
#endif
  }

  if (lexer->lookahead == '{') {
#if SED_REGEX_EXTENDED
    consume(lexer);
    return emit_symbol(valid_symbols, REGEX_QUOTED_ESCAPE, symbol);
#else
    return scan_regex_interval(lexer, state, valid_symbols, symbol);
#endif
  }

  if (
    lexer->lookahead ==
    '+' ||
    lexer->lookahead ==
    '?' ||
    lexer->lookahead == '|'
  ) {
#if SED_REGEX_EXTENDED
    consume(lexer);
    return emit_symbol(valid_symbols, REGEX_QUOTED_ESCAPE, symbol);
#else
    const int32_t character = lexer->lookahead;
    consume(lexer);
    if (character == '|') {
      return emit_symbol(valid_symbols, REGEX_BRE_VERTICAL_LINE_ESCAPE, symbol);
    }
    return emit_symbol(
      valid_symbols,
      character == '?' ? REGEX_BRE_QUESTION_MARK_ESCAPE : REGEX_BRE_PLUS_ESCAPE,
      symbol
    );
#endif
  }

  if (lexer->lookahead == 'n') {
    consume(lexer);
    return emit_symbol(valid_symbols, REGEX_NEWLINE_ESCAPE, symbol);
  }

  const TSSymbol candidate = escape_quotes_regex_syntax(lexer->lookahead)
    ? REGEX_QUOTED_ESCAPE
    : REGEX_NONPORTABLE_ESCAPE;
  consume(lexer);
  return emit_symbol(valid_symbols, candidate, symbol);
}

#if !SED_REGEX_EXTENDED
static bool scan_regex_after_backslash(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  if (lexer->lookahead == state->delimiter) {
    return scan_regex_escaped_delimiter(lexer, valid_symbols, symbol);
  }

  if (lexer->lookahead == ')' && valid_symbols[EMPTY_SUBEXPRESSION_MARKER]) {
    *symbol = EMPTY_SUBEXPRESSION_MARKER;
    return true;
  }

  lexer->mark_end(lexer);
  return scan_regex_escape_after_backslash(lexer, state, valid_symbols, symbol);
}
#endif

static bool scan_regex_dup_count(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  do {
    consume(lexer);
  } while (is_digit(lexer->lookahead) && lexer->lookahead != state->delimiter);

  if (state->regex_interval_state == REGEX_INTERVAL_EXPECT_MINIMUM) {
    state->regex_interval_state = REGEX_INTERVAL_AFTER_MINIMUM;
  } else if (state->regex_interval_state == REGEX_INTERVAL_EXPECT_MAXIMUM) {
    state->regex_interval_state = REGEX_INTERVAL_AFTER_MAXIMUM;
  }

  return emit_symbol(valid_symbols, REGEX_DUP_COUNT, symbol);
}

static bool
scan_invalid_interval_remainder(TSLexer *lexer, ScannerState *state) {
  bool consumed_character = false;
  while (
    !lexer->eof(lexer) &&
    lexer->lookahead !=
    '\n' &&
    lexer->lookahead != state->delimiter
  ) {
    const int32_t character = lexer->lookahead;
    consume(lexer);
    consumed_character = true;
    if (character == '}') {
      break;
    }
    if (character != '\\' || lexer->eof(lexer) || lexer->lookahead == '\n') {
      continue;
    }
    const int32_t escaped = lexer->lookahead;
    consume(lexer);
    if (!SED_REGEX_EXTENDED && escaped == '}') {
      break;
    }
  }
  if (consumed_character) {
    state->regex_interval_state = REGEX_INTERVAL_NONE;
  }
  return consumed_character;
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
    return emit_missing_marker(
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
    return emit_missing_marker(
      lexer,
      valid_symbols,
      EMPTY_ALTERNATIVE_MARKER,
      symbol
    );
  }
  return false;
}
#endif

static bool scan_regex_token(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  switch (scan_regex_duplication_context_marker(
    lexer,
    state,
    valid_symbols,
    symbol
  )) {
  case DUPLICATION_CONTEXT_TOKEN:
    return true;
  case DUPLICATION_CONTEXT_CONSUMED:
    return false;
  case DUPLICATION_CONTEXT_SKIPPED:
    break;
  }

#if !SED_REGEX_EXTENDED
  if (lexer->lookahead == '\\' && valid_symbols[EMPTY_SUBEXPRESSION_MARKER]) {
    lexer->mark_end(lexer);
    advance(lexer);
    return scan_regex_after_backslash(lexer, state, valid_symbols, symbol);
  }
#else
  if (scan_empty_regex_construct(lexer, state, valid_symbols, symbol)) {
    return true;
  }
#endif

  if (
    valid_symbols[REGEX_DUP_COUNT] &&
    is_digit(lexer->lookahead) &&
    lexer->lookahead != state->delimiter
  ) {
    return scan_regex_dup_count(lexer, state, valid_symbols, symbol);
  }

  if (
    valid_symbols[REGEX_INTERVAL_SEPARATOR] &&
    lexer->lookahead ==
    ',' &&
    lexer->lookahead != state->delimiter
  ) {
    consume(lexer);
    state->regex_interval_state = REGEX_INTERVAL_EXPECT_MAXIMUM;
    *symbol = REGEX_INTERVAL_SEPARATOR;
    return true;
  }

#if SED_REGEX_EXTENDED
  if (
    valid_symbols[REGEX_INTERVAL_CLOSE] &&
    lexer->lookahead ==
    '}' &&
    lexer->lookahead != state->delimiter
  ) {
    consume(lexer);
    state->regex_interval_state = REGEX_INTERVAL_NONE;
    *symbol = REGEX_INTERVAL_CLOSE;
    return true;
  }
#else
  if (
    state->regex_interval_state !=
    REGEX_INTERVAL_NONE &&
    lexer->lookahead == '\\'
  ) {
    advance(lexer);
    if (
      valid_symbols[REGEX_INTERVAL_CLOSE] &&
      lexer->lookahead ==
      '}' &&
      lexer->lookahead != state->delimiter
    ) {
      consume(lexer);
      state->regex_interval_state = REGEX_INTERVAL_NONE;
      *symbol = REGEX_INTERVAL_CLOSE;
      return true;
    }
    if (lexer->eof(lexer) && valid_symbols[REGEX_INCOMPLETE_INTERVAL]) {
      return emit_interval_issue(
        lexer,
        state,
        REGEX_INCOMPLETE_INTERVAL,
        symbol
      );
    }
    if (!valid_symbols[REGEX_INVALID_INTERVAL]) {
      return false;
    }
    if (lexer->lookahead == '}') {
      advance(lexer);
    } else {
      advance_past_escaped_character(lexer);
      scan_invalid_interval_remainder(lexer, state);
    }
    return emit_interval_issue(lexer, state, REGEX_INVALID_INTERVAL, symbol);
  }
#endif

  if (
    state->regex_interval_state !=
    REGEX_INTERVAL_NONE &&
    valid_symbols[REGEX_INVALID_INTERVAL] &&
    scan_invalid_interval_remainder(lexer, state)
  ) {
    *symbol = REGEX_INVALID_INTERVAL;
    return true;
  }

  const bool inside_bracket = regex_is_inside_bracket(state);
  if (inside_bracket) {
    if (
      valid_symbols[REGEX_CLASS_NAME] ||
      valid_symbols[REGEX_COLL_ELEM_SINGLE] ||
      valid_symbols[REGEX_COLL_ELEM_MULTI] ||
      valid_symbols[REGEX_META_CHAR]
    ) {
      return scan_regex_bracket_term_content(
        lexer,
        state,
        bracket_term_close_marker(state->regex_bracket_term_state),
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
      state->regex_bracket_term_state = REGEX_BRACKET_TERM_NONE;
      finish_compound_bracket_element(state);
      *symbol = REGEX_MALFORMED_BRACKET_TERM;
      return true;
    }
    if (valid_symbols[REGEX_COLON_CLOSE] && lexer->lookahead == ':') {
      return scan_regex_bracket_term_close(
        lexer,
        state,
        ':',
        REGEX_COLON_CLOSE,
        valid_symbols,
        symbol
      );
    }
    if (valid_symbols[REGEX_DOT_CLOSE] && lexer->lookahead == '.') {
      return scan_regex_bracket_term_close(
        lexer,
        state,
        '.',
        REGEX_DOT_CLOSE,
        valid_symbols,
        symbol
      );
    }
    if (valid_symbols[REGEX_EQUAL_CLOSE] && lexer->lookahead == '=') {
      return scan_regex_bracket_term_close(
        lexer,
        state,
        '=',
        REGEX_EQUAL_CLOSE,
        valid_symbols,
        symbol
      );
    }
  }

  const enum LiteralScanResult literal_result =
    scan_regex_literal(lexer, state);
  if (literal_result == LITERAL_SCAN_TOKEN) {
    return emit_symbol(
      valid_symbols,
      inside_bracket ? REGEX_BRACKET_LITERAL : REGEX_LITERAL,
      symbol
    );
  }
  if (literal_result == LITERAL_SCAN_LINE_END) {
    return emit_unterminated(
      state,
      valid_symbols,
      regex_unterminated_symbol(state->mode, lexer->eof(lexer)),
      symbol
    );
  }

  if (state->regex_state == REGEX_OUTSIDE_BRACKET) {
    if (lexer->lookahead == '^') {
      consume(lexer);
#if !SED_REGEX_EXTENDED
      if (
        state->regex_group_depth >
        0 &&
        state->regex_at_branch_start &&
        !state->regex_after_anchor
      ) {
        return emit_symbol(
          valid_symbols,
          REGEX_BRE_SUBEXPRESSION_CARET,
          symbol
        );
      }
#endif
      const bool is_beginning_anchor = SED_REGEX_EXTENDED ||
        (state->regex_at_branch_start && !state->regex_after_anchor);
      const TSSymbol candidate =
        is_beginning_anchor ? REGEX_BEGINNING_ANCHOR : REGEX_LITERAL;
      return emit_symbol(valid_symbols, candidate, symbol);
    }

    if (lexer->lookahead == '$') {
      bool inspected_bre_escape = false;
      consume(lexer);
#if !SED_REGEX_EXTENDED
      if (lexer->lookahead == '\\') {
        inspected_bre_escape = true;
        advance(lexer);
        if (state->regex_group_depth > 0 && lexer->lookahead == ')') {
          return emit_symbol(
            valid_symbols,
            REGEX_BRE_SUBEXPRESSION_DOLLAR,
            symbol
          );
        }
      }
#endif
      const bool at_branch_end = SED_REGEX_EXTENDED ||
        (!inspected_bre_escape &&
          (lexer->eof(lexer) ||
            lexer->lookahead ==
            '\n' ||
            lexer->lookahead == state->delimiter));
      const TSSymbol candidate =
        at_branch_end ? REGEX_END_ANCHOR : REGEX_LITERAL;
      return emit_symbol(valid_symbols, candidate, symbol);
    }

    if (lexer->lookahead == '.') {
      consume(lexer);
      return emit_symbol(valid_symbols, REGEX_PERIOD, symbol);
    }

    if (lexer->lookahead == '\\') {
      advance(lexer);
      lexer->mark_end(lexer);
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

  if (state->regex_state == REGEX_BRACKET_FIRST && lexer->lookahead == '^') {
    consume(lexer);
    state->regex_state = REGEX_BRACKET_AFTER_CARET;
    return emit_symbol(valid_symbols, REGEX_BRACKET_NEGATION, symbol);
  }

  if (state->regex_state == REGEX_BRACKET_BODY && lexer->lookahead == ']') {
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

  if (state->regex_state == REGEX_BRACKET_BODY && lexer->lookahead == '-') {
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

  if (lexer->lookahead == '[') {
    return scan_regex_bracket_opener(lexer, state, valid_symbols, symbol);
  }

  return false;
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

    if (
      lexer->lookahead ==
      state->delimiter ||
      lexer->lookahead ==
      '\\' ||
      (ampersand_is_special && lexer->lookahead == '&')
    ) {
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
  advance(lexer);
  lexer->mark_end(lexer);

  if (lexer->eof(lexer)) {
    return emit_symbol(valid_symbols, REPLACEMENT_INCOMPLETE_ESCAPE, symbol);
  }

  if (lexer->lookahead == '\n') {
    consume(lexer);
    return emit_symbol(valid_symbols, REPLACEMENT_ESCAPED_NEWLINE, symbol);
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
    consume(lexer);
    return emit_symbol(valid_symbols, REPLACEMENT_NONPORTABLE_ESCAPE, symbol);
  }
  if (lexer->lookahead == state->delimiter) {
    candidate = state->delimiter == '&'
      ? REPLACEMENT_AMPERSAND_ESCAPED_DELIMITER
      : REPLACEMENT_ESCAPED_DELIMITER;
  } else if (is_digit(lexer->lookahead)) {
    candidate = REPLACEMENT_BACKREFERENCE;
  }

  consume(lexer);
  return emit_symbol(valid_symbols, candidate, symbol);
}

static bool scan_replacement_token(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  const enum LiteralScanResult literal_result =
    scan_operand_literal(lexer, state, true);
  if (literal_result == LITERAL_SCAN_TOKEN) {
    return emit_symbol(valid_symbols, REPLACEMENT_LITERAL, symbol);
  }
  if (literal_result == LITERAL_SCAN_LINE_END) {
    return emit_unterminated(
      state,
      valid_symbols,
      lexer->eof(lexer) ? REPLACEMENT_UNTERMINATED
                        : REPLACEMENT_LINE_UNTERMINATED,
      symbol
    );
  }

  if (lexer->lookahead == '\\') {
    return scan_replacement_escape(lexer, state, valid_symbols, symbol);
  }

  if (lexer->lookahead == '&') {
    consume(lexer);
    return emit_symbol(valid_symbols, REPLACEMENT_MATCH_REFERENCE, symbol);
  }

  return false;
}

static TSSymbol
translate_unterminated_symbol(enum ScannerMode mode, bool at_end_of_source) {
  if (mode == MODE_TRANSLATE_SOURCE) {
    return at_end_of_source ? TRANSLATE_UNTERMINATED_SOURCE
                            : TRANSLATE_LINE_UNTERMINATED_SOURCE;
  }
  return at_end_of_source ? TRANSLATE_UNTERMINATED_DESTINATION
                          : TRANSLATE_LINE_UNTERMINATED_DESTINATION;
}

static bool scan_translate_escape(
  TSLexer *lexer,
  const ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  advance(lexer);
  lexer->mark_end(lexer);

  if (lexer->eof(lexer)) {
    return emit_symbol(valid_symbols, TRANSLATE_INCOMPLETE_ESCAPE, symbol);
  }

  if (lexer->lookahead == '\n') {
    return emit_symbol(valid_symbols, TRANSLATE_NONPORTABLE_ESCAPE, symbol);
  }

  if (
    lexer->lookahead !=
    'n' &&
    lexer->lookahead !=
    '\\' &&
    (lexer->lookahead != state->delimiter || state->delimiter == 'n')
  ) {
    consume(lexer);
    return emit_symbol(valid_symbols, TRANSLATE_NONPORTABLE_ESCAPE, symbol);
  }
  const TSSymbol candidate = lexer->lookahead == 'n' || lexer->lookahead == '\\'
    ? TRANSLATE_ESCAPE
    : TRANSLATE_ESCAPED_DELIMITER;
  consume(lexer);
  return emit_symbol(valid_symbols, candidate, symbol);
}

static bool scan_translate_token(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  const enum LiteralScanResult literal_result =
    scan_operand_literal(lexer, state, false);
  if (literal_result == LITERAL_SCAN_TOKEN) {
    return emit_symbol(valid_symbols, TRANSLATE_LITERAL, symbol);
  }
  if (literal_result == LITERAL_SCAN_LINE_END) {
    return emit_unterminated(
      state,
      valid_symbols,
      translate_unterminated_symbol(state->mode, lexer->eof(lexer)),
      symbol
    );
  }

  if (lexer->lookahead == '\\') {
    return scan_translate_escape(lexer, state, valid_symbols, symbol);
  }

  return false;
}

static bool scan_regex_recovery_marker(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
#if !SED_REGEX_EXTENDED
  if (
    emit_missing_marker(
      lexer,
      valid_symbols,
      BRE_VERTICAL_LINE_ESCAPE_MARKER,
      symbol
    ) ||
    emit_missing_marker(
      lexer,
      valid_symbols,
      BRE_QUESTION_MARK_ESCAPE_MARKER,
      symbol
    ) ||
    emit_missing_marker(lexer, valid_symbols, BRE_PLUS_ESCAPE_MARKER, symbol)
  ) {
    return true;
  }
#endif

  const bool at_line_boundary = lexer->eof(lexer) || lexer->lookahead == '\n';
  const bool at_regex_end =
    at_line_boundary || lexer->lookahead == state->delimiter;

  if (
    state->regex_state ==
    REGEX_OUTSIDE_BRACKET &&
    state->regex_group_depth >
    0 &&
    !state->regex_after_alternation &&
    at_regex_end &&
    emit_missing_marker(
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
    emit_missing_marker(
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
    emit_missing_marker(
      lexer,
      valid_symbols,
      lexer->eof(lexer) ? REGEX_INCOMPLETE_BRACKET_TERM
                        : REGEX_MALFORMED_BRACKET_TERM,
      symbol
    )
  ) {
    state->regex_bracket_term_state = REGEX_BRACKET_TERM_NONE;
    finish_compound_bracket_element(state);
    return true;
  }

  if (
    regex_is_inside_bracket(state) &&
    at_line_boundary &&
    emit_missing_marker(
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
    state->regex_after_alternation &&
    at_regex_end &&
    emit_missing_marker(
      lexer,
      valid_symbols,
      lexer->eof(lexer) ? INCOMPLETE_ALTERNATIVE_MARKER
                        : EMPTY_ALTERNATIVE_MARKER,
      symbol
    )
  ) {
    state->regex_after_alternation = false;
    return true;
  }
#endif

  if (
    state->regex_interval_state !=
    REGEX_INTERVAL_NONE &&
    (at_regex_end
#if !SED_REGEX_EXTENDED
     || (state->delimiter == '}' && lexer->lookahead == '\\')
#endif
    ) &&
    emit_missing_marker(
      lexer,
      valid_symbols,
      lexer->eof(lexer) ? REGEX_INCOMPLETE_INTERVAL : REGEX_INVALID_INTERVAL,
      symbol
    )
  ) {
    state->regex_interval_state = REGEX_INTERVAL_NONE;
    return true;
  }

  if (
    state->regex_state ==
    REGEX_OUTSIDE_BRACKET &&
    state->regex_group_depth >
    0 &&
    at_line_boundary &&
    emit_missing_marker(
      lexer,
      valid_symbols,
      lexer->eof(lexer) ? REGEX_INCOMPLETE_GROUP : REGEX_UNCLOSED_GROUP,
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

static bool scan_command_token(
  TSLexer *lexer,
  ScannerState *state,
  const bool *valid_symbols,
  TSSymbol *symbol
) {
  if (valid_symbols[LINE_WORD] && scan_to_physical_line_end(lexer, false)) {
    *symbol = LINE_WORD;
    return true;
  }

  if (valid_symbols[FLAG_AFTER_WRITE_MARKER]) {
    const enum FlagAfterWriteScan scan = scan_flag_after_write_marker(lexer);
    if (scan == FLAG_AFTER_WRITE_MATCH) {
      *symbol = FLAG_AFTER_WRITE_MARKER;
      return true;
    }
    if (
      scan ==
      FLAG_AFTER_WRITE_FALLBACK &&
      valid_symbols[OMITTED_FILE_SEPARATOR_MARKER]
    ) {
      *symbol = OMITTED_FILE_SEPARATOR_MARKER;
      return true;
    }
    if (scan == FLAG_AFTER_WRITE_FALLBACK) {
      return false;
    }
  }

  if (
    valid_symbols[SUBSTITUTION_WFILE_ARGUMENT] &&
    scan_substitution_wfile_argument(lexer)
  ) {
    *symbol = SUBSTITUTION_WFILE_ARGUMENT;
    return true;
  }

  if (valid_symbols[FILE_ARGUMENT] && scan_file_argument(lexer)) {
    *symbol = FILE_ARGUMENT;
    return true;
  }

  if (
    valid_symbols[INVALID_SUBSTITUTION_FLAG] &&
    !is_blank(lexer->lookahead) &&
    !is_substitution_flag_character(lexer->lookahead) &&
    lexer->lookahead !=
    ';' &&
    lexer->lookahead !=
    '}' &&
    lexer->lookahead !=
    '\n' &&
    !lexer->eof(lexer)
  ) {
    consume(lexer);
    *symbol = INVALID_SUBSTITUTION_FLAG;
    return true;
  }

  if (valid_symbols[TEXT_COMMAND_START] && lexer->lookahead == '\\') {
    if (scan_text_command_start(lexer, state)) {
      *symbol = TEXT_COMMAND_START;
      return true;
    }
    return emit_symbol(
      valid_symbols,
      missing_text_introducer_symbol(lexer),
      symbol
    );
  }

  if (valid_symbols[DEFAULT_OUTPUT_SUPPRESSION] && lexer->lookahead == 'n') {
    consume(lexer);
    *symbol = DEFAULT_OUTPUT_SUPPRESSION;
    return true;
  }

  if (valid_symbols[COMMENT_TEXT] && scan_to_physical_line_end(lexer, false)) {
    *symbol = COMMENT_TEXT;
    return true;
  }

  // Preserve an address interpretation before reserved-function recovery.
  if (
    valid_symbols[MISSING_ADDRESS_SEPARATOR_MARKER] && can_start_address(lexer)
  ) {
    return emit_missing_marker(
      lexer,
      valid_symbols,
      MISSING_ADDRESS_SEPARATOR_MARKER,
      symbol
    );
  }

  if (
    valid_symbols[RESERVED_UNKNOWN_FUNCTION_TOKEN] &&
    scan_reserved_unknown_function(lexer)
  ) {
    *symbol = RESERVED_UNKNOWN_FUNCTION_TOKEN;
    return true;
  }

  if (
    valid_symbols[REGEX_ADDRESS_START] &&
    lexer->lookahead ==
    '/' &&
    scan_simple_delimiter(lexer, state, MODE_REGEX_ADDRESS)
  ) {
    *symbol = REGEX_ADDRESS_START;
    return true;
  }

  if (valid_symbols[ESCAPED_REGEX_ADDRESS_START]) {
    if (scan_simple_delimiter(lexer, state, MODE_REGEX_ADDRESS)) {
      *symbol = ESCAPED_REGEX_ADDRESS_START;
      return true;
    }
  }

  if (valid_symbols[SUBSTITUTE_START]) {
    if (scan_simple_delimiter(lexer, state, MODE_SUBSTITUTE_PATTERN)) {
      *symbol = SUBSTITUTE_START;
      return true;
    }
  }

  if (valid_symbols[TRANSLATE_START]) {
    if (scan_simple_delimiter(lexer, state, MODE_TRANSLATE_SOURCE)) {
      *symbol = TRANSLATE_START;
      return true;
    }
  }

  if (valid_symbols[RIGHT_BRACE] && scan_right_brace(lexer, state)) {
    *symbol = RIGHT_BRACE;
    return true;
  }

  if (
    valid_symbols[OMITTED_FIRST_ADDRESS_MARKER] &&
    lexer->lookahead ==
    ',' &&
    emit_missing_marker(
      lexer,
      valid_symbols,
      OMITTED_FIRST_ADDRESS_MARKER,
      symbol
    )
  ) {
    return true;
  }

  if (
    (valid_symbols[OMITTED_ADDRESS_MARKER] ||
      valid_symbols[INCOMPLETE_OMITTED_ADDRESS_MARKER]) &&
    !can_start_address(lexer) &&
    !is_blank(lexer->lookahead)
  ) {
    return emit_missing_marker(
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
      return false;
    case POST_BLANK_RECOVERY_SKIPPED:
      break;
    }
  }

  if (
    !at_command_boundary(lexer) &&
    !is_blank(lexer->lookahead) &&
    valid_symbols[OMITTED_FILE_SEPARATOR_MARKER] &&
    emit_missing_marker(
      lexer,
      valid_symbols,
      OMITTED_FILE_SEPARATOR_MARKER,
      symbol
    )
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
        emit_missing_marker(
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
    emit_missing_marker(
      lexer,
      valid_symbols,
      missing_text_introducer_symbol(lexer),
      symbol
    )
  ) {
    return true;
  }

  if (valid_symbols[MISSING_CLOSING_BRACE_MARKER] && lexer->eof(lexer)) {
    return emit_missing_marker(
      lexer,
      valid_symbols,
      MISSING_CLOSING_BRACE_MARKER,
      symbol
    );
  }

  if (
    !at_command_boundary(lexer) &&
    !is_blank(lexer->lookahead) &&
    emit_missing_marker(
      lexer,
      valid_symbols,
      MISSING_SEPARATOR_AFTER_UNMATCHED_BRACE_MARKER,
      symbol
    )
  ) {
    return true;
  }

  if (lexer->lookahead == '}') {
    if (
      emit_missing_marker(
        lexer,
        valid_symbols,
        MISSING_SEPARATOR_BEFORE_UNMATCHED_BRACE_MARKER,
        symbol
      )
    ) {
      return true;
    }
    if (
      emit_missing_marker(
        lexer,
        valid_symbols,
        MISSING_COMMAND_SEPARATOR_MARKER,
        symbol
      )
    ) {
      return true;
    }
  } else if (lexer->eof(lexer)) {
    if (
      emit_missing_marker(
        lexer,
        valid_symbols,
        INCOMPLETE_COMMAND_SEPARATOR_MARKER,
        symbol
      )
    ) {
      return true;
    }
  }

  const TSSymbol missing_opening_delimiter = lexer->eof(lexer)
    ? MISSING_OPENING_DELIMITER_MARKER
    : NONCONFORMING_MISSING_OPENING_DELIMITER_MARKER;
  if (
    delimiter_is_missing(lexer) &&
    emit_missing_marker(lexer, valid_symbols, missing_opening_delimiter, symbol)
  ) {
    return true;
  }

  return false;
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
    if (state->regex_group_depth > 0 && valid_symbols[REGEX_UNCLOSED_GROUP]) {
      state->regex_group_depth--;
      *symbol = REGEX_UNCLOSED_GROUP;
      return true;
    }
    return scan_active_mode_delimiter(lexer, state, valid_symbols, symbol);
  }

  switch (state->mode) {
  case MODE_REGEX_ADDRESS:
  case MODE_SUBSTITUTE_PATTERN:
    return scan_regex_token(lexer, state, valid_symbols, symbol);
  case MODE_SUBSTITUTE_REPLACEMENT:
    return scan_replacement_token(lexer, state, valid_symbols, symbol);
  case MODE_TRANSLATE_SOURCE:
  case MODE_TRANSLATE_DESTINATION:
    return scan_translate_token(lexer, state, valid_symbols, symbol);
  case MODE_TEXT:
    return false;
  case MODE_NONE:
    break;
  }

  return scan_command_token(lexer, state, valid_symbols, symbol);
}

static void
update_regex_position_after_symbol(ScannerState *state, TSSymbol symbol) {
#if !SED_REGEX_EXTENDED
  if (
    symbol ==
    BRE_VERTICAL_LINE_ESCAPE_MARKER ||
    symbol ==
    BRE_QUESTION_MARK_ESCAPE_MARKER ||
    symbol == BRE_PLUS_ESCAPE_MARKER
  ) {
    return;
  }
#endif
  if (
    symbol ==
    REGEX_LEADING_DUPLICATION_MARKER ||
    symbol == REGEX_ADJACENT_DUPLICATION_MARKER
  ) {
    return;
  }

  const bool is_regex_token =
    symbol >= REGEX_LITERAL && symbol <= REGEX_MALFORMED_BRACKET_TERM;
  if (!is_regex_token) {
    return;
  }

  if (symbol == REGEX_GROUP_OPEN) {
    if (state->regex_group_depth < UINT16_MAX) {
      state->regex_group_depth++;
    }
    set_regex_position(state, true, REGEX_DUPLICATION_NONE, false, false);
    return;
  }

  if (symbol == REGEX_GROUP_CLOSE) {
    if (state->regex_group_depth > 0) {
      state->regex_group_depth--;
    }
    set_regex_position(state, false, REGEX_DUPLICATION_NONE, false, false);
    return;
  }

#if SED_REGEX_EXTENDED
  if (symbol == REGEX_ALTERNATION_OPERATOR) {
    set_regex_position(state, true, REGEX_DUPLICATION_NONE, true, false);
    return;
  }
#endif

  bool is_anchor =
    symbol == REGEX_BEGINNING_ANCHOR || symbol == REGEX_END_ANCHOR;
#if !SED_REGEX_EXTENDED
  is_anchor = is_anchor ||
    symbol ==
    REGEX_BRE_SUBEXPRESSION_CARET ||
    symbol == REGEX_BRE_SUBEXPRESSION_DOLLAR;
#endif
  if (is_anchor) {
    set_regex_position(state, true, REGEX_DUPLICATION_NONE, false, true);
    return;
  }

  bool is_duplication = symbol ==
    REGEX_ZERO_OR_MORE ||
    symbol ==
    REGEX_INTERVAL_CLOSE ||
    symbol == REGEX_INVALID_INTERVAL;
#if SED_REGEX_EXTENDED
  is_duplication = is_duplication ||
    symbol ==
    REGEX_ONE_OR_MORE ||
    symbol == REGEX_ZERO_OR_ONE;
#endif
  if (is_duplication) {
    set_regex_position(
      state,
      false,
      REGEX_AFTER_DUPLICATION_SYMBOL,
      false,
      false
    );
    return;
  }

#if SED_REGEX_EXTENDED
  if (symbol == REGEX_REPETITION_MODIFIER) {
    set_regex_position(
      state,
      false,
      REGEX_AFTER_REPETITION_MODIFIER,
      false,
      false
    );
    return;
  }
#endif

  set_regex_position(state, false, REGEX_DUPLICATION_NONE, false, false);
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
