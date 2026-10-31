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
enum { SERIALIZED_SIZE = 13 };

// host_* tracks raw input; other regex state tracks decoded input.
typedef struct {
  uint32_t groups;
  uint8_t delimiter;
  uint8_t mode;
  uint8_t bracket;
  uint8_t term;
  uint8_t term_stage;
  uint8_t host_bracket;
  uint8_t host_term;
  uint8_t hyphens;
  bool host_escaped;
  bool host_control;
  bool host_term_closing;
  bool verbatim;
  bool interval;
  bool branch_start;
  bool atom;
  bool boundary_atom;
  bool raw_text;
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
  int32_t value;
  bool encoded;
  bool quoted;
  bool host_escape;
  bool incomplete;
  bool invalid_control;
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
      !valid[REQUIRED_LABEL] &&
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
  return c == '\n' || c > 127;
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
}
static inline void end_interval(Scanner *s) {
  s->interval = false;
}
static inline void set_atom(Scanner *s, bool atom) {
  s->atom = atom;
  s->branch_start = false;
}
static inline void read_control_escape(TSLexer *lexer, Scanner *s, Unit *u) {
  if (host_boundary(lexer, s)) {
    u->incomplete = regex_mode(s);
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
  while (count < limit && !host_boundary(lexer, s)) {
    bool escaped_delimiter = !text_mode(s) &&
      host_plain(s) &&
      lexer->lookahead == '\\' &&
      radix_digit(s->delimiter, radix) >= 0;
    if (escaped_delimiter && peek_next(lexer) != s->delimiter) {
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
    }
  }
  return u;
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
static inline bool valid_class(TSLexer *lexer, Scanner state) {
  static const char *const names[] = {
    "alnum",
    "alpha",
    "blank",
    "cntrl",
    "digit",
    "graph",
    "lower",
    "print",
    "punct",
    "space",
    "upper",
    "xdigit"
  };
  uint16_t candidates = (1u << (sizeof(names) / sizeof(names[0]))) - 1;
  size_t position = 0;
  while (!host_boundary(lexer, &state)) {
    Unit u = unit(lexer, &state);
    if (u.incomplete || u.invalid_control || !decoded(u.value)) return false;
    if (u.value == ':') {
      if (host_boundary(lexer, &state) || unit(lexer, &state).value != ']')
        return false;
      for (size_t i = 0; i < sizeof(names) / sizeof(names[0]); i++)
        if ((candidates & (1u << i)) && names[i][position] == 0) return true;
      return false;
    }
    for (size_t i = 0; i < sizeof(names) / sizeof(names[0]); i++)
      if ((candidates & (1u << i)) && names[i][position] != u.value)
        candidates &= (uint16_t)~(1u << i);
    if (!candidates) return false;
    position++;
  }
  return false;
}
static inline bool closes_term(TSLexer *lexer, Scanner state) {
  return host_boundary(lexer, &state) || unit(lexer, &state).value == ']';
}
static inline bool scan_term(TSLexer *lexer, Scanner *s, const bool *valid) {
  if (s->term_stage == TERM_STAGE_KIND) {
    finish_token(lexer);
    s->term_stage = TERM_STAGE_PAYLOAD;
    return valid_class(lexer, *s) && marked(lexer, valid, CLASS_VALID);
  }
  if (!decoded(lexer->lookahead)) return false;
  Unit u = unit(lexer, s);
  if (s->term_stage == TERM_STAGE_OPEN_MARKER) {
    s->term_stage = s->term == ':' ? TERM_STAGE_KIND : TERM_STAGE_PAYLOAD;
    return emit(lexer, valid, VARIANT(u, TERM_OPEN_MARKER));
  }
  if (s->term_stage == TERM_STAGE_CLOSE) {
    end_term(s);
    return element(lexer, s, valid, VARIANT(u, TERM_CLOSE));
  }
  if (u.invalid_control || u.incomplete || !decoded(u.value)) return false;
  if (u.value == s->term) {
    finish_token(lexer);
    if (!closes_term(lexer, *s))
      return marked(lexer, valid, VARIANT(u, TERM_TEXT));
    s->term_stage = TERM_STAGE_CLOSE;
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
static inline bool literal_interval(TSLexer *lexer, Scanner state) {
  bool count = false, comma = false;
  while (!host_boundary(lexer, &state)) {
    Unit u = regex_unit(lexer, &state);
    if (u.incomplete || u.invalid_control || !decoded(u.value)) return false;
    if (digit(u.value) && !u.quoted) count = true;
    else if (u.value == ',' && !u.quoted && !comma) comma = true;
    else return u.value == '}' && u.quoted && (count || comma);
  }
  return false;
}
static inline bool
scan_regex_boundary(TSLexer *lexer, Scanner *s, const bool *valid) {
  if (line_end(lexer) || s->groups || s->bracket || s->interval) return false;
  enum TokenType token = s->mode == PATTERN ? PATTERN_END : REGEX_END;
  advance(lexer);
  if (s->mode == PATTERN) {
    s->mode = REPLACEMENT;
    reset_regex(s);
  } else end_construct(s, NORMAL);
  return emit(lexer, valid, token);
}
static inline bool
scan_interval_unit(TSLexer *lexer, Scanner *s, const bool *valid, Unit u) {
  int32_t c = u.value;
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
  if (c == ',' && !u.quoted)
    return emit(lexer, valid, VARIANT(u, INTERVAL_COMMA));
  return false;
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
  bool closing = host_boundary(lexer, s);
  if (!closing) {
    Scanner ahead = *s;
    Unit next = unit(lexer, &ahead);
    closing = next.value == ']';
    if (hyphens != 1 && next.value == '-' && !host_boundary(lexer, &ahead)) {
      Unit last = unit(lexer, &ahead);
      if (last.value == '-') return marked(lexer, valid, bracket_character(u));
    }
  }
  if (closing) return marked(lexer, valid, bracket_character(u));
  if (valid[RANGE_DASH]) return marked(lexer, valid, VARIANT(u, RANGE_DASH));
  return hyphens >= 2 && marked(lexer, valid, VARIANT(u, RANGE_CONTINUATION));
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
    return false;
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
    (valid[RANGE_DASH] || valid[RANGE_CONTINUATION] || valid[BRACKET_CLOSE])
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
    if (!s->groups) return false;
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
    if (SED_EXTENDED) return false;
  }
  if (c == '{' && dialect_operator(u)) {
    if (s->atom) {
      s->interval = true;
      return emit(lexer, valid, VARIANT(u, INTERVAL_OPEN));
    }
    if (SED_EXTENDED) return false;
    set_atom(s, true);
    enum TokenType literal = regex_character(u);
    if (!boundary_atom) return emit(lexer, valid, literal);
    finish_token(lexer);
    return literal_interval(lexer, *s) && marked(lexer, valid, literal);
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
  if (host_boundary(lexer, s)) return scan_regex_boundary(lexer, s, valid);
  if (s->term) return scan_term(lexer, s, valid);
  if (!decoded(lexer->lookahead)) return false;
  Unit u = regex_unit(lexer, s);
  if (s->bracket && u.value == '-') s->hyphens = hyphens < 3 ? hyphens + 1 : 1;
  if (u.invalid_control || u.incomplete || !decoded(u.value)) return false;
  if (s->interval) return scan_interval_unit(lexer, s, valid, u);
  if (s->bracket) return scan_bracket_unit(lexer, s, valid, u, hyphens);
  return scan_regex_atom(lexer, s, valid, u, boundary_atom);
}
static inline bool raw_text(TSLexer *lexer, Scanner *s, bool leadin) {
  bool escaped = false;
  bool prefix = leadin;
  s->verbatim = false;
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
  if (line_end(lexer)) return false;
  if (!text_mode(s) && lexer->lookahead == s->delimiter) {
    enum TokenType token = s->mode == REPLACEMENT ? REPLACEMENT_END
      : s->mode == SOURCE                         ? TRANSLATION_MIDDLE
                                                  : TRANSLATION_END;
    end_operand(s, s->mode == REPLACEMENT ? FLAGS : NORMAL);
    return consume(lexer, valid, token);
  }
  if (!decoded(lexer->lookahead)) return false;
  if (text_mode(s) && s->raw_text) return scan_raw_text(lexer, s, valid);
  int32_t raw = lexer->lookahead;
  Unit u = unit(lexer, s);
  if (u.invalid_control || !decoded(u.value)) return false;
  if (u.incomplete) return text_mode(s) && emit(lexer, valid, ESCAPE);
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
  if (!decoded(lexer->lookahead)) return false;
  enum TokenType token = s->mode == LABEL_TEXT
    ? (valid[REQUIRED_LABEL] ? REQUIRED_LABEL : LABEL)
    : s->mode == VERSION_TEXT ? VERSION
    : comment                 ? COMMENT_TAIL
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
      if (regex_opening(lexer->lookahead)) return ZERO_LINE_NUMBER;
    } else if (lexer->lookahead == 'r') return ZERO_LINE_NUMBER;
  }
  return ERROR_SENTINEL;
}
static inline bool blanks_precede_token(TSLexer *lexer, const bool *valid) {
  int32_t c = lexer->lookahead;
  return ((valid[FILENAME] || valid[SHELL_START]) && !line_end(lexer)) ||
    ((valid[LABEL] || valid[REQUIRED_LABEL] || valid[VERSION]) &&
      !opaque_end(lexer, true)) ||
    ((valid[TEXT_START] || valid[INLINE_TEXT_START]) && !lexer->eof(lexer)) ||
    ((valid[NUMBER] || valid[ZERO_NUMBER] || valid[ZERO_LINE_NUMBER]) &&
      digit(c)) ||
    (valid[REGEX_START] && regex_opening(c)) ||
    (valid[SEPARATOR] && (c == ';' || c == '\n')) ||
    (valid[COMMENT] && c == '#') ||
    (valid[BLOCK_CLOSE] && c == '}') ||
    (valid[ADDRESS_MODIFIER] && (c == 'I' || c == 'M'));
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
  if (lexer->eof(lexer)) return false;
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
  if (line_end(lexer)) return false;
  if (start == REGEX_START && lexer->lookahead == '\\') {
    advance(lexer);
    if (line_end(lexer) || !decoded(lexer->lookahead)) return false;
  }
  if (unusable_delimiter(lexer->lookahead)) return false;
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
      return ERROR_SENTINEL;
  }
}
static inline bool scan_flag(TSLexer *lexer, Scanner *s, const bool *valid) {
  lexer->mark_end(lexer);
  skip_blanks(lexer);
  int32_t c = lexer->lookahead;
  if (!decoded(c)) return false;
  if (digit(c)) {
    if (!scan_digits(lexer)) return emit(lexer, valid, OCCURRENCE);
    return false;
  }
  if (c == '\r') {
    advance(lexer);
    if (lexer->lookahead != '\n') return false;
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
  if (
    valid[FILENAME] || valid[LABEL] || valid[REQUIRED_LABEL] || valid[VERSION]
  ) {
    if (lexer->lookahead == 0 && (valid[FILENAME] || valid[REQUIRED_LABEL]))
      return false;
    if (!opaque_end(
          lexer,
          valid[LABEL] || valid[REQUIRED_LABEL] || valid[VERSION]
        )) {
      s->mode = valid[FILENAME] ? FILE_NAME
        : valid[VERSION]        ? VERSION_TEXT
                                : LABEL_TEXT;
      return scan_opaque(lexer, s, valid);
    }
  }
  if (!decoded(lexer->lookahead)) return false;
  enum TokenType start = valid[PATTERN_START] ? PATTERN_START
    : valid[TRANSLATION_START]                ? TRANSLATION_START
                                              : REGEX_START;
  if (valid[start] && (start != REGEX_START || regex_opening(lexer->lookahead)))
    return scan_delimiter_start(lexer, s, valid, start);
  if (
    valid[ADDRESS_MODIFIER] &&
    (lexer->lookahead == 'I' || lexer->lookahead == 'M')
  )
    return consume(lexer, valid, ADDRESS_MODIFIER);
  if (
    (valid[NUMBER] || valid[ZERO_NUMBER] || valid[ZERO_LINE_NUMBER]) &&
    digit(lexer->lookahead)
  ) {
    bool zero = scan_digits(lexer);
    lexer->mark_end(lexer);
    return marked(
      lexer,
      valid,
      !zero                  ? NUMBER
        : valid[ZERO_NUMBER] ? ZERO_NUMBER
                             : zero_address(lexer, valid[ZERO_LINE_NUMBER])
    );
  }
  if (valid[COMMAND_END] && command_end(lexer))
    return marked(lexer, valid, COMMAND_END);
  if (valid[BLOCK_CLOSE] && lexer->lookahead == '}')
    return consume(lexer, valid, BLOCK_CLOSE);
  return false;
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
  buffer[4] = (char)s->host_bracket;
  buffer[5] = (char)s->host_term;
  buffer[6] = (char)s->delimiter;
  buffer[7] = (char)(s->interval |
    s->branch_start << 1 |
    s->atom << 2 |
    s->verbatim << 3 |
    s->boundary_atom << 4 |
    s->raw_text << 5);
  buffer[8] = (char)(s->host_escaped |
    s->host_term_closing << 1 |
    s->host_control << 2 |
    s->hyphens << 3);
  for (unsigned i = 0; i < 4; i++) buffer[9 + i] = (char)(s->groups >> (i * 8));
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
  uint8_t flags = (uint8_t)buffer[7];
  uint8_t host_flags = (uint8_t)buffer[8];
  s->mode = (uint8_t)buffer[0];
  s->bracket = (uint8_t)buffer[1];
  s->term = (uint8_t)buffer[2];
  s->term_stage = (uint8_t)buffer[3];
  s->host_bracket = (uint8_t)buffer[4];
  s->host_term = (uint8_t)buffer[5];
  s->delimiter = (uint8_t)buffer[6];
  s->interval = flags & 1;
  s->branch_start = flags & 2;
  s->atom = flags & 4;
  s->verbatim = flags & 8;
  s->boundary_atom = flags & 16;
  s->raw_text = flags & 32;
  s->host_escaped = host_flags & 1;
  s->host_term_closing = host_flags & 2;
  s->host_control = host_flags & 4;
  s->hyphens = (host_flags >> 3) & 3;
  for (unsigned i = 0; i < 4; i++)
    s->groups |= (uint32_t)(uint8_t)buffer[9 + i] << (i * 8);
}
#endif
