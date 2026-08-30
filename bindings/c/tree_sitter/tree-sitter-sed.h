#ifndef TREE_SITTER_SED_H_
#define TREE_SITTER_SED_H_

typedef struct TSLanguage TSLanguage;

#ifdef __cplusplus
extern "C" {
#endif

const TSLanguage *tree_sitter_sed(void);
const TSLanguage *tree_sitter_sed_ere(void);

#ifdef __cplusplus
}
#endif

#endif
