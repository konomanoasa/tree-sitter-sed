#!/usr/bin/env node

const {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, relative } = require("node:path");
const { generateParsers, grammars, root } = require("./tree-sitter");

const issueOutcomeNames = new Set([
  "undefined_syntax",
  "unspecified_syntax",
  "implementation_defined_syntax",
  "implementation_option_syntax",
  "nonconforming_syntax",
  "incomplete_syntax",
]);
const generatedPaths = [
  "grammar.json",
  "node-types.json",
  "parser.c",
  join("tree_sitter", "alloc.h"),
  join("tree_sitter", "array.h"),
  join("tree_sitter", "parser.h"),
].sort((left, right) => left.localeCompare(right));
const parserBudgets = {
  sed: {
    STATE_COUNT: 2_000,
    LARGE_STATE_COUNT: 50,
    SYMBOL_COUNT: 650,
    EXTERNAL_TOKEN_COUNT: 140,
    parser_bytes: 2_100_000,
    maximum_ACTIONS_index: 3_300,
    parse_table_storage_bytes: 160_000,
  },
  sed_ere: {
    STATE_COUNT: 2_000,
    LARGE_STATE_COUNT: 50,
    SYMBOL_COUNT: 625,
    EXTERNAL_TOKEN_COUNT: 134,
    parser_bytes: 2_000_000,
    maximum_ACTIONS_index: 3_250,
    parse_table_storage_bytes: 150_000,
  },
};

function files(directory, prefix = "") {
  const paths = [];
  for (const entry of readdirSync(join(directory, prefix), {
    withFileTypes: true,
  })) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) {
      paths.push(...files(directory, path));
    } else if (entry.isFile()) {
      paths.push(path);
    }
  }
  return paths.sort((left, right) => left.localeCompare(right));
}

function different(left, right) {
  try {
    return !readFileSync(left).equals(readFileSync(right));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return true;
    }
    throw error;
  }
}

function readDefine(parser, name, path) {
  const match = parser.match(new RegExp(`^#define ${name} ([0-9]+)$`, "m"));
  if (match === null) {
    throw new Error(`${path} does not define ${name} as an integer`);
  }
  return Number(match[1]);
}

function maximumActionIndex(parser, path) {
  let maximum;
  for (const match of parser.matchAll(/ACTIONS\(([0-9]+)\)/g)) {
    const value = Number(match[1]);
    maximum = maximum === undefined ? value : Math.max(maximum, value);
  }
  if (maximum === undefined) {
    throw new Error(`${path} contains no ACTIONS index`);
  }
  return maximum;
}

function smallParseTableWordCount(parser, path) {
  const declaration = "static const uint16_t ts_small_parse_table[] = {\n";
  const start = parser.indexOf(declaration);
  if (start === -1) {
    throw new Error(`${path} contains no small parse table`);
  }
  const initializerStart = start + declaration.length;
  const initializerEnd = parser.indexOf("\n};", initializerStart);
  if (initializerEnd === -1) {
    throw new Error(`${path} contains an unterminated small parse table`);
  }
  const initializer = parser.slice(initializerStart, initializerEnd);

  let finalIndex;
  let finalOffset;
  for (const match of initializer.matchAll(/^ {2}\[([0-9]+)\] =/gm)) {
    finalIndex = Number(match[1]);
    finalOffset = match.index;
  }
  if (finalIndex === undefined || finalOffset === undefined) {
    throw new Error(`${path} small parse table has no indexed row`);
  }

  const finalRow = initializer.slice(finalOffset);
  const finalRowWordCount = finalRow.match(/,/g)?.length ?? 0;
  if (finalRowWordCount === 0) {
    throw new Error(`${path} small parse table has an empty final row`);
  }
  return finalIndex + finalRowWordCount;
}

function parseTableStorageBytes(parser, actual, path) {
  const smallStateCount = actual.STATE_COUNT - actual.LARGE_STATE_COUNT;
  if (smallStateCount < 0) {
    throw new Error(`${path} has more large states than total states`);
  }
  return (
    actual.LARGE_STATE_COUNT * actual.SYMBOL_COUNT * 2 +
    smallParseTableWordCount(parser, path) * 2 +
    smallStateCount * 4
  );
}

function checkParserBudget(grammar, generatedRoot) {
  const budget = parserBudgets[grammar.name];
  if (budget === undefined) {
    throw new Error(`Missing parser budget for ${grammar.name}`);
  }

  const parserPath = join(generatedRoot, grammar.path, "src", "parser.c");
  const displayPath = relative(generatedRoot, parserPath);
  const parser = readFileSync(parserPath, "utf8");
  const actual = {
    LANGUAGE_VERSION: readDefine(parser, "LANGUAGE_VERSION", displayPath),
    STATE_COUNT: readDefine(parser, "STATE_COUNT", displayPath),
    LARGE_STATE_COUNT: readDefine(parser, "LARGE_STATE_COUNT", displayPath),
    SYMBOL_COUNT: readDefine(parser, "SYMBOL_COUNT", displayPath),
    EXTERNAL_TOKEN_COUNT: readDefine(
      parser,
      "EXTERNAL_TOKEN_COUNT",
      displayPath,
    ),
    parser_bytes: statSync(parserPath).size,
    maximum_ACTIONS_index: maximumActionIndex(parser, displayPath),
  };
  actual.parse_table_storage_bytes = parseTableStorageBytes(
    parser,
    actual,
    displayPath,
  );

  console.log(`${grammar.name}:`);
  console.log("Metric                     Actual      Maximum");
  let failed = false;
  for (const [name, maximum] of Object.entries(budget)) {
    console.log(
      `${name.padEnd(22)} ${String(actual[name]).padStart(12)} ${String(maximum).padStart(12)}`,
    );
    if (actual[name] > maximum) {
      console.error(
        `${displayPath}: ${name} exceeds its parser budget: ${actual[name]} > ${maximum}`,
      );
      failed = true;
    }
  }
  return {
    failed,
    languageVersion: actual.LANGUAGE_VERSION,
  };
}

function namedNode(nodeTypes, type, path) {
  const matches = nodeTypes.filter((node) => node.named && node.type === type);
  if (matches.length !== 1) {
    throw new Error(`${path}: expected one named ${type} node`);
  }
  return matches[0];
}

function requiredSingleChildren(node, path) {
  const { children } = node;
  if (!children?.required || children.multiple) {
    throw new Error(`${path}: expected one required child`);
  }
  if (
    children.types.length === 0 ||
    children.types.some((type) => !type.named)
  ) {
    throw new Error(`${path}: expected named child types`);
  }
  return children.types;
}

function requiredIssueField(node, path) {
  const issue = node.fields?.issue;
  if (
    !issue?.required ||
    issue.multiple ||
    issue.types.length !== 1 ||
    issue.types[0].type !== "syntax_issue" ||
    !issue.types[0].named
  ) {
    throw new Error(`${path}: expected one required syntax_issue field`);
  }
}

function checkPublicCst(grammar, generatedRoot) {
  const path = join(generatedRoot, grammar.path, "src", "node-types.json");
  const displayPath = relative(generatedRoot, path);
  const nodeTypes = JSON.parse(readFileSync(path, "utf8"));
  const syntaxIssue = namedNode(nodeTypes, "syntax_issue", displayPath);
  const outcomeTypes = requiredSingleChildren(
    syntaxIssue,
    `${displayPath}:syntax_issue`,
  );
  const actualOutcomes = new Set(outcomeTypes.map(({ type }) => type));

  for (const { type } of outcomeTypes) {
    if (!issueOutcomeNames.has(type)) {
      throw new Error(
        `${displayPath}: unexpected syntax_issue outcome ${type}`,
      );
    }
    const outcome = namedNode(nodeTypes, type, displayPath);
    requiredSingleChildren(outcome, `${displayPath}:${type}`);
  }

  for (const outcome of issueOutcomeNames) {
    const present = nodeTypes.some(
      (node) => node.named && node.type === outcome,
    );
    if (present !== actualOutcomes.has(outcome)) {
      throw new Error(`${displayPath}: ${outcome} bypasses syntax_issue`);
    }
  }

  const neutralNodes = [
    "ambiguous_delimiter_escape",
    "ambiguous_replacement_delimiter_escape",
  ];
  if (grammar.name === "sed") {
    neutralNodes.push("bre_extension_escape", "bre_subexpression_anchor");
  }
  for (const type of neutralNodes) {
    requiredIssueField(
      namedNode(nodeTypes, type, displayPath),
      `${displayPath}:${type}`,
    );
  }
}

function main() {
  const generatedRoot = mkdtempSync(
    join(tmpdir(), "tree-sitter-sed-generated-"),
  );
  try {
    const status = generateParsers(generatedRoot);
    if (status !== 0) {
      return status;
    }

    const stale = [];
    for (const grammar of grammars) {
      const generatedDirectory = join(generatedRoot, grammar.path, "src");
      const actualPaths = files(generatedDirectory);
      if (JSON.stringify(actualPaths) !== JSON.stringify(generatedPaths)) {
        throw new Error(
          grammar.path +
            ": expected generated files " +
            JSON.stringify(generatedPaths) +
            ", received " +
            JSON.stringify(actualPaths),
        );
      }
      for (const path of generatedPaths) {
        const generatedPath = join(generatedDirectory, path);
        const repositoryPath = join(root, grammar.path, "src", path);
        if (different(generatedPath, repositoryPath)) {
          stale.push(relative(root, repositoryPath));
        }
      }
    }
    if (stale.length > 0) {
      console.error("Generated parser files are stale or missing:");
      for (const path of stale) {
        console.error(`  ${path}`);
      }
      console.error("Run npm run generate, review, and commit the results.");
      return 1;
    }

    let failed = false;
    const languageVersions = new Map();
    for (const grammar of grammars) {
      checkPublicCst(grammar, generatedRoot);
      const result = checkParserBudget(grammar, generatedRoot);
      failed = result.failed || failed;
      languageVersions.set(grammar.name, result.languageVersion);
    }
    if (new Set(languageVersions.values()).size !== 1) {
      console.error(
        "Generated parsers use different Tree-sitter ABI versions:",
      );
      for (const [name, version] of languageVersions) {
        console.error(`  ${name}: ${version}`);
      }
      failed = true;
    }
    return failed ? 1 : 0;
  } finally {
    rmSync(generatedRoot, { recursive: true, force: true });
  }
}

process.exitCode = main();
