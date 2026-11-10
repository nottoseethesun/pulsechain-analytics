/**
 * Known bugs in the two copies of getTokenTransferred, as tests.
 * @module test/known-bugs.test
 *
 * Each test states what the code should do and is declared with `knownBug`
 * (`helpers/known-bug.js`): it passes while the code still does the wrong
 * thing, and fails once the code does the right thing. That failure is the
 * cue to declare the test with `it` instead, in the same change as the fix.
 * The item number is that of the list of known bugs in the repo's CLAUDE.md.
 *
 * Item 9: both copies, the Node script and the Sheets script, work out the
 * amount from the wallet's balance one block before the transaction and at
 * its block. So a failed read gives a wrong amount, or 0, and another
 * transfer in the same block is counted in. Reading the amount from the
 * transaction's own receipt is exact, and a failed read should give no
 * amount at all. In each case below the transaction sent the wallet 250
 * tokens.
 */

import { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { getTokenTransferred } from '../fetch-amount-of-token-transferred.js';
import { standInChain, TOKEN, WALLET, TRANSACTION } from './helpers/stand-in-chain.js';
import { loadSheetsScript, TRANSFER_SHEETS_SCRIPT } from './helpers/sheets-script.js';
import { useStandInChain, useEthersOwnHttp } from './helpers/ethers-stand-in.js';
import { knownBug } from './helpers/known-bug.js';

const RECEIVED = 250n;

/**
 * Asserts that a result is the amount the transaction sent, or no amount at
 * all: an error, or anything else that is not a number.
 *
 * @param {*} result - What getTokenTransferred gave, or the error it threw
 */
function assertRightAmountOrNone(result) {
  if (typeof result === 'number') assert.equal(result, Number(RECEIVED));
}

/**
 * Runs the Sheets script's getTokenTransferred against a stand-in chain.
 *
 * @param {Object} options - The case that goes wrong, as `standInChain` takes it
 * @returns {*} The result, or the error thrown
 */
function sheetsResult(options) {
  const script = loadSheetsScript(TRANSFER_SHEETS_SCRIPT, standInChain(RECEIVED, options));
  try {
    return script.getTokenTransferred(TRANSACTION, TOKEN, WALLET);
  } catch (error) {
    return error;
  }
}

/**
 * Runs the Node script's getTokenTransferred against a stand-in chain.
 *
 * @param {Object} options - The case that goes wrong, as `standInChain` takes it
 * @returns {Promise<*>} The result, or the error thrown
 */
async function nodeResult(options) {
  useStandInChain(standInChain(RECEIVED, options));
  try {
    return await getTokenTransferred(TRANSACTION, TOKEN, WALLET);
  } catch (error) {
    return error;
  }
}

describe('item 9: the amount comes from the transaction itself, and a failed read gives none', () => {
  describe('the Sheets script', () => {
    knownBug('a failed read of the receipt gives no wrong amount', () => {
      assertRightAmountOrNone(sheetsResult({ fail: 'receipt' }));
    });

    knownBug('a failed read of the decimals gives no wrong amount', () => {
      assertRightAmountOrNone(sheetsResult({ fail: 'decimals' }));
    });

    knownBug('a failed read of the balance before the block gives no wrong amount', () => {
      assertRightAmountOrNone(sheetsResult({ fail: 'before' }));
    });

    knownBug('another transfer in the same block is not counted', () => {
      assert.equal(sheetsResult({ otherInBlock: 100n }), Number(RECEIVED));
    });
  });

  describe('the Node script', () => {
    after(useEthersOwnHttp);

    knownBug('a failed read of the receipt gives no wrong amount', async () => {
      assertRightAmountOrNone(await nodeResult({ fail: 'receipt' }));
    });

    knownBug('a failed read of the decimals gives no wrong amount', async () => {
      assertRightAmountOrNone(await nodeResult({ fail: 'decimals' }));
    });

    knownBug('a failed read of the balance before the block gives no wrong amount', async () => {
      assertRightAmountOrNone(await nodeResult({ fail: 'before' }));
    });

    knownBug('another transfer in the same block is not counted', async () => {
      assert.equal(await nodeResult({ otherInBlock: 100n }), Number(RECEIVED));
    });
  });
});
