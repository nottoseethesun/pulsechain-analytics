/**
 * Tests for how `summ-sweep/` splits withdrawals from 9mm V3 positions
 * into principal and fees (`positions.js`): the decreases each collect
 * takes, the principal a Collect event leaves owed, the collects it
 * reports rather than split, and a position owed coins when the swept
 * range began. `summ-sweep-splits.test.js` tests what is done with the
 * splits.
 * @module test/summ-sweep-positions.test
 *
 * The withdrawals are those of `helpers/summ-sweep-case.js`, or made up
 * in a test, as LP Ranger's record gives them.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { splitCollects } from "../summ-sweep/positions.js";
import {
  HEX,
  ONE,
  OTHER,
  POOL,
  RECORDS,
  TKN,
  event,
  hashOf,
} from "./helpers/summ-sweep-case.js";

/** One coin of a made-up position, the lower of its two by address. */
const COIN = `0x${"11".repeat(20)}`;

/**
 * Splits collects of position #7 that move only its first coin.
 *
 * @param {Array<{events: Array<Array<string>>, received: bigint}>} txs - Each transaction's liquidity events, as [event, amount0], and the coin the wallet received in it
 * @param {Map<string, bigint[]>} [owedAtStart] - The coins each position was owed when the range began
 * @returns {{splits: object[], problems: object[]}} What `splitCollects` gives
 */
function splitFirstCoin(txs, owedAtStart = new Map()) {
  const hashes = txs.map((_, index) => `0x0${index + 1}`);
  return splitCollects({
    order: hashes,
    records: new Map(
      txs.map((tx, index) => [
        hashes[index],
        {
          liquidity: tx.events.map(([event, amount0]) => ({
            event,
            nftId: "7",
            amount0,
            amount1: "0",
          })),
        },
      ]),
    ),
    receivedIn: (hash) => {
      const got = txs[hashes.indexOf(hash)].received;
      return new Map(got === 0n ? [] : [[COIN, got]]);
    },
    owedAtStart,
  });
}

describe("splitCollects", () => {
  const received = (coins) => () => new Map(coins);

  it("carries to the next collect only the principal the Collect event left owed, whatever the wallet received", () => {
    const sentElsewhere = splitFirstCoin([
      {
        events: [
          ["DecreaseLiquidity", "100"],
          ["Collect", "100"],
        ],
        received: 0n,
      },
      { events: [["Collect", "120"]], received: 120n },
    ]);
    assert.deepEqual(
      sentElsewhere.splits.map((one) => [one.hash, one.principal, one.fee]),
      [["0x02", 0n, 120n]],
    );
    const taxed = splitFirstCoin([
      {
        events: [
          ["DecreaseLiquidity", "100"],
          ["Collect", "100"],
        ],
        received: 90n,
      },
      { events: [["Collect", "50"]], received: 45n },
    ]);
    assert.deepEqual(
      taxed.splits.map((one) => [one.hash, one.principal, one.fee]),
      [["0x02", 0n, 45n]],
    );
  });

  it("reports each collect of a position owed coins when the range began while coins owed from before the range may remain", () => {
    const { splits, problems } = splitFirstCoin(
      [
        {
          events: [
            ["DecreaseLiquidity", "50"],
            ["Collect", "30"],
          ],
          received: 30n,
        },
        { events: [["Collect", "125"]], received: 125n },
      ],
      new Map([["7", [100n, 0n]]]),
    );
    assert.deepEqual(splits, []);
    assert.deepEqual(
      problems.map((one) => one.hash),
      ["0x01", "0x02"],
    );
  });

  it("reports a later collect of a position that a transaction collected from with another, while that collect paid out less than it was owed when the range began", () => {
    const { splits, problems } = splitCollects({
      order: [hashOf(3), hashOf(4)],
      records: new Map([
        [
          hashOf(3),
          {
            liquidity: [
              event("Collect", 9, 1n, 0n),
              event("Collect", 11, 1n, 1n),
            ],
          },
        ],
        [
          hashOf(4),
          {
            liquidity: [
              event("DecreaseLiquidity", 9, 100n, 0n),
              event("Collect", 9, 103n, 0n),
            ],
          },
        ],
      ]),
      receivedIn: (hash) =>
        hash === hashOf(4) ? new Map([[TKN, 103n]]) : new Map(),
      owedAtStart: new Map([["9", [ONE, 0n]]]),
    });
    assert.deepEqual(splits, []);
    assert.deepEqual(
      problems.map((one) => one.hash),
      [hashOf(3), hashOf(4)],
    );
  });

  it("reports a collect that paid nothing of a coin with principal waiting, and keeps that principal for the next collect", () => {
    const coinA = `0x${"11".repeat(20)}`;
    const coinB = `0x${"22".repeat(20)}`;
    const liquidity = (name, amount0, amount1) => ({
      event: name,
      nftId: "7",
      amount0,
      amount1,
    });
    const paid = new Map([
      [hashOf(1), new Map([[coinB, 250n]])],
      [hashOf(2), new Map([[coinA, 100n]])],
    ]);
    const { splits, problems } = splitCollects({
      order: [hashOf(1), hashOf(2)],
      records: new Map([
        [
          hashOf(1),
          {
            liquidity: [
              liquidity("DecreaseLiquidity", "100", "200"),
              liquidity("Collect", "0", "250"),
            ],
          },
        ],
        [hashOf(2), { liquidity: [liquidity("Collect", "100", "0")] }],
      ]),
      receivedIn: (hash) => paid.get(hash),
    });
    assert.deepEqual(problems, [
      {
        hash: hashOf(1),
        problem:
          "it paid out nothing of the coin on side 0 of position #7, though its DecreaseLiquidity events name principal of it",
      },
    ]);
    assert.deepEqual(
      splits.map((one) => [one.hash, one.token, one.principal, one.fee]),
      [
        [hashOf(1), coinB, 200n, 50n],
        [hashOf(2), coinA, 100n, 0n],
      ],
    );
  });

  it("keeps the principal a collect paid out less of waiting, as the rest still owed", () => {
    const coinA = `0x${"11".repeat(20)}`;
    const liquidity = (name, amount0) => ({
      event: name,
      nftId: "7",
      amount0,
      amount1: "0",
    });
    const paid = new Map([
      [hashOf(1), new Map([[coinA, 60n]])],
      [hashOf(2), new Map([[coinA, 45n]])],
    ]);
    const { splits, problems } = splitCollects({
      order: [hashOf(1), hashOf(2)],
      records: new Map([
        [
          hashOf(1),
          {
            liquidity: [
              liquidity("DecreaseLiquidity", "100"),
              liquidity("Collect", "60"),
            ],
          },
        ],
        [hashOf(2), { liquidity: [liquidity("Collect", "45")] }],
      ]),
      receivedIn: (hash) => paid.get(hash),
    });
    assert.deepEqual(
      problems.map((one) => one.hash),
      [hashOf(1)],
    );
    assert.deepEqual(
      splits.map((one) => [one.hash, one.principal, one.fee]),
      [[hashOf(2), 40n, 5n]],
    );
  });

  it("takes each NFT's decreases until its next collect, and places the coins by contract", () => {
    const { splits, problems } = splitCollects({
      order: [hashOf(0), hashOf(1), hashOf(2)],
      records: RECORDS,
      receivedIn: (hash) =>
        hash === hashOf(0)
          ? new Map([
              [TKN, 5n * ONE],
              [HEX, 3n * ONE],
            ])
          : new Map([[HEX, (3n * ONE) / 2n]]),
    });

    assert.deepEqual(problems, []);
    assert.deepEqual(splits, [
      {
        hash: hashOf(0),
        nftId: "7",
        token: HEX,
        received: 3n * ONE,
        principal: 2n * ONE,
        fee: ONE,
      },
      {
        hash: hashOf(0),
        nftId: "7",
        token: TKN,
        received: 5n * ONE,
        principal: 4n * ONE,
        fee: ONE,
      },
      {
        hash: hashOf(2),
        nftId: "9",
        token: HEX,
        received: (3n * ONE) / 2n,
        principal: ONE,
        fee: ONE / 2n,
      },
    ]);
  });

  it("reports collects it cannot split, rather than guess", () => {
    const records = new Map([
      [
        hashOf(3),
        {
          liquidity: [event("Collect", 1, 1n, 1n), event("Collect", 2, 1n, 1n)],
        },
      ],
      [hashOf(4), { liquidity: [event("Collect", 3, 1n, 1n)] }],
      [
        hashOf(5),
        {
          liquidity: [
            event("DecreaseLiquidity", 4, 5n, 0n),
            event("Collect", 4, 5n, 0n),
          ],
        },
      ],
      [hashOf(6), { liquidity: [event("Collect", 5, 0n, 0n)] }],
    ]);
    const coins = new Map([
      [hashOf(4), received([[HEX, 1n]])],
      [hashOf(5), received([[HEX, 4n]])],
      [hashOf(6), received([])],
    ]);

    const { splits, problems } = splitCollects({
      order: [hashOf(3), hashOf(4), hashOf(5), hashOf(6)],
      records,
      receivedIn: (hash) => coins.get(hash)(),
    });

    assert.deepEqual(splits, []);
    assert.deepEqual(
      problems.map((one) => one.hash),
      [hashOf(3), hashOf(4), hashOf(5)],
    );
    assert.match(problems[0].problem, /collects from more than one position/);
    assert.match(
      problems[1].problem,
      /cannot be placed on the position's two sides/,
    );
    assert.equal(
      problems[2].problem,
      `it paid out less ${HEX} than the principal its DecreaseLiquidity events name`,
    );
  });

  it("splits a later collect of a position that a transaction collected from with another, once that collect paid out all it was owed when the range began", () => {
    const records = new Map([
      [
        hashOf(3),
        {
          liquidity: [
            event("Collect", 9, ONE, 0n),
            event("Collect", 11, 1n, 1n),
          ],
        },
      ],
      [
        hashOf(4),
        {
          liquidity: [
            event("DecreaseLiquidity", 9, 100n, 0n),
            event("Collect", 9, 103n, 0n),
          ],
        },
      ],
    ]);
    const { splits, problems } = splitCollects({
      order: [hashOf(3), hashOf(4)],
      records,
      receivedIn: (hash) =>
        hash === hashOf(4) ? new Map([[TKN, 103n]]) : new Map(),
      owedAtStart: new Map([["9", [ONE, 0n]]]),
    });
    assert.deepEqual(
      problems.map((one) => one.hash),
      [hashOf(3)],
    );
    assert.deepEqual(splits, [
      {
        hash: hashOf(4),
        nftId: "9",
        token: TKN,
        received: 103n,
        principal: 100n,
        fee: 3n,
      },
    ]);
  });

  it("orders a pool's two coins by their addresses as numbers, whatever their case", () => {
    /*- OTHER, 0xbBbB…, is the lower number, while POOL, 0xCcCC…, comes
     * first as text, since capitals sort before small letters. */
    const records = new Map([
      [
        hashOf(7),
        {
          liquidity: [
            event("DecreaseLiquidity", 2, 1n, 3n),
            event("Collect", 2, 2n, 4n),
          ],
        },
      ],
    ]);

    const { splits } = splitCollects({
      order: [hashOf(7)],
      records,
      receivedIn: received([
        [POOL, 4n],
        [OTHER, 2n],
      ]),
    });

    assert.deepEqual(
      splits.map((one) => [one.token, one.principal, one.fee]),
      [
        [OTHER, 1n, 1n],
        [POOL, 3n, 1n],
      ],
    );
  });

  it("stops on a record that is missing, or of another shape, naming the transaction", () => {
    const run = (records) =>
      splitCollects({
        order: [hashOf(8)],
        records,
        receivedIn: received([]),
      });

    assert.throws(() => run(new Map()), {
      message: `LP Ranger's record of ${hashOf(8)} holds no list of liquidity events`,
    });
    assert.throws(
      () =>
        run(
          new Map([
            [
              hashOf(8),
              {
                liquidity: [
                  { event: "Collect", nftId: 7, amount0: "1", amount1: "1" },
                ],
              },
            ],
          ]),
        ),
      {
        message: `LP Ranger's record of ${hashOf(8)} gives an event's nftId as 7, not a string of digits`,
      },
    );
  });
});
