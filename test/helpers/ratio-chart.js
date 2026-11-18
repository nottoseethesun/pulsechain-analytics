/**
 * Runs the ratio chart, `chart-price-ratio/pulse-token-ratio.js`, as its
 * owner does, in a child process, against a stand-in web.
 * @module test/helpers/ratio-chart
 *
 * The chart asks GeckoTerminal and DexTools with Node's `fetch`, which the
 * preload `stand-in-web-preload.js` replaces with answers the test gives,
 * so a test asks nothing outside the computer. `geckoAnswers` builds
 * GeckoTerminal's answers for two tokens, each with one pool and its daily
 * candles. The child gets a key file of the test's own in
 * `API_KEYS_FILE_PATH`, and no `API_KEYS_PASSWORD` the test did not give.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The chart. */
const CHART = fileURLToPath(
  new URL("../../chart-price-ratio/pulse-token-ratio.js", import.meta.url),
);

/** The preload that stands in for the web. */
const PRELOAD = fileURLToPath(
  new URL("./stand-in-web-preload.js", import.meta.url),
);

/** GeckoTerminal's api for PulseChain. */
const GECKO = "https://api.geckoterminal.com/api/v2/networks/pulsechain";

/** The two tokens, and each one's pool. */
export const TOKEN_A = `0x${"a".repeat(40)}`;
export const TOKEN_B = `0x${"b".repeat(40)}`;
const POOL_A = `0x${"1".repeat(40)}`;
const POOL_B = `0x${"2".repeat(40)}`;

/**
 * Names DexTools' price of a token, on the default plan and chain.
 *
 * @param {string} token - The token's address
 * @returns {string} The url
 */
export function dexToolsPriceUrl(token) {
  return `https://public-api.dextools.io/standard/v2/token/pulse/${token}/price`;
}

/** The url of DexTools' check of a key, on the plan asked first. */
export const DEXTOOLS_CHECK_URL =
  "https://public-api.dextools.io/standard/v2/blockchain?sort=name&order=asc";

/**
 * Builds a pool's daily candles: one a day from 2026-01-01, closing at the
 * prices given.
 *
 * @param {Array<number>} closes - Each day's close
 * @returns {Array<Array<number>>} The candles, as GeckoTerminal lists them
 */
function dailyCandles(closes) {
  const start = Date.UTC(2026, 0, 1) / 1000;
  return closes.map((close, day) => [
    start + day * 86400,
    close,
    close,
    close,
    close,
    1,
  ]);
}

/**
 * Builds GeckoTerminal's answers for the two tokens: their names, one pool
 * each, and each pool's daily candles. Hourly candles are not answered
 * unless `hourly` says how.
 *
 * @param {Array<number>} closesA - Token A's pool's daily closes
 * @param {Array<number>} closesB - Token B's pool's daily closes
 * @returns {Array<{url: string, status?: number, body: Object}>} The answers
 */
export function geckoAnswers(closesA, closesB) {
  const pool = (address, name, reserve) => ({
    data: [{ attributes: { address, name, reserve_in_usd: reserve } }],
  });
  const candles = (closes) => ({
    data: { attributes: { ohlcv_list: dailyCandles(closes) } },
  });
  return [
    {
      url: `${GECKO}/tokens/${TOKEN_A}`,
      body: { data: { attributes: { name: "Alpha", symbol: "ALP" } } },
    },
    {
      url: `${GECKO}/tokens/${TOKEN_B}`,
      body: { data: { attributes: { name: "Beta", symbol: "BET" } } },
    },
    {
      url: `${GECKO}/tokens/${TOKEN_A}/pools?page=1`,
      body: pool(POOL_A, "ALP / WPLS", "1000"),
    },
    {
      url: `${GECKO}/tokens/${TOKEN_B}/pools?page=1`,
      body: pool(POOL_B, "BET / WPLS", "2000"),
    },
    {
      url: `${GECKO}/pools/${POOL_A}/ohlcv/day?limit=1000`,
      body: candles(closesA),
    },
    {
      url: `${GECKO}/pools/${POOL_B}/ohlcv/day?limit=1000`,
      body: candles(closesB),
    },
  ];
}

/**
 * GeckoTerminal's refusal of both pools' hourly candles.
 *
 * @returns {Array<{url: string, status: number, body: Object}>} The answers
 */
export function hourlyRefused() {
  return [POOL_A, POOL_B].map((pool) => ({
    url: `${GECKO}/pools/${pool}/ohlcv/hour?limit=1000`,
    status: 500,
    body: {},
  }));
}

/**
 * Runs the chart in a child process against the answers given, in a temp
 * folder of its own, removed afterwards.
 *
 * @param {string[]} args - The chart's arguments
 * @param {Object} options - The answers, and the environment
 * @param {Array<Object>} options.answers - The stand-in web's answers
 * @param {Object<string, string>} [options.env={}] - More of the environment, such as `API_KEYS_PASSWORD`
 * @param {string} [options.keyFile] - The key file; one that does not exist when absent
 * @returns {{status: number, stdout: string, stderr: string, requests: Array<{url: string, sentKey: boolean}>}} How it ended, and the requests it made
 */
export function runChart(args, { answers, env = {}, keyFile }) {
  const folder = fs.mkdtempSync(
    path.join(os.tmpdir(), "pulsechain-analytics-test-ratio-"),
  );
  try {
    const answersFile = path.join(folder, "answers.json");
    const log = path.join(folder, "requests.log");
    fs.writeFileSync(answersFile, JSON.stringify(answers));
    const childEnv = {
      ...process.env,
      API_KEYS_FILE_PATH: keyFile ?? path.join(folder, "no-api-keys.json"),
      STAND_IN_WEB_ANSWERS: answersFile,
      STAND_IN_WEB_LOG: log,
      ...env,
    };
    if (env.API_KEYS_PASSWORD === undefined) delete childEnv.API_KEYS_PASSWORD;
    const run = spawnSync(
      process.execPath,
      ["--import", PRELOAD, CHART, ...args],
      { env: childEnv, cwd: folder, encoding: "utf8", timeout: 30000 },
    );
    const requests = fs.existsSync(log)
      ? fs
          .readFileSync(log, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
    return {
      status: run.status,
      stdout: run.stdout,
      stderr: run.stderr,
      requests,
    };
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}
