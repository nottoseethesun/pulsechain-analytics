/**
 * The legs of a wallet's history: each token one transaction moved into or
 * out of the wallet, as one leg.
 * @module summ-sweep/legs
 *
 * What: Summ keeps a transaction as legs, one per token in and per token
 * out, so the chain's side is read into the same shape before the two are
 * compared. `tokenLegs` turns the logs that name the wallet
 * (`walletTransferLogs`, in `wallet-history/transfers.js`) into legs: a
 * Transfer of an ERC-20 token, with its amount; a Transfer of an NFT, such
 * as a 9mm V3 position, with its id and an amount of one; and the wrapped
 * coin's Deposit and Withdrawal, the WPLS a wallet received for PLS it
 * wrapped, and gave up for PLS it unwrapped.
 *
 * How: an ERC-20 Transfer names the sender and receiver in its second and
 * third topics and holds the amount in its data; an NFT's names the
 * token's id in a fourth topic. A Transfer from the wallet to itself is a
 * leg out and a leg in. Each leg carries its token's symbol and decimals,
 * from `tokenFacts`, or `null` for each its contract did not give, and
 * its block's time; an NFT's decimals are 0. Its addresses, the token's
 * and the counterparty's, are in EIP-55's mixed case, and its hash in
 * lower case.
 *
 * Fit: `summ-sweep/match.js` matches these legs with Summ's.
 */

import { getAddress } from "ethers";
import {
  DEPOSIT_TOPIC,
  TRANSFER_TOPIC,
  WITHDRAWAL_TOPIC,
} from "../wallet-history/transfers.js";
import { sameAddress } from "../wallet-history/sent.js";

/**
 * The address an indexed topic holds.
 *
 * @param {string} topic - The topic: 32 bytes, the address in the last 20
 * @returns {string} The address, in EIP-55's mixed case
 */
function topicAddress(topic) {
  return getAddress(`0x${topic.slice(26)}`);
}

/**
 * The legs one log makes for the wallet.
 *
 * @param {object} log - The log
 * @param {string} wallet - The wallet
 * @param {string} wrappedCoin - The wrapped coin's contract
 * @returns {Array<object>} The legs, without their token's facts and time
 */
function legsOfLog(log, wallet, wrappedCoin) {
  const token = getAddress(log.address);
  const at = {
    hash: log.transactionHash.toLowerCase(),
    blockNumber: log.blockNumber,
    logIndex: log.index,
    token,
  };
  const topic = log.topics[0].toLowerCase();
  if (topic === DEPOSIT_TOPIC || topic === WITHDRAWAL_TOPIC) {
    if (!sameAddress(token, wrappedCoin)) return [];
    const deposit = topic === DEPOSIT_TOPIC;
    return [
      {
        ...at,
        direction: deposit ? "in" : "out",
        amount: BigInt(log.data),
        counterparty: token,
        wrap: deposit ? "deposit" : "withdrawal",
      },
    ];
  }
  if (topic !== TRANSFER_TOPIC) return [];
  const from = topicAddress(log.topics[1]);
  const to = topicAddress(log.topics[2]);
  const nft = log.topics.length === 4;
  const moved = nft
    ? { amount: 1n, nftId: BigInt(log.topics[3]) }
    : { amount: BigInt(log.data) };
  const legs = [];
  if (sameAddress(from, wallet))
    legs.push({ ...at, ...moved, direction: "out", counterparty: to });
  if (sameAddress(to, wallet))
    legs.push({ ...at, ...moved, direction: "in", counterparty: from });
  return legs;
}

/**
 * The token legs of a wallet's history.
 *
 * @param {object} history - What the chain holds
 * @param {string} history.wallet - The wallet
 * @param {object[]} history.logs - The logs that name it, from
 *   `walletTransferLogs`
 * @param {Map<string, {symbol: (string|null), decimals: (number|null)}>}
 *   history.tokens - Each token's facts, by contract in EIP-55's mixed
 *   case
 * @param {Map<number, number>} history.times - Each block's time, in
 *   seconds since 1970
 * @param {string} history.wrappedCoin - The wrapped coin's contract
 * @returns {Array<{hash: string, blockNumber: number, timestamp: number,
 *   logIndex: number, direction: string, token: string,
 *   symbol: (string|null), decimals: (number|null), amount: bigint,
 *   counterparty: string, nftId?: bigint, wrap?: string}>} The legs, in
 *   the logs' order
 */
export function tokenLegs({ wallet, logs, tokens, times, wrappedCoin }) {
  return logs
    .flatMap((log) => legsOfLog(log, wallet, wrappedCoin))
    .map((leg) => {
      const facts = tokens.get(leg.token) ?? { symbol: null, decimals: null };
      return {
        ...leg,
        timestamp: times.get(leg.blockNumber),
        symbol: facts.symbol,
        decimals: leg.nftId === undefined ? facts.decimals : 0,
      };
    });
}
