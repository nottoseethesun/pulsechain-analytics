/**
 * pulse-token-ratio.js
 *
 * Charts the ratio of two PulseChain tokens' prices (Token A / Token B) over
 * time, in one ASCII chart in the terminal, whether or not a pool pairs the
 * two tokens.
 *
 * How it works:
 *  - A run reads its candles, the open, high, low and close prices and the
 *    volume of each interval, from one of two sources (ratio-source.js):
 *    GeckoTerminal, whose api is free and takes no key, or Moralis, with
 *    the Moralis api key saved in the repo's key store. With no Moralis key
 *    saved, it reads GeckoTerminal's. With one saved, it asks at the
 *    terminal which to read, Enter taking Moralis, unless --source names
 *    one; with no terminal to ask at, it stops and names --source.
 *  - From GeckoTerminal, through crypto-price-fetchers' GeckoTerminal
 *    client (gecko-terminal.js): pool-selector.js picks each token's pool,
 *    the one with the most liquidity, unless it has less than half the
 *    history of the deepest of the five that hold the most value, as that
 *    file's header explains; the chart fetches each token's own candles in
 *    its pool, named by its address, whichever side of the pool it is on,
 *    priced in USD, as far back as GeckoTerminal's free api serves, about
 *    184 days.
 *  - From Moralis, through crypto-price-fetchers' Moralis client
 *    (moralis.js): each token's pair is the deepest active one that lists
 *    the token first, since Moralis's candles of a pair price that token;
 *    the chart reads two years of its daily candles, or the days
 *    --moralis-days names, and checks that the token Moralis priced is the
 *    chart's.
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
 * Fallback: when the candles cannot be had from the run's source, the chart
 * takes the two tokens' current USD prices from DexTools, through
 * crypto-price-fetchers' DexTools client, with the DexTools api key saved,
 * encrypted, in the repo's key store (`api-keys.js`). An api key is no
 * setting and no command-line argument.
 *
 * The code: this file reads config.json and runs the command line, which
 * `ratio-command.js` declares with commander; `ratio-source.js` settles the
 * source; `ratio-series.js` fetches the prices and works out the ratios;
 * `ratio-output.js` prints them.
 *
 * Installation:
 *   1. Ensure Node.js v24+ is installed.
 *   2. Run: npm install
 *   3. (Optional) Edit config.json
 *   4. (Optional) For two years of daily candles from Moralis, save a
 *      Moralis api key, and for the DexTools fallback, a DexTools api key,
 *      in the repo's top folder: npm run api-keys. The chart opens each the
 *      first time it asks that service, with the password that
 *      `source ./unlock-api-keys.sh` keeps for the terminal, or one it asks
 *      for.
 *
 * Configuration:
 *   - All settings are loaded from config.json in the same directory, and
 *     checked against their JSON Schema, `RATIO_SETTINGS_SCHEMA` in
 *     `ratio-command.js`, before any is taken: a key the schema does not
 *     name, or a value of the wrong kind, stops the run, with every problem
 *     listed.
 *   - Command-line options override them for one run:
 *     node pulse-token-ratio.js --help lists them, each with its default.
 *     A typed option meets the rule its setting meets in config.json, and
 *     `--source` is refused beside a `useDexToolsOnly` the file sets.
 *
 * Requirements:
 *   Node.js v24+ (native fetch, ESM support)
 *   npm install, for asciichart, commander and crypto-price-fetchers' key store and clients
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
 *   # Two years of daily candles from Moralis, without the question of the source
 *   node pulse-token-ratio.js <tokenA> <tokenB> --source moralis
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
 *  - For Moralis's candles and the DexTools fallback, save their api keys with npm run api-keys, in the repo's top folder.
 *  - Intervals finer than 'hourly' are not supported by GeckoTerminal, and are refused.
 *  - The chart spans at least 90 columns (MIN_CHART_COLUMNS, ratio-output.js),
 *    for its dates' room: a series of fewer points is drawn with each point
 *    widened, joined by straight lines. GeckoTerminal's free api serves
 *    about the last 184 days of candles: 184 daily points, but at most 27
 *    weekly ones, which a weekly run from GeckoTerminal says before its
 *    chart.
 *  - A source can make no candle for a period in which nothing traded, as
 *    GeckoTerminal does, so a point is a time both pools have a candle for;
 *    the two tokens' prices are paired by time.
 *  - Y-scale automatically computes unique tick values using a nice number algorithm.
 *  - X-scale shows sparse timestamps perfectly aligned with chart columns — chronological order (oldest left → newest right).
 *  - CSV includes columns: date, price_tokenA, price_tokenB, ratio.
 *  - Edit config.json for persistent changes; use flags for one-off overrides.
 *  - Exit codes: 0 when the ratios were printed; 1 when none were, from a
 *    mistake in the arguments or in config.json, no source chosen, no
 *    prices, or a failed request.
 */

import path from "path";
import { fileURLToPath } from "url";

import { readSettingsFile } from "crypto-price-fetchers/lib/settings-file";
import { keySaved, openKey, SAVE_KEY_HELP } from "./api-keys.js";
import { buildRatioCommand, ratioSettings } from "./ratio-command.js";
import { printRatios } from "./ratio-output.js";
import { fetchSeries, ratioRows } from "./ratio-series.js";
import { askAtTerminal, chooseSource } from "./ratio-source.js";
import { endQuietlyWhenOutputCloses } from "crypto-price-fetchers/lib/closed-output";

/**
 * Reads config.json, beside this file, with crypto-price-fetchers'
 * `readSettingsFile`, and builds the command line from it, which checks the
 * settings against their JSON Schema first (`ratio-command.js`); or stops
 * the run, with exit code 1 and every problem listed, when either cannot be
 * done.
 *
 * @returns {import('commander').Command} The command, without its action
 */
function ratioCommand() {
  const configPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "config.json",
  );
  try {
    return buildRatioCommand(readSettingsFile(configPath, { required: true }));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

/** Warns, as a run starts, when no DexTools api key is saved. */
function warnWhenNoKeySaved() {
  if (keySaved("dextools")) return;
  console.warn("\n⚠️  No DexTools API key is saved.");
  console.warn(
    "   → Fallback to current prices will not be available if the candles cannot be had.",
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
  const run = {
    ...settings,
    moralisKey: once(() => openKey("moralis")),
    dexToolsKey: once(() => openKey("dextools")),
  };
  console.log(
    `\nComputing ratio: ${run.tokenA.slice(0, 8)}... / ${run.tokenB.slice(0, 8)}... (${run.interval})\n`,
  );

  const series = await fetchSeries(run);
  if (series === null) return false;

  const ratioSeries = ratioRows(series.dataA, series.dataB);
  if (ratioSeries.ratios.length === 0) {
    console.error("No valid ratio data could be computed.");
    return false;
  }

  printRatios(run, series.names, series.source, ratioSeries);
  return true;
}

/**
 * Settles where the run reads its candles, unless it asks DexTools alone,
 * or stops the run, naming what to do, when it cannot.
 *
 * @param {Object} settings - The run's settings (`ratioSettings`)
 * @param {import('commander').Command} command - The command, to stop the run with
 * @returns {Promise<(string|undefined)>} 'moralis' or 'geckoterminal', or undefined in DexTools-only mode
 */
async function settleSource(settings, command) {
  if (settings.useDexToolsOnly) return undefined;
  try {
    return await chooseSource({
      requested: settings.source,
      moralisKeySaved: keySaved("moralis"),
      canAsk: process.stdin.isTTY === true && process.stderr.isTTY === true,
      ask: askAtTerminal,
      settings,
    });
  } catch (err) {
    command.error(err.message);
  }
}

endQuietlyWhenOutputCloses();
await ratioCommand()
  .action(async (tokenA, tokenB, interval, options, command) => {
    const settings = ratioSettings(tokenA, tokenB, interval, options);
    warnWhenNoKeySaved();
    const source = await settleSource(settings, command);
    try {
      process.exitCode = (await chartRatio({ ...settings, source })) ? 0 : 1;
    } catch (err) {
      console.error("Fatal error:", err.message);
      process.exitCode = 1;
    }
  })
  .parseAsync(process.argv);
