/**
 * The rows the Summ sweep hands to crypto-price-fetchers' Summ csv
 * utility.
 * @module summ-sweep/rows
 *
 * What: every row the sweep writes stands for one leg, or one part of a
 * leg, of a PulseChain transaction: one token, in or out, with the
 * transaction's hash as its id and the token's contract in its last
 * column, as the owner's rules for his files ask. `legRow` builds such a
 * row, and `withGas` puts a transaction's gas on it. `PLS_DECIMALS` is the
 * decimals of PulseChain's own coin, in which gas is paid.
 *
 * How: amounts stay whole numbers of the token's smallest units, with the
 * token's decimals beside them, and times stay seconds since 1970: the
 * utility writes both as text, so no amount is rounded on the way.
 *
 * Fit: `summ-sweep/splits.js` builds the income rows of the fees to fix in
 * Summ with it, and `summ-sweep/gap-rules.js` and `summ-sweep/gaps.js` the
 * rows of the gaps.
 */

/** The blockchain the rows name, as Summ and the csv utility name it. */
export const BLOCKCHAIN = "pulsechain";

/** The decimals of PLS, PulseChain's own coin: amounts count in wei. */
export const PLS_DECIMALS = 18;

/** The symbol of PLS, which has no contract. */
export const PLS = "PLS";

/**
 * A row for a leg, or a part of one.
 *
 * @param {object} leg - The leg: `timestamp`, `hash`, `token` and
 *   `decimals`
 * @param {object} fields - The row's own values
 * @param {string} fields.type - Its Summ type, such as `income`
 * @param {string} fields.symbol - Its token's symbol in the csv
 * @param {bigint} fields.amount - Its amount, in the token's smallest
 *   units
 * @param {string} fields.from - Its sender
 * @param {string} fields.to - Its receiver
 * @param {string} fields.description - What it is, and why
 * @returns {object} The row, as the Summ csv utility takes it
 */
export function legRow(leg, { type, symbol, amount, from, to, description }) {
  return {
    timestamp: leg.timestamp,
    type,
    baseCurrency: symbol,
    baseAmount: { raw: amount, decimals: leg.decimals },
    from,
    to,
    blockchain: BLOCKCHAIN,
    id: leg.hash,
    description,
    contractAddress: leg.token,
  };
}

/**
 * A row with a transaction's gas on it.
 *
 * @param {object} row - The row
 * @param {bigint} gasPaid - The gas, in wei
 * @param {string} note - What to add to its description
 * @returns {object} The row, with its fee columns filled
 */
export function withGas(row, gasPaid, note) {
  return {
    ...row,
    feeCurrency: PLS,
    feeAmount: { raw: gasPaid, decimals: PLS_DECIMALS },
    description: `${row.description} ${note}`,
  };
}
