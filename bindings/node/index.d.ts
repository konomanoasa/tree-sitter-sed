import type { Language } from "tree-sitter";

type SedLanguage = Language & {
  HIGHLIGHTS_QUERY: string;
};

export declare const sed: SedLanguage;
export declare const sed_ere: SedLanguage;
