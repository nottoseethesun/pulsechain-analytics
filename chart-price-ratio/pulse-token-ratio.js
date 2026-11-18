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
 * The code: this file reads config.json and runs the command line, which
 * `ratio-command.js` declares with commander; `ratio-series.js` fetches the
 * prices and works out the ratios; `ratio-output.js` prints them.
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
 *   - Command-line options override them for one run:
 *     node pulse-token-ratio.js --help lists them, each with its default.
 *
 * Requirements:
 *   Node.js v22+ (native fetch, ESM support)
 *   npm install, for asciichart, commander and crypto-price-fetchers' key store
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
 *  - Token addresses are 0x and 40 hex digits, in either case.
 *  - For DexTools fallback, save a DexTools api key with npm run api-keys, in the repo's top folder.
 *  - Intervals finer than 'hourly' are not supported by GeckoTerminal, and are refused.
 *  - A chart needs at least 90 points (MIN_CHART_POINTS, ratio-output.js). Fewer
 *    stop the run with a message, before anything is printed; a shorter
 *    interval gives more points.
 *  - Y-scale automatically computes unique tick values using a nice number algorithm.
 *  - X-scale shows sparse timestamps perfectly aligned with chart columns — chronological order (oldest left → newest right).
 *  - CSV includes columns: date, price_tokenA, price_tokenB, ratio.
 *  - Edit config.json for persistent changes; use flags for one-off overrides.
 *  - Exit codes: 0 when the ratios were printed; 1 when none were, from a
 *    mistake in the arguments, too few points, no prices, or a failed request.
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
import {
  MIN_CHART_POINTS,
  printRatios,
  tooFewPointsMessage,
} from "./ratio-output.js";
import { fetchSeries, ratioRows, tokenNames } from "./ratio-series.js";

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
  const count = ratioSeries.ratios.length;
  if (count === 0) {
    console.error("No valid ratio data could be computed.");
    return false;
  }
  if (count > 1 && count < MIN_CHART_POINTS) {
    console.error(tooFewPointsMessage(count, run.interval));
    return false;
  }

  printRatios(run, names, series.source, ratioSeries);
  return true;
}

const config = readConfig();

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
