/**
 * Tests for fetch-amount-of-token-transferred.js, which reads how much of a
 * token one PulseChain transaction sent a wallet.
 * @module test/fetch-amount-of-token-transferred.test
 *
 * `getTokenTransferred` asks a PulseChain rpc endpoint, through ethers, for
 * the transaction's receipt and the token's decimals. The tests answer
 * those requests from the stand-in chain in `helpers/stand-in-chain.js`,
 * routed there by `helpers/ethers-stand-in.js`, so they ask nothing outside
 * the computer. ethers' own http is put back once the tests end. The cases
 * are the ones the Sheets script is held to too (`helpers/transfer-cases.js`).
 * One test runs the module in a child process instead, whose ethers fetch
 * refuses every request, and holds the program to ending once the call
 * has thrown.
 */

import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { getTokenTransferred } from "../fetch-amount-of-token-transferred.js";
import {
  TOKEN,
  WALLET,
  TRANSACTION,
  standInChain,
} from "./helpers/stand-in-chain.js";
import { TRANSFER_CASES } from "./helpers/transfer-cases.js";
import {
  useStandInChain,
  useEthersOwnHttp,
} from "./helpers/ethers-stand-in.js";

describe("getTokenTransferred, the Node script", () => {
  after(useEthersOwnHttp);

  for (const {
    name,
    chain,
    amount,
    error,
    transaction = TRANSACTION,
    token = TOKEN,
    wallet = WALLET,
  } of TRANSFER_CASES) {
    it(name, async () => {
      useStandInChain(chain());
      if (error === undefined) {
        assert.equal(
          await getTokenTransferred(transaction, token, wallet),
          amount,
        );
      } else {
        await assert.rejects(
          getTokenTransferred(transaction, token, wallet),
          error,
        );
      }
    });
  }

  it("takes the addresses in any case", async () => {
    useStandInChain(standInChain(250n));
    assert.equal(
      await getTokenTransferred(
        TRANSACTION,
        TOKEN.toLowerCase(),
        WALLET.toUpperCase().replace("0X", "0x"),
      ),
      250,
    );
  });
});

describe("getTokenTransferred, after a read that fails", () => {
  it("closes its provider, so the program that called it ends", () => {
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
