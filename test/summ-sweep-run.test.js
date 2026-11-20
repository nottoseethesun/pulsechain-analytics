/**
 * Tests for the whole sweep of `summ-sweep/` (`sweep.js`) and its command
 * line (`command-line.js`). `summ-sweep.test.js` tests the reading and
 * the match, and `summ-sweep-splits.test.js` the withdrawals and LP
 * Ranger's tool.
 * @module test/summ-sweep-run.test
 *
 * The history swept is that of `helpers/summ-sweep-case.js`, on its
 * stand-in chain, with Summ's pages written by `helpers/summ-pages.js`
 * and LP Ranger's tool a stand-in that answers with the case's records.
 * The command line runs on a repo top in a temp folder of its own.
 */

import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { sweepWallet } from "../summ-sweep/sweep.js";
import { dayStart, runSummSweep } from "../summ-sweep/command-line.js";
import { pacedProvider } from "../wallet-history/paced-provider.js";
import { standInWalletChain } from "./helpers/stand-in-wallet-chain.js";
import { summPage } from "./helpers/summ-pages.js";
import {
  HEX,
  ONE,
  PM,
  POOL,
  RECORDS,
  TEMPLATE_HEADER,
  TKN,
  WALLET,
  WPLS,
  event,
  hashOf,
  paid,
  removeTempFolders,
  summRows,
  sweepChain,
  tempFolder,
  tokenAnswers,
  transaction,
} from "./helpers/summ-sweep-case.js";

after(removeTempFolders);

/** The chain settings of the sweep's tests. */
const CHAIN = {
  wrappedCoin: WPLS,
  positionManager: PM,
  spanBlocks: 9000,
  batchSize: 50,
};

describe("sweepWallet", () => {
  it("fixes a split Summ holds whole, matches one it holds in parts, and books the gaps", async () => {
    const paced = pacedProvider(sweepChain(), { spacingMs: 0 });

    const result = await sweepWallet(paced, {
      wallet: WALLET,
      fromBlock: 1,
      toBlock: 100,
      chain: CHAIN,
      owner: { summSymbols: {}, csvSymbols: { [HEX]: "pHEX" } },
      summRows: summRows().map((row) => ({
        ...row,
        timestamp: Date.parse(row.date) / 1000,
      })),
      readRecords: async (hashes) =>
        new Map(hashes.map((hash) => [hash, RECORDS.get(hash)])),
    });

    assert.deepEqual(result.problems, []);
    assert.deepEqual(
      result.fixes.map(({ summLeg, ...fix }) => ({
        ...fix,
        summ: summLeg.amount,
      })),
      [
        {
          hash: hashOf(0),
          nftId: "7",
          token: HEX,
          received: 3n * ONE,
          principal: 2n * ONE,
          fee: ONE,
          decimals: 8,
          summ: "3",
        },
      ],
    );
    assert.deepEqual(
      result.rows.map((row) => [
        row.type,
        row.baseCurrency,
        row.baseAmount.raw,
        row.from,
        row.id,
      ]),
      [
        ["income", "pHEX", ONE, POOL, hashOf(0)],
        ["remove-liquidity", "TKN", 4n * ONE, POOL, hashOf(0)],
        ["income", "TKN", ONE, POOL, hashOf(0)],
        ["fee", "PLS", 300n, WALLET, hashOf(1)],
      ],
    );
    assert.deepEqual(
      result.unmatched.map((leg) => [
        leg.hash,
        leg.token,
        leg.amount,
        leg.part,
      ]),
      [
        [hashOf(9), TKN, 2n * ONE, undefined],
        [hashOf(0), TKN, 4n * ONE, "principal"],
        [hashOf(0), TKN, ONE, "fee"],
      ],
    );
    assert.deepEqual(
      result.questions.map((one) => [one.hash, one.reason]),
      [[hashOf(9), "received from an address on none of the owner's lists"]],
    );
    assert.deepEqual(result.summUnmatched, []);
  });

  it("places a withdrawal's PLS on its side, and reports it, since it matches token legs only", async () => {
    /*- Position #11 holds HEX and WPLS. Its drain pays 2 HEX as a token,
     * and 3 PLS that the position manager unwraps from WPLS and pays
     * inside the transaction. */
    const plsWei = 10n ** 18n;
    const chain = standInWalletChain({
      latest: 100,
      contracts: { [HEX]: tokenAnswers("HEX") },
      blocks: {
        10: {
          transactions: [
            transaction(0, {
              logs: [paid(HEX, POOL, 2n * ONE)],
              pays: [{ from: PM, to: WALLET, amount: 3n * plsWei }],
            }),
          ],
        },
      },
    });
    const records = new Map([
      [
        hashOf(0),
        {
          kind: "drain",
          liquidity: [
            event("DecreaseLiquidity", 11, ONE, 2n * plsWei),
            event("Collect", 11, 2n * ONE, 3n * plsWei),
          ],
        },
      ],
    ]);

    const result = await sweepWallet(pacedProvider(chain, { spacingMs: 0 }), {
      wallet: WALLET,
      fromBlock: 1,
      toBlock: 100,
      chain: CHAIN,
      owner: { summSymbols: {}, csvSymbols: {} },
      summRows: [],
      readRecords: async () => records,
    });

    assert.deepEqual(
      result.unmatched.map((leg) => [leg.token, leg.amount, leg.part]),
      [
        [HEX, ONE, "principal"],
        [HEX, ONE, "fee"],
      ],
    );
    assert.deepEqual(
      result.rows.map((row) => [row.type, row.baseAmount.raw, row.feeAmount]),
      [
        ["remove-liquidity", ONE, { raw: 300n, decimals: 18 }],
        ["income", ONE, undefined],
      ],
    );
    assert.deepEqual(result.problems, [
      {
        hash: hashOf(0),
        problem:
          "position #11 paid 3 PLS through the position manager, 1 of it fees, and the sweep matches token legs only, so its principal and fees are not checked against Summ",
      },
    ]);
  });

  it("stops on a change of balance no payment explains", async () => {
    const chain = standInWalletChain({
      latest: 100,
      blocks: {},
      unaccounted: [{ address: WALLET, block: 50, amount: 7n }],
    });

    await assert.rejects(
      sweepWallet(pacedProvider(chain, { spacingMs: 0 }), {
        wallet: WALLET,
        fromBlock: 1,
        toBlock: 100,
        chain: CHAIN,
        owner: { summSymbols: {}, csvSymbols: {} },
        summRows: [],
        readRecords: async () => new Map(),
      }),
      /changed in a way no payment explains, in blocks 50/,
    );
  });
});

describe("runSummSweep", () => {
  /**
   * A repo top in a temp folder, with the chain settings, a template,
   * Summ's page and, unless left out, the owner's settings.
   *
   * @param {boolean} [owner] - Whether to write the owner's settings
   * @returns {string} The repo top
   */
  function repo(owner = true) {
    const top = tempFolder("summ-sweep-cli-");
    fs.mkdirSync(path.join(top, "summ-sweep"));
    fs.writeFileSync(
      path.join(top, "config.json"),
      JSON.stringify({
        pulsechain: {
          ...CHAIN,
          chainId: 369,
          rpcEndpoint: "https://rpc.example",
          requestSpacingMs: 0,
        },
      }),
    );
    fs.writeFileSync(path.join(top, "template.csv"), `${TEMPLATE_HEADER}\n`);
    if (owner)
      fs.writeFileSync(
        path.join(top, "summ-sweep", "config.json"),
        JSON.stringify({
          templatePath: path.join(top, "template.csv"),
          lpRangerDir: "/lp",
          summSymbols: {},
          csvSymbols: {},
        }),
      );
    fs.writeFileSync(
      path.join(top, "page-1.txt"),
      summPage({ page: 1, pages: 1, rows: summRows() }),
    );
    return top;
  }

  /**
   * Runs the command line on a repo top, with the stand-ins.
   *
   * @param {string} top - The repo top
   * @param {string[]} args - The command line's arguments
   * @returns {Promise<{code: number, out: string, err: string}>} What it
   *   returned and printed
   */
  async function runOn(top, args) {
    const output = { out: "", err: "" };
    const code = await runSummSweep(["node", "summ-sweep.js", ...args], {
      repoTop: top,
      stdout: { write: (text) => (output.out += text) },
      stderr: { write: (text) => (output.err += text) },
      makeProvider: () => sweepChain(),
      run: async (_file, args) => JSON.stringify(RECORDS.get(args[1])),
    });
    return { code, ...output };
  }

  const argsFor = (top, day = "2023-11-14") => [
    "--wallet",
    WALLET,
    "--start-date",
    day,
    "--end-date",
    day,
    "--summ-results",
    path.join(top, "page-1.txt"),
    "--out",
    path.join(top, "rows.csv"),
    "--report",
    path.join(top, "report.json"),
  ];

  it("writes the csv through the Summ csv utility, and the report as json", async () => {
    const top = repo();

    const run = await runOn(top, argsFor(top));

    assert.equal(run.err, "");
    assert.equal(run.code, 0);
    assert.match(
      run.out,
      /3 legs and parts Summ lacks, 1 splits to fix in Summ, 1 questions, 0 problems\.\nWrote 4 rows to /,
    );
    const csv = fs.readFileSync(path.join(top, "rows.csv"), "utf8").split("\n");
    assert.match(csv[1], /^2023-11-14 22:15:00,income,HEX,1,/);
    const report = JSON.parse(
      fs.readFileSync(path.join(top, "report.json"), "utf8"),
    );
    assert.equal(report.fixes[0].principal, "200000000");
    assert.equal(report.fixes[0].summ.amount, "3");
    assert.deepEqual(
      report.unmatched.map((leg) => leg.part ?? "whole"),
      ["whole", "principal", "fee"],
    );
    assert.equal(report.questions[0].legs[0].amount, "200000000");
    assert.equal((await runOn(top, argsFor(top))).code, 1);
  });

  it("says when there is nothing to write as rows", async () => {
    const top = repo();

    const run = await runOn(top, argsFor(top, "2023-11-13"));

    assert.equal(run.code, 0);
    assert.match(run.out, /No rows to write, so no csv was written\./);
    assert.equal(fs.existsSync(path.join(top, "rows.csv")), false);
  });

  it("asks for the owner's settings when they are missing", async () => {
    const top = repo(false);

    const run = await runOn(top, argsFor(top));

    assert.equal(run.code, 1);
    assert.match(
      run.err,
      /summ-sweep\/config\.json is missing: copy summ-sweep\/config-example\.json/,
    );
  });

  it("refuses a day that is not one, and gives its help", async () => {
    assert.throws(
      () => dayStart("2023-02-30"),
      /"2023-02-30" is not a day written as YYYY-MM-DD/,
    );
    const help = await runOn(repo(), ["--help"]);
    assert.equal(help.code, 0);
    assert.match(help.out, /Usage: summ-sweep \[options\]/);
  });
});
