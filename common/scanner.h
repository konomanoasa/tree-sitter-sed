#ifndef TREE_SITTER_SED_COMMON_SCANNER_H_
#define TREE_SITTER_SED_COMMON_SCANNER_H_

#ifndef SED_DIALECT_GNU
#error "SED_DIALECT_GNU must be defined before including scanner.h"
#endif

#ifndef SED_REGEX_EXTENDED
#error "SED_REGEX_EXTENDED must be defined before including scanner.h"
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
  REGEX_BEGINNING_ANCHOR,
  REGEX_END_ANCHOR,
  REGEX_WILDCARD,
  REGEX_ESCAPE,
  REGEX_QUOTED_ESCAPE,
  REGEX_NEWLINE_ESCAPE,
  REGEX_ESCAPED_DELIMITER,
  REGEX_ESCAPED_NEWLINE,
  REGEX_GROUP_OPEN,
  REGEX_GROUP_CLOSE,
  REGEX_ALTERNATION_OPERATOR,
  REGEX_ZERO_OR_MORE,
  REGEX_ONE_OR_MORE,
  REGEX_ZERO_OR_ONE,
  REGEX_INTERVAL,
  REGEX_BACKREFERENCE,
  REGEX_BRACKET_OPEN,
  REGEX_BRACKET_CLOSE,
  REGEX_BRACKET_LITERAL,
  REGEX_BRACKET_NEGATION,
  REGEX_BRACKET_HYPHEN,
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
  bool regex_at_branch_start;
} ScannerState;

enum {
  SCANNER_SERIALIZATION_VERSION = 4,
  SCANNER_SERIALIZED_STATE_SIZE = 8,
};

static void reset_state(ScannerState *state) {
  state->delimiter = 0;
  state->mode = MODE_NONE;
  state->regex_state = REGEX_OUTSIDE_BRACKET;
  state->regex_at_branch_start = false;
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
  buffer[3] = state->regex_at_branch_start ? 1 : 0;
  buffer[4] = (char)(delimiter & UINT32_C(0xff));
  buffer[5] = (char)((delimiter >> 8) & UINT32_C(0xff));
  buffer[6] = (char)((delimiter >> 16) & UINT32_C(0xff));
  buffer[7] = (char)((delimiter >> 24) & UINT32_C(0xff));
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
  const unsigned char regex_at_branch_start =
      (unsigned char)buffer[3];
  const uint32_t delimiter =
      (uint32_t)(unsigned char)buffer[4] |
      ((uint32_t)(unsigned char)buffer[5] << 8) |
      ((uint32_t)(unsigned char)buffer[6] << 16) |
      ((uint32_t)(unsigned char)buffer[7] << 24);

  if (mode < MODE_NONE || mode > MODE_TEXT_LEADIN) {
    return;
  }

  if (regex_state < REGEX_OUTSIDE_BRACKET ||
      regex_state > REGEX_BRACKET_BODY) {
    return;
  }

  if (regex_at_branch_start > 1) {
    return;
  }

  if (mode == MODE_NONE) {
    return;
  }

  if (mode == MODE_TEXT || mode == MODE_TEXT_LEADIN) {
    if (delimiter == 0 && regex_state == REGEX_OUTSIDE_BRACKET &&
        regex_at_branch_start == 0) {
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
      (regex_state != REGEX_OUTSIDE_BRACKET ||
       regex_at_branch_start != 0)) {
    return;
  }

  if (regex_state != REGEX_OUTSIDE_BRACKET &&
      regex_at_branch_start != 0) {
    return;
  }

  state->mode = mode;
  state->delimiter = (int32_t)delimiter;
  state->regex_state = regex_state;
  state->regex_at_branch_start = regex_at_branch_start != 0;
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
  state->regex_at_branch_start =
      next_mode == MODE_REGEX_ADDRESS ||
      next_mode == MODE_SUBSTITUTE_PATTERN;
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
  state->regex_at_branch_start = true;
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
  state->regex_at_branch_start = false;
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
  return character == ';' || character == '#' || character == '}' ||
         character == '\n';
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
           character == '(' || character == ')' || character == '[' ||
           character == '*' || character == '+' || character == '?' ||
           character == '|' || character == '{' || character == '.' ||
           character == '^' || character == '$';
  }

  if (character == '[' ||
      (state->regex_state == REGEX_BRACKET_FIRST &&
       character == '^') ||
      (state->regex_state == REGEX_BRACKET_BODY &&
       character == '-') ||
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
    return character == '}' || character == ',';
  }

  if ((state->regex_state == REGEX_BRACKET_FIRST ||
       state->regex_state == REGEX_BRACKET_AFTER_CARET) &&
      character == ']') {
    return true;
  }

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
      if (regex_is_inside_bracket(state)) {
        return LITERAL_SCAN_TOKEN;
      }
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
    if (regex_is_inside_bracket(state)) {
      return LITERAL_SCAN_TOKEN;
    }
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
  TSSymbol candidate = REGEX_BRACKET_LITERAL;
  const bool complete = scan_regex_bracket_element(lexer, &candidate);
  finish_first_bracket_element(state);

  if (!complete) {
    return emit_symbol(
        valid_symbols, REGEX_BRACKET_LITERAL, symbol);
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
    const ScannerState *state,
    bool inside_bracket,
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
  while (digits < maximum_digits) {
    if (is_digit_for_base(lexer->lookahead, base)) {
      if (!inside_bracket &&
          lexer->lookahead == state->delimiter) {
        break;
      }

      advance(lexer);
      lexer->mark_end(lexer);
      digits += 1U;
      continue;
    }

    if (!inside_bracket && lexer->lookahead == '\\' &&
        is_digit_for_base(state->delimiter, base)) {
      advance(lexer);
      if (lexer->lookahead != state->delimiter) {
        break;
      }

      advance(lexer);
      lexer->mark_end(lexer);
      digits += 1U;
      continue;
    }

    break;
  }

  if (digits == 0U) {
    return false;
  }

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

enum RegexIntervalPartResult {
  REGEX_INTERVAL_PART_END,
  REGEX_INTERVAL_PART_PRESENT,
  REGEX_INTERVAL_PART_ESCAPED_CLOSE,
  REGEX_INTERVAL_PART_INVALID,
};

static enum RegexIntervalPartResult scan_regex_interval_digits(
    TSLexer *lexer,
    const ScannerState *state,
    bool escaped_close,
    bool *has_digits) {
  for (;;) {
    if (lexer->lookahead >= '0' &&
        lexer->lookahead <= '9' &&
        lexer->lookahead != state->delimiter) {
      advance(lexer);
      if (has_digits != NULL) {
        *has_digits = true;
      }
      continue;
    }

    if (lexer->lookahead == '\\' &&
        state->delimiter >= '0' &&
        state->delimiter <= '9') {
      advance(lexer);
      if (lexer->lookahead == state->delimiter) {
        advance(lexer);
        if (has_digits != NULL) {
          *has_digits = true;
        }
        continue;
      }

      if (escaped_close && lexer->lookahead == '}') {
        return REGEX_INTERVAL_PART_ESCAPED_CLOSE;
      }
      return REGEX_INTERVAL_PART_INVALID;
    }

    return REGEX_INTERVAL_PART_END;
  }
}

static enum RegexIntervalPartResult scan_regex_interval_separator(
    TSLexer *lexer,
    const ScannerState *state,
    bool escaped_close) {
  if (lexer->lookahead == ',') {
    if (state->delimiter == ',') {
      return REGEX_INTERVAL_PART_END;
    }

    advance(lexer);
    return REGEX_INTERVAL_PART_PRESENT;
  }

  if (state->delimiter == ',' && lexer->lookahead == '\\') {
    advance(lexer);
    if (lexer->lookahead == ',') {
      advance(lexer);
      return REGEX_INTERVAL_PART_PRESENT;
    }

    if (escaped_close && lexer->lookahead == '}') {
      return REGEX_INTERVAL_PART_ESCAPED_CLOSE;
    }
    return REGEX_INTERVAL_PART_INVALID;
  }

  return REGEX_INTERVAL_PART_END;
}

static bool scan_regex_interval_tail(
    TSLexer *lexer,
    const ScannerState *state,
    bool escaped_close) {
  bool has_minimum = false;
  enum RegexIntervalPartResult result =
      scan_regex_interval_digits(
          lexer, state, escaped_close, &has_minimum);
  if (result == REGEX_INTERVAL_PART_INVALID) {
    return false;
  }
  if (result == REGEX_INTERVAL_PART_ESCAPED_CLOSE) {
    advance(lexer);
    if (has_minimum) {
      lexer->mark_end(lexer);
    }
    return has_minimum;
  }

  result =
      scan_regex_interval_separator(lexer, state, escaped_close);
  if (result == REGEX_INTERVAL_PART_INVALID) {
    return false;
  }
  if (result == REGEX_INTERVAL_PART_ESCAPED_CLOSE) {
    advance(lexer);
    if (has_minimum) {
      lexer->mark_end(lexer);
    }
    return has_minimum;
  }

  const bool has_separator =
      result == REGEX_INTERVAL_PART_PRESENT;
  if (!has_minimum && (!SED_DIALECT_GNU || !has_separator)) {
    return false;
  }

  if (has_separator) {
    result = scan_regex_interval_digits(
        lexer, state, escaped_close, NULL);
    if (result == REGEX_INTERVAL_PART_INVALID) {
      return false;
    }
    if (result == REGEX_INTERVAL_PART_ESCAPED_CLOSE) {
      consume(lexer);
      return true;
    }
  }

  if (!escaped_close && SED_REGEX_EXTENDED &&
      state->delimiter == '}' && lexer->lookahead == '\\') {
    advance(lexer);
    if (lexer->lookahead != '}') {
      return false;
    }
    consume(lexer);
    return true;
  }

  if (escaped_close) {
    if (lexer->lookahead != '\\') {
      return false;
    }
    advance(lexer);
    if (lexer->lookahead == state->delimiter) {
      advance(lexer);
      return false;
    }
  }

  if (lexer->lookahead != '}' || state->delimiter == '}') {
    return false;
  }

  consume(lexer);
  return true;
}

static bool scan_regex_interval(
    TSLexer *lexer,
    const ScannerState *state,
    bool escaped,
    const bool *valid_symbols,
    TSSymbol *symbol) {
  advance(lexer);
  lexer->mark_end(lexer);

  if (!scan_regex_interval_tail(lexer, state, escaped)) {
    return emit_symbol(
        valid_symbols,
        escaped ? REGEX_QUOTED_ESCAPE : REGEX_LITERAL,
        symbol);
  }

  return emit_symbol(valid_symbols, REGEX_INTERVAL, symbol);
}

static bool scan_raw_regex_operator(
    TSLexer *lexer,
    ScannerState *state,
    const bool *valid_symbols,
    TSSymbol *symbol) {
#if !SED_REGEX_EXTENDED
  (void)state;
#endif
  const int32_t character = lexer->lookahead;

  if (character == '{') {
#if SED_REGEX_EXTENDED
    return scan_regex_interval(
        lexer, state, false, valid_symbols, symbol);
#else
    consume(lexer);
    return emit_symbol(valid_symbols, REGEX_LITERAL, symbol);
#endif
  }

  consume(lexer);

  if (character == '*') {
    return emit_symbol(
        valid_symbols, REGEX_ZERO_OR_MORE, symbol);
  }

#if SED_REGEX_EXTENDED
  if (character == '(') {
    return emit_symbol(valid_symbols, REGEX_GROUP_OPEN, symbol);
  }

  if (character == ')') {
    return emit_symbol(valid_symbols, REGEX_GROUP_CLOSE, symbol);
  }

  if (character == '|') {
    return emit_symbol(
        valid_symbols, REGEX_ALTERNATION_OPERATOR, symbol);
  }

  if (character == '+') {
    return emit_symbol(valid_symbols, REGEX_ONE_OR_MORE, symbol);
  }

  if (character == '?') {
    return emit_symbol(valid_symbols, REGEX_ZERO_OR_ONE, symbol);
  }
#endif

  return emit_symbol(valid_symbols, REGEX_LITERAL, symbol);
}

/*
 * Quoting a regexp-special delimiter prevents it from ending the operand
 * without changing its regexp role.
 */
static bool scan_regex_escaped_delimiter(
    TSLexer *lexer,
    ScannerState *state,
    const bool *valid_symbols,
    TSSymbol *symbol) {
  const int32_t character = lexer->lookahead;

#if SED_DIALECT_GNU
  if (character == '[') {
    consume(lexer);
    state->regex_state = REGEX_BRACKET_FIRST;
    return emit_symbol(
        valid_symbols, REGEX_BRACKET_OPEN, symbol);
  }
#endif

#if SED_REGEX_EXTENDED
  if (character == '(' || character == ')' ||
      character == '*' || character == '+' ||
      character == '?' || character == '|' ||
      character == '{') {
    return scan_raw_regex_operator(
        lexer, state, valid_symbols, symbol);
  }
#else
  if (character == '*') {
    return scan_raw_regex_operator(
        lexer, state, valid_symbols, symbol);
  }
#endif

  consume(lexer);
  return emit_symbol(
      valid_symbols, REGEX_ESCAPED_DELIMITER, symbol);
}

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
        inside_bracket ? REGEX_BRACKET_LITERAL : REGEX_INCOMPLETE_ESCAPE;
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
        inside_bracket ? REGEX_BRACKET_LITERAL : REGEX_INCOMPLETE_ESCAPE,
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
          inside_bracket
              ? REGEX_BRACKET_LITERAL
              : REGEX_INCOMPLETE_ESCAPE,
          symbol);
    }

    if (inside_bracket) {
      finish_first_bracket_element(state);
      return emit_symbol(
          valid_symbols, REGEX_BRACKET_LITERAL, symbol);
    }

    lexer->mark_end(lexer);
    return emit_symbol(valid_symbols, REGEX_ESCAPE, symbol);
  }

  if (!inside_bracket && lexer->lookahead == state->delimiter) {
    return scan_regex_escaped_delimiter(
        lexer, state, valid_symbols, symbol);
  }

  if (!inside_bracket &&
      (lexer->lookahead == '(' || lexer->lookahead == ')')) {
#if !SED_REGEX_EXTENDED
    const int32_t character = lexer->lookahead;
#endif
    consume(lexer);
#if SED_REGEX_EXTENDED
    return emit_symbol(valid_symbols, REGEX_QUOTED_ESCAPE, symbol);
#else
    return character == '('
               ? emit_symbol(
                     valid_symbols, REGEX_GROUP_OPEN, symbol)
               : emit_symbol(
                     valid_symbols, REGEX_GROUP_CLOSE, symbol);
#endif
  }

  if (!inside_bracket &&
      lexer->lookahead >= '1' && lexer->lookahead <= '9') {
    consume(lexer);
    return emit_symbol(
        valid_symbols, REGEX_BACKREFERENCE, symbol);
  }

  if (!inside_bracket && lexer->lookahead == '{') {
#if SED_REGEX_EXTENDED
    consume(lexer);
    return emit_symbol(valid_symbols, REGEX_QUOTED_ESCAPE, symbol);
#else
    return scan_regex_interval(
        lexer, state, true, valid_symbols, symbol);
#endif
  }

  if (!inside_bracket &&
      (lexer->lookahead == '+' || lexer->lookahead == '?' ||
       lexer->lookahead == '|')) {
#if SED_DIALECT_GNU && !SED_REGEX_EXTENDED
    const int32_t character = lexer->lookahead;
#endif
    consume(lexer);
#if SED_DIALECT_GNU && !SED_REGEX_EXTENDED
    if (character == '|') {
      return emit_symbol(
          valid_symbols, REGEX_ALTERNATION_OPERATOR, symbol);
    }
    return emit_symbol(
        valid_symbols,
        character == '+' ? REGEX_ONE_OR_MORE
                         : REGEX_ZERO_OR_ONE,
        symbol);
#else
    return emit_symbol(
        valid_symbols,
        SED_REGEX_EXTENDED ? REGEX_QUOTED_ESCAPE : REGEX_ESCAPE,
        symbol);
#endif
  }

  if (!inside_bracket && lexer->lookahead == 'n') {
    consume(lexer);
    return emit_symbol(valid_symbols, REGEX_NEWLINE_ESCAPE, symbol);
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
        REGEX_ESCAPE,
        symbol);
  }

  if (lexer->lookahead == 'd' || lexer->lookahead == 'o' ||
      lexer->lookahead == 'x') {
    TSSymbol candidate = REGEX_ESCAPE;
    const bool complete = scan_gnu_numeric_regex_escape(
        lexer,
        state,
        inside_bracket,
        lexer->lookahead,
        &candidate);
    finish_first_bracket_element(state);
    if (complete) {
      return emit_symbol(valid_symbols, candidate, symbol);
    }
    return emit_symbol(
        valid_symbols,
        REGEX_ESCAPE,
        symbol);
  }
#endif

  if (inside_bracket) {
    finish_first_bracket_element(state);
    const int32_t character = lexer->lookahead;
    consume(lexer);
    const bool quotes_bracket_syntax =
        character == ']' || character == '-' || character == '^' ||
        character == '[' || character == '\\';
    return emit_symbol(
        valid_symbols,
        quotes_bracket_syntax ? REGEX_QUOTED_ESCAPE : REGEX_ESCAPE,
        symbol);
  }

  const int32_t character = lexer->lookahead;
  consume(lexer);
  const bool quotes_regex_syntax =
      character == '.' || character == '*' || character == '^' ||
      character == '$' || character == '[' || character == '\\' ||
      character == '}';
  return emit_symbol(
      valid_symbols,
      quotes_regex_syntax ? REGEX_QUOTED_ESCAPE : REGEX_ESCAPE,
      symbol);
}

static bool scan_regex_token(
    TSLexer *lexer,
    ScannerState *state,
    const bool *valid_symbols,
    TSSymbol *symbol) {
  const bool inside_bracket = regex_is_inside_bracket(state);
  const enum LiteralScanResult literal_result =
      scan_regex_literal(lexer, state);
  if (literal_result == LITERAL_SCAN_TOKEN) {
    return emit_symbol(
        valid_symbols,
        inside_bracket ? REGEX_BRACKET_LITERAL : REGEX_LITERAL,
        symbol);
  }
  if (literal_result == LITERAL_SCAN_LINE_END) {
    return emit_regex_unterminated(state, valid_symbols, symbol);
  }

  if (state->regex_state == REGEX_OUTSIDE_BRACKET) {
    if (lexer->lookahead == '^') {
      consume(lexer);
      const TSSymbol candidate =
          SED_REGEX_EXTENDED || state->regex_at_branch_start
              ? REGEX_BEGINNING_ANCHOR
              : REGEX_LITERAL;
      return emit_symbol(
          valid_symbols, candidate, symbol);
    }

    if (lexer->lookahead == '$') {
      consume(lexer);
      bool at_branch_end = SED_REGEX_EXTENDED ||
                           lexer->eof(lexer) ||
                           lexer->lookahead == '\n' ||
                           lexer->lookahead == state->delimiter;
      const bool followed_by_carriage_return =
          lexer->lookahead == '\r';
      if (!at_branch_end && followed_by_carriage_return) {
        advance(lexer);
        at_branch_end = lexer->lookahead == '\n';
      }
#if SED_DIALECT_GNU && !SED_REGEX_EXTENDED
      if (!at_branch_end && !followed_by_carriage_return &&
          lexer->lookahead == '\\') {
        advance(lexer);
        at_branch_end =
            lexer->lookahead == ')' || lexer->lookahead == '|';
      }
#endif
      const TSSymbol candidate =
          at_branch_end ? REGEX_END_ANCHOR : REGEX_LITERAL;
      return emit_symbol(valid_symbols, candidate, symbol);
    }

    if (lexer->lookahead == '.') {
      consume(lexer);
      return emit_symbol(valid_symbols, REGEX_WILDCARD, symbol);
    }

    if (lexer->lookahead == '\\') {
      return scan_regex_escape(
          lexer, state, valid_symbols, symbol);
    }

    if (lexer->lookahead == '(' || lexer->lookahead == ')' ||
        lexer->lookahead == '*' || lexer->lookahead == '+' ||
        lexer->lookahead == '?' || lexer->lookahead == '|' ||
        lexer->lookahead == '{') {
      return scan_raw_regex_operator(
          lexer, state, valid_symbols, symbol);
    }

    if (lexer->lookahead == '[') {
      consume(lexer);
      state->regex_state = REGEX_BRACKET_FIRST;
      return emit_symbol(valid_symbols, REGEX_BRACKET_OPEN, symbol);
    }

    return false;
  }

  if (state->regex_state == REGEX_BRACKET_FIRST &&
      lexer->lookahead == '^') {
    consume(lexer);
    state->regex_state = REGEX_BRACKET_AFTER_CARET;
    return emit_symbol(
        valid_symbols, REGEX_BRACKET_NEGATION, symbol);
  }

  if (state->regex_state == REGEX_BRACKET_BODY &&
      lexer->lookahead == ']') {
    consume(lexer);
    state->regex_state = REGEX_OUTSIDE_BRACKET;
    return emit_symbol(valid_symbols, REGEX_BRACKET_CLOSE, symbol);
  }

  if (state->regex_state == REGEX_BRACKET_BODY &&
      lexer->lookahead == '-') {
    consume(lexer);
    const TSSymbol candidate =
        lexer->eof(lexer) || lexer->lookahead == '\n' ||
                lexer->lookahead == '\r' || lexer->lookahead == ']'
            ? REGEX_BRACKET_LITERAL
            : REGEX_BRACKET_HYPHEN;
    return emit_symbol(valid_symbols, candidate, symbol);
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

static void update_regex_branch_start_after_symbol(
    ScannerState *state,
    TSSymbol symbol) {
  bool is_regex_token =
      symbol >= REGEX_LITERAL && symbol <= REGEX_INCOMPLETE_ESCAPE;
#if SED_DIALECT_GNU
  is_regex_token =
      is_regex_token || symbol == REGEX_GNU_CHARACTER_ESCAPE ||
      symbol == REGEX_GNU_CONTROL_ESCAPE ||
      symbol == REGEX_INVALID_CONTROL_ESCAPE;
#endif
  if (!is_regex_token) {
    return;
  }

#if SED_DIALECT_GNU && !SED_REGEX_EXTENDED
  state->regex_at_branch_start =
      symbol == REGEX_GROUP_OPEN ||
      symbol == REGEX_ALTERNATION_OPERATOR;
#else
  state->regex_at_branch_start = false;
#endif
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

  update_regex_branch_start_after_symbol(&next, symbol);
  *(ScannerState *)payload = next;
  lexer->result_symbol = symbol;
  return true;
}

#endif
