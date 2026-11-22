/**
 * Preload that lets a test run a tool's real command line, in a child
 * process, with a settings file of the test's own.
 * @module test/helpers/stand-in-settings-preload
 *
 * The ratio chart and the balance checker read the `config.json` beside
 * their own files, files git keeps, so a test cannot hand them other
 * settings by writing a file. A test starts
 * `node --import <this file> <tool> ...` with `STAND_IN_SETTINGS` in the
 * child's environment: a JSON object whose keys are files, each by its
 * path from the repo's top folder, and whose values are the text each is
 * to give. This file makes the tool's read of each give that text, so a
 * test never writes a file git keeps.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The repo's top folder. */
const REPO_TOP = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

/** Each file the test stands in for, by its full path, with its text. */
const STAND_INS = new Map(
  Object.entries(JSON.parse(process.env.STAND_IN_SETTINGS ?? "{}")).map(
    ([file, text]) => [path.join(REPO_TOP, file), text],
  ),
);

const readFileSync = fs.readFileSync;

/*-
 *  TEST-ONLY global swap: the tools read their settings with
 *  `fs.readFileSync`, through crypto-price-fetchers' `readSettingsFile`, at
 *  paths fixed beside their own files, and offer no seam for them. This
 *  file runs only in a child process a test starts for one run of a
 *  command line, so the swap is never seen outside that process, and it
 *  ends with the process.
 */
fs.readFileSync = (file, ...rest) => {
  const asPath = file instanceof URL ? fileURLToPath(file) : String(file);
  return STAND_INS.get(path.resolve(asPath)) ?? readFileSync(file, ...rest);
};
