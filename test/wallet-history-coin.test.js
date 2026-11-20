/**
 * Tests for how `wallet-history/` follows PLS, which moves without a log:
 * the calls of a trace that pay the wallet (`paidTo`), the PLS each
 * transaction the wallet sent moved (`ownCoinFlows`), and the PLS that
 * reached it from elsewhere (`walletCoinInflows`).
 * `wallet-history.test.js` tests the rest of the module.
 * @module test/wallet-history-coin.test
 *
 * The stand-in endpoint (`helpers/stand-in-wallet-chain.js`) works out
 * each balance from the blocks a test describes, apart from the code under
 * test, so the search for payments is checked against its own account.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pacedProvider } from "../wallet-history/paced-provider.js";
import { walletSentTransactions } from "../wallet-history/sent.js";
import { readReceipts } from "../wallet-history/receipts.js";
import { ownCoinFlows, paidTo } from "../wallet-history/coin-flows.js";
import { walletCoinInflows } from "../wallet-history/coin-inflows.js";
import {
  FIRST_BLOCK_TIME,
  standInWalletChain,
} from "./helpers/stand-in-wallet-chain.js";

/** The wallet: made up, in mixed case. */
const WALLET = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";

/** Another wallet: made up. */
const OTHER = `0x${"bb".repeat(20)}`;

/** A router: made up. */
const ROUTER = `0x${"cc".repeat(20)}`;

/** Gas used by each made-up transaction, and its price per unit. */
const GAS = { gasUsed: 100n, gasPrice: 3n };

/**
 * A made-up transaction hash.
 *
 * @param {number} n - Which
 * @returns {string} The hash
 */
function hashOf(n) {
  return `0x${n.toString(16).padStart(64, "0")}`;
}

/**
 * A transaction, as the stand-in describes one: sent by the wallet to the
 * router, changed by what the test gives.
 *
 * @param {number} n - Its hash's number, and its nonce
 * @param {object} [changes] - The values to set in place of its own
 * @returns {object} The transaction
 */
function transaction(n, changes = {}) {
  return {
    hash: hashOf(n),
    from: WALLET,
    to: ROUTER,
    value: 0n,
    nonce: n,
    status: 1,
    ...GAS,
    logs: [],
    pays: [],
    ...changes,
  };
}

/**
 * The flows of every transaction the wallet sent, read as a sweep reads
 * them.
 *
 * @param {object} paced - The paced provider
 * @param {number} toBlock - The range's last block
 * @returns {Promise<object[]>} The flows
 */
async function ownFlows(paced, toBlock) {
  const sent = await walletSentTransactions(paced, WALLET, 1, toBlock);
  const receipts = await readReceipts(
    paced,
    sent.map((one) => one.hash),
    { batchSize: 2 },
  );
  return ownCoinFlows(paced, { wallet: WALLET, sent, receipts, batchSize: 2 });
}

describe("paidTo", () => {
  it("keeps the calls that paid the wallet, and none undone or moving no PLS", () => {
    const trace = {
      type: "CALL",
      from: WALLET,
      to: ROUTER,
      value: "0x0",
      calls: [
        { type: "CALL", from: ROUTER, to: WALLET, value: "0x5" },
        { type: "DELEGATECALL", from: ROUTER, to: WALLET, value: "0x7" },
        { type: "STATICCALL", from: ROUTER, to: WALLET },
        {
          type: "CALL",
          from: ROUTER,
          to: WALLET,
          value: "0x9",
          error: "execution reverted",
          calls: [{ type: "CALL", from: OTHER, to: WALLET, value: "0x4" }],
        },
        { type: "SELFDESTRUCT", from: OTHER, to: WALLET, value: "0x3" },
        { type: "CALL", from: ROUTER, to: OTHER, value: "0x2" },
        { type: "CALL", from: ROUTER, to: WALLET.toLowerCase(), value: "0x0" },
      ],
    };

    assert.deepEqual(paidTo(trace, WALLET), [
      { from: ROUTER, amount: 5n },
      { from: OTHER, amount: 3n },
    ]);
  });
});

describe("ownCoinFlows", () => {
  const chain = () =>
    standInWalletChain({
      latest: 100,
      blocks: {
        10: {
          transactions: [
            transaction(0, {
              pays: [{ from: ROUTER, to: WALLET, amount: 1000n }],
            }),
          ],
        },
        20: { transactions: [transaction(1, { value: 500n })] },
        30: {
          transactions: [
            transaction(2, {
              value: 50n,
              status: 0,
              pays: [{ from: ROUTER, to: WALLET, amount: 10n }],
            }),
          ],
        },
        40: { transactions: [transaction(3, { to: WALLET, value: 77n })] },
      },
    });

  it("gives each transaction's gas, the PLS it sent and was handed back, and the change", async () => {
    const flows = await ownFlows(pacedProvider(chain(), { spacingMs: 0 }), 100);

    assert.deepEqual(
      flows.map((flow) => ({
        ...flow,
        timestamp: flow.timestamp - FIRST_BLOCK_TIME,
      })),
      [
        {
          hash: hashOf(0),
          blockNumber: 10,
          timestamp: 100,
          succeeded: true,
          gasPaid: 300n,
          sent: 0n,
          handedBack: [{ from: ROUTER, amount: 1000n }],
          change: 700n,
        },
        {
          hash: hashOf(1),
          blockNumber: 20,
          timestamp: 200,
          succeeded: true,
          gasPaid: 300n,
          sent: 500n,
          handedBack: [],
          change: -800n,
        },
        {
          hash: hashOf(2),
          blockNumber: 30,
          timestamp: 300,
          succeeded: false,
          gasPaid: 300n,
          sent: 0n,
          handedBack: [],
          change: -300n,
        },
        {
          hash: hashOf(3),
          blockNumber: 40,
          timestamp: 400,
          succeeded: true,
          gasPaid: 300n,
          sent: 77n,
          handedBack: [],
          change: -300n,
        },
      ],
    );
  });

  it("stops at a transaction whose receipt was not read", async () => {
    const paced = pacedProvider(chain(), { spacingMs: 0 });
    const sent = await walletSentTransactions(paced, WALLET, 1, 100);

    await assert.rejects(
      ownCoinFlows(paced, {
        wallet: WALLET,
        sent,
        receipts: new Map(),
        batchSize: 2,
      }),
      /No receipt was read for 0x0+, which the wallet sent/,
    );
  });
});

describe("walletCoinInflows", () => {
  const blocks = {
    10: {
      transactions: [
        transaction(0, { pays: [{ from: ROUTER, to: WALLET, amount: 1000n }] }),
      ],
    },
    15: {
      transactions: [
        transaction(20, { from: OTHER, to: WALLET, value: 2000n }),
      ],
    },
    25: {
      transactions: [
        transaction(21, {
          from: OTHER,
          pays: [{ from: ROUTER, to: WALLET, amount: 300n }],
        }),
      ],
    },
    35: { withdrawals: [{ address: WALLET, amount: 5n }] },
    45: {
      miner: WALLET.toLowerCase(),
      baseFee: 1n,
      transactions: [transaction(22, { from: OTHER })],
    },
    55: { transactions: [transaction(1)] },
  };

  /**
   * The payments found over blocks 1 to 100 of a chain.
   *
   * @param {object} description - The chain, less its latest block and
   *   the wallet's balance at block 0
   * @returns {Promise<object>} What `walletCoinInflows` found, with times
   *   counted from block 0's
   */
  async function inflowsOf(description) {
    const paced = pacedProvider(
      standInWalletChain({
        latest: 100,
        balances: { [WALLET.toLowerCase()]: 10000n },
        ...description,
      }),
      { spacingMs: 0 },
    );
    const own = await ownFlows(paced, 100);
    const found = await walletCoinInflows(paced, {
      wallet: WALLET,
      fromBlock: 1,
      toBlock: 100,
      own,
    });
    return {
      ...found,
      payments: found.payments.map((payment) => ({
        ...payment,
        timestamp: payment.timestamp - FIRST_BLOCK_TIME,
      })),
    };
  }

  it("finds PLS sent by others, paid by contracts, withdrawn and tipped", async () => {
    assert.deepEqual(await inflowsOf({ blocks }), {
      payments: [
        {
          kind: "call",
          blockNumber: 15,
          timestamp: 150,
          hash: hashOf(20),
          from: OTHER,
          amount: 2000n,
        },
        {
          kind: "call",
          blockNumber: 25,
          timestamp: 250,
          hash: hashOf(21),
          from: ROUTER,
          amount: 300n,
        },
        {
          kind: "withdrawal",
          blockNumber: 35,
          timestamp: 350,
          index: 0,
          amount: 5000000000n,
        },
        { kind: "tips", blockNumber: 45, timestamp: 450, amount: 200n },
      ],
      unexplained: [],
    });
  });

  it("finds nothing where the wallet's own transactions explain its balance", async () => {
    assert.deepEqual(
      await inflowsOf({ blocks: { 10: blocks[10], 55: blocks[55] } }),
      {
        payments: [],
        unexplained: [],
      },
    );
  });

  it("reports a change of balance no payment explains, rather than guess at one", async () => {
    assert.deepEqual(
      await inflowsOf({
        blocks: { 10: blocks[10] },
        unaccounted: [{ address: WALLET, block: 65, amount: 42n }],
      }),
      { payments: [], unexplained: [{ blockNumber: 65, amount: 42n }] },
    );
  });
});
