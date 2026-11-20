/**
 * Reconciles the legs of each withdrawal from a 9mm V3 position with
 * Summ, where Summ holds its principal and fees together.
 * @module summ-sweep/splits
 *
 * What: a collect pays the wallet a position's principal and its fees in
 * one transfer per coin, and Summ often holds that transfer as one leg,
 * which books the fees as liquidity removed, or leaves the leg
 * uncategorised. The owner books the fees as income. So for each coin of a
 * collect with principal (`splitCollects`), there are three cases. Summ
 * holds the whole amount on one leg: the leg is to be set to the principal
 * and the category Remove liquidity, which Claude does through the Summ
 * connector, and the fee comes in as an income row of the csv. Summ holds
 * the principal and the fee as two legs, as it does once that is done: the
 * coin is reconciled. Summ holds neither: both parts are gaps, written as
 * rows like any other.
 *
 * How: the legs are first matched whole (`matchLegs`). A coin of a collect
 * with principal whose whole leg matched is a split to fix. A coin whose
 * leg did not match is put back as two parts, the principal and the fee,
 * which are matched against Summ's legs still unmatched. A coin the
 * position manager paid as PLS, unwrapping the pool's WPLS, has no token
 * leg, since the payment is a call inside the transaction rather than a
 * Transfer log, and Summ's legs of PLS are not matched; such a coin is
 * handed back apart.
 *
 * Fit: the sweep lists the splits to fix in its report, for Claude to make
 * in Summ, and writes their income rows to the csv with the gap rows.
 */

import { decimalText } from "./amounts.js";

/**
 * The legs of a collect's coin: the wallet's token legs in, in the
 * collect's transaction, of that coin.
 *
 * @param {object[]} legs - The chain's token legs
 * @param {{hash: string, token: string}} split - The coin of the collect
 * @returns {object[]} Its legs
 */
function legsOfSplit(legs, split) {
  return legs.filter(
    (leg) =>
      leg.hash === split.hash &&
      leg.direction === "in" &&
      leg.token === split.token &&
      leg.nftId === undefined,
  );
}

/**
 * The income row of a split's fee.
 *
 * @param {object} split - The coin of the collect
 * @param {object} leg - Its first leg
 * @param {string} wallet - The wallet
 * @param {string} symbol - The coin's symbol in the csv
 * @returns {object} The row, as the Summ csv utility takes it
 */
function feeRow(split, leg, wallet, symbol) {
  const received = decimalText(split.received, leg.decimals);
  const principal = decimalText(split.principal, leg.decimals);
  return {
    timestamp: leg.timestamp,
    type: "income",
    baseCurrency: symbol,
    baseAmount: { raw: split.fee, decimals: leg.decimals },
    from: leg.counterparty,
    to: wallet,
    blockchain: "pulsechain",
    id: split.hash,
    description: `LP Ranger fee income from 9mm V3 position #${split.nftId}: the fee part of the ${received} ${symbol} it paid out, less the principal ${principal}. Summ holds the whole ${received} on one leg, which is set to the principal, as Remove liquidity.`,
    contractAddress: split.token,
  };
}

/**
 * Sorts each coin of each collect with principal into Summ's three cases.
 *
 * @param {object} work - What to reconcile
 * @param {object[]} work.splits - Each coin of each collect, from
 *   `splitCollects`
 * @param {object[]} work.legs - The chain's token legs
 * @param {Map<object, object>} work.matches - The legs matched whole, with
 *   Summ's legs, from `matchLegs`
 * @param {string} work.wallet - The wallet
 * @param {function(string, string): string} work.csvSymbolOf - A token's
 *   symbol in the csv, from its contract and its own symbol
 * @returns {{fixes: object[], rows: object[], parts: object[],
 *   splitLegs: Set<object>, paidAsCoin: object[]}} The splits to fix in
 *   Summ, each with Summ's leg; the income rows of their fees; the parts of
 *   the coins Summ did not hold whole, to be matched again; every leg of a
 *   coin with principal, which the parts stand for where Summ did not hold
 *   it whole; and the coins with principal paid as PLS, which have no leg
 */
export function sortSplits({ splits, legs, matches, wallet, csvSymbolOf }) {
  const fixes = [];
  const rows = [];
  const parts = [];
  const splitLegs = new Set();
  const paidAsCoin = [];
  for (const split of splits) {
    if (split.principal === 0n) continue;
    const coinLegs = legsOfSplit(legs, split);
    if (coinLegs.length === 0) {
      paidAsCoin.push(split);
      continue;
    }
    for (const leg of coinLegs) splitLegs.add(leg);
    const [first] = coinLegs;
    const summLeg = matches.get(first);
    if (summLeg !== undefined) {
      fixes.push({ ...split, decimals: first.decimals, summLeg });
      if (split.fee > 0n)
        rows.push(
          feeRow(split, first, wallet, csvSymbolOf(first.token, first.symbol)),
        );
      continue;
    }
    parts.push({ ...first, amount: split.principal, part: "principal", split });
    if (split.fee > 0n)
      parts.push({ ...first, amount: split.fee, part: "fee", split });
  }
  return { fixes, rows, parts, splitLegs, paidAsCoin };
}
