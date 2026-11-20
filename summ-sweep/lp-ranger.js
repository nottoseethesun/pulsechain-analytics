/**
 * Reads each liquidity transaction through LP Ranger's own tool, so the
 * reading of a 9mm V3 transaction lives in one place.
 * @module summ-sweep/lp-ranger
 *
 * What: LP Ranger's `util/bookkeeping/coins-in-transaction.js` reads one
 * transaction's receipt and prints, as json, its kind and the position
 * manager's events: each IncreaseLiquidity, DecreaseLiquidity and Collect,
 * with the position's NFT id and its two amounts. LP Ranger's rules allow
 * no second copy of that reading, and LP Ranger cannot change to share it
 * as a package, so the sweep runs LP Ranger's tool as a program, once per
 * transaction the wallet sent to the position manager, from the checkout
 * of LP Ranger the owner's settings name.
 *
 * How: each run is `node coins-in-transaction.js <hash> --wallet <wallet>
 * --rpc-endpoint <url> --position-manager <address>`, so the endpoint and
 * the position manager are the sweep's own rather than LP Ranger's
 * settings'. The tool prints its record on stdout, and anything else on
 * stderr. Runs go one at a time, each after the last has ended, which
 * keeps the endpoint's load to one request at a time.
 *
 * Fit: `summ-sweep/positions.js` reads the records' events to split a
 * withdrawal's coins into principal and fees.
 */

import path from "node:path";
import { execFile } from "node:child_process";

/** The tool's path inside an LP Ranger checkout. */
const TOOL = path.join("util", "bookkeeping", "coins-in-transaction.js");

/**
 * Runs a program and gives what it printed.
 *
 * @param {string} file - The program
 * @param {string[]} args - Its arguments
 * @param {string} cwd - The folder it runs in
 * @returns {Promise<string>} What it printed on stdout
 * @throws {Error} When it ends with an exit code other than 0, with what
 *   it printed on stderr
 */
function runProgram(file, args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { cwd, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error === null) resolve(stdout);
        else {
          const said = stderr.trim();
          reject(
            new Error(said === "" ? error.message : said, { cause: error }),
          );
        }
      },
    );
  });
}

/**
 * LP Ranger's record of each transaction, read by its own tool.
 *
 * @param {string[]} hashes - The transactions
 * @param {object} reading - How to read them
 * @param {string} reading.lpRangerDir - The LP Ranger checkout
 * @param {string} reading.wallet - The wallet
 * @param {string} reading.rpcEndpoint - The endpoint
 * @param {string} reading.positionManager - The position manager
 * @param {function(string, string[], string): Promise<string>}
 *   [reading.run] - Runs a program; the tests give a stand-in
 * @returns {Promise<Map<string, object>>} Each record, by hash in lower
 *   case
 * @throws {Error} When a run fails, naming the transaction
 */
export async function readThroughLpRanger(
  hashes,
  { lpRangerDir, wallet, rpcEndpoint, positionManager, run = runProgram },
) {
  const records = new Map();
  for (const hash of hashes) {
    let printed;
    try {
      printed = await run(
        process.execPath,
        [
          TOOL,
          hash,
          "--wallet",
          wallet,
          "--rpc-endpoint",
          rpcEndpoint,
          "--position-manager",
          positionManager,
        ],
        lpRangerDir,
      );
    } catch (thrown) {
      throw new Error(
        `LP Ranger's coins-in-transaction.js could not read ${hash}: ${thrown.message}`,
        { cause: thrown },
      );
    }
    records.set(hash.toLowerCase(), JSON.parse(printed));
  }
  return records;
}
