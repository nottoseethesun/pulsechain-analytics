/**
 * Every transaction a wallet sent over a range of blocks, found from its
 * count of transactions.
 * @module wallet-history/sent
 *
 * What: a wallet's count of transactions sent, its nonce, rises by one
 * with each transaction it sends, whatever the transaction does: one that
 * moved no token, one that reverted and only paid gas, one that cancelled
 * another by sending nothing to the wallet itself. None of those may leave
 * a log naming the wallet, so a search of the logs misses them, and an
 * explorer's list missed some of them for the wallet this was built for.
 * The count misses none: the endpoint answers it for the end of any past
 * block, from the chain's state.
 *
 * How: a span of blocks whose two ends show the same count holds no
 * transaction of the wallet's, so the search halves each span whose ends
 * differ, until it reaches single blocks, and reads each of those whole,
 * keeping the transactions the wallet sent. A count at a past block needs
 * an endpoint that keeps past state: g4mm4's and rpc.pulsechain.com do;
 * publicnode's does not. LP Ranger's wallet report searches the same way
 * (`walletTransactionsIn`), but its file loads LP Ranger's settings as it
 * loads, and LP Ranger cannot change, so this is a second copy of that
 * search rather than an import.
 *
 * Fit: a sweep of a wallet reads the gas each of these transactions paid
 * and the PLS it sent, and traces each for PLS handed back to the wallet
 * (`ownCoinFlows`, in `wallet-history/coin-flows.js`).
 */

/**
 * Whether two addresses are the same, whatever their case.
 *
 * @param {string|null|undefined} a - One address
 * @param {string|null|undefined} b - The other
 * @returns {boolean} Whether both are present and the same
 */
export function sameAddress(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    a.toLowerCase() === b.toLowerCase()
  );
}

/**
 * The wallet's transactions in one block, read whole.
 *
 * @param {{ask: function}} paced - The paced provider
 * @param {string} wallet - The wallet
 * @param {number} number - The block's number
 * @returns {Promise<object[]>} The transactions the wallet sent in it
 */
async function sentInBlock(paced, wallet, number) {
  const block = await paced.ask("getBlock", number, true);
  return block.prefetchedTransactions
    .filter((transaction) => sameAddress(transaction.from, wallet))
    .map((transaction) => ({
      hash: transaction.hash,
      blockNumber: number,
      timestamp: block.timestamp,
      nonce: transaction.nonce,
      to: transaction.to,
      value: transaction.value,
    }));
}

/**
 * One step of the search: the wallet's transactions in a span, given its
 * counts at the end of the block before the span and at the span's end.
 *
 * @param {{ask: function}} paced - The paced provider
 * @param {string} wallet - The wallet
 * @param {{low: number, high: number, before: number, after: number}} span
 *   - The span's blocks, and the two counts
 * @returns {Promise<object[]>} The transactions, in order
 */
async function halves(paced, wallet, { low, high, before, after }) {
  if (after === before) return [];
  if (low === high) return sentInBlock(paced, wallet, low);
  const middle = Math.floor((low + high) / 2);
  const atMiddle = await paced.ask("getTransactionCount", wallet, middle);
  const left = await halves(paced, wallet, {
    low,
    high: middle,
    before,
    after: atMiddle,
  });
  const right = await halves(paced, wallet, {
    low: middle + 1,
    high,
    before: atMiddle,
    after,
  });
  return [...left, ...right];
}

/**
 * Every transaction a wallet sent in a range of blocks, in the order sent.
 *
 * @param {{ask: function}} paced - The paced provider
 * @param {string} wallet - The wallet
 * @param {number} fromBlock - The range's first block, above block 0
 * @param {number} toBlock - The range's last block
 * @returns {Promise<Array<{hash: string, blockNumber: number,
 *   timestamp: number, nonce: number, to: (string|null),
 *   value: bigint}>>} The transactions
 */
export async function walletSentTransactions(
  paced,
  wallet,
  fromBlock,
  toBlock,
) {
  const before = await paced.ask("getTransactionCount", wallet, fromBlock - 1);
  const after = await paced.ask("getTransactionCount", wallet, toBlock);
  return halves(paced, wallet, {
    low: fromBlock,
    high: toBlock,
    before,
    after,
  });
}
