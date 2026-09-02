#include <assert.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include "../common/scanner.h"

typedef struct {
  TSLexer lexer;
  const char *source;
  size_t offset;
  size_t mark;
} MockLexer;

static MockLexer *mock_lexer(TSLexer *lexer) {
  return (MockLexer *)lexer;
}

static const MockLexer *const_mock_lexer(const TSLexer *lexer) {
  return (const MockLexer *)lexer;
}

static void mock_advance(TSLexer *lexer, bool skip) {
  (void)skip;
  MockLexer *mock = mock_lexer(lexer);
  if (mock->source[mock->offset] != '\0') {
    mock->offset++;
  }
  lexer->lookahead = (unsigned char)mock->source[mock->offset];
}

static void mock_mark_end(TSLexer *lexer) {
  MockLexer *mock = mock_lexer(lexer);
  mock->mark = mock->offset;
}

static bool mock_eof(const TSLexer *lexer) {
  const MockLexer *mock = const_mock_lexer(lexer);
  return mock->source[mock->offset] == '\0';
}

static MockLexer make_mock_lexer(const char *source) {
  return (MockLexer){
    .lexer =
      {
        .lookahead = (unsigned char)source[0],
        .advance = mock_advance,
        .mark_end = mock_mark_end,
        .eof = mock_eof,
      },
    .source = source,
  };
}

static ScannerState make_regex_state(void) {
  return (ScannerState){
    .delimiter = INT32_C(0x1f642),
    .mode = MODE_SUBSTITUTE_PATTERN,
    .regex_state = REGEX_OUTSIDE_BRACKET,
    .regex_at_branch_start = true,
#if SED_REGEX_EXTENDED
    .regex_after_alternation = true,
#else
    .regex_after_anchor = true,
#endif
    .regex_group_depth = UINT16_C(37),
  };
}

static void serialize_state(
  ScannerState *state,
  char buffer[TREE_SITTER_SERIALIZATION_BUFFER_SIZE]
) {
  const unsigned length = sed_scanner_serialize(state, buffer);
  assert(length == SCANNER_SERIALIZED_STATE_SIZE);
  assert(length <= TREE_SITTER_SERIALIZATION_BUFFER_SIZE);
}

static void assert_same_state(ScannerState *expected, ScannerState *actual) {
  char expected_buffer[TREE_SITTER_SERIALIZATION_BUFFER_SIZE] = {0};
  char actual_buffer[TREE_SITTER_SERIALIZATION_BUFFER_SIZE] = {0};
  serialize_state(expected, expected_buffer);
  serialize_state(actual, actual_buffer);
  assert(
    memcmp(expected_buffer, actual_buffer, SCANNER_SERIALIZED_STATE_SIZE) == 0
  );
}

static void assert_reset_state(ScannerState *state) {
  ScannerState reset = {0};
  assert_same_state(&reset, state);
}

static void check_lifecycle(void) {
  ScannerState *state = sed_scanner_create();
  assert(state != NULL);
  assert_reset_state(state);
  sed_scanner_destroy(state);
}

static void check_serialization_round_trip(void) {
  ScannerState source = make_regex_state();
  ScannerState destination = {0};
  destination.mode = MODE_TEXT;
  destination.text_state = TEXT_HAS_CONTENT;
  char buffer[TREE_SITTER_SERIALIZATION_BUFFER_SIZE] = {0};
  serialize_state(&source, buffer);

  sed_scanner_deserialize(&destination, buffer, SCANNER_SERIALIZED_STATE_SIZE);
  assert_same_state(&source, &destination);
}

static void check_invalid_serialization_resets_state(void) {
  ScannerState source = make_regex_state();
  ScannerState destination = make_regex_state();
  char buffer[TREE_SITTER_SERIALIZATION_BUFFER_SIZE] = {0};
  serialize_state(&source, buffer);

  sed_scanner_deserialize(
    &destination,
    buffer,
    SCANNER_SERIALIZED_STATE_SIZE - 1
  );
  assert_reset_state(&destination);

  destination = make_regex_state();
  buffer[0] = (char)(SCANNER_SERIALIZATION_VERSION + 1);
  sed_scanner_deserialize(&destination, buffer, SCANNER_SERIALIZED_STATE_SIZE);
  assert_reset_state(&destination);

  destination = make_regex_state();
  serialize_state(&source, buffer);
  buffer[2] = (char)REGEX_BRACKET_BODY;
  sed_scanner_deserialize(&destination, buffer, SCANNER_SERIALIZED_STATE_SIZE);
  assert_reset_state(&destination);
}

static void check_variant_serialization(void) {
  ScannerState source = make_regex_state();
  source.regex_after_anchor = false;
  source.regex_after_alternation = true;
  ScannerState destination = {0};
  char buffer[TREE_SITTER_SERIALIZATION_BUFFER_SIZE] = {0};
  serialize_state(&source, buffer);

  sed_scanner_deserialize(&destination, buffer, SCANNER_SERIALIZED_STATE_SIZE);
#if SED_REGEX_EXTENDED
  assert_same_state(&source, &destination);
#else
  assert_reset_state(&destination);
#endif
}

static void check_failed_scan_preserves_state(void) {
  ScannerState state = {
    .delimiter = '/',
    .mode = MODE_REGEX_ADDRESS,
    .regex_state = REGEX_OUTSIDE_BRACKET,
  };
  ScannerState expected = state;
#if SED_REGEX_EXTENDED
  MockLexer mock = make_mock_lexer("{");
#else
  MockLexer mock = make_mock_lexer("\\{");
#endif
  bool valid_symbols[ERROR_SENTINEL + 1] = {false};

  assert(!sed_scanner_scan(&state, &mock.lexer, valid_symbols));
  assert_same_state(&expected, &state);
}

static void check_bracket_term_delimiter_leaf_ranges(void) {
  static const struct {
    const char *opening_source;
    const char *closing_source;
    TSSymbol opening_symbol;
    TSSymbol closing_symbol;
    enum RegexBracketTermState term_state;
  } cases[] = {
    {"[:x",
      ":]x",
      REGEX_OPEN_COLON,
      REGEX_COLON_CLOSE,
      REGEX_BRACKET_TERM_COLON},
    {"[.x", ".]x", REGEX_OPEN_DOT, REGEX_DOT_CLOSE, REGEX_BRACKET_TERM_DOT},
    {"[=x",
      "=]x",
      REGEX_OPEN_EQUAL,
      REGEX_EQUAL_CLOSE,
      REGEX_BRACKET_TERM_EQUAL},
  };

  for (size_t index = 0; index < sizeof(cases) / sizeof(cases[0]); index++) {
    ScannerState state = make_regex_state();
    state.regex_state = REGEX_BRACKET_FIRST;
    set_regex_position(&state, false, REGEX_DUPLICATION_NONE, false, false);
    MockLexer opening = make_mock_lexer(cases[index].opening_source);
    bool opening_symbols[ERROR_SENTINEL + 1] = {false};
    opening_symbols[cases[index].opening_symbol] = true;
    TSSymbol symbol = ERROR_SENTINEL;

    assert(scan_regex_bracket_opener(
      &opening.lexer,
      &state,
      opening_symbols,
      &symbol
    ));
    assert(symbol == cases[index].opening_symbol);
    assert(opening.mark == 1);
    assert(opening.source[opening.mark] == cases[index].closing_source[0]);
    assert(state.regex_state == REGEX_BRACKET_BODY);
    assert(state.regex_bracket_term_state == cases[index].term_state);

    ScannerState deserialized = {0};
    char buffer[TREE_SITTER_SERIALIZATION_BUFFER_SIZE] = {0};
    serialize_state(&state, buffer);
    sed_scanner_deserialize(
      &deserialized,
      buffer,
      SCANNER_SERIALIZED_STATE_SIZE
    );
    assert_same_state(&state, &deserialized);

    MockLexer closing = make_mock_lexer(cases[index].closing_source);
    bool closing_symbols[ERROR_SENTINEL + 1] = {false};
    closing_symbols[cases[index].closing_symbol] = true;
    symbol = ERROR_SENTINEL;

    assert(scan_regex_bracket_term_close(
      &closing.lexer,
      &state,
      cases[index].closing_source[0],
      cases[index].closing_symbol,
      closing_symbols,
      &symbol
    ));
    assert(symbol == cases[index].closing_symbol);
    assert(closing.mark == 1);
    assert(closing.source[closing.mark] == ']');
    assert(state.regex_bracket_term_state == REGEX_BRACKET_TERM_NONE);
    assert(state.regex_bracket_pending_element == REGEX_BRACKET_PENDING_OTHER);

    ScannerState incomplete_state = make_regex_state();
    set_regex_position(
      &incomplete_state,
      false,
      REGEX_DUPLICATION_NONE,
      false,
      false
    );
    incomplete_state.regex_state = REGEX_BRACKET_BODY;
    incomplete_state.regex_bracket_term_state = cases[index].term_state;
    ScannerState expected = incomplete_state;
    char incomplete_source[] = {cases[index].closing_source[0], 'x', '\0'};
    MockLexer incomplete = make_mock_lexer(incomplete_source);
    symbol = ERROR_SENTINEL;

    assert(!scan_regex_bracket_term_close(
      &incomplete.lexer,
      &incomplete_state,
      incomplete_source[0],
      cases[index].closing_symbol,
      closing_symbols,
      &symbol
    ));
    assert_same_state(&expected, &incomplete_state);
  }

  ScannerState state = make_regex_state();
  state.regex_state = REGEX_BRACKET_FIRST;
  set_regex_position(&state, false, REGEX_DUPLICATION_NONE, false, false);
  MockLexer opening = make_mock_lexer("[x");
  bool valid_symbols[ERROR_SENTINEL + 1] = {false};
  valid_symbols[REGEX_BRACKET_LITERAL] = true;
  TSSymbol symbol = ERROR_SENTINEL;

  assert(
    scan_regex_bracket_opener(&opening.lexer, &state, valid_symbols, &symbol)
  );
  assert(symbol == REGEX_BRACKET_LITERAL);
  assert(opening.mark == 1);
  assert(opening.source[opening.mark] == 'x');
  assert(state.regex_state == REGEX_BRACKET_BODY);
  assert(state.regex_bracket_term_state == REGEX_BRACKET_TERM_NONE);
}

int main(void) {
  check_lifecycle();
  check_serialization_round_trip();
  check_invalid_serialization_resets_state();
  check_variant_serialization();
  check_failed_scan_preserves_state();
  check_bracket_term_delimiter_leaf_ranges();
  return 0;
}
