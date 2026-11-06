/**
 * Tests for fetch-amount-of-token-transferred.js, which reads how much of a
 * token one PulseChain transaction sent a wallet.
 * @module test/fetch-amount-of-token-transferred.test
 *
 * `getTokenTransferred` asks a PulseChain rpc endpoint, through ethers, for
 * the transaction's receipt and the wallet's token balance around its block.
 * The tests answer those requests from the stand-in chain in
 * `helpers/stand-in-chain.js`, through ethers' own hook for its http layer
 * (`FetchRequest.registerGetUrl`), so they ask nothing outside the computer.
 * The hook is put back to ethers' own http once the tests end.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { getTokenTransferred } from '../fetch-amount-of-token-transferred.js';
import { standInChain, TOKEN, WALLET, TRANSACTION } from './helpers/stand-in-chain.js';

/**
 * Routes every http request ethers makes to a stand-in chain whose
 * transaction sends the wallet `received` whole tokens. A batch of json-rpc
 * requests gets a batch of answers.
 *
 * @param {bigint} received - Whole tokens the transaction sends the wallet
 */
function useStandInChain(received) {
  const chain = standInChain(received);
  ethers.FetchRequest.registerGetUrl(async (request) => {
    const body = JSON.parse(Buffer.from(request.body).toString('utf8'));
    const reply = Array.isArray(body) ? body.map((one) => chain.answer(one)) : chain.answer(body);
    return {
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-type': 'application/json' },
      body: Buffer.from(JSON.stringify(reply))
    };
  });
}

describe('getTokenTransferred, the Node script', () => {
  after(() => {
    ethers.FetchRequest.registerGetUrl(ethers.FetchRequest.createGetUrlFunc());
  });

  it('gives the amount the transaction sent the wallet', async () => {
    useStandInChain(250n);
    assert.equal(await getTokenTransferred(TRANSACTION, TOKEN, WALLET), 250);
  });

  it('gives 0 when the transaction sent the wallet nothing', async () => {
    useStandInChain(0n);
    assert.equal(await getTokenTransferred(TRANSACTION, TOKEN, WALLET), 0);
  });
});
