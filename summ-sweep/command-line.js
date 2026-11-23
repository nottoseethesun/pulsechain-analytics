/**
 * The command line of the sweep of a wallet against Summ:
 * `npm run summ-sweep`.
 * @module summ-sweep/command-line
 *
 * What: sweeps one wallet over a range of days (`sweepWallet`, in
 * `summ-sweep/sweep.js`) against the pages of Summ's results Claude saved,
 * and writes two files: the csv of rows for Summ, through
 * crypto-price-fetchers' Summ csv utility, the one way such a file is
 * made, and a report, as json, of the splits to fix in Summ, the legs
 * Summ lacks, the questions for the owner about the legs no rule books,
 * Summ's legs no leg matched, and the problems found.
 *
 * How: each option is checked as it is parsed: the wallet is an address,
 * put in EIP-55's mixed case; each day is a real day, in UTC; the time
 * Summ's sync reached is a real time, in UTC; each file of Summ's pages
 * exists; and each file the sweep writes is no folder, in a folder that
 * exists and takes a new file. Then the options are checked against each
 * other: `--out` and `--report` name two files, and `--end-date` names
 * no day before `--start-date`'s. A mistake there is
 * refused before anything is read, with the option named. The chain's
 * facts (endpoint, chain id, position manager, wrapped coin, span of a
 * log search, spacing and size of requests) are in the top `config.json`,
 * which git keeps; the owner's own settings (the path of his Summ
 * template and of his LP Ranger checkout, his own wallets, his spam and
 * income tokens, and each token's symbols in Summ and in a csv) are in
 * `summ-sweep/config.json`, which git ignores, since this repo is public;
 * `summ-sweep/config-example.json` shows its shape. Both files are
 * checked against their JSON Schemas (`summ-sweep/settings.js`) before
 * the sweep takes a setting. The range runs from the first block of its
 * first day to the last block of its last. Before the chain is asked
 * anything, the sweep checks that no report is in the way of a run
 * without `--replace`, reads the template's header and parses Summ's
 * pages. Before either file is written, the rows are checked by the csv
 * utility, and both paths for files already there: a csv at `--out` is in
 * the way only of a run that has rows, which only the sweep can tell. So
 * a mistake these checks find, in an option, a setting, a page or a row,
 * writes neither file. A report's amounts, which are BigInts, are written
 * as decimal text, json having no BigInt.
 *
 * Fit: `bin/summ-sweep.js` runs `runSummSweep`. The tests
 * give it a stand-in chain and a stand-in LP Ranger.
 */

import fs from "node:fs";
import path from "node:path";
import { Command, CommanderError, InvalidArgumentError } from "commander";
import { JsonRpcProvider, Network, getAddress, isAddress } from "ethers";
import {
  readTemplateHeader,
  summCsvText,
  writeSummCsv,
} from "crypto-price-fetchers/summ-csv";
import { messageOf } from "crypto-price-fetchers/lib/message-of";
import { newFileRefusal } from "crypto-price-fetchers/lib/new-file";
import { pacedProvider } from "../wallet-history/paced-provider.js";
import { blockAtOrAfter } from "../wallet-history/blocks.js";
import { parseSummResults } from "./summ-results.js";
import { readThroughLpRanger } from "./lp-ranger.js";
import { sweepWallet } from "./sweep.js";
import { dayStartSeconds } from "crypto-price-fetchers/lib/calendar-day";
import { readSweepSettings } from "./settings.js";
import { dayText, secondsOfTime } from "./times.js";

/** One day, in seconds. */
const DAY = 86400;

/** The end of the help: the two files, the settings and the exit codes. */
const HELP_AFTER = `
The csv holds the rows for what Summ lacks, written by crypto-price-fetchers'
Summ csv utility; the report, as json, lists the splits to fix in Summ (a
leg holding a withdrawal's principal and fees together), the legs Summ
lacks, the questions about the legs no rule books, Summ's legs no leg
matched, and the problems found. Neither is written over without
--replace, and a run with --replace that has no rows removes the csv
already at --out, which would hold rows of the run before.

--summ-synced-to is the time up to which Summ's sync has read the wallet's
transactions, from Summ. A transaction after it is one that sync has not
read yet: its rows carry no gas, for the sync to bring.

The chain's facts come from the top config.json, and the owner's settings
from summ-sweep/config.json, which git ignores; summ-sweep/config-example.json
shows its shape.

The examples keep the saved pages of Summ's results in summ-sweep/input/,
the csv in summ-sweep/output/csv/ and the report in summ-sweep/output/json/:
the files hold the owner's own data, and the repo is public, so git keeps
nothing in those folders but the folders.

Examples:
  Sweep a wallet's November 2026 against two saved pages of Summ's results:
    $ npm run summ-sweep -- --wallet <address> --start-date 2026-11-01 --end-date 2026-11-30 --summ-synced-to "2026-11-30 23:59:59" --summ-results summ-sweep/input/summ-results-1.json summ-sweep/input/summ-results-2.json --out summ-sweep/output/csv/missing.csv --report summ-sweep/output/json/report.json
  Run it again after fixing a leg in Summ and saving Summ's results again,
  writing over the last run's files:
    $ npm run summ-sweep -- --wallet <address> --start-date 2026-11-01 --end-date 2026-11-30 --summ-synced-to "2026-11-30 23:59:59" --summ-results summ-sweep/input/summ-results-1.json summ-sweep/input/summ-results-2.json --out summ-sweep/output/csv/missing.csv --report summ-sweep/output/json/report.json --replace

Exit codes: 0 when the report was written, and the csv with it when there
were rows; 1 when they were not.
`;

/**
 * Reads the wallet's option: an address, in any case that ethers accepts.
 *
 * @param {string} value - The option's text
 * @returns {string} The address, in EIP-55's mixed case
 * @throws {InvalidArgumentError} When it is no address
 */
function walletArgument(value) {
  if (!isAddress(value))
    throw new InvalidArgumentError(
      "It is not an address, or its mixed case does not match its checksum.",
    );
  return getAddress(value);
}

/**
 * Reads a day's option.
 *
 * @param {string} value - The option's text
 * @returns {number} The seconds since 1970 of the day's start, in UTC
 * @throws {InvalidArgumentError} When it is no real day
 */
function dayArgument(value) {
  const seconds = dayStartSeconds(value);
  if (seconds === null)
    throw new InvalidArgumentError(
      `"${value}" is not a day written as YYYY-MM-DD.`,
    );
  return seconds;
}

/**
 * Reads the option of the time Summ's sync reached.
 *
 * @param {string} value - The option's text
 * @returns {number} The seconds since 1970
 * @throws {InvalidArgumentError} When it is no real time
 */
function timeArgument(value) {
  const seconds = secondsOfTime(value);
  if (seconds === null)
    throw new InvalidArgumentError(
      `"${value}" is not a time written as "YYYY-MM-DD HH:MM:SS".`,
    );
  return seconds;
}

/**
 * Reads the option of a file the sweep writes: a path that is no folder,
 * in a folder that exists and takes a new file, which
 * crypto-price-fetchers' `newFileRefusal` tells by making one there and
 * removing it.
 *
 * @param {string} value - The option's text
 * @returns {string} The path, as given
 * @throws {InvalidArgumentError} When it is empty, its folder does not
 *   exist or takes no new file, or it is a folder
 */
function fileToWriteArgument(value) {
  if (value === "") throw new InvalidArgumentError("It names no file.");
  const folder = path.dirname(path.resolve(value));
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory())
    throw new InvalidArgumentError(`Its folder, ${folder}, does not exist.`);
  if (fs.existsSync(value) && fs.statSync(value).isDirectory())
    throw new InvalidArgumentError("It is a folder, not a file.");
  const refusal = newFileRefusal(folder);
  if (refusal !== null)
    throw new InvalidArgumentError(
      `Its folder, ${folder}, takes no new file (${refusal}).`,
    );
  return value;
}

/**
 * Reads one file of the option of Summ's saved pages: a file that
 * exists. Commander calls it once for each file the option names.
 *
 * @param {string} value - The file's path
 * @param {string[]|undefined} previous - The files the option named
 *   before it
 * @returns {string[]} The files so far, this one last
 * @throws {InvalidArgumentError} When it is empty, or no file is at the
 *   path
 */
function pageFileArgument(value, previous) {
  if (value === "") throw new InvalidArgumentError("It names no file.");
  if (!fs.existsSync(value) || !fs.statSync(value).isFile())
    throw new InvalidArgumentError(`No file is at ${path.resolve(value)}.`);
  return [...(previous ?? []), value];
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
 * @param {object} range - The wallet, its blocks and the time Summ's sync
 *   reached
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
 * Checks, before the chain is asked anything, what it can check without
 * it: that no report is in the way of a run without `--replace`, that
 * the template's header can be read, and Summ's pages, which it parses.
 * A csv already at `--out` is in the way only of a run that has rows to
 * write, which only the sweep can tell, so `checkBeforeWriting` checks
 * it.
 *
 * @param {object} options - The parsed options
 * @param {object} owner - The owner's settings: `templatePath`
 * @returns {object[]} Summ's rows, from the pages
 * @throws {Error} When the report is in the way, the template names no
 *   file, or a page is refused
 */
function checkBeforeReading(options, owner) {
  if (options.replace !== true && fs.existsSync(options.report))
    throw new Error(
      `${options.report} is already there: pass --replace to write over it`,
    );
  if (!fs.existsSync(owner.templatePath))
    throw new Error(
      `summ-sweep/config.json → templatePath names no file: ${owner.templatePath}`,
    );
  readTemplateHeader(owner.templatePath);
  return parseSummResults(
    options.summResults.map((file) => fs.readFileSync(file, "utf8")),
  );
}

/**
 * Checks, before anything is written, that both files can be: the rows
 * pass the csv utility's rules, and no file is in the way of a run
 * without `--replace`.
 *
 * @param {object} result - What `sweepWallet` gave
 * @param {object} options - The parsed options
 * @param {object} owner - The owner's settings: `templatePath`
 * @throws {Error} When a row breaks a rule, or a file is in the way
 */
function checkBeforeWriting(result, options, owner) {
  const writing = result.rows.length > 0;
  if (writing) summCsvText(result.rows, readTemplateHeader(owner.templatePath));
  if (options.replace === true) return;
  for (const file of writing ? [options.out, options.report] : [options.report])
    if (fs.existsSync(file))
      throw new Error(
        `${file} is already there: pass --replace to write over it`,
      );
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
  const summRows = checkBeforeReading(options, owner);
  const paced = pacedProvider(makeProvider(chain), {
    spacingMs: chain.requestSpacingMs,
  });
  const fromBlock = await blockAtOrAfter(paced, options.startDate);
  const toBlock = (await blockAtOrAfter(paced, options.endDate + DAY)) - 1;
  const result = await sweepWallet(paced, {
    wallet: options.wallet,
    fromBlock,
    toBlock,
    chain,
    owner,
    summRows,
    syncedTo: options.summSyncedTo,
    readRecords: (hashes) =>
      readThroughLpRanger(hashes, {
        lpRangerDir: owner.lpRangerDir,
        wallet: options.wallet,
        rpcEndpoint: chain.rpcEndpoint,
        positionManager: chain.positionManager,
        run,
      }),
  });
  checkBeforeWriting(result, options, owner);
  const replace = options.replace === true;
  if (result.rows.length > 0)
    writeSummCsv({
      rows: result.rows,
      templatePath: owner.templatePath,
      outPath: options.out,
      replace,
    });
  // A csv a run with --replace leaves in place would hold rows already
  // imported into Summ, so a run with none removes it
  const removed =
    result.rows.length === 0 && replace && fs.existsSync(options.out);
  if (removed) fs.rmSync(options.out);
  const range = {
    wallet: options.wallet,
    fromBlock,
    toBlock,
    summSyncedTo: options.summSyncedTo,
  };
  fs.writeFileSync(
    options.report,
    `${JSON.stringify(reportOf(result, range), jsonValue, 2)}\n`,
    { flag: replace ? "w" : "wx" },
  );
  say(
    `Blocks ${fromBlock} to ${toBlock}: ${result.history.legs.length} token legs, ${result.unmatched.length} legs and parts Summ lacks, ${result.fixes.length} splits to fix in Summ, ${result.questions.length} questions, ${result.problems.length} problems.`,
  );
  say(
    result.rows.length > 0
      ? `Wrote ${result.rows.length} rows to ${options.out}.`
      : `No rows to write, so no csv was written${removed ? `, and the last run's csv at ${options.out} was removed` : ""}.`,
  );
  say(`Wrote the report to ${options.report}.`);
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
 * The command, its options declared once, from which commander reads the
 * arguments and writes the help.
 *
 * @param {object} stdout - Where the help goes
 * @param {object} stderr - Where a mistake in the arguments goes
 * @returns {Command} The command
 */
function sweepCommand(stdout, stderr) {
  return new Command()
    .name("summ-sweep")
    .description(
      "Sweeps a wallet's history on PulseChain against Summ's rows, and writes the rows Summ lacks and a report of what to fix.",
    )
    .requiredOption("--wallet <address>", "the wallet", walletArgument)
    .requiredOption(
      "--start-date <day>",
      "the first day, as YYYY-MM-DD, in UTC",
      dayArgument,
    )
    .requiredOption(
      "--end-date <day>",
      "the last day, as YYYY-MM-DD, in UTC",
      dayArgument,
    )
    .requiredOption(
      "--summ-synced-to <time>",
      'the time Summ\'s sync of the wallet reached, as "YYYY-MM-DD HH:MM:SS", in UTC',
      timeArgument,
    )
    .requiredOption(
      "--summ-results <files...>",
      "the saved pages of Summ's results",
      pageFileArgument,
    )
    .requiredOption("--out <file>", "the csv to write", fileToWriteArgument)
    .requiredOption(
      "--report <file>",
      "the report to write, as json",
      fileToWriteArgument,
    )
    .option(
      "--replace",
      "write over files already there, and remove the csv at --out when there are no rows",
    )
    .addHelpText("after", HELP_AFTER)
    .exitOverride()
    .configureOutput({
      writeOut: (text) => stdout.write(text),
      writeErr: (text) => stderr.write(text),
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
 * @returns {Promise<number>} The exit code: 0 when the report was written,
 *   and the csv with it when there were rows; 1 when they were not
 */
export async function runSummSweep(argv, deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const repoTop = deps.repoTop ?? process.cwd();
  const program = sweepCommand(stdout, stderr);
  try {
    program.parse(argv);
    const options = program.opts();
    if (options.endDate < options.startDate)
      program.error(
        `error: option '--end-date <day>' argument '${dayText(options.endDate)}' is invalid. It is before the day of --start-date, ${dayText(options.startDate)}.`,
      );
    if (path.resolve(options.out) === path.resolve(options.report))
      program.error(
        `error: option '--report <file>' argument '${options.report}' is invalid. It names the file --out names; the csv and the report need two.`,
      );
    const { chain, owner } = readSweepSettings(repoTop);
    await sweepWith(options, {
      chain,
      owner,
      say: (line) => stdout.write(`${line}\n`),
      makeProvider: deps.makeProvider ?? chainProvider,
      run: deps.run,
    });
  } catch (thrown) {
    if (thrown instanceof CommanderError) return thrown.exitCode;
    stderr.write(`${messageOf(thrown)}\n`);
    return 1;
  }
  return 0;
}
