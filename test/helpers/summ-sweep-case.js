/**
 * The made-up wallet history the tests of `summ-sweep/` sweep: its chain,
 * LP Ranger's records of its withdrawals, and Summ's rows of it.
 * @module test/helpers/summ-sweep-case
 *
 * What: in block 10 the wallet drains 9mm V3 position #7, which pays out
 * 3 HEX and 5 TKN against a principal of 2 HEX and 4 TKN. In block 20 it
 * takes 1 HEX of principal out of position #9 without collecting it, and
 * in block 30 it collects 1.5 HEX from #9: that 1 HEX and 0.5 HEX of
 * fees. In block 40 another wallet sends it 2 TKN. Summ holds the drain's
 * HEX whole, as 3 HEX, holds the collect's HEX as its two parts, and
 * lacks the rest.
 *
 * How: the chain is the stand-in of `stand-in-wallet-chain.js`; the
 * wallets, the pool, TKN and the hashes are made up, and HEX, WPLS and
 * the position manager are PulseChain's public contracts. The temp
 * folders the tests make are listed here, so a test file removes them
 * once its tests end.
 *
 * Fit: `test/summ-sweep-splits.test.js` and `test/summ-sweep-run.test.js`
 * use it, and `test/helpers/summ-gaps.js` takes its wallets and tokens.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ethers } from "ethers";
import {
  TRANSFER_TOPIC,
  addressTopic,
} from "../../wallet-history/transfers.js";
import { standInWalletChain } from "./stand-in-wallet-chain.js";

/** The wallet: made up. */
export const WALLET = `0x${"aa".repeat(20)}`;

/** Another wallet: made up. */
export const OTHER = `0x${"bb".repeat(20)}`;

/** A pool: made up. */
export const POOL = `0x${"cc".repeat(20)}`;

/** A made-up token, whose contract sorts above HEX's. */
export const TKN = `0x${"dd".repeat(20)}`;

/** PulseChain's HEX. */
export const HEX = "0x2b591e99afe9f32eaa6214f7b7629768c40eeb39";

/** WPLS. */
export const WPLS = "0xa1077a294dde1b09bb078844df40758a5d0f9a27";

/** The 9mm V3 position manager. */
export const PM = "0xcc05bf158202b4f461ede8843d76dcd7bbad07f2";

/** One whole token of eight decimals. */
export const ONE = 100000000n;

/**
 * A made-up transaction hash.
 *
 * @param {number} n - Which
 * @returns {string} The hash
 */
export function hashOf(n) {
  return `0x${n.toString(16).padStart(64, "0")}`;
}

/**
 * A transaction, as the stand-in chain describes one: the wallet's, to
 * the position manager.
 *
 * @param {number} n - Its hash's number and nonce
 * @param {object} [changes] - The values to set
 * @returns {object} The transaction
 */
export function transaction(n, changes = {}) {
  return {
    hash: hashOf(n),
    from: WALLET,
    to: PM,
    value: 0n,
    nonce: n,
    status: 1,
    gasUsed: 100n,
    gasPrice: 3n,
    logs: [],
    pays: [],
    ...changes,
  };
}

/**
 * A token's Transfer log to the wallet.
 *
 * @param {string} token - The token
 * @param {string} from - The sender
 * @param {bigint} amount - The amount
 * @returns {object} The log
 */
export function paid(token, from, amount) {
  return {
    address: token,
    topics: [TRANSFER_TOPIC, addressTopic(from), addressTopic(WALLET)],
    data: ethers.toBeHex(amount, 32),
  };
}

/**
 * An event of LP Ranger's record.
 *
 * @param {string} event - Its name
 * @param {number} nftId - The position
 * @param {bigint} amount0 - The lower coin's amount
 * @param {bigint} amount1 - The higher coin's amount
 * @returns {object} The event
 */
export function event(event, nftId, amount0, amount1) {
  return {
    event,
    nftId: String(nftId),
    amount0: String(amount0),
    amount1: String(amount1),
  };
}

/**
 * A token's answers to `symbol()` and `decimals()`.
 *
 * @param {string} symbol - The symbol
 * @returns {object} The answers
 */
export function tokenAnswers(symbol) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return {
    symbol: coder.encode(["string"], [symbol]),
    decimals: coder.encode(["uint8"], [8]),
  };
}

/**
 * The chain of the history.
 *
 * @returns {object} A stand-in chain
 */
export function sweepChain() {
  return standInWalletChain({
    latest: 1000,
    contracts: { [HEX]: tokenAnswers("HEX"), [TKN]: tokenAnswers("TKN") },
    blocks: {
      10: {
        transactions: [
          transaction(0, {
            logs: [paid(HEX, POOL, 3n * ONE), paid(TKN, POOL, 5n * ONE)],
          }),
        ],
      },
      20: { transactions: [transaction(1)] },
      30: {
        transactions: [
          transaction(2, { logs: [paid(HEX, POOL, (3n * ONE) / 2n)] }),
        ],
      },
      40: {
        transactions: [
          transaction(9, {
            from: OTHER,
            to: TKN,
            logs: [paid(TKN, OTHER, 2n * ONE)],
          }),
        ],
      },
    },
  });
}

/** LP Ranger's records of the history's transactions to the position manager. */
export const RECORDS = new Map([
  [
    hashOf(0),
    {
      kind: "drain",
      liquidity: [
        event("DecreaseLiquidity", 7, 2n * ONE, 4n * ONE),
        event("Collect", 7, 3n * ONE, 5n * ONE),
      ],
    },
  ],
  [
    hashOf(1),
    { kind: "decrease", liquidity: [event("DecreaseLiquidity", 9, ONE, 0n)] },
  ],
  [
    hashOf(2),
    { kind: "collect", liquidity: [event("Collect", 9, (3n * ONE) / 2n, 0n)] },
  ],
]);

/**
 * Summ's rows of the history, as `helpers/summ-pages.js` takes them.
 *
 * @returns {object[]} The rows
 */
export function summRows() {
  const side = (address) => ({ name: "x", address });
  return [
    {
      category: "removeLiquidity",
      hash: hashOf(0),
      date: "2023-11-14T22:15:00.000Z",
      from: side(POOL),
      to: side(WALLET),
      incoming: [{ amount: "3", symbol: "HEX" }],
      outgoing: [],
    },
    {
      category: "in",
      hash: hashOf(2),
      date: "2023-11-14T22:18:20.000Z",
      from: side(POOL),
      to: side(WALLET),
      incoming: [
        { amount: "1", symbol: "HEX" },
        { amount: "0.5", symbol: "HEX" },
      ],
      outgoing: [],
    },
  ];
}

/*-
 * The header of Summ's custom csv template, with which the owner's
 * template file starts: the Summ csv utility takes a csv's header from
 * the template, and the template itself stays outside the repo.
 */
export const TEMPLATE_HEADER = [
  "Timestamp (UTC)",
  "Type",
  "Base Currency",
  "Base Amount",
  "Quote Currency (Optional)",
  "Quote Amount (Optional)",
  "Fee Currency (Optional)",
  "Fee Amount (Optional)",
  "From (Optional)",
  "To (Optional)",
  "Blockchain (Optional)",
  " ID (Optional)",
  "Description (Optional)",
  "Reference Price Per Unit (Optional)",
  "Reference Price Currency (Optional)",
  " Contract Address (Optional)",
].join(",");

/** The temp folders the tests made. */
const madeFolders = [];

/**
 * Makes a temp folder, listed for `removeTempFolders`.
 *
 * @param {string} prefix - The start of its name
 * @returns {string} Its path
 */
export function tempFolder(prefix) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  madeFolders.push(folder);
  return folder;
}

/** Removes the temp folders the tests made. */
export function removeTempFolders() {
  for (const folder of madeFolders.splice(0))
    fs.rmSync(folder, { recursive: true, force: true });
}
