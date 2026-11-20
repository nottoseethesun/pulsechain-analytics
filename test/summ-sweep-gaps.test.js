/**
 * Tests for the rows of swaps the Summ sweep writes, and for what all the
 * rows of a transaction share (`summ-sweep/gaps.js`): how much of it Summ
 * holds, its gas, the transactions Summ's sync has not reached, and the
 * transactions that moved no token. `summ-sweep-gap-rules.test.js` tests
 * the other rules.
 * @module test/summ-sweep-gaps.test
 *
 * The legs and transactions are built by `helpers/summ-gaps.js`, with
 * made-up wallets, tokens and hashes.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DAI,
  MAXI,
  ONE,
  OTHER,
  PLS_ONE,
  ROUTER,
  TIME,
  TKN,
  WALLET,
  brief,
  gapLeg,
  hashOf,
  runGaps,
  sentBy,
  summRowOf,
} from "./helpers/summ-gaps.js";

describe("swaps", () => {
  it("books both sides of a swap of tokens, adding up the legs of a side", () => {
    const legs = [
      gapLeg({
        direction: "out",
        token: DAI,
        amount: 100n * ONE,
        counterparty: ROUTER,
      }),
      gapLeg({
        logIndex: 1,
        token: MAXI,
        amount: 30n * ONE,
        counterparty: ROUTER,
      }),
      gapLeg({
        logIndex: 2,
        token: MAXI,
        amount: 20n * ONE,
        counterparty: ROUTER,
      }),
    ];

    const { rows } = runGaps({ legs, txs: [sentBy(0)] });

    assert.deepEqual(rows.map(brief), [
      ["sell", "DAI", 100n * ONE, WALLET, ROUTER, DAI],
      ["buy", "MAXI", 50n * ONE, ROUTER, WALLET, MAXI],
    ]);
    assert.match(
      rows[0].description,
      /^Sell side of a swap of 100 DAI for 50 MAXI\. The buy row of the same hash holds the 50 MAXI\. Bucket B/,
    );
    assert.match(
      rows[1].description,
      /^Buy side of a swap of 100 DAI for 50 MAXI\. The sell row of the same hash holds the 100 DAI\. It adds up 2 legs of MAXI\. Bucket B/,
    );
    assert.notEqual(rows[0].feeAmount, undefined);
  });

  it("books the token side of a swap with PLS, either way", () => {
    const legs = [
      gapLeg({ token: TKN, counterparty: ROUTER }),
      gapLeg({ n: 1, direction: "out", token: TKN, counterparty: ROUTER }),
    ];
    const txs = [
      sentBy(0, { sent: 5n * PLS_ONE }),
      sentBy(1, { handedBack: [{ from: ROUTER, amount: 7n * PLS_ONE }] }),
    ];

    const { rows } = runGaps({ legs, txs });

    assert.deepEqual(
      rows.map((row) => row.type),
      ["buy", "sell"],
    );
    assert.match(
      rows[0].description,
      /^Buy side of a swap of 5 PLS for 1 TKN\. The 5 PLS moved without a log, so this file holds no row for it\./,
    );
    assert.match(
      rows[1].description,
      /^Sell side of a swap of 1 TKN for 7 PLS\./,
    );
  });

  it("books only what Summ lacks of a swap, and says what it holds", () => {
    const sold = gapLeg({
      direction: "out",
      token: DAI,
      amount: 100n * ONE,
      counterparty: ROUTER,
    });
    const bought = gapLeg({
      logIndex: 1,
      token: MAXI,
      amount: 50n * ONE,
      counterparty: ROUTER,
    });
    const second = gapLeg({
      n: 1,
      direction: "out",
      token: DAI,
      amount: 60n * ONE,
      counterparty: ROUTER,
    });
    const third = gapLeg({
      n: 1,
      logIndex: 1,
      direction: "out",
      token: DAI,
      amount: 40n * ONE,
      counterparty: ROUTER,
    });
    const fourth = gapLeg({
      n: 1,
      logIndex: 2,
      token: MAXI,
      amount: 9n * ONE,
      counterparty: ROUTER,
    });

    const { rows } = runGaps({
      legs: [sold, bought, second, third, fourth],
      gaps: [bought, third],
      txs: [sentBy(0), sentBy(1)],
      summRows: [summRowOf(0, "trade"), summRowOf(1, "trade")],
    });

    assert.deepEqual(rows.map(brief), [
      ["buy", "MAXI", 50n * ONE, ROUTER, WALLET, MAXI],
      ["sell", "DAI", 40n * ONE, WALLET, ROUTER, DAI],
    ]);
    assert.match(
      rows[0].description,
      /\. Summ holds the 100 DAI\. Bucket A: Summ holds part of this transaction, as trade\.$/,
    );
    assert.match(
      rows[1].description,
      /^Sell side of a swap of 100 DAI for 9 MAXI\. Summ holds the 9 MAXI\. This row holds the 40 DAI of it Summ lacks\./,
    );
  });

  it("asks about legs of a swap that add up to nothing, and leaves a transaction with more sides to the other rules", () => {
    const legs = [
      gapLeg({
        direction: "out",
        token: DAI,
        amount: 100n * ONE,
        counterparty: ROUTER,
      }),
      gapLeg({
        logIndex: 1,
        direction: "out",
        token: DAI,
        amount: 5n * ONE,
        counterparty: ROUTER,
      }),
      gapLeg({
        logIndex: 2,
        token: DAI,
        amount: 5n * ONE,
        counterparty: ROUTER,
      }),
      gapLeg({
        logIndex: 3,
        token: MAXI,
        amount: 50n * ONE,
        counterparty: ROUTER,
      }),
      gapLeg({ n: 1, direction: "out", token: DAI, counterparty: ROUTER }),
      gapLeg({
        n: 1,
        logIndex: 1,
        direction: "out",
        token: TKN,
        counterparty: ROUTER,
      }),
      gapLeg({ n: 1, logIndex: 2, token: MAXI, counterparty: ROUTER }),
    ];

    const { rows, questions } = runGaps({
      legs,
      gaps: legs.filter(
        (leg) =>
          leg.logIndex === 1 || leg.logIndex === 2 || leg.blockNumber === 1,
      ),
      txs: [sentBy(0), sentBy(1)],
      summRows: [summRowOf(0, "trade"), summRowOf(1, "trade")],
    });

    assert.deepEqual(rows, []);
    assert.deepEqual(
      questions.map((one) => [one.hash, one.reason]),
      [
        [
          hashOf(0),
          "its legs Summ lacks of this token, in and out, add up to nothing",
        ],
        [hashOf(1), "sent to an address on none of the owner's lists"],
        [hashOf(1), "sent to an address on none of the owner's lists"],
        [hashOf(1), "received from an address on none of the owner's lists"],
      ],
    );
  });
});

describe("what all the rows of a transaction share", () => {
  it("says how much of it Summ holds, and puts gas only where Summ holds nothing", () => {
    const legs = [0, 1].map((n) => gapLeg({ n, counterparty: OTHER }));
    const owner = { incomeTokens: [TKN] };

    const { rows } = runGaps({
      legs,
      txs: [sentBy(0), sentBy(1)],
      summRows: [summRowOf(1, "approval"), summRowOf(1, "approval")],
      owner,
    });

    assert.match(
      rows[0].description,
      / Bucket B: Summ holds nothing of this transaction\. Its gas, 0\.0000000000000003 PLS, is on this row only\.$/,
    );
    assert.match(
      rows[1].description,
      / Bucket A: Summ holds only this transaction's gas, as an approval\.$/,
    );
    assert.equal(rows[1].feeAmount, undefined);
  });

  it("leaves the gas of a transaction newer than Summ's newest row to Summ's sync", () => {
    const legs = [gapLeg({ n: 9, counterparty: OTHER })];

    const { rows } = runGaps({
      legs,
      txs: [sentBy(9), sentBy(10, { succeeded: false })],
      summRows: [summRowOf(5, "trade")],
      owner: { incomeTokens: [TKN] },
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].feeAmount, undefined);
    assert.match(
      rows[0].description,
      /Summ's newest row of this wallet is of 2023-11-14 22:13:25 UTC, so Summ's sync has not reached this transaction: its gas is left off, for that sync to bring\.$/,
    );
  });

  it("notes the gas on the questions of a transaction Summ holds nothing of", () => {
    const { questions } = runGaps({
      legs: [gapLeg({ counterparty: OTHER })],
      txs: [sentBy(0)],
    });

    assert.equal(
      questions[0].gasNote,
      "Summ holds nothing of this transaction, so its gas, 0.0000000000000003 PLS, goes on its first row.",
    );
  });
});

describe("transactions the wallet sent that moved no token", () => {
  it("writes a Fee row of the gas of one that failed or moved nothing, and asks about the rest", () => {
    const txs = [
      sentBy(0, { succeeded: false }),
      sentBy(1),
      sentBy(2, { sent: PLS_ONE }),
      sentBy(3, { to: null }),
      sentBy(4),
    ];

    const { rows, questions } = runGaps({
      txs,
      summRows: [summRowOf(4, "approval")],
    });

    assert.deepEqual(rows.map(brief), [
      ["fee", "PLS", 300n, WALLET, ROUTER, undefined],
      ["fee", "PLS", 300n, WALLET, ROUTER, undefined],
    ]);
    assert.equal(
      rows[0].description,
      "Gas of a failed transaction; nothing else moved. Bucket B: Summ holds nothing of this transaction.",
    );
    assert.match(
      rows[1].description,
      /^Gas of a transaction that moved no token and no PLS, such as an approval\./,
    );
    assert.equal(rows[0].timestamp, TIME);
    assert.deepEqual(
      questions.map((one) => [one.hash, one.reason, one.plsSent]),
      [
        [
          hashOf(2),
          "it moved PLS and no token, and the sweep writes no rows of PLS",
          PLS_ONE,
        ],
        [hashOf(3), "it created a contract", 0n],
      ],
    );
  });
});
