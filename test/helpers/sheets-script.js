/**
 * Runs a Sheets script, unchanged, under Node for tests.
 * @module test/helpers/sheets-script
 *
 * The Sheets scripts in `for-google-apps/` are Google Apps Script: plain
 * JavaScript that reaches the chain through one Apps Script service,
 * `UrlFetchApp`. `loadSheetsScript` runs a script in the test's own thread
 * with the Node versions of the Apps Script services from the runner the
 * Node versions use (`crypto-price-fetchers/apps-script-runner`), whose
 * `UrlFetchApp` here hands each json-rpc request to a stand-in chain
 * (`stand-in-chain.js`). It returns the script's context. The script's
 * top-level functions are properties of that context, so a test calls them
 * as `script.getTokenTransferred(...)`. The script's console output is
 * dropped.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAppsScriptServices, loadAppsScript } from 'crypto-price-fetchers/apps-script-runner';

/** The Sheets script that reads how much of a token a transaction sent a wallet. */
export const TRANSFER_SHEETS_SCRIPT = new URL(
  '../../for-google-apps/check-token-balance/fetch-amount-of-token-transferred.gs',
  import.meta.url
);

/**
 * Loads a Sheets script whose `UrlFetchApp` answers from a stand-in chain.
 *
 * @param {URL} scriptUrl - The `.gs` file
 * @param {{answer: function(Object): Object}} chain - The stand-in chain
 * @returns {Object} The context holding the script's top-level functions
 */
export function loadSheetsScript(scriptUrl, chain) {
  const services = createAppsScriptServices({
    fetchSync: (request) => ({
      status: 200,
      headers: {},
      text: JSON.stringify(chain.answer(JSON.parse(request.body)))
    })
  });
  return loadAppsScript(fs.readFileSync(scriptUrl, 'utf8'), fileURLToPath(scriptUrl), services);
}
