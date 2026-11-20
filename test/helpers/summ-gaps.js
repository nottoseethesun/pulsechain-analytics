/**
 * Builds the legs, transactions and Summ rows the tests of the Summ
 * sweep's gap rules book, and runs `rowsForGaps` on them.
 * @module test/helpers/summ-gaps
 *
 * What: `rowsForGaps` takes what the sweep has read by the time the match
 * is done: the wallet's legs, the transactions it sent and their PLS, the
 * legs and parts Summ lacks, the coins of collects, LP Ranger's records
 * and Summ's rows. These builders make each from the values a test sets,
 * with made-up wallets, tokens and hashes, every address in EIP-55's
 * mixed case, and `runGaps` fills in what a test leaves out: no Summ
 * rows, no collects, empty owner's lists, and a time reached by Summ's
 * sync after every transaction.
 *
 * Fit: `test/summ-sweep-gap-rules.test.js` and `test/summ-sweep-gaps.test.js`
 * use it.
 */

import { ZeroAddress, getAddress } from "ethers";
import { rowsForGaps } from "../../summ-sweep/gaps.js";
import { ownerLists } from "../../summ-sweep/owner-lists.js";
import {
  HEX,
  ONE,
  OTHER,
  PM,
  POOL,
  TKN,
  WALLET,
  WPLS,
  hashOf,
} from "./summ-sweep-case.js";

export { HEX, ONE, OTHER, PM, POOL, TKN, WALLET, WPLS, hashOf };

/** A router: made up, in EIP-55's mixed case. */
export const ROUTER = getAddress(`0x${"ee".repeat(20)}`);

/** A second made-up token, in EIP-55's mixed case. */
export const DAI = getAddress(`0x${"d1".repeat(20)}`);

/** A third made-up token, in EIP-55's mixed case. */
export const MAXI = getAddress(`0x${"d2".repeat(20)}`);

/** The zero address. */
export const ZERO = ZeroAddress;

/** A made-up time, in seconds since 1970: 2023-11-14 22:13:20 UTC. */
export const TIME = 1_700_000_000;

/** The time Summ's sync reached, unless a test sets one: after them all. */
const SYNCED_TO = TIME + 1_000_000;

/** One PLS, in wei. */
export const PLS_ONE = 10n ** 18n;

/** The symbol of each made-up or public token the tests use. */
const SYMBOLS = new Map([
  [HEX, "HEX"],
  [TKN, "TKN"],
  [DAI, "DAI"],
  [MAXI, "MAXI"],
  [WPLS, "WPLS"],
  [PM, "9MM-V3-POS"],
]);

/**
 * A leg of the wallet's, as `tokenLegs` gives it.
 *
 * @param {object} changes - The values to set; `n`, the number of its
 *   transaction's hash and of the block's second after `TIME`
 * @returns {object} The leg
 */
export function gapLeg({ n = 0, ...changes }) {
  const token = changes.token ?? TKN;
  return {
    hash: hashOf(n),
    blockNumber: n,
    timestamp: TIME + n,
    logIndex: 0,
    direction: "in",
    token,
    symbol: SYMBOLS.get(token) ?? null,
    decimals: 8,
    amount: ONE,
    counterparty: OTHER,
    ...changes,
  };
}

/**
 * A transaction the wallet sent, and its PLS, as the history holds them.
 *
 * @param {number} n - The number of its hash, and of its second after
 *   `TIME`
 * @param {object} [changes] - `to`, and the values of its PLS to set
 * @returns {{sent: object, flow: object}} The transaction and its PLS
 */
export function sentBy(n, { to = ROUTER, ...flow } = {}) {
  return {
    sent: {
      hash: hashOf(n),
      blockNumber: n,
      timestamp: TIME + n,
      nonce: n,
      to,
      value: 0n,
    },
    flow: {
      hash: hashOf(n),
      blockNumber: n,
      timestamp: TIME + n,
      succeeded: true,
      gasPaid: 300n,
      sent: 0n,
      handedBack: [],
      change: -300n,
      ...flow,
    },
  };
}

/**
 * A row of Summ's for a transaction, as the sweep holds it.
 *
 * @param {number} n - The number of its transaction's hash, and of its
 *   second after `TIME`
 * @param {string} category - Its category
 * @returns {object} The row
 */
export function summRowOf(n, category) {
  return { hash: hashOf(n), timestamp: TIME + n, category };
}

/**
 * Runs `rowsForGaps` on what a test sets.
 *
 * @param {object} input - `legs`, the wallet's; `gaps`, those Summ lacks,
 *   or else all the legs; `txs`, from `sentBy`; and, when set, `splits`,
 *   `problems`, `records`, `summRows`, `syncedTo`, the time Summ's sync
 *   reached, and `owner`, the owner's settings
 * @returns {{rows: object[], questions: object[]}} What it gives
 */
export function runGaps(input) {
  const legs = input.legs ?? [];
  const txs = input.txs ?? [];
  return rowsForGaps({
    wallet: WALLET,
    history: {
      sent: txs.map((one) => one.sent),
      own: txs.map((one) => one.flow),
      legs,
    },
    unmatched: input.gaps ?? legs,
    splits: input.splits ?? [],
    problems: input.problems ?? [],
    records: input.records ?? new Map(),
    summRows: input.summRows ?? [],
    syncedTo: input.syncedTo ?? SYNCED_TO,
    lists: ownerLists(input.owner ?? {}),
    chain: { positionManager: PM },
  });
}

/**
 * The parts of a row a test reads most: its type, symbol, amount, sides
 * and contract.
 *
 * @param {object} row - The row
 * @returns {Array} `[type, symbol, raw amount, from, to, contract]`
 */
export function brief(row) {
  return [
    row.type,
    row.baseCurrency,
    row.baseAmount.raw,
    row.from,
    row.to,
    row.contractAddress,
  ];
}
