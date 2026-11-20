/**
 * Splits the coins a 9mm V3 position paid out into principal and fees.
 * @module summ-sweep/positions
 *
 * What: a 9mm V3 position, an NFT of the position manager, holds two
 * coins. Withdrawing from it takes two steps, which may be in one
 * transaction or two: `decreaseLiquidity`, which takes liquidity out of
 * the pool and logs a DecreaseLiquidity event with the two coins'
 * amounts, the principal; and `collect`, which pays the wallet everything
 * the position is owed: that principal, plus the fees the position earned.
 * So the fees of a collect are the coins it paid out, less every
 * DecreaseLiquidity of the same NFT since the NFT's last collect. A collect
 * with no DecreaseLiquidity before it is all fees. The owner books fees as
 * income, and principal as liquidity removed.
 *
 * How: the transactions the wallet sent to the position manager are read
 * in the order sent, through LP Ranger's tool (`summ-sweep/lp-ranger.js`),
 * and each NFT's DecreaseLiquidity amounts are added up until its next
 * Collect, which takes them. The coins paid out are the coins the wallet
 * received in the collect's transaction: its token legs in, and the PLS
 * the position manager handed back when it unwrapped WPLS, counted as
 * WPLS. The pool orders its two coins by address, lowest first, as every
 * Uniswap V3 pool does, so the amounts an event names first and second
 * belong to the lower and the higher of the two coins' contracts. When
 * only one coin came in, the Collect event's amounts say which side it is.
 * The coins received, rather than the Collect event's amounts, are used,
 * since the position manager's Collect event states what it asked the pool
 * for, and the pool can pay a few of a coin's smallest units less.
 *
 * Fit: `summ-sweep/splits.js` uses each split to fix Summ's legs that hold
 * principal and fees together, and to write the fees as income rows.
 */

/**
 * The contracts of a collect's two coins, lowest first, from the coins the
 * wallet received and the Collect event's amounts.
 *
 * @param {string[]} coins - The coins received, by contract in lower case
 * @param {bigint[]} collected - The Collect event's two amounts
 * @returns {Array<string|null>|null} Each side's contract, `null` for a
 *   side that paid nothing; `null` when the coins cannot be placed
 */
function sidesOf(coins, collected) {
  const sorted = [...coins].sort();
  if (sorted.length === 2) return sorted;
  if (sorted.length === 0) return [null, null];
  if (sorted.length > 2) return null;
  if (collected[0] > 0n && collected[1] === 0n) return [sorted[0], null];
  if (collected[1] > 0n && collected[0] === 0n) return [null, sorted[0]];
  return null;
}

/**
 * The DecreaseLiquidity and Collect events of one transaction, taken in
 * order: each decrease added to its NFT's principal waiting, each collect
 * taking it.
 *
 * @param {object} record - LP Ranger's record of the transaction
 * @param {Map<string, bigint[]>} waiting - Each NFT's principal waiting
 *   for its next collect, which this updates
 * @returns {Array<{nftId: string, principal: bigint[],
 *   collected: bigint[]}>} The transaction's collects
 */
function collectsOf(record, waiting) {
  const collects = [];
  for (const event of record.liquidity) {
    const nftId = String(event.nftId);
    const amounts = [BigInt(event.amount0), BigInt(event.amount1)];
    const before = waiting.get(nftId) ?? [0n, 0n];
    if (event.event === "DecreaseLiquidity")
      waiting.set(nftId, [before[0] + amounts[0], before[1] + amounts[1]]);
    if (event.event === "Collect") {
      collects.push({ nftId, principal: before, collected: amounts });
      waiting.set(nftId, [0n, 0n]);
    }
  }
  return collects;
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
 *   coins the wallet received in a transaction, by contract in lower case
 * @returns {{splits: Array<{hash: string, nftId: string, token: string,
 *   received: bigint, principal: bigint, fee: bigint}>,
 *   problems: Array<{hash: string, problem: string}>}} Each coin of each
 *   collect, and each collect that could not be split, with why
 */
export function splitCollects({ order, records, receivedIn }) {
  const waiting = new Map();
  const splits = [];
  const problems = [];
  for (const hash of order) {
    const collects = collectsOf(records.get(hash), waiting);
    if (collects.length === 0) continue;
    if (collects.length > 1) {
      problems.push({
        hash,
        problem:
          "it collects from more than one position, so its coins cannot be split between them",
      });
      continue;
    }
    const [collect] = collects;
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
      if (coin === null) return;
      const got = received.get(coin);
      const principal = collect.principal[side];
      if (got < principal)
        problems.push({
          hash,
          problem: `it paid out less ${coin} than the principal its DecreaseLiquidity events name`,
        });
      else
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
