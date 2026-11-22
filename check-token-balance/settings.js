/**
 * The balance checker's settings: `config.json`, beside this file, checked
 * against its JSON Schema before the checker takes it.
 * @module check-token-balance/settings
 *
 * What: the file names the rpc endpoint `--rpc` defaults to, `defaultRpc`.
 * crypto-price-fetchers' `readSettingsFile`
 * (`crypto-price-fetchers/lib/settings-file`) reads it and holds it to
 * `SETTINGS_SCHEMA`, built from crypto-price-fetchers' kinds of value
 * (`crypto-price-fetchers/lib/settings-schema`), as LP Ranger checks its
 * settings: a file that is not JSON, a key the schema does not name, or a
 * `defaultRpc` that is no http or https url stops the run, with every
 * problem listed, before the chain is asked. No `config.json`, or a file
 * that names no endpoint, gives g4mm4's public endpoint, with a notice when
 * the file is missing. The file is read beside this file, whichever folder
 * the command runs in, so a run from the repo's top folder never reads the
 * top `config.json`, which holds other tools' settings.
 *
 * Fit: `index.js` reads the default here before it builds the command.
 */

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { readSettingsFile } from "crypto-price-fetchers/lib/settings-file";
import { KINDS } from "crypto-price-fetchers/lib/settings-schema";

/** The rpc endpoint when config.json names none: g4mm4's public PulseChain endpoint. */
export const FALLBACK_RPC = "https://rpc-pulsechain.g4mm4.io";

/** The balance checker's `config.json`, beside this file. */
const SETTINGS_FILE = fileURLToPath(new URL("./config.json", import.meta.url));

/** The JSON Schema of config.json: the default rpc endpoint, and no other key. */
export const SETTINGS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: { defaultRpc: KINDS.url },
});

/**
 * The rpc endpoint `--rpc` defaults to: `defaultRpc` in the settings file,
 * once it holds to `SETTINGS_SCHEMA`, else g4mm4's public endpoint.
 *
 * @param {string} [file] - The settings file: `config.json` beside this file, unless a test names another
 * @param {function(string): void} [warn] - Prints the notice that there is no settings file: the console's warning, unless a test reads it
 * @returns {string} The endpoint's url
 * @throws {Error} When the file cannot be read, is not JSON, or has a problem the schema finds, every problem listed
 */
export function defaultRpcFrom(
  file = SETTINGS_FILE,
  warn = (notice) => console.warn(notice),
) {
  if (!fs.existsSync(file)) {
    warn(`No ${file}: --rpc defaults to g4mm4's public endpoint.`);
  }
  const settings = readSettingsFile(file, {
    schema: SETTINGS_SCHEMA,
    name: "check-token-balance/config.json",
  });
  return settings.defaultRpc ?? FALLBACK_RPC;
}
