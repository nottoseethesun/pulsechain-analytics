/**
 * Tests of the bugs known in the repo's code, each declared with
 * `knownBug` (`helpers/known-bug.js`), so it passes while the bug is there.
 * @module test/known-bugs.test
 *
 * A fix makes its test fail; the same change declares the test with `it`,
 * among the tests of the code it is about, and removes it from here.
 */

import { describe } from "node:test";
import assert from "node:assert/strict";
import { knownBug } from "./helpers/known-bug.js";
import { splitCollects } from "../summ-sweep/positions.js";

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

describe("a 9mm V3 position's collects", () => {
  knownBug(
    "carries to the next collect only the principal the Collect event left owed, whatever the wallet received",
    () => {
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
    },
  );

  knownBug(
    "reports each collect of a position owed coins when the range began while coins owed from before the range may remain",
    () => {
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
    },
  );
});
