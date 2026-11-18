/**
 * pulse-token-ratio.js
 *
 * A flexible Node.js script to display the price ratio of any two PulseChain tokens
 * (Token A / Token B) in a single ASCII chart, even when no direct liquidity pool exists between them.
 *
 * How it works:
 *  - Primarily uses GeckoTerminal API (free, no key) to discover pools and fetch historical OHLCV data.
 *  - Smart pool selection via pool-selector.js module.
 *  - Computes the ratio: price_A_in_PLS / price_B_in_PLS → direct comparable ratio.
 *  - Supports hourly, daily, and weekly timeframes.
 *  - Improved ASCII chart:
 *    • Y-scale uses data min/max with smart tick spacing for unique, readable values.
 *    • Uses sufficient precision to avoid repeated tick labels.
 *    • Switches to scientific notation for values < 0.0001.
 *    • All y-tick labels are right-padded for perfect visual alignment.
 *    • X-scale with perfectly aligned sparse date/hour labels — chronological (oldest left → newest right).
 *  - Optional CSV export.
 *  - Optional --useDexToolsOnly flag (and config option) to force current-price mode for testing.
 *
 * Fallback: If GeckoTerminal fails, uses current USD prices via DexTools v2 API,
 * with the DexTools api key saved, encrypted, in the repo's key store
 * (`dextools.js`). An api key is no setting and no command-line argument.
 *
 * Installation:
 *   1. Ensure Node.js v22+ is installed.
 *   2. Run: npm install
 *   3. (Optional) Edit config.json
 *   4. (Optional) For the DexTools fallback, save a DexTools api key, in the
 *      repo's top folder: npm run api-keys. The chart opens it the first
 *      time it asks DexTools, with the password that
 *      `source ./unlock-api-keys.sh` keeps for the terminal, or one it asks
 *      for.
 *
 * Configuration:
 *   - All settings are loaded from config.json in the same directory.
 *   - Command-line flags can override specific config values (see examples below).
 *   - Supported overrides:
 *     --network=<value>       (e.g., --network=eth for Ethereum; default: pulsechain)
 *     --chain=<value>         (e.g., --chain=ether for DexTools chain name)
 *     --subscription=<value>  (overrides dextools.subscription, e.g., pro)
 *     --host=<value>          (overrides dextools.host URL)
 *     --version=<value>       (overrides dextools.version, e.g., v3)
 *     --csv-filename=<value>  (overrides csvFilename, e.g., my_ratio.csv)
 *     --interval=<value>      (overrides interval: hourly/daily/weekly)
 *     --max-candles=<number>  (overrides maxCandles, e.g., 500)
 *     --weekly-days=<number>  (overrides weeklyResampleDays, e.g., 14 for bi-weekly)
 *     --useDexToolsOnly       (forces DexTools current price mode, bypassing GeckoTerminal)
 *
 * Requirements:
 *   Node.js v22+ (native fetch, ESM support)
 *   npm install, for asciichart and crypto-price-fetchers' key store
 *
 * Usage Examples:
 *   # Basic: weekly ratio (default) for two tokens
 *   node pulse-token-ratio.js 0x50f1ca62e6fb8adf438ca1f50067ab83670094a6 0x94534eeee131840b1c0f61847c572228bdfdde93
 *
 *   # Specify interval
 *   node pulse-token-ratio.js <tokenA> <tokenB> daily
 *   node pulse-token-ratio.js <tokenA> <tokenB> hourly
 *
 *   # With CSV export
 *   node pulse-token-ratio.js <tokenA> <tokenB> weekly --csv
 *
 *   # Test DexTools fallback directly
 *   node pulse-token-ratio.js <tokenA> <tokenB> --useDexToolsOnly
 *
 *   # Override config values via flags
 *   node pulse-token-ratio.js <tokenA> <tokenB> --network=eth --csv-filename=custom.csv --csv
 *
 *   # Combine interval and overrides
 *   node pulse-token-ratio.js <tokenA> <tokenB> weekly --max-candles=500 --weekly-days=14 --csv
 *
 * Notes:
 *  - Token addresses must be lowercase hex (0x + 40 chars).
 *  - For DexTools fallback, save a DexTools api key with npm run api-keys, in the repo's top folder.
 *  - Intervals finer than 'hourly' are not supported by GeckoTerminal and will cause graceful failure.
 *  - Y-scale automatically computes unique tick values using a nice number algorithm.
 *  - X-scale shows sparse timestamps perfectly aligned with chart columns — chronological order (oldest left → newest right).
 *  - CSV includes columns: date, price_tokenA, price_tokenB, ratio.
 *  - Edit config.json for persistent changes; use flags for one-off overrides.
 */
import asciichart from "asciichart";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  dexToolsKeySaved,
  getCurrentUsdPriceDexTools,
  openDexToolsKey,
  SAVE_KEY_HELP,
} from "./dextools.js";
import { getClosesGecko, getTokenInfo } from "./gecko-terminal.js";
import { generateNiceTicks } from "./generateNiceTicks.js";
import { getBestPoolWithHistory } from "./pool-selector.js";

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load config
const configPath = path.join(__dirname, "config.json");
let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch (err) {
  console.error("Error loading config.json:", err.message);
  process.exit(1);
}

const {
  network: defaultNetwork = "pulsechain",
  chain: defaultChain = "pulse",
  dextools: defaultDextools = {},
  csvFilename: defaultCsvFilename = "token_ratio.csv",
  interval: configInterval = "weekly",
  maxCandles: defaultMaxCandles = 1000,
  weeklyResampleDays: defaultWeeklyResampleDays = 7,
  useDexToolsOnly: configUseDexToolsOnly = false,
} = config;

const {
  subscription: defaultSubscription = "standard",
  host: defaultHost = "https://public-api.dextools.io",
  version: defaultVersion = "v2",
} = defaultDextools;

// Parse args
const args = process.argv.slice(2);
const flags = {};
const positionalArgs = [];

args.forEach((arg) => {
  if (arg.startsWith("--")) {
    const [key, value] = arg.slice(2).split("=");
    flags[key] = value !== undefined ? value : true;
  } else {
    positionalArgs.push(arg);
  }
});

if (positionalArgs.length < 2) {
  console.error(
    "Usage: node pulse-token-ratio.js <tokenA> <tokenB> [hourly|daily|weekly] [--csv] [--useDexToolsOnly] ...",
  );
  process.exit(1);
}

const tokenA = positionalArgs[0].toLowerCase();
const tokenB = positionalArgs[1].toLowerCase();

const interval =
  positionalArgs
    .slice(2)
    .find((a) => ["hourly", "daily", "weekly"].includes(a)) ||
  flags.interval ||
  configInterval;

if (!["hourly", "daily", "weekly"].includes(interval)) {
  console.error(
    "Invalid or unsupported interval. Supported values: hourly, daily, weekly.\n" +
      "Finer intervals (e.g., minute, second) are not available via GeckoTerminal OHLCV API.",
  );
  process.exit(1);
}

const saveCsv = !!flags.csv;

// Force DexTools-only mode
const useDexToolsOnly =
  flags.useDexToolsOnly === true || configUseDexToolsOnly === true;

const network = flags.network || defaultNetwork;
const chain = flags.chain || defaultChain;
/** Where DexTools is asked, with which plan, and the chain's name there. */
const DEXTOOLS_API = {
  host: flags.host || defaultHost,
  subscription: flags.subscription || defaultSubscription,
  version: flags.version || defaultVersion,
  chain,
};
const csvFilename = flags["csv-filename"] || defaultCsvFilename;
const maxCandles = parseInt(flags["max-candles"] || defaultMaxCandles, 10);
const weeklyResampleDays = parseInt(
  flags["weekly-days"] || defaultWeeklyResampleDays,
  10,
);

// Warn when no DexTools api key is saved
if (!dexToolsKeySaved()) {
  console.warn("\n⚠️  No DexTools API key is saved.");
  console.warn(
    "   → Fallback to current prices will not be available if GeckoTerminal fails.",
  );
  console.warn(`   → ${SAVE_KEY_HELP}`);
  console.warn("   → Get a key at: https://developers.dextools.io/\n");
}

/** The DexTools key's opening, begun the first time DexTools is asked. */
let dexToolsKeyOpening = null;

/**
 * Opens the DexTools key saved, the first time it is asked for.
 *
 * @returns {Promise<?string>} The key
 */
function dexToolsKey() {
  dexToolsKeyOpening ??= openDexToolsKey();
  return dexToolsKeyOpening;
}

/**
 * Resample to weekly
 * @param {Array<{timestamp: number, close: number}>} dailyData
 * @returns {Array<{timestamp: number, close: number}>}
 */
function resampleToWeekly(dailyData) {
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
 * Fetches the two tokens' names, as the chart's title shows them.
 *
 * @returns {Promise<Array<string>>} Token A's name and token B's
 */
async function tokenNames() {
  const unknown = () => ({ name: "Unknown Token", symbol: "???" });
  const infos = await Promise.all([
    getTokenInfo(network, tokenA).catch(unknown),
    getTokenInfo(network, tokenB).catch(unknown),
  ]);
  return infos.map((info) =>
    info.name !== "Unknown Token"
      ? `${info.name} (${info.symbol})`
      : info.symbol,
  );
}

/**
 * Fetches the two tokens' current USD prices from DexTools, as one point
 * each, with the key saved, which it opens the first time.
 *
 * @returns {Promise<{dataA: Array, dataB: Array, source: string}>} The two series and their source
 */
async function dexToolsSeries() {
  const apiKey = await dexToolsKey();
  const priceA = await getCurrentUsdPriceDexTools(DEXTOOLS_API, apiKey, tokenA);
  const priceB = await getCurrentUsdPriceDexTools(DEXTOOLS_API, apiKey, tokenB);
  const now = Date.now();
  return {
    dataA: [{ timestamp: now, close: priceA }],
    dataB: [{ timestamp: now, close: priceB }],
    source: "DexTools (current USD-based ratio)",
  };
}

/**
 * Fetches the two pools' closing prices from GeckoTerminal at the
 * interval asked, resampling daily ones to weeks.
 *
 * @param {{address: string}} poolA - Token A's pool
 * @param {{address: string}} poolB - Token B's pool
 * @returns {Promise<{dataA: Array, dataB: Array}>} The two series
 */
async function geckoCloses(poolA, poolB) {
  if (interval === "weekly") {
    console.log("Fetching daily data for weekly resampling...");
    const dailyA = await getClosesGecko(
      network,
      poolA.address,
      "day",
      maxCandles,
    );
    const dailyB = await getClosesGecko(
      network,
      poolB.address,
      "day",
      maxCandles,
    );
    return { dataA: resampleToWeekly(dailyA), dataB: resampleToWeekly(dailyB) };
  }
  const tf = interval === "hourly" ? "hour" : "day";
  console.log(`Fetching ${interval} data...`);
  return {
    dataA: await getClosesGecko(network, poolA.address, tf, maxCandles),
    dataB: await getClosesGecko(network, poolB.address, tf, maxCandles),
  };
}

/**
 * Falls back to DexTools' current prices, when a key is saved.
 *
 * @returns {Promise<?{dataA: Array, dataB: Array, source: string}>} The two series, or null when no key is saved, having said how to save one
 */
async function dexToolsFallback() {
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
  return dexToolsSeries();
}

/**
 * Fetches the two tokens' prices from GeckoTerminal's best pools, falling
 * back to DexTools when their candles cannot be had.
 *
 * @returns {Promise<?{dataA: Array, dataB: Array, source: string}>} The two series, or null when there are none
 */
async function geckoSeries() {
  let poolA, poolB;
  try {
    poolA = await getBestPoolWithHistory(tokenA, network, maxCandles);
    poolB = await getBestPoolWithHistory(tokenB, network, maxCandles);
  } catch (e) {
    console.warn(`GeckoTerminal pool discovery failed: ${e.message}`);
    throw e;
  }
  try {
    const closes = await geckoCloses(poolA, poolB);
    return { ...closes, source: "GeckoTerminal (PLS-based historical)" };
  } catch (e) {
    console.warn(`GeckoTerminal historical data failed: ${e.message}`);
    return dexToolsFallback();
  }
}

/**
 * Fetches the two tokens' prices: from DexTools alone in DexTools-only
 * mode, else from GeckoTerminal.
 *
 * @returns {Promise<?{dataA: Array, dataB: Array, source: string}>} The two series, or null when there are none
 */
async function fetchSeries() {
  if (!useDexToolsOnly) return geckoSeries();
  console.log("DexTools-only mode enabled (forced via flag or config).");
  if (!dexToolsKeySaved()) {
    console.error(
      "Cannot use DexTools-only mode: No DexTools API key is saved.",
    );
    console.error(SAVE_KEY_HELP);
    return null;
  }
  return dexToolsSeries();
}

/**
 * Works out the ratio at each point both series have a price for.
 *
 * @param {Array<{timestamp: number, close: number}>} dataA - Token A's prices
 * @param {Array<{timestamp: number, close: number}>} dataB - Token B's prices
 * @returns {{rows: Array<Object>, ratios: Array<number>, timestamps: Array<number>}} The CSV's rows, the ratios, and their times
 */
function ratioRows(dataA, dataB) {
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

/**
 * Builds the y-axis' label for a value, with the precision the chart's
 * range needs.
 *
 * @param {number} range - The highest ratio less the lowest
 * @returns {function(number): string} The label for a value
 */
function yLabelFormat(range) {
  return (value) => {
    let precision = 6;
    if (range < 0.01) precision = 8;
    if (range < 0.001) precision = 10;
    if (range < 0.0001) precision = 12;
    if (range < 0.00001) {
      return value.toExponential(4);
    }

    let formatted = value.toFixed(precision);
    formatted = formatted.replace(/0+$/, "");
    if (formatted.endsWith(".")) formatted = formatted.slice(0, -1);
    return formatted || "0";
  };
}

/**
 * Builds the x-axis' line: sparse dates, or dates and hours, under the
 * chart's columns.
 *
 * @param {Array<number>} chronologicalRatios - The ratios, oldest first
 * @param {Array<number>} chronologicalTimestamps - Their times, oldest first
 * @returns {string} The labels, spaced to their columns
 */
function xAxisLine(chronologicalRatios, chronologicalTimestamps) {
  const maxLabels = 10;
  const minLabels = 4;
  const labelCount = Math.min(
    maxLabels,
    Math.max(minLabels, Math.ceil(chronologicalRatios.length / 30)),
  );
  const step = Math.floor((chronologicalRatios.length - 1) / (labelCount - 1));

  const labels = [];
  for (let i = 0; i < labelCount - 1; i++) {
    labels.push({ idx: i * step, ts: chronologicalTimestamps[i * step] });
  }
  labels.push({
    idx: chronologicalRatios.length - 1,
    ts: chronologicalTimestamps[chronologicalTimestamps.length - 1],
  });

  const formatLabel = (ts) => {
    const d = new Date(ts);
    if (interval === "hourly") {
      return d.toISOString().replace("T", " ").slice(0, 16);
    }
    return d.toISOString().split("T")[0];
  };

  const labelTexts = labels.map((l) => formatLabel(l.ts));

  let xAxis = "";
  let prevEnd = 0;
  for (let i = 0; i < labels.length; i++) {
    const { idx } = labels[i];
    const text = labelTexts[i];
    const padding = idx - prevEnd;
    xAxis += " ".repeat(padding) + text;
    prevEnd = idx + text.length;
  }
  return xAxis;
}

/**
 * Prints the chart of the ratios, oldest left, newest right.
 *
 * @param {Array<number>} ratios - The ratios, newest first
 * @param {Array<number>} timestamps - Their times, newest first
 */
function printChart(ratios, timestamps) {
  // Reverse data for chronological order (oldest left → newest right)
  const chronologicalRatios = ratios.slice().reverse();
  const chronologicalTimestamps = timestamps.slice().reverse();

  const minRatio = Math.min(...chronologicalRatios);
  const maxRatio = Math.max(...chronologicalRatios);
  const formatYRaw = yLabelFormat(maxRatio - minRatio);

  const testTicks = generateNiceTicks(minRatio, maxRatio, 10);
  const rawLabels = testTicks.map(formatYRaw);
  const maxLabelLength = Math.max(...rawLabels.map((l) => l.length), 1);

  const formatY = (value) => {
    const raw = formatYRaw(value);
    return raw.padEnd(maxLabelLength, " ");
  };

  const chartConfig = {
    height: 30,
    min: minRatio,
    max: maxRatio,
    format: formatY,
  };

  const chartLines = asciichart
    .plot(chronologicalRatios, chartConfig)
    .split("\n");
  chartLines.forEach((line) => console.log(line));

  const yTickWidth = maxLabelLength + 2;
  const xAxis = xAxisLine(chronologicalRatios, chronologicalTimestamps);
  console.log(" ".repeat(yTickWidth) + xAxis);
}

/**
 * Prints the ratios: the title, the chart or a note that there is one
 * point, the last ten and the current one, and writes the CSV when asked.
 *
 * @param {Array<string>} names - Token A's name and token B's
 * @param {string} source - Where the prices came from
 * @param {{rows: Array<Object>, ratios: Array<number>, timestamps: Array<number>}} series - The ratios
 */
function printRatios(names, source, { rows, ratios, timestamps }) {
  const [tokenAName, tokenBName] = names;
  const pointsText =
    ratios.length === 1 ? "current only" : `${ratios.length} points`;
  const intervalText = useDexToolsOnly ? "current" : interval;

  console.log(
    `\n${tokenAName} / ${tokenBName} ratio (${intervalText}, ${pointsText}) - Source: ${source}`,
  );
  console.log(`C.A.: ${tokenA} / ${tokenB}\n`);

  if (ratios.length > 1) {
    printChart(ratios, timestamps);
  } else {
    console.log("(Single data point - no historical chart available)");
    if (!useDexToolsOnly) {
      console.log(
        "Note: This often occurs with new or low-volume pools. Try a shorter interval.\n",
      );
    }
  }

  console.log("\nRecent ratios (last 10):");
  rows.slice(-10).forEach((r) => console.log(`${r.date}: ${r.ratio}`));
  console.log(`\nCurrent ratio: ${ratios[ratios.length - 1].toFixed(12)}`);

  if (saveCsv) {
    const csv =
      "date,price_tokenA,price_tokenB,ratio\n" +
      rows
        .map((r) => `${r.date},${r.priceA},${r.priceB},${r.ratio}`)
        .join("\n");
    fs.writeFileSync(csvFilename, csv);
    console.log(`\nCSV saved as ${csvFilename}`);
  }
}

/**
 * Main function
 */
async function main() {
  if (!/^0x[a-f0-9]{40}$/.test(tokenA) || !/^0x[a-f0-9]{40}$/.test(tokenB)) {
    console.error("Invalid contract address format.");
    process.exit(1);
  }

  console.log(
    `\nComputing ratio: ${tokenA.slice(0, 8)}... / ${tokenB.slice(0, 8)}... (${interval})\n`,
  );

  const names = useDexToolsOnly ? ["Token A", "Token B"] : await tokenNames();

  const series = await fetchSeries();
  if (!series) return;

  const ratioSeries = ratioRows(series.dataA, series.dataB);
  if (ratioSeries.ratios.length === 0) {
    console.error("No valid ratio data could be computed.");
    return;
  }

  printRatios(names, series.source, ratioSeries);
}

main().catch((err) => console.error("Fatal error:", err.message));
