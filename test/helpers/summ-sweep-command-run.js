/**
 * Runs the Summ sweep's command line (`summ-sweep/command-line.js`) as
 * its tests do: on a repo top in a temp folder of its own, with the
 * stand-in chain of `summ-sweep-case.js`, Summ's page written by
 * `summ-pages.js`, and LP Ranger's tool a stand-in that answers with the
 * case's records.
 * @module test/helpers/summ-sweep-command-run
 */

import fs from "node:fs";
import path from "node:path";
import { runSummSweep } from "../../summ-sweep/command-line.js";
import { summPage } from "./summ-pages.js";
import {
  CHAIN,
  RECORDS,
  TEMPLATE_HEADER,
  WALLET,
  summRows,
  sweepChain,
  tempFolder,
} from "./summ-sweep-case.js";

/**
 * A repo top in a temp folder, with the chain settings, a template,
 * Summ's page and, unless left out, the owner's settings.
 *
 * @param {boolean} [owner] - Whether to write the owner's settings
 * @returns {string} The repo top
 */
export function repo(owner = true) {
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
 * @param {{makeChain: function(): Object}} [stand] - What makes the chain's provider: the case's chain, unless a test gives another
 * @returns {Promise<{code: number, out: string, err: string,
 *   chainMade: boolean}>} What it returned and printed, and whether it
 *   went as far as making the chain's provider
 */
export async function runOn(top, args, { makeChain = sweepChain } = {}) {
  const output = { out: "", err: "", chainMade: false };
  const code = await runSummSweep(
    ["node", "bin/end-user/summ-sweep.js", ...args],
    {
      repoTop: top,
      stdout: { write: (text) => (output.out += text) },
      stderr: { write: (text) => (output.err += text) },
      makeProvider: () => {
        output.chainMade = true;
        return makeChain();
      },
      run: async (_file, args) => JSON.stringify(RECORDS.get(args[1])),
    },
  );
  return { code, ...output };
}

/**
 * The arguments of a run, with any of them changed.
 *
 * @param {string} top - The repo top
 * @param {object} [changes] - The options to change, by name
 * @returns {string[]} The arguments
 */
export function argsFor(top, changes = {}) {
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
