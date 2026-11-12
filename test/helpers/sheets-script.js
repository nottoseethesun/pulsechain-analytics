/**
 * Runs a Sheets script, unchanged, under Node for tests.
 * @module test/helpers/sheets-script
 *
 * The Sheets scripts in `for-google-apps/` are Google Apps Script: plain
 * JavaScript that reaches the chain through one Apps Script service,
 * `UrlFetchApp`. `loadSheetsScript` runs a script in a fresh Node `vm`
 * context whose `UrlFetchApp` hands each json-rpc request to a stand-in
 * chain (`stand-in-chain.js`), and returns the context. The script's
 * top-level functions are properties of that context, so a test calls them
 * as `script.getTokenTransferred(...)`. The script's console output is
 * dropped.
 */

import fs from 'node:fs';
import vm from 'node:vm';

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
  const context = vm.createContext({
    console: { log() {}, info() {}, error() {} },
    UrlFetchApp: {
      fetch: (_url, options) => {
        const reply = chain.answer(JSON.parse(options.payload));
        return { getContentText: () => JSON.stringify(reply) };
      }
    }
  });
  vm.runInContext(fs.readFileSync(scriptUrl, 'utf8'), context);
  return context;
}
