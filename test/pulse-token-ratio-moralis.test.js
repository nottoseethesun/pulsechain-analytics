/**
 * Tests for the ratio chart, `chart-price-ratio/pulse-token-ratio.js`, run
 * as its owner runs it, reading Moralis's candles, against a stand-in
 * Moralis, GeckoTerminal and DexTools (`helpers/ratio-chart.js`), and for
 * its choice of the source of candles
 * (`chart-price-ratio/ratio-source.js`).
 * @module test/pulse-token-ratio-moralis.test
 *
 * The Moralis and DexTools keys come from the repo's key store, never from
 * a setting or the command line: the tests save them in key files of their
 * own, in a temp folder, removed afterwards. No output may hold one.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  chooseSource,
  sourceQuestion,
  TRIES,
} from "../chart-price-ratio/ratio-source.js";
import {
  assertKeysNotShown,
  CLOSES_A,
  CLOSES_B,
  DEXTOOLS_ANSWERS,
  geckoAnswers,
  MORALIS_CHECK_URL,
  MORALIS_KEY,
  moralisAnswers,
  moralisCandlesUrl,
  PAIR_A,
  PAIR_A_SECOND,
  PAIR_B,
  PASSWORD,
  runChart,
  saveStandInKeys,
  TOKEN_A,
  TOKEN_B,
  WPLS,
} from "./helpers/ratio-chart.js";

let keys;

before(async () => {
  keys = await saveStandInKeys();
});

after(() => {
  keys.remove();
});

describe("pulse-token-ratio.js, reading Moralis's candles", () => {
  /** The environment of a run that opens the Moralis key. */
  const MORALIS_ENV = {
    API_KEYS_PASSWORD: PASSWORD,
    STAND_IN_WEB_KEY: MORALIS_KEY,
  };

  /**
   * The span a run asked a pair's candles over, from the url it asked.
   *
   * @param {{requests: Array<{url: string}>}} run - The run
   * @param {string} start - The url's start (`moralisCandlesUrl`)
   * @returns {number} The seconds from the span's first time to its last
   */
  function spanAsked(run, start) {
    const asked = run.requests.find(({ url }) => url.startsWith(start));
    assert.ok(asked, `no request for ${start}`);
    const query = new URL(asked.url).searchParams;
    return Number(query.get("toDate")) - Number(query.get("fromDate"));
  }

  it("charts the daily ratio over two years from the pairs that list each token first, asking GeckoTerminal nothing", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "--source", "moralis"], {
      answers: moralisAnswers(CLOSES_A, CLOSES_B),
      keyFile: keys.moralis,
      env: MORALIS_ENV,
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(
      run.stdout,
      /Alpha \(ALP\) \/ Beta \(BET\) ratio \(daily, 100 points\) - Source: Moralis \(USD-based historical\)/,
    );
    const current = (CLOSES_A[99] / CLOSES_B[99]).toFixed(12);
    assert.ok(run.stdout.includes(`Current ratio: ${current}\n`), run.stdout);
    assert.ok(run.stdout.includes(`Pool ${PAIR_A.slice(0, 8)}... (ALP/WPLS)`));
    assert.ok(run.stdout.includes(`Pool ${PAIR_B.slice(0, 8)}... (BET/WPLS)`));
    assert.ok(run.requests.every(({ url }) => !url.includes(PAIR_A_SECOND)));
    assert.equal(spanAsked(run, moralisCandlesUrl(PAIR_A, "1d")), 730 * 86400);
    assert.equal(spanAsked(run, moralisCandlesUrl(PAIR_B, "1d")), 730 * 86400);
    assert.ok(run.requests.every(({ url }) => !url.includes("geckoterminal")));
    assert.ok(run.requests.every(({ sentKey }) => sentKey));
    assert.equal(run.requests[0].url, MORALIS_CHECK_URL);
    assertKeysNotShown(run);
  });

  it("reads the days --moralis-days names", () => {
    const run = runChart(
      [TOKEN_A, TOKEN_B, "--source", "moralis", "--moralis-days", "90"],
      {
        answers: moralisAnswers(CLOSES_A, CLOSES_B),
        keyFile: keys.moralis,
        env: MORALIS_ENV,
      },
    );
    assert.equal(run.status, 0, run.stderr);
    assert.equal(spanAsked(run, moralisCandlesUrl(PAIR_A, "1d")), 90 * 86400);
  });

  it("charts the hourly ratio from the last --max-candles hours", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "hourly", "--source", "moralis"], {
      answers: moralisAnswers(CLOSES_A, CLOSES_B, { timeframe: "1h" }),
      keyFile: keys.moralis,
      env: MORALIS_ENV,
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /ratio \(hourly, 100 points\) - Source: Moralis/);
    assert.equal(spanAsked(run, moralisCandlesUrl(PAIR_A, "1h")), 1000 * 3600);
  });

  it("makes its weekly points from Moralis's days, saying nothing of GeckoTerminal's 27", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "weekly", "--source", "moralis"], {
      answers: moralisAnswers(CLOSES_A, CLOSES_B),
      keyFile: keys.moralis,
      env: MORALIS_ENV,
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /ratio \(weekly, 15 points\) - Source: Moralis/);
    assert.doesNotMatch(run.stdout, /at most 27 points/);
  });

  it("falls back to DexTools when Moralis's candles price another token, naming both", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "--source", "moralis"], {
      answers: [
        ...moralisAnswers(CLOSES_A, CLOSES_B, { pricedA: WPLS }),
        ...DEXTOOLS_ANSWERS,
      ],
      keyFile: keys.both,
      env: MORALIS_ENV,
    });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(
      run.stderr.includes(
        `Moralis historical data failed: Moralis's candles of pool ${PAIR_A} price ${WPLS}, not ${TOKEN_A}`,
      ),
      run.stderr,
    );
    assert.match(
      run.stdout,
      /Alpha \(ALP\) \/ Beta \(BET\) ratio \(daily, current only\) - Source: DexTools/,
    );
    assert.match(run.stdout, /Current ratio: 5\.000000000000\n/);
    assertKeysNotShown(run);
  });

  it("stops with exit code 1 when no pair lists a token first, naming --source geckoterminal", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "--source", "moralis"], {
      answers: moralisAnswers(CLOSES_A, CLOSES_B, { listsBFirst: false }),
      keyFile: keys.moralis,
      env: MORALIS_ENV,
    });
    assert.equal(run.status, 1);
    assert.ok(
      run.stderr.includes(
        `Moralis lists no active pair that lists ${TOKEN_B} first, so its candles cannot price it: run the chart again with --source geckoterminal`,
      ),
      run.stderr,
    );
    assert.ok(run.requests.every(({ url }) => !url.includes("/ohlcv")));
  });

  it("with a Moralis key saved and no terminal to ask at, stops and names --source, asking nothing", () => {
    const run = runChart([TOKEN_A, TOKEN_B], {
      answers: [],
      keyFile: keys.moralis,
      env: MORALIS_ENV,
    });
    assert.equal(run.status, 1);
    assert.match(
      run.stderr,
      /there is no terminal to ask which: name one with --source moralis or --source geckoterminal\.\n/,
    );
    assert.deepEqual(run.requests, []);
  });

  it("with --source geckoterminal, reads GeckoTerminal's candles though a Moralis key is saved, opening no key", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "--source", "geckoterminal"], {
      answers: geckoAnswers(CLOSES_A, CLOSES_B),
      keyFile: keys.moralis,
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Source: GeckoTerminal/);
    assert.ok(run.requests.every(({ url }) => !url.includes("moralis")));
    assert.doesNotMatch(`${run.stdout}${run.stderr}`, /Password/);
  });

  it("refuses --source moralis with no Moralis key saved, saying how to save one, asking nothing", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "--source", "moralis"], {
      answers: [],
    });
    assert.equal(run.status, 1);
    assert.match(
      run.stderr,
      /--source moralis reads Moralis's candles with the Moralis api key, and none is saved\. To save one, in the repo's top folder: npm run api-keys\n/,
    );
    assert.deepEqual(run.requests, []);
  });

  it("refuses --source with --useDexToolsOnly, asking nothing", () => {
    const run = runChart(
      [TOKEN_A, TOKEN_B, "--source", "moralis", "--useDexToolsOnly"],
      { answers: [] },
    );
    assert.equal(run.status, 1);
    assert.match(run.stderr, /cannot be used with option '--useDexToolsOnly'/);
    assert.deepEqual(run.requests, []);
  });
});

describe("chooseSource, the choice of the source of candles", () => {
  /** A daily run's settings, as the question uses them. */
  const DAILY = { interval: "daily", maxCandles: 1000, moralis: { days: 730 } };

  /**
   * A stand-in terminal that answers the question with the answers given,
   * one each time, and keeps the questions asked.
   *
   * @param {Array<string>} answers - The answers typed
   * @returns {{ask: function(string): Promise<string>, asked: Array<string>}} The terminal
   */
  function terminal(answers) {
    const asked = [];
    return {
      asked,
      ask: async (question) => {
        asked.push(question);
        return answers[asked.length - 1];
      },
    };
  }

  /**
   * Chooses with a Moralis key saved and a terminal that answers.
   *
   * @param {{ask: function(string): Promise<string>}} answering - The terminal
   * @returns {Promise<string>} The source chosen
   */
  function chooseAt(answering) {
    return chooseSource({
      requested: undefined,
      moralisKeySaved: true,
      canAsk: true,
      ask: answering.ask,
      settings: DAILY,
    });
  }

  it("asks which source to read, Enter or 1 taking Moralis and 2 GeckoTerminal", async () => {
    const enter = terminal([""]);
    assert.equal(await chooseAt(enter), "moralis");
    assert.equal(enter.asked[0], sourceQuestion(DAILY));
    assert.equal(await chooseAt(terminal(["1"])), "moralis");
    assert.equal(await chooseAt(terminal([" 2 "])), "geckoterminal");
  });

  it("says what each source reaches back to, for the interval", () => {
    assert.equal(
      sourceQuestion(DAILY),
      [
        "A Moralis api key is saved, so Moralis and GeckoTerminal can both give the candles.",
        "  1  Moralis: the last 730 days (Enter)",
        "  2  GeckoTerminal: about the last 184 days",
        "Which should this run read, 1 or 2? ",
      ].join("\n"),
    );
    const hourly = sourceQuestion({ ...DAILY, interval: "hourly" });
    assert.match(hourly, /1 {2}Moralis: the last 1000 hours \(Enter\)/);
    assert.match(hourly, /2 {2}GeckoTerminal: the last 1000 hours/);
  });

  it("asks again after an answer that is neither, and stops after its tries", async () => {
    const again = terminal(["3", "2"]);
    assert.equal(await chooseAt(again), "geckoterminal");
    assert.equal(again.asked.length, 2);
    const never = terminal(Array(TRIES).fill("moralis"));
    await assert.rejects(
      chooseAt(never),
      /None of 3 answers was 1, 2 or Enter, so no source was chosen/,
    );
    assert.equal(never.asked.length, TRIES);
  });

  it("asks nothing when --source names one, or when no Moralis key is saved", async () => {
    const silent = terminal([]);
    for (const requested of ["moralis", "geckoterminal"]) {
      assert.equal(
        await chooseSource({
          requested,
          moralisKeySaved: true,
          canAsk: true,
          ask: silent.ask,
          settings: DAILY,
        }),
        requested,
      );
    }
    assert.equal(
      await chooseSource({
        requested: undefined,
        moralisKeySaved: false,
        canAsk: true,
        ask: silent.ask,
        settings: DAILY,
      }),
      "geckoterminal",
    );
    assert.deepEqual(silent.asked, []);
  });
});
