#!/usr/bin/env node

const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { parseFixture } = require("./parse-fixture");

const temporaryDirectory = mkdtempSync(
  join(tmpdir(), "tree-sitter-posix-sed-boundary-"),
);

const cases = [
  {
    name: "missing function at source end",
    scope: "source.sed.posix.bre",
    source: "1",
    issues: ["incomplete_syntax/missing_function"],
    nodes: ["line_number_address"],
  },
  {
    name: "missing function at source end in ERE mode",
    scope: "source.sed.posix.ere",
    source: "1",
    issues: ["incomplete_syntax/missing_function"],
    nodes: ["line_number_address"],
  },
  {
    name: "missing label at source end",
    scope: "source.sed.posix.bre",
    source: ":",
    issues: ["incomplete_syntax/missing_label"],
    nodes: ["label_function"],
  },
  {
    name: "missing read file at source end",
    scope: "source.sed.posix.bre",
    source: "r",
    issues: ["incomplete_syntax/missing_rfile"],
    nodes: ["read_function"],
  },
  {
    name: "missing write file at source end",
    scope: "source.sed.posix.bre",
    source: "w",
    issues: ["incomplete_syntax/missing_wfile"],
    nodes: ["write_function"],
  },
  {
    name: "missing text introducer at source end",
    scope: "source.sed.posix.bre",
    source: "a",
    issues: ["incomplete_syntax/missing_text_introducer"],
    nodes: ["append_function"],
  },
  {
    name: "complete text at source end",
    scope: "source.sed.posix.bre",
    source: "a\\\nfoo",
    issues: [],
    nodes: ["append_function", "text_introducer", "text"],
  },
  {
    name: "empty text at source end",
    scope: "source.sed.posix.bre",
    source: "a\\\n",
    issues: ["incomplete_syntax/missing_text"],
    nodes: ["append_function", "text_introducer"],
  },
  {
    name: "missing opening delimiter at source end",
    scope: "source.sed.posix.bre",
    source: "s",
    issues: ["incomplete_syntax/missing_opening_delimiter"],
    nodes: ["substitute_function"],
  },
  {
    name: "missing block separator and closing brace at source end",
    scope: "source.sed.posix.bre",
    source: "{p",
    issues: [
      "incomplete_syntax/missing_command_separator",
      "incomplete_syntax/missing_closing_brace",
    ],
    nodes: ["block_function", "print_function"],
  },
  {
    name: "block leading empty command with missing separator at source end",
    scope: "source.sed.posix.bre",
    source: "{;p",
    issues: [
      "incomplete_syntax/missing_command_separator",
      "incomplete_syntax/missing_closing_brace",
    ],
    nodes: ["block_function", "empty_command", "print_function"],
  },
  {
    name: "blank-separated block end at source end",
    scope: "source.sed.posix.bre",
    source: "{ ",
    issues: [
      "incomplete_syntax/missing_command_separator",
      "incomplete_syntax/missing_closing_brace",
    ],
    nodes: ["block_function"],
  },
  {
    name: "unclosed BRE bracket expression at source end",
    scope: "source.sed.posix.bre",
    source: "/[a",
    issues: [
      "incomplete_syntax/unclosed_bracket_expression",
      "incomplete_syntax/incomplete_regular_expression",
      "incomplete_syntax/missing_function",
    ],
    nodes: ["bracket_expression"],
  },
  {
    name: "unclosed BRE bracket expression at a physical line boundary",
    scope: "source.sed.posix.bre",
    source: "/[a\np\n",
    issues: [
      "undefined_syntax/unclosed_bracket_expression",
      "nonconforming_syntax/unterminated_regular_expression",
      "nonconforming_syntax/missing_function",
    ],
    nodes: ["bracket_expression", "print_function"],
  },
  {
    name: "unfinished ERE alternative and group at source end",
    scope: "source.sed.posix.ere",
    source: "/(a|",
    issues: [
      "incomplete_syntax/incomplete_alternative",
      "incomplete_syntax/unclosed_subexpression",
      "incomplete_syntax/incomplete_regular_expression",
      "incomplete_syntax/missing_function",
    ],
    nodes: ["ere_alternation_operator", "open_parenthesis"],
  },
  {
    name: "unfinished ERE interval at source end",
    scope: "source.sed.posix.ere",
    source: "/a{1",
    issues: [
      "incomplete_syntax/incomplete_interval",
      "incomplete_syntax/incomplete_regular_expression",
      "incomplete_syntax/missing_function",
    ],
    nodes: ["ere_dupl_symbol", "open_brace"],
  },
  {
    name: "unfinished BRE escape at source end",
    scope: "source.sed.posix.bre",
    source: "/a\\",
    issues: [
      "incomplete_syntax/incomplete_regular_expression_escape",
      "incomplete_syntax/incomplete_regular_expression",
      "incomplete_syntax/missing_function",
    ],
    nodes: ["quoted_character"],
  },
  {
    name: "BRE extension escape remains neutral after duplication",
    scope: "source.sed.posix.bre",
    source: "/a*\\+/p\n",
    issues: ["implementation_defined_syntax/bre_plus_escape"],
    nodes: ["zero_or_more_operator", "bre_extension_escape", "print_function"],
  },
  {
    name: "unfinished replacement at source end",
    scope: "source.sed.posix.bre",
    source: "s/a/b",
    issues: ["incomplete_syntax/incomplete_replacement"],
    nodes: ["replacement"],
  },
  {
    name: "unfinished translation at source end",
    scope: "source.sed.posix.bre",
    source: "y/a/b",
    issues: ["incomplete_syntax/incomplete_translation"],
    nodes: ["translation_string"],
  },
  {
    name: "NUL remains native parser recovery",
    scope: "source.sed.posix.bre",
    source: "s\0p\n",
    issues: [],
    nodes: ["ERROR", "print_function"],
    nativeRecovery: true,
  },
];

const convergenceCases = [
  {
    name: "unclosed bracket expression at source end",
    scope: "source.sed.posix.bre",
    source: "/[a",
    histories: [
      { source: "/[", edits: ["2 0 a"] },
      { source: "/[b", edits: ["2 1 a"] },
    ],
  },
  {
    name: "missing separator after an unmatched closing brace",
    scope: "source.sed.posix.bre",
    source: "}p\n",
    histories: [
      { source: "}\n", edits: ["1 0 p"] },
      { source: "};p\n", edits: ["1 1 "] },
    ],
  },
  {
    name: "reserved unknown function after negation",
    scope: "source.sed.posix.bre",
    source: "1!/\np\n",
    histories: [
      { source: "1!x\np\n", edits: ["2 1 /"] },
      { source: "1!$\np\n", edits: ["2 1 /"] },
    ],
  },
];

function issuePaths(tree) {
  const pattern =
    /\(syntax_issue[ \t\r\n]+\(([a-z_]+)[ \t\r\n]+\(([a-z_]+)\)\)\)/g;
  return [...tree.matchAll(pattern)].map(
    ([, outcome, reason]) => `${outcome}/${reason}`,
  );
}

function parse(scope, source, name, edits = []) {
  return parseFixture(temporaryDirectory, scope, source, name, edits);
}

function fail(name, message, tree) {
  console.error(`${name}: ${message}`);
  if (tree) {
    console.error(tree.trimEnd());
  }
  return false;
}

let passed = true;
try {
  for (const [index, testCase] of cases.entries()) {
    const result = parse(testCase.scope, testCase.source, `boundary-${index}`);
    if (result.error) {
      throw result.error;
    }

    const expectedStatus = testCase.nativeRecovery ? 1 : 0;
    if (result.status !== expectedStatus) {
      passed = fail(
        testCase.name,
        `expected exit status ${expectedStatus}, received ${result.status}`,
        result.stdout,
      );
      continue;
    }

    const actualIssues = issuePaths(result.stdout);
    if (JSON.stringify(actualIssues) !== JSON.stringify(testCase.issues)) {
      passed = fail(
        testCase.name,
        `expected issues ${JSON.stringify(testCase.issues)}, received ${JSON.stringify(actualIssues)}`,
        result.stdout,
      );
      continue;
    }

    for (const node of testCase.nodes) {
      if (!result.stdout.includes(`(${node}`)) {
        passed = fail(testCase.name, `expected node ${node}`, result.stdout);
      }
    }

    if (
      !testCase.nativeRecovery &&
      /\((ERROR|MISSING)([ \t\r\n)]|$)/.test(result.stdout)
    ) {
      passed = fail(
        testCase.name,
        "unexpected native parser recovery",
        result.stdout,
      );
    }
  }

  for (const [caseIndex, testCase] of convergenceCases.entries()) {
    const fullResult = parse(
      testCase.scope,
      testCase.source,
      `convergence-${caseIndex}-full`,
    );
    if (fullResult.error) {
      throw fullResult.error;
    }
    if (fullResult.status !== 0) {
      passed = fail(
        testCase.name,
        `full parse exited with status ${fullResult.status}`,
        fullResult.stdout || fullResult.stderr,
      );
      continue;
    }

    for (const [historyIndex, history] of testCase.histories.entries()) {
      const incrementalResult = parse(
        testCase.scope,
        history.source,
        `convergence-${caseIndex}-${historyIndex}`,
        history.edits,
      );
      if (incrementalResult.error) {
        throw incrementalResult.error;
      }
      if (incrementalResult.status !== 0) {
        passed = fail(
          testCase.name,
          `history ${historyIndex + 1} exited with status ${incrementalResult.status}`,
          incrementalResult.stdout || incrementalResult.stderr,
        );
        continue;
      }
      if (incrementalResult.stdout !== fullResult.stdout) {
        passed = fail(
          testCase.name,
          `history ${historyIndex + 1} did not converge to the full parse`,
          incrementalResult.stdout,
        );
      }
    }
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

if (!passed) {
  process.exitCode = 1;
} else {
  const historyCount = convergenceCases.reduce(
    (total, testCase) => total + testCase.histories.length,
    0,
  );
  console.log(
    `Boundary tests passed: ${cases.length}; incremental histories passed: ${historyCount}`,
  );
}
