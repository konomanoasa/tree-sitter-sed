const outcomes = [
  "undefined_syntax",
  "unspecified_syntax",
  "implementation_defined_syntax",
  "implementation_option_syntax",
  "nonconforming_syntax",
  "incomplete_syntax",
];

function issueRuleName(reason) {
  return `_${reason}_issue`;
}

function outcomeRuleName(reason) {
  return `_${reason}_outcome`;
}

function defineIssueRules(definitions) {
  const activeOutcomes = outcomes.filter((outcome) =>
    definitions.some((definition) => definition.outcome === outcome),
  );
  const rules = {
    syntax_issue: ($) => choice(...activeOutcomes.map((outcome) => $[outcome])),
  };

  for (const outcome of activeOutcomes) {
    rules[outcome] = ($) => {
      const reasons = definitions
        .filter((definition) => definition.outcome === outcome)
        .map(({ reason }) => $[reason]);
      return reasons.length === 1 ? reasons[0] : choice(...reasons);
    };
  }

  for (const { outcome, reason, rule } of definitions) {
    rules[reason] = rule;
    rules[outcomeRuleName(reason)] = ($) => seq($[reason]);
    rules[issueRuleName(reason)] = ($) =>
      seq(alias($[outcomeRuleName(reason)], $[outcome]));
  }

  return rules;
}

module.exports = { defineIssueRules };
