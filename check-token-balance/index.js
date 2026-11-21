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
 * - With --date, the block is the one whose time is nearest the start of
 *   that day in UTC, found by a binary search over the block numbers,
 *   which holds because each block's time is later than the time of the
 *   block before it.
 * - A balance at a past block needs an rpc endpoint, the json-rpc api of a
 *   PulseChain node, that keeps past state. The default endpoint is
 *   `defaultRpc` in config.json in the folder the command runs in, else
 *   g4mm4's public endpoint.
 * - Each balance is read once, then written in both forms.
 */

import fs from "node:fs";
import { ethers } from "ethers";
import { buildBalanceCommand, NATIVE_TOKEN } from "./balance-command.js";
import {
  formatBalancePlain,
  formatBalanceWithCommas,
} from "./format-balance.js";
import { endQuietlyWhenOutputCloses } from "crypto-price-fetchers/lib/closed-output";

/** The rpc endpoint when config.json names none: g4mm4's public PulseChain endpoint. */
const FALLBACK_RPC = "https://rpc-pulsechain.g4mm4.io";

/** The two calls of an ERC-20 contract the checker makes. */
const ERC20_ABI = Object.freeze([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

/**
 * The default rpc endpoint: `defaultRpc` in config.json in the folder the
 * command runs in, else g4mm4's public endpoint, with a warning when
 * config.json cannot be read.
 *
 * @returns {string} The endpoint's url
 */
function defaultRpc() {
  let config;
  try {
    config = JSON.parse(fs.readFileSync("config.json", "utf8"));
  } catch {
    console.warn(
      "Warning: config.json not found or invalid. Using fallback default RPC.",
    );
    return FALLBACK_RPC;
  }
  return typeof config?.defaultRpc === "string" && config.defaultRpc !== ""
    ? config.defaultRpc
    : FALLBACK_RPC;
}

/**
 * Finds the block whose time is nearest a time, by a binary search over the
 * block numbers.
 *
 * @param {ethers.JsonRpcProvider} provider - The provider of the rpc endpoint
 * @param {number} targetTimestamp - The time, in seconds since 1970
 * @returns {Promise<number>} The block's number
 * @throws {Error} When a block cannot be read
 */
async function findBlockByTimestamp(provider, targetTimestamp) {
  let low = 1;
  let high = await provider.getBlockNumber();
  let closestBlock = low;
  let closestDiff = Infinity;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const block = await provider.getBlock(mid);
    if (block === null) {
      throw new Error(`Failed to fetch block ${mid}`);
    }
    const diff = Math.abs(block.timestamp - targetTimestamp);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestBlock = mid;
    }
    if (block.timestamp < targetTimestamp) {
      low = mid + 1;
    } else if (block.timestamp > targetTimestamp) {
      high = mid - 1;
    } else {
      return mid;
    }
  }
  return closestBlock;
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
      options.block ?? (await findBlockByTimestamp(provider, options.date));
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
await buildBalanceCommand(defaultRpc())
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
