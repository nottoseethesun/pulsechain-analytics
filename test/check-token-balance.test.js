/**
 * Tests of the balance checker, `check-token-balance/`: its command line,
 * declared in `balance-command.js` and parsed here, in the test's thread;
 * and the real program, run as its owner runs it, through its start file,
 * `bin/check-token-balance.js`, in a child process from the repo's top
 * folder.
 * @module test/check-token-balance.test
 *
 * The program asks either an rpc endpoint on this computer that refuses
 * every connection, so a check that reaches the chain shows in what it
 * prints, or a stand-in PulseChain endpoint served on this computer. The
 * stand-in's block n has a time 10 seconds after block n - 1, and at block
 * n the wallet holds n PLS and 3n of a token with 8 decimals, so each
 * balance printed shows the block it was read at. A test may shift the
 * blocks' times, so the first block of a day is nearer its start than the
 * last block of the day before.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import {
  NATIVE_TOKEN,
  buildBalanceCommand,
} from "../check-token-balance/balance-command.js";

/** The repo's top folder. */
const REPO_TOP = fileURLToPath(new URL("..", import.meta.url));

/** An rpc endpoint on this computer that refuses every connection. */
const REFUSING_RPC = "http://127.0.0.1:1";

/** The made-up wallet the stand-in knows, in lower case. */
const WALLET = `0x${"5e".repeat(20)}`;

/** The made-up token contract the stand-in knows, in lower case. */
const TOKEN_CONTRACT = `0x${"7a".repeat(20)}`;

/** HEX's contract address, in EIP-55's form, as the help's example names it. */
const HEX = "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39";

/** The start of 1 November 2026, UTC, in seconds since 1970. */
const NOVEMBER_FIRST = Date.UTC(2026, 10, 1) / 1000;

/** The stand-in's newest block. */
const LATEST_BLOCK = 20000;

/** The stand-in's block 0 time: block 5000's is 3 seconds before NOVEMBER_FIRST, block 5001's 7 after. */
const FIRST_BLOCK_TIME = NOVEMBER_FIRST - 10 * 5000 - 3;

/**
 * A number as json-rpc writes it, in hex.
 *
 * @param {number|bigint} value - The number
 * @param {number} [digits] - The hex digits to pad it to, if any
 * @returns {string} Such as `0x1f`
 */
function hex(value, digits = 0) {
  return `0x${value.toString(16).padStart(digits, "0")}`;
}

/**
 * The stand-in's block, as eth_getBlockByNumber gives it.
 *
 * @param {number} number - The block's number
 * @param {number} firstBlockTime - Block 0's time, in seconds since 1970
 * @returns {Object} The block
 */
function blockAt(number, firstBlockTime) {
  return {
    hash: hex(number + 1, 64),
    parentHash: hex(number, 64),
    number: hex(number),
    timestamp: hex(firstBlockTime + 10 * number),
    nonce: hex(0, 16),
    difficulty: "0x0",
    gasLimit: hex(30_000_000),
    gasUsed: "0x0",
    miner: hex(0, 40),
    extraData: "0x",
    baseFeePerGas: "0x0",
    transactions: [],
  };
}

/**
 * The stand-in's answer to an eth_call: the token's balanceOf and decimals.
 *
 * @param {{to: string, data: string}} call - The call
 * @param {number} block - The block it reads
 * @returns {{result: string}|{error: Object}} The answer
 */
function contractAnswer(call, block) {
  if (call.to.toLowerCase() !== TOKEN_CONTRACT) return { result: "0x" };
  if (call.data.startsWith("0x313ce567")) return { result: hex(8, 64) };
  const holder = `0x${call.data.slice(-40)}`;
  const amount = holder === WALLET ? 3n * BigInt(block) * 10n ** 8n : 0n;
  return { result: hex(amount, 64) };
}

/**
 * The stand-in's answer to one json-rpc request.
 *
 * @param {{method: string, params: Array}} request - The request
 * @param {number} firstBlockTime - Block 0's time, in seconds since 1970
 * @returns {{result: *}|{error: Object}} The answer
 */
function answerOf({ method, params }, firstBlockTime) {
  switch (method) {
    case "eth_chainId":
      return { result: hex(369) };
    case "eth_blockNumber":
      return { result: hex(LATEST_BLOCK) };
    case "eth_getBlockByNumber":
      return { result: blockAt(Number(params[0]), firstBlockTime) };
    case "eth_getBalance": {
      const amount =
        params[0].toLowerCase() === WALLET
          ? BigInt(Number(params[1])) * 10n ** 18n
          : 0n;
      return { result: hex(amount) };
    }
    case "eth_call":
      return contractAnswer(params[0], Number(params[1]));
    default:
      return { error: { code: -32601, message: `no method ${method}` } };
  }
}

/**
 * Serves the stand-in endpoint on this computer.
 *
 * @param {number} [firstBlockTime=FIRST_BLOCK_TIME] - Block 0's time, in seconds since 1970
 * @returns {Promise<{url: string, requests: string[], close: function(): Promise<void>}>} Its url, the methods asked of it, in order, and a way to stop it
 */
async function startStandInEndpoint(firstBlockTime = FIRST_BLOCK_TIME) {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const parsed = JSON.parse(body);
      const reply = (one) => {
        requests.push(one.method);
        return { jsonrpc: "2.0", id: one.id, ...answerOf(one, firstBlockTime) };
      };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify(
          Array.isArray(parsed) ? parsed.map(reply) : reply(parsed),
        ),
      );
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Runs the balance checker, as its owner runs it, through its start file,
 * from the repo's top folder.
 *
 * @param {string[]} args - Its arguments
 * @returns {Promise<{status: number, stdout: string, stderr: string}>} How it ended, and what it printed
 */
function runChecker(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["bin/check-token-balance.js", ...args],
      {
        cwd: REPO_TOP,
        timeout: 30_000,
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

/**
 * Asserts that a run stopped with exit code 1, naming an option, before it
 * asked the chain anything.
 *
 * @param {{status: number, stdout: string, stderr: string}} run - The run
 * @param {string} option - The option the message names
 */
function assertRefusedBeforeTheChain(run, option) {
  assert.equal(run.status, 1);
  assert.ok(run.stderr.includes(option), run.stderr);
  assert.doesNotMatch(run.stdout + run.stderr, /ECONNREFUSED|detect network/);
}

/**
 * Parses an argument list with the checker's command line, in the test's
 * thread.
 *
 * @param {string[]} args - The arguments
 * @returns {{options?: Object, error?: string}} The options parsed, or the message of the mistake
 */
function parse(args) {
  let error = "";
  const command = buildBalanceCommand("https://rpc.example.com")
    .exitOverride()
    .configureOutput({
      writeOut: () => {},
      writeErr: (text) => {
        error += text;
      },
    })
    .action(() => {});
  try {
    command.parse(["node", "index.js", ...args]);
  } catch {
    return { error };
  }
  return { options: command.opts() };
}

/** The options every parse below needs, beyond the one it tests. */
const NEEDED = ["--address", WALLET, "--tokens", NATIVE_TOKEN];

describe("the balance checker's command line", () => {
  it("parses each option to the value the run takes: addresses in EIP-55's form, a date as the start of its day in UTC", () => {
    const { options } = parse([
      "--address",
      WALLET,
      "--block",
      "22000000",
      "--tokens",
      `${NATIVE_TOKEN}, ${HEX.toLowerCase()}`,
    ]);
    assert.deepEqual(options, {
      address: ethers.getAddress(WALLET),
      block: 22000000,
      tokens: [NATIVE_TOKEN, HEX],
      rpc: "https://rpc.example.com",
    });
    assert.equal(
      parse([...NEEDED, "--date", "2026-11-01"]).options.date,
      NOVEMBER_FIRST,
    );
    assert.equal(parse([...NEEDED, "--block", "007"]).options.block, 7);
  });

  for (const [args, option] of [
    [["--block", "abc"], "--block"],
    [["--block", "1.5"], "--block"],
    [["--block", "-1"], "--block"],
    [["--block", "99999999999999999999"], "--block"],
    [["--date", "2026-02-30"], "--date"],
    [["--date", "2026-11-1"], "--date"],
    [["--date", "11/01/2026"], "--date"],
    [["--rpc", "ftp://example.com"], "--rpc"],
    [["--rpc", "not a url"], "--rpc"],
  ]) {
    it(`refuses ${args.join(" ")}, naming ${option}`, () => {
      const { error } = parse([...NEEDED, ...args]);
      assert.ok(error.includes(option), error);
    });
  }

  it("refuses an address that is no address, or whose mixed case is not its checksum, naming --address", () => {
    for (const address of ["0x123", `0x2B${HEX.slice(4)}`]) {
      const { error } = parse(["--address", address, "--tokens", NATIVE_TOKEN]);
      assert.ok(error.includes("--address"), error);
    }
  });

  it("refuses a token that is neither PLS's name nor an address, naming --tokens and the token", () => {
    for (const [tokens, named] of [
      [`${NATIVE_TOKEN},0xabc`, '"0xabc"'],
      [`${NATIVE_TOKEN},`, '""'],
    ]) {
      const { error } = parse(["--address", WALLET, "--tokens", tokens]);
      assert.ok(error.includes("--tokens") && error.includes(named), error);
    }
  });

  it("refuses --block and --date together, naming both", () => {
    const { error } = parse([
      ...NEEDED,
      "--block",
      "1",
      "--date",
      "2026-11-01",
    ]);
    assert.ok(error.includes("--block") && error.includes("--date"), error);
  });
});

describe("check-token-balance/index.js, given a wrong block or date", () => {
  it("refuses a block that is no whole number, naming --block, before it asks the chain anything", async () => {
    const run = await runChecker([
      ...NEEDED,
      "--block",
      "abc",
      "--rpc",
      REFUSING_RPC,
    ]);
    assertRefusedBeforeTheChain(run, "--block");
  });

  it("refuses a date no calendar has, naming --date, before it asks the chain anything", async () => {
    const run = await runChecker([
      ...NEEDED,
      "--date",
      "2026-02-30",
      "--rpc",
      REFUSING_RPC,
    ]);
    assertRefusedBeforeTheChain(run, "--date");
  });

  it("stops with exit code 1 when neither --block nor --date is given, before it asks the chain anything", async () => {
    const run = await runChecker([...NEEDED, "--rpc", REFUSING_RPC]);
    assertRefusedBeforeTheChain(run, "give --block or --date");
  });
});

describe("check-token-balance/index.js, against a stand-in endpoint", () => {
  let endpoint;

  before(async () => {
    endpoint = await startStandInEndpoint();
  });

  after(async () => {
    if (endpoint !== undefined) await endpoint.close();
  });

  it("prints the wallet's balances of PLS and of a token at the block given, with commas and then plain, reading each once", async () => {
    endpoint.requests.length = 0;
    const run = await runChecker([
      "--address",
      WALLET,
      "--block",
      "1234",
      "--tokens",
      `${NATIVE_TOKEN},${TOKEN_CONTRACT}`,
      "--rpc",
      endpoint.url,
    ]);
    assert.equal(run.status, 0, run.stderr);
    const token = ethers.getAddress(TOKEN_CONTRACT);
    assert.equal(
      run.stdout,
      [
        "Querying balances at block: 1234",
        "",
        "Formatted Balances (with commas):",
        `${NATIVE_TOKEN}: 1,234.0`,
        `${token}: 3,702.0`,
        "",
        "Plain Balances (no commas):",
        `${NATIVE_TOKEN}: 1234`,
        `${token}: 3702`,
        "",
      ].join("\n"),
    );
    const asked = (method) =>
      endpoint.requests.filter((one) => one === method).length;
    assert.equal(asked("eth_getBalance"), 1);
    assert.equal(asked("eth_call"), 2);
  });

  it("reads at the last block made before the start of the date given", async () => {
    const run = await runChecker([
      ...NEEDED,
      "--date",
      "2026-11-01",
      "--rpc",
      endpoint.url,
    ]);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /^Querying balances at block: 5000\n/);
    assert.ok(run.stdout.includes(`${NATIVE_TOKEN}: 5,000.0\n`), run.stdout);
  });

  it("reads at the last block made before the start of the date given, even when the day's first block is nearer that start", async () => {
    // Block 5000 is made 7 seconds before the start of 1 November 2026,
    // UTC, and block 5001 3 seconds after it
    const shifted = await startStandInEndpoint(FIRST_BLOCK_TIME - 4);
    try {
      const run = await runChecker([
        ...NEEDED,
        "--date",
        "2026-11-01",
        "--rpc",
        shifted.url,
      ]);
      assert.equal(run.status, 0, run.stderr);
      assert.match(run.stdout, /^Querying balances at block: 5000\n/);
    } finally {
      await shifted.close();
    }
  });

  it("refuses a date whose start the chain has not reached, or that comes before its first block, with exit code 1", async () => {
    for (const date of ["2099-01-01", "2026-01-01"]) {
      const run = await runChecker([
        ...NEEDED,
        "--date",
        date,
        "--rpc",
        endpoint.url,
      ]);
      assert.equal(run.status, 1, date);
      assert.match(
        run.stderr,
        /^Error: The chain('s newest block, 20000, was made before| made no block before) /m,
      );
    }
  });

  it("stops with exit code 1, saying why, when a read fails", async () => {
    const run = await runChecker([
      "--address",
      WALLET,
      "--block",
      "1234",
      "--tokens",
      `0x${"11".repeat(20)}`,
      "--rpc",
      endpoint.url,
    ]);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /^Error: /m);
  });
});
