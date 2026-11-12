/**
 * The Node version of fetch-amount-of-token-transferred.gs: how much of a
 * token one PulseChain transaction sent a wallet, for Node programs and the
 * command line.
 * @module for-google-apps/check-token-balance/fetch-amount-of-token-transferred
 *
 * What: the same answer as the Sheets function `getTokenTransferred`,
 * worked out by the same code, because this file runs
 * `fetch-amount-of-token-transferred.gs` itself, unchanged, through the
 * runner crypto-price-fetchers provides
 * (`crypto-price-fetchers/apps-script-runner`, installed from GitHub). The
 * `.gs` file's header says what the function takes and returns: the
 * amount, with seven decimal places, or 0 when the transaction sent the
 * wallet none, or a read failed.
 *
 * How:
 *
 * - `openTokenTransferFetcher` opens the script once and returns
 *   `getTokenTransferred(txId, tokenAddress, walletAddress)` as an async
 *   call, plus `close`.
 * - `config.json` beside this file, which git ignores, may set
 *   `config.rpcUrl`, the PulseChain rpc endpoint the script asks;
 *   `config-example.json` shows the shape. Without the file, the script
 *   asks the endpoint written in it.
 * - The command line, `node fetch-amount-of-token-transferred.js
 *   <transaction> <token> <wallet>`, prints the amount (`--help` gives the
 *   rest).
 *
 * What differs from the sheet: it runs on this computer, so there is no
 * 30-second limit per call and no daily cap on requests. There is no
 * wrapper: `wrapper.gs` exists because a sheet reaches a library's
 * functions through one, and a Node program imports this file directly.
 *
 * Fit: beside `fetch-amount-of-token-transferred.gs`, which stays the one
 * copy of its logic, so a fix to it is a fix to both. The script of the
 * same name at the repo's top folder is a separate tool, on ethers, with
 * code of its own.
 */

import { fileURLToPath } from 'node:url';
import {
  InvalidArgumentError,
  isEntryPoint,
  openScriptFunctions,
  runScriptCommandLine
} from 'crypto-price-fetchers/apps-script-runner';

/** The Sheets script this runs. */
export const SHEETS_SCRIPT = new URL('./fetch-amount-of-token-transferred.gs', import.meta.url);

/** The config file read when none is named. */
export const DEFAULT_CONFIG_FILE = fileURLToPath(new URL('./config.json', import.meta.url));

/** A transaction hash: 0x and 64 hex digits. */
const TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/;

/** An address: 0x and 40 hex digits. */
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * Opens the script and returns its Sheets function as an async call.
 *
 * @param {Object} [options] - How to open it (`openScriptFunctions`)
 * @param {Object<string, Object>} [options.config] - Values for the script's config objects, in place of the config file
 * @param {string} [options.configFile] - A config file in place of `config.json` beside this file
 * @param {function(string, Object): Promise<Response>} [options.fetch] - Does the script's rpc requests, in place of Node's fetch
 * @param {?function({level: string, text: string}): void} [options.onLog] - Takes each line the script logs
 * @returns {Promise<{getTokenTransferred: function(string, string, string): Promise<number>, close: function(): Promise<void>}>} The function, with the Sheets arguments
 */
export function openTokenTransferFetcher(options = {}) {
  return openScriptFunctions(SHEETS_SCRIPT, ['getTokenTransferred'], {
    ...options,
    defaultConfigFile: DEFAULT_CONFIG_FILE
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
  if (!TRANSACTION_HASH.test(value.trim())) throw new InvalidArgumentError('It is not a transaction hash: 0x and 64 hex digits.');
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
  if (!ADDRESS.test(value.trim())) throw new InvalidArgumentError('It is not an address: 0x and 40 hex digits.');
  return value;
}

/**
 * Describes the command line.
 *
 * @param {import('commander').Command} program - The program, with the shared options
 * @param {function(string, Array, import('commander').Command): Promise<void>} runCall - Runs a script function and prints what it returned
 * @returns {void}
 */
function describeCommandLine(program, runCall) {
  program
    .name('fetch-amount-of-token-transferred')
    .description(
      'How much of a token one PulseChain transaction sent a wallet, ' +
        'worked out by fetch-amount-of-token-transferred.gs run under Node.'
    )
    .argument('<transaction>', "the transaction's hash", transactionHash)
    .argument('<token>', "the token's contract address", address)
    .argument('<wallet>', "the wallet's address", address)
    .action((transaction, token, wallet, _options, command) =>
      runCall('getTokenTransferred', [transaction, token, wallet], command)
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
    { argv, scriptPath: SHEETS_SCRIPT, defaultConfigFile: DEFAULT_CONFIG_FILE, describe: describeCommandLine },
    deps
  );
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = await runCommandLine(process.argv);
}
