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
import fs from "node:fs";
import path from "node:path";
import { AbiCoder, getAddress } from "ethers";
import { knownBug } from "./helpers/known-bug.js";
import { getTokenTransferred } from "../fetch-amount-of-token-transferred.js";
import { printRatios } from "../chart-price-ratio/ratio-output.js";
import { decimalText } from "../summ-sweep/amounts.js";
import { parseSummResults } from "../summ-sweep/summ-results.js";
import { walletCoinInflows } from "../wallet-history/coin-inflows.js";
import { pacedProvider } from "../wallet-history/paced-provider.js";
import { tokenFacts } from "../wallet-history/receipts.js";
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
import {
  loadSheetsScript,
  TRANSFER_SHEETS_SCRIPT,
} from "./helpers/sheets-script.js";
import { summPage } from "./helpers/summ-pages.js";
import { argsFor, repo, runOn } from "./helpers/summ-sweep-command-run.js";
import { removeTempFolders, summRows } from "./helpers/summ-sweep-case.js";

after(removeTempFolders);
after(useEthersOwnHttp);

describe("summ-sweep/amounts.js and wallet-history/receipts.js", () => {
  knownBug(
    "writes an amount of a token whose decimals are above 80, up to 255, as a uint8 holds them",
    () => {
      let text;
      assert.doesNotThrow(() => {
        text = decimalText(5n, 255);
      });
      assert.equal(text, `0.${"0".repeat(254)}5`);
    },
  );

  knownBug(
    "takes a decimals answer above 255, which no uint8 holds, for no decimals",
    async () => {
      const token = getAddress(`0x${"ab".repeat(20)}`);
      const contract = {
        call: async ({ data }) =>
          data === "0x95d89b41"
            ? AbiCoder.defaultAbiCoder().encode(["string"], ["ODD"])
            : `0x${"f".repeat(64)}`,
      };
      const facts = await tokenFacts(
        pacedProvider(contract, { spacingMs: 0 }),
        [token],
      );
      assert.equal(facts.get(token).decimals, null);
    },
  );
});

describe("summ-sweep/summ-results.js's parseSummResults", () => {
  knownBug(
    "refuses saved pages whose counts of pages or totals disagree, or whose rows fall short of the total",
    () => {
      const [first, second] = summRows();
      assert.throws(
        () =>
          parseSummResults([
            summPage({ page: 1, pages: 2, rows: [first], total: 3 }),
            summPage({ page: 2, pages: 2, rows: [second], total: 2 }),
          ]),
        /says Summ holds 2 in total, but page 1 says 3/,
      );
      assert.throws(
        () =>
          parseSummResults([
            summPage({ page: 1, pages: 1, rows: [first], total: 2 }),
            summPage({ page: 2, pages: 2, rows: [second], total: 2 }),
          ]),
        /says Summ's results run to 2 pages, but page 1 says 1/,
      );
      assert.throws(
        () =>
          parseSummResults([
            summPage({ page: 1, pages: 2, rows: [first], total: 3 }),
            summPage({ page: 2, pages: 2, rows: [second], total: 3 }),
          ]),
        /The pages hold 2 rows, but say Summ holds 3 in total/,
      );
    },
  );
});

describe("the two copies of getTokenTransferred", () => {
  knownBug(
    "refuse an address that is not 0x and 40 hex digits, naming it, rather than give 0 or ethers' own error",
    async () => {
      const short = TRANSFER_WALLET.slice(0, -1);
      const script = loadSheetsScript(
        TRANSFER_SHEETS_SCRIPT,
        standInChain(250n),
      );
      assert.throws(
        () => script.getTokenTransferred(TRANSACTION, TOKEN, short),
        /The wallet 0x[0-9a-fA-F]{39} is not an address: 0x and 40 hex digits/,
      );
      useStandInChain(standInChain(250n));
      await assert.rejects(
        getTokenTransferred(TRANSACTION, TOKEN, short),
        /The wallet 0x[0-9a-fA-F]{39} is not an address: 0x and 40 hex digits/,
      );
    },
  );
});

describe("summ-sweep/command-line.js", () => {
  knownBug(
    "removes the last run's csv, saying so, when a run with --replace has no rows to write",
    async () => {
      const top = repo();
      const csv = path.join(top, "rows.csv");
      fs.writeFileSync(csv, "the last run's rows\n");
      const run = await runOn(top, [
        ...argsFor(top, {
          "--start-date": "2023-11-13",
          "--end-date": "2023-11-13",
        }),
        "--replace",
      ]);
      assert.equal(run.code, 0);
      assert.equal(fs.existsSync(csv), false);
      assert.match(run.out, /removed the last run's csv/);
    },
  );

  knownBug(
    "refuses a requestSpacingMs Node's timers cannot keep, more than 2147483647 milliseconds",
    async () => {
      const top = repo();
      const file = path.join(top, "config.json");
      const settings = JSON.parse(fs.readFileSync(file, "utf8"));
      settings.pulsechain.requestSpacingMs = 3000000000;
      fs.writeFileSync(file, JSON.stringify(settings));
      const run = await runOn(top, argsFor(top));
      assert.equal(run.code, 1);
      assert.match(
        run.err,
        /pulsechain\.requestSpacingMs must be a whole number of milliseconds from 0 to 2147483647/,
      );
    },
  );
});

describe("the ratio chart's y-axis", () => {
  knownBug(
    "labels each row with a value of its own when the range is under 0.00001, near 1 as near 0",
    () => {
      const ratios = Array.from(
        { length: 40 },
        (_, at) => 1 + (0.000005 * at) / 39,
      );
      const lines = [];
      /*- TEST-ONLY global swap: printRatios prints with console.log and has
       *  no seam yet; the fix adds one, and this test then moves to it.
       *  Restored pristine in the `finally` below, immediately after the
       *  call that needed it. */
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
            timestamps: ratios.map((_, at) => Date.UTC(2026, 0, 1 + at)),
          },
        );
      } finally {
        console.log = log;
      }
      const labels = lines
        .filter((line) => /[┤┼]/.test(line))
        .map((line) => line.slice(0, line.search(/[┤┼]/)).trim());
      assert.equal(labels.length, 31);
      assert.equal(new Set(labels).size, 31);
    },
  );
});

describe("wallet-history/coin-inflows.js", () => {
  knownBug(
    "names the transaction and block the endpoint could not trace, rather than stop on a TypeError",
    async () => {
      const wallet = getAddress(`0x${"11".repeat(20)}`);
      const hash = `0x${"ab".repeat(32)}`;
      const endpoint = {
        getBalance: async (_address, block) => (block === 9 ? 0n : 5n),
        send: async (method) =>
          method === "eth_getBlockByNumber"
            ? {
                number: "0xa",
                timestamp: "0x64",
                miner: `0x${"22".repeat(20)}`,
                baseFeePerGas: "0x1",
                withdrawals: [],
              }
            : [{ txHash: hash, error: "execution timeout" }],
      };
      await assert.rejects(
        walletCoinInflows(pacedProvider(endpoint, { spacingMs: 0 }), {
          wallet,
          fromBlock: 10,
          toBlock: 10,
          own: [],
        }),
        new RegExp(
          `The endpoint could not trace transaction ${hash} in block 10: execution timeout`,
        ),
      );
    },
  );
});
