/**
 * Tests of the balance checker's settings (`check-token-balance/settings.js`):
 * `config.json`, beside the checker's files, checked against its JSON
 * Schema before the checker takes it.
 * @module test/check-token-balance-settings.test
 *
 * The settings files are written in a temp folder of the test's own,
 * removed afterwards. Since the checker reads the config.json beside its
 * own files, a run with a config.json of the test's is a run of a copy of
 * the checker's files in that folder, whose `node_modules` is a link to the
 * checker's own. A run whose config.json the checker takes is given
 * `--block abc`, which the checker refuses as it parses, so it asks no
 * chain; a run whose config.json is refused stops before its action, on the
 * file's problems, so it asks no chain either.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultRpcFrom,
  FALLBACK_RPC,
} from "../check-token-balance/settings.js";

/** The balance checker's folder, and its committed config.json. */
const CHECKER_FOLDER = fileURLToPath(
  new URL("../check-token-balance/", import.meta.url),
);
const COMMITTED = path.join(CHECKER_FOLDER, "config.json");

/** A wallet. */
const WALLET = `0x${"5e".repeat(20)}`;

let folder;
let copy;

before(() => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), "pulsechain-analytics-rpc-"));
  copy = path.join(folder, "check-token-balance");
  fs.mkdirSync(copy);
  for (const file of fs.readdirSync(CHECKER_FOLDER)) {
    if (file.endsWith(".js") || file === "package.json") {
      fs.copyFileSync(path.join(CHECKER_FOLDER, file), path.join(copy, file));
    }
  }
  fs.symlinkSync(
    path.join(CHECKER_FOLDER, "node_modules"),
    path.join(copy, "node_modules"),
    "dir",
  );
});

after(() => {
  fs.rmSync(folder, { recursive: true, force: true });
});

/**
 * Writes a config.json of the text given in the temp folder.
 *
 * @param {string} text - The file's text
 * @returns {string} Its path
 */
function writeConfig(text) {
  const file = path.join(folder, "config.json");
  fs.writeFileSync(file, text);
  return file;
}

/**
 * Runs the copy of the checker, with a config.json of the text given beside
 * it, from the temp folder.
 *
 * @param {string} configText - The config.json
 * @returns {{status: number, stdout: string, stderr: string}} How it ended
 */
function runWith(configText, block = "abc") {
  fs.writeFileSync(path.join(copy, "config.json"), configText);
  return spawnSync(
    process.execPath,
    [
      path.join(copy, "index.js"),
      "--address",
      WALLET,
      "--tokens",
      "Pulse_Native_Gas_Token",
      "--block",
      block,
    ],
    { cwd: folder, encoding: "utf8", timeout: 30_000 },
  );
}

describe("defaultRpcFrom", () => {
  it("takes the committed config.json's endpoint, which holds to the schema", () => {
    assert.equal(
      defaultRpcFrom(COMMITTED),
      JSON.parse(fs.readFileSync(COMMITTED, "utf8")).defaultRpc,
    );
  });

  it("gives g4mm4's endpoint for a config.json that names none", () => {
    assert.equal(defaultRpcFrom(writeConfig("{}")), FALLBACK_RPC);
  });

  it("gives g4mm4's endpoint, with a notice, when there is no config.json", () => {
    const notices = [];
    assert.equal(
      defaultRpcFrom(path.join(folder, "none.json"), (notice) =>
        notices.push(notice),
      ),
      FALLBACK_RPC,
    );
    assert.equal(notices.length, 1);
    assert.match(
      notices[0],
      /none\.json: --rpc defaults to g4mm4's public endpoint/,
    );
  });

  it("refuses a key the schema does not name, listing it with the endpoint's problem", () => {
    const file = writeConfig(
      JSON.stringify({ defaultRPC: "https://rpc.example.com", defaultRpc: 5 }),
    );
    assert.throws(() => defaultRpcFrom(file), {
      message: [
        "check-token-balance/config.json → defaultRPC is not a setting this tool reads",
        "check-token-balance/config.json → defaultRpc must be an http or https url; it is 5",
      ].join("\n"),
    });
  });
});

describe("check-token-balance/index.js, with a config.json it refuses", () => {
  it("reads the config.json beside its files, not the one of the folder it runs in", () => {
    fs.writeFileSync(path.join(folder, "config.json"), "{ not json");
    const ended = runWith(
      JSON.stringify({ defaultRpc: "https://rpc.example.com" }),
    );
    assert.equal(ended.status, 1);
    assert.doesNotMatch(ended.stderr, /not valid JSON/);
    assert.match(ended.stderr, /--block/);
  });

  it("stops with exit code 1, naming the file, when config.json is not JSON", () => {
    const ended = runWith('{ defaultRpc: "https://rpc.example.com" }', "1");
    assert.equal(ended.status, 1);
    assert.match(ended.stderr, /^Error: \S*config\.json is not valid JSON: /m);
    assert.doesNotMatch(ended.stderr, /--block/);
  });

  it("stops with exit code 1, naming the setting, when defaultRpc is not an http or https url", () => {
    const ended = runWith(
      JSON.stringify({ defaultRpc: "rpc.example.com" }),
      "1",
    );
    assert.equal(ended.status, 1);
    assert.match(
      ended.stderr,
      /^Error: check-token-balance\/config\.json → defaultRpc must be an http or https url; it is "rpc\.example\.com"$/m,
    );
    assert.doesNotMatch(ended.stderr, /--block/);
  });

  it("names a mistake in an option first, when config.json is refused too", () => {
    const ended = runWith(JSON.stringify({ defaultRpc: "rpc.example.com" }));
    assert.equal(ended.status, 1);
    assert.match(ended.stderr, /--block/);
    assert.doesNotMatch(ended.stderr, /defaultRpc/);
  });
});
