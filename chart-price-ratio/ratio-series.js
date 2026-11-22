/**
 * The ratio chart's prices: the two tokens' names, their prices over time,
 * oldest first, from the candles of the source the run reads, Moralis or
 * GeckoTerminal, or their current prices from DexTools, and the ratio at
 * each time both tokens have a price for.
 * @module chart-price-ratio/ratio-series
 *
 * Each function takes the run: its settings (`ratioSettings`, in
 * `ratio-command.js`), its source (`ratio-source.js`), and `moralisKey` and
 * `dexToolsKey`, which open the Moralis and DexTools keys the first time
 * each is called, so a run that never asks a service opens no key of it.
 * DexTools is asked through crypto-price-fetchers' DexTools client
 * (`crypto-price-fetchers/dex-prices/dextools`), whose time limit and
 * waits after a 429 every request of the shared clients gets.
 */

import {
  currentUsdPrice,
  dexToolsSettings,
} from "crypto-price-fetchers/dex-prices/dextools";
import { keySaved, SAVE_KEY_HELP } from "./api-keys.js";
import { getClosesGecko, getTokenInfo } from "./gecko-terminal.js";
import {
  getClosesMoralis,
  MORALIS_TIMEFRAMES,
  moralisPair,
} from "./moralis.js";
import { getBestPoolWithHistory } from "./pool-selector.js";
import { timeLabel } from "./ratio-output.js";

/** Seconds in an hour, and in a day, for the span a run reads from Moralis. */
const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * HOUR_SECONDS;

/**
 * Fetches the two tokens' names from GeckoTerminal, as the chart's title
 * shows them.
 *
 * @param {Object} run - The run
 * @returns {Promise<Array<string>>} Token A's name and token B's
 */
async function tokenNames(run) {
  const unknown = () => ({ name: "Unknown Token", symbol: "???" });
  const infos = await Promise.all([
    getTokenInfo(run.network, run.tokenA).catch(unknown),
    getTokenInfo(run.network, run.tokenB).catch(unknown),
  ]);
  return infos.map((info) =>
    info.name !== "Unknown Token"
      ? `${info.name} (${info.symbol})`
      : info.symbol,
  );
}

/**
 * Resamples daily closes to weeks: each week's close is its last day's.
 *
 * @param {Array<{timestamp: number, close: number}>} dailyData - The daily closes, oldest first
 * @param {number} weeklyResampleDays - The days in a week's point
 * @returns {Array<{timestamp: number, close: number}>} The weekly closes
 */
function resampleToWeekly(dailyData, weeklyResampleDays) {
  if (dailyData.length === 0) return [];
  const weekly = [];
  let weekStart = dailyData[0].timestamp;
  let weekClose = dailyData[0].close;
  for (const d of dailyData.slice(1)) {
    if (d.timestamp - weekStart >= weeklyResampleDays * 24 * 60 * 60 * 1000) {
      weekly.push({ timestamp: weekStart, close: weekClose });
      weekStart = d.timestamp;
    }
    weekClose = d.close;
  }
  weekly.push({ timestamp: weekStart, close: weekClose });
  return weekly;
}

/**
 * Fetches a token's current USD price from DexTools, and says it.
 *
 * @param {Object} run - The run
 * @param {string} apiKey - The DexTools key
 * @param {string} token - The token's address
 * @returns {Promise<number>} The price
 * @throws {Error} When DexTools does not answer in time, answers with an error, or gives no price
 */
async function dexToolsPrice(run, apiKey, token) {
  const price = await currentUsdPrice(
    { chain: run.dexTools.chain, token },
    apiKey,
    dexToolsSettings({
      host: run.dexTools.host,
      plan: run.dexTools.subscription,
      version: run.dexTools.version,
    }),
  );
  console.log(`DexTools USD price for ${token.slice(0, 8)}...: $${price}`);
  return price;
}

/**
 * Fetches the two tokens' current USD prices from DexTools, as one point
 * each, with the key saved, which it opens the first time.
 *
 * @param {Object} run - The run
 * @returns {Promise<{dataA: Array, dataB: Array, source: string}>} The two series and their source
 */
async function dexToolsSeries(run) {
  const apiKey = await run.dexToolsKey();
  const priceA = await dexToolsPrice(run, apiKey, run.tokenA);
  const priceB = await dexToolsPrice(run, apiKey, run.tokenB);
  const now = Date.now();
  return {
    dataA: [{ timestamp: now, close: priceA }],
    dataB: [{ timestamp: now, close: priceB }],
    source: "DexTools (current USD-based ratio)",
  };
}

/**
 * Fetches each token's closing prices at the run's interval, resampling
 * daily ones to weeks for the weekly chart.
 *
 * @param {Object} run - The run
 * @param {function(string, string): Promise<Array<{timestamp: number, close: number}>>} closesOf - Fetches a token's closes, given 'A' or 'B' and the interval, 'hourly' or 'daily'
 * @returns {Promise<{dataA: Array, dataB: Array}>} The two series
 */
async function intervalCloses(run, closesOf) {
  if (run.interval === "weekly") {
    console.log("Fetching daily data for weekly resampling...");
    // The days both pools have, so both series' weeks start on one day
    const [dailyA, dailyB] = sameTimes(
      await closesOf("A", "daily"),
      await closesOf("B", "daily"),
    );
    return {
      dataA: resampleToWeekly(dailyA, run.weeklyResampleDays),
      dataB: resampleToWeekly(dailyB, run.weeklyResampleDays),
    };
  }
  console.log(`Fetching ${run.interval} data...`);
  return {
    dataA: await closesOf("A", run.interval),
    dataB: await closesOf("B", run.interval),
  };
}

/**
 * Fetches each token's closing prices in its pool from GeckoTerminal at
 * the interval asked.
 *
 * @param {Object} run - The run
 * @param {{address: string, token: string}} poolA - Token A's pool, and token A
 * @param {{address: string, token: string}} poolB - Token B's pool, and token B
 * @returns {Promise<{dataA: Array, dataB: Array}>} The two series
 */
function geckoCloses(run, poolA, poolB) {
  const pools = { A: poolA, B: poolB };
  return intervalCloses(run, (side, interval) =>
    getClosesGecko({
      network: run.network,
      pool: pools[side].address,
      token: pools[side].token,
      timeframe: interval === "hourly" ? "hour" : "day",
      limit: run.maxCandles,
    }),
  );
}

/**
 * Fetches each token's closing prices in its pair from Moralis at the
 * interval asked: the hourly ones of the last `maxCandles` hours, the
 * daily ones of the last `moralis.days` days.
 *
 * @param {Object} run - The run
 * @param {string} apiKey - The Moralis key
 * @param {{address: string, token: string}} pairA - Token A's pair, and token A
 * @param {{address: string, token: string}} pairB - Token B's pair, and token B
 * @returns {Promise<{dataA: Array, dataB: Array}>} The two series
 */
function moralisCloses(run, apiKey, pairA, pairB) {
  const pairs = { A: pairA, B: pairB };
  const toSeconds = Math.floor(Date.now() / 1000);
  return intervalCloses(run, (side, interval) => {
    const span =
      interval === "hourly"
        ? run.maxCandles * HOUR_SECONDS
        : run.moralis.days * DAY_SECONDS;
    return getClosesMoralis(
      {
        moralis: run.moralis,
        pair: pairs[side],
        timeframe: MORALIS_TIMEFRAMES[interval],
        fromSeconds: toSeconds - span,
        toSeconds,
      },
      apiKey,
    );
  });
}

/**
 * Keeps the prices of the times both series have: GeckoTerminal makes no
 * candle for a period in which nothing traded, so a pool can lack a time
 * the other has.
 *
 * @param {Array<{timestamp: number, close: number}>} dataA - Token A's prices
 * @param {Array<{timestamp: number, close: number}>} dataB - Token B's prices
 * @returns {Array<Array<{timestamp: number, close: number}>>} Each series with only those times, in its own order
 */
function sameTimes(dataA, dataB) {
  const timesB = new Set(dataB.map((point) => point.timestamp));
  const pairedA = dataA.filter((point) => timesB.has(point.timestamp));
  const timesA = new Set(pairedA.map((point) => point.timestamp));
  return [pairedA, dataB.filter((point) => timesA.has(point.timestamp))];
}

/**
 * Falls back to DexTools' current prices, when a key is saved.
 *
 * @param {Object} run - The run
 * @returns {Promise<?{dataA: Array, dataB: Array, source: string}>} The two series, or null when no key is saved, having said how to save one
 */
async function dexToolsFallback(run) {
  if (!keySaved("dextools")) {
    console.error(
      "Cannot fall back to current prices: No DexTools API key is saved.",
    );
    console.error(SAVE_KEY_HELP);
    return null;
  }
  console.log(
    "Falling back to current USD prices via DexTools (single point only)...",
  );
  return dexToolsSeries(run);
}

/**
 * Fetches the two tokens' names and prices from GeckoTerminal's best
 * pools, falling back to DexTools when their candles cannot be had.
 *
 * @param {Object} run - The run
 * @returns {Promise<?{dataA: Array, dataB: Array, source: string, names: Array<string>}>} The two series, their source and the tokens' names, or null when there are none
 */
async function geckoSeries(run) {
  const names = await tokenNames(run);
  let poolA, poolB;
  try {
    poolA = await getBestPoolWithHistory(
      run.tokenA,
      run.network,
      run.maxCandles,
    );
    poolB = await getBestPoolWithHistory(
      run.tokenB,
      run.network,
      run.maxCandles,
    );
  } catch (e) {
    console.warn(`GeckoTerminal pool discovery failed: ${e.message}`);
    throw e;
  }
  try {
    const closes = await geckoCloses(run, poolA, poolB);
    return {
      ...closes,
      names,
      source: "GeckoTerminal (USD-based historical)",
    };
  } catch (e) {
    console.warn(`GeckoTerminal historical data failed: ${e.message}`);
    const fallback = await dexToolsFallback(run);
    return fallback === null ? null : { ...fallback, names };
  }
}

/**
 * Fetches the two tokens' names and prices from Moralis: each token's
 * pair, from the pairs that list it first, then the pairs' candles,
 * falling back to DexTools when those cannot be had.
 *
 * @param {Object} run - The run
 * @returns {Promise<?{dataA: Array, dataB: Array, source: string, names: Array<string>}>} The two series, their source and the tokens' names, or null when there are none
 * @throws {Error} When no Moralis key is saved or it cannot be opened, or Moralis lists no pair whose candles price a token
 */
async function moralisSeries(run) {
  if (!keySaved("moralis")) {
    throw new Error(`No Moralis API key is saved. ${SAVE_KEY_HELP}`);
  }
  const apiKey = await run.moralisKey();
  const pairA = await moralisPair(run.moralis, apiKey, run.tokenA);
  const pairB = await moralisPair(run.moralis, apiKey, run.tokenB);
  const names = [pairA.name, pairB.name];
  try {
    const closes = await moralisCloses(run, apiKey, pairA, pairB);
    return { ...closes, names, source: "Moralis (USD-based historical)" };
  } catch (e) {
    console.warn(`Moralis historical data failed: ${e.message}`);
    const fallback = await dexToolsFallback(run);
    return fallback === null ? null : { ...fallback, names };
  }
}

/**
 * Fetches the two tokens' names and prices: from DexTools alone in
 * DexTools-only mode, else from the run's source of candles.
 *
 * @param {Object} run - The run
 * @returns {Promise<?{dataA: Array, dataB: Array, source: string, names: Array<string>}>} The two series, their source and the tokens' names, or null when there are none
 */
export async function fetchSeries(run) {
  if (!run.useDexToolsOnly) {
    return run.source === "moralis" ? moralisSeries(run) : geckoSeries(run);
  }
  console.log("DexTools-only mode enabled (forced via flag or config).");
  if (!keySaved("dextools")) {
    console.error(
      "Cannot use DexTools-only mode: No DexTools API key is saved.",
    );
    console.error(SAVE_KEY_HELP);
    return null;
  }
  return { ...(await dexToolsSeries(run)), names: ["Token A", "Token B"] };
}

/**
 * Works out the ratio at each time both series have a price above 0 for:
 * token A's price at that time over token B's at the same time.
 *
 * @param {Array<{timestamp: number, close: number}>} dataA - Token A's prices, oldest first
 * @param {Array<{timestamp: number, close: number}>} dataB - Token B's prices
 * @param {string} interval - The run's interval: an hourly row's date names its hour (`timeLabel`)
 * @returns {{rows: Array<Object>, ratios: Array<number>, timestamps: Array<number>}} The CSV's rows, the ratios, and their times, oldest first
 */
export function ratioRows(dataA, dataB, interval) {
  const closesB = new Map(dataB.map((point) => [point.timestamp, point.close]));
  const rows = [];
  const ratios = [];
  const timestamps = [];

  for (const { timestamp, close: pA } of dataA) {
    const pB = closesB.get(timestamp);
    if (pB === undefined || !(pA > 0 && pB > 0)) continue;
    const ratio = pA / pB;
    ratios.push(ratio);
    timestamps.push(timestamp);
    rows.push({
      date: timeLabel(timestamp, interval),
      priceA: pA.toFixed(12),
      priceB: pB.toFixed(12),
      ratio: ratio.toFixed(12),
    });
  }
  return { rows, ratios, timestamps };
}
