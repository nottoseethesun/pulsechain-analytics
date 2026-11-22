/**
 * The known bugs, each declared with `knownBug` (`helpers/known-bug.js`),
 * so its test passes while the bug is present.
 * @module test/known-bugs.test
 *
 * The ratio chart, `chart-price-ratio/pulse-token-ratio.js`, runs as its
 * owner runs it, against a stand-in GeckoTerminal (`helpers/ratio-chart.js`)
 * that lists each pool's candles newest first, as GeckoTerminal does, and
 * makes no candle for a day in which nothing traded, as GeckoTerminal does.
 */

import { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { knownBug } from "./helpers/known-bug.js";
import {
  geckoAnswers,
  runChart,
  TOKEN_A,
  TOKEN_B,
} from "./helpers/ratio-chart.js";

/** A hundred days' closes for each token's pool, from 2026-01-01. */
const CLOSES_A = Array.from({ length: 100 }, (_, day) => 2 + day * 0.01);
const CLOSES_B = Array.from({ length: 100 }, (_, day) => 1 + day * 0.001);

/** The newest day of the closes, the hundredth from 2026-01-01. */
const NEWEST_DAY = "2026-04-10";

let folder;

before(() => {
  folder = fs.mkdtempSync(
    path.join(os.tmpdir(), "pulsechain-analytics-test-known-bugs-"),
  );
});

after(() => {
  fs.rmSync(folder, { recursive: true, force: true });
});

describe("the ratio chart, against candles listed newest first", () => {
  knownBug(
    "prints the newest ratios as its recent ones, the newest last, and the newest as its current ratio",
    () => {
      const run = runChart([TOKEN_A, TOKEN_B, "daily"], {
        answers: geckoAnswers(CLOSES_A, CLOSES_B, { newestFirst: true }),
      });
      assert.equal(run.status, 0, run.stderr);
      const current = (CLOSES_A[99] / CLOSES_B[99]).toFixed(12);
      assert.ok(
        run.stdout.includes(`${NEWEST_DAY}: ${current}\n\nCurrent ratio: `),
        run.stdout,
      );
      assert.ok(run.stdout.includes(`Current ratio: ${current}\n`));
    },
  );

  knownBug("makes a point of each week of the daily closes", () => {
    // A hundred days are fifteen weeks.
    const run = runChart([TOKEN_A, TOKEN_B, "weekly"], {
      answers: geckoAnswers(CLOSES_A, CLOSES_B, { newestFirst: true }),
    });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /Only 15 points could be worked out/);
  });

  knownBug(
    "divides each token's price by the other's of the same day, when one pool has no candle for a day",
    () => {
      // Token B's pool traded nothing on day 50, so GeckoTerminal makes no candle for it
      const closesB = CLOSES_B.map((close, day) => (day === 50 ? null : close));
      const csv = path.join(folder, "ratio.csv");
      const run = runChart(
        [TOKEN_A, TOKEN_B, "daily", "--csv", `--csv-filename=${csv}`],
        { answers: geckoAnswers(CLOSES_A, closesB, { newestFirst: true }) },
      );
      assert.equal(run.status, 0, run.stderr);
      const rows = fs.readFileSync(csv, "utf8").trim().split("\n").slice(1);
      assert.equal(rows.length, 99);
      for (const row of rows) {
        const [date, priceA, priceB] = row.split(",");
        const day = (Date.parse(date) - Date.UTC(2026, 0, 1)) / 86400000;
        assert.notEqual(closesB[day], null, `${row}: B has no close that day`);
        assert.equal(priceA, CLOSES_A[day].toFixed(12), row);
        assert.equal(priceB, closesB[day].toFixed(12), row);
      }
    },
  );
});
