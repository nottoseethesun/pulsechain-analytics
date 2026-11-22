/**
 * Splits the coins a 9mm V3 position paid out into principal and fees.
 * @module summ-sweep/positions
 *
 * What: a 9mm V3 position, an NFT of the position manager, holds two
 * coins. Withdrawing from it takes two steps, in one transaction or in
 * more than one: `decreaseLiquidity`, which takes liquidity out of the
 * pool and logs a DecreaseLiquidity event with the two coins' amounts, the
 * principal; and `collect`, which pays the wallet everything the position
 * is owed: that principal, plus the fees the position earned. So the fees
 * of a collect are the coins it paid out, less every DecreaseLiquidity of
 * the same NFT since the NFT's last collect. A collect with no
 * DecreaseLiquidity before it is all fees. The position manager takes off
 * what the position is owed the amounts a Collect event names, whoever
 * receives the coins, so the principal those amounts leave owed waits for
 * the next collect. A collect whose coins the wallet received less of than
 * its principal, or none of, is reported. The owner books fees as income,
 * and principal as liquidity removed. The sweep reads one range of blocks:
 * a position owed coins when it began (`summ-sweep/owed.js`) may pay
 * principal from a DecreaseLiquidity before the range in its first collect
 * within it, so that collect is reported, never split, and so is each
 * later collect of the position while its events have not paid out, past
 * the range's own principal, all it was owed when the range began.
 *
 * How: the transactions the wallet sent to the position manager are read
 * in the order sent, through LP Ranger's tool (`summ-sweep/lp-ranger.js`),
 * whose record gives each liquidity event's NFT id and amounts as strings
 * of digits; a record of another shape stops the sweep, naming the
 * transaction. Each NFT's DecreaseLiquidity amounts are added up until its
 * next Collect, which takes them. The coins paid out are the coins the
 * wallet received in the collect's transaction: its token legs in, and the
 * PLS the position manager handed back when it unwrapped WPLS, counted as
 * WPLS. The pool orders its two coins by address, as numbers, lowest
 * first, as every Uniswap V3 pool does, so the amounts an event names
 * first and second belong to the lower and the higher of the two coins'
 * contracts. When only one coin came in, the Collect event's amounts say
 * which side it is. The coins received, rather than the Collect event's
 * amounts, are used: the position manager's Collect event states the
 * amounts it asked the pool for, and the pool sends what it owes the
 * position, which can be less.
 *
 * Fit: `summ-sweep/splits.js` uses each split to fix Summ's legs that hold
 * principal and fees together, and to write the fees as income rows.
 */

/** Text of digits only: how LP Ranger's record writes an NFT id or amount. */
const DIGITS = /^\d+$/;

/**
 * The contracts of a collect's two coins, lowest first, from the coins the
 * wallet received and the Collect event's amounts.
 *
 * @param {string[]} coins - The coins received, by contract
 * @param {bigint[]} collected - The Collect event's two amounts
 * @returns {Array<string|null>|null} Each side's contract, `null` for a
 *   side that paid nothing; `null` when the coins cannot be placed
 */
function sidesOf(coins, collected) {
  const sorted = [...coins].sort((a, b) =>
    BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0,
  );
  if (sorted.length === 2) return sorted;
  if (sorted.length === 0) return [null, null];
  if (sorted.length > 2) return null;
  if (collected[0] > 0n && collected[1] === 0n) return [sorted[0], null];
  if (collected[1] > 0n && collected[0] === 0n) return [null, sorted[0]];
  return null;
}

/**
 * A value of LP Ranger's record that must be a string of digits.
 *
 * @param {*} value - The value
 * @param {string} name - What it is, for the error
 * @param {string} hash - The transaction the record is of
 * @returns {string} The value
 * @throws {Error} When it is not a string of digits
 */
function digitsOf(value, name, hash) {
  if (typeof value === "string" && DIGITS.test(value)) return value;
  throw new Error(
    `LP Ranger's record of ${hash} gives an event's ${name} as ${JSON.stringify(value)}, not a string of digits`,
  );
}

/**
 * What is left of an amount once another is taken off it, never below 0.
 *
 * @param {bigint} amount - The amount
 * @param {bigint} taken - What is taken off it
 * @returns {bigint} What is left
 */
function leftOf(amount, taken) {
  return amount > taken ? amount - taken : 0n;
}

/**
 * The DecreaseLiquidity and Collect events of one transaction, taken in
 * order: each decrease added to its NFT's principal waiting, each collect
 * taking off it the amounts its event names, which the position manager
 * takes off what the position is owed, whoever receives the coins, so
 * the rest waits for the next collect.
 *
 * @param {string} hash - The transaction
 * @param {object|undefined} record - LP Ranger's record of it
 * @param {Map<string, bigint[]>} waiting - Each NFT's principal waiting
 *   for its next collect, which this updates
 * @returns {Array<{nftId: string, principal: bigint[],
 *   collected: bigint[]}>} The transaction's collects
 * @throws {Error} When the record is missing, or of another shape
 */
function collectsOf(hash, record, waiting) {
  if (record === undefined || !Array.isArray(record.liquidity))
    throw new Error(
      `LP Ranger's record of ${hash} holds no list of liquidity events`,
    );
  const collects = [];
  for (const event of record.liquidity) {
    const nftId = digitsOf(event.nftId, "nftId", hash);
    const amounts = [
      BigInt(digitsOf(event.amount0, "amount0", hash)),
      BigInt(digitsOf(event.amount1, "amount1", hash)),
    ];
    const before = waiting.get(nftId) ?? [0n, 0n];
    if (event.event === "DecreaseLiquidity")
      waiting.set(nftId, [before[0] + amounts[0], before[1] + amounts[1]]);
    if (event.event === "Collect") {
      collects.push({ nftId, principal: before, collected: amounts });
      waiting.set(nftId, [
        leftOf(before[0], amounts[0]),
        leftOf(before[1], amounts[1]),
      ]);
    }
  }
  return collects;
}

/**
 * Takes a collect's payment off what its position was still owed from
 * before the swept range, when it was: the collect pays the range's own
 * principal first, so only what its event names past that principal is
 * taken off, and a position stays owed until every side is paid.
 *
 * @param {Map<string, bigint[]>} owedLeft - What each position is still
 *   owed from before the range, by NFT id, which this updates
 * @param {{nftId: string, principal: bigint[], collected: bigint[]}} collect - The collect
 * @returns {boolean} Whether the position was still owed coins from before the range as the collect came
 */
function payOwed(owedLeft, collect) {
  const owed = owedLeft.get(collect.nftId);
  if (owed === undefined) return false;
  const left = owed.map((amount, side) =>
    leftOf(amount, leftOf(collect.collected[side], collect.principal[side])),
  );
  if (left.every((amount) => amount === 0n)) owedLeft.delete(collect.nftId);
  else owedLeft.set(collect.nftId, left);
  return true;
}

/**
 * The NFT ids of the positions the transactions collect from, once each.
 *
 * @param {string[]} order - The transactions the wallet sent to the
 *   position manager, by hash, in the order sent
 * @param {Map<string, object>} records - LP Ranger's record of each, by
 *   hash in lower case
 * @returns {string[]} The NFT ids, as digits
 * @throws {Error} When a record is missing, or of another shape
 */
export function collectedNftIds(order, records) {
  const ids = new Set();
  for (const hash of order)
    for (const collect of collectsOf(hash, records.get(hash), new Map()))
      ids.add(collect.nftId);
  return [...ids];
}

/**
 * Splits each collect of the wallet's into principal and fees, coin by
 * coin.
 *
 * @param {object} reading - What was read
 * @param {string[]} reading.order - The transactions the wallet sent to
 *   the position manager, by hash, in the order sent
 * @param {Map<string, object>} reading.records - LP Ranger's record of
 *   each, by hash in lower case
 * @param {function(string): Map<string, bigint>} reading.receivedIn - The
 *   coins the wallet received in a transaction, by contract
 * @param {Map<string, bigint[]>} [reading.owedAtStart] - The coins each
 *   position was owed when the range began, by NFT id, for those owed any
 * @returns {{splits: Array<{hash: string, nftId: string, token: string,
 *   received: bigint, principal: bigint, fee: bigint}>,
 *   problems: Array<{hash: string, problem: string}>}} Each coin of each
 *   collect, and each collect that could not be split, with why
 */
export function splitCollects({
  order,
  records,
  receivedIn,
  owedAtStart = new Map(),
}) {
  const waiting = new Map();
  const collected = new Set();
  const owedLeft = new Map();
  const splits = [];
  const problems = [];
  for (const hash of order) {
    const collects = collectsOf(hash, records.get(hash), waiting);
    if (collects.length === 0) continue;
    const firsts = collects.map((one) => !collected.has(one.nftId));
    const owed = collects.map((one, index) => {
      if (firsts[index] && owedAtStart.has(one.nftId))
        owedLeft.set(one.nftId, owedAtStart.get(one.nftId));
      collected.add(one.nftId);
      return payOwed(owedLeft, one);
    });
    if (collects.length > 1) {
      problems.push({
        hash,
        problem:
          "it collects from more than one position, so its coins cannot be split between them",
      });
      continue;
    }
    const [collect] = collects;
    if (owed[0]) {
      problems.push({
        hash,
        problem: firsts[0]
          ? `position #${collect.nftId} was owed coins when the swept range began, so this collect, its first in the range, may pay principal from a DecreaseLiquidity before the range, which the range does not show`
          : `position #${collect.nftId} may still owe coins from before the swept range, which its collects in the range have not paid out in full, so this collect may pay principal from a DecreaseLiquidity before the range, which the range does not show`,
      });
      continue;
    }
    const received = receivedIn(hash);
    const sides = sidesOf([...received.keys()], collect.collected);
    if (sides === null) {
      problems.push({
        hash,
        problem:
          "the coins it paid out cannot be placed on the position's two sides",
      });
      continue;
    }
    sides.forEach((coin, side) => {
      const principal = collect.principal[side];
      const got = coin === null ? 0n : received.get(coin);
      if (got < principal) {
        problems.push({
          hash,
          problem:
            coin === null
              ? `it paid out nothing of the coin on side ${side} of position #${collect.nftId}, though its DecreaseLiquidity events name principal of it`
              : `it paid out less ${coin} than the principal its DecreaseLiquidity events name`,
        });
      } else if (coin !== null)
        splits.push({
          hash,
          nftId: collect.nftId,
          token: coin,
          received: got,
          principal,
          fee: got - principal,
        });
    });
  }
  return { splits, problems };
}
