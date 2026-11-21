/**
 * Every token a wallet sent or received over a range of blocks, from the
 * chain's logs.
 * @module wallet-history/transfers
 *
 * What: a token contract logs a Transfer event each time it moves a token,
 * naming the sender and the receiver: ERC-20 tokens with the amount in the
 * event's data, NFTs, such as a 9mm V3 position, with the token's id as a
 * third indexed value. The wrapped coin, WPLS on PulseChain, also logs a
 * Deposit when a wallet wraps PLS and a Withdrawal when it unwraps. So the
 * logs that name a wallet hold every token it moved, whoever sent the
 * transaction: an airdrop the wallet never asked for is there too.
 * `walletTransferLogs` gathers them, each once, in the chain's order.
 *
 * How: a log search names the event's topic and, in each indexed place,
 * the value it must hold, so three searches cover a span: Transfer with
 * the wallet as sender, Transfer with the wallet as receiver, and the
 * wrapped coin's Deposit or Withdrawal for the wallet. A transfer from the
 * wallet to itself is found by both of the first two, and kept once. Each
 * span of the range is searched in its own turn, no wider than the
 * endpoint takes. The explorer is not asked: its history of the wallet
 * this was built for left out transactions and listed transfers the chain
 * does not hold, where the logs are the chain's own record.
 *
 * Fit: a program that sweeps a wallet's history reads these logs for the
 * tokens each transaction moved, and for the transactions the wallet did
 * not send, which `walletSentTransactions` (`wallet-history/sent.js`)
 * cannot find.
 */

import { spansOf } from "./blocks.js";

/**
 * The topic a Transfer event leads with: keccak256 of
 * `Transfer(address,address,uint256)`, the same for ERC-20 and ERC-721.
 */
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** The wrapped coin's Deposit event: keccak256 of `Deposit(address,uint256)`. */
export const DEPOSIT_TOPIC =
  "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c";

/**
 * The wrapped coin's Withdrawal event: keccak256 of
 * `Withdrawal(address,uint256)`.
 */
export const WITHDRAWAL_TOPIC =
  "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65";

/**
 * An address as an indexed value of a log: 32 bytes, the address in the
 * last 20, in lower case.
 *
 * @param {string} address - The address, in any case
 * @returns {string} The topic
 */
export function addressTopic(address) {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

/**
 * The searches that find a wallet's logs in one span.
 *
 * @param {string} walletTopic - The wallet as a topic
 * @param {string} wrappedCoin - The wrapped coin's contract
 * @param {{fromBlock: number, toBlock: number}} span - The span
 * @returns {object[]} The filters, as ethers' `getLogs` takes them
 */
function spanFilters(walletTopic, wrappedCoin, span) {
  return [
    { ...span, topics: [TRANSFER_TOPIC, walletTopic] },
    { ...span, topics: [TRANSFER_TOPIC, null, walletTopic] },
    {
      ...span,
      address: wrappedCoin,
      topics: [[DEPOSIT_TOPIC, WITHDRAWAL_TOPIC], walletTopic],
    },
  ];
}

/**
 * Every log of a range of blocks that names a wallet as a token's sender
 * or receiver, or as the wrapper or unwrapper of the wrapped coin.
 *
 * @param {{ask: function, askAll: function}} paced - The paced provider
 * @param {object} search - What to search
 * @param {string} search.wallet - The wallet
 * @param {string} search.wrappedCoin - The wrapped coin's contract, WPLS
 *   on PulseChain
 * @param {number} search.fromBlock - The range's first block
 * @param {number} search.toBlock - The range's last block
 * @param {number} search.spanBlocks - The widest span one search may ask
 *   for
 * @returns {Promise<object[]>} The logs, each once, ordered by block and
 *   by place in the block
 */
export async function walletTransferLogs(
  paced,
  { wallet, wrappedCoin, fromBlock, toBlock, spanBlocks },
) {
  const walletTopic = addressTopic(wallet);
  const found = new Map();
  for (const span of spansOf(fromBlock, toBlock, spanBlocks)) {
    const answers = await paced.askAll(
      "getLogs",
      spanFilters(walletTopic, wrappedCoin, span).map((filter) => [filter]),
    );
    for (const log of answers.flat())
      found.set(`${log.transactionHash} ${log.index}`, log);
  }
  return [...found.values()].sort((a, b) => {
    const byBlock = a.blockNumber - b.blockNumber;
    return byBlock !== 0 ? byBlock : a.index - b.index;
  });
}
