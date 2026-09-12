import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before } from "node:test";
import { createTreeSitter } from "../../scripts/tree-sitter.js";

let temporaryDirectory;

let treeSitter;

let fixtureNumber = 0;

before(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "tree-sitter-sed-parser-"));
  try {
    treeSitter = createTreeSitter();
  } catch (error) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
});

after(() => {
  try {
    treeSitter?.close();
  } finally {
    if (temporaryDirectory !== undefined) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
});

function applyEdits(source, edits) {
  let bytes = Buffer.from(source);
  for (const edit of edits) {
    const { byte, deleteBytes, insert } = edit;
    const description = JSON.stringify(edit);
    assert.ok(
      Number.isSafeInteger(byte) && byte >= 0,
      `invalid byte offset: ${description}`,
    );
    assert.ok(
      Number.isSafeInteger(deleteBytes) && deleteBytes >= 0,
      `invalid deletion length: ${description}`,
    );
    assert.equal(typeof insert, "string", `invalid insertion: ${description}`);
    assert.ok(
      byte <= bytes.length && deleteBytes <= bytes.length - byte,
      `edit exceeds ${bytes.length} source bytes: ${description}`,
    );
    bytes = Buffer.concat([
      bytes.subarray(0, byte),
      Buffer.from(insert),
      bytes.subarray(byte + deleteBytes),
    ]);
  }
  return bytes;
}

function formatEdit({ byte, deleteBytes, insert }) {
  return `${byte} ${deleteBytes} ${insert}`;
}

function sourceEndPoint(source) {
  const bytes = Buffer.from(source);
  let row = 0;
  for (const byte of bytes) if (byte === 10) row += 1;
  return `${row}:${bytes.length - bytes.lastIndexOf(10) - 1}`;
}

function parse(scope, source, edits = []) {
  const sourcePath = join(temporaryDirectory, `fixture-${fixtureNumber}.sed`);
  fixtureNumber += 1;
  writeFileSync(sourcePath, source);
  const result = treeSitter.run(
    [
      "parse",
      "--scope",
      scope,
      "--cst",
      sourcePath,
      ...(edits.length === 0 ? [] : ["--edits", ...edits.map(formatEdit)]),
    ],
    {
      encoding: "utf8",
      env: { NO_COLOR: "1" },
      maxBuffer: 16 * 1024 * 1024,
      timeout: 60_000,
    },
  );
  if (result.error) {
    throw result.error;
  }
  assert.ok(
    result.status === 0 || result.status === 1,
    result.stdout + result.stderr,
  );
  result.nodes = readCst(result.stdout, applyEdits(source, edits));
  assert.equal(result.nodes[0]?.kind, "script", result.stdout);
  assert.equal(
    result.nodes[0].end.join(":"),
    sourceEndPoint(applyEdits(source, edits)),
    "root must reach the edited source end",
  );
  return result;
}

function parseSuccessfully(scope, source, edits = []) {
  const result = parse(scope, source, edits);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(result.stdout, /^[0-9: \t-]+•/m, result.stdout);
  return result;
}

function readCst(tree, source) {
  const bytes = Buffer.from(source);
  const lineStarts = [0];
  for (let index = 0; index < bytes.length; index++) {
    if (bytes[index] === 10) lineStarts.push(index + 1);
  }
  const nodes = [];
  const ancestors = [];
  for (const line of tree.split("\n")) {
    const row = /^([0-9]+):([0-9]+) +- +([0-9]+):([0-9]+)( +)(.*)$/.exec(line);
    if (row === null) continue;
    const match =
      /^(([a-z_][a-z_0-9]*): )?([a-z_][a-z_0-9]*|ERROR|MISSING|"[^"]+")/.exec(
        row[6],
      );
    if (match === null) continue;
    const indentation = line.length - row[6].length;
    while (ancestors.length && ancestors.at(-1).indentation >= indentation) {
      ancestors.pop();
    }
    const [, , field, kind] = match;
    const start = [Number(row[1]), Number(row[2])];
    const end = [Number(row[3]), Number(row[4])];
    const index = nodes.length;
    nodes.push({
      parent: ancestors.at(-1)?.index ?? null,
      kind,
      field: field ?? null,
      start,
      end,
      startByte: lineStarts[start[0]] + start[1],
      endByte: lineStarts[end[0]] + end[1],
    });
    ancestors.push({ indentation, index });
  }
  return nodes;
}

function nodeRange(node) {
  return `[${node.start.join(", ")}] - [${node.end.join(", ")}]`;
}

function subtree(nodes, index) {
  let end = index + 1;
  while (
    end < nodes.length &&
    nodes[end].parent !== null &&
    nodes[end].parent >= index
  )
    end++;
  return nodes.slice(index, end);
}

function directDelimiterLeafLines(nodes, ownerType) {
  const owner = nodes.findIndex(({ kind }) => kind === ownerType);
  assert.notEqual(owner, -1, `missing ${ownerType}`);
  return nodes
    .filter(({ parent, kind }) => parent === owner && kind.startsWith('"'))
    .map(
      ({ start, end, kind }) => `${start.join(":")} - ${end.join(":")} ${kind}`,
    );
}

function issueSignatures(nodes, root = 0) {
  return subtree(nodes, root).flatMap((issue, offset) => {
    if (issue.kind !== "syntax_issue") return [];
    const index = root + offset;
    const outcome = nodes[index + 1];
    const reason = nodes[index + 2];
    assert.ok(outcome !== undefined, "missing issue outcome");
    assert.ok(reason !== undefined, "missing issue reason");
    assert.equal(outcome.parent, index, "issue must directly own its outcome");
    assert.equal(
      reason.parent,
      index + 1,
      "outcome must directly own its reason",
    );
    const range = nodeRange(issue);
    assert.equal(
      nodeRange(outcome),
      range,
      "outcome range must match its issue",
    );
    assert.equal(nodeRange(reason), range, "reason range must match its issue");
    return [{ outcome: outcome.kind, reason: reason.kind, range }];
  });
}

function issuePaths(nodes) {
  return issueSignatures(nodes).map(
    ({ outcome, reason }) => `${outcome}/${reason}`,
  );
}

function syntaxSignatures(
  nodes,
  types = nodes.map(({ kind }) => kind),
  root = 0,
) {
  const selected = new Set(types);
  const depths = [];
  return subtree(nodes, root).flatMap((node, index) => {
    const depth = index === 0 ? 0 : depths[node.parent - root];
    const included = selected.has(node.kind);
    depths[index] = depth + Number(included);
    if (!included) return [];
    const field = node.field === null ? "" : `${node.field}: `;
    return [`${"  ".repeat(depth)}${field}${node.kind} ${nodeRange(node)}`];
  });
}

function assertNoNodes(nodes, ...types) {
  assert.deepEqual(
    nodes.filter(({ kind }) => types.includes(kind)),
    [],
    `unexpected ${types.join(", ")} node`,
  );
}

function publicNodes(nodes) {
  const visible = [];
  const parents = [];
  const missing = [];
  for (const [index, node] of nodes.entries()) {
    const parent = node.parent === null ? null : parents[node.parent];
    parents[index] = parent;
    missing[index] = node.kind === "MISSING" || missing[node.parent] === true;
    if (missing[index] || node.kind === "ERROR") continue;
    if (
      node.kind.startsWith('"') &&
      !["character_class", "collating_symbol", "equivalence_class"].includes(
        visible[parent]?.kind,
      )
    )
      continue;
    parents[index] = visible.length;
    visible.push({
      ...node,
      parent,
      field: nodes[node.parent]?.kind === "ERROR" ? null : node.field,
    });
  }
  return visible;
}

function topLevelEditingCommands(nodes) {
  const publicTree = publicNodes(nodes);
  const list = publicTree.findIndex(({ kind }) => kind === "command_list");
  assert.notEqual(list, -1, "missing command_list");
  return publicTree.flatMap((command, index) => {
    if (command.parent !== list || command.kind !== "editing_command")
      return [];
    const relativePoint = ([row, column]) => [
      row - command.start[0],
      row === command.start[0] ? column - command.start[1] : column,
    ];
    const nodes = subtree(publicTree, index).map((node, offset) => ({
      kind: node.kind,
      parent: offset === 0 ? null : node.parent - index,
      field: offset === 0 ? null : node.field,
      start: relativePoint(node.start),
      end: relativePoint(node.end),
      startByte: node.startByte - command.startByte,
      endByte: node.endByte - command.startByte,
    }));
    return [{ start: command.start, nodes }];
  });
}

function assertIncrementalContract(fresh, incremental, context) {
  const freshIssues = issueSignatures(fresh.nodes);
  assert.deepEqual(
    issueSignatures(incremental.nodes),
    freshIssues,
    `${context}: fresh and incremental issue signatures differ`,
  );
  assert.deepEqual(
    publicNodes(incremental.nodes),
    publicNodes(fresh.nodes),
    `${context}: fresh and incremental public CSTs differ`,
  );
  if (fresh.status === 0 && freshIssues.length === 0) {
    assert.equal(incremental.status, 0, `${context}: normal source has errors`);
    assert.deepEqual(
      incremental.nodes,
      fresh.nodes,
      `${context}: fresh and incremental CSTs differ`,
    );
  }
}

function parseSummary(scope, source, timeout = 10_000_000) {
  const sourcePath = join(temporaryDirectory, `summary-${fixtureNumber++}.sed`);
  writeFileSync(sourcePath, source);
  const result = treeSitter.run(
    [
      "parse",
      "--scope",
      scope,
      "--quiet",
      "--json-summary",
      "--timeout",
      String(timeout),
      sourcePath,
    ],
    { encoding: "utf8", timeout: 60_000 },
  );
  assert.ifError(result.error);
  assert.ok(
    result.status === 0 || result.status === 1,
    result.stdout + result.stderr,
  );
  const start = result.stdout.indexOf("{\n");
  assert.notEqual(start, -1, "parser produced no summary");
  const { parse_summaries: summaries } = JSON.parse(result.stdout.slice(start));
  assert.equal(summaries?.length, 1, "parser produced no complete root");
  const summary = summaries[0];
  assert.equal(
    `${summary.end.row}:${summary.end.column}`,
    sourceEndPoint(source),
    "root must reach the source end",
  );
  assert.equal(
    summary.bytes,
    Buffer.byteLength(source),
    "parser omitted source bytes",
  );
  return summary;
}

function hasRecovery(cst) {
  return /^[0-9: \t-]+•/m.test(cst);
}

export {
  applyEdits,
  assertIncrementalContract,
  assertNoNodes,
  directDelimiterLeafLines,
  hasRecovery,
  issuePaths,
  issueSignatures,
  nodeRange,
  parse,
  parseSuccessfully,
  parseSummary,
  publicNodes,
  subtree,
  syntaxSignatures,
  topLevelEditingCommands,
};
