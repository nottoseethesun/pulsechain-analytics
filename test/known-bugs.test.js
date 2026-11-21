/**
 * The known bugs, each declared with `knownBug`, which passes while its bug
 * is present. The fix of a bug makes its test fail; the same change
 * declares the test with `it` instead, among the tests of the code it is
 * about.
 * @module test/known-bugs.test
 *
 * The ratio chart's DexTools client asks a stand-in DexTools served on this
 * computer that takes each request and answers none.
 */

import { describe } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { getCurrentUsdPriceDexTools } from "../chart-price-ratio/dextools.js";
import { knownBug } from "./helpers/known-bug.js";

/** HEX's contract address on PulseChain. */
const HEX = "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39";

describe("known bugs of the ratio chart", () => {
  knownBug(
    "gives up on DexTools when it gives no answer within the time limit",
    async () => {
      const server = http.createServer(() => {});
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      try {
        const asked = getCurrentUsdPriceDexTools(
          {
            host: `http://127.0.0.1:${server.address().port}`,
            subscription: "standard",
            version: "v2",
            chain: "pulse",
            timeoutMs: 300,
          },
          "stand-in-dextools-key",
          HEX,
        ).then(
          () => "a price",
          (error) => error,
        );
        const stalled = new Promise((resolve) => {
          setTimeout(
            () => resolve("still waiting after 5 seconds"),
            5000,
          ).unref();
        });
        const outcome = await Promise.race([asked, stalled]);
        assert.ok(outcome instanceof Error, String(outcome));
        assert.match(
          outcome.message,
          /DexTools gave no answer within 0\.3 seconds/,
        );
      } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    },
  );
});
