/**
 * The ratio chart's command line, declared with commander: its arguments,
 * its options, whose defaults come from config.json, and its help.
 * @module chart-price-ratio/ratio-command
 *
 * `buildRatioCommand` builds the command anew for each parse, so a test
 * can parse several argument lists. It first checks config.json's settings
 * against `RATIO_SETTINGS_SCHEMA`, their JSON Schema, built from
 * crypto-price-fetchers' kinds of value
 * (`crypto-price-fetchers/lib/settings-schema`), as LP Ranger checks its
 * settings: a key the schema does not name, or a value of the wrong kind,
 * is refused, with every problem listed, before any default is taken. Each
 * typed value is checked as it is parsed, by a parser made from the kind
 * the schema gives the same setting, so a mistake names its argument or
 * option, on stderr, and stops the run, with exit code 1, before
 * GeckoTerminal, Moralis or DexTools is asked anything. Commander refuses
 * two conflicting options only when both are typed, so a hook before the
 * action refuses, with crypto-price-fetchers' `checkConflicts`
 * (`crypto-price-fetchers/lib/option-conflicts`), `--source` beside a
 * `useDexToolsOnly` that config.json sets.
 * `--help` prints the help on stdout, with exit code 0. The message for an
 * option it does not know names the option alone, without what follows its
 * `=`, which may be a secret, such as an api key typed where none is taken.
 * `ratioCommandFrom` builds the command from the settings a function reads,
 * and when they are refused, builds it from the defaults written here, so
 * `--help` still answers, and stops every other run, before its action, on
 * the settings' problems. `ratioSettings` gathers what was parsed into the
 * run's settings.
 */

import { Argument, Command, InvalidArgumentError, Option } from "commander";
import { checkConflicts } from "crypto-price-fetchers/lib/option-conflicts";
import {
  asWholeNumber,
  compileSettingsSchema,
  KINDS,
  kindParser,
  settingsProblems,
} from "crypto-price-fetchers/lib/settings-schema";
import { SOURCES } from "./ratio-source.js";

/** The intervals the chart offers: weekly is built from daily candles. */
export const INTERVALS = Object.freeze(["hourly", "daily", "weekly"]);

/**
 * The JSON Schema of config.json: each setting the chart reads, of its
 * kind, every one of which may be left out for its default, and no other
 * key.
 */
export const RATIO_SETTINGS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    network: KINDS.text,
    chain: KINDS.text,
    dextools: {
      type: "object",
      additionalProperties: false,
      properties: {
        subscription: KINDS.text,
        host: KINDS.url,
        version: KINDS.text,
      },
      description: "DexTools' plan, address and version",
    },
    moralis: {
      type: "object",
      additionalProperties: false,
      properties: { chain: KINDS.text, days: KINDS.wholeAbove0 },
      description: "Moralis's chain and days",
    },
    csvFilename: KINDS.text,
    interval: {
      enum: [...INTERVALS],
      description: `one of ${INTERVALS.join(", ")}`,
    },
    maxCandles: KINDS.wholeAbove0,
    weeklyResampleDays: KINDS.wholeAbove0,
    useDexToolsOnly: KINDS.bool,
  },
});

/** `RATIO_SETTINGS_SCHEMA`, compiled. */
const checkSettings = compileSettingsSchema(RATIO_SETTINGS_SCHEMA);

/**
 * The parsers of the options that take a number, an url or text, made from
 * the kinds config.json's schema gives the same settings.
 */
const PARSE = Object.freeze({
  wholeAbove0: kindParser(KINDS.wholeAbove0, asWholeNumber),
  url: kindParser(KINDS.url),
  text: kindParser(KINDS.text),
});

/** What the help says after the options. */
const HELP_AFTER = `
Each option's default is set in config.json, beside this file. When
config.json is refused, the help shows the defaults written in
ratio-command.js, and any other run stops: on a mistake in its arguments
when it has one, else on the file's problems.

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
  1  no ratios were printed: a mistake in the arguments or in config.json,
     no source chosen, no prices to be had, or a request that failed`;

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
 * Builds the command line, once config.json's settings hold to
 * `RATIO_SETTINGS_SCHEMA`.
 *
 * @param {Object} config - config.json's settings, the options' defaults
 * @returns {import('commander').Command} The command, without its action
 * @throws {Error} When the settings have a problem the schema finds, every problem listed
 */
export function buildRatioCommand(config) {
  const problems = settingsProblems("config.json", checkSettings, config);
  if (problems.length > 0) {
    throw Object.assign(new Error(problems.join("\n")), { problems });
  }
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
      PARSE.text,
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
      config.useDexToolsOnly ?? false,
    )
    .option(
      "--network <network>",
      "GeckoTerminal's name for the network",
      PARSE.text,
      config.network ?? "pulsechain",
    )
    .option(
      "--chain <chain>",
      "DexTools' name for the chain",
      PARSE.text,
      config.chain ?? "pulse",
    )
    .option(
      "--moralis-chain <chain>",
      "Moralis's id for the chain",
      PARSE.text,
      moralis.chain ?? "0x171",
    )
    .option(
      "--moralis-days <number>",
      "the days of daily candles a run reads from Moralis",
      PARSE.wholeAbove0,
      moralis.days ?? 730,
    )
    .option(
      "--subscription <plan>",
      "the DexTools plan",
      PARSE.text,
      dextools.subscription ?? "standard",
    )
    .option(
      "--host <url>",
      "DexTools' api address",
      PARSE.url,
      dextools.host ?? "https://public-api.dextools.io",
    )
    .option(
      "--version <version>",
      "DexTools' api version",
      PARSE.text,
      dextools.version ?? "v2",
    )
    .option(
      "--max-candles <number>",
      "the most candles to fetch from each pool at GeckoTerminal, and the hours an hourly run reads from Moralis",
      PARSE.wholeAbove0,
      config.maxCandles ?? 1000,
    )
    .option(
      "--weekly-days <number>",
      "the days in each point of the weekly chart",
      PARSE.wholeAbove0,
      config.weeklyResampleDays ?? 7,
    )
    .hook("preAction", (command) => checkConflicts(command, "config.json"))
    .addHelpText("after", HELP_AFTER)
    .configureOutput({
      outputError: (message, write) =>
        write(message.replace(/'(-[^'=\s]+)=[^']*'/g, "'$1'")),
    });
}

/**
 * Builds the command line from the settings `readConfig` gives. When
 * reading them fails, or the schema refuses them, it builds the command
 * from the defaults written here, with a hook before the action that stops
 * the run, with exit code 1 and every problem listed: `--help` still
 * prints the help, and a mistake in the arguments is still named first.
 *
 * @param {function(): Object} readConfig - Reads config.json's settings
 * @returns {import('commander').Command} The command, without its action
 */
export function ratioCommandFrom(readConfig) {
  try {
    return buildRatioCommand(readConfig());
  } catch (err) {
    return buildRatioCommand({}).hook("preAction", (command) =>
      command.error(`Error: ${err.message}`),
    );
  }
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
