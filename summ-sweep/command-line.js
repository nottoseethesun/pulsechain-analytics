/**
 * The command line of the sweep of a wallet against Summ:
 * `npm run summ-sweep`.
 * @module summ-sweep/command-line
 *
 * What: sweeps one wallet over a range of dates (`sweepWallet`, in
 * `summ-sweep/sweep.js`) against the pages of Summ's results Claude saved,
 * and writes two files: the csv of rows for Summ, through
 * crypto-price-fetchers' Summ csv utility, the one way such a file is
 * made, and a report, as json, of the splits to fix in Summ, the legs
 * Summ lacks, the questions for the owner about the legs no rule books,
 * Summ's legs no leg matched, and the problems found.
 *
 * How: the chain's facts (endpoint, chain id, position manager, wrapped
 * coin, span of a log search, spacing and size of requests) are in the
 * top `config.json`, which git keeps; the owner's own settings (the path
 * of his Summ template and of his LP Ranger checkout, his own wallets,
 * his spam and income tokens, and each token's symbols in Summ and in a
 * csv) are in `summ-sweep/config.json`, which git ignores, since this
 * repo is public; `summ-sweep/config-example.json` shows its shape. A date is a day in UTC: the range runs from the first
 * block of its first day to the last block of its last. A report's
 * amounts, which are BigInts, are written as decimal text, json having
 * no BigInt.
 *
 * Fit: `summ-sweep.js` at the repo's top runs `runSummSweep`. The tests
 * give it a stand-in chain and a stand-in LP Ranger.
 */

import fs from "node:fs";
import path from "node:path";
import { Command, CommanderError } from "commander";
import { JsonRpcProvider, Network } from "ethers";
import { writeSummCsv } from "crypto-price-fetchers/summ-csv";
import { pacedProvider } from "../wallet-history/paced-provider.js";
import { blockAtOrAfter } from "../wallet-history/blocks.js";
import { parseSummResults } from "./summ-results.js";
import { readThroughLpRanger } from "./lp-ranger.js";
import { sweepWallet } from "./sweep.js";

/** One day, in seconds. */
const DAY = 86400;

/** The end of the help: the two files, and the settings. */
const HELP_AFTER = `
The csv holds the rows for what Summ lacks, written by crypto-price-fetchers'
Summ csv utility; the report, as json, lists the splits to fix in Summ (a
leg holding a withdrawal's principal and fees together), the legs Summ
lacks, the questions about the legs no rule books, Summ's legs no leg
matched, and the problems found. Neither is written over without
--replace.

The chain's facts come from the top config.json, and the owner's settings
from summ-sweep/config.json, which git ignores; summ-sweep/config-example.json
shows its shape.
`;

/**
 * The seconds since 1970 of the start of a day in UTC.
 *
 * @param {string} day - The day, as `YYYY-MM-DD`
 * @returns {number} The seconds
 * @throws {Error} When the text is no real day
 */
export function dayStart(day) {
  const seconds = Date.parse(`${day}T00:00:00Z`) / 1000;
  const back = Number.isFinite(seconds)
    ? new Date(seconds * 1000).toISOString().slice(0, 10)
    : "";
  if (back !== day)
    throw new Error(`"${day}" is not a day written as YYYY-MM-DD`);
  return seconds;
}

/**
 * A value of a report as json writes it: a BigInt as decimal text, a Map
 * as an object, a Set as a list.
 *
 * @param {string} _key - The key, unused
 * @param {*} value - The value
 * @returns {*} What json writes
 */
function jsonValue(_key, value) {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return [...value];
  return value;
}

/**
 * The report of a sweep.
 *
 * @param {object} result - What `sweepWallet` gave
 * @param {object} range - The wallet and its blocks
 * @returns {object} The report
 */
function reportOf(result, range) {
  const summ = (leg) => ({
    actionId: leg.row.actionId,
    transactionIds: leg.row.transactionIds,
    category: leg.row.category,
    amount: leg.amount,
    symbol: leg.symbol,
  });
  return {
    ...range,
    fixes: result.fixes.map(({ summLeg, ...fix }) => ({
      ...fix,
      summ: summ(summLeg),
    })),
    unmatched: result.unmatched.map(({ split: _split, ...leg }) => leg),
    questions: result.questions,
    summUnmatched: result.summUnmatched.map((leg) => ({
      hash: leg.hash,
      direction: leg.direction,
      ...summ(leg),
    })),
    problems: result.problems,
  };
}

/**
 * Writes a file, unless one is there and the run may not replace it.
 *
 * @param {string} file - The file
 * @param {string} text - What to write
 * @param {boolean} replace - Whether to write over a file already there
 */
function writeFile(file, text, replace) {
  fs.writeFileSync(file, text, { flag: replace ? "w" : "wx" });
}

/**
 * Runs the sweep the options describe.
 *
 * @param {object} options - The parsed options
 * @param {object} context - The settings, the output and the stand-ins
 * @returns {Promise<void>} Settles once both files are written
 */
async function sweepWith(options, context) {
  const { chain, owner, say, makeProvider, run } = context;
  const paced = pacedProvider(makeProvider(chain), {
    spacingMs: chain.requestSpacingMs,
  });
  const fromBlock = await blockAtOrAfter(paced, dayStart(options.startDate));
  const toBlock =
    (await blockAtOrAfter(paced, dayStart(options.endDate) + DAY)) - 1;
  const summRows = parseSummResults(
    options.summResults.map((file) => fs.readFileSync(file, "utf8")),
  );
  const result = await sweepWallet(paced, {
    wallet: options.wallet,
    fromBlock,
    toBlock,
    chain,
    owner,
    summRows,
    readRecords: (hashes) =>
      readThroughLpRanger(hashes, {
        lpRangerDir: owner.lpRangerDir,
        wallet: options.wallet,
        rpcEndpoint: chain.rpcEndpoint,
        positionManager: chain.positionManager,
        run,
      }),
  });
  const replace = options.replace === true;
  if (result.rows.length > 0)
    writeSummCsv({
      rows: result.rows,
      templatePath: owner.templatePath,
      outPath: options.out,
      replace,
    });
  const range = { wallet: options.wallet, fromBlock, toBlock };
  writeFile(
    options.report,
    `${JSON.stringify(reportOf(result, range), jsonValue, 2)}\n`,
    replace,
  );
  say(
    `Blocks ${fromBlock} to ${toBlock}: ${result.history.legs.length} token legs, ${result.unmatched.length} legs and parts Summ lacks, ${result.fixes.length} splits to fix in Summ, ${result.questions.length} questions, ${result.problems.length} problems.`,
  );
  say(
    result.rows.length > 0
      ? `Wrote ${result.rows.length} rows to ${options.out}.`
      : `No rows to write, so no csv was written.`,
  );
  say(`Wrote the report to ${options.report}.`);
}

/**
 * Reads a json file of settings.
 *
 * @param {string} file - The file
 * @param {string} missing - What to say when it is not there
 * @returns {object} The settings
 */
function settingsFrom(file, missing) {
  if (!fs.existsSync(file)) throw new Error(missing);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * An ethers provider of the chain's endpoint, which takes the chain's id
 * from the settings rather than asking the endpoint, and gathers requests
 * made together into batches.
 *
 * @param {object} chain - The chain's facts
 * @returns {JsonRpcProvider} The provider
 */
function chainProvider(chain) {
  const network = Network.from(chain.chainId);
  return new JsonRpcProvider(chain.rpcEndpoint, network, {
    staticNetwork: network,
    batchMaxCount: chain.batchSize,
  });
}

/**
 * Runs the command line.
 *
 * @param {string[]} argv - The arguments, as `process.argv` holds them
 * @param {object} [deps] - Stand-ins for the tests: `stdout`, `stderr`,
 *   `repoTop`, the folder whose `config.json` and `summ-sweep/config.json`
 *   are read, `makeProvider`, which makes the chain's provider, and `run`,
 *   which runs LP Ranger's tool
 * @returns {Promise<number>} The exit code: 0 when both files were
 *   written, 1 when they were not
 */
export async function runSummSweep(argv, deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const repoTop = deps.repoTop ?? process.cwd();
  const program = new Command()
    .name("summ-sweep")
    .description(
      "Sweeps a wallet's history on PulseChain against Summ's rows, and writes the rows Summ lacks and a report of what to fix.",
    )
    .requiredOption("--wallet <address>", "the wallet")
    .requiredOption(
      "--start-date <day>",
      "the first day, as YYYY-MM-DD, in UTC",
    )
    .requiredOption("--end-date <day>", "the last day, as YYYY-MM-DD, in UTC")
    .requiredOption(
      "--summ-results <files...>",
      "the saved pages of Summ's results",
    )
    .requiredOption("--out <file>", "the csv to write")
    .requiredOption("--report <file>", "the report to write, as json")
    .option("--replace", "write over files already there")
    .addHelpText("after", HELP_AFTER)
    .exitOverride()
    .configureOutput({
      writeOut: (text) => stdout.write(text),
      writeErr: (text) => stderr.write(text),
    });
  try {
    program.parse(argv);
    const chain = settingsFrom(
      path.join(repoTop, "config.json"),
      "The top config.json is missing",
    ).pulsechain;
    const owner = settingsFrom(
      path.join(repoTop, "summ-sweep", "config.json"),
      "summ-sweep/config.json is missing: copy summ-sweep/config-example.json to it and fill it in",
    );
    await sweepWith(program.opts(), {
      chain,
      owner,
      say: (line) => stdout.write(`${line}\n`),
      makeProvider: deps.makeProvider ?? chainProvider,
      run: deps.run,
    });
  } catch (thrown) {
    if (thrown instanceof CommanderError) return thrown.exitCode;
    stderr.write(
      `${thrown instanceof Error ? thrown.message : String(thrown)}\n`,
    );
    return 1;
  }
  return 0;
}
