/**
 * How the balance checker writes a balance: with commas between the
 * integer part's thousands, or plain.
 * @module check-token-balance/format-balance
 *
 * The commas come from `BigInt`'s own formatting, which is exact however
 * large the number, rather than from a regular expression that matches in
 * time that grows with the length of the number.
 */

import { ethers } from "ethers";

/**
 * Formats a balance string with commas in the integer part.
 *
 * @param {bigint} balance - The balance as a BigInt.
 * @param {number} decimals - The number of decimal places for the token.
 * @returns {string} The formatted balance string with commas.
 */
export function formatBalanceWithCommas(balance, decimals) {
  const formatted = ethers.formatUnits(balance, decimals);
  const [integer, fraction = ""] = formatted.split(".");
  const integerWithCommas = BigInt(integer).toLocaleString("en-US");
  return fraction ? `${integerWithCommas}.${fraction}` : integerWithCommas;
}

/**
 * Formats a balance string without commas or separators except for decimal point.
 * Removes trailing .0 for whole numbers.
 *
 * @param {bigint} balance - The balance as a BigInt.
 * @param {number} decimals - The number of decimal places for the token.
 * @returns {string} The plain formatted balance string.
 */
export function formatBalancePlain(balance, decimals) {
  let formatted = ethers.formatUnits(balance, decimals);
  // Remove trailing .0 if present
  if (formatted.endsWith(".0")) {
    formatted = formatted.slice(0, -2);
  }
  return formatted;
}
