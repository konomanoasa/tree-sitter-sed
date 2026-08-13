const { spawnSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const runner = join(__dirname, "run-tree-sitter.js");

function parseFixture(directory, scope, source, name, edits = []) {
  const sourcePath = join(directory, `${name}.sed`);
  writeFileSync(sourcePath, source);
  return spawnSync(
    process.execPath,
    [
      runner,
      "parse",
      "--scope",
      scope,
      "--no-ranges",
      sourcePath,
      ...(edits.length === 0 ? [] : ["--edits", ...edits]),
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    },
  );
}

module.exports = { parseFixture };
