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
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { knownBug } from "./helpers/known-bug.js";
import { argsFor, repo, runOn } from "./helpers/summ-sweep-command-run.js";
import { removeTempFolders } from "./helpers/summ-sweep-case.js";
import { TOKEN, WALLET } from "./helpers/stand-in-chain.js";

after(removeTempFolders);

/**
 * Why the test that needs a folder that takes no new file is skipped, or
 * false: it uses /proc, a folder of Linux's that takes no new file even
 * from root, whom no folder's modes stop.
 */
const NO_PROC = !fs.existsSync("/proc") && "this system has no /proc";

describe("the Summ sweep's command line, with a file it cannot use", () => {
  knownBug(
    "refuses a missing folder of --out or --report, a missing page of --summ-results and a templatePath that names no file, before it asks the chain anything, writing neither file",
    async () => {
      const cases = [
        ["--report", "folder", "option '--report <file>' argument"],
        ["--out", "folder", "option '--out <file>' argument"],
        [
          "--summ-results",
          "page",
          "option '--summ-results <files...>' argument",
        ],
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
    },
  );

  knownBug(
    "refuses an --out and a --report that name one file, naming --report, before it reads anything",
    async () => {
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
    },
  );

  knownBug(
    "refuses an --out or a --report that is a folder, naming it, before it asks the chain anything, writing neither file",
    async () => {
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
    },
  );

  knownBug(
    "refuses an empty --out, --report or page of --summ-results, naming it, before it asks the chain anything, writing neither file",
    async () => {
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
    },
  );

  describe("in /proc, which takes no new file", { skip: NO_PROC }, () => {
    knownBug(
      "refuses an --out or a --report in a folder that takes no new file, naming it, before it asks the chain anything, writing neither file",
      async () => {
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
          assert.equal(
            fs.existsSync(path.join(top, "report.json")),
            false,
            name,
          );
        }
      },
    );
  });
});

describe("the Summ sweep's command line, with its days backwards", () => {
  knownBug(
    "refuses an --end-date before --start-date, naming --end-date, before it reads a settings file",
    async () => {
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
    },
  );
});

describe("getTokenTransferred, after a read that fails", () => {
  knownBug("closes its provider, so the program that called it ends", () => {
    const moduleUrl = new URL(
      "../fetch-amount-of-token-transferred.js",
      import.meta.url,
    ).href;
    const code = [
      'import { ethers } from "ethers";',
      `import { getTokenTransferred } from ${JSON.stringify(moduleUrl)};`,
      "ethers.FetchRequest.registerGetUrl(async () => {",
      '  throw new Error("connect ECONNREFUSED");',
      "});",
      "try {",
      `  await getTokenTransferred("0x${"ab".repeat(32)}", "${TOKEN}", "${WALLET}");`,
      "} catch {",
      '  console.log("threw");',
      "}",
    ].join("\n");
    const run = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", code],
      {
        cwd: path.join(import.meta.dirname, ".."),
        encoding: "utf8",
        timeout: 5000,
      },
    );
    assert.equal(run.stdout.trim(), "threw");
    assert.equal(run.status, 0);
  });
});
