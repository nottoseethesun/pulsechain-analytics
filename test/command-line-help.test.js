/**
 * Tests that every command line this repo runs answers `--help`, and `-h`,
 * as the repo's CLAUDE.md asks: its options, then examples of its common
 * uses, then its exit codes.
 * @module test/command-line-help.test
 *
 * The checks are crypto-price-fetchers' (`crypto-price-fetchers/lib/command-line-help`),
 * the owner's repo of code his projects share, so every repo holds its help
 * to the same rule. Each command line runs in a child process, from the
 * repo's top folder, with no way to the owner's keys; a help is printed
 * before anything is asked of the chain or a service. `COMMAND_LINES`
 * lists the Summ sweep, the ratio chart, the balance checker, the Sheets
 * script's Node version, the key manager and its commands,
 * `bin/unlock-api-keys.sh`, which bash runs, and the bins of
 * crypto-price-fetchers the npm targets run: its versions tool, which
 * `npm run github-project-deps` runs, and `run-actionlint`, which the lint
 * and `npm run audit:actionlint` run. A second test holds the list to the repo and the tools' own
 * packages, so a command line added later is held to the rule too. A third
 * runs each tool's start file in `bin/` with only the packages `npm ci`
 * installs in the tool's folder, as a checkout has them when only that
 * folder was installed.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  filesRunBy,
  filesUsingCommander,
  helpIntoClosedPipe,
  helpOf,
  helpProblems,
} from "crypto-price-fetchers/lib/command-line-help";

/** The repo's top folder. */
const REPO_TOP = fileURLToPath(new URL("..", import.meta.url));

/** crypto-price-fetchers' bins, by name, each with the file it runs, from its package.json. */
const DEPENDENCY_BINS = Object.freeze(
  Object.fromEntries(
    Object.entries(
      JSON.parse(
        fs.readFileSync(
          path.join(
            REPO_TOP,
            "node_modules/crypto-price-fetchers/package.json",
          ),
          "utf8",
        ),
      ).bin,
    ).map(([name, file]) => [
      name,
      `node_modules/crypto-price-fetchers/${file}`,
    ]),
  ),
);

/**
 * Every command line: the file it runs, the program that runs that file,
 * node unless `program` names a shell, and the subcommand, if any, whose
 * help is asked for.
 */
const COMMAND_LINES = Object.freeze([
  { file: "bin/summ-sweep.js", command: [] },
  { file: "bin/pulse-token-ratio.js", command: [] },
  { file: "bin/check-token-balance.js", command: [] },
  { file: "bin/fetch-amount-of-token-transferred.js", command: [] },
  { file: "bin/manage-api-keys.js", command: [] },
  { file: "bin/manage-api-keys.js", command: ["set"] },
  { file: "bin/manage-api-keys.js", command: ["check-password"] },
  { program: "bash", file: "bin/unlock-api-keys.sh", command: [] },
  { file: DEPENDENCY_BINS["github-project-deps"], command: [] },
  { file: DEPENDENCY_BINS["run-actionlint"], command: [] },
]);

/**
 * The modules that declare a command for a command line run from another
 * file, by the file node runs.
 */
const COMMAND_MODULES = Object.freeze({
  "summ-sweep/command-line.js": "bin/summ-sweep.js",
  "chart-price-ratio/ratio-command.js": "bin/pulse-token-ratio.js",
  "check-token-balance/balance-command.js": "bin/check-token-balance.js",
});

describe("every command line's help", () => {
  for (const commandLine of COMMAND_LINES) {
    const name = [commandLine.file, ...commandLine.command].join(" ");
    it(`${name} answers --help with its options, examples of its uses and its exit codes, and -h with the same`, () => {
      const help = helpOf(REPO_TOP, commandLine, "--help");
      assert.deepEqual(helpProblems(help), []);
      assert.deepEqual(helpOf(REPO_TOP, commandLine, "-h"), help);
    });
  }
});

describe("every command line's help into a closed pipe", () => {
  for (const commandLine of COMMAND_LINES) {
    const name = [commandLine.file, ...commandLine.command].join(" ");
    it(`${name} ends quietly, with exit code 0, when the program reading its help has closed the pipe`, async () => {
      assert.deepEqual(await helpIntoClosedPipe(REPO_TOP, commandLine), {
        status: 0,
        stderr: "",
      });
    });
  }
});

describe("the list of command lines", () => {
  it("holds every file an npm target runs, every bin it runs, and every file that declares a command with commander", () => {
    const listed = new Set(COMMAND_LINES.map(({ file }) => file));
    for (const file of [
      ...filesRunBy(REPO_TOP, "."),
      ...filesRunBy(REPO_TOP, "chart-price-ratio"),
      ...filesRunBy(REPO_TOP, "check-token-balance"),
    ]) {
      assert.ok(listed.has(path.posix.normalize(file)), `${file} is listed`);
    }
    const scripts = JSON.parse(
      fs.readFileSync(path.join(REPO_TOP, "package.json"), "utf8"),
    ).scripts;
    for (const script of Object.values(scripts)) {
      for (const command of script.split("&&")) {
        const name = command.trim().split(" ")[0];
        const bin = Object.hasOwn(DEPENDENCY_BINS, name)
          ? DEPENDENCY_BINS[name]
          : undefined;
        assert.ok(bin === undefined || listed.has(bin), `${name} is listed`);
      }
    }
    for (const file of filesUsingCommander(REPO_TOP)) {
      assert.ok(
        listed.has(file) || listed.has(COMMAND_MODULES[file]),
        `${file} declares a command; list its command line`,
      );
    }
  });
});

/**
 * Runs a tool's start file with `--help` as a checkout runs it after
 * `npm ci` in the tool's folder alone: from a copy of the start file in the
 * `bin/` of a temp folder, beside a link to the tool's folder, with no
 * packages of the top folder's to resolve from. `--preserve-symlinks`
 * keeps the link's path, so the tool's modules look for packages in the
 * tool's folder, through the link, and in no folder of the repo.
 *
 * @param {string} startFile - The start file's name in `bin/`
 * @param {string} toolFolder - The tool's folder, from the repo's top
 * @returns {import('node:child_process').SpawnSyncReturns<string>} The run
 */
function helpWithToolPackagesOnly(startFile, toolFolder) {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), "pa-start-file-"));
  const link = path.join(top, toolFolder);
  try {
    fs.writeFileSync(path.join(top, "package.json"), '{"type":"module"}\n');
    fs.mkdirSync(path.join(top, "bin"));
    fs.copyFileSync(
      path.join(REPO_TOP, "bin", startFile),
      path.join(top, "bin", startFile),
    );
    fs.symlinkSync(path.join(REPO_TOP, toolFolder), link, "dir");
    return spawnSync(
      process.execPath,
      ["--preserve-symlinks", path.join(top, "bin", startFile), "--help"],
      { cwd: top, encoding: "utf8", timeout: 30000 },
    );
  } finally {
    if (fs.existsSync(link)) fs.unlinkSync(link);
    fs.rmSync(top, { recursive: true, force: true });
  }
}

describe("the start files in bin/", () => {
  for (const [startFile, toolFolder] of [
    ["check-token-balance.js", "check-token-balance"],
    ["pulse-token-ratio.js", "chart-price-ratio"],
  ]) {
    it(`bin/${startFile} runs its tool with only the packages npm ci installs in ${toolFolder}/`, () => {
      const run = helpWithToolPackagesOnly(startFile, toolFolder);
      assert.equal(run.status, 0, run.stderr);
      assert.match(run.stdout, /^Usage: /);
    });
  }
});
