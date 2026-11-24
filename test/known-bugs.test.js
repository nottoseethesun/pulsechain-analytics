/**
 * Tests of the bugs known in the repo's code, each declared with
 * `knownBug` (`helpers/known-bug.js`), which passes while the bug is there.
 * @module test/known-bugs.test
 *
 * The ratio chart runs as its owner runs it, in a child process, against a
 * stand-in GeckoTerminal, Moralis and DexTools (`helpers/ratio-chart.js`),
 * with stand-in keys saved in key files of a temp folder of its own. The
 * Summ sweep's command line runs in the test's thread with the stand-ins
 * of the sweep's tests (`helpers/summ-sweep-command-run.js`).
 */

import { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { knownBug } from "./helpers/known-bug.js";
import { argsFor, repo, runOn } from "./helpers/summ-sweep-command-run.js";
import {
  CLOSES_A,
  CLOSES_B,
  DEXTOOLS_ANSWERS,
  DEXTOOLS_KEY,
  geckoAnswers,
  MORALIS_KEY,
  moralisAnswers,
  PASSWORD,
  runChart,
  saveStandInKeys,
  TOKEN_A,
  TOKEN_B,
} from "./helpers/ratio-chart.js";

let keys;

before(async () => {
  keys = await saveStandInKeys();
});

// A test-name pattern that selects none of this file's tests skips the
// before, so no keys were saved
after(() => {
  if (keys !== undefined) keys.remove();
});

describe("the ratio chart, when its source cannot list a token's pools or pairs", () => {
  knownBug(
    "falls back to DexTools' current prices when GeckoTerminal cannot list a token's pools",
    () => {
      const run = runChart([TOKEN_A, TOKEN_B, "daily"], {
        answers: [
          ...geckoAnswers(CLOSES_A, CLOSES_B).map((answer) =>
            answer.url.endsWith(`/tokens/${TOKEN_A}/pools?page=1`)
              ? { url: answer.url, status: 500, body: {} }
              : answer,
          ),
          ...DEXTOOLS_ANSWERS,
        ],
        keyFile: keys.dexTools,
        env: { API_KEYS_PASSWORD: PASSWORD, STAND_IN_WEB_KEY: DEXTOOLS_KEY },
      });
      assert.equal(run.status, 0, run.stderr);
      assert.match(run.stdout, /Current ratio: 5\.000000000000\n/);
    },
  );

  knownBug(
    "falls back to DexTools' current prices when Moralis lists no pair that lists a token first",
    () => {
      const run = runChart([TOKEN_A, TOKEN_B, "--source", "moralis"], {
        answers: [
          ...moralisAnswers(CLOSES_A, CLOSES_B, { listsBFirst: false }),
          ...DEXTOOLS_ANSWERS,
        ],
        keyFile: keys.both,
        env: { API_KEYS_PASSWORD: PASSWORD, STAND_IN_WEB_KEY: MORALIS_KEY },
      });
      assert.equal(run.status, 0, run.stderr);
      assert.match(run.stdout, /Current ratio: 5\.000000000000\n/);
    },
  );
});
describe("the Summ sweep's command line, on a range or a sync time past the chain", () => {
  knownBug(
    "refuses a range that begins after the chain's newest block, writing nothing",
    async () => {
      const top = repo();
      const run = await runOn(
        top,
        argsFor(top, {
          "--start-date": "2026-11-01",
          "--end-date": "2026-11-02",
        }),
      );
      assert.equal(run.code, 1, run.err);
      assert.match(
        run.err,
        /--start-date's day, 2026-11-01, begins after the chain's newest block, 1000, made at /,
      );
      assert.equal(fs.existsSync(path.join(top, "report.json")), false);
      assert.equal(fs.existsSync(path.join(top, "rows.csv")), false);
    },
  );

  knownBug(
    "refuses a --summ-synced-to after now, asking the chain nothing",
    async () => {
      const top = repo();
      const run = await runOn(
        top,
        argsFor(top, { "--summ-synced-to": "2999-01-01 00:00:00" }),
      );
      assert.equal(run.code, 1, run.err);
      assert.match(run.err, /"2999-01-01 00:00:00" is after now/);
      assert.equal(run.chainMade, false);
    },
  );
});
