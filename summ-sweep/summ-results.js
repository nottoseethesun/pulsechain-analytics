/**
 * Summ's transactions for a wallet, read from the results of Claude's Summ
 * connector, which Claude saves as files.
 * @module summ-sweep/summ-results
 *
 * What: a program cannot ask Summ itself: the owner's Summ account is
 * reached through Claude's Summ connector, whose query of a wallet's
 * transactions answers in pages of text. Claude saves those pages as
 * files, and `parseSummResults` reads them into rows: each row is one of
 * Summ's actions, with its ids, the transaction's hash, its time, its
 * category, its two sides (each a name and an address, in EIP-55's mixed
 * case), and the amounts of each currency that came in and went out, as
 * Summ prints them.
 *
 * How: a page starts with a line giving its number, how many rows it
 * returned and how many there are in all, then a block per row, headed
 * `## <n>. <category>`, with one `- **Field**: value` line per field. An
 * amounts line lists `<amount> <symbol>` items, joined by `, `, and ends
 * with their value in USD in parentheses, which is dropped. A saved file
 * holds the page's text, or the connector's answer as JSON, a list of
 * parts whose `text` fields hold it. Every page from 1 to the last must be
 * given, each must hold the rows its first line says it returned, every
 * page must name the same number of pages and the same total, and the
 * rows of all the pages must add up to that total. Pages saved while
 * Summ's rows changed between them disagree on one of these, so a sweep
 * never compares the chain with part of Summ's rows.
 *
 * Fit: `summ-sweep/` matches each leg the chain shows against these rows
 * (`summ-sweep/match.js`), and reads their transaction ids when a leg Summ
 * holds is to be edited.
 */

import { getAddress } from "ethers";

/** The first line of a page. */
const PAGE_LINE =
  /^# Transactions \(Page (\d+) of (\d+), (\d+) returned, (\d+) total\)/m;

/** The head of a row's block. */
const ROW_HEAD = /^## (\d+)\. (.*)$/;

/** A field's line in a row's block. */
const FIELD_LINE = /^- \*\*([^*]+)\*\*: ?(.*)$/;

/** An address in a side's text, after `rawAddress: `. */
const RAW_ADDRESS = /rawAddress: (0x[0-9a-fA-F]{40})/;

/**
 * The text of a saved page: the file's text, or, when the file holds the
 * connector's answer as JSON, the `text` of each of its parts.
 *
 * @param {string} saved - The file's text
 * @returns {string} The page's text
 */
function pageText(saved) {
  if (!saved.trimStart().startsWith("[")) return saved;
  return JSON.parse(saved)
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("");
}

/**
 * The amounts of an amounts line, without their value in USD.
 *
 * @param {string} text - Such as `40.28 HEX, 458241.3 HEX (332.27)`
 * @returns {Array<{amount: string, symbol: string}>} Each amount, as Summ
 *   prints it, with its currency's symbol
 */
export function amountsOf(text) {
  const withoutValue = text.replace(/\s*\([-0-9.,]+\)\s*$/, "");
  return withoutValue
    .split(", ")
    .map((item) => item.trim())
    .filter((item) => item !== "")
    .map((item) => {
      const space = item.indexOf(" ");
      return { amount: item.slice(0, space), symbol: item.slice(space + 1) };
    });
}

/**
 * A side of a row: Summ's name for the account, and its address.
 *
 * @param {string} text - The side's text, such as
 *   `First Wallet (PulseChain) (pulsechain) | rawAddress: 0x…`
 * @returns {{name: string, address: (string|null)}} The side; `null` when
 *   Summ gives no address
 */
function sideOf(text) {
  const address = RAW_ADDRESS.exec(text);
  return {
    name: text.split(" | ")[0].trim(),
    address: address === null ? null : getAddress(address[1]),
  };
}

/** How each field's text is read into a row. */
const FIELDS = Object.freeze({
  "Action ID": (row, text) => {
    row.actionId = text.replaceAll("`", "");
  },
  "Transaction IDs": (row, text) => {
    row.transactionIds = [...text.matchAll(/`([0-9a-f]{24})`/g)].map(
      (found) => found[1],
    );
  },
  "Tx Hash": (row, text) => {
    row.hash = text.replaceAll("`", "").toLowerCase();
  },
  Date: (row, text) => {
    row.timestamp = Date.parse(text) / 1000;
  },
  "Action Category": (row, text) => {
    row.category = text;
  },
  "Transaction Type": (row, text) => {
    row.type = text;
  },
  From: (row, text) => {
    row.from = sideOf(text);
  },
  To: (row, text) => {
    row.to = sideOf(text);
  },
  Incoming: (row, text) => {
    row.incoming = amountsOf(text);
  },
  Outgoing: (row, text) => {
    row.outgoing = amountsOf(text);
  },
});

/**
 * One row, from its block of lines.
 *
 * @param {string} block - The row's block, its head first
 * @param {number} page - The page it is on
 * @returns {object} The row
 */
function rowOf(block, page) {
  const lines = block.split("\n");
  const head = ROW_HEAD.exec(lines[0]);
  const row = {
    page,
    place: Number(head[1]),
    heading: head[2].trim(),
    from: { name: "", address: null },
    to: { name: "", address: null },
    incoming: [],
    outgoing: [],
  };
  for (const line of lines.slice(1)) {
    const field = FIELD_LINE.exec(line);
    if (field !== null && Object.hasOwn(FIELDS, field[1]))
      FIELDS[field[1]](row, field[2].trim());
  }
  return row;
}

/**
 * Summ's rows, from the saved pages of a query of a wallet's
 * transactions.
 *
 * @param {string[]} savedPages - The text of each saved file, in any order
 * @returns {object[]} The rows, page by page in order, each with
 *   `actionId`, `transactionIds`, `hash`, `timestamp` (seconds since 1970),
 *   `category`, `type`, `heading`, `from` and `to` (`name`, `address`),
 *   and `incoming` and `outgoing` (`amount`, `symbol`)
 * @throws {Error} When a file is no page of Summ's results, a page is
 *   given twice or missing or past the last, a page holds fewer or more
 *   rows than its first line says, two pages name a different number of
 *   pages or a different total, or the rows of all the pages fall short
 *   of the total or pass it
 */
export function parseSummResults(savedPages) {
  const pages = new Map();
  let named = null;
  for (const saved of savedPages) {
    const text = pageText(saved);
    const first = PAGE_LINE.exec(text);
    if (first === null)
      throw new Error("A file given is not a page of Summ's transactions");
    const page = Number(first[1]);
    if (pages.has(page)) throw new Error(`Page ${page} is given twice`);
    const rows = text
      .split(/\n(?=## \d+\. )/)
      .filter((block) => ROW_HEAD.test(block.split("\n")[0]))
      .map((block) => rowOf(block, page));
    if (rows.length !== Number(first[3]))
      throw new Error(
        `Page ${page} holds ${rows.length} rows, but says it returned ${first[3]}`,
      );
    const counts = { page, pages: Number(first[2]), total: Number(first[4]) };
    named ??= counts;
    if (counts.pages !== named.pages)
      throw new Error(
        `Page ${page} says Summ's results run to ${counts.pages} pages, but page ${named.page} says ${named.pages}`,
      );
    if (counts.total !== named.total)
      throw new Error(
        `Page ${page} says Summ holds ${counts.total} in total, but page ${named.page} says ${named.total}`,
      );
    if (page > counts.pages)
      throw new Error(
        `Page ${page} is past the ${counts.pages} pages it names`,
      );
    pages.set(page, rows);
  }
  const lastPage = named?.pages ?? 0;
  for (let page = 1; page <= lastPage; page += 1)
    if (!pages.has(page))
      throw new Error(`Page ${page} of Summ's ${lastPage} pages is missing`);
  const all = [...pages.keys()]
    .sort((a, b) => a - b)
    .flatMap((page) => pages.get(page));
  if (named !== null && all.length !== named.total)
    throw new Error(
      `The pages hold ${all.length} rows, but say Summ holds ${named.total} in total`,
    );
  return all;
}
