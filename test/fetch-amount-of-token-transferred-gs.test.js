/**
 * Tests for the Sheets script fetch-amount-of-token-transferred.gs, which
 * reads how much of a token one PulseChain transaction sent a wallet.
 * @module test/fetch-amount-of-token-transferred-gs.test
 *
 * The script runs here unchanged, in a fresh Node `vm` context standing in
 * for Apps Script. Its one Apps Script service, `UrlFetchApp`, hands each
 * json-rpc request to the stand-in chain in `helpers/stand-in-chain.js`, so
 * the tests ask nothing outside the computer.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { standInChain, TOKEN, WALLET, TRANSACTION } from './helpers/stand-in-chain.js';

const SCRIPT_URL = new URL('../for-google-apps/check-token-balance/fetch-amount-of-token-transferred.gs', import.meta.url);

/**
 * Loads the Sheets script, unchanged, into a fresh `vm` context whose
 * `UrlFetchApp` answers from a stand-in chain where the transaction sends the
 * wallet `received` whole tokens. Returns the context, whose globals are the
 * script's functions. The script's console output is dropped.
 *
 * @param {bigint} received - Whole tokens the transaction sends the wallet
 * @returns {Object} The context holding the script's functions
 */
function loadScript(received) {
  const chain = standInChain(received);
  const context = vm.createContext({
    console: { log() {}, info() {} },
    UrlFetchApp: {
      fetch: (_url, options) => {
        const reply = chain.answer(JSON.parse(options.payload));
        return { getContentText: () => JSON.stringify(reply) };
      }
    }
  });
  vm.runInContext(fs.readFileSync(SCRIPT_URL, 'utf8'), context);
  return context;
}

describe('getTokenTransferred, the Sheets script', () => {
  it('gives the amount the transaction sent the wallet', () => {
    assert.equal(loadScript(250n).getTokenTransferred(TRANSACTION, TOKEN, WALLET), 250);
  });

  it('gives 0 when the transaction sent the wallet nothing', () => {
    assert.equal(loadScript(0n).getTokenTransferred(TRANSACTION, TOKEN, WALLET), 0);
  });
});
