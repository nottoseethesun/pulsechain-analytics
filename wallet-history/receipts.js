/**
 * The receipts of a wallet's transactions, and the symbol and decimals of
 * each token they moved.
 * @module wallet-history/receipts
 *
 * What: a receipt holds what a transaction did: whether it succeeded, the
 * gas it used and the price it paid per unit, and every log it left.
 * `readReceipts` reads the receipt of each transaction once, however many
 * times the wallet's history names it. A token's amount in a log is a
 * whole number of its smallest units, and its symbol and decimals are
 * answers of its contract: `tokenFacts` asks each contract once.
 *
 * How: receipts are asked for in sets, each set in one turn of the paced
 * provider, which ethers sends as one json-rpc batch. A token's facts are
 * two calls of its contract, `symbol()` and `decimals()`, whose answers
 * are decoded here: the symbol as an ABI string, or, from an older
 * contract that answers with 32 bytes, as that text without its padding.
 * A contract that refuses `decimals()`, as an NFT's does, has none.
 *
 * Fit: `ownCoinFlows` (`wallet-history/coin-flows.js`) reads the gas of
 * each transaction the wallet sent from its receipt, and a sweep of a
 * wallet writes each token's amount with its decimals.
 */

import { AbiCoder, getAddress } from "ethers";

/** The selector of `symbol()`. */
const SYMBOL_SELECTOR = "0x95d89b41";

/** The selector of `decimals()`. */
const DECIMALS_SELECTOR = "0x313ce567";

/**
 * Every receipt of a list of transactions, each read once.
 *
 * @param {{askAll: function}} paced - The paced provider
 * @param {string[]} hashes - The transactions' hashes, in any case, once
 *   or more each
 * @param {object} reading - How to read
 * @param {number} reading.batchSize - The most receipts one turn asks for
 * @returns {Promise<Map<string, object>>} Each receipt, by hash in lower
 *   case
 * @throws {Error} When the endpoint holds no receipt for a hash, since the
 *   transaction is not mined or the endpoint is behind, and a sweep must
 *   not go on without it
 */
export async function readReceipts(paced, hashes, { batchSize }) {
  const unique = [...new Set(hashes.map((hash) => hash.toLowerCase()))];
  const receipts = new Map();
  for (let start = 0; start < unique.length; start += batchSize) {
    const batch = unique.slice(start, start + batchSize);
    const answers = await paced.askAll(
      "getTransactionReceipt",
      batch.map((hash) => [hash]),
    );
    answers.forEach((receipt, at) => {
      if (receipt === null)
        throw new Error(
          `The endpoint holds no receipt for ${batch[at]}: the transaction is not mined, or the endpoint is behind`,
        );
      receipts.set(batch[at], receipt);
    });
  }
  return receipts;
}

/**
 * A contract's answer to a call, or `null` when the contract refuses it.
 *
 * @param {{ask: function}} paced - The paced provider
 * @param {string} address - The contract
 * @param {string} data - The call's data
 * @returns {Promise<string|null>} The answer, as hex
 * @throws {Error} When the endpoint fails, which is not the contract's
 *   answer
 */
async function answerOf(paced, address, data) {
  try {
    const answer = await paced.ask("call", { to: address, data });
    return answer === "0x" ? null : answer;
  } catch (thrown) {
    if (
      typeof thrown === "object" &&
      thrown !== null &&
      thrown.code === "CALL_EXCEPTION"
    )
      return null;
    throw thrown;
  }
}

/**
 * A symbol from a contract's answer: an ABI string, or 32 bytes of text
 * padded with zeros.
 *
 * @param {string} answer - The answer, as hex
 * @returns {string} The symbol
 */
function symbolOf(answer) {
  try {
    return AbiCoder.defaultAbiCoder().decode(["string"], answer)[0];
  } catch {
    return Buffer.from(answer.slice(2, 66), "hex")
      .toString("utf8")
      .replace(/\0+$/, "");
  }
}

/**
 * The symbol and decimals of each token, by asking its contract.
 *
 * @param {{ask: function}} paced - The paced provider
 * @param {string[]} addresses - The tokens' contracts, in any case, once
 *   or more each
 * @returns {Promise<Map<string, {symbol: (string|null),
 *   decimals: (number|null)}>>} Each token's facts, by contract in EIP-55's
 *   mixed case; `null` where the contract refuses the call
 */
export async function tokenFacts(paced, addresses) {
  const unique = [...new Set(addresses.map((address) => getAddress(address)))];
  const facts = new Map();
  for (const address of unique) {
    const symbol = await answerOf(paced, address, SYMBOL_SELECTOR);
    const decimals = await answerOf(paced, address, DECIMALS_SELECTOR);
    facts.set(address, {
      symbol: symbol === null ? null : symbolOf(symbol),
      decimals: decimals === null ? null : Number(BigInt(decimals)),
    });
  }
  return facts;
}
