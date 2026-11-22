/**
 * The known bugs, each declared with `knownBug` (`helpers/known-bug.js`),
 * so its test passes while the bug is present.
 * @module test/known-bugs.test
 *
 * The Summ sweep's settings are read from a repo top in a temp folder of
 * the test's own (`helpers/summ-sweep-case.js`), whose two settings files
 * the test writes.
 */

import { after, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readSweepSettings } from "../summ-sweep/settings.js";
import { knownBug } from "./helpers/known-bug.js";
import {
  CHAIN,
  WPLS,
  removeTempFolders,
  tempFolder,
} from "./helpers/summ-sweep-case.js";

after(removeTempFolders);

describe("summ-sweep/settings.js, with summ-sweep/config.json's words for an empty list", () => {
  knownBug(
    "refuses a token's empty list of symbols in Summ in words that ask for one or more",
    () => {
      const top = tempFolder("summ-sweep-bugs-");
      fs.mkdirSync(path.join(top, "summ-sweep"));
      fs.writeFileSync(
        path.join(top, "config.json"),
        JSON.stringify({
          pulsechain: {
            ...CHAIN,
            chainId: 369,
            rpcEndpoint: "https://rpc.example",
            requestSpacingMs: 0,
          },
        }),
      );
      fs.writeFileSync(
        path.join(top, "summ-sweep", "config.json"),
        JSON.stringify({
          templatePath: "template.csv",
          lpRangerDir: "/lp",
          summSymbols: { [WPLS]: [] },
        }),
      );
      assert.throws(() => readSweepSettings(top), {
        message: `summ-sweep/config.json → summSymbols.${WPLS} must be a list of one or more symbols, each once; it is []`,
      });
    },
  );
});
