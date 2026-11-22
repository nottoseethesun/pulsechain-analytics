/**
 * Which legs of a wallet's history Summ holds, and which it lacks.
 * @module summ-sweep/match
 *
 * What: a leg the chain shows is in Summ when one of Summ's rows for the
 * same transaction holds the same token, going the same way, in the same
 * amount, to what Summ's figure can say (`summHolds`). A matching hash
 * alone proves nothing: Summ can hold a transaction's gas, as an
 * approval, and none of its tokens, the first of the ways the owner's
 * skill for missing transactions lists in which Summ's sync records a
 * transaction wrongly. `matchLegs` matches every leg it can and gives back
 * those it cannot, the gaps a sweep writes rows for, and Summ's legs that
 * matched no leg, for the owner to look at.
 *
 * How: Summ prints a token by a symbol of its own, which is not always the
 * contract's: both PulseChain's HEX and the HEX bridged from Ethereum show
 * as `HEX`, and bridged ICSA as `EICSA` or `ICSA`. So each token's symbols
 * in Summ come from the owner's list, by contract, or else are the
 * contract's own symbol in capitals; a token whose contract gave no
 * symbol, and that the list leaves out, matches nothing. A row's incoming
 * amounts are the wallet's when the row's receiver is the wallet, or it
 * names none, and its outgoing amounts when its sender is, or it names
 * none. Summ's trade rows name the wallet on both sides, so both their
 * sides are the wallet's; a transfer between two wallets lists both sides,
 * and only the wallet's side is its. Within a transaction and a direction, each leg is
 * matched to one of Summ's amounts first; then the legs of one token left
 * over are added up and matched to one amount, as Summ holds a swap
 * routed through more than one pool as one amount. Summ prints an NFT's
 * quantity as 1 or as 0, and either matches it. PLS, which moves without
 * a log, is left out on both sides. A Summ leg matches one leg, or one
 * sum, only: each match returns the Summ legs it used, and a later match
 * of other legs takes them, so it leaves them out.
 *
 * Fit: the sweep matches the chain's legs whole, then the parts of the
 * withdrawals Summ did not hold whole, against the Summ legs the first
 * match left (`summ-sweep/sweep.js`).
 */

import { getAddress } from "ethers";
import { summHolds } from "./amounts.js";
import { groupBy } from "./group-by.js";
import { PLS } from "./rows.js";

/**
 * Gives each row the owner entered by hand in Summ the hash of the
 * transaction it stands for.
 *
 * A row entered by hand carries no transaction hash: Summ's hash ends in
 * `-manual`. It stands for the transaction whose block has the row's time,
 * when one transaction does; when more than one does, for the one with a
 * leg of an amount the row holds, when one does. Otherwise it keeps its
 * own hash, so it matches no leg and is listed with Summ's unmatched legs.
 *
 * @param {object[]} rows - Summ's rows
 * @param {object[]} legs - The chain's token legs
 * @returns {object[]} The rows, each row entered by hand with the hash of
 *   its transaction where one is found
 */
export function attachManualRows(rows, legs) {
  return rows.map((row) => {
    if (typeof row.hash !== "string" || !row.hash.endsWith("-manual"))
      return row;
    const sameTime = legs.filter((leg) => leg.timestamp === row.timestamp);
    const hashes = [...new Set(sameTime.map((leg) => leg.hash))];
    const amounts = [...row.incoming, ...row.outgoing].map(
      (item) => item.amount,
    );
    const holding = hashes.filter((hash) =>
      sameTime.some(
        (leg) =>
          leg.hash === hash &&
          amounts.some((amount) => summHolds(leg.amount, leg.decimals, amount)),
      ),
    );
    if (hashes.length === 1) return { ...row, hash: hashes[0] };
    if (holding.length === 1) return { ...row, hash: holding[0] };
    return row;
  });
}

/**
 * Summ's legs for the wallet, by transaction hash and direction.
 *
 * @param {object[]} rows - Summ's rows, from `parseSummResults`
 * @param {string} wallet - The wallet
 * @returns {Map<string, {in: object[], out: object[]}>} Each transaction's
 *   legs: `amount` as Summ prints it, `symbol`, and the `row`
 */
export function summLegsOf(rows, wallet) {
  const own = getAddress(wallet);
  const legs = new Map();
  for (const row of rows) {
    if (typeof row.hash !== "string") continue;
    const toWallet = row.to.address === own;
    const fromWallet = row.from.address === own;
    const transferOut =
      row.category === "transfer" && !(toWallet && fromWallet);
    const takesIn = transferOut
      ? toWallet
      : toWallet || row.to.address === null;
    const takesOut = transferOut
      ? fromWallet
      : fromWallet || row.from.address === null;
    const entry = legs.get(row.hash) ?? { in: [], out: [] };
    const leg = (item) => ({ ...item, row });
    const withoutPls = (items) => items.filter((item) => item.symbol !== PLS);
    legs.set(row.hash, {
      in: takesIn
        ? [...entry.in, ...withoutPls(row.incoming).map(leg)]
        : entry.in,
      out: takesOut
        ? [...entry.out, ...withoutPls(row.outgoing).map(leg)]
        : entry.out,
    });
  }
  return legs;
}

/**
 * Whether one of Summ's legs, not yet used, holds an amount of a token.
 *
 * @param {object} summLeg - Summ's leg
 * @param {Set<object>} used - The Summ legs already matched
 * @param {string[]} symbols - The token's symbols in Summ
 * @param {object} like - `amount`, `decimals`, and `nft` when the token is
 *   an NFT
 * @returns {boolean} Whether it holds it
 */
function holds(summLeg, used, symbols, like) {
  if (used.has(summLeg) || !symbols.includes(summLeg.symbol)) return false;
  if (like.nft) return summLeg.amount === "1" || summLeg.amount === "0";
  return summHolds(like.amount, like.decimals, summLeg.amount);
}

/**
 * Matches the legs of one transaction and direction.
 *
 * @param {object[]} legs - The chain's legs
 * @param {object[]} pool - Summ's legs
 * @param {function(string, (string|null)): string[]} symbolsOf - A token's
 *   symbols in Summ, from its contract and its own symbol
 * @param {Set<object>} used - The Summ legs already matched, to which this
 *   adds those it matches
 * @returns {Array<[object, object]>} Each leg matched, with Summ's leg
 */
function matchGroup(legs, pool, symbolsOf, used) {
  const pairs = [];
  for (const leg of legs) {
    const like = {
      amount: leg.amount,
      decimals: leg.decimals,
      nft: leg.nftId !== undefined,
    };
    const found = pool.find((s) =>
      holds(s, used, symbolsOf(leg.token, leg.symbol), like),
    );
    if (found === undefined) continue;
    used.add(found);
    pairs.push([leg, found]);
  }
  const paired = new Set(pairs.map(([leg]) => leg));
  const left = groupBy(
    legs.filter((leg) => !paired.has(leg) && leg.nftId === undefined),
    (leg) => leg.token,
  );
  for (const group of left.values()) {
    if (group.length < 2) continue;
    const total = group.reduce((sum, leg) => sum + leg.amount, 0n);
    const like = { amount: total, decimals: group[0].decimals, nft: false };
    const symbols = symbolsOf(group[0].token, group[0].symbol);
    const found = pool.find((s) => holds(s, used, symbols, like));
    if (found === undefined) continue;
    used.add(found);
    for (const leg of group) pairs.push([leg, found]);
  }
  return pairs;
}

/**
 * Matches the chain's legs with Summ's.
 *
 * @param {object[]} legs - The chain's token legs, from `tokenLegs`
 * @param {Map<string, {in: object[], out: object[]}>} summLegs - Summ's
 *   legs, from `summLegsOf`
 * @param {Map<string, string[]>} summSymbols - The owner's list of each
 *   token's symbols in Summ, by contract
 * @param {Set<object>} [usedBefore] - The Summ legs an earlier match used,
 *   which this one leaves out
 * @returns {{matches: Map<object, object>, unmatched: object[],
 *   summUnmatched: object[], used: Set<object>}} Each matched leg with
 *   Summ's leg; the legs Summ lacks; Summ's legs no match has used; and the
 *   Summ legs used, by this match and those before it
 */
export function matchLegs(legs, summLegs, summSymbols, usedBefore = new Set()) {
  const symbolsOf = (token, symbol) =>
    summSymbols.get(token) ?? (symbol === null ? [] : [symbol.toUpperCase()]);
  const used = new Set(usedBefore);
  const matches = new Map();
  const groups = groupBy(legs, (leg) => `${leg.hash} ${leg.direction}`);
  for (const [key, group] of groups) {
    const [hash, direction] = key.split(" ");
    const pool = summLegs.get(hash)?.[direction] ?? [];
    for (const [leg, found] of matchGroup(group, pool, symbolsOf, used))
      matches.set(leg, found);
  }
  const summUnmatched = [...summLegs.entries()].flatMap(([hash, entry]) =>
    ["in", "out"].flatMap((direction) =>
      entry[direction]
        .filter((leg) => !used.has(leg))
        .map((leg) => ({ hash, direction, ...leg })),
    ),
  );
  return {
    matches,
    unmatched: legs.filter((leg) => !matches.has(leg)),
    summUnmatched,
    used,
  };
}
