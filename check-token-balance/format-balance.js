/**
 * How the balance checker writes a balance: with commas between the
 * integer part's thousands, or plain.
 * @module check-token-balance/format-balance
 *
 * The digits come from `decimalFromRaw`, of the Summ csv utility of
 * crypto-price-fetchers, the owner's repo of code his projects share: it
 * cuts the balance's digits at the token's decimals, any from 0 to 255, as
 * a token's uint8 holds them, so no digit passes through a JavaScript
 * number. The commas come from `BigInt`'s own formatting, which is exact
 * however large the number, rather than from a regular expression that
 * matches in time that grows with the length of the number.
 */

import { decimalFromRaw } from "crypto-price-fetchers/summ-csv";

/**
 * Formats a balance with commas in the integer part. A whole balance of a
 * token with decimals ends in `.0`, such as `1,000.0`; that of a token
 * without decimals has no point, such as `12,345`.
 *
 * @param {bigint} balance - The balance, in the token's smallest unit
 * @param {number|bigint} decimals - The token's decimals, from 0 to 255
 * @returns {string} The balance, with commas
 */
export function formatBalanceWithCommas(balance, decimals) {
  const places = Number(decimals);
  const [integer, fraction = ""] = decimalFromRaw(balance, places).split(".");
  const integerWithCommas = BigInt(integer).toLocaleString("en-US");
  if (fraction !== "") return `${integerWithCommas}.${fraction}`;
  return places > 0 ? `${integerWithCommas}.0` : integerWithCommas;
}

/**
 * Formats a balance with no separator but the decimal point, and no point
 * for a whole balance.
 *
 * @param {bigint} balance - The balance, in the token's smallest unit
 * @param {number|bigint} decimals - The token's decimals, from 0 to 255
 * @returns {string} The balance, plain
 */
export function formatBalancePlain(balance, decimals) {
  return decimalFromRaw(balance, Number(decimals));
}
