/**
 * The cases both copies of getTokenTransferred are tested on: the Node
 * script and the Sheets script.
 * @module test/helpers/transfer-cases
 *
 * Each case builds a stand-in chain (`stand-in-chain.js`) and says what
 * getTokenTransferred should give: an `amount`, or an `error` whose message
 * matches a pattern; a case may name a `token` or a `wallet` of its own in
 * place of the chain's. Both test files run every case, so the two copies are
 * held to the same answers. The cases with another transfer in the block,
 * or a failed balance read, guard the method itself: a copy that worked
 * the amount out from the wallet's balance around the block, rather than
 * from the transaction's receipt, would get them wrong.
 */

import {
  OTHER_TOKEN,
  OTHER_WALLET,
  standInChain,
  TOKEN,
  WALLET,
} from "./stand-in-chain.js";

/** The cases, each with the chain it runs on and what it should give. */
export const TRANSFER_CASES = [
  {
    name: "gives the amount the transaction sent the wallet",
    chain: () => standInChain(250n),
    amount: 250,
  },
  {
    name: "gives 0 when the transaction sent the wallet nothing",
    chain: () => standInChain(0n),
    amount: 0,
  },
  {
    name: "adds up two transfers to the wallet in the transaction",
    chain: () => standInChain(250n, { extraTransfers: [{ amount: 50n }] }),
    amount: 300,
  },
  {
    name: "counts no transfer of another token",
    chain: () =>
      standInChain(250n, {
        extraTransfers: [{ token: OTHER_TOKEN, amount: 50n }],
      }),
    amount: 250,
  },
  {
    name: "counts no transfer to another address",
    chain: () =>
      standInChain(250n, {
        extraTransfers: [{ to: OTHER_WALLET, amount: 50n }],
      }),
    amount: 250,
  },
  {
    name: "counts no NFT's Transfer from the token's address",
    chain: () =>
      standInChain(250n, { extraTransfers: [{ nft: true, amount: 7n }] }),
    amount: 250,
  },
  {
    name: "counts no transfer from another transaction in the same block",
    chain: () => standInChain(250n, { otherInBlock: 100n }),
    amount: 250,
  },
  {
    name: "reads no balance, so a balance the endpoint fails to give changes nothing",
    chain: () => standInChain(250n, { fail: "before" }),
    amount: 250,
  },
  {
    name: "gives an error, not a number, when the receipt cannot be read",
    chain: () => standInChain(250n, { fail: "receipt" }),
    error: /Cannot read the receipt of 0x/,
  },
  {
    name: "gives an error, not a number, when the token's decimals cannot be read",
    chain: () => standInChain(250n, { fail: "decimals" }),
    error: /Cannot read the decimals of 0x/,
  },
  {
    name: "gives an error when the endpoint does not know the transaction",
    chain: () => standInChain(250n, { fail: "no-receipt" }),
    error: /not found; it may still be pending/,
  },
  {
    name: "gives an error, not 0, when the wallet is not 0x and 40 hex digits",
    chain: () => standInChain(250n),
    wallet: WALLET.slice(0, -1),
    error:
      /The wallet 0x[0-9a-fA-F]{39} is not an address: 0x and 40 hex digits/,
  },
  {
    name: "gives an error, not 0, when the token is not 0x and 40 hex digits",
    chain: () => standInChain(250n),
    token: TOKEN.slice(0, -1),
    error:
      /The token 0x[0-9a-fA-F]{39} is not an address: 0x and 40 hex digits/,
  },
];
