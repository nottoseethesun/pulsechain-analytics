/**
 * The rows for what Summ lacks of a wallet's history, and the questions
 * for what no rule settles.
 * @module summ-sweep/gaps
 *
 * What: after the match, what Summ lacks is the legs and parts left
 * over, and the transactions the wallet sent that Summ holds nothing of
 * and that moved no token. `rowsForGaps` books the legs by the rules of
 * `summ-sweep/gap-rules.js`, and adds what the owner's skill for missing
 * transactions asks of the rows:
 *
 * - A row's description says how much of its transaction Summ holds:
 *   nothing (bucket B), or only its gas, as an approval, or any other
 *   part (bucket A).
 * - The gas of a transaction the wallet sent and Summ holds nothing of
 *   goes on its first row, and on no other, so Summ counts it once.
 * - A transaction the wallet sent, that Summ holds nothing of, and that
 *   moved no token and no PLS, is a Fee row of its gas: one that failed,
 *   or one such as an approval. One that moved PLS is a question, since
 *   the sweep writes no rows of PLS.
 * - A transaction later than the time the run is given as reached by
 *   Summ's sync of the wallet is one that sync has not read yet. Its rows
 *   say so and carry no gas, which that sync brings; one with no token
 *   legs gets no Fee row. The time is the owner's or Claude's to give,
 *   from Summ: Summ's own rows do not show it.
 *
 * How: the legs are taken transaction by transaction, and each
 * transaction's rows in the order of their logs, so its first row is the
 * one its gas goes on.
 *
 * Fit: `summ-sweep/sweep.js` runs it on the legs and parts the match left
 * over, and writes its rows to the csv with the income rows of the fixes.
 */

import { getAddress } from "ethers";
import { sameAddress } from "../wallet-history/sent.js";
import { decimalText } from "./amounts.js";
import { transactionGaps } from "./gap-rules.js";
import { groupBy } from "./group-by.js";
import { BLOCKCHAIN, PLS, PLS_DECIMALS, withGas } from "./rows.js";
import { timeText } from "./times.js";

/**
 * How much of a transaction Summ holds, as a row's description says it.
 *
 * @param {string[]|undefined} categories - The categories of Summ's rows
 *   of it; `undefined` when Summ holds none
 * @returns {string} The text
 */
function holdText(categories) {
  if (categories === undefined)
    return "Bucket B: Summ holds nothing of this transaction.";
  const unique = [...new Set(categories)].sort();
  if (unique.length === 1 && unique[0] === "approval")
    return "Bucket A: Summ holds only this transaction's gas, as an approval.";
  return `Bucket A: Summ holds part of this transaction, as ${unique.join(", ")}.`;
}

/**
 * A Fee row of a transaction's gas.
 *
 * @param {object} sent - The transaction, as the wallet sent it
 * @param {object} flow - Its PLS
 * @param {string} wallet - The wallet, in EIP-55's mixed case
 * @param {string} description - What the row is
 * @returns {object} The row, as the Summ csv utility takes it
 */
function feeRow(sent, flow, wallet, description) {
  return {
    timestamp: flow.timestamp,
    type: "fee",
    baseCurrency: PLS,
    baseAmount: { raw: flow.gasPaid, decimals: PLS_DECIMALS },
    from: wallet,
    to: getAddress(sent.to),
    blockchain: BLOCKCHAIN,
    id: flow.hash.toLowerCase(),
    description,
  };
}

/**
 * The rows or question of a transaction the wallet sent that moved no
 * token and that Summ holds nothing of.
 *
 * @param {object} sent - The transaction, as the wallet sent it
 * @param {object} flow - Its PLS
 * @param {string} wallet - The wallet, in EIP-55's mixed case
 * @returns {{row: object}|{question: object}} Its Fee row, or its
 *   question
 */
function legless(sent, flow, wallet) {
  const hold = holdText(undefined);
  const ask = (reason) => ({
    question: {
      hash: flow.hash.toLowerCase(),
      timestamp: flow.timestamp,
      reason,
      legs: [],
      plsSent: flow.sent,
      plsHandedBack: flow.handedBack,
      gasPaid: flow.gasPaid,
    },
  });
  if (sent.to === null) return ask("it created a contract");
  if (!flow.succeeded)
    return {
      row: feeRow(
        sent,
        flow,
        wallet,
        `Gas of a failed transaction; nothing else moved. ${hold}`,
      ),
    };
  if (flow.sent === 0n && flow.handedBack.length === 0)
    return {
      row: feeRow(
        sent,
        flow,
        wallet,
        `Gas of a transaction that moved no token and no PLS, such as an approval. ${hold}`,
      ),
    };
  return ask("it moved PLS and no token, and the sweep writes no rows of PLS");
}

/**
 * Adds what all the rows of one transaction share.
 *
 * @param {{rows: object[], questions: object[]}} found - The rows, each
 *   with the log index it sorts by, and the questions
 * @param {object} context - `categories`, of Summ's rows of it; `flow`,
 *   its PLS, when the wallet sent it; `later`, the note of a transaction
 *   Summ's sync has not read yet, or `null`
 * @returns {{rows: object[], questions: object[]}} The rows, in the order
 *   of their logs, and the questions
 */
function finish(found, { categories, flow, later }) {
  const hold = holdText(categories);
  const rows = [...found.rows]
    .sort((a, b) => a.order - b.order)
    .map(({ row }) => ({
      ...row,
      description: `${row.description} ${hold}${later ?? ""}`,
    }));
  const owesGas =
    flow !== undefined && categories === undefined && later === null;
  if (!owesGas) return { rows, questions: found.questions };
  const gas = `${decimalText(flow.gasPaid, PLS_DECIMALS)} ${PLS}`;
  if (rows.length > 0)
    return {
      rows: [
        withGas(rows[0], flow.gasPaid, `Its gas, ${gas}, is on this row only.`),
        ...rows.slice(1),
      ],
      questions: found.questions,
    };
  return {
    rows,
    questions: found.questions.map((one) => ({
      ...one,
      gasNote: `Summ holds nothing of this transaction, so its gas, ${gas}, goes on its first row.`,
    })),
  };
}

/**
 * Sorts rows by time, then by transaction, keeping each transaction's
 * rows in their order.
 *
 * @param {object[]} rows - The rows
 * @returns {object[]} The rows, sorted
 */
export function sortRows(rows) {
  return [...rows].sort(
    (a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id),
  );
}

/**
 * Items by the hash of their transaction, in lower case.
 *
 * @param {object[]} items - The items
 * @param {function(object): string} hashOf - An item's hash
 * @returns {Map<string, object[]>} The items of each hash
 */
function byHash(items, hashOf) {
  return groupBy(items, (item) => hashOf(item).toLowerCase());
}

/**
 * The rows and questions for what Summ lacks.
 *
 * @param {object} gaps - What to book
 * @param {string} gaps.wallet - The wallet
 * @param {object} gaps.history - The history read: `sent`, `own` and
 *   `legs`
 * @param {object[]} gaps.unmatched - The legs and parts Summ lacks
 * @param {object[]} gaps.splits - Every coin of every collect, from
 *   `splitCollects`
 * @param {object[]} gaps.problems - The collects `splitCollects` could not
 *   split
 * @param {Map<string, object>} gaps.records - LP Ranger's records, by
 *   hash
 * @param {object[]} gaps.summRows - Summ's rows of the wallet
 * @param {number} gaps.syncedTo - The time Summ's sync of the wallet has
 *   read its transactions to, in seconds since 1970
 * @param {object} gaps.lists - The owner's lists
 * @param {object} gaps.chain - The chain's facts: `positionManager`, in
 *   EIP-55's mixed case
 * @returns {{rows: object[], questions: object[]}} The rows, sorted, and
 *   the questions
 */
export function rowsForGaps(gaps) {
  const { history, chain, syncedTo } = gaps;
  const wallet = getAddress(gaps.wallet);
  const env = { wallet, lists: gaps.lists, chain };
  const summByHash = byHash(gaps.summRows, (row) => row.hash);
  const laterNote = (timestamp) =>
    timestamp > syncedTo
      ? ` It is later than ${timeText(syncedTo)} UTC, the time this run was given as reached by Summ's sync of the wallet, so its gas is left off, for that sync to bring.`
      : null;
  const sentByHash = byHash(history.sent, (one) => one.hash);
  const flowByHash = byHash(history.own, (one) => one.hash);
  const legsByHash = byHash(history.legs, (leg) => leg.hash);
  const splitsByHash = byHash(gaps.splits, (split) => split.hash);
  const problemByHash = byHash(gaps.problems, (one) => one.hash);
  const rows = [];
  const questions = [];
  for (const [hash, legs] of byHash(gaps.unmatched, (leg) => leg.hash)) {
    const sent = sentByHash.get(hash)?.[0];
    const flow = flowByHash.get(hash)?.[0];
    const found = transactionGaps(
      {
        hash,
        legs: legsByHash.get(hash) ?? [],
        gaps: legs,
        flow,
        toPositionManager:
          sent !== undefined && sameAddress(sent.to, chain.positionManager),
        record: gaps.records.get(hash),
        splits: splitsByHash.get(hash) ?? [],
        problem: problemByHash.get(hash)?.[0].problem,
      },
      env,
    );
    const done = finish(found, {
      categories: summByHash.get(hash)?.map((row) => row.category),
      flow,
      later: laterNote(legs[0].timestamp),
    });
    rows.push(...done.rows);
    questions.push(...done.questions);
  }
  for (const [hash, [sent]] of sentByHash) {
    const flow = flowByHash.get(hash)[0];
    if (legsByHash.has(hash) || summByHash.has(hash)) continue;
    if (laterNote(flow.timestamp) !== null) continue;
    const booked = legless(sent, flow, wallet);
    if (booked.row !== undefined) rows.push(booked.row);
    else questions.push(booked.question);
  }
  return {
    rows: sortRows(rows),
    questions: questions.sort((a, b) => a.timestamp - b.timestamp),
  };
}
