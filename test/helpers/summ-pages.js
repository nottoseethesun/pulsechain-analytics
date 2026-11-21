/**
 * Pages of Summ's results, as Claude's Summ connector writes them, for the
 * tests of `summ-sweep/`.
 * @module test/helpers/summ-pages
 *
 * A test describes Summ's rows, and `summPage` writes them as one page of
 * the connector's answer to a query of a wallet's transactions: the line
 * giving the page's number and counts, then a block per row with one
 * `- **Field**: value` line per field, as `summ-sweep/summ-results.js`
 * reads them. The wallets in a test are made up.
 */

/**
 * A side of a row, as the connector writes it.
 *
 * @param {{name: string, address: string}} side - The account
 * @returns {string} The side's text
 */
function sideText(side) {
  return `${side.name} (PulseChain) (pulsechain) | rawAddress: ${side.address}`;
}

/**
 * An amounts line's text, with a made-up value in USD after it.
 *
 * @param {Array<{amount: string, symbol: string}>} items - The amounts
 * @returns {string} The text
 */
function amountsText(items) {
  return `${items.map((item) => `${item.amount} ${item.symbol}`).join(", ")} (1.23)`;
}

/**
 * One row's block.
 *
 * @param {object} row - The row: `category`, `hash`, `date` (ISO),
 *   `from`, `to`, `incoming`, `outgoing`, and optionally `actionId` and
 *   `transactionIds`
 * @param {number} place - Its place on the page
 * @returns {string} The block
 */
function rowBlock(row, place) {
  const lines = [
    `## ${place}. ${row.category}`,
    `- **Action ID**: \`${row.actionId ?? "a".repeat(24)}\``,
    `- **Transaction IDs**: ${(row.transactionIds ?? ["b".repeat(24)]).map((id) => `\`${id}\``).join(", ")}`,
    `- **Tx Hash**: \`${row.hash}\``,
    `- **Date**: ${row.date}`,
    `- **Action Category**: ${row.category}`,
    `- **Transaction Type**: ${row.category}`,
    `- **From**: ${sideText(row.from)}`,
    `- **To**: ${sideText(row.to)}`,
  ];
  if ((row.incoming ?? []).length > 0)
    lines.push(`- **Incoming**: ${amountsText(row.incoming)}`);
  if ((row.outgoing ?? []).length > 0)
    lines.push(`- **Outgoing**: ${amountsText(row.outgoing)}`);
  lines.push("- **Gain/Loss**: 0.00");
  return lines.join("\n");
}

/**
 * One page of Summ's results.
 *
 * @param {object} page - The page
 * @param {number} page.page - Its number
 * @param {number} page.pages - How many pages there are
 * @param {object[]} page.rows - Its rows
 * @param {number} [page.returned] - How many rows its first line says it
 *   returned; by default, as many as it holds
 * @returns {string} The page's text
 */
export function summPage({ page, pages, rows, returned = rows.length }) {
  return [
    `# Transactions (Page ${page} of ${pages}, ${returned} returned, ${returned} total)`,
    "",
    "_Action IDs change after each report refresh; Transaction IDs do not._",
    "",
    ...rows.map((row, at) => rowBlock(row, at + 1)),
    "",
  ].join("\n\n");
}
