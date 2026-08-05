#!/usr/bin/env node

const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { lstatSync, readFileSync, readlinkSync } = require("node:fs");
const { join } = require("node:path");
const { generateParsers } = require("./generate-parsers");

const root = join(__dirname, "..");

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
