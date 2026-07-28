function commandName($, spelling) {
  return field("name", alias(spelling, $.command_name));
}

function commandArgument(rule) {
  return field("argument", rule);
}

function addressOperator($, spelling) {
  return field("operator", alias(spelling, $.address_operator));
}

module.exports = {
  addressOperator,
  commandArgument,
  commandName,
};
