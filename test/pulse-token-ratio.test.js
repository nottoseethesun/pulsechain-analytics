/**
 * Tests for the ratio chart, `chart-price-ratio/pulse-token-ratio.js`, run
 * as its owner runs it, against a stand-in GeckoTerminal and DexTools
 * (`helpers/ratio-chart.js`).
 * @module test/pulse-token-ratio.test
 *
 * The DexTools key comes from the repo's key store, never from a setting or
 * the command line: a test that needs one saves it in a key file of its own,
 * in a temp folder, removed afterwards. No output may hold it.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveEncryptedKey } from "crypto-price-fetchers/api-key-store";
import {
  DEXTOOLS_CHECK_URL,
  dexToolsPriceUrl,
  geckoAnswers,
  hourlyRefused,
  runChart,
  TOKEN_A,
  TOKEN_B,
} from "./helpers/ratio-chart.js";

/** A stand-in DexTools key, and the password it is saved with. */
const DEXTOOLS_KEY = "stand-in-dextools-key";
const PASSWORD = "stand-in password";

/** A hundred days' closes for each token's pool. */
const CLOSES_A = Array.from({ length: 100 }, (_, day) => 2 + day * 0.01);
const CLOSES_B = Array.from({ length: 100 }, (_, day) => 1 + day * 0.001);

/** DexTools' answers: its check takes the key, and each token's price. */
const DEXTOOLS_ANSWERS = [
  { url: DEXTOOLS_CHECK_URL, body: { data: [] } },
  { url: dexToolsPriceUrl(TOKEN_A), body: { data: { price: 2.5 } } },
  { url: dexToolsPriceUrl(TOKEN_B), body: { data: { price: 0.5 } } },
];

let folder;
let keyFile;

before(async () => {
  folder = fs.mkdtempSync(
    path.join(os.tmpdir(), "pulsechain-analytics-test-ratio-keys-"),
  );
  keyFile = path.join(folder, "api-keys.json");
  await saveEncryptedKey(keyFile, "dextools", DEXTOOLS_KEY, PASSWORD);
});

after(() => {
  fs.rmSync(folder, { recursive: true, force: true });
});

/**
 * Asserts that no output of a run shows the key.
 *
 * @param {{stdout: string, stderr: string}} run - The run
 */
function assertKeyNotShown(run) {
  assert.ok(
    !`${run.stdout}${run.stderr}`.includes(DEXTOOLS_KEY),
    "The DexTools key was shown",
  );
}

describe("pulse-token-ratio.js", () => {
  it("charts the daily ratio from GeckoTerminal's candles, asking for no key or password", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "daily"], {
      answers: geckoAnswers(CLOSES_A, CLOSES_B),
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(
      run.stdout,
      /Alpha \(ALP\) \/ Beta \(BET\) ratio \(daily, 100 points\) - Source: GeckoTerminal \(PLS-based historical\)/,
    );
    const current = (CLOSES_A[99] / CLOSES_B[99]).toFixed(12);
    assert.ok(run.stdout.includes(`Current ratio: ${current}\n`), run.stdout);
    assert.match(run.stderr, /No DexTools API key is saved\./);
    assert.match(run.stderr, /in the repo's top folder: npm run api-keys/);
    assert.doesNotMatch(`${run.stdout}${run.stderr}`, /Password/);
    assert.ok(run.requests.every(({ url }) => !url.includes("dextools")));
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
    assertKeyNotShown(run);
  });

  it("says how to save a DexTools key when GeckoTerminal has no candles and none is saved", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "hourly"], {
      answers: [...geckoAnswers(CLOSES_A, CLOSES_B), ...hourlyRefused()],
    });
    assert.equal(run.status, 0, run.stderr);
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
    assertKeyNotShown(run);
  });

  it("in DexTools-only mode with no key saved, says how to save one, asking nothing", () => {
    const run = runChart([TOKEN_A, TOKEN_B, "--useDexToolsOnly"], {
      answers: [],
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(
      run.stderr,
      /Cannot use DexTools-only mode: No DexTools API key is saved\.\nTo save one, in the repo's top folder: npm run api-keys\n/,
    );
    assert.deepEqual(run.requests, []);
  });

  it("refuses an address that is not a contract's", () => {
    const run = runChart(["0x1234", TOKEN_B], { answers: [] });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /Invalid contract address format\./);
  });
});
