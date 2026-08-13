const languages = Object.freeze(
  ["bre", "ere"].map((mode) =>
    Object.freeze({
      directory: `posix-sed-${mode}`,
      languageName: `posix_sed_${mode}`,
      scope: `source.sed.posix.${mode}`,
    }),
  ),
);

module.exports = { languages };
