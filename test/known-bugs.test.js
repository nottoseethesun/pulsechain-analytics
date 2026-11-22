/**
 * Tests of the bugs known in the repo's code, each declared with
 * `knownBug` (`helpers/known-bug.js`), so it passes while the bug is there.
 * @module test/known-bugs.test
 *
 * A fix makes its test fail; the same change declares the test with `it`,
 * among the tests of the code it is about, and removes it from here.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe } from "node:test";
import assert from "node:assert/strict";
import { knownBug } from "./helpers/known-bug.js";
import { splitCollects } from "../summ-sweep/positions.js";

/** The repo's top folder. */
const REPO_TOP = fileURLToPath(new URL("..", import.meta.url));

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
    "keeps what a transaction's first Collect of a position paid of what it was owed when the range began, when the same transaction collects from it again",
    () => {
      const { splits, problems } = splitFirstCoin(
        [
          {
            events: [
              ["Collect", "100"],
              ["Collect", "0"],
            ],
            received: 100n,
          },
          { events: [["Collect", "5"]], received: 5n },
        ],
        new Map([["7", [100n, 0n]]]),
      );
      assert.deepEqual(
        problems.map((one) => one.hash),
        ["0x01"],
      );
      assert.deepEqual(
        splits.map((one) => [one.hash, one.principal, one.fee]),
        [["0x02", 0n, 5n]],
      );
    },
  );
});

describe("the tests run by name", () => {
  knownBug(
    "pass in the ratio chart's test files when a name pattern selects none of their tests",
    () => {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([name]) => !["NODE_TEST_CONTEXT", "NODE_V8_COVERAGE"].includes(name),
        ),
      );
      const run = spawnSync(
        process.execPath,
        [
          "--test",
          "--test-name-pattern=a name no test has",
          "test/pulse-token-ratio.test.js",
          "test/pulse-token-ratio-moralis.test.js",
        ],
        { cwd: REPO_TOP, encoding: "utf8", env },
      );
      assert.equal(run.status, 0, run.stdout);
    },
  );
});
