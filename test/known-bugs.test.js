/**
 * Tests of the bugs known in the repo's code, each declared with
 * `knownBug` (`helpers/known-bug.js`), so it passes while the bug is there.
 * @module test/known-bugs.test
 *
 * A fix makes its test fail; the same change declares the test with `it`,
 * among the tests of the code it is about, and removes it from here.
 */

import { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { knownBug } from "./helpers/known-bug.js";
import { splitCollects } from "../summ-sweep/positions.js";
import { ONE, TKN, event, hashOf } from "./helpers/summ-sweep-case.js";

describe("splitCollects, after a transaction that collects from two positions", () => {
  knownBug(
    "splits a later collect of one of those positions by the range's own DecreaseLiquidity events, though it was owed coins when the range began",
    () => {
      const records = new Map([
        [
          hashOf(3),
          {
            liquidity: [
              event("Collect", 9, 1n, 1n),
              event("Collect", 11, 1n, 1n),
            ],
          },
        ],
        [
          hashOf(4),
          {
            liquidity: [
              event("DecreaseLiquidity", 9, 100n, 0n),
              event("Collect", 9, 103n, 0n),
            ],
          },
        ],
      ]);
      const { splits, problems } = splitCollects({
        order: [hashOf(3), hashOf(4)],
        records,
        receivedIn: (hash) =>
          hash === hashOf(4) ? new Map([[TKN, 103n]]) : new Map(),
        owedAtStart: new Map([["9", [ONE, 0n]]]),
      });
      assert.deepEqual(
        problems.map((one) => one.hash),
        [hashOf(3)],
      );
      assert.deepEqual(splits, [
        {
          hash: hashOf(4),
          nftId: "9",
          token: TKN,
          received: 103n,
          principal: 100n,
          fee: 3n,
        },
      ]);
    },
  );
});

describe("the balance checker, with config.json refused", () => {
  knownBug(
    "names a missing --block or --date before the file's problems",
    () => {
      const repoTop = fileURLToPath(new URL("..", import.meta.url));
      const folder = fs.mkdtempSync(path.join(os.tmpdir(), "pa-known-"));
      const env = {
        ...process.env,
        API_KEYS_FILE_PATH: path.join(folder, "no-api-keys.json"),
        STAND_IN_SETTINGS: JSON.stringify({
          "check-token-balance/config.json": JSON.stringify({
            defaultRpc: "not an url",
          }),
        }),
      };
      delete env.API_KEYS_PASSWORD;
      try {
        const run = spawnSync(
          process.execPath,
          [
            "--import",
            fileURLToPath(
              new URL(
                "./helpers/stand-in-settings-preload.js",
                import.meta.url,
              ),
            ),
            path.join(repoTop, "check-token-balance/index.js"),
            "--address",
            "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39",
            "--tokens",
            "Pulse_Native_Gas_Token",
          ],
          { env, cwd: folder, encoding: "utf8", timeout: 30000 },
        );
        assert.equal(run.status, 1);
        assert.match(run.stderr, /give --block or --date/);
      } finally {
        fs.rmSync(folder, { recursive: true, force: true });
      }
    },
  );
});
