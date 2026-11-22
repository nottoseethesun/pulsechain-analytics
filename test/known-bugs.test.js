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
  formatBalancePlain,
  formatBalanceWithCommas,
} from "../check-token-balance/format-balance.js";
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

describe("getTokenTransferred, the Node script", () => {
  knownBug(
    "gives the amount of a token whose decimals are above 80, as the Sheets copy does",
    async () => {
      useStandInChain(standInChain(10n ** 59n, { decimals: 81 }));
      let amount;
      await assert.doesNotReject(async () => {
        amount = await getTokenTransferred(TRANSACTION, TOKEN, WALLET);
      });
      assert.equal(amount, 0.0001);
    },
  );

  knownBug(
    "takes a token and a wallet written with spaces around them, as the Sheets copy does",
    async () => {
      useStandInChain(standInChain(250n));
      let amount;
      await assert.doesNotReject(async () => {
        amount = await getTokenTransferred(
          TRANSACTION,
          ` ${TOKEN} `,
          ` ${WALLET}\t`,
        );
      });
      assert.equal(amount, 250);
    },
  );
});

describe("the balance checker's formatting", () => {
  knownBug(
    "writes a balance of a token whose decimals are above 80, up to 255, as a uint8 holds them",
    () => {
      let withCommas;
      let plain;
      assert.doesNotThrow(() => {
        withCommas = formatBalanceWithCommas(5n, 100);
        plain = formatBalancePlain(5n, 255);
      });
      assert.equal(withCommas, `0.${"0".repeat(99)}5`);
      assert.equal(plain, `0.${"0".repeat(254)}5`);
    },
  );
});
