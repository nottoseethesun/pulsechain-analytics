/**
 * Tests for the ratio chart, `chart-price-ratio/pulse-token-ratio.js`, run
 * as its owner runs it, reading GeckoTerminal's candles, against a
 * stand-in GeckoTerminal and DexTools (`helpers/ratio-chart.js`). A run
 * from Moralis, and the choice of the source, are tested in
 * `pulse-token-ratio-moralis.test.js`.
 * @module test/pulse-token-ratio.test
 *
 * The DexTools key comes from the repo's key store, never from a setting or
 * the command line: a test that needs one saves it in a key file of its
 * own, in a temp folder, removed afterwards. No output may hold it. The
 * DexTools client and its time limit are crypto-price-fetchers', and
 * tested there.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  assertKeysNotShown,
  CLOSES_A,
  CLOSES_B,
  DEXTOOLS_ANSWERS,
  DEXTOOLS_CHECK_URL,
  DEXTOOLS_KEY,
  dexToolsPriceUrl,
  geckoAnswers,
  hourlyRefused,
  PASSWORD,
  quoteSideAnswers,
  runChart,
  saveStandInKeys,
  TOKEN_A,
  TOKEN_B,
} from "./helpers/ratio-chart.js";

/** A hundred days' closes for WPLS. */
const WPLS_CLOSES = Array.from({ length: 100 }, () => 0.00003);

let keys;
let folder;
let keyFile;

before(async () => {
  keys = await saveStandInKeys();
  folder = keys.folder;
  keyFile = keys.dexTools;
});

after(() => {
  keys.remove();
});

describe("pulse-token-ratio.js", () => {
  it("charts the daily ratio from GeckoTerminal's candles, asking for no key or password", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "daily"], {
      answers: geckoAnswers(CLOSES_A, CLOSES_B),
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(
      run.stdout,
      /Alpha \(ALP\) \/ Beta \(BET\) ratio \(daily, 100 points\) - Source: GeckoTerminal \(USD-based historical\)/,
    );
    const current = (CLOSES_A[99] / CLOSES_B[99]).toFixed(12);
    assert.ok(run.stdout.includes(`Current ratio: ${current}\n`), run.stdout);
    assert.match(run.stderr, /No DexTools API key is saved\./);
    assert.match(run.stderr, /in the repo's top folder: npm run api-keys/);
    assert.doesNotMatch(`${run.stdout}${run.stderr}`, /Password/);
    assert.ok(run.requests.every(({ url }) => !url.includes("dextools")));
  });

  it("charts a token's own price when it is its pool's quote token", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "daily"], {
      answers: quoteSideAnswers(CLOSES_A, CLOSES_B, WPLS_CLOSES),
    });
    assert.equal(run.status, 0, run.stderr);
    const current = (CLOSES_A[99] / CLOSES_B[99]).toFixed(12);
    assert.ok(run.stdout.includes(`Current ratio: ${current}\n`), run.stdout);
  });

  it("writes the ratios to a CSV when asked", () => {
    const csv = path.join(folder, "ratio.csv");
    const run = runChart(
      [TOKEN_A, TOKEN_B, "daily", "--csv", `--csv-filename=${csv}`],
      { answers: geckoAnswers(CLOSES_A, CLOSES_B) },
    );
    assert.equal(run.status, 0, run.stderr);
    const lines = fs.readFileSync(csv, "utf8").split("\n");
    assert.equal(lines[0], "date,price_tokenA,price_tokenB,ratio");
    assert.equal(lines.length, 101);
    assert.equal(
      lines[1],
      `2026-01-01,${(2).toFixed(12)},${(1).toFixed(12)},${(2).toFixed(12)}`,
    );
  });

  it("falls back to DexTools' current prices, with the key saved in the key store, when GeckoTerminal has no candles", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "hourly"], {
      answers: [
        ...geckoAnswers(CLOSES_A, CLOSES_B),
        ...hourlyRefused(),
        ...DEXTOOLS_ANSWERS,
      ],
      keyFile,
      env: { API_KEYS_PASSWORD: PASSWORD, STAND_IN_WEB_KEY: DEXTOOLS_KEY },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(
      run.stdout,
      /Falling back to current USD prices via DexTools \(single point only\)/,
    );
    assert.match(run.stdout, /Current ratio: 5\.000000000000\n/);
    const dexTools = run.requests.filter(({ url }) => url.includes("dextools"));
    assert.deepEqual(
      dexTools.map(({ url }) => url),
      [
        DEXTOOLS_CHECK_URL,
        dexToolsPriceUrl(TOKEN_A),
        dexToolsPriceUrl(TOKEN_B),
      ],
    );
    assert.ok(dexTools.every(({ sentKey }) => sentKey));
    assert.doesNotMatch(run.stderr, /No DexTools API key is saved/);
    assertKeysNotShown(run);
  });

  it("says how to save a DexTools key, and ends with exit code 1, when GeckoTerminal has no candles and none is saved", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "hourly"], {
      answers: [...geckoAnswers(CLOSES_A, CLOSES_B), ...hourlyRefused()],
    });
    assert.equal(run.status, 1, run.stderr);
    assert.match(
      run.stderr,
      /Cannot fall back to current prices: No DexTools API key is saved\.\nTo save one, in the repo's top folder: npm run api-keys\n/,
    );
    assert.ok(run.requests.every(({ url }) => !url.includes("dextools")));
  });

  it("in DexTools-only mode, asks DexTools alone, with the key saved", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "--useDexToolsOnly"], {
      answers: DEXTOOLS_ANSWERS,
      keyFile,
      env: { API_KEYS_PASSWORD: PASSWORD, STAND_IN_WEB_KEY: DEXTOOLS_KEY },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(
      run.stdout,
      /Token A \/ Token B ratio \(current, current only\) - Source: DexTools/,
    );
    assert.match(run.stdout, /Current ratio: 5\.000000000000\n/);
    assertKeysNotShown(run);
  });

  it("in DexTools-only mode with no key saved, says how to save one, asking nothing, and ends with exit code 1", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "--useDexToolsOnly"], {
      answers: [],
    });
    assert.equal(run.status, 1, run.stderr);
    assert.match(
      run.stderr,
      /Cannot use DexTools-only mode: No DexTools API key is saved\.\nTo save one, in the repo's top folder: npm run api-keys\n/,
    );
    assert.deepEqual(run.requests, []);
  });

  it("ends with exit code 1 when a request fails", () => {
    // GeckoTerminal knows no pool of either token.
    const run = runChart([TOKEN_A, TOKEN_B, "daily"], { answers: [] });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /Fatal error: .*no stand-in answer/);
  });
});

describe("pulse-token-ratio.js, reading GeckoTerminal's candles, which come newest first", () => {
  /** The newest day of the closes, the hundredth from 2026-01-01. */
  const NEWEST_DAY = "2026-04-10";

  it("prints the newest ratios as its recent ones, the newest last, and the newest as its current ratio", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "daily"], {
      answers: geckoAnswers(CLOSES_A, CLOSES_B),
    });
    assert.equal(run.status, 0, run.stderr);
    const current = (CLOSES_A[99] / CLOSES_B[99]).toFixed(12);
    assert.ok(
      run.stdout.includes(`${NEWEST_DAY}: ${current}\n\nCurrent ratio: `),
      run.stdout,
    );
    assert.ok(run.stdout.includes(`Current ratio: ${current}\n`));
  });

  it("draws the oldest ratio at the left of its x-axis and the newest at the right", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "daily"], {
      answers: geckoAnswers(CLOSES_A, CLOSES_B),
    });
    assert.equal(run.status, 0, run.stderr);
    const axis = run.stdout
      .split("\n")
      .find((line) => /^ +\d{4}-\d{2}-\d{2}/.test(line));
    const dates = axis.trim().split(/ +/);
    assert.equal(dates[0], "2026-01-01");
    assert.equal(dates[dates.length - 1], NEWEST_DAY);
  });

  it("divides each token's price by the other's of the same day, when one pool has no candle for a day", () => {
    // Token B's pool traded nothing on day 50, so GeckoTerminal makes no candle for it
    const closesB = CLOSES_B.map((close, day) => (day === 50 ? null : close));
    const csv = path.join(folder, "paired.csv");
    const run = runChart(
      [TOKEN_A, TOKEN_B, "daily", "--csv", `--csv-filename=${csv}`],
      { answers: geckoAnswers(CLOSES_A, closesB) },
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
  });

  it("makes its weekly points from the days both pools have, so both series' weeks start on one day", () => {
    // Token B's pool has no candle on day 7, where token A's second week starts
    const closesB = CLOSES_B.map((close, day) => (day === 7 ? null : close));
    const run = runChart([TOKEN_A, TOKEN_B, "weekly"], {
      answers: geckoAnswers(CLOSES_A, closesB),
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /ratio \(weekly, 15 points\)/);
  });

  it("charts day by day when no interval is given, as config.json sets", () => {
    const run = runChart([TOKEN_A, TOKEN_B], {
      answers: geckoAnswers(CLOSES_A, CLOSES_B),
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /ratio \(daily, 100 points\)/);
  });
});

describe("pulse-token-ratio.js, with a series of few points", () => {
  /**
   * A number of days' closes for each token's pool.
   *
   * @param {number} days - The days
   * @returns {{answers: Array<Object>}} GeckoTerminal's answers
   */
  function daysOfCandles(days) {
    return {
      answers: geckoAnswers(CLOSES_A.slice(0, days), CLOSES_B.slice(0, days)),
    };
  }

  it("draws three points with each widened across the chart, a date under each", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "daily"], daysOfCandles(3));
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /ratio \(daily, 3 points\)/);
    const axis = run.stdout
      .split("\n")
      .find((line) => /^ +\d{4}-\d{2}-\d{2}/.test(line));
    assert.deepEqual(axis.trim().split(/ +/), [
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
    // Two steps of 45 columns between the first point and the last: 91
    // columns in all, with each date under its point's column
    assert.equal(axis.indexOf("2026-01-03") - axis.indexOf("2026-01-01"), 90);
    assert.equal(axis.indexOf("2026-01-02") - axis.indexOf("2026-01-01"), 45);
  });

  it("charts 89 points", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "daily"], daysOfCandles(89));
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /ratio \(daily, 89 points\)/);
    assert.match(run.stdout, /Current ratio: /);
  });

  it("charts 90 points", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "daily"], daysOfCandles(90));
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /ratio \(daily, 90 points\)/);
    assert.match(run.stdout, /Current ratio: /);
  });

  it("says a weekly chart from GeckoTerminal shows at most 27 points, and draws its points", () => {
    // A hundred days are fifteen weeks.
    const run = runChart([TOKEN_A, TOKEN_B, "weekly"], daysOfCandles(100));
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /ratio \(weekly, 15 points\)/);
    assert.match(
      run.stdout,
      /GeckoTerminal's free api serves about the last 184 days of candles, so the weekly chart shows at most 27 points\.\n/,
    );
    assert.match(run.stdout, /Current ratio: /);
  });
});

describe("pulse-token-ratio.js, its command line", () => {
  it("answers --help on stdout, with exit code 0, asking nothing", () => {
    const run = runChart(["--help"], { answers: [] });
    assert.equal(run.status, 0, run.stderr);
    assert.match(
      run.stdout,
      /^Usage: pulse-token-ratio \[options\] <tokenA> <tokenB> \[interval\]\n/,
    );
    assert.match(run.stdout, /Exit codes:\n {2}0 {2}the ratios were printed\n/);
    assert.equal(run.stderr, "");
    assert.deepEqual(run.requests, []);
  });

  it("takes the interval as --interval, in place of the third argument", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "--interval=daily"], {
      answers: geckoAnswers(CLOSES_A, CLOSES_B),
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /ratio \(daily, 100 points\)/);
  });

  it("takes the days in each weekly point from --weekly-days", () => {
    // A hundred days are eight points of fourteen days, the last one short.
    const run = runChart([TOKEN_A, TOKEN_B, "weekly", "--weekly-days=14"], {
      answers: geckoAnswers(CLOSES_A, CLOSES_B),
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /ratio \(weekly, 8 points\)/);
    assert.match(run.stdout, /the weekly chart shows at most 14 points\./);
  });

  it("refuses an address that is not a contract's, naming the argument, asking nothing", () => {
    const run = runChart(["0x1234", TOKEN_B], { answers: [] });
    assert.equal(run.status, 1);
    assert.match(
      run.stderr,
      /invalid for argument 'tokenA'\. Not a contract address, which is 0x and 40 hex digits\./,
    );
    assert.deepEqual(run.requests, []);
  });

  it("refuses an interval GeckoTerminal does not serve", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "minute"], { answers: [] });
    assert.equal(run.status, 1);
    assert.match(
      run.stderr,
      /invalid for argument 'interval'\. Allowed choices are hourly, daily, weekly\./,
    );
  });

  it("refuses a number of candles that is not a whole number above 0", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "--max-candles=0"], {
      answers: [],
    });
    assert.equal(run.status, 1);
    assert.match(
      run.stderr,
      /'--max-candles <number>'.*Not a whole number above 0\./,
    );
  });

  it("refuses a DexTools address that is not an http or https url, naming --host, asking nothing", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "--host=notaurl"], {
      answers: [],
    });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /'--host <url>'.*Not an http or https url\./);
    assert.deepEqual(run.requests, []);
  });

  it("refuses an option it does not know, naming it without what follows its =", () => {
    const run = runChart([TOKEN_A, TOKEN_B, `--api-key=${DEXTOOLS_KEY}`], {
      answers: [],
    });
    assert.equal(run.status, 1);
    assert.equal(run.stderr, "error: unknown option '--api-key'\n");
    assert.deepEqual(run.requests, []);
    assertKeysNotShown(run);
  });
});
