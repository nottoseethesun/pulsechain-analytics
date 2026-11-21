/**
 * Tests for the whole sweep of `summ-sweep/` (`sweep.js`).
 * `summ-sweep.test.js` tests the reading and the match,
 * `summ-sweep-splits.test.js` the withdrawals and LP Ranger's tool, and
 * `summ-sweep-command.test.js` the command line.
 * @module test/summ-sweep-run.test
 *
 * The history swept is that of `helpers/summ-sweep-case.js`, on its
 * stand-in chain, with LP Ranger's records given as the case writes
 * them.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sweepWallet } from "../summ-sweep/sweep.js";
import { pacedProvider } from "../wallet-history/paced-provider.js";
import { standInWalletChain } from "./helpers/stand-in-wallet-chain.js";
import {
  CHAIN,
  HEX,
  ONE,
  PM,
  POOL,
  RECORDS,
  SYNCED_TO,
  TKN,
  WALLET,
  event,
  hashOf,
  paid,
  summRows,
  sweepChain,
  tokenAnswers,
  transaction,
} from "./helpers/summ-sweep-case.js";

describe("sweepWallet", () => {
  it("fixes a split Summ holds whole, matches one it holds in parts, and books the gaps", async () => {
    const chain = sweepChain();

    const result = await sweepWallet(pacedProvider(chain, { spacingMs: 0 }), {
      wallet: WALLET.toLowerCase(),
      fromBlock: 1,
      toBlock: 100,
      chain: CHAIN,
      owner: { summSymbols: {}, csvSymbols: { [HEX]: "pHEX" } },
      summRows: summRows().map((row) => ({
        ...row,
        timestamp: Date.parse(row.date) / 1000,
      })),
      syncedTo: SYNCED_TO,
      readRecords: async (hashes) =>
        new Map(hashes.map((hash) => [hash, RECORDS.get(hash)])),
    });

    assert.deepEqual(result.problems, []);
    assert.deepEqual(
      result.fixes.map(({ summLeg, ...fix }) => ({
        ...fix,
        summ: summLeg.amount,
      })),
      [
        {
          hash: hashOf(0),
          nftId: "7",
          token: HEX,
          received: 3n * ONE,
          principal: 2n * ONE,
          fee: ONE,
          decimals: 8,
          summ: "3",
        },
      ],
    );
    assert.deepEqual(
      result.rows.map((row) => [
        row.type,
        row.baseCurrency,
        row.baseAmount.raw,
        row.from,
        row.id,
      ]),
      [
        ["income", "pHEX", ONE, POOL, hashOf(0)],
        ["remove-liquidity", "TKN", 4n * ONE, POOL, hashOf(0)],
        ["income", "TKN", ONE, POOL, hashOf(0)],
        ["fee", "PLS", 300n, WALLET, hashOf(1)],
      ],
    );
    assert.deepEqual(
      result.unmatched.map((leg) => [
        leg.hash,
        leg.token,
        leg.amount,
        leg.part,
      ]),
      [
        [hashOf(9), TKN, 2n * ONE, undefined],
        [hashOf(0), TKN, 4n * ONE, "principal"],
        [hashOf(0), TKN, ONE, "fee"],
      ],
    );
    assert.deepEqual(
      result.questions.map((one) => [
        one.hash,
        one.reason,
        one.legs[0].amountText,
      ]),
      [
        [
          hashOf(9),
          "received from an address on none of the owner's lists",
          "2 TKN",
        ],
      ],
    );
    assert.deepEqual(result.summUnmatched, []);
    /*- Blocks 10, 20 and 30 hold the wallet's transactions, read once
     * each by the search for them, which gives their times; of the
     * blocks the logs name, only block 40 is read again, for its time. */
    assert.equal(chain.requests.getBlock, 4);
  });

  it("places a withdrawal's PLS on its side, and reports it, since it matches token legs only", async () => {
    /*- Position #11 holds HEX and WPLS. Its drain pays 2 HEX as a token,
     * and 3 PLS that the position manager unwraps from WPLS and pays
     * inside the transaction. */
    const plsWei = 10n ** 18n;
    const chain = standInWalletChain({
      latest: 100,
      contracts: { [HEX]: tokenAnswers("HEX") },
      blocks: {
        10: {
          transactions: [
            transaction(0, {
              logs: [paid(HEX, POOL, 2n * ONE)],
              pays: [{ from: PM, to: WALLET, amount: 3n * plsWei }],
            }),
          ],
        },
      },
    });
    const records = new Map([
      [
        hashOf(0),
        {
          kind: "drain",
          liquidity: [
            event("DecreaseLiquidity", 11, ONE, 2n * plsWei),
            event("Collect", 11, 2n * ONE, 3n * plsWei),
          ],
        },
      ],
    ]);

    const result = await sweepWallet(pacedProvider(chain, { spacingMs: 0 }), {
      wallet: WALLET,
      fromBlock: 1,
      toBlock: 100,
      chain: CHAIN,
      owner: { summSymbols: {}, csvSymbols: {} },
      summRows: [],
      syncedTo: SYNCED_TO,
      readRecords: async () => records,
    });

    assert.deepEqual(
      result.unmatched.map((leg) => [leg.token, leg.amount, leg.part]),
      [
        [HEX, ONE, "principal"],
        [HEX, ONE, "fee"],
      ],
    );
    assert.deepEqual(
      result.rows.map((row) => [row.type, row.baseAmount.raw, row.feeAmount]),
      [
        ["remove-liquidity", ONE, { raw: 300n, decimals: 18 }],
        ["income", ONE, undefined],
      ],
    );
    assert.deepEqual(result.problems, [
      {
        hash: hashOf(0),
        problem:
          "position #11 paid 3 PLS through the position manager, 1 of it fees, and the sweep matches token legs only, so its principal and fees are not checked against Summ",
      },
    ]);
  });

  it("stops on a change of balance no payment explains", async () => {
    const chain = standInWalletChain({
      latest: 100,
      blocks: {},
      unaccounted: [{ address: WALLET, block: 50, amount: 7n }],
    });

    await assert.rejects(
      sweepWallet(pacedProvider(chain, { spacingMs: 0 }), {
        wallet: WALLET,
        fromBlock: 1,
        toBlock: 100,
        chain: CHAIN,
        owner: { summSymbols: {}, csvSymbols: {} },
        summRows: [],
        syncedTo: SYNCED_TO,
        readRecords: async () => new Map(),
      }),
      /changed in a way no payment explains, in blocks 50/,
    );
  });
});
