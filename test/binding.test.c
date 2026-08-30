#include <stddef.h>
#include <tree_sitter/tree-sitter-sed.h>

int main(void) {
  const TSLanguage *sed = tree_sitter_sed();
  const TSLanguage *sed_ere = tree_sitter_sed_ere();

  return sed == NULL || sed_ere == NULL || sed == sed_ere;
}
