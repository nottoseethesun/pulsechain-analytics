/**
 * Which legs of a wallet's history Summ holds, and which it lacks.
 * @module summ-sweep/match
 *
 * What: a leg the chain shows is in Summ when one of Summ's rows for the
 * same transaction holds the same token, going the same way, in the same
 * amount, to what Summ's figure can say (`summHolds`). A matching hash
 * alone proves nothing: Summ often holds a transaction's gas, as an
 * approval, and none of its tokens. `matchLegs` matches every leg it can
 * and gives back those it cannot, the gaps a sweep writes rows for, and
 * Summ's legs that matched no leg, for the owner to look at.
 *
 * How: Summ prints a token by a symbol of its own, which is not always the
 * contract's: both PulseChain's HEX and the HEX bridged from Ethereum show
 * as `HEX`, and bridged ICSA as `EICSA` or `ICSA`. So each token's symbols
 * in Summ come from the owner's list, by contract, or else are the
 * contract's own symbol in capitals; a token whose contract gave no
 * symbol, and that the list leaves out, matches nothing. A row's incoming amounts are the
 * wallet's when the row's receiver is the wallet, or it names none, or
 * the row is not a transfer, since a trade lists both its sides; a
 * transfer between two wallets lists both sides, and only the wallet's
 * side is its. Within a transaction and a direction, each leg is matched
 * to one of Summ's amounts first; then the legs of one token left over are
 * added up and matched to one amount, as Summ holds a swap routed through
 * several pools as one. Summ prints an NFT's quantity as 1, or as 0 in
 * some rows, and either matches it. PLS, which moves without a log, is
 * left out on both sides.
 *
 * Fit: the sweep writes rows for the unmatched legs, and edits Summ's legs
 * that hold a withdrawal's principal and fees together
 * (`summ-sweep/splits.js`).
 */

import { summHolds } from "./amounts.js";

/** The symbol Summ gives PLS, which is left out of the match. */
const PLS = "PLS";

/**
 * Gives each row the owner entered by hand in Summ the hash of the
 * transaction it stands for.
 *
 * A row entered by hand carries no transaction hash: Summ's hash ends in
 * `-manual`. It stands for the transaction whose block has the row's time,
 * when one transaction does; when several do, for the one with a leg of an
 * amount the row holds, when one does. Otherwise it keeps its own hash, so
 * it matches no leg and is listed with Summ's unmatched legs.
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
  const own = wallet.toLowerCase();
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
    const leg = (item) => ({ ...item, row, used: false });
    if (takesIn)
      entry.in.push(...row.incoming.filter((i) => i.symbol !== PLS).map(leg));
    if (takesOut)
      entry.out.push(...row.outgoing.filter((i) => i.symbol !== PLS).map(leg));
    legs.set(row.hash, entry);
  }
  return legs;
}

/**
 * Whether one of Summ's legs holds an amount of a token.
 *
 * @param {object} summLeg - Summ's leg
 * @param {string[]} symbols - The token's symbols in Summ
 * @param {object} like - `amount`, `decimals`, and `nft` when the token is
 *   an NFT
 * @returns {boolean} Whether it holds it
 */
function holds(summLeg, symbols, like) {
  if (summLeg.used || !symbols.includes(summLeg.symbol)) return false;
  if (like.nft) return summLeg.amount === "1" || summLeg.amount === "0";
  return summHolds(like.amount, like.decimals, summLeg.amount);
}

/**
 * Matches the legs of one transaction and direction.
 *
 * @param {object[]} legs - The chain's legs
 * @param {object[]} pool - Summ's legs
 * @param {function(string, string): string[]} symbolsOf - A token's
 *   symbols in Summ, from its contract and its own symbol
 * @param {Map<object, object>} matches - Where each match is kept
 */
function matchGroup(legs, pool, symbolsOf, matches) {
  for (const leg of legs) {
    const like = {
      amount: leg.amount,
      decimals: leg.decimals,
      nft: leg.nftId !== undefined,
    };
    const found = pool.find((s) =>
      holds(s, symbolsOf(leg.token, leg.symbol), like),
    );
    if (found === undefined) continue;
    found.used = true;
    matches.set(leg, found);
  }
  const left = new Map();
  for (const leg of legs)
    if (!matches.has(leg) && leg.nftId === undefined)
      left.set(leg.token, [...(left.get(leg.token) ?? []), leg]);
  for (const group of left.values()) {
    if (group.length < 2) continue;
    const total = group.reduce((sum, leg) => sum + leg.amount, 0n);
    const like = { amount: total, decimals: group[0].decimals, nft: false };
    const symbols = symbolsOf(group[0].token, group[0].symbol);
    const found = pool.find((s) => holds(s, symbols, like));
    if (found === undefined) continue;
    found.used = true;
    for (const leg of group) matches.set(leg, found);
  }
}

/**
 * Matches the chain's legs with Summ's.
 *
 * @param {object[]} legs - The chain's token legs, from `tokenLegs`
 * @param {Map<string, {in: object[], out: object[]}>} summLegs - Summ's
 *   legs, from `summLegsOf`
 * @param {Map<string, string[]>} summSymbols - The owner's list of each
 *   token's symbols in Summ, by contract in lower case
 * @returns {{matches: Map<object, object>, unmatched: object[],
 *   summUnmatched: object[]}} Each matched leg with Summ's leg, the legs
 *   Summ lacks, and Summ's legs no leg matched
 */
export function matchLegs(legs, summLegs, summSymbols) {
  const symbolsOf = (token, symbol) =>
    summSymbols.get(token) ?? (symbol === null ? [] : [symbol.toUpperCase()]);
  const groups = new Map();
  for (const leg of legs) {
    const key = `${leg.hash} ${leg.direction}`;
    groups.set(key, [...(groups.get(key) ?? []), leg]);
  }
  const matches = new Map();
  for (const [key, group] of groups) {
    const [hash, direction] = key.split(" ");
    const pool = summLegs.get(hash)?.[direction] ?? [];
    matchGroup(group, pool, symbolsOf, matches);
  }
  const summUnmatched = [...summLegs.entries()].flatMap(([hash, entry]) =>
    ["in", "out"].flatMap((direction) =>
      entry[direction]
        .filter((leg) => !leg.used)
        .map((leg) => ({ hash, direction, ...leg })),
    ),
  );
  return {
    matches,
    unmatched: legs.filter((leg) => !matches.has(leg)),
    summUnmatched,
  };
}
