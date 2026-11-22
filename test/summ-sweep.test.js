/**
 * Tests for the parts of `summ-sweep/` that read Summ's results and the
 * chain's legs, and match them: `summ-results.js`, `amounts.js`,
 * `legs.js` and `match.js`. `summ-sweep-splits.test.js` tests the
 * withdrawals, LP Ranger's tool, the whole sweep and its command line.
 * @module test/summ-sweep.test
 *
 * Summ's pages are written by `helpers/summ-pages.js`; the wallets and
 * hashes are made up, and the tokens are PulseChain's public ones.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { amountsOf, parseSummResults } from "../summ-sweep/summ-results.js";
import { decimalText, summHolds } from "../summ-sweep/amounts.js";
import { oddTransferLogs, tokenLegs } from "../summ-sweep/legs.js";
import {
  attachManualRows,
  matchLegs,
  summLegsOf,
} from "../summ-sweep/match.js";
import {
  DEPOSIT_TOPIC,
  TRANSFER_TOPIC,
  WITHDRAWAL_TOPIC,
  addressTopic,
} from "../wallet-history/transfers.js";
import { summPage } from "./helpers/summ-pages.js";
import {
  HEX,
  OTHER,
  PM,
  POOL,
  WALLET,
  WPLS,
} from "./helpers/summ-sweep-case.js";

/** A made-up transaction hash. */
const HASH = `0x${"ab".repeat(32)}`;

/** A made-up time, in seconds since 1970: 2023-11-14 22:13:20 UTC. */
const TIME = 1_700_000_000;

/** A made-up amount of HEX: 12345.67890123, in HEX's smallest units. */
const AMOUNT = 1234567890123n;

/**
 * A row of Summ's, as `parseSummResults` gives it.
 *
 * @param {object} changes - The values to set
 * @returns {object} The row
 */
function summRow(changes) {
  return {
    hash: HASH,
    category: "trade",
    timestamp: TIME,
    from: { name: "Wallet", address: WALLET },
    to: { name: "Wallet", address: WALLET },
    incoming: [],
    outgoing: [],
    actionId: "a".repeat(24),
    transactionIds: ["b".repeat(24)],
    ...changes,
  };
}

/**
 * A token leg, as `tokenLegs` gives it.
 *
 * @param {object} changes - The values to set
 * @returns {object} The leg
 */
function leg(changes) {
  return {
    hash: HASH,
    blockNumber: 10,
    timestamp: TIME,
    logIndex: 0,
    direction: "in",
    token: HEX,
    symbol: "HEX",
    decimals: 8,
    amount: AMOUNT,
    counterparty: POOL,
    ...changes,
  };
}

describe("parseSummResults", () => {
  const row = {
    category: "transfer",
    hash: HASH.toUpperCase().replace("0X", "0x"),
    date: "2023-11-14T22:13:20.000Z",
    from: { name: "Second", address: OTHER },
    to: { name: "First", address: WALLET.toUpperCase().replace("0X", "0x") },
    incoming: [{ amount: "12345.67890123", symbol: "HEX" }],
    outgoing: [{ amount: "12345.67890123", symbol: "HEX" }],
    actionId: "0123456789abcdef01234567",
    transactionIds: ["1123456789abcdef01234567", "2123456789abcdef01234567"],
  };

  it("reads each row's ids, hash, time, category, sides and amounts", () => {
    const [parsed] = parseSummResults([
      summPage({ page: 1, pages: 1, rows: [row] }),
    ]);

    assert.deepEqual(parsed, {
      page: 1,
      place: 1,
      heading: "transfer",
      actionId: "0123456789abcdef01234567",
      transactionIds: ["1123456789abcdef01234567", "2123456789abcdef01234567"],
      hash: HASH,
      timestamp: TIME,
      category: "transfer",
      type: "transfer",
      from: { name: "Second (PulseChain) (pulsechain)", address: OTHER },
      to: { name: "First (PulseChain) (pulsechain)", address: WALLET },
      incoming: [{ amount: "12345.67890123", symbol: "HEX" }],
      outgoing: [{ amount: "12345.67890123", symbol: "HEX" }],
    });
  });

  it("reads pages in any order, and a page saved as the connector's json", () => {
    const second = JSON.stringify([
      {
        type: "text",
        text: summPage({
          page: 2,
          pages: 2,
          rows: [{ ...row, actionId: "c".repeat(24) }],
        }),
      },
    ]);

    const rows = parseSummResults([
      second,
      summPage({ page: 1, pages: 2, rows: [row] }),
    ]);

    assert.deepEqual(
      rows.map((one) => [one.page, one.actionId]),
      [
        [1, "0123456789abcdef01234567"],
        [2, "c".repeat(24)],
      ],
    );
  });

  it("refuses a missing page, a page given twice, a short page, and a file that is no page", () => {
    const one = summPage({ page: 1, pages: 2, rows: [row] });

    assert.throws(
      () => parseSummResults([one]),
      /Page 2 of Summ's 2 pages is missing/,
    );
    assert.throws(() => parseSummResults([one, one]), /Page 1 is given twice/);
    assert.throws(
      () =>
        parseSummResults([
          summPage({ page: 1, pages: 1, rows: [row], returned: 2 }),
        ]),
      /Page 1 holds 1 rows, but says it returned 2/,
    );
    assert.throws(
      () => parseSummResults(["hello"]),
      /not a page of Summ's transactions/,
    );
  });

  it("splits an amounts line into its amounts, without their value", () => {
    assert.deepEqual(amountsOf("40.28 HEX, 1 9MM-V3-POS (332.27)"), [
      { amount: "40.28", symbol: "HEX" },
      { amount: "1", symbol: "9MM-V3-POS" },
    ]);
  });
});

describe("summHolds and decimalText", () => {
  it("write an amount as decimal text", () => {
    assert.equal(decimalText(AMOUNT, 8), "12345.67890123");
    assert.equal(decimalText(5n * 10n ** 18n, 18), "5");
  });

  it("match the amount as a JavaScript number, and the amount rounded to 10 significant digits", () => {
    assert.equal(summHolds(AMOUNT, 8, "12345.67890123"), true);
    assert.equal(summHolds(123456789087n, 8, "1234.567891"), true);
    assert.equal(
      summHolds(1234567890678000000000000000n, 18, "1234567891"),
      true,
    );
  });

  it("keep every digit of the whole part when rounding", () => {
    assert.equal(summHolds(12345678901513000000n, 9, "12345678902"), true);
    assert.equal(summHolds(12345678901513000000n, 9, "12345678900"), false);
  });

  it("match a figure two roundings to a JavaScript number moved", () => {
    const raw = 1234567891234639162234567n;
    const viaNumber = Number(raw) / 1e18;

    assert.notEqual(viaNumber, Number(decimalText(raw, 18)));
    assert.equal(summHolds(raw, 18, String(viaNumber)), true);
  });

  it("match a rounded figure one step off the rounded amount", () => {
    /*- 1234567.891 lies between 2 ** 20 and 2 ** 21, where the step is
     * 2 ** -32. */
    const oneStepUp = String(1234567.891 + 2 ** -32);

    assert.equal(oneStepUp, "1234567.8910000003");
    assert.equal(summHolds(1234567890987654321000000n, 18, oneStepUp), true);
  });

  it("refuse a figure that is neither form of the amount", () => {
    assert.equal(summHolds(AMOUNT, 8, "12345.67890125"), false);
    assert.equal(summHolds(123456789087n, 8, "1234.567893"), false);
    assert.equal(summHolds(150000000n, 8, "1"), false);
    assert.equal(summHolds(1n, 0, "x"), false);
    assert.equal(summHolds(0n, 0, " "), false);
    assert.equal(summHolds(AMOUNT, null, "12345.67890123"), false);
  });
});

describe("tokenLegs", () => {
  const log = (n, address, topics, data = ethers.toBeHex(5n, 32)) => ({
    transactionHash: HASH,
    blockNumber: 10,
    index: n,
    address,
    topics,
    data,
  });
  const facts = new Map([
    [HEX, { symbol: "HEX", decimals: 8 }],
    [PM, { symbol: "9mm-V3-POS", decimals: null }],
    [WPLS, { symbol: "WPLS", decimals: 18 }],
  ]);

  it("makes a leg of each token in or out, NFTs and the wrapped coin included", () => {
    const legs = tokenLegs({
      wallet: WALLET,
      wrappedCoin: WPLS,
      tokens: facts,
      times: new Map([[10, TIME]]),
      logs: [
        log(0, HEX, [TRANSFER_TOPIC, addressTopic(POOL), addressTopic(WALLET)]),
        log(1, HEX, [
          TRANSFER_TOPIC,
          addressTopic(WALLET),
          addressTopic(WALLET),
        ]),
        log(
          2,
          PM,
          [
            TRANSFER_TOPIC,
            addressTopic(ethers.ZeroAddress),
            addressTopic(WALLET),
            ethers.toBeHex(12345n, 32),
          ],
          "0x",
        ),
        log(3, WPLS, [DEPOSIT_TOPIC, addressTopic(WALLET)]),
        log(4, WPLS, [WITHDRAWAL_TOPIC, addressTopic(WALLET)]),
        log(5, HEX, [DEPOSIT_TOPIC, addressTopic(WALLET)]),
        log(6, OTHER, [
          TRANSFER_TOPIC,
          addressTopic(POOL),
          addressTopic(WALLET),
        ]),
      ],
    });

    assert.deepEqual(
      legs.map((one) => [
        one.logIndex,
        one.direction,
        one.symbol,
        one.amount,
        one.nftId,
        one.wrap,
        one.counterparty,
      ]),
      [
        [0, "in", "HEX", 5n, undefined, undefined, POOL],
        [1, "out", "HEX", 5n, undefined, undefined, WALLET],
        [1, "in", "HEX", 5n, undefined, undefined, WALLET],
        [2, "in", "9mm-V3-POS", 1n, 12345n, undefined, ethers.ZeroAddress],
        [3, "in", "WPLS", 5n, undefined, "deposit", WPLS],
        [4, "out", "WPLS", 5n, undefined, "withdrawal", WPLS],
        [6, "in", null, 5n, undefined, undefined, POOL],
      ],
    );
    assert.equal(legs[3].decimals, 0);
    assert.equal(legs[6].decimals, null);
    assert.equal(legs[0].timestamp, TIME);
  });

  it("reads no leg from a Transfer log of a shape no ERC-20 or NFT Transfer has, and lists it for the sweep to report", () => {
    const odd = [
      log(0, HEX, [TRANSFER_TOPIC, addressTopic(WALLET)]),
      log(
        1,
        HEX,
        [TRANSFER_TOPIC, addressTopic(POOL), addressTopic(WALLET)],
        "0x",
      ),
    ];
    const legs = tokenLegs({
      wallet: WALLET,
      wrappedCoin: WPLS,
      tokens: facts,
      times: new Map([[10, TIME]]),
      logs: odd,
    });
    assert.deepEqual(legs, []);
    assert.deepEqual(
      oddTransferLogs(odd, facts).map((one) => [one.log, one.problem]),
      [
        [
          odd[0],
          "has 2 topics and 32 bytes of data, a shape no ERC-20 or NFT Transfer has",
        ],
        [
          odd[1],
          "has 3 topics and 0 bytes of data, a shape no ERC-20 or NFT Transfer has",
        ],
      ],
    );
  });

  it("reads no leg from a four-topic Transfer whose contract gives decimals, as an ERC-20's does and no ERC-721 contract's does, and lists it for the sweep to report", () => {
    const fourTopics = [
      log(
        0,
        HEX,
        [
          TRANSFER_TOPIC,
          addressTopic(POOL),
          addressTopic(WALLET),
          ethers.toBeHex(5n, 32),
        ],
        "0x",
      ),
    ];
    const legs = tokenLegs({
      wallet: WALLET,
      wrappedCoin: WPLS,
      tokens: facts,
      times: new Map([[10, TIME]]),
      logs: fourTopics,
    });
    assert.deepEqual(legs, []);
    assert.deepEqual(
      oddTransferLogs(fourTopics, facts).map((one) => one.problem),
      [
        "has 4 topics, as an NFT's Transfer has, but its contract gives decimals, which ERC-721 defines none of, so it may be an ERC-20 that puts its amount in a topic",
      ],
    );
  });
});

describe("matchLegs", () => {
  it("takes a transfer's side of the wallet's, and both sides of a trade, and leaves PLS out", () => {
    const legs = summLegsOf(
      [
        summRow({
          category: "transfer",
          from: { name: "", address: OTHER },
          incoming: [{ amount: "1", symbol: "HEX" }],
          outgoing: [{ amount: "1", symbol: "HEX" }],
        }),
        summRow({
          hash: `0x${"cd".repeat(32)}`,
          incoming: [{ amount: "2", symbol: "HEX" }],
          outgoing: [{ amount: "3", symbol: "PLS" }],
        }),
      ],
      WALLET,
    );

    assert.deepEqual(
      legs.get(HASH).in.map((one) => one.amount),
      ["1"],
    );
    assert.deepEqual(legs.get(HASH).out, []);
    assert.deepEqual(
      legs.get(`0x${"cd".repeat(32)}`).in.map((one) => one.amount),
      ["2"],
    );
    assert.deepEqual(legs.get(`0x${"cd".repeat(32)}`).out, []);
  });

  it("matches leg by leg, then legs of one token added up, and lists what is left on both sides", () => {
    const legs = [
      leg({ amount: 100000000n }),
      leg({
        logIndex: 1,
        amount: 200000000n,
        token: WPLS,
        symbol: "WPLS",
        decimals: 18,
      }),
      leg({ logIndex: 2, amount: 50000000n }),
      leg({ logIndex: 3, amount: 25000000n }),
      leg({
        logIndex: 4,
        direction: "out",
        amount: 1n,
        token: PM,
        symbol: "9mm-V3-POS",
        decimals: 0,
        nftId: 7n,
      }),
      leg({ logIndex: 5, amount: 999n, hash: `0x${"ef".repeat(32)}` }),
      leg({ logIndex: 6, amount: 900000000n, symbol: null, token: OTHER }),
    ];
    const summLegs = summLegsOf(
      [
        summRow({
          incoming: [
            { amount: "1", symbol: "HEX" },
            { amount: "0.75", symbol: "HEX" },
            { amount: "9", symbol: "HEX" },
          ],
          outgoing: [{ amount: "0", symbol: "9MM-V3-POS" }],
        }),
      ],
      WALLET,
    );

    const result = matchLegs(legs, summLegs, new Map([[PM, ["9MM-V3-POS"]]]));

    assert.deepEqual(
      result.unmatched.map((one) => one.logIndex),
      [1, 5, 6],
    );
    assert.equal(result.matches.get(legs[2]).amount, "0.75");
    assert.equal(result.matches.get(legs[3]).amount, "0.75");
    assert.deepEqual(
      result.summUnmatched.map((one) => one.amount),
      ["9"],
    );
  });

  it("leaves out of a later match the Summ legs an earlier one used, without changing them", () => {
    const summLegs = summLegsOf(
      [summRow({ incoming: [{ amount: "1", symbol: "HEX" }] })],
      WALLET,
    );
    const first = matchLegs([leg({ amount: 100000000n })], summLegs, new Map());

    const second = matchLegs(
      [leg({ logIndex: 1, amount: 100000000n })],
      summLegs,
      new Map(),
      first.used,
    );

    assert.equal(first.unmatched.length, 0);
    assert.equal(second.unmatched.length, 1);
    assert.deepEqual(second.summUnmatched, []);
    assert.deepEqual(Object.keys(summLegs.get(HASH).in[0]).sort(), [
      "amount",
      "row",
      "symbol",
    ]);
  });

  it("gives a row entered by hand the hash of the transaction at its time", () => {
    const legs = [
      leg({}),
      leg({ hash: `0x${"cd".repeat(32)}`, timestamp: 1, amount: 7n }),
    ];
    const manual = summRow({
      hash: "abc-manual",
      incoming: [{ amount: "12345.67890123", symbol: "HEX" }],
    });
    const lost = summRow({ hash: "def-manual", timestamp: 5 });

    const [found, notFound, onChain] = attachManualRows(
      [manual, lost, summRow({})],
      legs,
    );

    assert.equal(found.hash, HASH);
    assert.equal(notFound.hash, "def-manual");
    assert.equal(onChain.hash, HASH);
  });

  it("picks, among transactions at a row's time, the one with its amount", () => {
    const other = `0x${"cd".repeat(32)}`;
    const legs = [leg({}), leg({ hash: other, amount: 7n })];
    const manual = summRow({
      hash: "abc-manual",
      incoming: [{ amount: "0.00000007", symbol: "HEX" }],
    });

    assert.equal(attachManualRows([manual], legs)[0].hash, other);
  });
});
