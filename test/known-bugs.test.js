/**
 * Tests of the bugs known in the repo's code, each declared with
 * `knownBug` (`helpers/known-bug.js`), so it passes while the bug is there.
 * @module test/known-bugs.test
 *
 * A fix makes its test fail; the same change declares the test with `it`,
 * among the tests of the code it is about, and removes it from here.
 */

import { describe } from "node:test";
import assert from "node:assert/strict";
import { getAddress } from "ethers";
import { knownBug } from "./helpers/known-bug.js";
import { tokenFacts } from "../wallet-history/receipts.js";
import { pacedProvider } from "../wallet-history/paced-provider.js";

const TOKEN = getAddress(`0x${"ab".repeat(20)}`);

/**
 * A paced provider whose every call stops in the EVM with an error that is
 * no revert, as an endpoint answers it and ethers throws it: a
 * CALL_EXCEPTION with no revert data, the EVM's error as the endpoint's
 * message.
 *
 * @param {string} message - The EVM's error, as the endpoint gives it
 * @returns {object} The paced provider
 */
function evmErrorCalls(message) {
  const chain = {
    call: async () => {
      throw Object.assign(new Error("missing revert data"), {
        code: "CALL_EXCEPTION",
        data: null,
        info: { error: { code: -32000, message } },
      });
    },
  };
  return pacedProvider(chain, { spacingMs: 0 });
}

describe("wallet-history/receipts.js's tokenFacts", () => {
  knownBug(
    "takes an error of the EVM that is no revert, such as an invalid opcode, as the contract's refusal: the call ran, and the contract's code stopped it",
    async () => {
      for (const message of [
        "invalid opcode: INVALID",
        "invalid jump destination",
        "out of gas",
        "stack underflow (0 <=> 1)",
      ]) {
        let facts;
        await assert.doesNotReject(async () => {
          facts = await tokenFacts(evmErrorCalls(message), [TOKEN]);
        });
        assert.deepEqual(Object.fromEntries(facts), {
          [TOKEN]: { symbol: null, decimals: null },
        });
      }
    },
  );
});
