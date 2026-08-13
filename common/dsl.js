function issueRuleName(id) {
  return `_${id}_issue`;
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

module.exports = { issueField, issueNode, issueRuleName, namedExternal };
