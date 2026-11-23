/**
 * @fileoverview
 * This is a module for programs on Node, the program that runs JavaScript outside a browser: it reads the Pulsechain
 * blockchain (a fork of Ethereum) with ethers.js, a library for talking to Ethereum-style chains. Running this file
 * alone does nothing; other code imports its function.
 * It provides a function to read how much of a specific ERC-20 token one transaction transferred to a given wallet address.
 * It reads the transaction's own receipt and adds up the token's Transfer events to the wallet in it. The receipt holds
 * that transaction's events alone, so another transaction in the same block never counts, and it needs no archive node,
 * since no past balance is read.
 *
 * @requires Node 24 or later, as the repo's package.json says
 * @requires ethers.js (install via: npm install ethers)
 * @requires crypto-price-fetchers, the owner's repo of code his projects share, which `npm ci` installs: its Summ csv
 *   utility's `decimalFromRaw` writes the amount for any decimals from 0 to 255, as a token's uint8 holds them
 *
 * How to use:
 * 1. Install dependencies: run `npm ci` in the repo's top folder.
 * 2. To use the function in your own code: import `getTokenTransferred` from this file and call
 *    `getTokenTransferred(txId, tokenAddress, walletAddress)` in an async context, awaiting the result.
 * 3. The tests in `test/` check it against a stand-in chain: `npm test`.
 *
 * Note: This module connects to a public Pulsechain RPC endpoint ('https://rpc-pulsechain.g4mm4.io'). Ensure the endpoint is reliable;
 *       you may replace it with another RPC provider if needed (e.g., for rate limiting or privacy). Each call makes its own
 *       provider, set to PulseChain's chain id, 369, so it never asks the endpoint which network it is, and closes it when
 *       the call ends, whether the read worked or not.
 *
 * Limitations:
 * - Counts a Transfer event only when the token's own contract emitted it, with the sender and receiver indexed and the
 *   amount in its data, as ERC-20 has it. An NFT's Transfer event, whose third indexed value is the token id, is not counted.
 * - Returns 0 when the transaction transferred none of the token to the wallet. When a read fails, or the transaction is
 *   not found, it throws, so a failure is never mistaken for an amount; so it does, before it asks the chain, for a token
 *   or wallet that is not 0x and 40 hex digits, naming it. Spaces around an address or the transaction's hash are
 *   dropped, and an address is taken in any case, as the Sheets script takes them.
 * - The amount is cut off at 7 decimal places and returned as a number, as the Sheets script returns it. A number keeps
 *   all 7 places for an amount below 2^29, 536,870,912 tokens; from there up, the conversion can round the 7th place.
 * - Assumes the token is ERC-20 compliant with the `decimals()` function and the Transfer event.
 */

import { ethers } from "ethers";
import { decimalFromRaw } from "crypto-price-fetchers/summ-csv";

/**
 * PulseChain's network, which the provider takes as it is made rather
 * than asking the endpoint for it.
 */
const PULSECHAIN = ethers.Network.from(369);

/** The topic an ERC-20 Transfer event leads with: keccak256 of its signature. */
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

/** The decimal places of the amount returned. */
const DECIMAL_PLACES_RETURNED = 7;

/** An address, put in lower case as a caller's is before it is checked: 0x and 40 hex digits. */
const ADDRESS_FORM = /^0x[0-9a-f]{40}$/;

/**
 * Refuses a token or a wallet that is not an address, naming it, as the Sheets copy does, so a mistyped address is
 * never taken for one that received nothing; and gives the address as the Sheets copy takes it: without the spaces
 * around it, as a cell may hold them, and in lower case, which ethers takes whatever the case it was written in,
 * where a mixed case that is not its EIP-55 checksum would be refused.
 *
 * @param {string} what - What the address is, such as "wallet"
 * @param {string} address - The address given
 * @returns {string} The address, trimmed and in lower case
 * @throws {Error} When it is not 0x and 40 hex digits
 */
function checkAddress(what, address) {
  const text = String(address).trim().toLowerCase();
  if (!ADDRESS_FORM.test(text)) {
    throw new Error(
      `The ${what} ${text} is not an address: 0x and 40 hex digits`,
    );
  }
  return text;
}

/**
 * Adds up the token's Transfer events to the wallet among a receipt's logs.
 *
 * @param {Array<{address: string, topics: ReadonlyArray<string>, data: string}>} logs - The receipt's logs
 * @param {string} tokenAddress - The token's contract address, in any case
 * @param {string} walletAddress - The wallet's address, in any case
 * @returns {bigint} The raw amount, in the token's smallest unit
 */
export function sumTransfersTo(logs, tokenAddress, walletAddress) {
  const token = ethers.getAddress(tokenAddress.toLowerCase());
  const wallet = ethers.getAddress(walletAddress.toLowerCase());
  let total = 0n;
  for (const log of logs) {
    const isTokenTransferToWallet =
      ethers.getAddress(log.address.toLowerCase()) === token &&
      log.topics.length === 3 &&
      log.topics[0].toLowerCase() === TRANSFER_TOPIC &&
      ethers.getAddress(ethers.dataSlice(log.topics[2], 12)) === wallet;
    if (isTokenTransferToWallet) total += ethers.toBigInt(log.data);
  }
  return total;
}

/**
 * Awaits a read, and on failure throws an error that says what could not be read.
 *
 * @param {string} what - What the read reads, such as "the receipt of 0x…"
 * @param {Promise<*>} reading - The read
 * @returns {Promise<*>} What it read
 * @throws {Error} When the read fails
 */
async function read(what, reading) {
  try {
    return await reading;
  } catch (error) {
    throw new Error(
      `Cannot read ${what}: ${error.shortMessage ?? error.message}`,
      { cause: error },
    );
  }
}

/**
 * Writes an amount in whole tokens, cut off at 7 decimal places.
 *
 * @param {string} wholeTokens - The amount as decimal text, such as "250" or "0.0001"
 * @returns {number} The amount
 */
function cutOffDecimals(wholeTokens) {
  const [integerPart, fractionPart = ""] = wholeTokens.split(".");
  return parseFloat(
    `${integerPart}.${fractionPart.padEnd(DECIMAL_PLACES_RETURNED, "0").slice(0, DECIMAL_PLACES_RETURNED)}`,
  );
}

/**
 * Reads how much of a token one transaction transferred to a wallet, from the transaction's receipt.
 *
 * @param {string} txId - The transaction hash (e.g., '0xab9c6162b16c9e26149720420cb73c7d445d31b150cf448f3e91da13125b1bd8').
 * @param {string} tokenAddress - The address of the ERC-20 token contract (e.g., '0x8a7FDcA264e87b6da72D000f22186B4403081A2a').
 * @param {string} walletAddress - The wallet address to check transfers to (e.g., '0xbCB167f16A1aA3ca3F483CC922967e9aCdEC405D').
 * @returns {Promise<number>} The amount, cut off at 7 decimal places, or 0 if the transaction transferred none of the token to the wallet.
 * @throws {Error} When a read fails or the transaction is not found.
 */
export async function getTokenTransferred(txId, tokenAddress, walletAddress) {
  const tokenGiven = checkAddress("token", tokenAddress);
  const walletGiven = checkAddress("wallet", walletAddress);
  // As the Sheets copy takes it: without the spaces around it, which a
  // node refuses
  const transaction = String(txId).trim().toLowerCase();
  const provider = new ethers.JsonRpcProvider(
    "https://rpc-pulsechain.g4mm4.io",
    PULSECHAIN,
    { staticNetwork: PULSECHAIN },
  );
  // The provider is closed whatever happens, so it leaves no timer
  // running that would keep the program from ending
  try {
    const receipt = await read(
      `the receipt of ${transaction}`,
      provider.getTransactionReceipt(transaction),
    );
    if (receipt === null) {
      throw new Error(
        `Transaction ${transaction} not found; it may still be pending`,
      );
    }
    const total = sumTransfersTo(receipt.logs, tokenGiven, walletGiven);
    if (total === 0n) {
      return 0;
    }
    const token = new ethers.Contract(
      tokenGiven,
      ["function decimals() view returns (uint8)"],
      provider,
    );
    const decimals = await read(
      `the decimals of ${tokenGiven}`,
      token.decimals(),
    );
    // Up to 255 decimals, as a uint8 holds, where ethers' formatUnits
    // takes 80
    return cutOffDecimals(decimalFromRaw(total, Number(decimals)));
  } finally {
    provider.destroy();
  }
}
