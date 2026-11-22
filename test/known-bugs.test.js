/**
 * The known bugs, each declared with `knownBug` (`helpers/known-bug.js`),
 * so its test passes while the bug is present.
 * @module test/known-bugs.test
 *
 * The balance checker runs as its owner runs it, in a child process, in a
 * temp folder of the test's own, removed afterwards, whose config.json the
 * test writes. Each run is given `--block abc`, which the checker refuses as
 * it parses, so a run that gets past config.json stops there and asks no
 * chain. The ratio chart's command line is parsed in the test's thread.
 */

import { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRatioCommand } from "../chart-price-ratio/ratio-command.js";
import { knownBug } from "./helpers/known-bug.js";

/** The balance checker. */
const CHECKER = fileURLToPath(
  new URL("../check-token-balance/index.js", import.meta.url),
);

/** A wallet, and the two tokens of a ratio. */
const WALLET = `0x${"5e".repeat(20)}`;
const TOKEN_A = `0x${"a".repeat(40)}`;
const TOKEN_B = `0x${"b".repeat(40)}`;

describe("check-token-balance/index.js, with a config.json it should refuse", () => {
  let folder;

  before(() => {
    folder = fs.mkdtempSync(
      path.join(os.tmpdir(), "pulsechain-analytics-bugs-"),
    );
  });

  after(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  /**
   * Runs the checker in the temp folder, with a config.json of the text
   * given.
   *
   * @param {string} configText - The config.json
   * @returns {{status: number, stdout: string, stderr: string}} How it ended
   */
  function runWith(configText) {
    fs.writeFileSync(path.join(folder, "config.json"), configText);
    return spawnSync(
      process.execPath,
      [
        CHECKER,
        "--address",
        WALLET,
        "--tokens",
        "Pulse_Native_Gas_Token",
        "--block",
        "abc",
      ],
      { cwd: folder, encoding: "utf8", timeout: 30_000 },
    );
  }

  knownBug(
    "stops with exit code 1, naming the file, when config.json is not JSON",
    () => {
      const ended = runWith('{ defaultRpc: "https://rpc.example.com" }');
      assert.equal(ended.status, 1);
      assert.match(ended.stderr, /config\.json is not valid JSON: /);
    },
  );

  knownBug(
    "stops with exit code 1, naming the setting, when defaultRpc is not an http or https url",
    () => {
      const ended = runWith(JSON.stringify({ defaultRpc: "rpc.example.com" }));
      assert.equal(ended.status, 1);
      assert.match(
        ended.stderr,
        /config\.json → defaultRpc must be an http or https url; it is "rpc\.example\.com"/,
      );
    },
  );
});

describe("the ratio chart's command line, with settings of config.json it should refuse", () => {
  knownBug(
    "refuses a maxCandles of 0 in config.json, as it refuses --max-candles 0",
    () => {
      assert.throws(
        () => buildRatioCommand({ maxCandles: 0 }),
        /config\.json → maxCandles must be a whole number above 0; it is 0/,
      );
    },
  );

  knownBug(
    "refuses --source when config.json sets useDexToolsOnly, as it refuses the two typed together",
    () => {
      const command = buildRatioCommand({ useDexToolsOnly: true })
        .exitOverride()
        .configureOutput({ writeOut: () => {}, writeErr: () => {} })
        .action(() => {});
      assert.throws(
        () =>
          command.parse([
            "node",
            "pulse-token-ratio.js",
            TOKEN_A,
            TOKEN_B,
            "--source",
            "moralis",
          ]),
        { code: "commander.conflictingOption" },
      );
    },
  );
});
