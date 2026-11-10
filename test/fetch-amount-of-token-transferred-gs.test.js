/**
 * Tests for the Sheets script fetch-amount-of-token-transferred.gs, which
 * reads how much of a token one PulseChain transaction sent a wallet.
 * @module test/fetch-amount-of-token-transferred-gs.test
 *
 * The script runs here unchanged, under Node, through
 * `helpers/sheets-script.js`: its one Apps Script service, `UrlFetchApp`,
 * hands each json-rpc request to the stand-in chain in
 * `helpers/stand-in-chain.js`, so the tests ask nothing outside the
 * computer.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { standInChain, TOKEN, WALLET, TRANSACTION } from './helpers/stand-in-chain.js';
import { loadSheetsScript, TRANSFER_SHEETS_SCRIPT } from './helpers/sheets-script.js';

describe('getTokenTransferred, the Sheets script', () => {
  it('gives the amount the transaction sent the wallet', () => {
    const script = loadSheetsScript(TRANSFER_SHEETS_SCRIPT, standInChain(250n));
    assert.equal(script.getTokenTransferred(TRANSACTION, TOKEN, WALLET), 250);
  });

  it('gives 0 when the transaction sent the wallet nothing', () => {
    const script = loadSheetsScript(TRANSFER_SHEETS_SCRIPT, standInChain(0n));
    assert.equal(script.getTokenTransferred(TRANSACTION, TOKEN, WALLET), 0);
  });
});
