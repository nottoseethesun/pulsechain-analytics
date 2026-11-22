/**
 * Tests of the ratio chart and the balance checker run whole, through
 * their start files in `bin/`, in child processes, when their `config.json`
 * is refused: `--help` still gives
 * the help, and any other run stops on the file's problems.
 * @module test/refused-settings.test
 *
 * Each tool reads the `config.json` beside its own files, a file git keeps,
 * so the test hands it a refused one through
 * `helpers/stand-in-settings-preload.js`, never by writing the file. Each
 * run has a key file of its own and no `API_KEYS_PASSWORD`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** The repo's top folder. */
const REPO_TOP = fileURLToPath(new URL("..", import.meta.url));

/** The preload that hands a tool a settings file of the test's own. */
const SETTINGS_PRELOAD = fileURLToPath(
  new URL("./helpers/stand-in-settings-preload.js", import.meta.url),
);

/**
 * Runs a command line with its settings file standing in with text the
 * test gives.
 *
 * @param {string} script - The command line, from the repo's top folder
 * @param {string} settingsFile - Its settings file, from the repo's top folder
 * @param {string} settingsText - The text that file is to give
 * @param {string[]} args - The arguments
 * @returns {import('node:child_process').SpawnSyncReturns<string>} The run
 */
function runWithSettings(script, settingsFile, settingsText, args) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "pa-refused-"));
  const env = {
    ...process.env,
    API_KEYS_FILE_PATH: path.join(folder, "no-api-keys.json"),
    STAND_IN_SETTINGS: JSON.stringify({ [settingsFile]: settingsText }),
  };
  delete env.API_KEYS_PASSWORD;
  try {
    return spawnSync(
      process.execPath,
      ["--import", SETTINGS_PRELOAD, path.join(REPO_TOP, script), ...args],
      { env, cwd: folder, encoding: "utf8", timeout: 30000 },
    );
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

/** Two tokens' contracts, for a ratio. */
const TOKENS = [
  "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39",
  "0xA1077a294dDE1B09bB078844df40758a5D0f9a27",
];

describe("the ratio chart, with config.json refused", () => {
  const refused = JSON.stringify({ maxCandles: 0 });
  const run = (args) =>
    runWithSettings(
      "bin/pulse-token-ratio.js",
      "chart-price-ratio/config.json",
      refused,
      args,
    );

  it("answers --help with its help", () => {
    const help = run(["--help"]);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /^Usage: pulse-token-ratio/);
  });

  it("stops any other run, with exit code 1, on the file's problems", () => {
    const stopped = run(TOKENS);
    assert.equal(stopped.status, 1);
    assert.match(
      stopped.stderr,
      /config\.json → maxCandles must be a whole number above 0; it is 0/,
    );
  });
});

describe("the balance checker, with config.json refused", () => {
  const refused = JSON.stringify({ defaultRpc: "not an url" });
  const run = (args) =>
    runWithSettings(
      "bin/check-token-balance.js",
      "check-token-balance/config.json",
      refused,
      args,
    );

  it("answers --help with its help", () => {
    const help = run(["--help"]);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /^Usage: check-token-balance/);
  });

  it("stops any other run, with exit code 1, on the file's problems", () => {
    const stopped = run([
      "--address",
      TOKENS[0],
      "--block",
      "1",
      "--tokens",
      "Pulse_Native_Gas_Token",
    ]);
    assert.equal(stopped.status, 1);
    assert.match(
      stopped.stderr,
      /check-token-balance\/config\.json → defaultRpc must be an http or https url/,
    );
  });

  it("names a missing --block or --date before the file's problems", () => {
    const stopped = run([
      "--address",
      TOKENS[0],
      "--tokens",
      "Pulse_Native_Gas_Token",
    ]);
    assert.equal(stopped.status, 1);
    assert.match(stopped.stderr, /give --block or --date/);
    assert.doesNotMatch(stopped.stderr, /defaultRpc/);
  });
});
