/**
 * Blocks of a wallet's history: the first block at or after a time, the
 * spans a range of blocks is searched in, and a block number as json-rpc
 * writes it.
 * @module wallet-history/blocks
 *
 * What: a wallet's history is asked for between two dates, but the chain
 * is searched by block. `blockAtOrAfter` finds the first block whose time
 * is at or after a moment, so a search starts at the block of its first
 * date rather than at the chain's first block, which LP Ranger's rules
 * forbid. `spansOf` cuts a range of blocks into spans no wider than an
 * endpoint takes in one log search: g4mm4's endpoint refuses a span wider
 * than 10,000 blocks, and LP Ranger asks for 9,000 at most.
 *
 * How: `blockAtOrAfter` halves the range from block 0 to the latest
 * block, reading the time of the block at the middle each time, about 22
 * reads for PulseChain's 26 million blocks.
 *
 * Fit: the entry point of a sweep turns its dates into blocks with
 * `blockAtOrAfter`; `walletTransferLogs` searches each span `spansOf`
 * gives.
 */

/**
 * A block number as json-rpc writes it, in hex.
 *
 * @param {number} number - The block number
 * @returns {string} Such as `0x18d2e19`
 */
export function hexBlock(number) {
  return `0x${number.toString(16)}`;
}

/**
 * The first block whose time is at or after a moment.
 *
 * @param {{ask: function}} paced - The paced provider
 * @param {number} seconds - The moment, in seconds since 1970
 * @returns {Promise<number>} The block's number; the latest block's number
 *   plus one when every block is earlier
 */
export async function blockAtOrAfter(paced, seconds) {
  let low = 0;
  let high = (await paced.ask("getBlockNumber")) + 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const block = await paced.ask("getBlock", middle);
    if (block.timestamp >= seconds) high = middle;
    else low = middle + 1;
  }
  return low;
}

/**
 * Cuts a range of blocks into spans no wider than a number of blocks.
 *
 * @param {number} fromBlock - The range's first block
 * @param {number} toBlock - The range's last block
 * @param {number} width - The most blocks one span holds
 * @returns {Array<{fromBlock: number, toBlock: number}>} The spans, in
 *   order; none when the range is empty
 */
export function spansOf(fromBlock, toBlock, width) {
  const spans = [];
  for (let start = fromBlock; start <= toBlock; start += width)
    spans.push({
      fromBlock: start,
      toBlock: Math.min(start + width - 1, toBlock),
    });
  return spans;
}
