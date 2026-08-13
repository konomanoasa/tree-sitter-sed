#!/usr/bin/env node

const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { lstatSync, readFileSync, readlinkSync } = require("node:fs");
const { join } = require("node:path");
const { generateParsers } = require("./generate-parsers");
const { languages } = require("./variants");

const root = join(__dirname, "..");
const issueOutcomeNames = new Set([
  "undefined_syntax",
  "unspecified_syntax",
  "implementation_defined_syntax",
  "implementation_option_syntax",
  "nonconforming_syntax",
  "incomplete_syntax",
]);

function repositoryPaths() {
  const result = spawnSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      result.stderr.trim() || `git ls-files exited with ${result.status}`,
    );
  }
  return result.stdout.split("\0").filter(Boolean);
}

function fileFingerprint(path) {
  try {
    const fullPath = join(root, path);
    const stat = lstatSync(fullPath);
    if (stat.isSymbolicLink()) {
      return `link:${stat.mode}:${readlinkSync(fullPath)}`;
    }
    if (stat.isFile()) {
      const hash = createHash("sha256")
        .update(readFileSync(fullPath))
        .digest("hex");
      return `file:${stat.mode}:${stat.size}:${hash}`;
    }
    return `other:${stat.mode}`;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return "missing";
    }
    throw error;
  }
}

function snapshot() {
  return new Map(
    repositoryPaths().map((path) => [path, fileFingerprint(path)]),
  );
}

function changedPaths(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths]
    .filter((path) => before.get(path) !== after.get(path))
    .sort((left, right) => left.localeCompare(right));
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

function checkPublicCst(directory) {
  const path = join(directory, "src", "node-types.json");
  const nodeTypes = JSON.parse(readFileSync(join(root, path), "utf8"));
  const syntaxIssue = namedNode(nodeTypes, "syntax_issue", path);
  const outcomeTypes = requiredSingleChildren(
    syntaxIssue,
    `${path}:syntax_issue`,
  );
  const actualOutcomes = new Set(outcomeTypes.map(({ type }) => type));

  for (const { type } of outcomeTypes) {
    if (!issueOutcomeNames.has(type)) {
      throw new Error(`${path}: unexpected syntax_issue outcome ${type}`);
    }
    const outcome = namedNode(nodeTypes, type, path);
    requiredSingleChildren(outcome, `${path}:${type}`);
  }

  for (const outcome of issueOutcomeNames) {
    const present = nodeTypes.some(
      (node) => node.named && node.type === outcome,
    );
    if (present !== actualOutcomes.has(outcome)) {
      throw new Error(`${path}: ${outcome} bypasses syntax_issue`);
    }
  }

  const neutralNodes = [
    "ambiguous_delimiter_escape",
    "ambiguous_replacement_delimiter_escape",
  ];
  if (directory === "posix-sed-bre") {
    neutralNodes.push("bre_extension_escape", "bre_subexpression_anchor");
  }
  for (const type of neutralNodes) {
    requiredIssueField(namedNode(nodeTypes, type, path), `${path}:${type}`);
  }
}

const before = snapshot();
const status = generateParsers();
if (status !== 0) {
  process.exit(status);
}

const changed = changedPaths(before, snapshot());
if (changed.length > 0) {
  console.error("Generated parser files were stale or newly untracked:");
  for (const path of changed) {
    console.error(`  ${path}`);
  }
  console.error(
    "Review and commit the regenerated files, then run the check again.",
  );
  process.exit(1);
}

for (const { directory } of languages) {
  checkPublicCst(directory);
}
