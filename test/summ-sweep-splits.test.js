/**
 * Tests for how `summ-sweep/` splits withdrawals from 9mm V3 positions
 * into principal and fees (`positions.js`) and runs LP Ranger's tool
 * (`lp-ranger.js`). `summ-sweep.test.js` tests the reading and the
 * match, and `summ-sweep-run.test.js` the whole sweep and its command
 * line.
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
import { splitCollects } from "../summ-sweep/positions.js";
import { readThroughLpRanger } from "../summ-sweep/lp-ranger.js";
import {
  HEX,
  ONE,
  OTHER,
  PM,
  POOL,
  RECORDS,
  TKN,
  WALLET,
  event,
  hashOf,
  removeTempFolders,
  tempFolder,
} from "./helpers/summ-sweep-case.js";

after(removeTempFolders);

describe("splitCollects", () => {
  const received = (coins) => () => new Map(coins);

  it("takes each NFT's decreases until its next collect, and places the coins by contract", () => {
    const { splits, problems } = splitCollects({
      order: [hashOf(0), hashOf(1), hashOf(2)],
      records: RECORDS,
      receivedIn: (hash) =>
        hash === hashOf(0)
          ? new Map([
              [TKN, 5n * ONE],
              [HEX, 3n * ONE],
            ])
          : new Map([[HEX, (3n * ONE) / 2n]]),
    });

    assert.deepEqual(problems, []);
    assert.deepEqual(splits, [
      {
        hash: hashOf(0),
        nftId: "7",
        token: HEX,
        received: 3n * ONE,
        principal: 2n * ONE,
        fee: ONE,
      },
      {
        hash: hashOf(0),
        nftId: "7",
        token: TKN,
        received: 5n * ONE,
        principal: 4n * ONE,
        fee: ONE,
      },
      {
        hash: hashOf(2),
        nftId: "9",
        token: HEX,
        received: (3n * ONE) / 2n,
        principal: ONE,
        fee: ONE / 2n,
      },
    ]);
  });

  it("reports collects it cannot split, rather than guess", () => {
    const records = new Map([
      [
        hashOf(3),
        {
          liquidity: [event("Collect", 1, 1n, 1n), event("Collect", 2, 1n, 1n)],
        },
      ],
      [hashOf(4), { liquidity: [event("Collect", 3, 1n, 1n)] }],
      [
        hashOf(5),
        {
          liquidity: [
            event("DecreaseLiquidity", 4, 5n, 0n),
            event("Collect", 4, 5n, 0n),
          ],
        },
      ],
      [hashOf(6), { liquidity: [event("Collect", 5, 0n, 0n)] }],
    ]);
    const coins = new Map([
      [hashOf(4), received([[HEX, 1n]])],
      [hashOf(5), received([[HEX, 4n]])],
      [hashOf(6), received([])],
    ]);

    const { splits, problems } = splitCollects({
      order: [hashOf(3), hashOf(4), hashOf(5), hashOf(6)],
      records,
      receivedIn: (hash) => coins.get(hash)(),
    });

    assert.deepEqual(splits, []);
    assert.deepEqual(
      problems.map((one) => one.hash),
      [hashOf(3), hashOf(4), hashOf(5)],
    );
    assert.match(problems[0].problem, /collects from more than one position/);
    assert.match(
      problems[1].problem,
      /cannot be placed on the position's two sides/,
    );
    assert.equal(
      problems[2].problem,
      `it paid out less ${HEX} than the principal its DecreaseLiquidity events name`,
    );
  });

  it("orders a pool's two coins by their addresses as numbers, whatever their case", () => {
    /*- OTHER, 0xbBbB…, is the lower number, while POOL, 0xCcCC…, comes
     * first as text, since capitals sort before small letters. */
    const records = new Map([
      [
        hashOf(7),
        {
          liquidity: [
            event("DecreaseLiquidity", 2, 1n, 3n),
            event("Collect", 2, 2n, 4n),
          ],
        },
      ],
    ]);

    const { splits } = splitCollects({
      order: [hashOf(7)],
      records,
      receivedIn: received([
        [POOL, 4n],
        [OTHER, 2n],
      ]),
    });

    assert.deepEqual(
      splits.map((one) => [one.token, one.principal, one.fee]),
      [
        [OTHER, 1n, 1n],
        [POOL, 3n, 1n],
      ],
    );
  });

  it("stops on a record that is missing, or of another shape, naming the transaction", () => {
    const run = (records) =>
      splitCollects({
        order: [hashOf(8)],
        records,
        receivedIn: received([]),
      });

    assert.throws(() => run(new Map()), {
      message: `LP Ranger's record of ${hashOf(8)} holds no list of liquidity events`,
    });
    assert.throws(
      () =>
        run(
          new Map([
            [
              hashOf(8),
              {
                liquidity: [
                  { event: "Collect", nftId: 7, amount0: "1", amount1: "1" },
                ],
              },
            ],
          ]),
        ),
      {
        message: `LP Ranger's record of ${hashOf(8)} gives an event's nftId as 7, not a string of digits`,
      },
    );
  });
});

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
