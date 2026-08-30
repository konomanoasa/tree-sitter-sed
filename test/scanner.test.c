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

int main(void) {
  check_lifecycle();
  check_serialization_round_trip();
  check_invalid_serialization_resets_state();
  check_variant_serialization();
  check_failed_scan_preserves_state();
  return 0;
}
