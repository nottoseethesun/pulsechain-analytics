/**
 * The ratio chart's prices: the two tokens' names, their prices over time
 * from GeckoTerminal's best pools, or their current prices from DexTools,
 * and the ratio at each point.
 * @module chart-price-ratio/ratio-series
 *
 * Each function takes the run: its settings (`ratioSettings`, in
 * `ratio-command.js`) and `dexToolsKey`, which opens the DexTools key the
 * first time it is called, so a run that never asks DexTools asks for no
 * password.
 */

import {
  dexToolsKeySaved,
  getCurrentUsdPriceDexTools,
  SAVE_KEY_HELP,
} from "./dextools.js";
import { getClosesGecko, getTokenInfo } from "./gecko-terminal.js";
import { getBestPoolWithHistory } from "./pool-selector.js";

/**
 * Fetches the two tokens' names, as the chart's title shows them.
 *
 * @param {Object} run - The run
 * @returns {Promise<Array<string>>} Token A's name and token B's
 */
export async function tokenNames(run) {
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
 * @param {Array<{timestamp: number, close: number}>} dailyData - The daily closes
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
 * Fetches the two tokens' current USD prices from DexTools, as one point
 * each, with the key saved, which it opens the first time.
 *
 * @param {Object} run - The run
 * @returns {Promise<{dataA: Array, dataB: Array, source: string}>} The two series and their source
 */
async function dexToolsSeries(run) {
  const apiKey = await run.dexToolsKey();
  const priceA = await getCurrentUsdPriceDexTools(
    run.dexTools,
    apiKey,
    run.tokenA,
  );
  const priceB = await getCurrentUsdPriceDexTools(
    run.dexTools,
    apiKey,
    run.tokenB,
  );
  const now = Date.now();
  return {
    dataA: [{ timestamp: now, close: priceA }],
    dataB: [{ timestamp: now, close: priceB }],
    source: "DexTools (current USD-based ratio)",
  };
}

/**
 * Fetches each token's closing prices in its pool from GeckoTerminal at
 * the interval asked, resampling daily ones to weeks.
 *
 * @param {Object} run - The run
 * @param {{address: string, token: string}} poolA - Token A's pool, and token A
 * @param {{address: string, token: string}} poolB - Token B's pool, and token B
 * @returns {Promise<{dataA: Array, dataB: Array}>} The two series
 */
async function geckoCloses(run, poolA, poolB) {
  const closes = (pool, timeframe) =>
    getClosesGecko({
      network: run.network,
      pool: pool.address,
      token: pool.token,
      timeframe,
      limit: run.maxCandles,
    });
  if (run.interval === "weekly") {
    console.log("Fetching daily data for weekly resampling...");
    const dailyA = await closes(poolA, "day");
    const dailyB = await closes(poolB, "day");
    return {
      dataA: resampleToWeekly(dailyA, run.weeklyResampleDays),
      dataB: resampleToWeekly(dailyB, run.weeklyResampleDays),
    };
  }
  const tf = run.interval === "hourly" ? "hour" : "day";
  console.log(`Fetching ${run.interval} data...`);
  return { dataA: await closes(poolA, tf), dataB: await closes(poolB, tf) };
}

/**
 * Falls back to DexTools' current prices, when a key is saved.
 *
 * @param {Object} run - The run
 * @returns {Promise<?{dataA: Array, dataB: Array, source: string}>} The two series, or null when no key is saved, having said how to save one
 */
async function dexToolsFallback(run) {
  if (!dexToolsKeySaved()) {
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
 * Fetches the two tokens' prices from GeckoTerminal's best pools, falling
 * back to DexTools when their candles cannot be had.
 *
 * @param {Object} run - The run
 * @returns {Promise<?{dataA: Array, dataB: Array, source: string}>} The two series, or null when there are none
 */
async function geckoSeries(run) {
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
    return { ...closes, source: "GeckoTerminal (USD-based historical)" };
  } catch (e) {
    console.warn(`GeckoTerminal historical data failed: ${e.message}`);
    return dexToolsFallback(run);
  }
}

/**
 * Fetches the two tokens' prices: from DexTools alone in DexTools-only
 * mode, else from GeckoTerminal.
 *
 * @param {Object} run - The run
 * @returns {Promise<?{dataA: Array, dataB: Array, source: string}>} The two series, or null when there are none
 */
export async function fetchSeries(run) {
  if (!run.useDexToolsOnly) return geckoSeries(run);
  console.log("DexTools-only mode enabled (forced via flag or config).");
  if (!dexToolsKeySaved()) {
    console.error(
      "Cannot use DexTools-only mode: No DexTools API key is saved.",
    );
    console.error(SAVE_KEY_HELP);
    return null;
  }
  return dexToolsSeries(run);
}

/**
 * Works out the ratio at each point both series have a price for.
 *
 * @param {Array<{timestamp: number, close: number}>} dataA - Token A's prices
 * @param {Array<{timestamp: number, close: number}>} dataB - Token B's prices
 * @returns {{rows: Array<Object>, ratios: Array<number>, timestamps: Array<number>}} The CSV's rows, the ratios, and their times
 */
export function ratioRows(dataA, dataB) {
  const minLen = Math.min(dataA.length, dataB.length);
  const rows = [];
  const ratios = [];
  const timestamps = [];

  for (let i = 0; i < minLen; i++) {
    const pA = dataA[i].close;
    const pB = dataB[i].close;
    if (pB > 0 && pA > 0) {
      const ratio = pA / pB;
      ratios.push(ratio);
      timestamps.push(dataA[i].timestamp);
      const date = new Date(dataA[i].timestamp).toISOString().split("T")[0];
      rows.push({
        date,
        priceA: pA.toFixed(12),
        priceB: pB.toFixed(12),
        ratio: ratio.toFixed(12),
      });
    }
  }
  return { rows, ratios, timestamps };
}
