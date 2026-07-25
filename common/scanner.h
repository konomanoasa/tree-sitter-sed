#ifndef TREE_SITTER_SED_COMMON_SCANNER_H_
#define TREE_SITTER_SED_COMMON_SCANNER_H_

#ifndef SED_DIALECT_GNU
#error "SED_DIALECT_GNU must be defined before including scanner.h"
#endif

#include "tree_sitter/parser.h"

#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>

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
  REGEX_ESCAPE,
  REGEX_ESCAPED_DELIMITER,
  REGEX_ESCAPED_NEWLINE,
  REGEX_RAW_PARENTHESIS,
  REGEX_ESCAPED_PARENTHESIS,
  REGEX_BACKREFERENCE_CANDIDATE,
  REGEX_BRACKET_OPEN,
  REGEX_BRACKET_CLOSE,
  REGEX_POSIX_CHARACTER_CLASS,
  REGEX_COLLATING_SYMBOL,
  REGEX_EQUIVALENCE_CLASS,
  REGEX_INCOMPLETE_ESCAPE,
  REGEX_UNTERMINATED_ADDRESS,
  REGEX_UNTERMINATED_SUBSTITUTE,
  REPLACEMENT_LITERAL,
  REPLACEMENT_MATCH_REFERENCE,
  REPLACEMENT_BACKREFERENCE,
  REPLACEMENT_ESCAPED_DELIMITER,
  REPLACEMENT_ESCAPE_SEQUENCE,
  REPLACEMENT_ESCAPED_NEWLINE,
  REPLACEMENT_INCOMPLETE_ESCAPE,
  REPLACEMENT_UNTERMINATED,
  TRANSLATE_LITERAL,
  TRANSLATE_ESCAPED_DELIMITER,
  TRANSLATE_ESCAPE,
  TRANSLATE_ESCAPED_NEWLINE,
  TRANSLATE_INCOMPLETE_ESCAPE,
  TRANSLATE_UNTERMINATED_SOURCE,
  TRANSLATE_UNTERMINATED_DESTINATION,
  TEXT_COMMAND_START,
  TEXT_BLOCK,
  FIRST_LINE_SILENT,
  COMMENT_TEXT,
  FILE_ARGUMENT,
  LINE_WORD,
  RIGHT_BRACE,
#if SED_DIALECT_GNU
  REGEX_GNU_CHARACTER_ESCAPE,
  REGEX_GNU_CONTROL_ESCAPE,
  REGEX_INVALID_CONTROL_ESCAPE,
  REPLACEMENT_CASE_CONVERSION,
  VERSION_ARGUMENT,
  SHELL_COMMAND,
  GNU_OUTER_LOOP_WHITESPACE,
#endif
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
  MODE_TEXT_LEADIN,
};

enum RegexState {
  REGEX_OUTSIDE_BRACKET,
  REGEX_BRACKET_FIRST,
  REGEX_BRACKET_AFTER_CARET,
  REGEX_BRACKET_BODY,
};

typedef struct {
  int32_t delimiter;
  enum ScannerMode mode;
  enum RegexState regex_state;
} ScannerState;

enum {
  SCANNER_SERIALIZATION_VERSION = 3,
  SCANNER_SERIALIZED_STATE_SIZE = 7,
};

static void reset_state(ScannerState *state) {
  state->delimiter = 0;
  state->mode = MODE_NONE;
  state->regex_state = REGEX_OUTSIDE_BRACKET;
}

static void *sed_scanner_create(void) {
  ScannerState *state = calloc(1, sizeof(ScannerState));
  return state;
}

static void sed_scanner_destroy(void *payload) {
  free(payload);
}

static unsigned sed_scanner_serialize(void *payload, char *buffer) {
  const ScannerState *state = payload;
  const uint32_t delimiter = (uint32_t)state->delimiter;

  buffer[0] = SCANNER_SERIALIZATION_VERSION;
  buffer[1] = (char)state->mode;
  buffer[2] = (char)state->regex_state;
  buffer[3] = (char)(delimiter & UINT32_C(0xff));
  buffer[4] = (char)((delimiter >> 8) & UINT32_C(0xff));
  buffer[5] = (char)((delimiter >> 16) & UINT32_C(0xff));
  buffer[6] = (char)((delimiter >> 24) & UINT32_C(0xff));
  return SCANNER_SERIALIZED_STATE_SIZE;
}

static void sed_scanner_deserialize(
    void *payload,
    const char *buffer,
    unsigned length) {
  ScannerState *state = payload;
  reset_state(state);

  if (length != SCANNER_SERIALIZED_STATE_SIZE ||
      (unsigned char)buffer[0] != SCANNER_SERIALIZATION_VERSION) {
    return;
  }

  const enum ScannerMode mode =
      (enum ScannerMode)(unsigned char)buffer[1];
  const enum RegexState regex_state =
      (enum RegexState)(unsigned char)buffer[2];
  const uint32_t delimiter =
      (uint32_t)(unsigned char)buffer[3] |
      ((uint32_t)(unsigned char)buffer[4] << 8) |
      ((uint32_t)(unsigned char)buffer[5] << 16) |
      ((uint32_t)(unsigned char)buffer[6] << 24);

  if (mode < MODE_NONE || mode > MODE_TEXT_LEADIN) {
    return;
  }

  if (regex_state < REGEX_OUTSIDE_BRACKET ||
      regex_state > REGEX_BRACKET_BODY) {
    return;
  }

  if (mode == MODE_NONE) {
    return;
  }

  if (mode == MODE_TEXT || mode == MODE_TEXT_LEADIN) {
    if (delimiter == 0 && regex_state == REGEX_OUTSIDE_BRACKET) {
      state->mode = mode;
    }
    return;
  }

  if (delimiter == 0 || delimiter > UINT32_C(0x10ffff) ||
      (delimiter >= UINT32_C(0xd800) &&
       delimiter <= UINT32_C(0xdfff)) ||
      delimiter == (uint32_t)'\\' || delimiter == (uint32_t)'\n' ||
      delimiter == (uint32_t)'\r') {
    return;
  }

  if (mode != MODE_REGEX_ADDRESS &&
      mode != MODE_SUBSTITUTE_PATTERN &&
      regex_state != REGEX_OUTSIDE_BRACKET) {
    return;
  }

  state->mode = mode;
  state->delimiter = (int32_t)delimiter;
  state->regex_state = regex_state;
}

static void advance(TSLexer *lexer) {
  lexer->advance(lexer, false);
}

static bool invalid_delimiter(TSLexer *lexer) {
  return lexer->eof(lexer) || lexer->lookahead == 0 ||
         lexer->lookahead == '\\' || lexer->lookahead == '\n' ||
         lexer->lookahead == '\r';
}

static bool scan_simple_delimiter(
    TSLexer *lexer,
    ScannerState *state,
    enum ScannerMode next_mode) {
  if (invalid_delimiter(lexer)) {
    return false;
  }

  state->delimiter = lexer->lookahead;
  state->mode = next_mode;
  state->regex_state = REGEX_OUTSIDE_BRACKET;
  advance(lexer);
  lexer->mark_end(lexer);
  return true;
}

static bool scan_regex_address_start(TSLexer *lexer, ScannerState *state) {
  if (lexer->lookahead != '/') {
    return false;
  }

  state->delimiter = '/';
  state->mode = MODE_REGEX_ADDRESS;
  state->regex_state = REGEX_OUTSIDE_BRACKET;
  advance(lexer);
  lexer->mark_end(lexer);
  return true;
}

static bool scan_escaped_regex_address_start(
    TSLexer *lexer,
    ScannerState *state) {
  return scan_simple_delimiter(lexer, state, MODE_REGEX_ADDRESS);
}

static bool scan_mode_delimiter(
    TSLexer *lexer,
    ScannerState *state,
    enum ScannerMode expected_mode,
    enum ScannerMode next_mode) {
  if (state->mode != expected_mode || lexer->lookahead != state->delimiter) {
    return false;
  }

  state->mode = next_mode;
  state->regex_state = REGEX_OUTSIDE_BRACKET;
  if (next_mode == MODE_NONE) {
    state->delimiter = 0;
  }
  advance(lexer);
  lexer->mark_end(lexer);
  return true;
}

static void consume(TSLexer *lexer) {
  advance(lexer);
  lexer->mark_end(lexer);
}

static bool scan_text_command_start(
    TSLexer *lexer,
    ScannerState *state) {
  if (state->mode != MODE_NONE || lexer->lookahead != '\\') {
    return false;
  }

  advance(lexer);
  lexer->mark_end(lexer);

  if (lexer->eof(lexer)) {
#if !SED_DIALECT_GNU
    return false;
#else
    state->mode = MODE_TEXT;
    return true;
#endif
  }

  if (lexer->lookahead == '\r') {
    advance(lexer);
    if (lexer->lookahead != '\n') {
#if !SED_DIALECT_GNU
      return false;
#else
      state->mode = MODE_TEXT_LEADIN;
      return true;
#endif
    }
  } else if (lexer->lookahead != '\n') {
#if !SED_DIALECT_GNU
    return false;
#else
    state->mode = MODE_TEXT_LEADIN;
    return true;
#endif
  }

  consume(lexer);
  state->mode = MODE_TEXT;
  return true;
}

static bool scan_continued_line_text(
    TSLexer *lexer,
    bool consumed,
    bool escaped) {
  while (!lexer->eof(lexer)) {
    if (lexer->lookahead == '\n') {
      if (!escaped) {
        break;
      }

      consume(lexer);
      consumed = true;
      escaped = false;
      continue;
    }

    if (lexer->lookahead == '\r') {
      advance(lexer);
      if (lexer->lookahead == '\n') {
        if (!escaped) {
          break;
        }

        consume(lexer);
        consumed = true;
        escaped = false;
        continue;
      }

      lexer->mark_end(lexer);
      consumed = true;
      escaped = false;
      continue;
    }

    escaped = lexer->lookahead == '\\' ? !escaped : false;
    consume(lexer);
    consumed = true;
  }

  return consumed;
}

static bool scan_text_block(TSLexer *lexer, ScannerState *state) {
  if (state->mode != MODE_TEXT && state->mode != MODE_TEXT_LEADIN) {
    return false;
  }

  if (lexer->eof(lexer)) {
    bool allow_empty = state->mode == MODE_TEXT;
    reset_state(state);
    lexer->mark_end(lexer);
    return allow_empty;
  }

  if (lexer->lookahead == '\n') {
    reset_state(state);
    lexer->mark_end(lexer);
    return true;
  }

  bool consumed = false;
  if (lexer->lookahead == '\r') {
    lexer->mark_end(lexer);
    advance(lexer);
    if (lexer->lookahead == '\n') {
      reset_state(state);
      return true;
    }
    lexer->mark_end(lexer);
    consumed = true;
  } else if (state->mode == MODE_TEXT_LEADIN) {
    consume(lexer);
    consumed = true;
  }

  scan_continued_line_text(lexer, consumed, false);
  reset_state(state);
  return true;
}

#if SED_DIALECT_GNU
static bool scan_inline_text_block(TSLexer *lexer) {
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
    lexer->advance(lexer, true);
  }

  if (lexer->eof(lexer)) {
    return false;
  }

  if (lexer->lookahead == '\\') {
    return false;
  }

  if (lexer->lookahead == '\n') {
    lexer->mark_end(lexer);
    return true;
  }

  if (lexer->lookahead == '\r') {
    lexer->mark_end(lexer);
    advance(lexer);
    if (lexer->lookahead == '\n') {
      return true;
    }
    lexer->mark_end(lexer);
    return scan_continued_line_text(lexer, true, false);
  }

  return scan_continued_line_text(lexer, false, false);
}

static bool scan_shell_command(TSLexer *lexer) {
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
    lexer->advance(lexer, true);
  }

  if (lexer->eof(lexer) || lexer->lookahead == '\n') {
    return false;
  }

  bool consumed = false;

  if (lexer->lookahead == '\r') {
    lexer->mark_end(lexer);
    advance(lexer);
    if (lexer->lookahead == '\n') {
      return false;
    }
    lexer->mark_end(lexer);
    consumed = true;
  }

  /*
   * GNU sed treats an initial backslash as the legacy command-text introducer,
   * just like a/c/i. It is source syntax, so it must not affect the trailing
   * backslash parity that decides whether the shell command continues.
   */
  if (!consumed && lexer->lookahead == '\\') {
    consume(lexer);
    consumed = true;

    if (lexer->eof(lexer)) {
      return true;
    }

    if (lexer->lookahead == '\r') {
      advance(lexer);
      if (lexer->lookahead == '\n') {
        consume(lexer);
      } else {
        lexer->mark_end(lexer);
      }
    } else if (lexer->lookahead == '\n') {
      consume(lexer);
    } else {
      consume(lexer);
    }
  }

  return scan_continued_line_text(lexer, consumed, false);
}

static bool is_gnu_outer_loop_control(int32_t character) {
  return character == '\v' || character == '\f' || character == '\r';
}

/* Consume bare CR, but leave the CR in CRLF for the newline token. */
static bool scan_gnu_outer_loop_whitespace(TSLexer *lexer) {
  if (!is_gnu_outer_loop_control(lexer->lookahead)) {
    return false;
  }

  bool consumed = false;
  for (;;) {
    if (lexer->lookahead == '\r') {
      advance(lexer);
      if (lexer->lookahead == '\n') {
        return consumed;
      }
      consumed = true;
      lexer->mark_end(lexer);
    } else if (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
               lexer->lookahead == '\v' || lexer->lookahead == '\f') {
      advance(lexer);
      consumed = true;
      lexer->mark_end(lexer);
    } else {
      return consumed;
    }
  }
}
#endif

static bool scan_to_physical_line_end(TSLexer *lexer, bool consumed) {
  while (!lexer->eof(lexer)) {
    if (lexer->lookahead == '\n') {
      return consumed;
    }

    if (lexer->lookahead == '\r') {
      advance(lexer);
      if (lexer->lookahead == '\n') {
        return consumed;
      }
      lexer->mark_end(lexer);
      consumed = true;
      continue;
    }

    consume(lexer);
    consumed = true;
  }

  return consumed;
}

static bool scan_first_line_silent(TSLexer *lexer) {
  if (lexer->lookahead != '#') {
    return false;
  }

  advance(lexer);

  if (lexer->lookahead != 'n') {
    return false;
  }

  consume(lexer);
  return scan_to_physical_line_end(lexer, true);
}

static bool scan_comment_text(TSLexer *lexer) {
  return scan_to_physical_line_end(lexer, false);
}

enum LineTokenScanResult {
  LINE_TOKEN_NONE,
  LINE_TOKEN_VALUE,
  LINE_TOKEN_EMPTY_AT_CRLF,
};

static enum LineTokenScanResult scan_file_argument(TSLexer *lexer) {
  if (lexer->eof(lexer) || lexer->lookahead == ' ' ||
      lexer->lookahead == '\t' || lexer->lookahead == '\n') {
    return LINE_TOKEN_NONE;
  }

  if (lexer->lookahead == '\r') {
    lexer->mark_end(lexer);
    advance(lexer);
    if (lexer->lookahead == '\n') {
      return LINE_TOKEN_EMPTY_AT_CRLF;
    }
    lexer->mark_end(lexer);
  } else {
    consume(lexer);
  }

  (void)scan_to_physical_line_end(lexer, true);
  return LINE_TOKEN_VALUE;
}

#if SED_DIALECT_GNU
static bool is_line_word_boundary(int32_t character) {
  return character == ';' || character == '\n';
}

static bool is_version_argument_boundary(int32_t character) {
  return character == ' ' || character == '\t' || character == ';' ||
         character == '#' || character == '}' || character == '\n';
}
#endif

static enum LineTokenScanResult scan_line_word(TSLexer *lexer) {
#if !SED_DIALECT_GNU
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
    lexer->advance(lexer, true);
  }

  if (lexer->lookahead == '\r') {
    lexer->mark_end(lexer);
    advance(lexer);
    if (lexer->lookahead == '\n') {
      return LINE_TOKEN_EMPTY_AT_CRLF;
    }
    lexer->mark_end(lexer);
    (void)scan_to_physical_line_end(lexer, true);
    return LINE_TOKEN_VALUE;
  }

  return scan_to_physical_line_end(lexer, false)
             ? LINE_TOKEN_VALUE
             : LINE_TOKEN_NONE;
#else
  bool consumed = false;
  lexer->mark_end(lexer);

  while (!lexer->eof(lexer) &&
         !is_line_word_boundary(lexer->lookahead)) {
    if (lexer->lookahead == '\r') {
      advance(lexer);
      if (lexer->lookahead == '\n') {
        return consumed ? LINE_TOKEN_VALUE : LINE_TOKEN_EMPTY_AT_CRLF;
      }
      lexer->mark_end(lexer);
      consumed = true;
      continue;
    }

    if (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
      lexer->advance(lexer, !consumed);
    } else {
      consume(lexer);
      consumed = true;
    }
  }

  return consumed ? LINE_TOKEN_VALUE : LINE_TOKEN_NONE;
#endif
}

#if SED_DIALECT_GNU
static enum LineTokenScanResult scan_version_argument(TSLexer *lexer) {
  bool consumed = false;

  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
    lexer->advance(lexer, true);
  }

  while (!lexer->eof(lexer) &&
         !is_version_argument_boundary(lexer->lookahead)) {
    if (lexer->lookahead == '\r') {
      lexer->mark_end(lexer);
      advance(lexer);
      if (lexer->lookahead == '\n') {
        return consumed ? LINE_TOKEN_VALUE : LINE_TOKEN_EMPTY_AT_CRLF;
      }
      lexer->mark_end(lexer);
      consumed = true;
      continue;
    }

    consume(lexer);
    consumed = true;
  }

  return consumed ? LINE_TOKEN_VALUE : LINE_TOKEN_NONE;
}
#endif

static bool scan_right_brace(TSLexer *lexer, ScannerState *state) {
  if (state->mode != MODE_NONE) {
    return false;
  }

  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
    lexer->advance(lexer, true);
  }

  if (lexer->lookahead != '}') {
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

static bool emit_symbol(
    const bool *valid_symbols,
    TSSymbol candidate,
    TSSymbol *symbol) {
  if (!valid_symbols[candidate]) {
    return false;
  }

  *symbol = candidate;
  return true;
}

static bool is_regex_mode(enum ScannerMode mode) {
  return mode == MODE_REGEX_ADDRESS ||
         mode == MODE_SUBSTITUTE_PATTERN;
}

static bool regex_is_inside_bracket(const ScannerState *state) {
  return state->regex_state != REGEX_OUTSIDE_BRACKET;
}

static void finish_first_bracket_element(ScannerState *state) {
  if (state->regex_state == REGEX_BRACKET_FIRST ||
      state->regex_state == REGEX_BRACKET_AFTER_CARET) {
    state->regex_state = REGEX_BRACKET_BODY;
  }
}

static void update_bracket_state_after_literal(
    ScannerState *state,
    int32_t character) {
  if (state->regex_state == REGEX_BRACKET_FIRST) {
    state->regex_state =
        character == '^' ? REGEX_BRACKET_AFTER_CARET
                         : REGEX_BRACKET_BODY;
  } else if (state->regex_state == REGEX_BRACKET_AFTER_CARET) {
    state->regex_state = REGEX_BRACKET_BODY;
  }
}

static bool regex_literal_boundary(
    const ScannerState *state,
    int32_t character) {
  if (state->regex_state == REGEX_OUTSIDE_BRACKET) {
    return character == state->delimiter || character == '\\' ||
           character == '(' || character == ')' || character == '[';
  }

  if (character == '[' ||
      (state->regex_state == REGEX_BRACKET_BODY &&
       character == ']')) {
    return true;
  }

#if SED_DIALECT_GNU
  if (character == '\\') {
    return true;
  }
#endif

  return false;
}

static bool regex_literal_stands_alone(
    const ScannerState *state,
    int32_t character) {
  if (state->regex_state == REGEX_OUTSIDE_BRACKET) {
    return character == '.' || character == '*' || character == '^' ||
           character == '$' || character == '+' || character == '?' ||
           character == '|' || character == '{' || character == '}' ||
           character == ',';
  }

  if (character == '^' || character == '-') {
    return true;
  }

  if ((state->regex_state == REGEX_BRACKET_FIRST ||
       state->regex_state == REGEX_BRACKET_AFTER_CARET) &&
      character == ']') {
    return true;
  }

#if !SED_DIALECT_GNU
  if (character == '\\') {
    return true;
  }
#endif

  return false;
}

static enum LiteralScanResult scan_regex_literal(
    TSLexer *lexer,
    ScannerState *state) {
  bool consumed = false;
  lexer->mark_end(lexer);

  for (;;) {
    if (lexer->eof(lexer) || lexer->lookahead == '\n') {
      return consumed ? LITERAL_SCAN_TOKEN : LITERAL_SCAN_LINE_END;
    }

    if (lexer->lookahead == '\r') {
      advance(lexer);
      if (lexer->lookahead == '\n') {
        return consumed ? LITERAL_SCAN_TOKEN : LITERAL_SCAN_LINE_END;
      }

      lexer->mark_end(lexer);
      consumed = true;
      update_bracket_state_after_literal(state, '\r');
      continue;
    }

    if (regex_literal_boundary(state, lexer->lookahead)) {
      return consumed ? LITERAL_SCAN_TOKEN : LITERAL_SCAN_NONE;
    }

    const bool stands_alone =
        regex_literal_stands_alone(state, lexer->lookahead);
    if (consumed && stands_alone) {
      return LITERAL_SCAN_TOKEN;
    }

    const int32_t character = lexer->lookahead;
    consume(lexer);
    consumed = true;
    update_bracket_state_after_literal(state, character);
    if (stands_alone) {
      return LITERAL_SCAN_TOKEN;
    }
  }
}

static TSSymbol regex_unterminated_symbol(enum ScannerMode mode) {
  return mode == MODE_REGEX_ADDRESS
             ? REGEX_UNTERMINATED_ADDRESS
             : REGEX_UNTERMINATED_SUBSTITUTE;
}

static bool emit_regex_unterminated(
    ScannerState *state,
    const bool *valid_symbols,
    TSSymbol *symbol) {
  const TSSymbol candidate = regex_unterminated_symbol(state->mode);
  if (!emit_symbol(valid_symbols, candidate, symbol)) {
    return false;
  }

  reset_state(state);
  return true;
}

static bool scan_regex_bracket_element(
    TSLexer *lexer,
    TSSymbol *candidate) {
  advance(lexer);
  lexer->mark_end(lexer);

  const int32_t marker = lexer->lookahead;
  switch (marker) {
    case ':':
      *candidate = REGEX_POSIX_CHARACTER_CLASS;
      break;
    case '.':
      *candidate = REGEX_COLLATING_SYMBOL;
      break;
    case '=':
      *candidate = REGEX_EQUIVALENCE_CLASS;
      break;
    default:
      return false;
  }

  advance(lexer);
  bool marker_can_close = false;

  for (;;) {
    if (lexer->eof(lexer) || lexer->lookahead == '\n') {
      return false;
    }

    if (lexer->lookahead == '\r') {
      advance(lexer);
      if (lexer->lookahead == '\n') {
        return false;
      }
      marker_can_close = false;
      continue;
    }

    if (lexer->lookahead == '[') {
      return false;
    }

    if (lexer->lookahead == marker) {
      advance(lexer);
      marker_can_close = !marker_can_close;
      continue;
    }

    if (lexer->lookahead == ']') {
      if (!marker_can_close) {
        return false;
      }

      advance(lexer);
      lexer->mark_end(lexer);
      return true;
    }

    advance(lexer);
    marker_can_close = false;
  }
}

static bool scan_regex_bracket_token(
    TSLexer *lexer,
    ScannerState *state,
    const bool *valid_symbols,
    TSSymbol *symbol) {
  TSSymbol candidate = REGEX_LITERAL;
  const bool complete = scan_regex_bracket_element(lexer, &candidate);
  finish_first_bracket_element(state);

  if (!complete) {
    return emit_symbol(valid_symbols, REGEX_LITERAL, symbol);
  }

  return emit_symbol(valid_symbols, candidate, symbol);
}

#if SED_DIALECT_GNU
static bool is_gnu_simple_regex_escape(int32_t character) {
  return character == 'a' || character == 'f' || character == 'n' ||
         character == 'r' || character == 't' || character == 'v';
}

static bool is_digit_for_base(int32_t character, unsigned base) {
  unsigned digit;

  if (character >= '0' && character <= '9') {
    digit = (unsigned)(character - '0');
  } else if (character >= 'A' && character <= 'F') {
    digit = (unsigned)(character - 'A') + 10U;
  } else if (character >= 'a' && character <= 'f') {
    digit = (unsigned)(character - 'a') + 10U;
  } else {
    return false;
  }

  return digit < base;
}

static bool scan_gnu_numeric_regex_escape(
    TSLexer *lexer,
    int32_t prefix,
    TSSymbol *candidate) {
  unsigned base;
  unsigned maximum_digits;

  if (prefix == 'd') {
    base = 10U;
    maximum_digits = 3U;
  } else if (prefix == 'o') {
    base = 8U;
    maximum_digits = 3U;
  } else if (prefix == 'x') {
    base = 16U;
    maximum_digits = 2U;
  } else {
    return false;
  }

  advance(lexer);
  lexer->mark_end(lexer);

  unsigned digits = 0U;
  while (digits < maximum_digits &&
         is_digit_for_base(lexer->lookahead, base)) {
    advance(lexer);
    digits += 1U;
  }

  if (digits == 0U) {
    return false;
  }

  lexer->mark_end(lexer);
  *candidate = REGEX_GNU_CHARACTER_ESCAPE;
  return true;
}

static bool scan_gnu_control_regex_escape(
    TSLexer *lexer,
    bool inside_bracket,
    TSSymbol *candidate) {
  advance(lexer);
  lexer->mark_end(lexer);

  if (lexer->eof(lexer) ||
      (inside_bracket &&
       (lexer->lookahead == '\n' || lexer->lookahead == '\r'))) {
    return false;
  }

  if (lexer->lookahead != '\\') {
    advance(lexer);
    lexer->mark_end(lexer);
    *candidate = REGEX_GNU_CONTROL_ESCAPE;
    return true;
  }

  advance(lexer);
  lexer->mark_end(lexer);
  if (lexer->eof(lexer)) {
    *candidate = REGEX_INVALID_CONTROL_ESCAPE;
    return true;
  }

  if (lexer->lookahead == '\\') {
    advance(lexer);
    lexer->mark_end(lexer);
    *candidate = REGEX_GNU_CONTROL_ESCAPE;
    return true;
  }

  advance(lexer);
  lexer->mark_end(lexer);
  *candidate = REGEX_INVALID_CONTROL_ESCAPE;
  return true;
}
#endif

static bool scan_regex_escape(
    TSLexer *lexer,
    ScannerState *state,
    const bool *valid_symbols,
    TSSymbol *symbol) {
  const bool inside_bracket = regex_is_inside_bracket(state);
  advance(lexer);
  lexer->mark_end(lexer);

  if (lexer->eof(lexer)) {
    const TSSymbol candidate =
        inside_bracket ? REGEX_LITERAL : REGEX_INCOMPLETE_ESCAPE;
    finish_first_bracket_element(state);
    return emit_symbol(valid_symbols, candidate, symbol);
  }

  if (lexer->lookahead == '\n') {
#if SED_DIALECT_GNU
    if (!inside_bracket) {
      advance(lexer);
      lexer->mark_end(lexer);
      return emit_symbol(
          valid_symbols, REGEX_ESCAPED_NEWLINE, symbol);
    }
#endif

    finish_first_bracket_element(state);
    return emit_symbol(
        valid_symbols,
        inside_bracket ? REGEX_LITERAL : REGEX_INCOMPLETE_ESCAPE,
        symbol);
  }

  if (lexer->lookahead == '\r') {
    advance(lexer);
    if (lexer->lookahead == '\n') {
#if SED_DIALECT_GNU
      if (!inside_bracket) {
        consume(lexer);
        return emit_symbol(
            valid_symbols, REGEX_ESCAPED_NEWLINE, symbol);
      }
#endif

      finish_first_bracket_element(state);
      return emit_symbol(
          valid_symbols,
          inside_bracket ? REGEX_LITERAL : REGEX_INCOMPLETE_ESCAPE,
          symbol);
    }

    if (inside_bracket) {
      finish_first_bracket_element(state);
      return emit_symbol(valid_symbols, REGEX_LITERAL, symbol);
    }

    lexer->mark_end(lexer);
    return emit_symbol(valid_symbols, REGEX_ESCAPE, symbol);
  }

  if (!inside_bracket && lexer->lookahead == state->delimiter) {
    consume(lexer);
    return emit_symbol(
        valid_symbols, REGEX_ESCAPED_DELIMITER, symbol);
  }

  if (!inside_bracket &&
      (lexer->lookahead == '(' || lexer->lookahead == ')')) {
    consume(lexer);
    return emit_symbol(
        valid_symbols, REGEX_ESCAPED_PARENTHESIS, symbol);
  }

  if (!inside_bracket &&
      lexer->lookahead >= '1' && lexer->lookahead <= '9') {
    consume(lexer);
    return emit_symbol(
        valid_symbols, REGEX_BACKREFERENCE_CANDIDATE, symbol);
  }

#if SED_DIALECT_GNU
  if (is_gnu_simple_regex_escape(lexer->lookahead)) {
    consume(lexer);
    finish_first_bracket_element(state);
    return emit_symbol(
        valid_symbols, REGEX_GNU_CHARACTER_ESCAPE, symbol);
  }

  if (lexer->lookahead == 'c') {
    TSSymbol candidate = REGEX_ESCAPE;
    const bool complete =
        scan_gnu_control_regex_escape(
            lexer, inside_bracket, &candidate);
    finish_first_bracket_element(state);
    if (complete) {
      return emit_symbol(valid_symbols, candidate, symbol);
    }
    return emit_symbol(
        valid_symbols,
        inside_bracket ? REGEX_LITERAL : REGEX_ESCAPE,
        symbol);
  }

  if (lexer->lookahead == 'd' || lexer->lookahead == 'o' ||
      lexer->lookahead == 'x') {
    TSSymbol candidate = REGEX_ESCAPE;
    const bool complete = scan_gnu_numeric_regex_escape(
        lexer, lexer->lookahead, &candidate);
    finish_first_bracket_element(state);
    if (complete) {
      return emit_symbol(valid_symbols, candidate, symbol);
    }
    return emit_symbol(
        valid_symbols,
        inside_bracket ? REGEX_LITERAL : REGEX_ESCAPE,
        symbol);
  }
#endif

  if (inside_bracket) {
    finish_first_bracket_element(state);
    return emit_symbol(valid_symbols, REGEX_LITERAL, symbol);
  }

  consume(lexer);
  return emit_symbol(valid_symbols, REGEX_ESCAPE, symbol);
}

static bool scan_regex_token(
    TSLexer *lexer,
    ScannerState *state,
    const bool *valid_symbols,
    TSSymbol *symbol) {
  const enum LiteralScanResult literal_result =
      scan_regex_literal(lexer, state);
  if (literal_result == LITERAL_SCAN_TOKEN) {
    return emit_symbol(valid_symbols, REGEX_LITERAL, symbol);
  }
  if (literal_result == LITERAL_SCAN_LINE_END) {
    return emit_regex_unterminated(state, valid_symbols, symbol);
  }

  if (state->regex_state == REGEX_OUTSIDE_BRACKET) {
    if (lexer->lookahead == '\\') {
      return scan_regex_escape(
          lexer, state, valid_symbols, symbol);
    }

    if (lexer->lookahead == '(' || lexer->lookahead == ')') {
      consume(lexer);
      return emit_symbol(
          valid_symbols, REGEX_RAW_PARENTHESIS, symbol);
    }

    if (lexer->lookahead == '[') {
      consume(lexer);
      state->regex_state = REGEX_BRACKET_FIRST;
      return emit_symbol(valid_symbols, REGEX_BRACKET_OPEN, symbol);
    }

    return false;
  }

  if (state->regex_state == REGEX_BRACKET_BODY &&
      lexer->lookahead == ']') {
    consume(lexer);
    state->regex_state = REGEX_OUTSIDE_BRACKET;
    return emit_symbol(valid_symbols, REGEX_BRACKET_CLOSE, symbol);
  }

  if (lexer->lookahead == '[') {
    return scan_regex_bracket_token(
        lexer, state, valid_symbols, symbol);
  }

#if SED_DIALECT_GNU
  if (lexer->lookahead == '\\') {
    return scan_regex_escape(
        lexer, state, valid_symbols, symbol);
  }
#endif

  return false;
}

static bool is_replacement_backreference(int32_t character) {
  return character >= '1' && character <= '9';
}

#if SED_DIALECT_GNU
static bool is_replacement_case_conversion(int32_t character) {
  return character == 'L' || character == 'l' ||
         character == 'U' || character == 'u' ||
         character == 'E';
}
#endif

static enum LiteralScanResult scan_replacement_literal(
    TSLexer *lexer,
    const ScannerState *state) {
  bool consumed = false;
  lexer->mark_end(lexer);

  for (;;) {
    if (lexer->eof(lexer) || lexer->lookahead == '\n') {
      return consumed ? LITERAL_SCAN_TOKEN : LITERAL_SCAN_LINE_END;
    }

    if (lexer->lookahead == '\r') {
      advance(lexer);
      if (lexer->lookahead == '\n') {
        return consumed ? LITERAL_SCAN_TOKEN : LITERAL_SCAN_LINE_END;
      }
      lexer->mark_end(lexer);
      consumed = true;
      continue;
    }

    if (lexer->lookahead == state->delimiter ||
        lexer->lookahead == '\\' || lexer->lookahead == '&') {
      return consumed ? LITERAL_SCAN_TOKEN : LITERAL_SCAN_NONE;
    }

    consume(lexer);
    consumed = true;
  }
}

static bool emit_replacement_unterminated(
    ScannerState *state,
    const bool *valid_symbols,
    TSSymbol *symbol) {
  if (!emit_symbol(
          valid_symbols, REPLACEMENT_UNTERMINATED, symbol)) {
    return false;
  }

  reset_state(state);
  return true;
}

static bool scan_replacement_escape(
    TSLexer *lexer,
    const ScannerState *state,
    const bool *valid_symbols,
    TSSymbol *symbol) {
  advance(lexer);
  lexer->mark_end(lexer);

  if (lexer->eof(lexer)) {
    return emit_symbol(
        valid_symbols, REPLACEMENT_INCOMPLETE_ESCAPE, symbol);
  }

  if (lexer->lookahead == '\n') {
    consume(lexer);
    return emit_symbol(
        valid_symbols, REPLACEMENT_ESCAPED_NEWLINE, symbol);
  }

  if (lexer->lookahead == '\r') {
    advance(lexer);
    if (lexer->lookahead == '\n') {
      consume(lexer);
      return emit_symbol(
          valid_symbols, REPLACEMENT_ESCAPED_NEWLINE, symbol);
    }

    lexer->mark_end(lexer);
    return emit_symbol(
        valid_symbols, REPLACEMENT_ESCAPE_SEQUENCE, symbol);
  }

  TSSymbol candidate = REPLACEMENT_ESCAPE_SEQUENCE;
  if (lexer->lookahead == state->delimiter) {
    candidate = REPLACEMENT_ESCAPED_DELIMITER;
  } else if (is_replacement_backreference(lexer->lookahead)) {
    candidate = REPLACEMENT_BACKREFERENCE;
#if SED_DIALECT_GNU
  } else if (is_replacement_case_conversion(lexer->lookahead)) {
    candidate = REPLACEMENT_CASE_CONVERSION;
#endif
  }

  consume(lexer);
  return emit_symbol(valid_symbols, candidate, symbol);
}

static bool scan_replacement_token(
    TSLexer *lexer,
    ScannerState *state,
    const bool *valid_symbols,
    TSSymbol *symbol) {
  const enum LiteralScanResult literal_result =
      scan_replacement_literal(lexer, state);
  if (literal_result == LITERAL_SCAN_TOKEN) {
    return emit_symbol(valid_symbols, REPLACEMENT_LITERAL, symbol);
  }
  if (literal_result == LITERAL_SCAN_LINE_END) {
    return emit_replacement_unterminated(
        state, valid_symbols, symbol);
  }

  if (lexer->lookahead == '\\') {
    return scan_replacement_escape(
        lexer, state, valid_symbols, symbol);
  }

  if (lexer->lookahead == '&') {
    consume(lexer);
    return emit_symbol(
        valid_symbols, REPLACEMENT_MATCH_REFERENCE, symbol);
  }

  return false;
}

static enum LiteralScanResult scan_translate_literal(
    TSLexer *lexer,
    const ScannerState *state) {
  bool consumed = false;
  lexer->mark_end(lexer);

  for (;;) {
    if (lexer->eof(lexer) || lexer->lookahead == '\n') {
      return consumed ? LITERAL_SCAN_TOKEN : LITERAL_SCAN_LINE_END;
    }

    if (lexer->lookahead == '\r') {
      advance(lexer);
      if (lexer->lookahead == '\n') {
        return consumed ? LITERAL_SCAN_TOKEN : LITERAL_SCAN_LINE_END;
      }
      lexer->mark_end(lexer);
      consumed = true;
      continue;
    }

    if (lexer->lookahead == state->delimiter ||
        lexer->lookahead == '\\') {
      return consumed ? LITERAL_SCAN_TOKEN : LITERAL_SCAN_NONE;
    }

    consume(lexer);
    consumed = true;
  }
}

static TSSymbol translate_unterminated_symbol(enum ScannerMode mode) {
  return mode == MODE_TRANSLATE_SOURCE
             ? TRANSLATE_UNTERMINATED_SOURCE
             : TRANSLATE_UNTERMINATED_DESTINATION;
}

static bool emit_translate_unterminated(
    ScannerState *state,
    const bool *valid_symbols,
    TSSymbol *symbol) {
  const TSSymbol candidate =
      translate_unterminated_symbol(state->mode);
  if (!emit_symbol(valid_symbols, candidate, symbol)) {
    return false;
  }

  reset_state(state);
  return true;
}

static bool scan_translate_escape(
    TSLexer *lexer,
    const ScannerState *state,
    const bool *valid_symbols,
    TSSymbol *symbol) {
  advance(lexer);
  lexer->mark_end(lexer);

  if (lexer->eof(lexer)) {
    return emit_symbol(
        valid_symbols, TRANSLATE_INCOMPLETE_ESCAPE, symbol);
  }

  if (lexer->lookahead == '\n') {
    consume(lexer);
    return emit_symbol(
        valid_symbols, TRANSLATE_ESCAPED_NEWLINE, symbol);
  }

  if (lexer->lookahead == '\r') {
    advance(lexer);
    if (lexer->lookahead == '\n') {
      consume(lexer);
      return emit_symbol(
          valid_symbols, TRANSLATE_ESCAPED_NEWLINE, symbol);
    }

    lexer->mark_end(lexer);
    return emit_symbol(valid_symbols, TRANSLATE_ESCAPE, symbol);
  }

  const TSSymbol candidate =
      lexer->lookahead == state->delimiter
          ? TRANSLATE_ESCAPED_DELIMITER
          : TRANSLATE_ESCAPE;
  consume(lexer);
  return emit_symbol(valid_symbols, candidate, symbol);
}

static bool scan_translate_token(
    TSLexer *lexer,
    ScannerState *state,
    const bool *valid_symbols,
    TSSymbol *symbol) {
  const enum LiteralScanResult literal_result =
      scan_translate_literal(lexer, state);
  if (literal_result == LITERAL_SCAN_TOKEN) {
    return emit_symbol(valid_symbols, TRANSLATE_LITERAL, symbol);
  }
  if (literal_result == LITERAL_SCAN_LINE_END) {
    return emit_translate_unterminated(
        state, valid_symbols, symbol);
  }

  if (lexer->lookahead == '\\') {
    return scan_translate_escape(
        lexer, state, valid_symbols, symbol);
  }

  return false;
}

static bool sed_scanner_scan_impl(
    ScannerState *state,
    TSLexer *lexer,
    const bool *valid_symbols,
    TSSymbol *symbol) {
  if (state->mode == MODE_TEXT || state->mode == MODE_TEXT_LEADIN) {
    if (valid_symbols[TEXT_BLOCK] &&
        scan_text_block(lexer, state)) {
      *symbol = TEXT_BLOCK;
      return true;
    }
    return false;
  }

  if (is_regex_mode(state->mode)) {
    if (state->regex_state == REGEX_OUTSIDE_BRACKET &&
        lexer->lookahead == state->delimiter) {
      if (state->mode == MODE_REGEX_ADDRESS &&
          valid_symbols[REGEX_ADDRESS_END] &&
          scan_mode_delimiter(
              lexer, state, MODE_REGEX_ADDRESS, MODE_NONE)) {
        *symbol = REGEX_ADDRESS_END;
        return true;
      }

      if (state->mode == MODE_SUBSTITUTE_PATTERN &&
          valid_symbols[SUBSTITUTE_MIDDLE] &&
          scan_mode_delimiter(
              lexer, state, MODE_SUBSTITUTE_PATTERN,
              MODE_SUBSTITUTE_REPLACEMENT)) {
        *symbol = SUBSTITUTE_MIDDLE;
        return true;
      }

      return false;
    }

    return scan_regex_token(
        lexer, state, valid_symbols, symbol);
  }

  if (state->mode == MODE_SUBSTITUTE_REPLACEMENT) {
    if (lexer->lookahead == state->delimiter) {
      if (valid_symbols[SUBSTITUTE_END] &&
          scan_mode_delimiter(
              lexer, state, MODE_SUBSTITUTE_REPLACEMENT,
              MODE_NONE)) {
        *symbol = SUBSTITUTE_END;
        return true;
      }
      return false;
    }

    return scan_replacement_token(
        lexer, state, valid_symbols, symbol);
  }

  if (state->mode == MODE_TRANSLATE_SOURCE) {
    if (lexer->lookahead == state->delimiter) {
      if (valid_symbols[TRANSLATE_MIDDLE] &&
          scan_mode_delimiter(
              lexer, state, MODE_TRANSLATE_SOURCE,
              MODE_TRANSLATE_DESTINATION)) {
        *symbol = TRANSLATE_MIDDLE;
        return true;
      }
      return false;
    }

    return scan_translate_token(
        lexer, state, valid_symbols, symbol);
  }

  if (state->mode == MODE_TRANSLATE_DESTINATION) {
    if (lexer->lookahead == state->delimiter) {
      if (valid_symbols[TRANSLATE_END] &&
          scan_mode_delimiter(
              lexer, state, MODE_TRANSLATE_DESTINATION,
              MODE_NONE)) {
        *symbol = TRANSLATE_END;
        return true;
      }
      return false;
    }

    return scan_translate_token(
        lexer, state, valid_symbols, symbol);
  }

  if (state->mode != MODE_NONE) {
    return false;
  }

  /*
   * Tree-sitter enables every external token while probing error-recovery
   * paths. Source-consuming tokens must not win in that synthetic state.
   */
  if (valid_symbols[ERROR_SENTINEL]) {
    return false;
  }

  if (valid_symbols[LINE_WORD]) {
    const enum LineTokenScanResult result = scan_line_word(lexer);
    if (result == LINE_TOKEN_VALUE) {
      *symbol = LINE_WORD;
      return true;
    }
    if (result == LINE_TOKEN_EMPTY_AT_CRLF) {
      return false;
    }
  }

#if SED_DIALECT_GNU
  if (valid_symbols[VERSION_ARGUMENT]) {
    const enum LineTokenScanResult result =
        scan_version_argument(lexer);
    if (result == LINE_TOKEN_VALUE) {
      *symbol = VERSION_ARGUMENT;
      return true;
    }
    if (result == LINE_TOKEN_EMPTY_AT_CRLF) {
      return false;
    }
  }
#endif

  if (valid_symbols[FILE_ARGUMENT]) {
    const enum LineTokenScanResult result = scan_file_argument(lexer);
    if (result == LINE_TOKEN_VALUE) {
      *symbol = FILE_ARGUMENT;
      return true;
    }
    if (result == LINE_TOKEN_EMPTY_AT_CRLF) {
      return false;
    }
  }

  if (valid_symbols[TEXT_COMMAND_START] &&
      lexer->lookahead == '\\') {
    if (scan_text_command_start(lexer, state)) {
      *symbol = TEXT_COMMAND_START;
      return true;
    }
    return false;
  }

#if SED_DIALECT_GNU
  if (valid_symbols[TEXT_BLOCK] &&
      scan_inline_text_block(lexer)) {
    *symbol = TEXT_BLOCK;
    return true;
  }

  if (valid_symbols[SHELL_COMMAND]) {
    if (scan_shell_command(lexer)) {
      *symbol = SHELL_COMMAND;
      return true;
    }
    return false;
  }
#endif

  if (valid_symbols[FIRST_LINE_SILENT] &&
      lexer->lookahead == '#') {
    if (scan_first_line_silent(lexer)) {
      *symbol = FIRST_LINE_SILENT;
      return true;
    }
    return false;
  }

  if (valid_symbols[COMMENT_TEXT] &&
      scan_comment_text(lexer)) {
    *symbol = COMMENT_TEXT;
    return true;
  }

  if (valid_symbols[REGEX_ADDRESS_START] &&
      scan_regex_address_start(lexer, state)) {
    *symbol = REGEX_ADDRESS_START;
    return true;
  }

  if (valid_symbols[ESCAPED_REGEX_ADDRESS_START]) {
    if (scan_escaped_regex_address_start(lexer, state)) {
      *symbol = ESCAPED_REGEX_ADDRESS_START;
      return true;
    }
  }

  if (valid_symbols[SUBSTITUTE_START]) {
    if (scan_simple_delimiter(
            lexer, state, MODE_SUBSTITUTE_PATTERN)) {
      *symbol = SUBSTITUTE_START;
      return true;
    }
  }

  if (valid_symbols[TRANSLATE_START]) {
    if (scan_simple_delimiter(
            lexer, state, MODE_TRANSLATE_SOURCE)) {
      *symbol = TRANSLATE_START;
      return true;
    }
  }

  if (valid_symbols[RIGHT_BRACE] &&
      scan_right_brace(lexer, state)) {
    *symbol = RIGHT_BRACE;
    return true;
  }

#if SED_DIALECT_GNU
  if (valid_symbols[GNU_OUTER_LOOP_WHITESPACE] &&
      is_gnu_outer_loop_control(lexer->lookahead)) {
    if (scan_gnu_outer_loop_whitespace(lexer)) {
      *symbol = GNU_OUTER_LOOP_WHITESPACE;
      return true;
    }
    return false;
  }
#endif

  return false;
}

static bool sed_scanner_scan(
    void *payload,
    TSLexer *lexer,
    const bool *valid_symbols) {
  ScannerState next = *(ScannerState *)payload;
  TSSymbol symbol;

  if (!sed_scanner_scan_impl(
          &next, lexer, valid_symbols, &symbol)) {
    return false;
  }

  *(ScannerState *)payload = next;
  lexer->result_symbol = symbol;
  return true;
}

#endif
