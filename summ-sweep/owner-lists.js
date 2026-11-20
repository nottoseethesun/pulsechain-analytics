/**
 * The owner's lists for the Summ sweep, from `summ-sweep/config.json`.
 * @module summ-sweep/owner-lists
 *
 * What: four things a row says come from the owner rather than the
 * chain: which addresses are his own wallets, and their names; which
 * tokens are spam; which tokens he receives as income; and each token's
 * symbols in Summ and in a csv, where they differ from its contract's
 * own. `ownerLists` reads them into lookups by address, and `csvSymbolOf`
 * gives the symbol a token takes in a csv.
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
 * The symbol a token takes in a csv: the owner's, or else its contract's.
 *
 * @param {object} lists - The owner's lists
 * @param {string} token - The token's contract, in EIP-55's mixed case
 * @param {string|null} symbol - Its contract's symbol; `null` when the
 *   contract gave none
 * @returns {string|null} The symbol; `null` when neither names one
 */
export function csvSymbolOf(lists, token, symbol) {
  return lists.csvSymbols.get(token) ?? symbol;
}
