/**
 * The ratio chart's api keys: Moralis's, for a run whose candles come from
 * Moralis, and DexTools', for its fallback to current prices, each saved
 * in the repo's key store.
 * @module chart-price-ratio/api-keys
 *
 * A key is no setting and no command-line argument. `npm run api-keys`, in
 * the repo's top folder, saves it, encrypted with the one password of the
 * repo's keys, in the key store of crypto-price-fetchers, the owner's repo
 * of code his projects share (`crypto-price-fetchers/api-key-store`). The
 * top folder's `config.json` lists the services under `apiKeys`.
 *
 * `keySaved` says whether a service's key is saved, without opening it, so
 * the chart can offer Moralis and warn of a missing DexTools key before it
 * asks anything. `openKey` opens one service's key, with the password in
 * `API_KEYS_PASSWORD`, or one typed at a prompt that shows nothing of it,
 * once the service has checked that it takes the key. The chart opens each
 * key the first time it asks that service, so a run that never asks one
 * opens no key of it, and a run that asks neither asks for no password.
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

/** What saves a key, for the messages that need it. */
export const SAVE_KEY_HELP = `To save one, in the repo's top folder: ${MANAGE_COMMAND}`;

/**
 * Says whether a service's key is saved, without opening it.
 *
 * @param {string} service - The service, as the key store names it: 'moralis' or 'dextools'
 * @param {Object<string, string>} [env=process.env] - The environment, for `API_KEYS_FILE_PATH`
 * @returns {boolean} Whether one is saved
 */
export function keySaved(service, env = process.env) {
  return hasEncryptedKey(keyFileFor(REPO_TOP, env), service);
}

/**
 * Opens a service's key, once the service has checked that it takes it.
 *
 * @param {string} service - The service, as the key store names it: 'moralis' or 'dextools'
 * @param {Object} [options] - What a test replaces (`unlockProjectKeys`): `env`, `ask`, `say`, `checkOptions`
 * @returns {Promise<?string>} The key, or null when none is saved
 * @throws {Error} With `keyRefused` set, when the password does not open it, or the service refuses it
 */
export async function openKey(service, options = {}) {
  const keys = await unlockProjectKeys({
    projectTop: REPO_TOP,
    services: [service],
    ...options,
  });
  return keys[service];
}
