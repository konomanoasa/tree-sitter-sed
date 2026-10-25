#ifndef TREE_SITTER_SED_SCANNER_H
#define TREE_SITTER_SED_SCANNER_H

#include "../src/tree_sitter/parser.h"
#include "tokens.h"
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

enum Mode {
  NORMAL,
  ADDRESS,
  PATTERN,
  REPLACEMENT,
  SOURCE,
  DESTINATION,
  TEXT,
  SHELL,
  FLAGS,
  FILE_NAME,
  LABEL_TEXT,
  VERSION_TEXT,
  COMMENT_TEXT
};
enum Bracket {
  BRACKET_OUTSIDE,
  BRACKET_FIRST,
  BRACKET_AFTER_CARET,
  BRACKET_BODY,
  BRACKET_AFTER_OPEN,
};
enum TermStage {
  TERM_STAGE_NONE,
  TERM_STAGE_OPEN_MARKER,
  TERM_STAGE_KIND,
  TERM_STAGE_PAYLOAD,
  TERM_STAGE_CLOSE,
};
enum { SERIALIZED_SIZE = 14 };

// host_* tracks raw input; other regex state tracks decoded input.
typedef struct {
  uint32_t groups;
  uint8_t delimiter;
  uint8_t mode;
  uint8_t bracket;
  uint8_t term;
  uint8_t term_stage;
  uint8_t utf8_remaining;
  uint8_t host_bracket;
  uint8_t host_term;
  uint8_t hyphens;
  bool host_escaped;
  bool host_control;
  bool host_term_closing;
  bool misplaced_class;
  bool verbatim;
  bool interval;
  bool interval_content;
  bool branch_start;
  bool atom;
  bool boundary_atom;
  bool raw_text;
  bool text_eof;
} Scanner;

typedef struct {
  TSLexer lexer;
  TSLexer *input;
  bool pending;
  bool finished;
} LookaheadLexer;

static inline void lookahead_advance(TSLexer *lexer, bool skip) {
  LookaheadLexer *ahead = (LookaheadLexer *)lexer;
  if (ahead->pending) ahead->pending = false;
  else ahead->input->advance(ahead->input, skip);
  lexer->lookahead = ahead->input->lookahead;
}
static inline void lookahead_mark(TSLexer *lexer) {
  LookaheadLexer *ahead = (LookaheadLexer *)lexer;
  if (!ahead->pending && !ahead->finished) ahead->input->mark_end(ahead->input);
}
static inline bool lookahead_eof(const TSLexer *lexer) {
  const LookaheadLexer *ahead = (const LookaheadLexer *)lexer;
  return !ahead->pending && ahead->input->eof(ahead->input);
}
static inline int32_t peek_next(TSLexer *lexer) {
  LookaheadLexer *ahead = (LookaheadLexer *)lexer;
  lexer->mark_end(lexer);
  ahead->input->advance(ahead->input, false);
  ahead->pending = true;
  return ahead->input->lookahead;
}
static inline bool next_eof(TSLexer *lexer) {
  LookaheadLexer *ahead = (LookaheadLexer *)lexer;
  return ahead->input->eof(ahead->input);
}
static inline void finish_token(TSLexer *lexer) {
  lexer->mark_end(lexer);
  ((LookaheadLexer *)lexer)->finished = true;
}

typedef struct {
  unsigned radix;
  unsigned remaining;
  unsigned prefix;
  bool character;
  bool control;
  bool continued;
} Completion;

typedef struct {
  int32_t value;
  bool encoded;
  bool quoted;
  bool host_escape;
  bool incomplete;
  bool invalid_control;
  Completion completion;
} Unit;

static inline void advance(TSLexer *lexer) {
  lexer->advance(lexer, false);
}
static inline bool one_of(int32_t c, const char *set) {
  return c > 0 && c < 128 && strchr(set, c) != NULL;
}
static inline bool blank(int32_t c) {
  return c == ' ' || c == '\t';
}
static inline bool layout_blank(int32_t c, const bool *valid) {
  return blank(c) ||
    (valid[SEPARATOR] &&
      !valid[LABEL] &&
      !valid[VERSION] &&
      one_of(c, "\r\v\f"));
}
static inline bool command_terminator(int32_t c) {
  return c == ';' || c == '}' || c == '#';
}
static inline bool word_separator(int32_t c) {
  return blank(c) || command_terminator(c);
}
static inline bool line_end(TSLexer *lexer) {
  return lexer->eof(lexer) || lexer->lookahead == '\n';
}
static inline bool command_end(TSLexer *lexer) {
  return line_end(lexer) || command_terminator(lexer->lookahead);
}
static inline bool digit(int32_t c) {
  return c >= '0' && c <= '9';
}
static inline bool escape_letter(int32_t c) {
  return one_of(c, "afnrtvcxod");
}
static inline bool term_marker(int32_t c) {
  return c == ':' || c == '.' || c == '=';
}
static inline bool regex_opening(int32_t c) {
  return c == '/' || c == '\\';
}
static inline bool unusable_delimiter(int32_t c) {
  return c == 0 || c == '\n' || c > 127;
}
static inline bool regex_mode(const Scanner *s) {
  return s->mode == ADDRESS || s->mode == PATTERN;
}
static inline bool text_mode(const Scanner *s) {
  return s->mode == TEXT || s->mode == SHELL;
}
static inline bool decoded(int32_t c) {
  return c >= 0 && c <= 0x10ffff && !(c >= 0xd800 && c <= 0xdfff);
}
static inline bool dialect_operator(Unit u) {
  return SED_EXTENDED != u.quoted;
}
static inline bool failed(Unit u) {
  return !decoded(u.value) || (u.invalid_control && !u.incomplete);
}
static inline bool host_escapable(const Scanner *s, int32_t c) {
  return c == s->delimiter || (regex_mode(s) && c == '\n');
}
static inline bool host_boundary(TSLexer *lexer, const Scanner *s) {
  return lexer->eof(lexer) ||
    (!s->host_control &&
      !s->host_escaped &&
      (lexer->lookahead == '\n' ||
        (!text_mode(s) &&
          lexer->lookahead == s->delimiter &&
          !s->host_bracket)));
}
static inline bool host_plain(const Scanner *s) {
  return !s->host_bracket && !s->host_escaped && !s->host_control;
}
static inline void advance_host(TSLexer *lexer, Scanner *s) {
  int32_t c = lexer->lookahead;
  if (regex_mode(s)) {
    if (s->host_bracket == BRACKET_OUTSIDE) {
      if (s->host_control) s->host_control = false;
      else if (s->host_escaped) {
        s->host_escaped = false;
        s->host_control = c == 'c';
      } else if (c == '\\') s->host_escaped = true;
      else if (c == '[') s->host_bracket = BRACKET_FIRST;
    } else if (s->host_term) {
      if (!s->host_term_closing) s->host_term_closing = c == s->host_term;
      else if (c == ']') {
        s->host_term = 0;
        s->host_term_closing = false;
      } else if (c != '[') s->host_term_closing = false;
    } else if (s->host_bracket == BRACKET_AFTER_OPEN && term_marker(c)) {
      s->host_bracket = BRACKET_BODY;
      s->host_term = (uint8_t)c;
    } else if (c == ']' && s->host_bracket >= BRACKET_BODY)
      s->host_bracket = BRACKET_OUTSIDE;
    else if (c == '^' && s->host_bracket == BRACKET_FIRST)
      s->host_bracket = BRACKET_AFTER_CARET;
    else s->host_bracket = c == '[' ? BRACKET_AFTER_OPEN : BRACKET_BODY;
  }
  advance(lexer);
}
static inline int hex(int32_t c) {
  if (digit(c)) return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}
static inline int radix_digit(int32_t c, unsigned radix) {
  int value = hex(c);
  return value >= 0 && (unsigned)value < radix ? value : -1;
}
static inline void skip_blanks(TSLexer *lexer) {
  while (blank(lexer->lookahead)) {
    lexer->advance(lexer, true);
  }
}
static inline void advance_blanks(TSLexer *lexer) {
  while (blank(lexer->lookahead)) advance(lexer);
}
static inline bool
marked(TSLexer *lexer, const bool *valid, enum TokenType token) {
  if (!valid[token]) return false;
  lexer->result_symbol = token;
  return true;
}
static inline bool
emit(TSLexer *lexer, const bool *valid, enum TokenType token) {
  lexer->mark_end(lexer);
  return marked(lexer, valid, token);
}
static inline bool
consume(TSLexer *lexer, const bool *valid, enum TokenType token) {
  advance(lexer);
  return emit(lexer, valid, token);
}
static inline void reset_regex(Scanner *s) {
  *s = (Scanner){
    .mode = s->mode,
    .delimiter = s->delimiter,
    .branch_start = true,
  };
}
static inline void end_construct(Scanner *s, enum Mode mode) {
  *s = (Scanner){.mode = mode};
}
static inline void end_operand(Scanner *s, enum Mode mode) {
  if (s->mode == SOURCE) s->mode = DESTINATION;
  else end_construct(s, mode);
}
static inline void end_term(Scanner *s) {
  s->term = 0;
  s->term_stage = TERM_STAGE_NONE;
  s->misplaced_class = false;
}
static inline void end_interval(Scanner *s) {
  s->interval = false;
  s->interval_content = false;
}
static inline void set_atom(Scanner *s, bool atom) {
  s->atom = atom;
  s->branch_start = false;
}
static inline void regex_element(Scanner *s) {
  if (s->interval) s->interval_content = true;
  else if (s->bracket) s->bracket = BRACKET_BODY;
  else set_atom(s, true);
}
static inline void read_control_escape(TSLexer *lexer, Scanner *s, Unit *u) {
  if (host_boundary(lexer, s)) {
    u->incomplete = regex_mode(s);
    u->completion.control = lexer->eof(lexer);
    return;
  }
  if (!decoded(lexer->lookahead)) {
    u->value = lexer->lookahead;
    return;
  }
  int32_t c = lexer->lookahead;
  advance_host(lexer, s);
  if (c == '\\' && text_mode(s)) {
    u->invalid_control = decoded(lexer->lookahead) && lexer->lookahead != '\\';
    if (lexer->lookahead == '\\' || lexer->lookahead == '\n')
      advance_host(lexer, s);
  } else if (c == '\\') {
    if (
      (!regex_mode(s) || s->host_escaped) &&
      (lexer->lookahead == s->delimiter || lexer->lookahead == '\n')
    ) {
      u->invalid_control = !regex_mode(s) && lexer->lookahead == '&';
      c = lexer->lookahead;
      advance_host(lexer, s);
    } else if (lexer->lookahead == '\\') {
      advance_host(lexer, s);
      if (
        regex_mode(s) && s->host_escaped && host_escapable(s, lexer->lookahead)
      ) {
        advance_host(lexer, s);
        u->invalid_control = true;
      }
    } else if (decoded(lexer->lookahead)) {
      u->invalid_control = true;
      u->incomplete = lexer->eof(lexer);
    } else {
      u->value = lexer->lookahead;
      return;
    }
  }
  if (c >= 'a' && c <= 'z') c -= 32;
  u->value = c ^ 64;
}
static inline void read_numeric_escape(
  TSLexer *lexer,
  Scanner *s,
  Unit *u,
  unsigned radix,
  unsigned limit
) {
  unsigned value = 0, count = 0;
  bool continued = false;
  while (count < limit && !host_boundary(lexer, s)) {
    bool escaped_delimiter = !text_mode(s) &&
      host_plain(s) &&
      lexer->lookahead == '\\' &&
      radix_digit(s->delimiter, radix) >= 0;
    if (escaped_delimiter && peek_next(lexer) != s->delimiter) {
      continued = next_eof(lexer);
      break;
    }
    int d =
      radix_digit(escaped_delimiter ? s->delimiter : lexer->lookahead, radix);
    if (d < 0) break;
    if (escaped_delimiter) advance_host(lexer, s);
    value = value * radix + (unsigned)d;
    advance_host(lexer, s);
    count++;
  }
  if (count < limit && (lexer->eof(lexer) || continued))
    u->completion = (Completion){
      .radix = radix,
      .remaining = limit - count - continued,
      .prefix = continued ? value * radix + (unsigned)hex(s->delimiter) : value,
      .continued = continued,
    };
  if (count) u->value = (int32_t)(value & 255);
  else {
    u->encoded = false;
    u->quoted = true;
  }
}
static inline Unit read_unit(TSLexer *lexer, Scanner *s, bool partner) {
  Unit u = {.value = lexer->lookahead};
  if (s->verbatim) {
    s->verbatim = false;
    advance_host(lexer, s);
    return u;
  }
  bool raw = host_plain(s);
  bool paired = !s->host_bracket && !raw;
  advance_host(lexer, s);
  if (u.value != '\\') return u;
  if (lexer->eof(lexer) || (!raw && host_boundary(lexer, s))) {
    u.incomplete = !s->bracket;
    u.completion.character = lexer->eof(lexer);
    return u;
  }
  int32_t c = lexer->lookahead;
  if (!decoded(c)) return u;
  if (paired && c == '\\') {
    if (partner) {
      // Appending a delimiter letter at EOF can change this pairing.
      int32_t next = peek_next(lexer);
      if (
        !next_eof(lexer) && (!host_escapable(s, next) || !escape_letter(next))
      ) {
        s->verbatim = true;
        return u;
      }
    }
    advance_host(lexer, s);
    c = lexer->lookahead;
    bool letter = escape_letter(c);
    if (lexer->eof(lexer) || !host_escapable(s, c) || (s->bracket && !letter)) {
      u.value = '\\';
      u.quoted = true;
      return u;
    }
    if (!letter) {
      advance_host(lexer, s);
      u.value = c;
      u.quoted = true;
      return u;
    }
  }
  bool delimiter = raw && !text_mode(s) && host_escapable(s, c);
  if (!delimiter && !escape_letter(c)) {
    if (s->bracket) {
      s->verbatim = c == '\\';
      return u;
    }
    if (regex_mode(s)) {
      s->verbatim = true;
      return u;
    }
  }
  advance_host(lexer, s);
  u.value = c;
  if (delimiter) {
    u.host_escape = true;
    return u;
  }
  u.encoded = true;
  switch (c) {
    case 'a':
      u.value = '\a';
      break;
    case 'f':
      u.value = '\f';
      break;
    case 'n':
      u.value = '\n';
      break;
    case 'r':
      u.value = '\r';
      break;
    case 't':
      u.value = '\t';
      break;
    case 'v':
      u.value = '\v';
      break;
    case 'c':
      read_control_escape(lexer, s, &u);
      break;
    case 'x':
      read_numeric_escape(lexer, s, &u, 16, 2);
      break;
    case 'o':
      read_numeric_escape(lexer, s, &u, 8, 3);
      break;
    case 'd':
      read_numeric_escape(lexer, s, &u, 10, 3);
      break;
    default:
      u.encoded = false;
      u.quoted = true;
      break;
  }
  return u;
}
static inline Unit unit(TSLexer *lexer, Scanner *s) {
  return read_unit(lexer, s, false);
}
static inline bool in_list(const Scanner *s) {
  return regex_mode(s) && s->bracket == BRACKET_BODY && !s->term;
}
static inline void peek_range_end(TSLexer *lexer, Scanner *ahead, Unit u) {
  if (u.value == '-' && !host_boundary(lexer, ahead)) unit(lexer, ahead);
}
static inline void peek_range(TSLexer *lexer, Scanner ahead) {
  if (!host_boundary(lexer, &ahead))
    peek_range_end(lexer, &ahead, unit(lexer, &ahead));
}
static inline bool element(
  TSLexer *lexer,
  const Scanner *s,
  const bool *valid,
  enum TokenType token
) {
  finish_token(lexer);
  if (in_list(s)) peek_range(lexer, *s);
  return marked(lexer, valid, token);
}
static inline bool
invalid_encoding(TSLexer *lexer, Scanner *s, const bool *valid) {
  do {
    advance_host(lexer, s);
  } while (!decoded(lexer->lookahead));
  return element(lexer, s, valid, INVALID_ENCODING);
}
static inline Unit regex_unit(TSLexer *lexer, Scanner *s) {
  Unit u = unit(lexer, s);
  if (u.value == '\\' && !u.quoted && !s->bracket) {
    if (host_boundary(lexer, s)) u.incomplete = true;
    else if (!decoded(lexer->lookahead)) {
      u.value = lexer->lookahead;
      u.quoted = true;
    } else {
      Unit next = read_unit(lexer, s, true);
      u.value = next.value;
      u.encoded = u.encoded || next.encoded;
      u.quoted = true;
      u.incomplete = next.incomplete && lexer->eof(lexer);
      u.invalid_control = next.invalid_control;
      u.completion = next.completion;
    }
  }
  return u;
}
static inline bool
escape_issue(TSLexer *lexer, const Scanner *s, const bool *valid, Unit u) {
  enum TokenType token = text_mode(s) ? ESCAPE
    : lexer->eof(lexer)               ? INCOMPLETE_ESCAPE
                                      : INVALID_ESCAPE;
  if (u.invalid_control)
    token = u.incomplete || (text_mode(s) && s->text_eof)
      ? INCOMPLETE_CONTROL_ESCAPE
      : INVALID_CONTROL_ESCAPE;
  return element(lexer, s, valid, token);
}
static inline enum TokenType
variant(Unit u, enum TokenType plain, enum TokenType encoded) {
  return u.encoded ? encoded : u.host_escape ? escaped_symbol(plain) : plain;
}
#define VARIANT(u, token) variant(u, token, token##_ENCODED)
static inline enum TokenType regex_character(Unit u) {
  return u.encoded                ? REGEX_CHARACTER_ESCAPE
    : (u.quoted || u.host_escape) ? REGEX_ESCAPE
                                  : REGEX_CHARACTER;
}
static inline enum TokenType bracket_character(Unit u) {
  return u.encoded                ? BRACKET_CHARACTER_ESCAPE
    : (u.quoted || u.host_escape) ? BRACKET_ESCAPE
                                  : BRACKET_CHARACTER;
}
static inline bool missing(TSLexer *lexer, Scanner *s, const bool *valid) {
  enum TokenType token = lexer->eof(lexer) ? END_OF_INPUT : BOUNDARY;
  if (!valid[token]) return false;
  if (!regex_mode(s)) return command_end(lexer) && marked(lexer, valid, token);
  if (s->term) end_term(s);
  else if (s->interval) end_interval(s);
  else if (s->bracket) s->bracket = BRACKET_OUTSIDE;
  else if (s->groups) s->groups--;
  return emit(lexer, valid, token);
}
static inline bool misplaced_class(TSLexer *lexer, Scanner state) {
  bool name = false;
  int32_t last = 0;
  while (!host_boundary(lexer, &state)) {
    Unit u = unit(lexer, &state);
    if (u.incomplete || u.value == '-' || (last == '[' && term_marker(u.value)))
      return false;
    if (u.value == ']') return name && last == ':';
    name = name || (last != 0 && last != ':');
    last = u.value;
  }
  return false;
}
static inline bool completes_character(Unit u, unsigned character) {
  Completion c = u.completion;
  if (c.control) return (character ^ 64) - 'a' > 'z' - 'a';
  if (c.character || (c.continued && ((character - c.prefix) & 255) == 0))
    return true;
  unsigned low = c.prefix, width = 1;
  for (unsigned i = 0; i < c.remaining; i++) {
    low *= c.radix;
    width *= c.radix;
    if (((character - low) & 255) < width) return true;
  }
  return false;
}
// An escaped delimiter can continue numeric digits after EOF.
static inline bool cut(TSLexer *lexer, Unit u) {
  return lexer->eof(lexer) || u.completion.continued;
}
// Delimiter c prevents an encoded backslash pair from becoming invalid \c.
static inline bool may_fail(const Scanner *s, Unit u) {
  if (u.incomplete)
    return !(u.encoded && u.quoted && u.value == '\\') || s->delimiter != 'c';
  return s->host_escaped ||
    (!s->bracket && !(u.encoded && u.quoted) && completes_character(u, '\\'));
}
static inline bool completes_interval(Unit u, bool comma, bool close) {
  // Completing a digitless numeric escape makes it unquoted.
  bool quoted = u.quoted && u.encoded;
  if (
    close &&
    (SED_EXTENDED ? !quoted && completes_character(u, '}')
                  : completes_character(u, quoted ? '}' : '\\'))
  )
    return true;
  if (quoted) return false;
  if (comma && completes_character(u, ',')) return true;
  for (unsigned c = '0'; c <= '9'; c++)
    if (completes_character(u, c)) return true;
  return false;
}
static inline enum TokenType classify_class(TSLexer *lexer, Scanner state) {
  static const char *const names[] = {
    "alnum:]",
    "alpha:]",
    "blank:]",
    "cntrl:]",
    "digit:]",
    "graph:]",
    "lower:]",
    "print:]",
    "punct:]",
    "space:]",
    "upper:]",
    "xdigit:]"
  };
  enum { NAME_COUNT = sizeof(names) / sizeof(names[0]) };
  // Bits track name positions; failed units span any length.
  uint16_t positions[NAME_COUNT];
  for (size_t i = 0; i < NAME_COUNT; i++) positions[i] = 1;
  bool nonempty = false, terminated = false, at_eof = false;
  bool extendable = false;
  Unit current = unit(lexer, &state);
  for (;;) {
    if (cut(lexer, current))
      for (size_t i = 0; i < NAME_COUNT; i++)
        for (size_t j = 0; j <= strlen(names[i]) - 2; j++)
          if (
            (positions[i] & (1u << j)) &&
            (may_fail(&state, current) ||
              completes_character(current, (unsigned char)names[i][j]))
          )
            extendable = true;
    bool more = !host_boundary(lexer, &state);
    Unit next = more ? unit(lexer, &state) : current;
    if (current.value == ':') {
      if (!more || next.value == ']') {
        terminated = true;
        at_eof = !more && lexer->eof(lexer);
        break;
      }
      if (completes_character(next, ']'))
        for (size_t i = 0; i < NAME_COUNT; i++)
          if (positions[i] & (1u << (strlen(names[i]) - 2))) extendable = true;
    }
    nonempty = true;
    for (size_t i = 0; i < NAME_COUNT; i++) {
      uint16_t matched = 0;
      size_t size = strlen(names[i]) - 2;
      for (size_t j = 0; j < size; j++) {
        if (!(positions[i] & (1u << j))) continue;
        if (failed(current)) positions[i] |= (uint16_t)(1u << (j + 1));
        else if (current.value == names[i][j])
          matched |= (uint16_t)(1u << (j + 1));
      }
      if (!failed(current)) positions[i] = matched;
    }
    if (!more) break;
    current = next;
  }
  if (!nonempty) return at_eof ? END_OF_INPUT : BOUNDARY;
  bool prefix = false;
  for (size_t i = 0; i < NAME_COUNT; i++) {
    size_t size = strlen(names[i]) - 2;
    if (positions[i] & (1u << size)) return CLASS_VALID;
    if (positions[i]) prefix = true;
  }
  return (extendable || (prefix && !terminated && lexer->eof(lexer)))
    ? CLASS_INCOMPLETE
    : CLASS_INVALID;
}
static inline bool closes_term(TSLexer *lexer, Scanner state) {
  return host_boundary(lexer, &state) || unit(lexer, &state).value == ']';
}
static inline bool
scan_term_kind(TSLexer *lexer, Scanner *s, const bool *valid) {
  finish_token(lexer);
  enum TokenType token;
  Scanner ahead = *s;
  if (s->term == ':') token = classify_class(lexer, ahead);
  else {
    Unit first = unit(lexer, &ahead);
    token = TERM_NONEMPTY;
    if (first.value == s->term) {
      if (lexer->eof(lexer)) token = END_OF_INPUT;
      else if (closes_term(lexer, ahead)) token = BOUNDARY;
    }
  }
  s->term_stage = TERM_STAGE_PAYLOAD;
  return marked(lexer, valid, token);
}
static inline bool scan_term(TSLexer *lexer, Scanner *s, const bool *valid) {
  if (s->term_stage == TERM_STAGE_KIND) return scan_term_kind(lexer, s, valid);
  if (!decoded(lexer->lookahead)) return invalid_encoding(lexer, s, valid);
  Unit u = unit(lexer, s);
  if (s->term_stage == TERM_STAGE_OPEN_MARKER) {
    s->term_stage = TERM_STAGE_KIND;
    return emit(lexer, valid, VARIANT(u, TERM_OPEN_MARKER));
  }
  if (s->term_stage == TERM_STAGE_CLOSE) {
    end_term(s);
    return element(lexer, s, valid, VARIANT(u, TERM_CLOSE));
  }
  if (u.invalid_control || u.incomplete)
    return escape_issue(lexer, s, valid, u);
  if (u.value == s->term) {
    finish_token(lexer);
    if (!closes_term(lexer, *s))
      return marked(lexer, valid, VARIANT(u, TERM_TEXT));
    if (s->misplaced_class) end_term(s);
    else s->term_stage = TERM_STAGE_CLOSE;
    return marked(lexer, valid, VARIANT(u, TERM_CLOSE_MARKER));
  }
  if (u.encoded || u.host_escape || u.quoted)
    return emit(
      lexer,
      valid,
      u.encoded ? TERM_TEXT_ENCODED : TERM_TEXT_ESCAPED
    );
  while (
    !host_boundary(lexer, s) &&
    decoded(lexer->lookahead) &&
    lexer->lookahead != '\\' &&
    lexer->lookahead != s->term
  )
    advance_host(lexer, s);
  return emit(lexer, valid, TERM_TEXT);
}
static inline enum TokenType literal_interval(TSLexer *lexer, Scanner state) {
  bool count = false, comma = false, uncertain = false;
  while (!host_boundary(lexer, &state)) {
    Unit u = regex_unit(lexer, &state);
    if (failed(u)) {
      uncertain = true;
      continue;
    }
    if (digit(u.value) && !u.quoted) {
      count = true;
      continue;
    }
    if (u.value == ',' && !u.quoted && !comma) {
      comma = true;
      continue;
    }
    bool close = count || comma || uncertain;
    if (u.value == '}' && u.quoted && close) return REGEX_ESCAPE;
    if (
      (cut(lexer, u) && may_fail(&state, u)) ||
      completes_interval(u, !comma, close)
    )
      return INCOMPLETE_INTERVAL_SYNTAX;
    return INVALID_INTERVAL_SYNTAX;
  }
  if (uncertain) return REGEX_ESCAPE;
  return lexer->eof(lexer) ? INCOMPLETE_INTERVAL_SYNTAX
                           : INVALID_INTERVAL_SYNTAX;
}
static inline bool
scan_interval_start(TSLexer *lexer, Scanner *s, const bool *valid) {
  finish_token(lexer);
  enum TokenType token = INTERVAL_NONEMPTY;
  if (host_boundary(lexer, s))
    token = lexer->eof(lexer) ? INTERVAL_EMPTY_EOF : INTERVAL_EMPTY;
  else {
    Scanner ahead = *s;
    Unit u = regex_unit(lexer, &ahead);
    if (u.value == '}' && dialect_operator(u)) token = INTERVAL_EMPTY;
  }
  s->interval_content = true;
  return marked(lexer, valid, token);
}
static inline bool
scan_regex_boundary(TSLexer *lexer, Scanner *s, const bool *valid) {
  if ((s->groups || s->bracket || s->interval) && missing(lexer, s, valid))
    return true;
  enum TokenType token = lexer->eof(lexer) ? UNTERMINATED_REGEX_EOF
    : lexer->lookahead == '\n'             ? UNTERMINATED_REGEX_LINE
    : s->mode == PATTERN                   ? PATTERN_END
                                           : REGEX_END;
  if (!valid[token]) return missing(lexer, s, valid);
  if (!line_end(lexer)) advance(lexer);
  if (s->mode == PATTERN) {
    s->mode = REPLACEMENT;
    reset_regex(s);
  } else end_construct(s, NORMAL);
  return emit(lexer, valid, token);
}
static inline bool
scan_utf8_start(TSLexer *lexer, Scanner *s, const bool *valid, int32_t lead) {
  uint8_t count = lead < 0xe0 ? 1 : lead < 0xf0 ? 2 : 3;
  finish_token(lexer);
  bool complete = true;
  Scanner ahead = *s;
  for (uint8_t i = 0; i < count; i++) {
    if (host_boundary(lexer, &ahead)) {
      complete = false;
      break;
    }
    Unit next = unit(lexer, &ahead);
    int32_t low = i == 0 && lead == 0xe0 ? 0xa0
      : i == 0 && lead == 0xf0           ? 0x90
                                         : 0x80;
    int32_t high = i == 0 && lead == 0xed ? 0x9f
      : i == 0 && lead == 0xf4            ? 0x8f
                                          : 0xbf;
    if (
      !next.encoded ||
      next.incomplete ||
      next.invalid_control ||
      next.value < low ||
      next.value > high
    ) {
      if (s->bracket && i == 0) peek_range_end(lexer, &ahead, next);
      complete = false;
      break;
    }
  }
  s->utf8_remaining = complete ? count : 0;
  if (s->bracket) s->bracket = BRACKET_BODY;
  set_atom(s, true);
  return marked(
    lexer,
    valid,
    complete       ? UTF8_START
      : s->bracket ? BRACKET_CHARACTER_ESCAPE
                   : REGEX_CHARACTER_ESCAPE
  );
}
static inline bool
scan_interval_unit(TSLexer *lexer, Scanner *s, const bool *valid, Unit u) {
  int32_t c = u.value;
  s->interval_content = true;
  if (!decoded(c)) return emit(lexer, valid, regex_character(u));
  if (c == '}' && dialect_operator(u)) {
    end_interval(s);
    return emit(lexer, valid, VARIANT(u, INTERVAL_CLOSE));
  }
  if (digit(c) && !u.quoted) {
    if (!u.encoded && !u.host_escape)
      while (digit(lexer->lookahead) && !host_boundary(lexer, s))
        advance_host(lexer, s);
    return emit(lexer, valid, VARIANT(u, COUNT));
  }
  if (c == ',' && !u.quoted && valid[INTERVAL_COMMA])
    return emit(lexer, valid, VARIANT(u, INTERVAL_COMMA));
  if (u.encoded || u.quoted || u.host_escape) {
    bool pending = (cut(lexer, u) && may_fail(s, u)) ||
      completes_interval(u, valid[INTERVAL_COMMA], true);
    return emit(
      lexer,
      valid,
      u.encoded   ? pending ? INCOMPLETE_INTERVAL_CHARACTER_ENCODED
                            : INVALID_INTERVAL_CHARACTER_ENCODED
        : pending ? INCOMPLETE_INTERVAL_CHARACTER_ESCAPED
                  : INVALID_INTERVAL_CHARACTER_ESCAPED
    );
  }
  while (
    !host_boundary(lexer, s) &&
    decoded(lexer->lookahead) &&
    !digit(lexer->lookahead) &&
    (lexer->lookahead != ',' || !valid[INTERVAL_COMMA]) &&
    (lexer->lookahead != '}' || !SED_EXTENDED) &&
    lexer->lookahead != '\\'
  )
    advance_host(lexer, s);
  return emit(lexer, valid, INVALID_INTERVAL_CHARACTER);
}
static inline enum TokenType term_opening(Unit u, int32_t marker) {
  switch (marker) {
    case ':':
      return VARIANT(u, CLASS_OPEN);
    case '.':
      return VARIANT(u, COLLATING_OPEN);
    default:
      return VARIANT(u, EQUIVALENCE_OPEN);
  }
}
static inline bool scan_range_operator(
  TSLexer *lexer,
  Scanner *s,
  const bool *valid,
  Unit u,
  uint8_t hyphens
) {
  finish_token(lexer);
  bool closing = host_boundary(lexer, s), pending = false;
  bool continuation = hyphens >= 2;
  if (!closing) {
    Scanner ahead = *s;
    Unit next = unit(lexer, &ahead);
    closing = next.value == ']';
    pending = !closing &&
      (completes_character(next, ']') || completes_character(next, '-'));
    if (hyphens != 1 && next.value == '-') {
      if (host_boundary(lexer, &ahead)) pending = lexer->eof(lexer);
      else {
        Unit last = unit(lexer, &ahead);
        if (last.value == '-')
          return marked(lexer, valid, bracket_character(u));
        pending = completes_character(last, '-');
      }
    }
  }
  if (closing) return marked(lexer, valid, bracket_character(u));
  enum TokenType token = valid[RANGE_DASH]
    ? pending ? VARIANT(u, PENDING_RANGE_DASH) : VARIANT(u, RANGE_DASH)
    : continuation ? VARIANT(u, RANGE_CONTINUATION)
    : pending      ? VARIANT(u, INCOMPLETE_RANGE_OPERATOR)
                   : VARIANT(u, INVALID_RANGE_OPERATOR);
  return marked(lexer, valid, token);
}
static inline bool scan_bracket_unit(
  TSLexer *lexer,
  Scanner *s,
  const bool *valid,
  Unit u,
  uint8_t hyphens
) {
  int32_t c = u.value;
  if (c == ']' && s->bracket == BRACKET_BODY) {
    s->bracket = BRACKET_OUTSIDE;
    s->atom = true;
    return emit(lexer, valid, VARIANT(u, BRACKET_CLOSE));
  }
  if (c == '^' && s->bracket == BRACKET_FIRST) {
    s->bracket = BRACKET_AFTER_CARET;
    return emit(lexer, valid, VARIANT(u, BRACKET_NEGATION));
  }
  uint8_t previous = s->bracket;
  s->bracket = BRACKET_BODY;
  if (c == ':' && previous < BRACKET_BODY) {
    finish_token(lexer);
    if (!misplaced_class(lexer, *s))
      return marked(lexer, valid, bracket_character(u));
    s->term = ':';
    s->term_stage = TERM_STAGE_PAYLOAD;
    s->misplaced_class = true;
    return marked(lexer, valid, VARIANT(u, MISPLACED_CLASS_START));
  }
  if (c == '[' && !host_boundary(lexer, s)) {
    finish_token(lexer);
    Scanner ahead = *s;
    Unit marker = unit(lexer, &ahead);
    if (term_marker(marker.value)) {
      s->term = (uint8_t)marker.value;
      s->term_stage = TERM_STAGE_OPEN_MARKER;
      return marked(lexer, valid, term_opening(u, marker.value));
    }
    peek_range_end(lexer, &ahead, marker);
    return marked(lexer, valid, bracket_character(u));
  }
  if (
    c == '-' &&
    previous == BRACKET_BODY &&
    (valid[RANGE_DASH] || valid[INVALID_RANGE_OPERATOR])
  )
    return scan_range_operator(lexer, s, valid, u, hyphens);
  return element(lexer, s, valid, bracket_character(u));
}
static inline bool scan_regex_atom(
  TSLexer *lexer,
  Scanner *s,
  const bool *valid,
  Unit u,
  bool boundary_atom
) {
  int32_t c = u.value;
  if (c == '[' && !u.quoted) {
    s->bracket = BRACKET_FIRST;
    s->branch_start = false;
    return emit(lexer, valid, VARIANT(u, BRACKET_OPEN));
  }
  if (c == '(' && dialect_operator(u)) {
    s->groups++;
    s->atom = false;
    s->branch_start = true;
    return emit(lexer, valid, VARIANT(u, GROUP_OPEN));
  }
  if (c == ')' && dialect_operator(u)) {
    set_atom(s, s->groups != 0);
    if (!s->groups)
      return emit(
        lexer,
        valid,
        u.completion.radix ? INCOMPLETE_GROUP_CLOSE_ENCODED
                           : VARIANT(u, UNMATCHED_GROUP_CLOSE)
      );
    s->groups--;
    return emit(lexer, valid, VARIANT(u, GROUP_CLOSE));
  }
  if (c == '|' && dialect_operator(u)) {
    s->atom = false;
    s->branch_start = true;
    return emit(lexer, valid, VARIANT(u, ALTERNATION));
  }
  if (
    (c == '*' && !u.quoted) || ((c == '+' || c == '?') && dialect_operator(u))
  ) {
    if (s->atom) return emit(lexer, valid, VARIANT(u, QUANTIFIER));
    if (SED_EXTENDED)
      return emit(
        lexer,
        valid,
        u.completion.radix ? INCOMPLETE_REGEX_OPERATOR_ENCODED
                           : VARIANT(u, INVALID_REGEX_OPERATOR)
      );
  }
  if (c == '{' && dialect_operator(u)) {
    if (s->atom || SED_EXTENDED) {
      s->interval = true;
      return emit(
        lexer,
        valid,
        s->atom ? VARIANT(u, INTERVAL_OPEN) : VARIANT(u, ORPHAN_INTERVAL_OPEN)
      );
    }
    set_atom(s, true);
    enum TokenType literal = regex_character(u);
    if (!boundary_atom) return emit(lexer, valid, literal);
    finish_token(lexer);
    enum TokenType token = literal_interval(lexer, *s);
    if (token == REGEX_ESCAPE) return marked(lexer, valid, literal);
    return marked(
      lexer,
      valid,
      token == INVALID_INTERVAL_SYNTAX ? VARIANT(u, INVALID_INTERVAL_SYNTAX)
                                       : VARIANT(u, INCOMPLETE_INTERVAL_SYNTAX)
    );
  }
  if (u.quoted && c >= '1' && c <= '9') {
    set_atom(s, true);
    return emit(lexer, valid, VARIANT(u, REGEX_BACKREFERENCE));
  }
  if (u.quoted && one_of(c, "bB<>`'")) {
    s->boundary_atom = s->atom || boundary_atom;
    set_atom(s, false);
    return emit(lexer, valid, VARIANT(u, REGEX_BOUNDARY));
  }
  if (u.quoted && one_of(c, "wWsS")) {
    set_atom(s, true);
    return emit(lexer, valid, VARIANT(u, REGEX_CLASS_ESCAPE));
  }
  if (!u.quoted && c == '.') {
    set_atom(s, true);
    return emit(lexer, valid, VARIANT(u, REGEX_DOT));
  }
  if (!u.quoted && c == '^' && (SED_EXTENDED || s->branch_start)) {
    set_atom(s, false);
    return emit(lexer, valid, VARIANT(u, REGEX_ANCHOR));
  }
  if (!u.quoted && c == '$') {
    finish_token(lexer);
    bool anchor = SED_EXTENDED || host_boundary(lexer, s);
    if (!anchor) {
      Scanner ahead = *s;
      Unit next = regex_unit(lexer, &ahead);
      anchor =
        (next.value == ')' || next.value == '|') && dialect_operator(next);
    }
    set_atom(s, !anchor);
    return marked(
      lexer,
      valid,
      anchor ? VARIANT(u, REGEX_ANCHOR) : regex_character(u)
    );
  }
  set_atom(s, true);
  return emit(lexer, valid, regex_character(u));
}
static inline bool scan_regex(TSLexer *lexer, Scanner *s, const bool *valid) {
  uint8_t hyphens = s->hyphens;
  bool boundary_atom = s->boundary_atom;
  s->hyphens = 0;
  s->boundary_atom = false;
  if (s->interval && !s->interval_content)
    return scan_interval_start(lexer, s, valid);
  if (host_boundary(lexer, s)) return scan_regex_boundary(lexer, s, valid);
  if (s->term) return scan_term(lexer, s, valid);
  if (!decoded(lexer->lookahead)) {
    regex_element(s);
    return invalid_encoding(lexer, s, valid);
  }
  Unit u = regex_unit(lexer, s);
  if (s->bracket && u.value == '-') s->hyphens = hyphens < 3 ? hyphens + 1 : 1;
  if (u.invalid_control || u.incomplete) {
    regex_element(s);
    return escape_issue(lexer, s, valid, u);
  }
  if (s->interval) return scan_interval_unit(lexer, s, valid, u);
  if (s->utf8_remaining && u.encoded && u.value >= 0x80 && u.value <= 0xbf) {
    s->utf8_remaining--;
    return element(lexer, s, valid, UTF8_CONTINUATION);
  }
  s->utf8_remaining = 0;
  if (u.encoded && u.value >= 0xc2 && u.value <= 0xf4)
    return scan_utf8_start(lexer, s, valid, u.value);
  if (s->bracket) return scan_bracket_unit(lexer, s, valid, u, hyphens);
  return scan_regex_atom(lexer, s, valid, u, boundary_atom);
}
static inline bool raw_text(TSLexer *lexer, Scanner *s, bool leadin) {
  bool escaped = false;
  bool prefix = leadin;
  s->verbatim = false;
  s->text_eof = false;
  if (leadin) advance(lexer);
  while (!lexer->eof(lexer)) {
    int32_t c = lexer->lookahead;
    if (prefix && c != '\\') {
      s->verbatim = c == '\n';
      prefix = false;
    }
    if (c == '\n' && !escaped) return false;
    escaped = c == '\\' && !escaped;
    advance(lexer);
  }
  if (escaped && leadin) s->verbatim = true;
  s->text_eof = true;
  return escaped;
}
static inline bool
scan_raw_text(TSLexer *lexer, Scanner *s, const bool *valid) {
  bool consumed = false;
  if (s->verbatim) {
    s->verbatim = false;
    advance(lexer);
    consumed = true;
  }
  while (!line_end(lexer) && decoded(lexer->lookahead)) {
    if (lexer->lookahead == '\\') {
      int32_t next = peek_next(lexer);
      if (next == '\n' || next_eof(lexer)) {
        if (consumed) break;
        advance(lexer);
        if (lexer->eof(lexer)) return emit(lexer, valid, ESCAPE);
        return consume(lexer, valid, LINE_CONTINUATION);
      }
      advance(lexer);
      if (!decoded(lexer->lookahead)) break;
    }
    advance(lexer);
    consumed = true;
  }
  return emit(lexer, valid, LITERAL);
}
static inline bool scan_operand(TSLexer *lexer, Scanner *s, const bool *valid) {
  if (text_mode(s) && line_end(lexer)) {
    end_construct(s, NORMAL);
    return emit(lexer, valid, TEXT_END);
  }
  if (s->verbatim && !s->raw_text) {
    s->verbatim = false;
    return consume(lexer, valid, ESCAPE);
  }
  if (line_end(lexer)) {
    enum TokenType token =
      lexer->eof(lexer) ? UNTERMINATED_OPERAND_EOF : UNTERMINATED_OPERAND_LINE;
    end_operand(s, NORMAL);
    return emit(lexer, valid, token);
  }
  if (!text_mode(s) && lexer->lookahead == s->delimiter) {
    enum TokenType token = s->mode == REPLACEMENT ? REPLACEMENT_END
      : s->mode == SOURCE                         ? TRANSLATION_MIDDLE
                                                  : TRANSLATION_END;
    end_operand(s, s->mode == REPLACEMENT ? FLAGS : NORMAL);
    return consume(lexer, valid, token);
  }
  if (!decoded(lexer->lookahead)) return invalid_encoding(lexer, s, valid);
  if (text_mode(s) && s->raw_text) return scan_raw_text(lexer, s, valid);
  int32_t raw = lexer->lookahead;
  Unit u = unit(lexer, s);
  if (u.invalid_control || u.incomplete)
    return escape_issue(lexer, s, valid, u);
  if (raw == '\\' && u.value == '\n' && !u.encoded)
    return emit(lexer, valid, LINE_CONTINUATION);
  if (s->mode == REPLACEMENT) {
    if (raw == '&') return emit(lexer, valid, MATCH_REFERENCE);
    if (u.quoted && digit(u.value)) return emit(lexer, valid, BACKREFERENCE);
    if (u.quoted && one_of(u.value, "LlUuE"))
      return emit(lexer, valid, CASE_CONVERSION);
  }
  if (raw == '\\')
    return emit(lexer, valid, u.encoded ? CHARACTER_ESCAPE : ESCAPE);
  while (
    !line_end(lexer) &&
    lexer->lookahead != '\\' &&
    decoded(lexer->lookahead) &&
    (text_mode(s) || lexer->lookahead != s->delimiter) &&
    (s->mode != REPLACEMENT || lexer->lookahead != '&')
  )
    advance(lexer);
  return emit(lexer, valid, LITERAL);
}
static inline bool opaque_end(TSLexer *lexer, bool word) {
  return line_end(lexer) || (word && word_separator(lexer->lookahead));
}
static inline bool scan_opaque(TSLexer *lexer, Scanner *s, const bool *valid) {
  bool word = s->mode == LABEL_TEXT || s->mode == VERSION_TEXT;
  bool comment = s->mode == COMMENT_TEXT;
  if (opaque_end(lexer, word)) {
    s->mode = NORMAL;
    return emit(lexer, valid, comment ? COMMENT_END : OPAQUE_END);
  }
  if (!decoded(lexer->lookahead)) return invalid_encoding(lexer, s, valid);
  enum TokenType token = s->mode == LABEL_TEXT ? LABEL
    : s->mode == VERSION_TEXT                  ? VERSION
    : comment                                  ? COMMENT_TAIL
                                               : FILENAME;
  do advance(lexer);
  while (!opaque_end(lexer, word) && decoded(lexer->lookahead));
  return emit(lexer, valid, token);
}
static inline bool scan_digits(TSLexer *lexer) {
  bool zero = true;
  do {
    zero = zero && lexer->lookahead == '0';
    advance(lexer);
  } while (digit(lexer->lookahead));
  return zero;
}
static inline enum TokenType zero_address(TSLexer *lexer, bool first) {
  advance_blanks(lexer);
  if (lexer->lookahead == '~') {
    advance(lexer);
    advance_blanks(lexer);
    while (lexer->lookahead == '0') advance(lexer);
    if (digit(lexer->lookahead)) return NUMBER;
  }
  if (first) {
    advance_blanks(lexer);
    if (lexer->lookahead == ',') {
      advance(lexer);
      advance_blanks(lexer);
      if (regex_opening(lexer->lookahead)) return ZERO_NUMBER;
    } else {
      while (!decoded(lexer->lookahead)) {
        advance(lexer);
        advance_blanks(lexer);
      }
      if (lexer->lookahead == 'r') return ZERO_NUMBER;
    }
  }
  return lexer->eof(lexer) ? PENDING_ZERO : INVALID_ZERO;
}
static inline bool address_gap(TSLexer *lexer, const bool *valid) {
  int32_t c = lexer->lookahead;
  return valid[ADDRESS_GAP] &&
    !lexer->eof(lexer) &&
    (!valid[REGEX_START] || (c != '$' && c != '+' && c != '~'));
}
static inline bool blanks_precede_token(TSLexer *lexer, const bool *valid) {
  int32_t c = lexer->lookahead;
  return ((valid[FILENAME] || valid[SHELL_START]) && !line_end(lexer)) ||
    ((valid[LABEL] || valid[VERSION]) && !opaque_end(lexer, true)) ||
    ((valid[TEXT_START] || valid[INLINE_TEXT_START]) && !lexer->eof(lexer)) ||
    (valid[FIRST_ADDRESS_GAP] && c == ',') ||
    ((valid[NUMBER] || valid[ZERO_NUMBER]) && digit(c)) ||
    (valid[REGEX_START] && regex_opening(c)) ||
    (valid[SEPARATOR] && (c == ';' || c == '\n')) ||
    (valid[COMMENT] && c == '#') ||
    (valid[BLOCK_CLOSE] && c == '}') ||
    (valid[ADDRESS_MODIFIER] && (c == 'I' || c == 'M'));
}
static inline bool command_ending(TSLexer *lexer, const bool *valid) {
  return marked(
    lexer,
    valid,
    command_end(lexer) ? COMMAND_END : MISSING_SEPARATOR
  );
}
static inline bool scan_layout(TSLexer *lexer, const bool *valid) {
  lexer->mark_end(lexer);
  while (layout_blank(lexer->lookahead, valid)) advance(lexer);
  if (
    !blanks_precede_token(lexer, valid) &&
    valid[COMMAND_END] &&
    command_end(lexer)
  )
    return marked(lexer, valid, COMMAND_END);
  return emit(lexer, valid, BLANK);
}
static inline bool
scan_text_start(TSLexer *lexer, Scanner *s, const bool *valid, bool shell) {
  if (lexer->eof(lexer)) return missing(lexer, s, valid);
  enum TokenType token = shell ? INLINE_SHELL_START : INLINE_TEXT_START;
  bool leadin = false;
  if (lexer->lookahead == '\\') {
    token = shell ? SHELL_START : TEXT_START;
    advance(lexer);
    leadin = lexer->lookahead == '\\';
    if (lexer->lookahead == '\n') advance(lexer);
  }
  s->mode = shell ? SHELL : TEXT;
  finish_token(lexer);
  s->raw_text = raw_text(lexer, s, leadin);
  return marked(lexer, valid, token);
}
static inline bool
scan_comment_start(TSLexer *lexer, Scanner *s, const bool *valid) {
  advance(lexer);
  enum TokenType token =
    valid[DIRECTIVE] && lexer->lookahead == 'n' ? DIRECTIVE : COMMENT;
  if (token == DIRECTIVE) advance(lexer);
  else
    while (!line_end(lexer) && decoded(lexer->lookahead)) advance(lexer);
  s->mode = COMMENT_TEXT;
  return emit(lexer, valid, token);
}
static inline bool scan_delimiter_start(
  TSLexer *lexer,
  Scanner *s,
  const bool *valid,
  enum TokenType start
) {
  if (line_end(lexer)) return missing(lexer, s, valid);
  if (start == REGEX_START && lexer->lookahead == '\\') {
    advance(lexer);
    if (!decoded(lexer->lookahead) || unusable_delimiter(lexer->lookahead))
      return emit(lexer, valid, INVALID_ADDRESS_PREFIX);
  }
  if (unusable_delimiter(lexer->lookahead))
    return consume(lexer, valid, INVALID_DELIMITER);
  s->delimiter = (uint8_t)lexer->lookahead;
  s->mode = start == REGEX_START ? ADDRESS
    : start == PATTERN_START     ? PATTERN
                                 : SOURCE;
  reset_regex(s);
  return consume(lexer, valid, start);
}
static inline enum TokenType flag(int32_t c) {
  switch (c) {
    case 'g':
      return GLOBAL_FLAG;
    case 'p':
      return PRINT_FLAG;
    case 'e':
      return EVALUATE_FLAG;
    case 'w':
      return WRITE_FLAG;
    case 'i':
    case 'I':
    case 'm':
    case 'M':
      return MATCH_FLAG;
    default:
      return UNKNOWN_FLAG;
  }
}
static inline bool scan_flag(TSLexer *lexer, Scanner *s, const bool *valid) {
  lexer->mark_end(lexer);
  skip_blanks(lexer);
  int32_t c = lexer->lookahead;
  if (!decoded(c)) return invalid_encoding(lexer, s, valid);
  if (digit(c)) {
    if (!scan_digits(lexer)) return emit(lexer, valid, OCCURRENCE);
    return emit(
      lexer,
      valid,
      lexer->eof(lexer) ? PENDING_ZERO : ZERO_OCCURRENCE
    );
  }
  if (c == '\r') {
    advance(lexer);
    if (lexer->lookahead != '\n')
      return emit(
        lexer,
        valid,
        lexer->eof(lexer) ? PENDING_FLAG : UNKNOWN_FLAG
      );
  } else if (!command_end(lexer)) {
    if (c == 'w') s->mode = NORMAL;
    return consume(lexer, valid, flag(c));
  }
  s->mode = NORMAL;
  return marked(lexer, valid, COMMAND_END);
}
static inline bool scan_normal(TSLexer *lexer, Scanner *s, const bool *valid) {
  s->mode = NORMAL;
  if (
    !valid[PATTERN_START] &&
    !valid[TRANSLATION_START] &&
    layout_blank(lexer->lookahead, valid)
  )
    return scan_layout(lexer, valid);
  lexer->mark_end(lexer);
  bool shell = valid[SHELL_START] || valid[INLINE_SHELL_START];
  if (
    valid[TEXT_START] || valid[INLINE_TEXT_START] || (shell && !line_end(lexer))
  )
    return scan_text_start(lexer, s, valid, shell);
  if (valid[SEPARATOR] && (lexer->lookahead == ';' || lexer->lookahead == '\n'))
    return consume(lexer, valid, SEPARATOR);
  if ((valid[COMMENT] || valid[DIRECTIVE]) && lexer->lookahead == '#')
    return scan_comment_start(lexer, s, valid);
  bool nul = !lexer->eof(lexer) && lexer->lookahead == 0;
  if (nul && (valid[EMPTY_LABEL] || valid[EMPTY_FILENAME])) {
    s->mode = valid[EMPTY_LABEL] ? LABEL_TEXT : FILE_NAME;
    return consume(
      lexer,
      valid,
      valid[EMPTY_LABEL] ? EMPTY_LABEL : EMPTY_FILENAME
    );
  }
  if (valid[FILENAME] || valid[LABEL] || valid[VERSION]) {
    if (!opaque_end(lexer, valid[LABEL] || valid[VERSION])) {
      s->mode = valid[FILENAME] ? FILE_NAME
        : valid[LABEL]          ? LABEL_TEXT
                                : VERSION_TEXT;
      return scan_opaque(lexer, s, valid);
    }
    if (missing(lexer, s, valid)) return true;
  }
  if (!decoded(lexer->lookahead) && valid[INVALID_ENCODING])
    return invalid_encoding(lexer, s, valid);
  enum TokenType start = valid[PATTERN_START] ? PATTERN_START
    : valid[TRANSLATION_START]                ? TRANSLATION_START
                                              : REGEX_START;
  if (valid[start] && (start != REGEX_START || regex_opening(lexer->lookahead)))
    return scan_delimiter_start(lexer, s, valid, start);
  if (valid[INVALID_DELIMITER] && !line_end(lexer))
    return consume(lexer, valid, INVALID_DELIMITER);
  if (
    valid[ADDRESS_MODIFIER] &&
    (lexer->lookahead == 'I' || lexer->lookahead == 'M')
  )
    return consume(lexer, valid, ADDRESS_MODIFIER);
  if ((valid[NUMBER] || valid[ZERO_NUMBER]) && digit(lexer->lookahead)) {
    bool zero = scan_digits(lexer);
    lexer->mark_end(lexer);
    return marked(
      lexer,
      valid,
      !zero                   ? NUMBER
        : valid[PENDING_ZERO] ? zero_address(lexer, valid[FIRST_ADDRESS_GAP])
                              : ZERO_NUMBER
    );
  }
  if (valid[FIRST_ADDRESS_GAP] && lexer->lookahead == ',')
    return marked(lexer, valid, FIRST_ADDRESS_GAP);
  if (address_gap(lexer, valid)) return marked(lexer, valid, ADDRESS_GAP);
  if (valid[COMMAND_END] && command_ending(lexer, valid)) return true;
  if (valid[BLOCK_CLOSE] && lexer->lookahead == '}')
    return consume(lexer, valid, BLOCK_CLOSE);
  if (nul && valid[NUL_COMMAND]) return consume(lexer, valid, NUL_COMMAND);
  return missing(lexer, s, valid);
}
static inline bool scan(void *payload, TSLexer *lexer, const bool *valid) {
  if (valid[ERROR_SENTINEL]) return false;
  LookaheadLexer ahead = {
    .lexer =
      {
        .lookahead = lexer->lookahead,
        .advance = lookahead_advance,
        .mark_end = lookahead_mark,
        .eof = lookahead_eof,
      },
    .input = lexer,
  };
  Scanner next = *(Scanner *)payload;
  bool result;
  if (next.mode >= FILE_NAME) result = scan_opaque(&ahead.lexer, &next, valid);
  else if (regex_mode(&next)) result = scan_regex(&ahead.lexer, &next, valid);
  else if (next.mode == FLAGS) result = scan_flag(&ahead.lexer, &next, valid);
  else if (next.mode != NORMAL)
    result = scan_operand(&ahead.lexer, &next, valid);
  else result = scan_normal(&ahead.lexer, &next, valid);
  // Tree-sitter tracks only the first lookahead byte; advance past multibyte input.
  if (lexer->lookahead >= 0x80 && decoded(lexer->lookahead))
    lexer->advance(lexer, false);
  if (result) {
    *(Scanner *)payload = next;
    lexer->result_symbol = ahead.lexer.result_symbol;
  }
  return result;
}
static inline unsigned serialize(void *payload, char *buffer) {
  const Scanner *s = payload;
  buffer[0] = (char)s->mode;
  buffer[1] = (char)s->bracket;
  buffer[2] = (char)s->term;
  buffer[3] = (char)s->term_stage;
  buffer[4] = (char)s->utf8_remaining;
  buffer[5] = (char)s->host_bracket;
  buffer[6] = (char)s->host_term;
  buffer[7] = (char)s->delimiter;
  buffer[8] = (char)(s->interval |
    s->branch_start << 1 |
    s->atom << 2 |
    s->interval_content << 3 |
    s->verbatim << 4 |
    s->misplaced_class << 5 |
    s->boundary_atom << 6 |
    s->raw_text << 7);
  buffer[9] = (char)(s->host_escaped |
    s->host_term_closing << 1 |
    s->host_control << 2 |
    s->text_eof << 3 |
    s->hyphens << 4);
  for (unsigned i = 0; i < 4; i++)
    buffer[10 + i] = (char)(s->groups >> (i * 8));
  // Match Tree-sitter's empty initial state.
  for (unsigned i = 0; i < SERIALIZED_SIZE; i++)
    if (buffer[i]) return SERIALIZED_SIZE;
  return 0;
}
static inline void
deserialize(void *payload, const char *buffer, unsigned length) {
  Scanner *s = payload;
  memset(s, 0, sizeof(*s));
  if (length != SERIALIZED_SIZE) return;
  uint8_t flags = (uint8_t)buffer[8];
  uint8_t host_flags = (uint8_t)buffer[9];
  s->mode = (uint8_t)buffer[0];
  s->bracket = (uint8_t)buffer[1];
  s->term = (uint8_t)buffer[2];
  s->term_stage = (uint8_t)buffer[3];
  s->utf8_remaining = (uint8_t)buffer[4];
  s->host_bracket = (uint8_t)buffer[5];
  s->host_term = (uint8_t)buffer[6];
  s->delimiter = (uint8_t)buffer[7];
  s->interval = flags & 1;
  s->branch_start = flags & 2;
  s->atom = flags & 4;
  s->interval_content = flags & 8;
  s->verbatim = flags & 16;
  s->misplaced_class = flags & 32;
  s->boundary_atom = flags & 64;
  s->raw_text = flags & 128;
  s->host_escaped = host_flags & 1;
  s->host_term_closing = host_flags & 2;
  s->host_control = host_flags & 4;
  s->text_eof = host_flags & 8;
  s->hyphens = (host_flags >> 4) & 3;
  for (unsigned i = 0; i < 4; i++)
    s->groups |= (uint32_t)(uint8_t)buffer[10 + i] << (i * 8);
}
#endif
