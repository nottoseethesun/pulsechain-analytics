/**
 * The PLS each transaction a wallet sent moved, its gas included: what a
 * receipt shows, and what only a trace shows.
 * @module wallet-history/coin-flows
 *
 * What: PLS, the chain's own coin, leaves no Transfer log when it moves.
 * A transaction the wallet sends spends the PLS it carries, its value,
 * and its gas, which the receipt gives as the gas used times the price
 * paid per unit. A contract the transaction calls can also send PLS back
 * to the wallet as it runs, as a router does at the end of a swap into
 * PLS, or the position manager does when it unwraps the PLS of a
 * withdrawal from a pool. That payment is a call inside the transaction,
 * which neither the receipt nor any log shows; a trace of the
 * transaction, which the endpoint replays call by call, does.
 * `ownCoinFlows` gives, for each transaction the wallet sent, its gas, the
 * PLS it sent, the PLS handed back, and the change in the wallet's balance
 * that adds up to.
 *
 * How: `paidTo` walks a trace's tree of calls and keeps each call that
 * paid the wallet: a call, a contract's creation or a contract's
 * self-destruction whose recipient is the wallet and whose value is above
 * zero. A delegate call or a static call moves no PLS, and a call that
 * failed was undone with everything under it, so neither counts. A
 * transaction that reverted moved nothing but its gas. The traces are
 * asked for in sets, each set in one turn of the paced provider. Tracing
 * needs an endpoint that offers `debug_traceTransaction`, as g4mm4's does
 * and rpc.pulsechain.com's does not.
 *
 * Fit: `walletCoinInflows` (`wallet-history/coin-inflows.js`) sets the
 * changes these transactions made against the wallet's balance, to find
 * the PLS that came in from transactions the wallet did not send.
 */

import { getAddress } from "ethers";
import { sameAddress } from "./sent.js";

/** The kinds of call that move PLS to their recipient. */
const PAYING_CALLS = Object.freeze([
  "CALL",
  "CREATE",
  "CREATE2",
  "SELFDESTRUCT",
]);

/**
 * The PLS a call of a trace carries, as a BigInt.
 *
 * @param {{value?: string}} frame - The call, as the call tracer gives it
 * @returns {bigint} Its value, 0 when it names none
 */
function valueOf(frame) {
  return typeof frame.value === "string" ? BigInt(frame.value) : 0n;
}

/**
 * Every call in a trace's tree that paid a wallet PLS.
 *
 * @param {object} frame - A call, as the call tracer gives it, with the
 *   calls it made under `calls`
 * @param {string} wallet - The wallet
 * @returns {Array<{from: string, amount: bigint}>} Each payment: who paid,
 *   in EIP-55's mixed case, and how much, in the PLS's smallest units
 */
export function paidTo(frame, wallet) {
  if (typeof frame.error === "string") return [];
  const value = valueOf(frame);
  const own =
    PAYING_CALLS.includes(frame.type) &&
    sameAddress(frame.to, wallet) &&
    value > 0n
      ? [{ from: getAddress(frame.from), amount: value }]
      : [];
  const inner = Array.isArray(frame.calls) ? frame.calls : [];
  return [...own, ...inner.flatMap((call) => paidTo(call, wallet))];
}

/**
 * The PLS one transaction the wallet sent moved, from its receipt and its
 * trace.
 *
 * @param {object} transaction - The transaction, as `walletSentTransactions`
 *   gives it
 * @param {object} receipt - Its receipt: `status`, `gasUsed`, and
 *   `gasPrice`, the price paid per unit of gas
 * @param {object} trace - Its trace, from the call tracer
 * @param {string} wallet - The wallet
 * @returns {object} The transaction's flows
 */
function flowsOf(transaction, receipt, trace, wallet) {
  const gasPaid = BigInt(receipt.gasUsed) * BigInt(receipt.gasPrice);
  const succeeded = Number(receipt.status) === 1;
  const payments = succeeded ? paidTo(trace, wallet) : [];
  const received = payments.reduce((sum, payment) => sum + payment.amount, 0n);
  const sent = succeeded ? BigInt(transaction.value) : 0n;
  return {
    hash: transaction.hash,
    blockNumber: transaction.blockNumber,
    timestamp: transaction.timestamp,
    succeeded,
    gasPaid,
    sent,
    handedBack: payments.filter(
      (payment) => !sameAddress(payment.from, wallet),
    ),
    change: received - sent - gasPaid,
  };
}

/**
 * The PLS each transaction a wallet sent moved: its gas, the PLS it sent,
 * the PLS handed back to the wallet inside it, and the change in the
 * wallet's balance those make.
 *
 * A transaction sent from the wallet to itself pays the wallet the PLS it
 * carries, so its change is its gas alone, and no payment of the wallet's
 * own counts as handed back.
 *
 * @param {{askAll: function}} paced - The paced provider
 * @param {object} transactions - What to trace
 * @param {string} transactions.wallet - The wallet
 * @param {object[]} transactions.sent - The wallet's transactions, from
 *   `walletSentTransactions`
 * @param {Map<string, object>} transactions.receipts - Their receipts, by
 *   hash in lower case, from `readReceipts`
 * @param {number} transactions.batchSize - The most traces one turn asks
 *   for
 * @returns {Promise<Array<{hash: string, blockNumber: number,
 *   timestamp: number, succeeded: boolean, gasPaid: bigint, sent: bigint,
 *   handedBack: Array<{from: string, amount: bigint}>,
 *   change: bigint}>>} Each transaction's flows, in the order given
 */
export async function ownCoinFlows(
  paced,
  { wallet, sent, receipts, batchSize },
) {
  const flows = [];
  for (let start = 0; start < sent.length; start += batchSize) {
    const batch = sent.slice(start, start + batchSize);
    const traces = await paced.askAll(
      "send",
      batch.map((transaction) => [
        "debug_traceTransaction",
        [transaction.hash, { tracer: "callTracer" }],
      ]),
    );
    batch.forEach((transaction, at) => {
      const receipt = receipts.get(transaction.hash.toLowerCase());
      if (receipt === undefined)
        throw new Error(
          `No receipt was read for ${transaction.hash}, which the wallet sent`,
        );
      flows.push(flowsOf(transaction, receipt, traces[at], wallet));
    });
  }
  return flows;
}
