/**
 * The owner's lists for the Summ sweep, from `summ-sweep/config.json`.
 * @module summ-sweep/owner-lists
 *
 * What: some of what a row says comes from the owner rather than the
 * chain: which addresses are his own wallets, and their names; which
 * tokens are spam; which tokens he receives as income; and each token's
 * symbols in Summ and in a csv, where they differ from its contract's
 * own. `ownerLists` reads them into lookups by address, and `csvSymbolOf`
 * gives the symbol a token takes in a csv.
 *
 * How: the chain's legs carry addresses in lower case, so every address
 * in the lists is put in lower case as it is read. A list the settings
 * leave out is empty: a leg it would have settled becomes a question for
 * the owner, never a guess.
 *
 * Fit: `summ-sweep/sweep.js` reads the lists once, `summ-sweep/match.js`
 * reads Summ's symbols from them, and `summ-sweep/gap-rules.js` the rest.
 */

/**
 * An object of the settings, keyed by address, as a lookup by address in
 * lower case.
 *
 * @param {Object<string, *>|undefined} object - The object
 * @returns {Map<string, *>} The lookup
 */
function byAddress(object) {
  return new Map(
    Object.entries(object ?? {}).map(([key, value]) => [
      key.toLowerCase(),
      value,
    ]),
  );
}

/**
 * A list of addresses from the settings, as a set in lower case.
 *
 * @param {string[]|undefined} list - The list
 * @returns {Set<string>} The set
 */
function addressSet(list) {
  return new Set((list ?? []).map((address) => address.toLowerCase()));
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
 *   csvSymbols: Map<string, string>}} The lists, by address in lower case
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
 * @param {string} token - The token's contract, in lower case
 * @param {string|null} symbol - Its contract's symbol; `null` when the
 *   contract gave none
 * @returns {string|null} The symbol; `null` when neither names one
 */
export function csvSymbolOf(lists, token, symbol) {
  return lists.csvSymbols.get(token) ?? symbol;
}
