/**
 * Tests for fetch-amount-of-token-transferred.js, which reads how much of a
 * token one PulseChain transaction sent a wallet.
 * @module test/fetch-amount-of-token-transferred.test
 *
 * `getTokenTransferred` asks a PulseChain rpc endpoint, through ethers, for
 * the transaction's receipt and the token's decimals. The tests answer
 * those requests from the stand-in chain in `helpers/stand-in-chain.js`,
 * routed there by `helpers/ethers-stand-in.js`, so they ask nothing outside
 * the computer. ethers' own http is put back once the tests end. The cases
 * are the ones the Sheets script is held to too (`helpers/transfer-cases.js`).
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { getTokenTransferred } from '../fetch-amount-of-token-transferred.js';
import { TOKEN, WALLET, TRANSACTION, standInChain } from './helpers/stand-in-chain.js';
import { TRANSFER_CASES } from './helpers/transfer-cases.js';
import { useStandInChain, useEthersOwnHttp } from './helpers/ethers-stand-in.js';

describe('getTokenTransferred, the Node script', () => {
  after(useEthersOwnHttp);

  for (const { name, chain, amount, error } of TRANSFER_CASES) {
    it(name, async () => {
      useStandInChain(chain());
      if (error === undefined) {
        assert.equal(await getTokenTransferred(TRANSACTION, TOKEN, WALLET), amount);
      } else {
        await assert.rejects(getTokenTransferred(TRANSACTION, TOKEN, WALLET), error);
      }
    });
  }

  it('takes the addresses in any case', async () => {
    useStandInChain(standInChain(250n));
    assert.equal(await getTokenTransferred(TRANSACTION, TOKEN.toLowerCase(), WALLET.toUpperCase().replace('0X', '0x')), 250);
  });
});
