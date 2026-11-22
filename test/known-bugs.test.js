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
import { toBeHex, zeroPadValue } from "ethers";
import { knownBug } from "./helpers/known-bug.js";
import { printRatios } from "../chart-price-ratio/ratio-output.js";
import { tokenLegs } from "../summ-sweep/legs.js";
import { TRANSFER_TOPIC } from "../wallet-history/transfers.js";
import {
  ONE,
  POOL,
  TKN,
  WALLET,
  WPLS,
  hashOf,
} from "./helpers/summ-sweep-case.js";

/**
 * The lines the ratio chart prints for a daily series.
 *
 * @param {number[]} ratios - The ratios, oldest first
 * @returns {string[]} The lines
 */
function chartLines(ratios) {
  const timestamps = ratios.map((_, at) => Date.UTC(2026, 0, 1 + at));
  const lines = [];
  const log = console.log;
  console.log = (line = "") => lines.push(...String(line).split("\n"));
  try {
    printRatios(
      { interval: "daily", tokenA: "0xA", tokenB: "0xB", saveCsv: false },
      ["A", "B"],
      "GeckoTerminal",
      {
        rows: ratios.map((ratio) => ({ date: "", ratio: String(ratio) })),
        ratios,
        timestamps,
      },
    );
  } finally {
    console.log = log;
  }
  return lines;
}

describe("the ratio chart", () => {
  knownBug(
    "labels a series whose ratios are all the same with that ratio, not with asciichart's number for its one row",
    () => {
      const axis = chartLines([0.5, 0.5, 0.5, 0.5]).filter((line) =>
        /[┤┼]/.test(line),
      );
      assert.equal(axis.length, 1);
      const label = axis[0].slice(0, axis[0].search(/[┤┼]/)).trim();
      assert.equal(Number(label), 0.5);
    },
  );
});

describe("summ-sweep/legs.js's tokenLegs", () => {
  knownBug(
    "reads no leg from a four-topic Transfer whose contract gives decimals, as an ERC-20's does and no ERC-721 contract's does",
    () => {
      const log = {
        address: TKN,
        topics: [
          TRANSFER_TOPIC,
          zeroPadValue(POOL, 32),
          zeroPadValue(WALLET, 32),
          toBeHex(5n * ONE, 32),
        ],
        data: "0x",
        transactionHash: hashOf(1),
        blockNumber: 10,
        index: 0,
      };
      const legs = tokenLegs({
        wallet: WALLET,
        wrappedCoin: WPLS,
        tokens: new Map([[TKN, { symbol: "TKN", decimals: 8 }]]),
        times: new Map([[10, 1_700_000_000]]),
        logs: [log],
      });
      assert.deepEqual(legs, []);
    },
  );
});
