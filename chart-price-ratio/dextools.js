/**
 * DexTools, for the ratio chart's fallback: a token's current USD price,
 * asked with the DexTools api key saved in the repo's key store.
 * @module chart-price-ratio/dextools
 *
 * The key is no setting and no command-line argument. `npm run api-keys`,
 * in the repo's top folder, saves it, encrypted, and the chart opens it the
 * first time it asks DexTools, with the password in `API_KEYS_PASSWORD`, or
 * one typed at a prompt that shows nothing of it (crypto-price-fetchers'
 * `api-key-store`). A run that never asks DexTools asks for no password.
 */

import { fileURLToPath } from "node:url";
import {
  hasEncryptedKey,
  keyFileFor,
  MANAGE_COMMAND,
  unlockProjectKeys,
} from "crypto-price-fetchers/api-key-store";

/**
 * The repo's top folder, whose `config.json` lists the keys its programs
 * send, and beside which they are kept.
 */
const REPO_TOP = fileURLToPath(new URL("..", import.meta.url));

/** How long DexTools may take to answer, its body included, in milliseconds, unless the caller sets another. */
export const DEXTOOLS_TIMEOUT_MS = 30000;

/** What saves the key, for the messages that need it. */
export const SAVE_KEY_HELP = `To save one, in the repo's top folder: ${MANAGE_COMMAND}`;

/**
 * Says whether a DexTools key is saved, without opening it.
 *
 * @param {Object<string, string>} [env=process.env] - The environment, for `API_KEYS_FILE_PATH`
 * @returns {boolean} Whether one is saved
 */
export function dexToolsKeySaved(env = process.env) {
  return hasEncryptedKey(keyFileFor(REPO_TOP, env), "dextools");
}

/**
 * Opens the DexTools key saved, once DexTools has checked that it takes it.
 *
 * @param {Object} [options] - What a test replaces (`unlockProjectKeys`): `env`, `ask`, `say`, `checkOptions`
 * @returns {Promise<?string>} The key, or null when none is saved
 * @throws {Error} With `keyRefused` set, when the password does not open it, or DexTools refuses it
 */
export async function openDexToolsKey(options = {}) {
  const keys = await unlockProjectKeys({
    projectTop: REPO_TOP,
    services: ["dextools"],
    ...options,
  });
  return keys.dextools;
}

/**
 * Fetches a token's current USD price from DexTools, which has
 * `api.timeoutMs`, or DEXTOOLS_TIMEOUT_MS, to answer in full.
 *
 * @param {{host: string, subscription: string, version: string, chain: string, timeoutMs: (number|undefined)}} api - DexTools' address, the plan, the api version, the chain's name there, and the time it may take
 * @param {string} apiKey - The DexTools key
 * @param {string} tokenAddress - The token's contract address
 * @returns {Promise<number>} The price
 * @throws {Error} When DexTools does not answer in time, answers with an error, or gives no price
 */
export async function getCurrentUsdPriceDexTools(api, apiKey, tokenAddress) {
  const url = `${api.host}/${api.subscription}/${api.version}/token/${api.chain}/${tokenAddress}/price`;
  const limitMs = api.timeoutMs ?? DEXTOOLS_TIMEOUT_MS;
  let res;
  let text;
  try {
    res = await fetch(url, {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(limitMs),
    });
    text = await res.text();
  } catch (error) {
    if (error?.name !== "TimeoutError") throw error;
    throw new Error(
      `DexTools gave no answer within ${limitMs / 1000} seconds`,
      {
        cause: error,
      },
    );
  }
  if (!res.ok) throw new Error(`DexTools error ${res.status}: ${text}`);
  const json = JSON.parse(text);
  const price = json.data?.price;
  if (!price) throw new Error("Price field missing");
  console.log(
    `DexTools USD price for ${tokenAddress.slice(0, 8)}...: $${price}`,
  );
  return parseFloat(price);
}
