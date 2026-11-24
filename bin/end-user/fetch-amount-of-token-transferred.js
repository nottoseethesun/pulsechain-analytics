/**
 * The Node version of
 * src/for-google-apps/check-token-balance/fetch-amount-of-token-transferred.gs:
 * how much of a token one PulseChain transaction sent a wallet, for Node
 * programs and the command line.
 * @module bin/end-user/fetch-amount-of-token-transferred
 *
 * What: the same answer as the Sheets function `getTokenTransferred`,
 * worked out by the same code, because this file runs
 * `fetch-amount-of-token-transferred.gs` itself, unchanged, through the
 * runner crypto-price-fetchers provides
 * (`crypto-price-fetchers/apps-script-runner`, installed from GitHub). The
 * `.gs` file's header says what the function takes and returns: the
 * amount, cut off at 7 decimal places, or 0 when the transaction sent the
 * wallet none. A failed read throws, so the call fails, and the command
 * line prints the error on stderr with exit code 1.
 *
 * How:
 *
 * - `openTokenTransferFetcher` opens the script once and returns
 *   `getTokenTransferred(txId, tokenAddress, walletAddress)` as an async
 *   call, plus `close`.
 * - `config.json` beside the Sheets script, in
 *   `src/for-google-apps/check-token-balance/`, which git ignores, may set
 *   `config.rpcUrl`, the PulseChain rpc endpoint the script asks;
 *   `config-example.json` beside it shows the shape. Without the file, the script
 *   asks the endpoint written in it. `CONFIG_SCHEMAS` holds the file to an
 *   http or https url there, and to no other field, by crypto-price-fetchers'
 *   kinds of value (`crypto-price-fetchers/lib/settings-schema`); the
 *   runner checks the file against it before the script opens, and a
 *   problem stops the run, every problem listed.
 * - The command line, `node bin/end-user/fetch-amount-of-token-transferred.js
 *   <transaction> <token> <wallet>`, prints the amount (`--help` gives the
 *   rest).
 *
 * What differs from the sheet: it runs on this computer, so there is no
 * 30-second limit per call and no daily cap on requests. There is no
 * wrapper: `wrapper.gs` exists because a sheet reaches a library's
 * functions through one, and a Node program imports this file directly.
 *
 * Fit: in `bin/end-user/`, the folder of the programs only an end user runs; the Sheets
 * script, `src/for-google-apps/check-token-balance/`'s
 * `fetch-amount-of-token-transferred.gs`, stays the one copy of its logic,
 * so a fix to it is a fix to both. The module of the same name at the
 * repo's top folder is a separate tool, on ethers, with code of its own.
 */

import { fileURLToPath } from "node:url";
import {
  InvalidArgumentError,
  isEntryPoint,
  openScriptFunctions,
  runScriptCommandLine,
} from "crypto-price-fetchers/apps-script-runner";
import { endQuietlyWhenOutputCloses } from "crypto-price-fetchers/lib/closed-output";
import { KINDS } from "crypto-price-fetchers/lib/settings-schema";

/** The Sheets script this runs. */
export const SHEETS_SCRIPT = new URL(
  "../../src/for-google-apps/check-token-balance/fetch-amount-of-token-transferred.gs",
  import.meta.url,
);

/** The config file read when none is named: the one beside the script. */
export const DEFAULT_CONFIG_FILE = fileURLToPath(
  new URL("config.json", SHEETS_SCRIPT),
);

/**
 * The JSON Schema of the script's config object that `config.json` may
 * set, by its name in the script: the rpc endpoint, which the script reads
 * each time it is called.
 */
export const CONFIG_SCHEMAS = Object.freeze({
  config: Object.freeze({
    type: "object",
    additionalProperties: false,
    properties: { rpcUrl: KINDS.url },
    description: "fields of config",
  }),
});

/** A transaction hash: 0x and 64 hex digits. */
const TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/;

/** An address: 0x and 40 hex digits. */
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * Opens the script and returns its Sheets function as an async call.
 *
 * @param {Object} [options] - How to open it (`openScriptFunctions`)
 * @param {Object<string, Object>} [options.config] - Values for the script's config objects, in place of the config file
 * @param {string} [options.configFile] - A config file in place of `config.json` beside the Sheets script
 * @param {function(string, Object): Promise<Response>} [options.fetch] - Does the script's rpc requests, in place of Node's fetch
 * @param {?function({level: string, text: string}): void} [options.onLog] - Takes each line the script logs
 * @returns {Promise<{getTokenTransferred: function(string, string, string): Promise<number>, close: function(): Promise<void>}>} The function, with the Sheets arguments
 */
export function openTokenTransferFetcher(options = {}) {
  return openScriptFunctions(SHEETS_SCRIPT, ["getTokenTransferred"], {
    ...options,
    defaultConfigFile: DEFAULT_CONFIG_FILE,
    configSchemas: CONFIG_SCHEMAS,
  });
}

/**
 * Checks that an argument is a transaction hash.
 *
 * @param {string} value - The argument
 * @returns {string} The argument
 * @throws {InvalidArgumentError} When it is not a transaction hash
 */
function transactionHash(value) {
  if (!TRANSACTION_HASH.test(value.trim()))
    throw new InvalidArgumentError(
      "It is not a transaction hash: 0x and 64 hex digits.",
    );
  return value;
}

/**
 * Checks that an argument is an address.
 *
 * @param {string} value - The argument
 * @returns {string} The argument
 * @throws {InvalidArgumentError} When it is not an address
 */
function address(value) {
  if (!ADDRESS.test(value.trim()))
    throw new InvalidArgumentError(
      "It is not an address: 0x and 40 hex digits.",
    );
  return value;
}

/** The examples of the help; the runner adds the exit codes after them. */
const EXAMPLES_HELP = `
Examples:
  How much HEX one transaction sent a wallet:
    $ node bin/end-user/fetch-amount-of-token-transferred.js <transaction-hash> 0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39 <wallet>
  The same, with the script's log on stderr, to see each step it took:
    $ node bin/end-user/fetch-amount-of-token-transferred.js --verbose <transaction-hash> 0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39 <wallet>`;

/**
 * Describes the command line.
 *
 * @param {import('commander').Command} program - The program, with the shared options
 * @param {function(string, Array, import('commander').Command): Promise<void>} runCall - Runs a script function and prints what it returned
 * @returns {void}
 */
function describeCommandLine(program, runCall) {
  program
    .name("fetch-amount-of-token-transferred")
    .description(
      "How much of a token one PulseChain transaction sent a wallet, " +
        "worked out by fetch-amount-of-token-transferred.gs run under Node.",
    )
    .argument("<transaction>", "the transaction's hash", transactionHash)
    .argument("<token>", "the token's contract address", address)
    .argument("<wallet>", "the wallet's address", address)
    .addHelpText("after", EXAMPLES_HELP)
    .action((transaction, token, wallet, _options, command) =>
      runCall("getTokenTransferred", [transaction, token, wallet], command),
    );
}

/**
 * Runs the command line.
 *
 * @param {string[]} argv - The arguments, shaped as `process.argv`
 * @param {Object} [deps] - What a test replaces: `fetch`, `stdout`, `stderr` (`runScriptCommandLine`)
 * @returns {Promise<number>} The exit code
 */
export function runCommandLine(argv, deps = {}) {
  return runScriptCommandLine(
    {
      argv,
      scriptPath: SHEETS_SCRIPT,
      defaultConfigFile: DEFAULT_CONFIG_FILE,
      configSchemas: CONFIG_SCHEMAS,
      describe: describeCommandLine,
    },
    deps,
  );
}

if (isEntryPoint(import.meta.url)) {
  endQuietlyWhenOutputCloses();
  process.exitCode = await runCommandLine(process.argv);
}
