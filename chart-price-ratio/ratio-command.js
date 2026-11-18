/**
 * The ratio chart's command line, declared with commander: its arguments,
 * its options, whose defaults come from config.json, and its help.
 * @module chart-price-ratio/ratio-command
 *
 * `buildRatioCommand` builds the command anew for each parse, so a test
 * can parse several argument lists. Each value is checked as it is parsed,
 * so a mistake names its argument or option, on stderr, and stops the run,
 * with exit code 1, before GeckoTerminal or DexTools is asked anything.
 * `--help` prints the help on stdout, with exit code 0. The message for an
 * option it does not know names the option alone, without what follows its
 * `=`, which may be a secret, such as an api key typed where none is taken.
 * `ratioSettings` gathers what was parsed into the run's settings.
 */

import { Argument, Command, InvalidArgumentError, Option } from "commander";

/** The intervals GeckoTerminal's candles serve. */
export const INTERVALS = Object.freeze(["hourly", "daily", "weekly"]);

/** What the help says after the options. */
const HELP_AFTER = `
Each option's default is set in config.json, beside this file.

The DexTools fallback asks with the DexTools api key saved, encrypted, in
the repo's key store. To save one, in the repo's top folder:
  npm run api-keys

Exit codes:
  0  the ratios were printed
  1  no ratios were printed: a mistake in the arguments, fewer points than
     the chart needs, no prices to be had, or a request that failed`;

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
 * Builds the command line.
 *
 * @param {Object} config - config.json's settings, the options' defaults
 * @returns {import('commander').Command} The command, without its action
 */
export function buildRatioCommand(config) {
  const dextools = config.dextools ?? {};
  return new Command("pulse-token-ratio")
    .description(
      "Charts the ratio of two PulseChain tokens' prices over time, in the terminal: from GeckoTerminal's candles, or, when those cannot be had, from DexTools' current prices.",
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
        .default(config.interval ?? "weekly"),
    )
    .option("--csv", "also write the ratios to a CSV file", false)
    .option(
      "--csv-filename <file>",
      "the CSV file",
      config.csvFilename ?? "token_ratio.csv",
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
      "--subscription <plan>",
      "the DexTools plan",
      dextools.subscription ?? "standard",
    )
    .option(
      "--host <url>",
      "DexTools' api address",
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
 * @returns {Object} The settings: the tokens, the interval, the CSV, the mode, GeckoTerminal's network, DexTools' address, plan, version and chain, and the candles to fetch
 */
export function ratioSettings(tokenA, tokenB, interval, options) {
  return {
    tokenA,
    tokenB,
    interval: interval ?? options.interval,
    saveCsv: options.csv,
    csvFilename: options.csvFilename,
    useDexToolsOnly: options.useDexToolsOnly,
    network: options.network,
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
