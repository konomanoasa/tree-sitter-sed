function issueRuleName(id) {
  return `_${id}_issue`;
}

function outcomeRuleName(id) {
  return `_${id}_outcome`;
}

function reasonRuleName(id) {
  return `_${id}_reason`;
}

function defineIssueRules(definitions) {
  const rules = {};

  for (const definition of definitions) {
    const { outcome, reason, rule } = definition;
    const id = definition.id ?? reason;
    rules[reasonRuleName(id)] = rule;
    rules[outcomeRuleName(id)] = ($) => alias($[reasonRuleName(id)], $[reason]);
    rules[issueRuleName(id)] = ($) => alias($[outcomeRuleName(id)], $[outcome]);
  }

  return rules;
}

function namedExternal($, external, name) {
  return alias(external, $[name]);
}

function issueField($, id) {
  return field("issue", alias($[issueRuleName(id)], $.syntax_issue));
}

function issueNode($, id) {
  return alias($[issueRuleName(id)], $.syntax_issue);
}

module.exports = { defineIssueRules, issueField, issueNode, namedExternal };
