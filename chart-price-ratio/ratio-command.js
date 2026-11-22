/**
 * The ratio chart's command line, declared with commander: its arguments,
 * its options, whose defaults come from config.json, and its help.
 * @module chart-price-ratio/ratio-command
 *
 * `buildRatioCommand` builds the command anew for each parse, so a test
 * can parse several argument lists. Each value is checked as it is parsed,
 * so a mistake names its argument or option, on stderr, and stops the run,
 * with exit code 1, before GeckoTerminal, Moralis or DexTools is asked
 * anything.
 * `--help` prints the help on stdout, with exit code 0. The message for an
 * option it does not know names the option alone, without what follows its
 * `=`, which may be a secret, such as an api key typed where none is taken.
 * `ratioSettings` gathers what was parsed into the run's settings.
 */

import { Argument, Command, InvalidArgumentError, Option } from "commander";
import { isHttpUrl } from "crypto-price-fetchers/lib/http-url";
import { SOURCES } from "./ratio-source.js";

/** The intervals GeckoTerminal's candles serve. */
export const INTERVALS = Object.freeze(["hourly", "daily", "weekly"]);

/** What the help says after the options. */
const HELP_AFTER = `
Each option's default is set in config.json, beside this file.

The candles come from GeckoTerminal, which takes no key, or from Moralis,
which reads two years of daily candles unless --moralis-days names another
span, with the Moralis api key saved, encrypted, in the repo's key store.
With a Moralis key saved, a run asks at the terminal which of the two to
read, Enter taking Moralis, unless --source names one; a run with no
terminal to ask at stops unless --source names one. When the candles
cannot be had, the chart falls back to DexTools' current prices, with the
DexTools api key saved in the same store. To save a key, in the repo's top
folder:
  npm run api-keys

Examples:
  The ratio of HEX's price to wrapped PLS's, day by day, with the defaults
  of config.json:
    $ node pulse-token-ratio.js 0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39 0xA1077a294dDE1B09bB078844df40758a5D0f9a27
  The same ratio hour by hour, also written to a CSV file:
    $ node pulse-token-ratio.js 0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39 0xA1077a294dDE1B09bB078844df40758a5D0f9a27 hourly --csv
  The first chart, through npm, from this folder:
    $ npm start -- 0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39 0xA1077a294dDE1B09bB078844df40758a5D0f9a27
  The daily ratio over the last two years, from Moralis, without the
  question of the source:
    $ node pulse-token-ratio.js 0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39 0xA1077a294dDE1B09bB078844df40758a5D0f9a27 --source moralis

Exit codes:
  0  the ratios were printed
  1  no ratios were printed: a mistake in the arguments, no prices to be
     had, or a request that failed`;

/**
 * Checks a contract address, as commander parses it.
 *
 * @param {string} value - The address typed
 * @returns {string} The address, in lowercase
 * @throws {InvalidArgumentError} When it is not 0x and 40 hex digits
 */
function contractAddress(value) {
  const address = value.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    throw new InvalidArgumentError(
      "Not a contract address, which is 0x and 40 hex digits.",
    );
  }
  return address;
}

/**
 * Checks a whole number above 0, as commander parses it.
 *
 * @param {string} value - The number typed
 * @returns {number} The number
 * @throws {InvalidArgumentError} When it is not a whole number above 0
 */
function positiveInteger(value) {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new InvalidArgumentError("Not a whole number above 0.");
  }
  return Number(value);
}

/**
 * Checks DexTools' api address, as commander parses it.
 *
 * @param {string} value - The address typed
 * @returns {string} The address
 * @throws {InvalidArgumentError} When it is not an http or https url
 */
function httpUrl(value) {
  if (!isHttpUrl(value)) {
    throw new InvalidArgumentError("Not an http or https url.");
  }
  return value;
}

/**
 * Builds the command line.
 *
 * @param {Object} config - config.json's settings, the options' defaults
 * @returns {import('commander').Command} The command, without its action
 */
export function buildRatioCommand(config) {
  const dextools = config.dextools ?? {};
  const moralis = config.moralis ?? {};
  return new Command("pulse-token-ratio")
    .description(
      "Charts the ratio of two PulseChain tokens' prices over time, in the terminal: from Moralis's or GeckoTerminal's candles, or, when those cannot be had, from DexTools' current prices.",
    )
    .argument("<tokenA>", "token A's contract address", contractAddress)
    .argument("<tokenB>", "token B's contract address", contractAddress)
    .addArgument(
      new Argument(
        "[interval]",
        "the candles' interval, in place of --interval",
      ).choices(INTERVALS),
    )
    .addOption(
      new Option("--interval <interval>", "the candles' interval")
        .choices(INTERVALS)
        .default(config.interval ?? "daily"),
    )
    .option("--csv", "also write the ratios to a CSV file", false)
    .option(
      "--csv-filename <file>",
      "the CSV file",
      config.csvFilename ?? "token_ratio.csv",
    )
    .addOption(
      new Option(
        "--source <source>",
        "where the candles come from, in place of the question a run asks when a Moralis api key is saved",
      )
        .choices(SOURCES)
        .conflicts("useDexToolsOnly"),
    )
    .option(
      "--useDexToolsOnly",
      "ask DexTools alone, for the current prices",
      config.useDexToolsOnly === true,
    )
    .option(
      "--network <network>",
      "GeckoTerminal's name for the network",
      config.network ?? "pulsechain",
    )
    .option(
      "--chain <chain>",
      "DexTools' name for the chain",
      config.chain ?? "pulse",
    )
    .option(
      "--moralis-chain <chain>",
      "Moralis's id for the chain",
      moralis.chain ?? "0x171",
    )
    .option(
      "--moralis-days <number>",
      "the days of daily candles a run reads from Moralis",
      positiveInteger,
      moralis.days ?? 730,
    )
    .option(
      "--subscription <plan>",
      "the DexTools plan",
      dextools.subscription ?? "standard",
    )
    .option(
      "--host <url>",
      "DexTools' api address",
      httpUrl,
      dextools.host ?? "https://public-api.dextools.io",
    )
    .option(
      "--version <version>",
      "DexTools' api version",
      dextools.version ?? "v2",
    )
    .option(
      "--max-candles <number>",
      "the most candles to fetch from each pool",
      positiveInteger,
      config.maxCandles ?? 1000,
    )
    .option(
      "--weekly-days <number>",
      "the days in each point of the weekly chart",
      positiveInteger,
      config.weeklyResampleDays ?? 7,
    )
    .addHelpText("after", HELP_AFTER)
    .configureOutput({
      outputError: (message, write) =>
        write(message.replace(/'(-[^'=\s]+)=[^']*'/g, "'$1'")),
    });
}

/**
 * Gathers what was parsed into the run's settings.
 *
 * @param {string} tokenA - Token A's address
 * @param {string} tokenB - Token B's address
 * @param {string|undefined} interval - The interval given as an argument, if any
 * @param {Object} options - The options, as commander parsed them
 * @returns {Object} The settings: the tokens, the interval, the CSV, the source asked for, if any, the mode, GeckoTerminal's network, Moralis's chain and days, DexTools' address, plan, version and chain, and the candles to fetch
 */
export function ratioSettings(tokenA, tokenB, interval, options) {
  return {
    tokenA,
    tokenB,
    interval: interval ?? options.interval,
    saveCsv: options.csv,
    csvFilename: options.csvFilename,
    source: options.source,
    useDexToolsOnly: options.useDexToolsOnly,
    network: options.network,
    moralis: { chain: options.moralisChain, days: options.moralisDays },
    maxCandles: options.maxCandles,
    weeklyResampleDays: options.weeklyDays,
    dexTools: {
      host: options.host,
      subscription: options.subscription,
      version: options.version,
      chain: options.chain,
    },
  };
}
