/**
 * Sweeps a wallet: compares what the chain shows it moved with what Summ
 * holds, and works out what Summ lacks or holds wrongly.
 * @module summ-sweep/sweep
 *
 * What: `sweepWallet` reads the wallet's history over a range of blocks
 * from the chain alone (`wallet-history/`), turns it into legs, one per
 * token in or out of each transaction (`summ-sweep/legs.js`), and matches
 * them with Summ's legs (`summ-sweep/match.js`). Each withdrawal from a
 * 9mm V3 position is read through LP Ranger's own tool and split into
 * principal and fees (`summ-sweep/positions.js`), and reconciled with
 * Summ (`summ-sweep/splits.js`). The legs and parts Summ lacks become
 * rows or questions (`summ-sweep/gaps.js`). What it gives back is what a
 * sweep acts on: the splits to fix in Summ, the rows for the csv (the
 * fixes' income rows and the gaps' rows), the questions for the owner,
 * Summ's legs no leg matched, and every problem it found. A withdrawal
 * the position manager paid as PLS is one of the problems, since the
 * sweep matches token legs only; so is a position's first collect in the
 * range when the position was owed coins as the range began
 * (`summ-sweep/owed.js`), since part of it may be principal from before
 * the range; and so is a Transfer log from which `summ-sweep/legs.js`
 * reads no leg: one of a shape no ERC-20 or NFT Transfer has, or a
 * four-topic one whose contract gives decimals.
 *
 * How: the steps run in the order each needs the last: the logs and the
 * wallet's own transactions first, then their receipts, the PLS each moved
 * and the PLS from elsewhere, then the tokens' facts and the blocks'
 * times, and only then the match. A block the search for the wallet's
 * transactions read already gives its time, so only the other blocks the
 * logs name are read for theirs. A change in the wallet's balance the
 * search for PLS cannot explain stops the sweep, since a history missing a
 * payment would be compared as if it were whole. Addresses are put in
 * EIP-55's mixed case where they come in: the wallet, the chain's
 * contracts and the owner's lists.
 *
 * Fit: `summ-sweep/command-line.js` runs it for `npm run summ-sweep`, and
 * writes its rows through crypto-price-fetchers' Summ csv utility and its
 * report as json.
 */

import { getAddress, ZeroAddress } from "ethers";
import { blockTimes } from "../wallet-history/blocks.js";
import { walletTransferLogs } from "../wallet-history/transfers.js";
import { sameAddress, walletSentTransactions } from "../wallet-history/sent.js";
import { readReceipts, tokenFacts } from "../wallet-history/receipts.js";
import { ownCoinFlows } from "../wallet-history/coin-flows.js";
import { walletCoinInflows } from "../wallet-history/coin-inflows.js";
import { decimalText } from "./amounts.js";
import { rowsForGaps, sortRows } from "./gaps.js";
import { oddTransferLogs, tokenLegs } from "./legs.js";
import { attachManualRows, matchLegs, summLegsOf } from "./match.js";
import { csvSymbolOf, ownerLists } from "./owner-lists.js";
import { owedWhenRangeBegan } from "./owed.js";
import { collectedNftIds, splitCollects } from "./positions.js";
import { PLS_DECIMALS } from "./rows.js";
import { sortSplits } from "./splits.js";

/**
 * The problem of a Transfer log from which the sweep reads no leg.
 *
 * @param {{log: object, problem: string}} odd - The log, and why, from
 *   `oddTransferLogs`
 * @returns {{hash: string, problem: string}} The problem
 */
function oddLogProblem({ log, problem }) {
  return {
    hash: log.transactionHash.toLowerCase(),
    problem: `a Transfer log of ${getAddress(log.address)} ${problem}, so the sweep reads no leg from it`,
  };
}

/**
 * The problem of a coin the position manager paid as PLS.
 *
 * @param {object} split - The coin, from `splitCollects`
 * @returns {{hash: string, problem: string}} The problem
 */
function paidAsCoinProblem(split) {
  const received = decimalText(split.received, PLS_DECIMALS);
  const fee = decimalText(split.fee, PLS_DECIMALS);
  return {
    hash: split.hash,
    problem: `position #${split.nftId} paid ${received} PLS through the position manager, ${fee} of it fees, and the sweep matches token legs only, so its principal and fees are not checked against Summ`,
  };
}

/**
 * Everything the chain shows the wallet moved in a range of blocks.
 *
 * @param {object} paced - The paced provider
 * @param {object} range - The wallet, the range and the chain's facts
 * @returns {Promise<object>} The logs, the wallet's transactions, their
 *   flows of PLS, the PLS from elsewhere, and the token legs
 */
async function readHistory(paced, range) {
  const { wallet, fromBlock, toBlock, chain } = range;
  const logs = await walletTransferLogs(paced, {
    wallet,
    wrappedCoin: chain.wrappedCoin,
    fromBlock,
    toBlock,
    spanBlocks: chain.spanBlocks,
  });
  const sent = await walletSentTransactions(paced, wallet, fromBlock, toBlock);
  const receipts = await readReceipts(
    paced,
    [...sent.map((one) => one.hash), ...logs.map((log) => log.transactionHash)],
    { batchSize: chain.batchSize },
  );
  const own = await ownCoinFlows(paced, {
    wallet,
    sent,
    receipts,
    batchSize: chain.batchSize,
  });
  const inflows = await walletCoinInflows(paced, {
    wallet,
    fromBlock,
    toBlock,
    own,
  });
  if (inflows.unexplained.length > 0)
    throw new Error(
      `The wallet's balance changed in a way no payment explains, in blocks ${inflows.unexplained.map((one) => one.blockNumber).join(", ")}, so the history is not whole`,
    );
  const tokens = await tokenFacts(
    paced,
    logs.map((log) => log.address),
  );
  const known = new Map(sent.map((one) => [one.blockNumber, one.timestamp]));
  const read = await blockTimes(
    paced,
    logs.map((log) => log.blockNumber).filter((number) => !known.has(number)),
    chain.batchSize,
  );
  const times = new Map([...known, ...read]);
  const legs = tokenLegs({
    wallet,
    logs,
    tokens,
    times,
    wrappedCoin: chain.wrappedCoin,
  });
  return {
    sent,
    receipts,
    own,
    payments: inflows.payments,
    legs,
    oddLogs: oddTransferLogs(logs, tokens),
  };
}

/**
 * The coins the wallet received in each transaction: its token legs in,
 * NFTs aside, and the PLS the position manager handed back, as the wrapped
 * coin.
 *
 * @param {object} history - The history read
 * @param {object} chain - The chain's facts, in EIP-55's mixed case
 * @returns {function(string): Map<string, bigint>} The coins received in a
 *   transaction, by contract
 */
function receivedIn(history, chain) {
  const wrapped = chain.wrappedCoin;
  return (transactionHash) => {
    const coins = new Map();
    const add = (coin, amount) =>
      coins.set(coin, (coins.get(coin) ?? 0n) + amount);
    for (const leg of history.legs)
      if (
        leg.hash === transactionHash &&
        leg.direction === "in" &&
        leg.nftId === undefined
      )
        add(leg.token, leg.amount);
    for (const flow of history.own)
      if (flow.hash.toLowerCase() === transactionHash)
        for (const payment of flow.handedBack)
          if (sameAddress(payment.from, chain.positionManager))
            add(wrapped, payment.amount);
    return coins;
  };
}

/**
 * Sweeps a wallet's range of blocks against Summ's rows.
 *
 * @param {object} paced - The paced provider of an endpoint that keeps
 *   past state and offers the debug methods
 * @param {object} sweep - What to sweep
 * @param {string} sweep.wallet - The wallet
 * @param {number} sweep.fromBlock - The range's first block
 * @param {number} sweep.toBlock - The range's last block
 * @param {object} sweep.chain - The chain's facts: `wrappedCoin`,
 *   `positionManager`, `spanBlocks`, `batchSize`
 * @param {object} sweep.owner - The owner's settings, which
 *   `summ-sweep/owner-lists.js` reads: his own wallets, his spam and
 *   income tokens, and each token's symbols in Summ and in a csv
 * @param {object[]} sweep.summRows - Summ's rows for the wallet, from
 *   `parseSummResults`
 * @param {number} sweep.syncedTo - The time Summ's sync of the wallet has
 *   read its transactions to, in seconds since 1970
 * @param {function(string[]): Promise<Map<string, object>>}
 *   sweep.readRecords - Reads transactions through LP Ranger's tool
 * @returns {Promise<object>} `history`; `records`; `unmatched`, the legs
 *   and parts Summ lacks; `summUnmatched`; `fixes`, the splits to fix in
 *   Summ; `rows`, for the csv; `questions`, for the owner; and `problems`
 */
export async function sweepWallet(paced, sweep) {
  const wallet = getAddress(sweep.wallet);
  const chain = {
    ...sweep.chain,
    positionManager: getAddress(sweep.chain.positionManager),
    wrappedCoin: getAddress(sweep.chain.wrappedCoin),
  };
  const lists = ownerLists(sweep.owner);
  const history = await readHistory(paced, { ...sweep, wallet, chain });
  const summRows = attachManualRows(sweep.summRows, history.legs);
  const summLegs = summLegsOf(summRows, wallet);
  const whole = matchLegs(history.legs, summLegs, lists.summSymbols);
  const order = history.sent
    .filter((one) => sameAddress(one.to, chain.positionManager))
    .map((one) => one.hash.toLowerCase());
  const records = await sweep.readRecords(order);
  const minted = new Set(
    history.legs
      .filter(
        (leg) =>
          leg.nftId !== undefined &&
          leg.direction === "in" &&
          leg.counterparty === ZeroAddress &&
          sameAddress(leg.token, chain.positionManager),
      )
      .map((leg) => String(leg.nftId)),
  );
  const owedAtStart = await owedWhenRangeBegan(paced, {
    positionManager: chain.positionManager,
    nftIds: collectedNftIds(order, records).filter((id) => !minted.has(id)),
    fromBlock: sweep.fromBlock,
  });
  const { splits, problems } = splitCollects({
    order,
    records,
    receivedIn: receivedIn(history, chain),
    owedAtStart,
  });
  const sorted = sortSplits({
    splits,
    legs: history.legs,
    matches: whole.matches,
    wallet,
    csvSymbolOf: (token, symbol) => csvSymbolOf(lists, token, symbol),
  });
  const parts = matchLegs(
    sorted.parts,
    summLegs,
    lists.summSymbols,
    whole.used,
  );
  const unmatched = [
    ...whole.unmatched.filter((leg) => !sorted.splitLegs.has(leg)),
    ...parts.unmatched,
  ];
  const gaps = rowsForGaps({
    wallet,
    history,
    unmatched,
    splits,
    problems,
    records,
    summRows,
    syncedTo: sweep.syncedTo,
    lists,
    chain,
  });
  return {
    history,
    records,
    unmatched,
    summUnmatched: parts.summUnmatched,
    fixes: sorted.fixes,
    rows: sortRows([...sorted.rows, ...gaps.rows]),
    questions: gaps.questions,
    problems: [
      ...problems,
      ...sorted.paidAsCoin.map(paidAsCoinProblem),
      ...history.oddLogs.map(oddLogProblem),
    ],
  };
}
