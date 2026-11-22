/**
 * Tests of the bugs known in the repo's code, each declared with
 * `knownBug` (`helpers/known-bug.js`), so it passes while the bug is there.
 * @module test/known-bugs.test
 *
 * A fix makes its test fail; the same change declares the test with `it`,
 * among the tests of the code it is about, and removes it from here.
 */

import { after, describe } from "node:test";
import assert from "node:assert/strict";
import { getAddress } from "ethers";
import { knownBug } from "./helpers/known-bug.js";
import { getTokenTransferred } from "../fetch-amount-of-token-transferred.js";
import { ratioRows } from "../chart-price-ratio/ratio-series.js";
import { printRatios } from "../chart-price-ratio/ratio-output.js";
import { csvSymbolOf, ownerLists } from "../summ-sweep/owner-lists.js";
import { splitCollects } from "../summ-sweep/positions.js";
import { sortSplits } from "../summ-sweep/splits.js";
import {
  standInChain,
  TOKEN,
  TRANSACTION,
  WALLET as TRANSFER_WALLET,
} from "./helpers/stand-in-chain.js";
import {
  useEthersOwnHttp,
  useStandInChain,
} from "./helpers/ethers-stand-in.js";
import { OTHER, gapLeg, runGaps } from "./helpers/summ-gaps.js";
import { HEX, WALLET, hashOf } from "./helpers/summ-sweep-case.js";

after(useEthersOwnHttp);

describe("the Summ sweep's symbols", () => {
  knownBug(
    "asks the owner about a token whose contract's symbol is blank or the chain's own coin's, as about one with no symbol, rather than book a row the Summ csv utility refuses",
    () => {
      const spam = getAddress(`0x${"5a".repeat(20)}`);
      for (const symbol of ["", "  ", "PLS"]) {
        const leg = gapLeg({ n: 1, token: spam, symbol, counterparty: OTHER });
        const found = runGaps({ legs: [leg], owner: { spamTokens: [spam] } });
        assert.equal(found.rows.length, 0, JSON.stringify(symbol));
        assert.equal(found.questions.length, 1, JSON.stringify(symbol));
      }
    },
  );

  knownBug(
    "leaves the fee of a position's coin with no symbol for the csv to be asked about, rather than book a fee row with none",
    () => {
      const leg = {
        hash: hashOf(9),
        direction: "in",
        token: HEX,
        symbol: "PLS",
        amount: 3n,
        decimals: 8,
      };
      const lists = ownerLists({});
      const sorted = sortSplits({
        splits: [
          {
            hash: hashOf(9),
            nftId: "11",
            token: HEX,
            received: 3n,
            principal: 2n,
            fee: 1n,
          },
        ],
        legs: [leg],
        matches: new Map([[leg, { id: "summ-leg" }]]),
        wallet: WALLET,
        csvSymbolOf: (token, symbol) => csvSymbolOf(lists, token, symbol),
      });
      assert.deepEqual(sorted.rows, []);
      assert.deepEqual(
        sorted.parts.map((part) => [part.part, part.amount]),
        [["fee", 1n]],
      );
    },
  );
});

describe("a 9mm V3 position's collects", () => {
  knownBug(
    "reports a collect that paid nothing of a coin with principal waiting, and keeps that principal for the next collect",
    () => {
      const coinA = `0x${"11".repeat(20)}`;
      const coinB = `0x${"22".repeat(20)}`;
      const event = (name, amount0, amount1) => ({
        event: name,
        nftId: "7",
        amount0,
        amount1,
      });
      const received = new Map([
        ["0x01", new Map([[coinB, 250n]])],
        ["0x02", new Map([[coinA, 100n]])],
      ]);
      const { splits, problems } = splitCollects({
        order: ["0x01", "0x02"],
        records: new Map([
          [
            "0x01",
            {
              liquidity: [
                event("DecreaseLiquidity", "100", "200"),
                event("Collect", "0", "250"),
              ],
            },
          ],
          ["0x02", { liquidity: [event("Collect", "100", "0")] }],
        ]),
        receivedIn: (hash) => received.get(hash),
      });
      assert.deepEqual(
        problems.map((one) => one.hash),
        ["0x01"],
      );
      assert.deepEqual(
        splits.map((one) => [one.hash, one.token, one.principal, one.fee]),
        [
          ["0x01", coinB, 200n, 50n],
          ["0x02", coinA, 100n, 0n],
        ],
      );
    },
  );
});

describe("the ratio chart", () => {
  knownBug(
    "writes a price or a ratio below a millionth with its digits, rather than as 0",
    () => {
      const day = 86400000;
      const start = Date.UTC(2026, 10, 1);
      const dataA = [3e-13, 1.23456789e-10].map((close, index) => ({
        timestamp: start + index * day,
        close,
      }));
      const dataB = dataA.map(({ timestamp }) => ({ timestamp, close: 1 }));
      const series = ratioRows(dataA, dataB, "daily");
      assert.equal(Number(series.rows[0].priceA), 3e-13);
      assert.equal(Number(series.rows[1].ratio), 1.23456789e-10);
      const lines = [];
      printRatios(
        {
          tokenA: "0xa",
          tokenB: "0xb",
          interval: "daily",
          useDexToolsOnly: false,
          saveCsv: false,
        },
        ["A", "B"],
        "Stand-in",
        series,
        (line) => lines.push(line),
      );
      const current = lines.find((line) => line.includes("Current ratio:"));
      assert.equal(Number(current.split(": ")[1]), 1.23456789e-10);
    },
  );
});

describe("getTokenTransferred, the Node script", () => {
  knownBug(
    "takes an address written with 0X, as the Sheets copy does",
    async () => {
      useStandInChain(standInChain(250n));
      let amount;
      await assert.doesNotReject(async () => {
        amount = await getTokenTransferred(
          TRANSACTION,
          `0X${TOKEN.slice(2)}`,
          TRANSFER_WALLET,
        );
      });
      assert.equal(amount, 250);
    },
  );
});
