/**
 * Tests for the command line of the Summ sweep
 * (`summ-sweep/command-line.js`): its options, its settings, the two files
 * it writes and its help. `summ-sweep-run.test.js` tests the sweep itself.
 * @module test/summ-sweep-command.test
 *
 * The command line runs on a repo top in a temp folder of its own, with
 * the stand-in chain of `helpers/summ-sweep-case.js`, Summ's page written
 * by `helpers/summ-pages.js`, and LP Ranger's tool a stand-in that answers
 * with the case's records (`helpers/summ-sweep-command-run.js`).
 */

import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readSweepSettings } from "../summ-sweep/settings.js";
import { argsFor, repo, runOn } from "./helpers/summ-sweep-command-run.js";
import {
  POOL,
  TKN,
  WALLET,
  removeTempFolders,
  tempFolder,
  WPLS,
} from "./helpers/summ-sweep-case.js";

after(removeTempFolders);

/** The repo's top folder. */
const REPO_TOP = path.resolve(import.meta.dirname, "..");

/**
 * Why the test that needs a folder that takes no new file is skipped, or
 * false: it uses /proc, a folder of Linux's that takes no new file even
 * from root, whom no folder's modes stop.
 */
const NO_PROC = !fs.existsSync("/proc") && "this system has no /proc";

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

  it("removes the last run's csv, saying so, when a run with --replace has no rows to write", async () => {
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
    assert.match(
      run.out,
      /No rows to write, so no csv was written, and the last run's csv at \S*rows\.csv was removed\./,
    );
  });

  it("refuses a requestSpacingMs Node's timers cannot keep, more than 2147483647 milliseconds", async () => {
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
    assert.equal(run.chainMade, false);
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

  it("refuses the chain's facts of the wrong kind in the top config.json, listing every problem, before it reads the chain", async () => {
    const top = repo();
    const chain = JSON.parse(fs.readFileSync(path.join(top, "config.json")));
    chain.pulsechain.batchSize = 0;
    chain.pulsechain.wrappedCoin = WPLS.toLowerCase();
    delete chain.pulsechain.spanBlocks;
    fs.writeFileSync(path.join(top, "config.json"), JSON.stringify(chain));

    const run = await runOn(top, argsFor(top));

    assert.equal(run.code, 1);
    assert.equal(
      run.err,
      [
        "config.json → pulsechain.spanBlocks is missing",
        `config.json → pulsechain.wrappedCoin must be an EIP-55 address; it is "${WPLS.toLowerCase()}"`,
        "config.json → pulsechain.batchSize must be a whole number above 0; it is 0",
        "",
      ].join("\n"),
    );
    assert.equal(run.chainMade, false);
  });

  it("refuses an owner's address whose mixed case breaks its checksum, as a key and in a list, before it reads the chain", async () => {
    const top = repo();
    const ownerFile = path.join(top, "summ-sweep", "config.json");
    const owner = JSON.parse(fs.readFileSync(ownerFile));
    // WPLS with its first letter in lower case: mixed case, checksum broken
    const broken = `0xa${WPLS.slice(3)}`;
    owner.ownWallets = { [broken]: "Mine" };
    owner.spamTokens = [broken, broken];
    fs.writeFileSync(ownerFile, JSON.stringify(owner));

    const run = await runOn(top, argsFor(top));

    assert.equal(run.code, 1);
    assert.ok(
      run.err.includes(
        `summ-sweep/config.json → ownWallets has the key "${broken}", which must be an address, 0x and 40 hex digits, in lower case or in EIP-55's mixed case\n`,
      ),
      run.err,
    );
    assert.match(
      run.err,
      /summ-sweep\/config\.json → spamTokens must be a list of addresses, each once/,
    );
    assert.equal(run.chainMade, false);
  });

  it("refuses a token's empty list of symbols in Summ in words that ask for one or more", () => {
    const top = repo();
    const ownerFile = path.join(top, "summ-sweep", "config.json");
    const owner = JSON.parse(fs.readFileSync(ownerFile));
    owner.summSymbols = { [WPLS]: [] };
    fs.writeFileSync(ownerFile, JSON.stringify(owner));

    assert.throws(() => readSweepSettings(top), {
      message: `summ-sweep/config.json → summSymbols.${WPLS} must be a list of one or more symbols, each once; it is []`,
    });
  });

  it("takes the committed top config.json and summ-sweep/config-example.json, which hold to their schemas", () => {
    const top = tempFolder("summ-sweep-committed-");
    fs.mkdirSync(path.join(top, "summ-sweep"));
    fs.copyFileSync(
      path.join(REPO_TOP, "config.json"),
      path.join(top, "config.json"),
    );
    fs.copyFileSync(
      path.join(REPO_TOP, "summ-sweep", "config-example.json"),
      path.join(top, "summ-sweep", "config.json"),
    );
    const { chain, owner } = readSweepSettings(top);
    assert.equal(chain.chainId, 369);
    assert.ok(Object.keys(owner.csvSymbols).length > 0);
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
  });

  it("gives its help, with its exit codes", async () => {
    const help = await runOn(repo(), ["--help"]);

    assert.equal(help.code, 0);
    assert.match(help.out, /Usage: summ-sweep \[options\]/);
    assert.match(help.out, /Exit codes: 0 when the report was written/);
  });

  it("refuses a missing folder of --out or --report, a missing page of --summ-results and a templatePath that names no file, before it asks the chain anything, writing neither file", async () => {
    const cases = [
      ["--report", "folder", "option '--report <file>' argument"],
      ["--out", "folder", "option '--out <file>' argument"],
      ["--summ-results", "page", "option '--summ-results <files...>' argument"],
      ["templatePath", "template", "templatePath names no file"],
    ];
    for (const [name, kind, said] of cases) {
      const top = repo();
      const missing = path.join(top, "no-such-folder", "file");
      const changes = kind === "template" ? {} : { [name]: missing };
      if (kind === "template") fs.rmSync(path.join(top, "template.csv"));
      const run = await runOn(top, argsFor(top, changes));
      assert.equal(run.code, 1, name);
      assert.ok(run.err.includes(said), `${name}: ${run.err}`);
      assert.equal(run.chainMade, false, name);
      assert.equal(fs.existsSync(path.join(top, "rows.csv")), false, name);
      assert.equal(fs.existsSync(path.join(top, "report.json")), false, name);
    }
  });

  it("refuses an --out and a --report that name one file, naming --report, before it reads anything", async () => {
    const top = repo(false);
    const same = path.join(top, "rows.csv");
    const run = await runOn(top, argsFor(top, { "--report": same }));
    assert.equal(run.code, 1);
    assert.ok(
      run.err.includes(
        `error: option '--report <file>' argument '${same}' is invalid. It names the file --out names; the csv and the report need two.`,
      ),
      run.err,
    );
    assert.equal(fs.existsSync(same), false);
  });

  it("refuses an --out or a --report that is a folder, naming it, before it asks the chain anything, writing neither file", async () => {
    for (const name of ["--out", "--report"]) {
      const top = repo();
      const folder = path.join(top, "a-folder");
      fs.mkdirSync(folder);
      const run = await runOn(top, [
        ...argsFor(top, { [name]: folder }),
        "--replace",
      ]);
      assert.equal(run.code, 1, name);
      assert.ok(
        run.err.includes(
          `error: option '${name} <file>' argument '${folder}' is invalid. It is a folder, not a file.`,
        ),
        `${name}: ${run.err}`,
      );
      assert.equal(run.chainMade, false, name);
      assert.equal(fs.existsSync(path.join(top, "rows.csv")), false, name);
    }
  });

  it("refuses an empty --out, --report or page of --summ-results, naming it, before it asks the chain anything, writing neither file", async () => {
    for (const flags of [
      "--out <file>",
      "--report <file>",
      "--summ-results <files...>",
    ]) {
      const name = flags.split(" ")[0];
      const top = repo();
      const run = await runOn(top, argsFor(top, { [name]: "" }));
      assert.equal(run.code, 1, name);
      assert.ok(
        run.err.includes(
          `error: option '${flags}' argument '' is invalid. It names no file.`,
        ),
        `${name}: ${run.err}`,
      );
      assert.equal(run.chainMade, false, name);
      assert.equal(fs.existsSync(path.join(top, "rows.csv")), false, name);
      assert.equal(fs.existsSync(path.join(top, "report.json")), false, name);
    }
  });

  describe("in /proc, which takes no new file", { skip: NO_PROC }, () => {
    it("refuses an --out or a --report in a folder that takes no new file, naming it, before it asks the chain anything, writing neither file", async () => {
      for (const name of ["--out", "--report"]) {
        const top = repo();
        const file = path.join("/proc", `summ-sweep-test-${name.slice(2)}`);
        const run = await runOn(top, argsFor(top, { [name]: file }));
        assert.equal(run.code, 1, name);
        assert.ok(
          run.err.includes(
            `error: option '${name} <file>' argument '${file}' is invalid. Its folder, /proc, takes no new file`,
          ),
          `${name}: ${run.err}`,
        );
        assert.equal(run.chainMade, false, name);
        assert.equal(fs.existsSync(path.join(top, "rows.csv")), false, name);
        assert.equal(fs.existsSync(path.join(top, "report.json")), false, name);
      }
    });
  });

  it("refuses an --end-date before --start-date, naming --end-date, before it reads a settings file", async () => {
    const top = repo(false);
    const run = await runOn(
      top,
      argsFor(top, { "--start-date": "2023-11-15" }),
    );
    assert.equal(run.code, 1);
    assert.ok(
      run.err.includes(
        "error: option '--end-date <day>' argument '2023-11-14' is invalid. It is before the day of --start-date, 2023-11-15.",
      ),
      run.err,
    );
  });
});
