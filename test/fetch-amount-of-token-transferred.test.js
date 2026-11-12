/**
 * Tests for fetch-amount-of-token-transferred.js, which reads how much of a
 * token one PulseChain transaction sent a wallet.
 * @module test/fetch-amount-of-token-transferred.test
 *
 * `getTokenTransferred` asks a PulseChain rpc endpoint, through ethers, for
 * the transaction's receipt and the wallet's token balance around its block.
 * The tests answer those requests from the stand-in chain in
 * `helpers/stand-in-chain.js`, routed there by `helpers/ethers-stand-in.js`,
 * so they ask nothing outside the computer. ethers' own http is put back
 * once the tests end.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { getTokenTransferred } from '../fetch-amount-of-token-transferred.js';
import { standInChain, TOKEN, WALLET, TRANSACTION } from './helpers/stand-in-chain.js';
import { useStandInChain, useEthersOwnHttp } from './helpers/ethers-stand-in.js';

describe('getTokenTransferred, the Node script', () => {
  after(useEthersOwnHttp);

  it('gives the amount the transaction sent the wallet', async () => {
    useStandInChain(standInChain(250n));
    assert.equal(await getTokenTransferred(TRANSACTION, TOKEN, WALLET), 250);
  });

  it('gives 0 when the transaction sent the wallet nothing', async () => {
    useStandInChain(standInChain(0n));
    assert.equal(await getTokenTransferred(TRANSACTION, TOKEN, WALLET), 0);
  });
});
