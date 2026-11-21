/**
 * The known bugs, each declared with `knownBug`, which passes while its bug
 * is present. The fix of a bug makes its test fail; the same change
 * declares the test with `it` instead, among the tests of the code it is
 * about.
 * @module test/known-bugs.test
 *
 * The balance checker, `check-token-balance/index.js`, runs as its owner
 * runs it, against a stand-in PulseChain endpoint served on this computer
 * whose block n has a time 10 seconds after block n - 1, and at which the
 * wallet holds n PLS, so the balance printed shows the block it was read
 * at. Block 5000 is made 7 seconds before the start of 1 November 2026,
 * UTC, and block 5001 3 seconds after it.
 */

import { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import http from "node:http";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { knownBug } from "./helpers/known-bug.js";

const execFileAsync = promisify(execFile);

/** The balance checker's folder, which it runs from. */
const FOLDER = fileURLToPath(
  new URL("../check-token-balance/", import.meta.url),
);

/** The wallet the tests read. */
const WALLET = `0x${"ab".repeat(20)}`;

/** The start of 1 November 2026, UTC, in seconds since 1970. */
const NOVEMBER_FIRST = Date.UTC(2026, 10, 1) / 1000;

/** Block 0's time: block 5000's is 7 seconds before NOVEMBER_FIRST, block 5001's 3 after. */
const FIRST_BLOCK_TIME = NOVEMBER_FIRST - 10 * 5000 - 7;

/**
 * The stand-in's answer to one json-rpc request.
 *
 * @param {{method: string, params: Array}} request - The request
 * @returns {Object} The answer's result or error
 */
function answerOf({ method, params }) {
  const hex = (value) => `0x${value.toString(16)}`;
  if (method === "eth_chainId") return { result: hex(369) };
  if (method === "eth_blockNumber") return { result: hex(20000) };
  if (method === "eth_getBlockByNumber") {
    const number = Number(params[0]);
    return {
      result: {
        hash: `0x${(number + 1).toString(16).padStart(64, "0")}`,
        parentHash: `0x${number.toString(16).padStart(64, "0")}`,
        number: hex(number),
        timestamp: hex(FIRST_BLOCK_TIME + 10 * number),
        nonce: `0x${"0".repeat(16)}`,
        difficulty: "0x0",
        gasLimit: hex(30000000),
        gasUsed: "0x0",
        miner: `0x${"0".repeat(40)}`,
        extraData: "0x",
        baseFeePerGas: "0x0",
        transactions: [],
      },
    };
  }
  if (method === "eth_getBalance")
    return { result: hex(BigInt(Number(params[1])) * 10n ** 18n) };
  return { error: { code: -32601, message: `no method ${method}` } };
}

describe("known bugs of the balance checker", () => {
  let server;
  let url;

  before(async () => {
    server = http.createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        const parsed = JSON.parse(body);
        const reply = (one) => ({
          jsonrpc: "2.0",
          id: one.id,
          ...answerOf(one),
        });
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify(
            Array.isArray(parsed) ? parsed.map(reply) : reply(parsed),
          ),
        );
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  knownBug(
    "reads at the last block made before the start of the date given, even when the day's first block is nearer that start",
    async () => {
      const { stdout } = await execFileAsync(
        process.execPath,
        [
          "index.js",
          "--address",
          WALLET,
          "--date",
          "2026-11-01",
          "--tokens",
          "Pulse_Native_Gas_Token",
          "--rpc",
          url,
        ],
        { cwd: FOLDER },
      );
      assert.match(stdout, /^Querying balances at block: 5000\n/);
    },
  );
});
