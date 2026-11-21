/**
 * The balance checker's command line, declared with commander: its
 * options, each checked as it is parsed, and its help.
 * @module check-token-balance/balance-command
 *
 * `buildBalanceCommand` builds the command anew for each parse, so a test
 * can parse several argument lists. A mistake in an option names the
 * option, on stderr, and stops the run, with exit code 1, before the chain
 * is asked anything:
 *
 * - a block is a whole number;
 * - a date is a day of the calendar, written YYYY-MM-DD, which gives the
 *   start of that day in UTC, in seconds since 1970;
 * - an address is 0x and 40 hex digits, in one case or in the mixed case of
 *   EIP-55, whose checksum it then must match; it is held in EIP-55's form,
 *   as LP Ranger, the owner's bot that manages his 9mm V3 liquidity
 *   positions, holds addresses;
 * - each token is `Pulse_Native_Gas_Token`, the name the command line takes
 *   for PLS, PulseChain's own coin, which has no contract, or a contract's
 *   address;
 * - the rpc endpoint, the json-rpc api of the PulseChain node asked, is an
 *   http or https url.
 *
 * `--block` and `--date` exclude each other; the action checks that one of
 * them is given.
 */

import { Command, InvalidArgumentError, Option } from "commander";
import { ethers } from "ethers";

/** The name the command line takes for PLS, which has no contract. */
export const NATIVE_TOKEN = "Pulse_Native_Gas_Token";

/** What the help says after the options: examples and exit codes. */
const HELP_AFTER = `
The rpc endpoint's default comes from config.json in the folder the
command runs in. A balance at a past block needs an endpoint that keeps
past state.

Examples:
  A wallet's PLS and HEX at the start of 1 November 2026, UTC:
    $ node index.js --address <wallet> --date 2026-11-01 --tokens ${NATIVE_TOKEN},0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39
  The same wallet's PLS at one block, from another rpc endpoint that keeps
  past state:
    $ node index.js --address <wallet> --block 22000000 --tokens ${NATIVE_TOKEN} --rpc https://rpc.pulsechain.com

Exit codes:
  0  each balance was printed
  1  an option was wrong or missing, neither --block nor --date was given,
     or a read from the chain failed`;

/**
 * An address in EIP-55's form.
 *
 * @param {string} value - The text typed
 * @returns {?string} The address, or null when the text is no address, or
 *   is in mixed case that is not its checksum
 */
function asAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(value) && ethers.isAddress(value)
    ? ethers.getAddress(value)
    : null;
}

/**
 * Checks a block number, as commander parses it.
 *
 * @param {string} value - The block typed
 * @returns {number} The block number
 * @throws {InvalidArgumentError} When it is not a whole number
 */
export function blockNumber(value) {
  const number = Number(value);
  if (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(number)) {
    throw new InvalidArgumentError(
      "Not a block number, which is a whole number, such as 22000000.",
    );
  }
  return number;
}

/**
 * Checks a date, as commander parses it.
 *
 * @param {string} value - The date typed
 * @returns {number} The start of that day in UTC, in seconds since 1970
 * @throws {InvalidArgumentError} When it is not a day of the calendar, written YYYY-MM-DD
 */
export function utcDayStart(value) {
  const start = new Date(`${value}T00:00:00.000Z`);
  const isDay =
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(start.getTime()) &&
    start.toISOString().slice(0, 10) === value;
  if (!isDay) {
    throw new InvalidArgumentError(
      "Not a day of the calendar written YYYY-MM-DD, such as 2026-11-01.",
    );
  }
  return start.getTime() / 1000;
}

/**
 * Checks a wallet's address, as commander parses it.
 *
 * @param {string} value - The address typed
 * @returns {string} The address, in EIP-55's form
 * @throws {InvalidArgumentError} When it is no address
 */
export function walletAddress(value) {
  const address = asAddress(value);
  if (address === null) {
    throw new InvalidArgumentError(
      "Not an address, which is 0x and 40 hex digits, in one case or in EIP-55's mixed case.",
    );
  }
  return address;
}

/**
 * Checks the list of tokens, as commander parses it.
 *
 * @param {string} value - The tokens typed, separated by commas
 * @returns {string[]} Each token: `Pulse_Native_Gas_Token`, or a contract's address in EIP-55's form
 * @throws {InvalidArgumentError} Naming the first that is neither
 */
export function tokenList(value) {
  return value.split(",").map((typed) => {
    const tokenName = typed.trim();
    if (tokenName === NATIVE_TOKEN) return tokenName;
    const address = asAddress(tokenName);
    if (address === null) {
      throw new InvalidArgumentError(
        `"${tokenName}" is neither ${NATIVE_TOKEN} nor a contract's address, which is 0x and 40 hex digits.`,
      );
    }
    return address;
  });
}

/**
 * Checks an rpc endpoint's url, as commander parses it.
 *
 * @param {string} value - The url typed
 * @returns {string} The url
 * @throws {InvalidArgumentError} When it is not an http or https url
 */
export function rpcUrl(value) {
  if (!URL.canParse(value) || !/^https?:$/.test(new URL(value).protocol)) {
    throw new InvalidArgumentError("Not an http or https url.");
  }
  return value;
}

/**
 * Builds the command line.
 *
 * @param {string} defaultRpc - The rpc endpoint taken when --rpc is not given
 * @returns {import('commander').Command} The command, without its action
 */
export function buildBalanceCommand(defaultRpc) {
  return new Command("check-token-balance")
    .description(
      "Prints a PulseChain wallet's balances of tokens, PLS among them, at a block or at the start of a day, in UTC.",
    )
    .requiredOption(
      "-a, --address <address>",
      "PulseChain wallet address",
      walletAddress,
    )
    .addOption(
      new Option("-b, --block <block>", "PulseChain block number")
        .argParser(blockNumber)
        .conflicts("date"),
    )
    .addOption(
      new Option(
        "-d, --date <date>",
        "UTC date in YYYY-MM-DD format (00:00:00 UTC)",
      ).argParser(utcDayStart),
    )
    .requiredOption(
      "-t, --tokens <tokens>",
      `Comma-separated list of token contract addresses or "${NATIVE_TOKEN}" for native PLS`,
      tokenList,
    )
    .option(
      "-r, --rpc <url>",
      "RPC URL (use an archive node for historical queries)",
      rpcUrl,
      defaultRpc,
    )
    .addHelpText("after", HELP_AFTER);
}
