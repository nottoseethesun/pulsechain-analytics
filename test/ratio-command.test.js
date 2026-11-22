/**
 * Tests of the ratio chart's command line as it takes config.json's
 * settings (`chart-price-ratio/ratio-command.js`), parsed in the test's
 * thread: the settings' JSON Schema, the parsers made from its kinds of
 * value, and the conflict of `--source` with a `useDexToolsOnly` the file
 * sets.
 * @module test/ratio-command.test
 *
 * The runs of the chart itself are in `pulse-token-ratio.test.js` and
 * `pulse-token-ratio-moralis.test.js`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildRatioCommand } from "../chart-price-ratio/ratio-command.js";

/** The two tokens of a ratio. */
const TOKEN_A = `0x${"a".repeat(40)}`;
const TOKEN_B = `0x${"b".repeat(40)}`;

/** The chart's committed config.json. */
const COMMITTED = JSON.parse(
  fs.readFileSync(
    new URL("../chart-price-ratio/config.json", import.meta.url),
    "utf8",
  ),
);

/**
 * Parses an argument list with the command built from settings, in the
 * test's thread.
 *
 * @param {Object} config - config.json's settings
 * @param {string[]} args - The arguments after the two tokens
 * @returns {{options?: Object, code?: string, error?: string}} The options parsed, or the code and message of the refusal
 */
function parse(config, args = []) {
  let error = "";
  const command = buildRatioCommand(config)
    .exitOverride()
    .configureOutput({
      writeOut: () => {},
      writeErr: (text) => {
        error += text;
      },
    })
    .action(() => {});
  try {
    command.parse(["node", "pulse-token-ratio.js", TOKEN_A, TOKEN_B, ...args]);
  } catch (thrown) {
    return { code: thrown.code, error };
  }
  return { options: command.opts() };
}

describe("buildRatioCommand, with config.json's settings", () => {
  it("takes the committed config.json, which holds to the schema, as the options' defaults", () => {
    const { options } = parse(COMMITTED);
    assert.equal(options.maxCandles, COMMITTED.maxCandles);
    assert.equal(options.moralisDays, COMMITTED.moralis.days);
    assert.equal(options.host, COMMITTED.dextools.host);
    assert.equal(options.useDexToolsOnly, COMMITTED.useDexToolsOnly);
  });

  it("refuses a maxCandles of 0 in config.json, as it refuses --max-candles 0", () => {
    assert.throws(
      () => buildRatioCommand({ maxCandles: 0 }),
      /config\.json → maxCandles must be a whole number above 0; it is 0/,
    );
    assert.equal(
      parse({}, ["--max-candles", "0"]).code,
      "commander.invalidArgument",
    );
  });

  it("names every problem in config.json at once, nested settings among them", () => {
    assert.throws(
      () =>
        buildRatioCommand({
          interval: "monthly",
          dextools: { host: "public-api.dextools.io", plan: "standard" },
          moralis: { days: "730" },
          useDexToolsOnly: "no",
          colour: "green",
        }),
      {
        message: [
          "config.json → colour is not a setting this tool reads",
          "config.json → dextools.plan is not a setting this tool reads",
          'config.json → dextools.host must be an http or https url; it is "public-api.dextools.io"',
          'config.json → moralis.days must be a whole number above 0; it is "730"',
          'config.json → interval must be one of hourly, daily, weekly; it is "monthly"',
          'config.json → useDexToolsOnly must be true or false; it is "no"',
        ].join("\n"),
      },
    );
  });

  it("refuses --source when config.json sets useDexToolsOnly, as it refuses the two typed together", () => {
    const fromFile = parse({ useDexToolsOnly: true }, ["--source", "moralis"]);
    assert.equal(fromFile.code, "commander.conflictingOption");
    assert.match(
      fromFile.error,
      /option '--source <source>' cannot be used with option '--useDexToolsOnly' \(set in config\.json\)/,
    );
    const typed = parse({}, ["--source", "moralis", "--useDexToolsOnly"]);
    assert.equal(typed.code, "commander.conflictingOption");
  });

  it("takes --source when config.json leaves useDexToolsOnly false", () => {
    const { options } = parse({ useDexToolsOnly: false }, [
      "--source",
      "moralis",
    ]);
    assert.equal(options.source, "moralis");
  });
});
