#!/usr/bin/env node

const { mkdtempSync, readFileSync, readdirSync, rmSync } = require("node:fs");
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

    for (const grammar of grammars) {
      checkPublicCst(grammar, generatedRoot);
    }
    return 0;
  } finally {
    rmSync(generatedRoot, { recursive: true, force: true });
  }
}

process.exitCode = main();
