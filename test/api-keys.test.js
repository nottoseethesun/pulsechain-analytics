/**
 * Tests of how pulsechain-analytics keeps its api keys: crypto-price-fetchers'
 * key store, with the keys this repo's programs send listed in its top
 * `config.json`, its key manager, which also saves the services' order of
 * priority, and its copy of `bin/unlock-api-keys.sh`.
 * @module test/api-keys.test
 *
 * The manager runs with a key file of its own in a temp folder, removed
 * afterwards, and no `API_KEYS_PASSWORD` but the tests' own made-up one,
 * where a test sets it.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  projectPriority,
  readNeededKeys,
} from "crypto-price-fetchers/api-key-store";
import {
  assertKeysNotShown,
  MORALIS_CHECK_URL,
  MORALIS_KEY,
  PASSWORD,
} from "./helpers/ratio-chart.js";

/** The repo's top folder. */
const REPO_TOP = fileURLToPath(new URL("..", import.meta.url));

/** The preload that stands in for the web, for the key manager's check of a key. */
const STAND_IN_WEB = fileURLToPath(
  new URL("./helpers/stand-in-web-preload.js", import.meta.url),
);

describe("the api keys", () => {
  it("are DexTools', for the ratio chart's fallback, and Moralis's, for its candles, as config.json lists them", () => {
    assert.deepEqual(
      readNeededKeys(REPO_TOP).map(({ service }) => service),
      ["dextools", "moralis"],
    );
  });

  it("are unlocked by a copy of crypto-price-fetchers' bin/unlock-api-keys.sh", () => {
    const original = fileURLToPath(
      import.meta.resolve("crypto-price-fetchers/api-key-store"),
    );
    const theirs = path.join(
      path.dirname(original),
      "..",
      "bin",
      "unlock-api-keys.sh",
    );
    assert.equal(
      fs.readFileSync(path.join(REPO_TOP, "bin", "unlock-api-keys.sh"), "utf8"),
      fs.readFileSync(theirs, "utf8"),
    );
  });

  it("are saved by the key manager, npm run api-keys, which lists them numbered in their order of priority, without their characters, and saves that order", () => {
    const folder = fs.mkdtempSync(
      path.join(os.tmpdir(), "pulsechain-analytics-test-api-keys-"),
    );
    try {
      const answers = path.join(folder, "answers.json");
      const log = path.join(folder, "requests.log");
      fs.writeFileSync(
        answers,
        JSON.stringify([{ url: MORALIS_CHECK_URL, body: { version: "2.2" } }]),
      );
      const env = {
        ...process.env,
        API_KEYS_FILE_PATH: path.join(folder, "api-keys.json"),
        API_KEYS_PASSWORD: PASSWORD,
        STAND_IN_WEB_ANSWERS: answers,
        STAND_IN_WEB_LOG: log,
        STAND_IN_WEB_KEY: MORALIS_KEY,
      };
      const manage = (input) =>
        spawnSync(
          process.execPath,
          [
            "--import",
            STAND_IN_WEB,
            path.join(REPO_TOP, "bin", "end-user", "manage-api-keys.js"),
          ],
          { env, input, encoding: "utf8", timeout: 15000 },
        );
      /*- Enter skips the DexTools key, the Moralis key is saved, and Enter
       * at the question of the order of priority keeps config.json's order. */
      const first = manage(`\n${MORALIS_KEY}\n\n`);
      assert.equal(first.status, 0, first.stderr);
      assert.match(
        first.stdout,
        / {2}1\. DexTools {2}not saved\n {2}2\. Moralis {3}not saved\n$/,
      );
      assert.match(
        first.stderr,
        /No DexTools api key was entered, so none was saved\./,
      );
      assert.deepEqual(projectPriority(REPO_TOP, { env }), {
        services: ["dextools", "moralis"],
        saved: true,
      });
      // The order is saved, so the second run asks only for the DexTools key.
      const second = manage("\n");
      assert.equal(second.status, 0, second.stderr);
      assert.match(
        second.stdout,
        / {2}1\. DexTools {2}not saved\n {2}2\. Moralis {3}saved\n$/,
      );
      assert.deepEqual(
        fs
          .readFileSync(log, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line)),
        [{ url: MORALIS_CHECK_URL, sentKey: true }],
      );
      assertKeysNotShown(first);
      assertKeysNotShown(second);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});
