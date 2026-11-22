/**
 * Tests of the bugs known in the repo's code, each declared with
 * `knownBug` (`helpers/known-bug.js`), so it passes while the bug is there.
 * @module test/known-bugs.test
 *
 * A fix makes its test fail; the same change declares the test with `it`,
 * among the tests of the code it is about, and removes it from here.
 */

import { after, describe } from "node:test";
import assert from "node:assert/strict";
import { knownBug } from "./helpers/known-bug.js";
import { getTokenTransferred } from "../fetch-amount-of-token-transferred.js";
import {
  standInChain,
  TOKEN,
  TRANSACTION,
  WALLET,
} from "./helpers/stand-in-chain.js";
import {
  useEthersOwnHttp,
  useStandInChain,
} from "./helpers/ethers-stand-in.js";

after(useEthersOwnHttp);

/** The token's address in a mixed case that is not its EIP-55 checksum. */
const TOKEN_IN_WRONG_CASE = `0x8A${TOKEN.slice(4)}`;

describe("getTokenTransferred, the Node script", () => {
  knownBug(
    "takes a token written in a mixed case that is not its checksum, as the Sheets copy does",
    async () => {
      useStandInChain(standInChain(250n));
      let amount;
      await assert.doesNotReject(async () => {
        amount = await getTokenTransferred(
          TRANSACTION,
          TOKEN_IN_WRONG_CASE,
          WALLET,
        );
      });
      assert.equal(amount, 250);
    },
  );

  knownBug(
    "takes a transaction hash written with spaces around it, as the Sheets copy does",
    async () => {
      useStandInChain(standInChain(250n));
      let amount;
      await assert.doesNotReject(async () => {
        amount = await getTokenTransferred(` ${TRANSACTION}\t`, TOKEN, WALLET);
      });
      assert.equal(amount, 250);
    },
  );
});
