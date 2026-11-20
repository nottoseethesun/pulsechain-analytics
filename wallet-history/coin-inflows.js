/**
 * The PLS that reached a wallet from transactions it did not send, found
 * from its balance.
 * @module wallet-history/coin-inflows
 *
 * What: PLS reaches a wallet without a log naming it when another wallet
 * sends it, when a contract pays it inside someone else's transaction,
 * when the beacon chain pays a validator's withdrawal to it, or when it
 * is the fee recipient of a block and takes the block's tips. None of
 * these is a transaction the wallet sent, so `walletSentTransactions`
 * does not find them, and no log search does either. The wallet's
 * balance does: the endpoint answers it for the end of any past block.
 * `walletCoinInflows` finds every such payment in a range of blocks, and
 * reports any change in the balance it cannot explain rather than guess
 * at one.
 *
 * How: the change in the wallet's balance over a span of blocks is the
 * change its own transactions made, which `ownCoinFlows` gives, plus the
 * PLS that came in from elsewhere. Only the wallet's own transactions can
 * take PLS from it, so a span whose balance changed by exactly its own
 * transactions' changes holds no other payment. A span that does not add
 * up is halved, a balance read at its middle, until single blocks are
 * left. Each such block is read for each kind of payment: its trace,
 * every transaction replayed call by call, for calls paying the wallet
 * in transactions the wallet did not send; its withdrawals, whose amounts
 * are in gwei, 10^9 of PLS's smallest units; and, when the wallet is the
 * block's fee recipient, the tips of every transaction in it, each its
 * gas used times what it paid per unit above the block's base fee. A
 * block whose payments do not add up to its unexplained change is
 * reported with the difference.
 *
 * Fit: a sweep of a wallet records each payment found as PLS received,
 * from its sender, and stops on a block it cannot explain. Balances and
 * traces at past blocks need an endpoint that keeps past state and offers
 * the debug methods, as g4mm4's does.
 */

import { hexBlock } from "./blocks.js";
import { paidTo } from "./coin-flows.js";
import { sameAddress } from "./sent.js";

/** One gwei, in PLS's smallest units: the unit of a withdrawal's amount. */
const GWEI = 10n ** 9n;

/**
 * The change the wallet's own transactions made over a span of blocks.
 *
 * @param {object[]} own - The flows of the wallet's transactions
 * @param {number} low - The span's first block
 * @param {number} high - The span's last block
 * @returns {bigint} The change, in PLS's smallest units
 */
function ownChange(own, low, high) {
  return own
    .filter((flow) => flow.blockNumber >= low && flow.blockNumber <= high)
    .reduce((sum, flow) => sum + flow.change, 0n);
}

/**
 * The tips a block paid its fee recipient.
 *
 * @param {{ask: function}} paced - The paced provider
 * @param {object} block - The block, as json-rpc gives it
 * @returns {Promise<bigint>} The tips, in PLS's smallest units
 */
async function tipsOf(paced, block) {
  const receipts = await paced.ask("send", "eth_getBlockReceipts", [
    block.number,
  ]);
  const baseFee = BigInt(block.baseFeePerGas);
  return receipts.reduce(
    (sum, receipt) =>
      sum +
      BigInt(receipt.gasUsed) * (BigInt(receipt.effectiveGasPrice) - baseFee),
    0n,
  );
}

/**
 * Every payment of PLS to the wallet in one block, from transactions it
 * did not send, its withdrawals and its fee recipient's tips.
 *
 * @param {{ask: function}} paced - The paced provider
 * @param {object} search - The search: `wallet`, and `ownHashes`, the
 *   hashes of the wallet's own transactions, in lower case
 * @param {number} number - The block's number
 * @returns {Promise<object[]>} The payments
 */
async function paymentsIn(paced, search, number) {
  const block = await paced.ask("send", "eth_getBlockByNumber", [
    hexBlock(number),
    false,
  ]);
  const traces = await paced.ask("send", "debug_traceBlockByNumber", [
    hexBlock(number),
    { tracer: "callTracer" },
  ]);
  const at = { blockNumber: number, timestamp: Number(block.timestamp) };
  const calls = traces
    .filter((trace) => !search.ownHashes.has(trace.txHash.toLowerCase()))
    .flatMap((trace) =>
      paidTo(trace.result, search.wallet).map((payment) => ({
        kind: "call",
        ...at,
        hash: trace.txHash,
        ...payment,
      })),
    );
  const withdrawals = (block.withdrawals ?? [])
    .filter((withdrawal) => sameAddress(withdrawal.address, search.wallet))
    .map((withdrawal) => ({
      kind: "withdrawal",
      ...at,
      index: Number(withdrawal.index),
      amount: BigInt(withdrawal.amount) * GWEI,
    }));
  const tips = sameAddress(block.miner, search.wallet)
    ? [{ kind: "tips", ...at, amount: await tipsOf(paced, block) }]
    : [];
  return [...calls, ...withdrawals, ...tips];
}

/**
 * One step of the search: the payments in a span, given the wallet's
 * balance at the end of the block before the span and at the span's end.
 *
 * @param {{ask: function}} paced - The paced provider
 * @param {object} search - The search: `wallet`, `own`, `ownHashes`, and
 *   `found`, where payments and unexplained changes are gathered
 * @param {{low: number, high: number, before: bigint, after: bigint}} span
 *   - The span's blocks, and the two balances
 * @returns {Promise<void>} Settles once the span is searched
 */
async function searchSpan(paced, search, { low, high, before, after }) {
  const unexplained = after - before - ownChange(search.own, low, high);
  if (unexplained === 0n) return;
  if (low === high) {
    const payments = await paymentsIn(paced, search, low);
    search.found.payments.push(...payments);
    const paid = payments.reduce((sum, payment) => sum + payment.amount, 0n);
    if (paid !== unexplained)
      search.found.unexplained.push({
        blockNumber: low,
        amount: unexplained - paid,
      });
    return;
  }
  const middle = Math.floor((low + high) / 2);
  const atMiddle = await paced.ask("getBalance", search.wallet, middle);
  await searchSpan(paced, search, {
    low,
    high: middle,
    before,
    after: atMiddle,
  });
  await searchSpan(paced, search, {
    low: middle + 1,
    high,
    before: atMiddle,
    after,
  });
}

/**
 * Every payment of PLS to a wallet in a range of blocks that no
 * transaction of its own made, and every block whose change in balance
 * those payments and its own transactions do not explain.
 *
 * @param {{ask: function}} paced - The paced provider
 * @param {object} range - What to search
 * @param {string} range.wallet - The wallet
 * @param {number} range.fromBlock - The range's first block, above block 0
 * @param {number} range.toBlock - The range's last block
 * @param {object[]} range.own - The flows of every transaction the wallet
 *   sent in the range, from `ownCoinFlows`
 * @returns {Promise<{payments: object[], unexplained: Array<{blockNumber:
 *   number, amount: bigint}>}>} The payments, each with its `kind`
 *   (`call`, with the `hash` and the payer `from`; `withdrawal`, with its
 *   `index`; or `tips`), its block, its time and its `amount`; and each
 *   block left unexplained, with the change no payment explains
 */
export async function walletCoinInflows(
  paced,
  { wallet, fromBlock, toBlock, own },
) {
  const search = {
    wallet,
    own,
    ownHashes: new Set(own.map((flow) => flow.hash.toLowerCase())),
    found: { payments: [], unexplained: [] },
  };
  const before = await paced.ask("getBalance", wallet, fromBlock - 1);
  const after = await paced.ask("getBalance", wallet, toBlock);
  await searchSpan(paced, search, {
    low: fromBlock,
    high: toBlock,
    before,
    after,
  });
  return search.found;
}
