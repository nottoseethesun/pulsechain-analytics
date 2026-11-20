/**
 * Tests for the rules that book the legs Summ lacks of one transaction
 * (`summ-sweep/gap-rules.js`), outside a swap: withdrawals and deposits
 * of positions, wraps, spam, the owner's wallets, income tokens, and the
 * questions for the legs no rule books. `summ-sweep-gaps.test.js` tests
 * swaps, and what all the rows of a transaction share.
 * @module test/summ-sweep-gap-rules.test
 *
 * The legs and transactions are built by `helpers/summ-gaps.js`, with
 * made-up wallets, tokens and hashes.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HEX,
  ONE,
  OTHER,
  PM,
  POOL,
  TKN,
  WALLET,
  WPLS,
  ZERO,
  brief,
  gapLeg,
  hashOf,
  runGaps,
  sentBy,
  summRowOf,
} from "./helpers/summ-gaps.js";

/** A row of Summ's, so a transaction's rows carry no gas. */
const HELD = (n) => [summRowOf(n, "approval")];

describe("the rules of a position's transactions", () => {
  it("books a deposit and the position's NFT, with the gas on the first row", () => {
    const legs = [
      gapLeg({ direction: "out", amount: 2n * ONE, counterparty: POOL }),
      gapLeg({
        logIndex: 1,
        token: PM,
        decimals: 0,
        amount: 1n,
        nftId: 7n,
        counterparty: ZERO,
      }),
    ];

    const { rows, questions } = runGaps({ legs, txs: [sentBy(0, { to: PM })] });

    assert.deepEqual(questions, []);
    assert.deepEqual(rows.map(brief), [
      ["add-liquidity", "TKN", 2n * ONE, WALLET, POOL, TKN],
      ["receive-lp-token", "9MM-V3-POS", 1n, PM, WALLET, PM],
    ]);
    assert.equal(
      rows[0].description,
      "Deposit into 9mm V3 position #7. Bucket B: Summ holds nothing of this transaction. Its gas, 0.0000000000000003 PLS, is on this row only.",
    );
    assert.deepEqual(rows[0].feeAmount, { raw: 300n, decimals: 18 });
    assert.equal(rows[1].feeAmount, undefined);
  });

  it("books a withdrawal's parts, a collect of fees alone, and a burned NFT", () => {
    const split = {
      hash: hashOf(0),
      nftId: "9",
      token: HEX,
      received: 3n * ONE,
      principal: 2n * ONE,
      fee: ONE,
    };
    const hex = gapLeg({ token: HEX, counterparty: POOL, split });
    const legs = [
      { ...hex, amount: 2n * ONE, part: "principal" },
      { ...hex, amount: ONE, part: "fee" },
      gapLeg({ logIndex: 1, counterparty: POOL }),
      gapLeg({
        logIndex: 2,
        direction: "out",
        token: PM,
        decimals: 0,
        amount: 1n,
        nftId: 9n,
        counterparty: ZERO,
      }),
    ];
    const splits = [
      split,
      { ...split, token: TKN, received: ONE, principal: 0n, fee: ONE },
    ];

    const { rows } = runGaps({
      legs,
      splits,
      txs: [sentBy(0, { to: PM })],
      summRows: HELD(0),
    });

    assert.deepEqual(rows.map(brief), [
      ["remove-liquidity", "HEX", 2n * ONE, POOL, WALLET, HEX],
      ["income", "HEX", ONE, POOL, WALLET, HEX],
      ["income", "TKN", ONE, POOL, WALLET, TKN],
      ["return-lp-token", "9MM-V3-POS", 1n, WALLET, PM, PM],
    ]);
    assert.match(
      rows[0].description,
      /^Principal of 9mm V3 position #9: of the 3 HEX it paid out, the 2 HEX its DecreaseLiquidity events since its last collect name\. Bucket A: Summ holds only this transaction's gas, as an approval\.$/,
    );
    assert.match(
      rows[1].description,
      /^Fees of 9mm V3 position #9: the 3 HEX it paid out, less the principal of 2 HEX\./,
    );
    assert.match(
      rows[2].description,
      /no principal left the position since its last collect, so all of it is fees/,
    );
    assert.match(
      rows[3].description,
      /left the wallet as the position manager burned it/,
    );
  });

  it("asks about a coin of a collect it could not split, or that no collect accounts for", () => {
    const legs = [
      gapLeg({ counterparty: POOL }),
      gapLeg({ n: 1, counterparty: POOL }),
    ];

    const { rows, questions } = runGaps({
      legs,
      txs: [sentBy(0, { to: PM }), sentBy(1, { to: PM })],
      problems: [
        { hash: hashOf(0), problem: "it collects from more than one position" },
      ],
      summRows: [...HELD(0), ...HELD(1)],
    });

    assert.deepEqual(rows, []);
    assert.deepEqual(
      questions.map((one) => one.reason),
      [
        "the sweep could not split this collect: it collects from more than one position",
        "a coin the position manager paid that no collect in this transaction accounts for",
      ],
    );
    assert.deepEqual(questions[0].legs[0].amount, ONE);
  });
});

describe("the rules of wraps, spam, the owner's wallets and income", () => {
  it("books each by its rule, the owner's lists in any case", () => {
    const mine = "0x" + "AB".repeat(20);
    const spam = "0x" + "c1".repeat(20);
    const legs = [
      gapLeg({ token: WPLS, counterparty: WPLS, wrap: "deposit" }),
      gapLeg({
        n: 1,
        token: WPLS,
        direction: "out",
        counterparty: WPLS,
        wrap: "withdrawal",
      }),
      gapLeg({ n: 2, token: spam, symbol: "WIN", counterparty: OTHER }),
      gapLeg({ n: 3, counterparty: mine.toLowerCase() }),
      gapLeg({ n: 4, direction: "out", counterparty: mine.toLowerCase() }),
      gapLeg({ n: 5, token: HEX, counterparty: OTHER }),
    ];

    const { rows, questions } = runGaps({
      legs,
      summRows: [0, 1, 2, 3, 4, 5].flatMap(HELD),
      owner: {
        ownWallets: { [mine]: "Cold storage" },
        spamTokens: [spam.toUpperCase().replace("0X", "0x")],
        incomeTokens: [HEX],
      },
    });

    assert.deepEqual(questions, []);
    assert.deepEqual(
      rows.map((row) => [row.type, row.baseCurrency]),
      [
        ["swap-in", "WPLS"],
        ["swap-out", "WPLS"],
        ["spam", "WIN"],
        ["receive", "TKN"],
        ["send", "TKN"],
        ["income", "HEX"],
      ],
    );
    assert.match(
      rows[0].description,
      /^Wrap of PLS into WPLS: the WPLS side\. The PLS side moved without a log/,
    );
    assert.match(
      rows[3].description,
      /^Transfer in from the owner's wallet Cold storage\./,
    );
    assert.match(
      rows[4].description,
      /^Transfer out to the owner's wallet Cold storage\./,
    );
    assert.match(
      rows[5].description,
      /on the owner's list of tokens received as income/,
    );
  });

  it("adds up legs of one token, and takes the owner's symbol for a token without one", () => {
    const nameless = "0x" + "c2".repeat(20);
    const legs = [
      gapLeg({ token: nameless, counterparty: OTHER }),
      gapLeg({ logIndex: 1, token: nameless, counterparty: OTHER }),
    ];

    const { rows } = runGaps({
      legs,
      summRows: HELD(0),
      owner: { incomeTokens: [nameless], csvSymbols: { [nameless]: "NAMED" } },
    });

    assert.deepEqual(rows.map(brief), [
      ["income", "NAMED", 2n * ONE, OTHER, WALLET, nameless],
    ]);
    assert.match(rows[0].description, / It adds up 2 legs of NAMED\. /);
  });
});

describe("the questions", () => {
  it("asks about every leg no rule books, rather than guess", () => {
    const legs = [
      gapLeg({ counterparty: OTHER }),
      gapLeg({ n: 1, direction: "out", counterparty: OTHER }),
      gapLeg({ n: 2, direction: "out", counterparty: ZERO }),
      gapLeg({ n: 3, counterparty: ZERO }),
      gapLeg({ n: 4, token: PM, decimals: 0, amount: 1n, nftId: 3n }),
      gapLeg({ n: 5, counterparty: WALLET }),
      gapLeg({ n: 6, decimals: null }),
      gapLeg({ n: 7, symbol: null }),
    ];

    const { rows, questions } = runGaps({
      legs,
      summRows: [0, 1, 2, 3, 4, 5, 6, 7].flatMap(HELD),
    });

    assert.deepEqual(rows, []);
    assert.deepEqual(
      questions.map((one) => one.reason),
      [
        "received from an address on none of the owner's lists",
        "sent to an address on none of the owner's lists",
        "sent to the zero address: a burn or a stake",
        "minted to the wallet: an airdrop, the end of a stake, or a bridge",
        "an NFT moved outside the position manager",
        "a transfer from the wallet to itself",
        "its contract gave no decimals",
        "its contract gave no symbol, and the owner's settings give none",
      ],
    );
    assert.deepEqual(questions[4].legs[0].nftId, 3n);
  });
});
