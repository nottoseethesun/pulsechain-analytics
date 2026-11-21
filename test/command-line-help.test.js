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
 * script's Node version, the key manager and its commands, and
 * crypto-price-fetchers' versions tool, which `npm run github-project-deps`
 * runs. A second test holds the list to the repo and the tools' own
 * packages, so a command line added later is held to the rule too.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  filesRunBy,
  filesUsingCommander,
  helpOf,
  helpProblems,
} from "crypto-price-fetchers/lib/command-line-help";

/** The repo's top folder. */
const REPO_TOP = fileURLToPath(new URL("..", import.meta.url));

/** The npm targets that run a bin of crypto-price-fetchers, by the bin's name, with the file it runs. */
const DEPENDENCY_BINS = Object.freeze({
  "github-project-deps":
    "node_modules/crypto-price-fetchers/github-project-deps.js",
});

/**
 * Every command line: the file node runs, and the subcommand, if any, whose
 * help is asked for.
 */
const COMMAND_LINES = Object.freeze([
  { file: "summ-sweep.js", command: [] },
  { file: "chart-price-ratio/pulse-token-ratio.js", command: [] },
  { file: "check-token-balance/index.js", command: [] },
  {
    file: "for-google-apps/check-token-balance/fetch-amount-of-token-transferred.js",
    command: [],
  },
  { file: "manage-api-keys.js", command: [] },
  { file: "manage-api-keys.js", command: ["set"] },
  { file: "manage-api-keys.js", command: ["check-password"] },
  { file: DEPENDENCY_BINS["github-project-deps"], command: [] },
]);

/**
 * The modules that declare a command for a command line run from another
 * file, by the file node runs.
 */
const COMMAND_MODULES = Object.freeze({
  "summ-sweep/command-line.js": "summ-sweep.js",
  "chart-price-ratio/ratio-command.js":
    "chart-price-ratio/pulse-token-ratio.js",
  "check-token-balance/balance-command.js": "check-token-balance/index.js",
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
      const bin = DEPENDENCY_BINS[script.split(" ")[0]];
      assert.ok(bin === undefined || listed.has(bin), `${script} is listed`);
    }
    for (const file of filesUsingCommander(REPO_TOP)) {
      assert.ok(
        listed.has(file) || listed.has(COMMAND_MODULES[file]),
        `${file} declares a command; list its command line`,
      );
    }
  });
});
