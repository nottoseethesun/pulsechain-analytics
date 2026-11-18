/**
 * Tests for `check-token-balance/format-balance.js`, how the balance
 * checker writes a balance.
 * @module test/format-balance.test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatBalancePlain,
  formatBalanceWithCommas,
} from "../check-token-balance/format-balance.js";

/** One whole token of 18 decimals. */
const WHOLE = 10n ** 18n;

describe("formatBalanceWithCommas", () => {
  it("puts commas between the integer part's thousands, keeping the fraction", () => {
    assert.equal(formatBalanceWithCommas(0n, 18), "0.0");
    assert.equal(formatBalanceWithCommas(999n * WHOLE, 18), "999.0");
    assert.equal(formatBalanceWithCommas(1000n * WHOLE, 18), "1,000.0");
    assert.equal(
      formatBalanceWithCommas(1234567n * WHOLE + WHOLE / 4n, 18),
      "1,234,567.25",
    );
  });

  it("keeps every digit of a balance too large for a number", () => {
    assert.equal(
      formatBalanceWithCommas(1234567890123456789012345678901234567890n, 18),
      "1,234,567,890,123,456,789,012.34567890123456789",
    );
  });

  it("formats a token of no decimals, which has no fraction", () => {
    assert.equal(formatBalanceWithCommas(12345n, 0), "12,345");
  });
});

describe("formatBalancePlain", () => {
  it("drops a whole number's .0 and keeps any other fraction", () => {
    assert.equal(formatBalancePlain(1234567n * WHOLE, 18), "1234567");
    assert.equal(formatBalancePlain(WHOLE / 2n, 18), "0.5");
  });
});
