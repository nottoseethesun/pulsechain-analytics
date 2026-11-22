/**
 * The owner's lists for the Summ sweep, from `summ-sweep/config.json`.
 * @module summ-sweep/owner-lists
 *
 * What: four things a row says come from the owner rather than the
 * chain: which addresses are his own wallets, and their names; which
 * tokens are spam; which tokens he receives as income; and each token's
 * symbols in Summ and in a csv, where they differ from its contract's
 * own. `ownerLists` reads them into lookups by address, and `csvSymbolOf`
 * gives the symbol a token takes in a csv: the owner's, or else its
 * contract's, unless that is blank or PLS, the chain's own coin's, which
 * the Summ csv utility refuses on a token's row, as a token that names
 * itself PLS to pass for the coin can. Such a token has no symbol for the
 * csv until the owner's settings give one (`symbolLack` says why).
 *
 * How: the sweep holds every address in EIP-55's mixed case, so every
 * address in the lists is put in that case as it is read; an address
 * written in mixed case with a wrong checksum is refused, as ethers'
 * `getAddress` refuses it. A list the settings leave out is empty: a leg
 * it would have settled becomes a question for the owner, never a guess.
 *
 * Fit: `summ-sweep/sweep.js` reads the lists once, `summ-sweep/match.js`
 * reads Summ's symbols from them, and `summ-sweep/gap-rules.js` the rest.
 */

import { getAddress } from "ethers";
import { PLS } from "./rows.js";

/**
 * An object of the settings, keyed by address, as a lookup by address.
 *
 * @param {Object<string, *>|undefined} object - The object
 * @returns {Map<string, *>} The lookup, by address in EIP-55's mixed case
 */
function byAddress(object) {
  return new Map(
    Object.entries(object ?? {}).map(([key, value]) => [
      getAddress(key),
      value,
    ]),
  );
}

/**
 * A list of addresses from the settings, as a set.
 *
 * @param {string[]|undefined} list - The list
 * @returns {Set<string>} The set, of addresses in EIP-55's mixed case
 */
function addressSet(list) {
  return new Set((list ?? []).map((address) => getAddress(address)));
}

/**
 * The owner's lists, read from his settings.
 *
 * @param {object} owner - The settings: `ownWallets`, each wallet's name by
 *   its address; `spamTokens` and `incomeTokens`, lists of contracts;
 *   `summSymbols`, each token's symbols in Summ, and `csvSymbols`, its
 *   symbol in a csv, by contract
 * @returns {{ownWallets: Map<string, string>, spamTokens: Set<string>,
 *   incomeTokens: Set<string>, summSymbols: Map<string, string[]>,
 *   csvSymbols: Map<string, string>}} The lists, by address in EIP-55's
 *   mixed case
 */
export function ownerLists(owner) {
  return {
    ownWallets: byAddress(owner.ownWallets),
    spamTokens: addressSet(owner.spamTokens),
    incomeTokens: addressSet(owner.incomeTokens),
    summSymbols: byAddress(owner.summSymbols),
    csvSymbols: byAddress(owner.csvSymbols),
  };
}

/**
 * Why a contract's symbol cannot stand for its token in a csv: none, blank,
 * or the chain's own coin's.
 *
 * @param {string|null} symbol - The contract's symbol; `null` when the
 *   contract gave none
 * @returns {string|null} The reason, as words that follow "its contract";
 *   `null` when the symbol can stand
 */
export function symbolLack(symbol) {
  if (symbol === null) return "gave no symbol";
  if (symbol.trim() === "") return "gave a blank symbol";
  if (symbol === PLS) return `names itself ${PLS}, the chain's own coin`;
  return null;
}

/**
 * The symbol a token takes in a csv: the owner's, or else its contract's,
 * when that can stand (`symbolLack`).
 *
 * @param {object} lists - The owner's lists
 * @param {string} token - The token's contract, in EIP-55's mixed case
 * @param {string|null} symbol - Its contract's symbol; `null` when the
 *   contract gave none
 * @returns {string|null} The symbol; `null` when neither gives one
 */
export function csvSymbolOf(lists, token, symbol) {
  return (
    lists.csvSymbols.get(token) ?? (symbolLack(symbol) === null ? symbol : null)
  );
}
