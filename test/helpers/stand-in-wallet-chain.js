/**
 * A PulseChain endpoint held in memory, for the tests of `wallet-history/`.
 * @module test/helpers/stand-in-wallet-chain
 *
 * A test describes a few blocks: each block's transactions, with the logs
 * they leave and the PLS that calls inside them pay (`pays`), and the
 * block's withdrawals and fee recipient. The stand-in answers the requests
 * a wallet's history makes from that description, as an ethers provider
 * would: block numbers and blocks, log searches, counts of transactions
 * and balances at past blocks, receipts, traces from the call tracer,
 * blocks and their receipts as json-rpc gives them, and contract calls:
 * a token's `symbol()` and `decimals()`, and the position manager's
 * `positions(tokenId)`, whose coins owed a test gives.
 *
 * Its balances are worked out from the description directly (the PLS a
 * transaction carries, its gas, its `pays`, the withdrawals and the
 * tips), never through the code under test, so a test of the search for
 * payments checks that code against an independent account. A block the
 * description does not hold is empty, with a time 10 seconds after the
 * block before, as PulseChain's blocks are. A log search wider than
 * `spanLimit` blocks is refused, as g4mm4's endpoint refuses one wider
 * than 10,000. Every request is counted in `requests`, by method.
 */

import { AbiCoder } from "ethers";

/** The selector of the position manager's `positions(uint256)`. */
const POSITIONS_SELECTOR = "0x99fbab88";

/**
 * The types `positions(uint256)` answers with: the position's nonce,
 * operator, two coins, fee, ticks, liquidity, fee growth of each coin, and
 * the coins it is owed.
 */
const POSITION_TYPES = Object.freeze([
  "uint96",
  "address",
  "address",
  "address",
  "uint24",
  "int24",
  "int24",
  "uint128",
  "uint256",
  "uint256",
  "uint128",
  "uint128",
]);

/** The time of block 0 in the stand-in, in seconds since 1970. */
export const FIRST_BLOCK_TIME = 1_700_000_000;

/** The kinds of call that move PLS to their recipient. */
const PAYING = ["CALL", "CREATE", "CREATE2", "SELFDESTRUCT"];

/**
 * A number as json-rpc writes it, in hex.
 *
 * @param {number|bigint} value - The number
 * @returns {string} Such as `0x1f`
 */
function hex(value) {
  return `0x${value.toString(16)}`;
}

/**
 * Whether two addresses are the same, whatever their case.
 *
 * @param {string|null|undefined} a - One address
 * @param {string|null|undefined} b - The other
 * @returns {boolean} Whether both are present and the same
 */
function isSame(a, b) {
  return typeof a === "string" && typeof b === "string"
    ? a.toLowerCase() === b.toLowerCase()
    : false;
}

/**
 * The trace of a transaction, as the call tracer gives it: the
 * transaction's own call, with a call under it for each of its `pays`.
 *
 * @param {object} transaction - The transaction, as the test describes it
 * @returns {object} The trace
 */
function traceOf(transaction) {
  const failed =
    transaction.status === 0 ? { error: "execution reverted" } : {};
  return {
    type: transaction.to === null ? "CREATE" : "CALL",
    from: transaction.from,
    to: transaction.to,
    value: hex(transaction.value),
    ...failed,
    calls: transaction.pays.map((pay) => ({
      type: pay.type ?? "CALL",
      from: pay.from,
      to: pay.to,
      value: hex(pay.amount),
      ...(pay.failed === true ? { error: "execution reverted" } : {}),
    })),
  };
}

/**
 * Whether a log matches a search's topics: each place either open
 * (`null`), one topic, or any of a list.
 *
 * @param {string[]} topics - The log's topics
 * @param {Array<string|string[]|null>} wanted - The search's topics
 * @returns {boolean} Whether it matches
 */
function topicsMatch(topics, wanted) {
  return wanted.every((want, at) => {
    if (want === null) return true;
    const options = Array.isArray(want) ? want : [want];
    return options.some((option) => isSame(option, topics[at]));
  });
}

/**
 * A stand-in endpoint for a description of blocks.
 *
 * @param {object} description - The chain
 * @param {number} description.latest - The latest block's number
 * @param {Object<number, object>} description.blocks - Blocks by number:
 *   `transactions` (each with `hash`, `from`, `to`, `value`, `nonce`,
 *   `status`, `gasUsed`, `gasPrice`, `logs` and `pays`), and optionally
 *   `miner`, `baseFee` and `withdrawals` (`address`, `amount` in gwei)
 * @param {Object<string, bigint>} [description.balances] - Balances at
 *   block 0, by address, in any case
 * @param {Array<{address: string, block: number, amount: bigint}>}
 *   [description.unaccounted] - Changes of balance no transaction,
 *   withdrawal or tip makes, for the tests of what cannot be explained
 * @param {Object<string, object>} [description.contracts] - Contracts by
 *   address, in any case: `symbol` (an answer's hex), `decimals` (hex),
 *   `refuses`, a list of the selectors it refuses, or `positions`, the
 *   position manager's positions by NFT id, each the two coins it is owed,
 *   at any block; it refuses `positions` for an NFT id it does not name,
 *   as the position manager does for one not minted
 * @param {number} [description.spanLimit] - The widest log search taken
 * @returns {object} The stand-in, with an ethers provider's methods, and
 *   `requests`, a count of the requests by method
 */
export function standInWalletChain(description) {
  const byLowerCase = (object) =>
    Object.fromEntries(
      Object.entries(object ?? {}).map(([address, value]) => [
        address.toLowerCase(),
        value,
      ]),
    );
  const balances = byLowerCase(description.balances);
  const contracts = byLowerCase(description.contracts);
  const requests = {};
  const count = (method) => {
    requests[method] = (requests[method] ?? 0) + 1;
  };
  const blockAt = (number) => ({
    transactions: [],
    withdrawals: [],
    ...(description.blocks[number] ?? {}),
  });
  const timeOf = (number) =>
    description.blocks[number]?.timestamp ?? FIRST_BLOCK_TIME + number * 10;
  const numbers = () =>
    Object.keys(description.blocks)
      .map(Number)
      .sort((a, b) => a - b);
  const transactions = () =>
    numbers().flatMap((number) =>
      blockAt(number).transactions.map((transaction, at) => ({
        ...transaction,
        blockNumber: number,
        place: at,
      })),
    );

  /** The change one block made to an address's balance. */
  function changeIn(number, address) {
    const block = blockAt(number);
    let change = 0n;
    for (const transaction of block.transactions) {
      const gas = transaction.gasUsed * transaction.gasPrice;
      const succeeded = transaction.status === 1;
      if (isSame(transaction.from, address))
        change -= gas + (succeeded ? transaction.value : 0n);
      if (succeeded && isSame(transaction.to, address))
        change += transaction.value;
      for (const pay of succeeded ? transaction.pays : []) {
        const moves =
          PAYING.includes(pay.type ?? "CALL") && pay.failed !== true;
        if (moves && isSame(pay.to, address)) change += pay.amount;
        if (moves && isSame(pay.from, address)) change -= pay.amount;
      }
      if (isSame(block.miner, address))
        change += transaction.gasUsed * (transaction.gasPrice - block.baseFee);
    }
    for (const withdrawal of block.withdrawals)
      if (isSame(withdrawal.address, address))
        change += withdrawal.amount * 10n ** 9n;
    return change;
  }

  const answers = {
    debug_traceTransaction: ([hash]) =>
      traceOf(transactions().find((one) => isSame(one.hash, hash))),
    debug_traceBlockByNumber: ([number]) =>
      blockAt(Number(number)).transactions.map((transaction) => ({
        txHash: transaction.hash,
        result: traceOf(transaction),
      })),
    eth_getBlockByNumber: ([number]) => {
      const block = blockAt(Number(number));
      return {
        number,
        timestamp: hex(timeOf(Number(number))),
        miner: block.miner ?? `0x${"99".repeat(20)}`,
        baseFeePerGas: hex(block.baseFee ?? 0n),
        withdrawals: block.withdrawals.map((withdrawal, at) => ({
          index: hex(at),
          address: withdrawal.address,
          amount: hex(withdrawal.amount),
        })),
      };
    },
    eth_getBlockReceipts: ([number]) =>
      blockAt(Number(number)).transactions.map((transaction) => ({
        gasUsed: hex(transaction.gasUsed),
        effectiveGasPrice: hex(transaction.gasPrice),
      })),
  };

  return {
    requests,
    async getBlockNumber() {
      count("getBlockNumber");
      return description.latest;
    },
    async getBlock(number, prefetch) {
      count("getBlock");
      return {
        number,
        timestamp: timeOf(number),
        prefetchedTransactions:
          prefetch === true ? blockAt(number).transactions : [],
      };
    },
    async getLogs(filter) {
      count("getLogs");
      const width = filter.toBlock - filter.fromBlock + 1;
      if (width > (description.spanLimit ?? Infinity))
        throw new Error(
          `eth_getLogs is limited to a ${description.spanLimit} block range`,
        );
      return transactions()
        .filter(
          (one) =>
            one.blockNumber >= filter.fromBlock &&
            one.blockNumber <= filter.toBlock,
        )
        .flatMap((one) =>
          one.logs.map((log, at) => ({
            ...log,
            blockNumber: one.blockNumber,
            transactionHash: one.hash,
            index: one.place * 100 + at,
          })),
        )
        .filter(
          (log) =>
            (filter.address === undefined ||
              isSame(log.address, filter.address)) &&
            topicsMatch(log.topics, filter.topics),
        );
    },
    async getTransactionCount(address, number) {
      count("getTransactionCount");
      return transactions().filter(
        (one) => one.blockNumber <= number && isSame(one.from, address),
      ).length;
    },
    async getBalance(address, number) {
      count("getBalance");
      let balance = balances[address.toLowerCase()] ?? 0n;
      for (const at of numbers())
        if (at <= number) balance += changeIn(at, address);
      for (const extra of description.unaccounted ?? [])
        if (extra.block <= number && isSame(extra.address, address))
          balance += extra.amount;
      return balance;
    },
    async getTransactionReceipt(hash) {
      count("getTransactionReceipt");
      const one = transactions().find((transaction) =>
        isSame(transaction.hash, hash),
      );
      return one === undefined
        ? null
        : {
            hash: one.hash,
            blockNumber: one.blockNumber,
            status: one.status,
            gasUsed: one.gasUsed,
            gasPrice: one.gasPrice,
            logs: one.logs,
          };
    },
    async send(method, params) {
      count(method);
      return answers[method](params);
    },
    async call({ to, data }) {
      count("call");
      const contract = contracts[to.toLowerCase()];
      if (contract === undefined) return "0x";
      const refusal = Object.assign(new Error("execution reverted"), {
        code: "CALL_EXCEPTION",
      });
      if ((contract.refuses ?? []).includes(data)) throw refusal;
      if (data.startsWith(POSITIONS_SELECTOR)) {
        const owed = (contract.positions ?? {})[BigInt(`0x${data.slice(10)}`)];
        if (owed === undefined) throw refusal;
        const zero = `0x${"0".repeat(40)}`;
        return AbiCoder.defaultAbiCoder().encode(POSITION_TYPES, [
          ...[0n, zero, zero, zero, 0n, 0n, 0n, 0n, 0n, 0n],
          ...owed,
        ]);
      }
      return data === "0x95d89b41" ? contract.symbol : contract.decimals;
    },
  };
}
