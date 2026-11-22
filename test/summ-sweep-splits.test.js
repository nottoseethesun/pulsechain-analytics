/**
 * Tests for how `summ-sweep/` runs LP Ranger's tool (`lp-ranger.js`),
 * sorts the splits of withdrawals from 9mm V3 positions into Summ's cases
 * (`splits.js`), and reads what each position was owed when the range
 * began (`owed.js`). `summ-sweep-positions.test.js` tests the split
 * itself, `summ-sweep.test.js` the reading and the match,
 * `summ-sweep-run.test.js` the whole sweep, and
 * `summ-sweep-command.test.js` its command line.
 * @module test/summ-sweep-splits.test
 *
 * The withdrawals are those of `helpers/summ-sweep-case.js`, and LP
 * Ranger's tool is a stand-in that answers with records the test writes,
 * or a program the test writes in a temp folder of its own.
 */

import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readThroughLpRanger } from "../summ-sweep/lp-ranger.js";
import { sortSplits } from "../summ-sweep/splits.js";
import { csvSymbolOf, ownerLists } from "../summ-sweep/owner-lists.js";
import { owedWhenRangeBegan } from "../summ-sweep/owed.js";
import { pacedProvider } from "../wallet-history/paced-provider.js";
import {
  HEX,
  ONE,
  PM,
  WALLET,
  WPLS,
  hashOf,
  removeTempFolders,
  sweepChain,
  tempFolder,
} from "./helpers/summ-sweep-case.js";

after(removeTempFolders);

describe("readThroughLpRanger", () => {
  it("runs LP Ranger's tool once a transaction, from its checkout, with the sweep's endpoint and manager", async () => {
    const runs = [];
    const records = await readThroughLpRanger([hashOf(0)], {
      lpRangerDir: "/lp-ranger",
      wallet: WALLET,
      rpcEndpoint: "https://rpc.example",
      positionManager: PM,
      run: async (file, args, cwd) => {
        runs.push({ file, args, cwd });
        return JSON.stringify({ kind: "collect", liquidity: [] });
      },
    });

    assert.deepEqual(runs, [
      {
        file: process.execPath,
        args: [
          path.join("util", "bookkeeping", "coins-in-transaction.js"),
          hashOf(0),
          "--wallet",
          WALLET,
          "--rpc-endpoint",
          "https://rpc.example",
          "--position-manager",
          PM,
        ],
        cwd: "/lp-ranger",
      },
    ]);
    assert.deepEqual(records.get(hashOf(0)), {
      kind: "collect",
      liquidity: [],
    });
  });

  it("names the transaction a run could not read", async () => {
    await assert.rejects(
      readThroughLpRanger([hashOf(1)], {
        lpRangerDir: "/lp-ranger",
        wallet: WALLET,
        rpcEndpoint: "https://rpc.example",
        positionManager: PM,
        run: async () => {
          throw new Error("endpoint failed");
        },
      }),
      {
        message: `LP Ranger's coins-in-transaction.js could not read ${hashOf(1)}: endpoint failed`,
      },
    );
  });

  it("runs a real program, and passes on what it says when it fails", async () => {
    const folder = tempFolder("summ-sweep-lp-");
    const tool = path.join(folder, "util", "bookkeeping");
    fs.mkdirSync(tool, { recursive: true });
    fs.writeFileSync(
      path.join(tool, "coins-in-transaction.js"),
      "if (process.argv[2].endsWith('1')) { console.error('no such receipt'); process.exit(1); }\nconsole.log(JSON.stringify({ hash: process.argv[2] }));\n",
    );
    const reading = {
      lpRangerDir: folder,
      wallet: WALLET,
      rpcEndpoint: "x",
      positionManager: PM,
    };

    const records = await readThroughLpRanger([hashOf(2)], reading);

    assert.deepEqual(records.get(hashOf(2)), { hash: hashOf(2) });
    await assert.rejects(
      readThroughLpRanger([hashOf(1)], reading),
      /no such receipt/,
    );
  });
});

describe("sortSplits, with the owner's lists", () => {
  it("leaves the fee of a position's coin with no symbol for the csv to be asked about, rather than book a fee row with none", () => {
    const leg = {
      hash: hashOf(9),
      direction: "in",
      token: HEX,
      symbol: "PLS",
      amount: 3n,
      decimals: 8,
    };
    const lists = ownerLists({});
    const sorted = sortSplits({
      splits: [
        {
          hash: hashOf(9),
          nftId: "11",
          token: HEX,
          received: 3n,
          principal: 2n,
          fee: 1n,
        },
      ],
      legs: [leg],
      matches: new Map([[leg, { id: "summ-leg" }]]),
      wallet: WALLET,
      csvSymbolOf: (token, symbol) => csvSymbolOf(lists, token, symbol),
    });
    assert.deepEqual(sorted.rows, []);
    assert.equal(sorted.fixes.length, 1);
    assert.deepEqual(
      sorted.parts.map((part) => [part.part, part.amount]),
      [["fee", 1n]],
    );
  });
});

describe("sortSplits", () => {
  const sort = (splits, legs = []) =>
    sortSplits({
      splits,
      legs,
      matches: new Map(),
      wallet: WALLET,
      csvSymbolOf: (token, symbol) => symbol,
    });

  it("hands back apart a coin the position manager paid as PLS, with principal or without", () => {
    const withPrincipal = {
      hash: hashOf(9),
      nftId: "11",
      token: WPLS,
      received: 3n,
      principal: 2n,
      fee: 1n,
    };
    const feesAlone = { ...withPrincipal, principal: 0n, fee: 3n };

    assert.deepEqual(sort([withPrincipal, feesAlone]).paidAsCoin, [
      withPrincipal,
      feesAlone,
    ]);
  });

  it("leaves a token coin with no principal to the match, as any other leg", () => {
    const leg = {
      hash: hashOf(9),
      direction: "in",
      token: HEX,
      amount: 3n,
      decimals: 8,
    };
    const sorted = sort(
      [
        {
          hash: hashOf(9),
          nftId: "11",
          token: HEX,
          received: 3n,
          principal: 0n,
          fee: 3n,
        },
      ],
      [leg],
    );

    assert.deepEqual(sorted.paidAsCoin, []);
    assert.deepEqual(sorted.parts, []);
    assert.equal(sorted.splitLegs.has(leg), false);
  });
});

describe("owedWhenRangeBegan", () => {
  it("gives the coins each position was owed at the block before the range, for those owed any", async () => {
    const chain = sweepChain({ 7: [0n, 0n], 9: [ONE, 0n] });
    const paced = pacedProvider(chain, { spacingMs: 0 });

    const owed = await owedWhenRangeBegan(paced, {
      positionManager: PM,
      nftIds: ["7", "9", "12"],
      fromBlock: 5,
    });

    assert.deepEqual([...owed], [["9", [ONE, 0n]]]);
    assert.deepEqual(chain.callBlocks, [4, 4, 4]);
  });

  it("stops on an endpoint's error answer to its call, which is not the position manager's", async () => {
    const failing = {
      async call() {
        throw Object.assign(new Error("missing revert data"), {
          code: "CALL_EXCEPTION",
          data: null,
          info: { error: { code: -32005, message: "limit exceeded" } },
        });
      },
    };

    await assert.rejects(
      owedWhenRangeBegan(pacedProvider(failing, { spacingMs: 0 }), {
        positionManager: PM,
        nftIds: ["9"],
        fromBlock: 5,
      }),
      /positions\(9\) at block 4: limit exceeded/,
    );
  });

  it("asks nothing for a range that starts at block 0", async () => {
    const chain = sweepChain({ 9: [ONE, 0n] });

    const owed = await owedWhenRangeBegan(
      pacedProvider(chain, { spacingMs: 0 }),
      { positionManager: PM, nftIds: ["9"], fromBlock: 0 },
    );

    assert.equal(owed.size, 0);
    assert.equal(chain.requests.call, undefined);
  });
});
