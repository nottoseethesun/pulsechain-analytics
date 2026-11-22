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
import { getAddress, zeroPadValue } from "ethers";
import { knownBug } from "./helpers/known-bug.js";
import { owedWhenRangeBegan } from "../summ-sweep/owed.js";
import { tokenLegs } from "../summ-sweep/legs.js";
import { tokenFacts } from "../wallet-history/receipts.js";
import { pacedProvider } from "../wallet-history/paced-provider.js";
import { TRANSFER_TOPIC } from "../wallet-history/transfers.js";
import { printRatios } from "../chart-price-ratio/ratio-output.js";
import { PM, TKN, WALLET, WPLS, hashOf } from "./helpers/summ-sweep-case.js";
import { gapLeg, runGaps, sentBy } from "./helpers/summ-gaps.js";

/**
 * A provider whose every call the endpoint answers with an error of its
 * own, as ethers throws it: a CALL_EXCEPTION with no revert data.
 *
 * @returns {{call: function}} The provider
 */
function failingCalls() {
  return {
    async call() {
      throw Object.assign(new Error("missing revert data"), {
        code: "CALL_EXCEPTION",
        data: null,
        info: { error: { code: -32005, message: "limit exceeded" } },
      });
    },
  };
}

describe("a contract call the endpoint fails", () => {
  knownBug(
    "owedWhenRangeBegan stops on the endpoint's error, which is not the position manager's answer",
    async () => {
      await assert.rejects(
        owedWhenRangeBegan(pacedProvider(failingCalls(), { spacingMs: 0 }), {
          positionManager: PM,
          nftIds: ["9"],
          fromBlock: 5,
        }),
        /limit exceeded/,
      );
    },
  );

  knownBug(
    "tokenFacts stops on the endpoint's error, which is not the token's answer",
    async () => {
      await assert.rejects(
        tokenFacts(pacedProvider(failingCalls(), { spacingMs: 0 }), [TKN]),
        /limit exceeded/,
      );
    },
  );
});

describe("a position's NFT sent to one of the owner's wallets", () => {
  knownBug("is booked as a Send, by the own-wallets rule", () => {
    const mine = getAddress(`0x${"ab".repeat(20)}`);
    const { rows, questions } = runGaps({
      legs: [
        gapLeg({
          direction: "out",
          token: PM,
          decimals: 0,
          amount: 1n,
          nftId: 7n,
          counterparty: mine,
        }),
      ],
      txs: [sentBy(0, { to: PM })],
      owner: { ownWallets: { [mine]: "Cold storage" } },
    });
    assert.deepEqual(questions, []);
    assert.deepEqual(
      rows.map((row) => row.type),
      ["send"],
    );
  });
});

describe("the ratio chart's y-axis", () => {
  knownBug("stands in one column on every row of the chart", () => {
    const ratios = Array.from({ length: 40 }, (_, at) => 0.5 + (1.2 * at) / 39);
    const timestamps = ratios.map((_, at) => Date.UTC(2026, 0, 1 + at));
    const lines = [];
    const log = console.log;
    console.log = (line = "") => lines.push(String(line));
    try {
      printRatios(
        { interval: "daily", tokenA: TKN, tokenB: WPLS, saveCsv: false },
        ["TKN", "WPLS"],
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
    const columns = lines
      .flatMap((line) => line.split("\n"))
      .map((line) => line.search(/[┤┼]/))
      .filter((at) => at >= 0);
    assert.ok(columns.length > 10);
    assert.deepEqual(
      new Set(columns).size,
      1,
      `axis columns ${[...new Set(columns)]}`,
    );
  });
});

describe("a Transfer log of another shape", () => {
  knownBug(
    "gives no leg, rather than stop, for a Transfer log of a shape no ERC-20 or NFT Transfer has",
    () => {
      const log = {
        address: TKN,
        topics: [TRANSFER_TOPIC, zeroPadValue(WALLET, 32)],
        data: "0x",
        transactionHash: hashOf(0),
        blockNumber: 1,
        index: 0,
      };
      assert.doesNotThrow(() =>
        tokenLegs({
          wallet: WALLET,
          logs: [log],
          tokens: new Map(),
          times: new Map([[1, 1_700_000_000]]),
          wrappedCoin: WPLS,
        }),
      );
    },
  );
});
