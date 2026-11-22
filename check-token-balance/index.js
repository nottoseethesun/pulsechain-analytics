/**
 * Prints a PulseChain wallet's balances of tokens, PLS among them, at a
 * block or at the start of a day in UTC: the balance checker's entry point.
 * @module check-token-balance
 *
 * What: for each token named, the wallet's balance at the block, first with
 * commas between the thousands, then as plain digits (`format-balance.js`).
 * PLS, PulseChain's own coin, has no contract: the command line names it
 * `Pulse_Native_Gas_Token`, its balance is read with eth_getBalance, and it
 * has 18 decimals. Any other token is an ERC-20 contract, whose balanceOf
 * and decimals are read at the block.
 *
 * How:
 *
 * - `balance-command.js` declares the command line and checks each option
 *   as it is parsed, before the chain is asked anything.
 * - With --date, the block is the last one made before the start of that
 *   day in UTC, whose state is the chain's when the day starts: a block
 *   made at midnight or after holds the day's transactions. A binary
 *   search over the block numbers finds it, which holds because each
 *   block's time is later than the time of the block before it.
 * - A balance at a past block needs an rpc endpoint, the json-rpc api of a
 *   PulseChain node, that keeps past state. The default endpoint is
 *   `defaultRpc` in the config.json beside this file, else g4mm4's public
 *   endpoint; `settings.js` checks the file against its JSON Schema before
 *   the checker takes it.
 * - Each balance is read once, then written in both forms.
 */

import { ethers } from "ethers";
import { buildBalanceCommand, NATIVE_TOKEN } from "./balance-command.js";
import {
  formatBalancePlain,
  formatBalanceWithCommas,
} from "./format-balance.js";
import { endQuietlyWhenOutputCloses } from "crypto-price-fetchers/lib/closed-output";
import { defaultRpcFrom, FALLBACK_RPC } from "./settings.js";

/** The two calls of an ERC-20 contract the checker makes. */
const ERC20_ABI = Object.freeze([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

/**
 * The command line, with `--rpc` defaulting to the endpoint config.json
 * names (`settings.js`). When the file cannot be taken, `--rpc` defaults
 * to g4mm4's endpoint, written in `settings.js`, and a hook before the
 * action stops the run, with exit code 1 and every problem of config.json
 * listed: `--help` still prints the help, and a mistake in an option is
 * still named first.
 *
 * @returns {import('commander').Command} The command, without its action
 */
function balanceCommand() {
  try {
    return buildBalanceCommand(defaultRpcFrom());
  } catch (error) {
    return buildBalanceCommand(FALLBACK_RPC).hook("preAction", (command) =>
      command.error(`Error: ${error.message}`),
    );
  }
}

/**
 * The time of a block.
 *
 * @param {ethers.JsonRpcProvider} provider - The provider of the rpc endpoint
 * @param {number} number - The block's number
 * @returns {Promise<number>} Its time, in seconds since 1970
 * @throws {Error} When the block cannot be read
 */
async function blockTime(provider, number) {
  const block = await provider.getBlock(number);
  if (block === null) throw new Error(`Failed to fetch block ${number}`);
  return block.timestamp;
}

/**
 * Finds the last block made before a time, whose state is the chain's at
 * that time: a block made at the time itself, or after, holds transactions
 * made then, so its state is the chain's after them. A binary search over
 * the block numbers keeps one block made before the time and one made at
 * it or after, and narrows the two until they are neighbours.
 *
 * @param {ethers.JsonRpcProvider} provider - The provider of the rpc endpoint
 * @param {number} targetTimestamp - The time, in seconds since 1970
 * @returns {Promise<number>} The block's number
 * @throws {Error} When a block cannot be read, when the newest block was made before the time, so the chain has not reached it, or when no block was made before it
 */
async function lastBlockBefore(provider, targetTimestamp) {
  const latest = await provider.getBlockNumber();
  if ((await blockTime(provider, latest)) < targetTimestamp) {
    throw new Error(
      `The chain's newest block, ${latest}, was made before ${new Date(targetTimestamp * 1000).toISOString()}, so its state then is not known yet`,
    );
  }
  if ((await blockTime(provider, 0)) >= targetTimestamp) {
    throw new Error(
      `The chain made no block before ${new Date(targetTimestamp * 1000).toISOString()}`,
    );
  }
  let before = 0;
  let notBefore = latest;
  while (notBefore - before > 1) {
    const middle = Math.floor((before + notBefore) / 2);
    if ((await blockTime(provider, middle)) < targetTimestamp) before = middle;
    else notBefore = middle;
  }
  return before;
}

/**
 * Reads a wallet's balance of a token at a block.
 *
 * @param {ethers.JsonRpcProvider} provider - The provider of the rpc endpoint
 * @param {string} tokenName - `Pulse_Native_Gas_Token`, or the token's contract address
 * @param {string} address - The wallet's address
 * @param {number} blockNumber - The block
 * @returns {Promise<{balance: bigint, decimals: number|bigint}>} The balance, in the token's smallest unit, and its decimals
 */
async function readBalance(provider, tokenName, address, blockNumber) {
  if (tokenName === NATIVE_TOKEN) {
    return {
      balance: await provider.getBalance(address, blockNumber),
      decimals: 18,
    };
  }
  const contract = new ethers.Contract(tokenName, ERC20_ABI, provider);
  return {
    balance: await contract.balanceOf(address, { blockTag: blockNumber }),
    decimals: await contract.decimals({ blockTag: blockNumber }),
  };
}

/**
 * Reads the wallet's balances at the block the options name, or at the
 * block nearest the start of their date, and prints them in both forms.
 *
 * @param {{address: string, block?: number, date?: number, tokens: string[], rpc: string}} options - The options, as the command parsed them
 * @returns {Promise<void>}
 * @throws {Error} When a read from the chain fails
 */
async function printBalances(options) {
  const provider = new ethers.JsonRpcProvider(options.rpc);
  try {
    const blockNumber =
      options.block ?? (await lastBlockBefore(provider, options.date));
    console.log(`Querying balances at block: ${blockNumber}`);
    const balances = [];
    for (const token of options.tokens) {
      const read = await readBalance(
        provider,
        token,
        options.address,
        blockNumber,
      );
      balances.push({ token, ...read });
    }
    console.log("\nFormatted Balances (with commas):");
    for (const { token, balance, decimals } of balances) {
      console.log(`${token}: ${formatBalanceWithCommas(balance, decimals)}`);
    }
    console.log("\nPlain Balances (no commas):");
    for (const { token, balance, decimals } of balances) {
      console.log(`${token}: ${formatBalancePlain(balance, decimals)}`);
    }
  } finally {
    provider.destroy();
  }
}

endQuietlyWhenOutputCloses();
await balanceCommand()
  .action(async (options, command) => {
    if (options.block === undefined && options.date === undefined) {
      command.error("error: give --block or --date");
    }
    try {
      await printBalances(options);
    } catch (error) {
      console.error("Error:", error.message);
      process.exitCode = 1;
    }
  })
  .parseAsync(process.argv);
