/**
 * Tests for the command line of the Summ sweep
 * (`summ-sweep/command-line.js`): its options, its settings, the two files
 * it writes and its help. `summ-sweep-run.test.js` tests the sweep itself.
 * @module test/summ-sweep-command.test
 *
 * The command line runs on a repo top in a temp folder of its own, with
 * the stand-in chain of `helpers/summ-sweep-case.js`, Summ's page written
 * by `helpers/summ-pages.js`, and LP Ranger's tool a stand-in that answers
 * with the case's records.
 */

import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runSummSweep } from "../summ-sweep/command-line.js";
import { summPage } from "./helpers/summ-pages.js";
import {
  CHAIN,
  POOL,
  RECORDS,
  TEMPLATE_HEADER,
  TKN,
  WALLET,
  removeTempFolders,
  summRows,
  sweepChain,
  tempFolder,
} from "./helpers/summ-sweep-case.js";

after(removeTempFolders);

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
 * @returns {Promise<{code: number, out: string, err: string,
 *   chainMade: boolean}>} What it returned and printed, and whether it
 *   went as far as making the chain's provider
 */
async function runOn(top, args) {
  const output = { out: "", err: "", chainMade: false };
  const code = await runSummSweep(["node", "summ-sweep.js", ...args], {
    repoTop: top,
    stdout: { write: (text) => (output.out += text) },
    stderr: { write: (text) => (output.err += text) },
    makeProvider: () => {
      output.chainMade = true;
      return sweepChain();
    },
    run: async (_file, args) => JSON.stringify(RECORDS.get(args[1])),
  });
  return { code, ...output };
}

/**
 * The arguments of a run, with any of them changed.
 *
 * @param {string} top - The repo top
 * @param {object} [changes] - The options to change, by name
 * @returns {string[]} The arguments
 */
function argsFor(top, changes = {}) {
  const options = {
    "--wallet": WALLET,
    "--start-date": "2023-11-14",
    "--end-date": "2023-11-14",
    "--summ-synced-to": "2023-11-14 22:18:20",
    "--summ-results": path.join(top, "page-1.txt"),
    "--out": path.join(top, "rows.csv"),
    "--report": path.join(top, "report.json"),
    ...changes,
  };
  return Object.entries(options).flat();
}

describe("runSummSweep", () => {
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
    assert.equal(csv[1].split(",")[8], POOL.toLowerCase());
    const report = JSON.parse(
      fs.readFileSync(path.join(top, "report.json"), "utf8"),
    );
    assert.equal(report.wallet, WALLET);
    assert.equal(report.summSyncedTo, 1_700_000_300);
    assert.equal(report.fixes[0].principal, "200000000");
    assert.equal(report.fixes[0].summ.amount, "3");
    assert.deepEqual(
      report.unmatched.map((leg) => [leg.token, leg.part ?? "whole"]),
      [
        [TKN, "whole"],
        [TKN, "principal"],
        [TKN, "fee"],
      ],
    );
    assert.equal(report.questions[0].legs[0].amount, "200000000");
    assert.equal(report.questions[0].legs[0].amountText, "2 TKN");
  });

  it("writes neither file when one is in the way, and both with --replace", async () => {
    const top = repo();
    fs.writeFileSync(path.join(top, "report.json"), "kept");

    const refused = await runOn(top, argsFor(top));
    const csvAfterRefusal = fs.existsSync(path.join(top, "rows.csv"));
    const replaced = await runOn(top, [...argsFor(top), "--replace"]);

    assert.equal(refused.code, 1);
    assert.match(refused.err, /report\.json is already there: pass --replace/);
    assert.equal(csvAfterRefusal, false);
    assert.equal(replaced.code, 0);
    assert.notEqual(
      fs.readFileSync(path.join(top, "report.json"), "utf8"),
      "kept",
    );
    assert.equal(fs.existsSync(path.join(top, "rows.csv")), true);
  });

  it("says when there is nothing to write as rows", async () => {
    const top = repo();

    const run = await runOn(
      top,
      argsFor(top, {
        "--start-date": "2023-11-13",
        "--end-date": "2023-11-13",
      }),
    );

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

  it("refuses a mistake in an option as it parses it, naming the option, before it reads anything", async () => {
    const top = repo();
    const mistakes = [
      [
        { "--wallet": "0x123" },
        /option '--wallet <address>' argument '0x123' is invalid\. It is not an address/,
      ],
      [
        { "--start-date": "2023-02-30" },
        /option '--start-date <day>' argument '2023-02-30' is invalid\. "2023-02-30" is not a day written as YYYY-MM-DD\./,
      ],
      [
        { "--summ-synced-to": "2023-11-14 25:00:00" },
        /option '--summ-synced-to <time>' argument '2023-11-14 25:00:00' is invalid\./,
      ],
    ];

    for (const [changes, said] of mistakes) {
      const run = await runOn(top, argsFor(top, changes));
      assert.equal(run.code, 1);
      assert.match(run.err, said);
      assert.equal(run.chainMade, false);
    }
    const backwards = await runOn(
      top,
      argsFor(top, { "--start-date": "2023-11-15" }),
    );
    assert.equal(backwards.code, 1);
    assert.match(backwards.err, /--end-date is before --start-date/);
  });

  it("gives its help, with its exit codes", async () => {
    const help = await runOn(repo(), ["--help"]);

    assert.equal(help.code, 0);
    assert.match(help.out, /Usage: summ-sweep \[options\]/);
    assert.match(help.out, /Exit codes: 0 when the report was written/);
  });
});
