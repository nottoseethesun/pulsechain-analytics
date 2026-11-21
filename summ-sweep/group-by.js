/**
 * Gathers items into groups by a key.
 * @module summ-sweep/group-by
 *
 * What: the sweep gathers items into groups in four places: Summ's legs
 * and the chain's legs by transaction and direction, the chain's legs
 * left over by token, and each list the gaps read by transaction.
 * `groupBy` is the one way it does so.
 *
 * How: a Map keeps the groups in the order their first items came, and
 * each group keeps its items in the order they came.
 *
 * Fit: `summ-sweep/match.js` and `summ-sweep/gaps.js` use it.
 */

/**
 * Items gathered by a key.
 *
 * @param {object[]} items - The items
 * @param {function(object): string} keyOf - An item's key
 * @returns {Map<string, object[]>} The items of each key, in their order
 */
export function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}
