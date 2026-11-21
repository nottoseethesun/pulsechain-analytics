/**
 * Tests of the known bugs, each declared with `knownBug`: a test passes
 * while its bug is present, and fails once the bug is fixed, the cue to
 * declare it with `it` among the tests of the code it is about (see
 * `../CLAUDE.md`).
 * @module test/known-bugs.test
 *
 * The balance checker, `check-token-balance/index.js`, runs as its owner
 * runs it, in a child process from its own folder, with an rpc endpoint on
 * this computer that refuses every connection, so a check that reaches the
 * chain shows in what it prints.
 */

import { describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { knownBug } from "./helpers/known-bug.js";

/** The balance checker's folder. */
const CHECKER_FOLDER = fileURLToPath(
  new URL("../check-token-balance/", import.meta.url),
);

/** An rpc endpoint on this computer that refuses every connection. */
const REFUSING_RPC = "http://127.0.0.1:1";

/**
 * Runs the balance checker.
 *
 * @param {string[]} args - Its arguments
 * @returns {{status: number, stdout: string, stderr: string}} How it ended, and what it printed
 */
function runChecker(args) {
  const result = spawnSync(process.execPath, ["index.js", ...args], {
    cwd: CHECKER_FOLDER,
    encoding: "utf8",
    timeout: 30_000,
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/**
 * Asserts that a run stopped with exit code 1, naming an option, before it
 * asked the chain anything.
 *
 * @param {{status: number, stdout: string, stderr: string}} run - The run
 * @param {string} option - The option the message names
 */
function assertRefusedBeforeTheChain(run, option) {
  assert.equal(run.status, 1);
  assert.ok(run.stderr.includes(option), run.stderr);
  assert.doesNotMatch(run.stdout + run.stderr, /ECONNREFUSED|detect network/);
}

describe("check-token-balance/index.js, given a wrong block or date", () => {
  knownBug(
    "refuses a block that is no whole number, naming --block, before it asks the chain anything",
    () => {
      const run = runChecker([
        "--address",
        "0x0000000000000000000000000000000000000001",
        "--block",
        "abc",
        "--tokens",
        "Pulse_Native_Gas_Token",
        "--rpc",
        REFUSING_RPC,
      ]);
      assertRefusedBeforeTheChain(run, "--block");
    },
  );

  knownBug(
    "refuses a date no calendar has, naming --date, before it asks the chain anything",
    () => {
      const run = runChecker([
        "--address",
        "0x0000000000000000000000000000000000000001",
        "--date",
        "2026-02-30",
        "--tokens",
        "Pulse_Native_Gas_Token",
        "--rpc",
        REFUSING_RPC,
      ]);
      assertRefusedBeforeTheChain(run, "--date");
    },
  );
});
