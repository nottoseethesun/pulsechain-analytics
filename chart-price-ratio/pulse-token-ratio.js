/**
 * pulse-token-ratio.js
 *
 * Charts the ratio of two PulseChain tokens' prices (Token A / Token B) over
 * time, in one ASCII chart in the terminal, whether or not a pool pairs the
 * two tokens.
 *
 * How it works:
 *  - It asks GeckoTerminal, whose api is free and takes no key, through
 *    crypto-price-fetchers' GeckoTerminal client (gecko-terminal.js), for
 *    each token's pools and their candles: the open, high, low and close
 *    prices and the volume of each interval.
 *  - pool-selector.js picks each token's pool: the one with the most
 *    liquidity, unless it has less than half the history of the deepest of
 *    the five that hold the most value, as that file's header explains.
 *  - It fetches each token's own candles in its pool, named by its address,
 *    whichever side of the pool it is on, priced in USD.
 *  - Each point's ratio is price_A_in_USD / price_B_in_USD.
 *  - The intervals are hourly, daily and weekly.
 *  - The chart (ratio-output.js):
 *    • The y-axis' labels are the multiples of a step of 1, 2 or 5 times a
 *      power of ten that span the lowest ratio to the highest
 *      (generateNiceTicks.js), each rounded to 6, 8, 10 or 12 decimals,
 *      more for a narrower range, with trailing zeros dropped; the labels
 *      of a range under 0.00001 are written in scientific notation.
 *    • Each y-axis label is padded with spaces to the length of the
 *      longest, so the axis lines up.
 *    • The x-axis carries up to 10 dates, with the hour for the hourly
 *      interval, each under its column, the oldest at the left.
 *  - --csv also writes the ratios to a CSV file.
 *  - --useDexToolsOnly, or useDexToolsOnly in config.json, asks DexTools
 *    alone, for the current prices, as the fallback below does.
 *
 * Fallback: If GeckoTerminal fails, uses current USD prices via DexTools v2 API,
 * with the DexTools api key saved, encrypted, in the repo's key store
 * (`dextools.js`). An api key is no setting and no command-line argument.
 *
 * The code: this file reads config.json and runs the command line, which
 * `ratio-command.js` declares with commander; `ratio-series.js` fetches the
 * prices and works out the ratios; `ratio-output.js` prints them.
 *
 * Installation:
 *   1. Ensure Node.js v24+ is installed.
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
 *   - Command-line options override them for one run:
 *     node pulse-token-ratio.js --help lists them, each with its default.
 *
 * Requirements:
 *   Node.js v24+ (native fetch, ESM support)
 *   npm install, for asciichart, commander and crypto-price-fetchers' key store
 *
 * Usage Examples:
 *   # Basic: daily ratio (default) for two tokens
 *   node pulse-token-ratio.js 0x50F1ca62e6Fb8Adf438ca1F50067AB83670094A6 0x94534EeEe131840b1c0F61847c572228bdfDDE93
 *
 *   # Specify interval
 *   node pulse-token-ratio.js <tokenA> <tokenB> daily
 *   node pulse-token-ratio.js <tokenA> <tokenB> hourly
 *
 *   # With CSV export
 *   node pulse-token-ratio.js <tokenA> <tokenB> daily --csv
 *
 *   # Test DexTools fallback directly
 *   node pulse-token-ratio.js <tokenA> <tokenB> --useDexToolsOnly
 *
 *   # Override config values via flags
 *   node pulse-token-ratio.js <tokenA> <tokenB> --network=eth --csv-filename=custom.csv --csv
 *
 *   # Combine interval and overrides
 *   node pulse-token-ratio.js <tokenA> <tokenB> hourly --max-candles=500 --csv
 *
 * Notes:
 *  - Token addresses are 0x and 40 hex digits, in either case.
 *  - For DexTools fallback, save a DexTools api key with npm run api-keys, in the repo's top folder.
 *  - Intervals finer than 'hourly' are not supported by GeckoTerminal, and are refused.
 *  - The chart spans at least 90 columns (MIN_CHART_COLUMNS, ratio-output.js),
 *    for its dates' room: a series of fewer points is drawn with each point
 *    widened, joined by straight lines. GeckoTerminal's free api serves
 *    about the last 184 days of candles: 184 daily points, but at most 27
 *    weekly ones, which a weekly run says before its chart.
 *  - GeckoTerminal makes no candle for a period in which nothing traded, so
 *    a point is a time both pools have a candle for; the two tokens' prices
 *    are paired by time.
 *  - Y-scale automatically computes unique tick values using a nice number algorithm.
 *  - X-scale shows sparse timestamps perfectly aligned with chart columns — chronological order (oldest left → newest right).
 *  - CSV includes columns: date, price_tokenA, price_tokenB, ratio.
 *  - Edit config.json for persistent changes; use flags for one-off overrides.
 *  - Exit codes: 0 when the ratios were printed; 1 when none were, from a
 *    mistake in the arguments, no prices, or a failed request.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  dexToolsKeySaved,
  openDexToolsKey,
  SAVE_KEY_HELP,
} from "./dextools.js";
import {
  buildRatioCommand,
  INTERVALS,
  ratioSettings,
} from "./ratio-command.js";
import { printRatios } from "./ratio-output.js";
import { fetchSeries, ratioRows, tokenNames } from "./ratio-series.js";
import { endQuietlyWhenOutputCloses } from "crypto-price-fetchers/lib/closed-output";

/**
 * Reads config.json, beside this file, or stops the run when it cannot.
 *
 * @returns {Object} The settings
 */
function readConfig() {
  const configPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "config.json",
  );
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (err) {
    console.error("Error loading config.json:", err.message);
    process.exit(1);
  }
}

/** Warns, as a run starts, when no DexTools api key is saved. */
function warnWhenNoKeySaved() {
  if (dexToolsKeySaved()) return;
  console.warn("\n⚠️  No DexTools API key is saved.");
  console.warn(
    "   → Fallback to current prices will not be available if GeckoTerminal fails.",
  );
  console.warn(`   → ${SAVE_KEY_HELP}`);
  console.warn("   → Get a key at: https://developers.dextools.io/\n");
}

/**
 * Makes a function that opens something the first time it is called, and
 * gives the same opening every time after.
 *
 * @param {function(): Promise<*>} open - Opens it
 * @returns {function(): Promise<*>} The function
 */
function once(open) {
  let opening = null;
  return () => {
    opening ??= open();
    return opening;
  };
}

/**
 * Charts the ratio of the two tokens' prices.
 *
 * @param {Object} settings - The run's settings (`ratioSettings`)
 * @returns {Promise<boolean>} Whether it printed the ratios
 */
async function chartRatio(settings) {
  const run = { ...settings, dexToolsKey: once(() => openDexToolsKey()) };
  console.log(
    `\nComputing ratio: ${run.tokenA.slice(0, 8)}... / ${run.tokenB.slice(0, 8)}... (${run.interval})\n`,
  );

  const names = run.useDexToolsOnly
    ? ["Token A", "Token B"]
    : await tokenNames(run);

  const series = await fetchSeries(run);
  if (series === null) return false;

  const ratioSeries = ratioRows(series.dataA, series.dataB);
  if (ratioSeries.ratios.length === 0) {
    console.error("No valid ratio data could be computed.");
    return false;
  }

  printRatios(run, names, series.source, ratioSeries);
  return true;
}

const config = readConfig();

endQuietlyWhenOutputCloses();
await buildRatioCommand(config)
  .action(async (tokenA, tokenB, interval, options, command) => {
    const settings = ratioSettings(tokenA, tokenB, interval, options);
    if (!INTERVALS.includes(settings.interval)) {
      command.error(
        `config.json's interval must be one of ${INTERVALS.join(", ")}.`,
      );
    }
    warnWhenNoKeySaved();
    try {
      process.exitCode = (await chartRatio(settings)) ? 0 : 1;
    } catch (err) {
      console.error("Fatal error:", err.message);
      process.exitCode = 1;
    }
  })
  .parseAsync(process.argv);
