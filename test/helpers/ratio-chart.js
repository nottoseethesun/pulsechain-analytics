/**
 * Runs the ratio chart, `chart-price-ratio/pulse-token-ratio.js`, as its
 * owner does, through its start file, `bin/end-user/pulse-token-ratio.js`, in a
 * child process, against a stand-in web.
 * @module test/helpers/ratio-chart
 *
 * The chart asks GeckoTerminal, Moralis and DexTools with Node's `fetch`,
 * which the preload `stand-in-web-preload.js` replaces with answers the
 * test gives, so a test asks nothing outside the computer. `geckoAnswers`
 * builds GeckoTerminal's answers for two tokens, each with one pool and its
 * daily candles, and `moralisAnswers` Moralis's, each token with the pairs
 * that trade it and their candles. The child gets a key file of the test's
 * own in `API_KEYS_FILE_PATH`, and no `API_KEYS_PASSWORD` the test did not
 * give. `runChartInTerminal` runs the chart with the preload
 * `stand-in-terminal-preload.js` too, which makes its stdin and stderr a
 * stand-in terminal, so the chart asks its questions there, as at the
 * owner's terminal.
 */

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { saveEncryptedKey } from "crypto-price-fetchers/api-key-store";

/** The chart's start file. */
const CHART = fileURLToPath(
  new URL("../../bin/end-user/pulse-token-ratio.js", import.meta.url),
);

/** The preload that stands in for the web. */
const PRELOAD = fileURLToPath(
  new URL("./stand-in-web-preload.js", import.meta.url),
);

/** The preload that makes stdin and stderr a stand-in terminal. */
const TERMINAL_PRELOAD = fileURLToPath(
  new URL("./stand-in-terminal-preload.js", import.meta.url),
);

/** GeckoTerminal's api for PulseChain. */
const GECKO = "https://api.geckoterminal.com/api/v2/networks/pulsechain";

/** Moralis's api. */
const MORALIS = "https://deep-index.moralis.io/api/v2.2";

/** The url of the key store's check of a Moralis key. */
export const MORALIS_CHECK_URL = `${MORALIS}/web3/version`;

/** The two tokens, and each one's pool. */
export const TOKEN_A = `0x${"a".repeat(40)}`;
export const TOKEN_B = `0x${"b".repeat(40)}`;
const POOL_A = `0x${"1".repeat(40)}`;
const POOL_B = `0x${"2".repeat(40)}`;

/**
 * WPLS, the other token of each pair at Moralis, in lower case, as the
 * chart writes addresses.
 */
export const WPLS = "0xA1077a294dDE1B09bB078844df40758a5D0f9a27".toLowerCase();

/**
 * Each token's pair at Moralis that lists it first, and a deeper pair that
 * lists token A second, whose candles would price WPLS.
 */
export const PAIR_A = `0x${"3".repeat(40)}`;
export const PAIR_B = `0x${"4".repeat(40)}`;
export const PAIR_A_SECOND = `0x${"5".repeat(40)}`;

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

/** Stand-in DexTools and Moralis keys, and the password they are saved with. */
export const DEXTOOLS_KEY = "stand-in-dextools-key";
export const MORALIS_KEY = "stand-in-moralis-key";
export const PASSWORD = "stand-in password";

/** A hundred days' closes for each token's pool. */
export const CLOSES_A = Array.from({ length: 100 }, (_, day) => 2 + day * 0.01);
export const CLOSES_B = Array.from(
  { length: 100 },
  (_, day) => 1 + day * 0.001,
);

/** DexTools' answers: its check takes the key, and each token's price. */
export const DEXTOOLS_ANSWERS = [
  { url: DEXTOOLS_CHECK_URL, body: { data: [] } },
  { url: dexToolsPriceUrl(TOKEN_A), body: { data: { price: 2.5 } } },
  { url: dexToolsPriceUrl(TOKEN_B), body: { data: { price: 0.5 } } },
];

/**
 * Saves the stand-in keys, with the stand-in password, in key files of a
 * temp folder of their own: the DexTools key alone, the Moralis key alone,
 * and both.
 *
 * @returns {Promise<{folder: string, dexTools: string, moralis: string, both: string, remove: function(): void}>} The folder, the three key files, and a way to remove them
 */
export async function saveStandInKeys() {
  const folder = fs.mkdtempSync(
    path.join(os.tmpdir(), "pulsechain-analytics-test-ratio-keys-"),
  );
  const dexTools = path.join(folder, "dextools-api-keys.json");
  const moralis = path.join(folder, "moralis-api-keys.json");
  const both = path.join(folder, "both-api-keys.json");
  await saveEncryptedKey(dexTools, "dextools", DEXTOOLS_KEY, PASSWORD);
  await saveEncryptedKey(moralis, "moralis", MORALIS_KEY, PASSWORD);
  await saveEncryptedKey(both, "moralis", MORALIS_KEY, PASSWORD);
  await saveEncryptedKey(both, "dextools", DEXTOOLS_KEY, PASSWORD);
  return {
    folder,
    dexTools,
    moralis,
    both,
    remove: () => fs.rmSync(folder, { recursive: true, force: true }),
  };
}

/**
 * Asserts that no output of a run shows a stand-in key.
 *
 * @param {{stdout: string, stderr: string}} run - The run
 */
export function assertKeysNotShown(run) {
  const output = `${run.stdout}${run.stderr}`;
  assert.ok(!output.includes(DEXTOOLS_KEY), "The DexTools key was shown");
  assert.ok(!output.includes(MORALIS_KEY), "The Moralis key was shown");
}

/**
 * Names a pool's candles, as crypto-price-fetchers' GeckoTerminal client
 * asks for the latest thousand, in USD: of the token named, or, with none
 * named, of the pool's base token, as GeckoTerminal prices them.
 *
 * @param {string} pool - The pool's address
 * @param {string} timeframe - 'day' or 'hour'
 * @param {string} [token] - The token priced, by its address
 * @returns {string} The url
 */
function candlesUrl(pool, timeframe, token) {
  const priced = token === undefined ? "" : `&token=${token}`;
  return `${GECKO}/pools/${pool}/ohlcv/${timeframe}?aggregate=1&limit=1000&currency=usd${priced}`;
}

/**
 * Builds a pool's daily candles: one a day from 2026-01-01, closing at the
 * prices given, and none for a day whose close is null, as GeckoTerminal
 * makes no candle for a day in which nothing traded. They are listed
 * newest first, as GeckoTerminal lists them.
 *
 * @param {Array<?number>} closes - Each day's close, oldest first, or null for a day with no candle
 * @returns {Array<Array<number>>} The candles, newest first
 */
function dailyCandles(closes) {
  const start = Date.UTC(2026, 0, 1) / 1000;
  return closes
    .flatMap((close, day) =>
      close === null
        ? []
        : [[start + day * 86400, close, close, close, close, 1]],
    )
    .reverse();
}

/**
 * Builds GeckoTerminal's answers for the two tokens: their names, one pool
 * each, and each pool's daily candles of its token, asked by the token's
 * address. Hourly candles are not answered unless `hourlyRefused` adds
 * their refusal.
 *
 * @param {Array<?number>} closesA - Token A's pool's daily closes, oldest first, null for a day with no candle
 * @param {Array<?number>} closesB - Token B's pool's daily closes, oldest first, null for a day with no candle
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
    { url: candlesUrl(POOL_A, "day", TOKEN_A), body: candles(closesA) },
    { url: candlesUrl(POOL_B, "day", TOKEN_B), body: candles(closesB) },
  ];
}

/**
 * Builds GeckoTerminal's answers for two tokens of which the first is its
 * pool's quote token. GeckoTerminal prices a pool's base token unless a
 * request names another: token A's pool, ALP / WPLS with WPLS its base,
 * answers WPLS's closes to a request that names no token, and token A's to
 * one that names token A. Token B is its pool's base, and its pool answers
 * token B's closes either way.
 *
 * @param {Array<number>} closesA - Token A's daily closes
 * @param {Array<number>} closesB - Token B's daily closes
 * @param {Array<number>} wplsCloses - WPLS's daily closes
 * @returns {Array<{url: string, body: Object}>} The answers
 */
export function quoteSideAnswers(closesA, closesB, wplsCloses) {
  const candles = (closes) => ({
    data: { attributes: { ohlcv_list: dailyCandles(closes) } },
  });
  return [
    ...geckoAnswers(closesA, closesB).filter(
      (answer) => !answer.url.includes("/ohlcv/"),
    ),
    { url: candlesUrl(POOL_A, "day"), body: candles(wplsCloses) },
    { url: candlesUrl(POOL_A, "day", TOKEN_A), body: candles(closesA) },
    { url: candlesUrl(POOL_B, "day"), body: candles(closesB) },
    { url: candlesUrl(POOL_B, "day", TOKEN_B), body: candles(closesB) },
  ];
}

/**
 * Names the start of a pair's candles at Moralis, as crypto-price-fetchers'
 * Moralis client asks for them, in USD, on PulseChain: what follows names
 * the span's first and last times, which depend on when the chart ran.
 *
 * @param {string} pair - The pair's address
 * @param {string} timeframe - Moralis's timeframe: '1d' or '1h'
 * @returns {string} The url's start
 */
export function moralisCandlesUrl(pair, timeframe) {
  return `${MORALIS}/pairs/${pair}/ohlcv?chain=0x171&timeframe=${timeframe}&currency=usd&fromDate=`;
}

/**
 * Builds a pair's candles as Moralis gives them: one a period from
 * 2026-01-01, closing at the prices given, listed newest first.
 *
 * @param {Array<number>} closes - Each period's close, oldest first
 * @param {number} periodSeconds - The period, in seconds
 * @returns {Array<Object>} The candles, newest first
 */
function moralisCandles(closes, periodSeconds) {
  const start = Date.UTC(2026, 0, 1);
  return closes
    .map((close, period) => ({
      timestamp: new Date(start + period * periodSeconds * 1000).toISOString(),
      open: close,
      high: close,
      low: close,
      close,
      volume: 1,
      trades: 1,
    }))
    .reverse();
}

/**
 * Builds Moralis's answers for the two tokens: the check of the key, the
 * pairs that trade each token, and the candles of the pair that lists each
 * token first. Token A's pairs are a deeper one that lists it second and
 * the one that lists it first; token B's, the one that lists it first.
 *
 * @param {Array<number>} closesA - Token A's pair's closes, oldest first
 * @param {Array<number>} closesB - Token B's pair's closes, oldest first
 * @param {Object} [options] - How Moralis answers
 * @param {string} [options.timeframe='1d'] - The candles' timeframe: '1d' or '1h'
 * @param {string} [options.pricedA=TOKEN_A] - The token Moralis's answer names as the one token A's candles price
 * @param {boolean} [options.listsBFirst=true] - Whether a pair lists token B first
 * @returns {Array<Object>} The answers
 */
export function moralisAnswers(
  closesA,
  closesB,
  { timeframe = "1d", pricedA = TOKEN_A, listsBFirst = true } = {},
) {
  const names = {
    [TOKEN_A]: ["Alpha", "ALP"],
    [TOKEN_B]: ["Beta", "BET"],
    [WPLS]: ["Wrapped Pulse", "WPLS"],
  };
  const token = (address, type) => ({
    token_address: address,
    token_name: names[address][0],
    token_symbol: names[address][1],
    token_decimals: "18",
    pair_token_type: type,
  });
  const pair = (address, base, quote, liquidity) => ({
    exchange_name: "PulseX v2",
    pair_label: `${names[base][1]}/${names[quote][1]}`,
    pair_address: address,
    liquidity_usd: liquidity,
    inactive_pair: false,
    base_token: base,
    quote_token: quote,
    pair: [token(base, "token0"), token(quote, "token1")],
  });
  const periodSeconds = timeframe === "1h" ? 3600 : 86400;
  const candles = (closes, priced) => ({
    cursor: null,
    tokenAddress: priced,
    result: moralisCandles(closes, periodSeconds),
  });
  return [
    { url: MORALIS_CHECK_URL, body: { version: "2.2" } },
    {
      url: `${MORALIS}/erc20/${TOKEN_A}/pairs?chain=0x171`,
      body: {
        cursor: null,
        pairs: [
          pair(PAIR_A_SECOND, WPLS, TOKEN_A, 90000),
          pair(PAIR_A, TOKEN_A, WPLS, 1000),
        ],
      },
    },
    {
      url: `${MORALIS}/erc20/${TOKEN_B}/pairs?chain=0x171`,
      body: {
        cursor: null,
        pairs: [
          listsBFirst
            ? pair(PAIR_B, TOKEN_B, WPLS, 2000)
            : pair(PAIR_B, WPLS, TOKEN_B, 2000),
        ],
      },
    },
    {
      urlStartsWith: moralisCandlesUrl(PAIR_A, timeframe),
      body: candles(closesA, pricedA),
    },
    {
      urlStartsWith: moralisCandlesUrl(PAIR_B, timeframe),
      body: candles(closesB, TOKEN_B),
    },
  ];
}

/**
 * GeckoTerminal's refusal of both pools' hourly candles.
 *
 * @returns {Array<{url: string, status: number, body: Object}>} The answers
 */
export function hourlyRefused() {
  return [
    [POOL_A, TOKEN_A],
    [POOL_B, TOKEN_B],
  ].map(([pool, token]) => ({
    url: candlesUrl(pool, "hour", token),
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

/**
 * Reads the requests a run made from the log the stand-in web wrote.
 *
 * @param {string} log - The log's path
 * @returns {Array<{url: string, sentKey: boolean}>} The requests, in order
 */
function requestsLogged(log) {
  return fs.existsSync(log)
    ? fs
        .readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
    : [];
}

/**
 * Runs the chart at a stand-in terminal (`stand-in-terminal-preload.js`),
 * in a temp folder of its own, removed afterwards. What it writes on
 * stdout and on stderr is read as one output, in the order it comes, as a
 * terminal shows both, and each reply is typed once the output since the
 * last reply shows its prompt, as the owner answers at a terminal. The run
 * is stopped after 30 seconds.
 *
 * @param {string[]} args - The chart's arguments
 * @param {Object} options - The answers, the key file and the replies
 * @param {Array<Object>} options.answers - The stand-in web's answers
 * @param {string} options.keyFile - The key file
 * @param {Array<{after: RegExp, type: string}>} options.replies - What to type, in order, each once its prompt shows
 * @returns {Promise<{status: (number|null), output: string, requests: Array<{url: string, sentKey: boolean}>, rawModes: boolean[]}>} The exit code, what the terminal showed, the requests made, and each turn of raw mode on or off, in order
 */
export async function runChartInTerminal(args, { answers, keyFile, replies }) {
  const folder = fs.mkdtempSync(
    path.join(os.tmpdir(), "pulsechain-analytics-test-ratio-terminal-"),
  );
  try {
    const answersFile = path.join(folder, "answers.json");
    const log = path.join(folder, "requests.log");
    const rawModeLog = path.join(folder, "raw-mode.log");
    fs.writeFileSync(answersFile, JSON.stringify(answers));
    const env = {
      ...process.env,
      API_KEYS_FILE_PATH: keyFile,
      STAND_IN_WEB_ANSWERS: answersFile,
      STAND_IN_WEB_LOG: log,
      STAND_IN_TERMINAL_LOG: rawModeLog,
    };
    delete env.API_KEYS_PASSWORD;
    const child = spawn(
      process.execPath,
      ["--import", PRELOAD, "--import", TERMINAL_PRELOAD, CHART, ...args],
      { cwd: folder, env },
    );
    let output = "";
    let answeredUpTo = 0;
    let next = 0;
    const show = (chunk) => {
      output += chunk;
      while (
        next < replies.length &&
        replies[next].after.test(output.slice(answeredUpTo))
      ) {
        answeredUpTo = output.length;
        child.stdin.write(replies[next].type);
        next += 1;
      }
    };
    child.stdout.on("data", show);
    child.stderr.on("data", show);
    const timer = setTimeout(() => child.kill(), 30000);
    const status = await new Promise((resolve) => child.on("close", resolve));
    clearTimeout(timer);
    return {
      status,
      output: output.replaceAll("\r", ""),
      requests: requestsLogged(log),
      rawModes: fs.existsSync(rawModeLog)
        ? fs
            .readFileSync(rawModeLog, "utf8")
            .trim()
            .split("\n")
            .map((line) => line === "true")
        : [],
    };
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}
