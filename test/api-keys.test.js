/**
 * Tests of how pulsechain-analytics keeps its api keys: crypto-price-fetchers'
 * key store, with the keys this repo's programs send listed in its top
 * `config.json`, its key manager, and its copy of `unlock-api-keys.sh`.
 * @module test/api-keys.test
 *
 * The manager runs with a key file of its own in a temp folder, removed
 * afterwards, and no `API_KEYS_PASSWORD`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readNeededKeys } from "crypto-price-fetchers/api-key-store";

/** The repo's top folder. */
const REPO_TOP = fileURLToPath(new URL("..", import.meta.url));

describe("the api keys", () => {
  it("are DexTools', for the ratio chart's fallback, and Moralis's, for its candles, as config.json lists them", () => {
    assert.deepEqual(
      readNeededKeys(REPO_TOP).map(({ service }) => service),
      ["dextools", "moralis"],
    );
  });

  it("are unlocked by a copy of crypto-price-fetchers' unlock-api-keys.sh", () => {
    const original = fileURLToPath(
      import.meta.resolve("crypto-price-fetchers/api-key-store"),
    );
    const theirs = path.join(
      path.dirname(original),
      "..",
      "unlock-api-keys.sh",
    );
    assert.equal(
      fs.readFileSync(path.join(REPO_TOP, "unlock-api-keys.sh"), "utf8"),
      fs.readFileSync(theirs, "utf8"),
    );
  });

  it("are saved by the key manager, npm run api-keys, which lists them without their characters", () => {
    const folder = fs.mkdtempSync(
      path.join(os.tmpdir(), "pulsechain-analytics-test-api-keys-"),
    );
    try {
      const env = {
        ...process.env,
        API_KEYS_FILE_PATH: path.join(folder, "api-keys.json"),
      };
      delete env.API_KEYS_PASSWORD;
      const run = spawnSync(
        process.execPath,
        [path.join(REPO_TOP, "manage-api-keys.js")],
        { env, input: "\n\n", encoding: "utf8", timeout: 15000 },
      );
      assert.equal(run.status, 0, run.stderr);
      assert.match(
        run.stdout,
        / {2}DexTools {2}not saved\n {2}Moralis {3}not saved\n$/,
      );
      assert.match(
        run.stderr,
        /No DexTools api key was entered, so none was saved\./,
      );
      assert.match(
        run.stderr,
        /No Moralis api key was entered, so none was saved\./,
      );
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});
