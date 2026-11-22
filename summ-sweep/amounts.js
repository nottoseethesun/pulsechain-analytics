/**
 * Whether an amount the chain holds is the amount Summ prints for it.
 * @module summ-sweep/amounts
 *
 * What: the chain holds a token amount exactly, as a whole number of the
 * token's smallest units. Summ keeps amounts as JavaScript numbers, which
 * hold about 16 significant digits, and prints a figure in one of two
 * forms: the amount as a JavaScript number, as `12345.67890123`, or the
 * amount rounded to 10 significant digits, keeping every digit of its
 * whole part, as `1234.567891` for 1234.56789087 and `12345678902` for
 * 12345678901.513. A step is the gap between a JavaScript number and the
 * next one up. Turning text or a whole number into a JavaScript number,
 * or dividing one, moves it by up to half a step, and Summ's figures are
 * at most one step from the amount they stand for: two such moves, or
 * the one step seen on rounded figures, as `8117927.374000001` for
 * 8117927.374. The chain's amount moves up to half a step more when it
 * is turned into a JavaScript number here. So a leg matches a figure
 * that is within two steps of the chain's amount, or of the chain's
 * amount rounded as Summ rounds.
 *
 * How: the rounding is done on whole numbers: the amount's digits after
 * its tenth are dropped, half up, but never a digit of its whole part.
 * Each of the two amounts is written as decimal text and turned into a
 * JavaScript number, and compared with the figure, with the step read
 * from the larger number's exponent.
 *
 * Fit: `summ-sweep/match.js` matches each leg to Summ's legs with
 * `summHolds`; `decimalText` writes an amount in a description.
 */

import { decimalFromRaw } from "crypto-price-fetchers/summ-csv";

/** The significant digits Summ rounds a figure to, when it rounds one. */
const SUMM_DIGITS = 10;

/**
 * An amount as decimal text, without a fraction of zero, written by the
 * Summ csv utility's `decimalFromRaw`, as a csv row's amounts are: it
 * takes decimals from 0 to 255, as many as a token's uint8 holds.
 *
 * @param {bigint} raw - The amount, in the token's smallest units
 * @param {number} decimals - The token's decimals
 * @returns {string} Such as `12345.67890123`, or `5` for five whole tokens
 */
export function decimalText(raw, decimals) {
  return decimalFromRaw(raw, decimals);
}

/**
 * The step between a JavaScript number and the next one up, at the size
 * of a number of zero or more.
 *
 * @param {number} number - The number
 * @returns {number} The step
 */
function stepAt(number) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, number);
  const exponent = ((view.getUint16(0) & 0x7ff0) >> 4) - 1023;
  return 2 ** (exponent - 52);
}

/**
 * An amount rounded as Summ rounds a figure: to 10 significant digits,
 * half up, keeping every digit of its whole part.
 *
 * @param {bigint} raw - The amount, in the token's smallest units
 * @param {number} decimals - The token's decimals
 * @returns {bigint} The rounded amount, in the same units
 */
function roundedLikeSumm(raw, decimals) {
  const digitsPastTenth = raw.toString().length - SUMM_DIGITS;
  const dropped = Math.min(Math.max(digitsPastTenth, 0), decimals);
  if (dropped === 0) return raw;
  const unit = 10n ** BigInt(dropped);
  return ((raw + unit / 2n) / unit) * unit;
}

/**
 * Whether two numbers are no more than two steps apart, at the larger
 * one's size.
 *
 * @param {number} first - One number
 * @param {number} second - The other
 * @returns {boolean} Whether they are
 */
function withinTwoSteps(first, second) {
  const larger = Math.max(Math.abs(first), Math.abs(second));
  return Math.abs(first - second) <= 2 * stepAt(larger);
}

/**
 * Whether Summ's printed figure is the chain's amount, in either of the
 * forms Summ prints.
 *
 * @param {bigint} raw - The chain's amount, in the token's smallest units
 * @param {number|null} decimals - The token's decimals; `null` when its
 *   contract gave none, so no figure can be read against the amount
 * @param {string} printed - Summ's figure, such as `1234.567891`
 * @returns {boolean} Whether they match
 */
export function summHolds(raw, decimals, printed) {
  const summNumber = Number(printed);
  if (decimals === null) return false;
  if (printed.trim() === "" || !Number.isFinite(summNumber)) return false;
  return [raw, roundedLikeSumm(raw, decimals)].some((amount) =>
    withinTwoSteps(summNumber, Number(decimalText(amount, decimals))),
  );
}
