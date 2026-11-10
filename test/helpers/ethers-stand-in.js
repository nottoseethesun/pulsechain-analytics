/**
 * Routes ethers' http requests to a stand-in chain, for tests.
 * @module test/helpers/ethers-stand-in
 *
 * ethers sends every rpc request through one http function, which it lets a
 * program replace with `FetchRequest.registerGetUrl`. `useStandInChain` puts
 * in a function that hands each json-rpc request, or batch of requests, to a
 * stand-in chain (`stand-in-chain.js`), so code that builds its own ethers
 * provider asks nothing outside the computer. `useEthersOwnHttp` puts ethers'
 * own http function back; a test file calls it once its tests end.
 */

import { ethers } from 'ethers';

/**
 * Sends every http request ethers makes to a stand-in chain.
 *
 * @param {{answer: function(Object): Object}} chain - The stand-in chain
 */
export function useStandInChain(chain) {
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

/** Puts ethers' own http function back. */
export function useEthersOwnHttp() {
  ethers.FetchRequest.registerGetUrl(ethers.FetchRequest.createGetUrlFunc());
}
