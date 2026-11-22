/**
 * Tests for the parts of `wallet-history/` that find a wallet's
 * transactions and read them: the paced provider, the blocks of a range,
 * the logs that name the wallet, the transactions it sent, their receipts
 * and the facts of its tokens. `wallet-history-coin.test.js` tests the
 * flows of PLS.
 * @module test/wallet-history.test
 *
 * Each test asks a stand-in endpoint (`helpers/stand-in-wallet-chain.js`)
 * about a few blocks it describes, so no test asks the real chain. The
 * wallets and hashes are made up; the wrapped coin's contract is
 * PulseChain's WPLS, which is public.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AbiCoder, ethers, getAddress } from "ethers";
import { pacedProvider } from "../wallet-history/paced-provider.js";
import { blockAtOrAfter, hexBlock, spansOf } from "../wallet-history/blocks.js";
import {
  DEPOSIT_TOPIC,
  TRANSFER_TOPIC,
  WITHDRAWAL_TOPIC,
  addressTopic,
  walletTransferLogs,
} from "../wallet-history/transfers.js";
import { sameAddress, walletSentTransactions } from "../wallet-history/sent.js";
import { readReceipts, tokenFacts } from "../wallet-history/receipts.js";
import {
  FIRST_BLOCK_TIME,
  standInWalletChain,
} from "./helpers/stand-in-wallet-chain.js";

/*-
 * The made-up wallets, pool and token, each in EIP-55's mixed case, as
 * every address the repo holds is.
 */

/** The wallet. */
const WALLET = getAddress(`0x${"aa".repeat(20)}`);

/** Another wallet. */
const OTHER = getAddress(`0x${"bb".repeat(20)}`);

/** A pool. */
const POOL = getAddress(`0x${"cc".repeat(20)}`);

/** A token. */
const TOKEN = getAddress(`0x${"dd".repeat(20)}`);

/** WPLS, PulseChain's wrapped PLS. */
const WPLS = "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";

/**
 * A made-up transaction hash.
 *
 * @param {number} n - Which
 * @returns {string} The hash
 */
function hashOf(n) {
  return `0x${n.toString(16).padStart(64, "0")}`;
}

/**
 * A transaction the wallet sends, as the stand-in describes one, changed
 * by what the test gives.
 *
 * @param {number} n - Its hash's number, and its nonce
 * @param {object} [changes] - The values to set in place of its own
 * @returns {object} The transaction
 */
function transaction(n, changes = {}) {
  return {
    hash: hashOf(n),
    from: WALLET,
    to: POOL,
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
 * A token's Transfer log.
 *
 * @param {string} token - The token's contract
 * @param {string} from - The sender
 * @param {string} to - The receiver
 * @param {bigint} amount - The amount
 * @returns {object} The log
 */
function transferLog(token, from, to, amount) {
  return {
    address: token,
    topics: [TRANSFER_TOPIC, addressTopic(from), addressTopic(to)],
    data: ethers.toBeHex(amount, 32),
  };
}

/**
 * A wrapped coin's Deposit or Withdrawal log.
 *
 * @param {string} contract - The contract that logs it
 * @param {string} topic - `DEPOSIT_TOPIC` or `WITHDRAWAL_TOPIC`
 * @param {string} wallet - The wallet that wrapped or unwrapped
 * @returns {object} The log
 */
function wrapLog(contract, topic, wallet) {
  return {
    address: contract,
    topics: [topic, addressTopic(wallet)],
    data: ethers.toBeHex(10n, 32),
  };
}

/**
 * A provider whose every call the endpoint answers with an error that is
 * no revert, as ethers throws it: a CALL_EXCEPTION with no revert data,
 * the endpoint's message as given.
 *
 * @param {string} message - The endpoint's message
 * @returns {{call: function}} The provider
 */
function evmErrorCalls(message) {
  return {
    call: async () => {
      throw Object.assign(new Error("missing revert data"), {
        code: "CALL_EXCEPTION",
        data: null,
        info: { error: { code: -32000, message } },
      });
    },
  };
}

/**
 * A paced provider that waits for nothing.
 *
 * @param {object} chain - The stand-in endpoint
 * @returns {object} The paced provider
 */
function unpaced(chain) {
  return pacedProvider(chain, { spacingMs: 0 });
}

describe("pacedProvider", () => {
  it("waits the spacing between turns, and sends a set of requests in one turn", async () => {
    let time = 1000;
    const waits = [];
    const paced = pacedProvider(
      { double: async (x) => x * 2 },
      {
        spacingMs: 222,
        now: () => time,
        sleep: async (milliseconds) => {
          waits.push(milliseconds);
          time += milliseconds;
        },
      },
    );

    assert.equal(await paced.ask("double", 1), 2);
    time += 100;
    assert.deepEqual(await paced.askAll("double", [[1], [2], [3]]), [2, 4, 6]);
    assert.deepEqual(await paced.askAll("double", []), []);
    assert.deepEqual(waits, [122]);
  });

  it("waits with a timer of its own when given none", async () => {
    const paced = pacedProvider({ one: async () => 1 }, { spacingMs: 5 });

    assert.equal(await paced.ask("one"), 1);
    assert.equal(await paced.ask("one"), 1);
  });
});

describe("the blocks of a range", () => {
  it("write a block number in hex, as json-rpc does", () => {
    assert.equal(hexBlock(26029593), "0x18d2e19");
  });

  it("cut a range into spans no wider than asked", () => {
    assert.deepEqual(spansOf(1, 20000, 9000), [
      { fromBlock: 1, toBlock: 9000 },
      { fromBlock: 9001, toBlock: 18000 },
      { fromBlock: 18001, toBlock: 20000 },
    ]);
    assert.deepEqual(spansOf(5, 4, 10), []);
  });

  it("find the first block at or after a moment", async () => {
    const paced = unpaced(standInWalletChain({ latest: 1000, blocks: {} }));

    assert.equal(await blockAtOrAfter(paced, FIRST_BLOCK_TIME + 505), 51);
    assert.equal(await blockAtOrAfter(paced, FIRST_BLOCK_TIME + 500), 50);
    assert.equal(await blockAtOrAfter(paced, FIRST_BLOCK_TIME - 60), 0);
    assert.equal(await blockAtOrAfter(paced, FIRST_BLOCK_TIME + 99999), 1001);
  });
});

describe("walletTransferLogs", () => {
  it("leads each search with the events' topics", () => {
    assert.equal(
      TRANSFER_TOPIC,
      ethers.id("Transfer(address,address,uint256)"),
    );
    assert.equal(DEPOSIT_TOPIC, ethers.id("Deposit(address,uint256)"));
    assert.equal(WITHDRAWAL_TOPIC, ethers.id("Withdrawal(address,uint256)"));
    assert.equal(
      addressTopic(WALLET),
      ethers.zeroPadValue(WALLET.toLowerCase(), 32),
    );
  });

  const chain = () =>
    standInWalletChain({
      latest: 30000,
      spanLimit: 9000,
      blocks: {
        10: {
          transactions: [
            transaction(1, {
              logs: [
                transferLog(TOKEN, WALLET, POOL, 5n),
                transferLog(WPLS, POOL, WALLET, 7n),
              ],
            }),
          ],
        },
        20: {
          transactions: [
            transaction(2, {
              from: OTHER,
              logs: [
                transferLog(TOKEN, OTHER, WALLET, 9n),
                transferLog(TOKEN, OTHER, POOL, 1n),
              ],
            }),
          ],
        },
        30: {
          transactions: [
            transaction(3, { logs: [transferLog(TOKEN, WALLET, WALLET, 2n)] }),
          ],
        },
        40: {
          transactions: [
            transaction(4, {
              logs: [
                wrapLog(WPLS, DEPOSIT_TOPIC, WALLET),
                wrapLog(WPLS, WITHDRAWAL_TOPIC, OTHER),
                wrapLog(TOKEN, DEPOSIT_TOPIC, WALLET),
              ],
            }),
          ],
        },
        20005: {
          transactions: [
            transaction(5, { logs: [wrapLog(WPLS, WITHDRAWAL_TOPIC, WALLET)] }),
          ],
        },
      },
    });

  it("finds every log naming the wallet, each once, in the chain's order", async () => {
    const stand = chain();

    const logs = await walletTransferLogs(unpaced(stand), {
      wallet: WALLET,
      wrappedCoin: WPLS,
      fromBlock: 1,
      toBlock: 20010,
      spanBlocks: 9000,
    });

    assert.deepEqual(
      logs.map((log) => [log.blockNumber, log.transactionHash, log.index]),
      [
        [10, hashOf(1), 0],
        [10, hashOf(1), 1],
        [20, hashOf(2), 0],
        [30, hashOf(3), 0],
        [40, hashOf(4), 0],
        [20005, hashOf(5), 0],
      ],
    );
    assert.equal(stand.requests.getLogs, 9);
  });

  it("passes on an endpoint's refusal of a span wider than it takes", async () => {
    await assert.rejects(
      walletTransferLogs(unpaced(chain()), {
        wallet: WALLET,
        wrappedCoin: WPLS,
        fromBlock: 1,
        toBlock: 20010,
        spanBlocks: 10000,
      }),
      /limited to a 9000 block range/,
    );
  });
});

describe("walletSentTransactions", () => {
  const chain = () =>
    standInWalletChain({
      latest: 1000,
      blocks: {
        10: { transactions: [transaction(0), transaction(1, { value: 5n })] },
        500: { transactions: [transaction(2, { status: 0 })] },
        600: { transactions: [transaction(9, { from: OTHER })] },
        777: { transactions: [transaction(3, { to: WALLET })] },
      },
    });

  it("finds every transaction the wallet sent, those that moved nothing included", async () => {
    const sent = await walletSentTransactions(
      unpaced(chain()),
      WALLET,
      1,
      1000,
    );

    assert.deepEqual(
      sent.map((one) => [one.hash, one.blockNumber, one.nonce]),
      [
        [hashOf(0), 10, 0],
        [hashOf(1), 10, 1],
        [hashOf(2), 500, 2],
        [hashOf(3), 777, 3],
      ],
    );
    assert.deepEqual(sent[1], {
      hash: hashOf(1),
      blockNumber: 10,
      timestamp: FIRST_BLOCK_TIME + 100,
      nonce: 1,
      to: POOL,
      value: 5n,
    });
  });

  it("reads no block of a span whose counts are the same at both ends", async () => {
    const stand = chain();

    assert.deepEqual(
      await walletSentTransactions(unpaced(stand), WALLET, 11, 499),
      [],
    );
    assert.equal(stand.requests.getTransactionCount, 2);
    assert.equal(stand.requests.getBlock, undefined);
  });

  it("tells addresses apart whatever their case, and a missing one from any", () => {
    assert.equal(sameAddress(WALLET, WALLET.toLowerCase()), true);
    assert.equal(sameAddress(WALLET, OTHER), false);
    assert.equal(sameAddress(null, WALLET), false);
  });
});

describe("readReceipts", () => {
  const chain = () =>
    standInWalletChain({
      latest: 100,
      blocks: {
        10: { transactions: [transaction(1), transaction(2), transaction(3)] },
      },
    });

  it("reads each receipt once, in sets, by hash in lower case", async () => {
    const stand = chain();
    const upper = hashOf(1).toUpperCase().replace("0X", "0x");

    const receipts = await readReceipts(
      unpaced(stand),
      [hashOf(1), upper, hashOf(2), hashOf(3)],
      { batchSize: 2 },
    );

    assert.deepEqual([...receipts.keys()], [hashOf(1), hashOf(2), hashOf(3)]);
    assert.equal(receipts.get(hashOf(2)).gasUsed, 100n);
    assert.equal(stand.requests.getTransactionReceipt, 3);
  });

  it("stops at a transaction the endpoint holds no receipt for", async () => {
    await assert.rejects(
      readReceipts(unpaced(chain()), [hashOf(77)], { batchSize: 2 }),
      /holds no receipt for 0x0+4d: the transaction is not mined, or the endpoint is behind/,
    );
  });
});

describe("tokenFacts", () => {
  const coder = AbiCoder.defaultAbiCoder();
  const old = getAddress(`0x${"ee".repeat(20)}`);
  const chain = () =>
    standInWalletChain({
      latest: 1,
      blocks: {},
      contracts: {
        [TOKEN]: {
          symbol: coder.encode(["string"], ["HEX"]),
          decimals: coder.encode(["uint8"], [8]),
        },
        [old]: {
          symbol: ethers.encodeBytes32String("MKR"),
          decimals: coder.encode(["uint8"], [18]),
        },
        [POOL]: {
          symbol: coder.encode(["string"], ["9MM-V3-POS"]),
          refuses: ["0x313ce567"],
        },
      },
    });

  it("asks each contract once for its symbol and decimals", async () => {
    const stand = chain();

    const facts = await tokenFacts(unpaced(stand), [
      TOKEN,
      TOKEN.toUpperCase().replace("0X", "0x"),
      old,
      POOL,
      OTHER,
    ]);

    assert.deepEqual(Object.fromEntries(facts), {
      [TOKEN]: { symbol: "HEX", decimals: 8 },
      [old]: { symbol: "MKR", decimals: 18 },
      [POOL]: { symbol: "9MM-V3-POS", decimals: null },
      [OTHER]: { symbol: null, decimals: null },
    });
    assert.equal(stand.requests.call, 8);
  });

  it("passes on an endpoint's failure, which is no answer of the contract's", async () => {
    const failing = {
      call: async () => {
        throw new Error("socket hang up");
      },
    };

    await assert.rejects(
      tokenFacts(unpaced(failing), [TOKEN]),
      /socket hang up/,
    );
  });

  it("stops on an endpoint's error answer to a call, which ethers throws as a CALL_EXCEPTION but is not the token's answer", async () => {
    const failing = {
      call: async () => {
        throw Object.assign(new Error("missing revert data"), {
          code: "CALL_EXCEPTION",
          data: null,
          info: { error: { code: -32005, message: "limit exceeded" } },
        });
      },
    };

    await assert.rejects(
      tokenFacts(unpaced(failing), [TOKEN]),
      /The endpoint failed a call to .*: limit exceeded/,
    );
  });

  it("takes a revert with the contract's data as the contract's refusal", async () => {
    const reverting = {
      call: async () => {
        throw Object.assign(new Error("execution reverted"), {
          code: "CALL_EXCEPTION",
          data: "0x08c379a0",
          info: { error: { code: 3, message: "execution reverted" } },
        });
      },
    };

    const facts = await tokenFacts(unpaced(reverting), [TOKEN]);
    assert.deepEqual(Object.fromEntries(facts), {
      [TOKEN]: { symbol: null, decimals: null },
    });
  });

  it("takes a decimals answer above 255, which no uint8 holds, for no decimals", async () => {
    const contract = {
      call: async ({ data }) =>
        data === "0x95d89b41"
          ? coder.encode(["string"], ["ODD"])
          : `0x${"f".repeat(64)}`,
    };
    const facts = await tokenFacts(unpaced(contract), [TOKEN]);
    assert.deepEqual(facts.get(TOKEN), { symbol: "ODD", decimals: null });
  });

  it("takes an error of the EVM that is no revert, such as an invalid opcode, as the contract's refusal: the call ran, and the contract's code stopped it", async () => {
    for (const message of [
      "invalid opcode: INVALID",
      "invalid jump destination",
      "out of gas",
      "stack underflow (0 <=> 1)",
    ]) {
      const facts = await tokenFacts(unpaced(evmErrorCalls(message)), [TOKEN]);
      assert.deepEqual(Object.fromEntries(facts), {
        [TOKEN]: { symbol: null, decimals: null },
      });
    }
  });

  it("stops on the endpoint's limit on a call's time, which is no answer of the contract's", async () => {
    await assert.rejects(
      tokenFacts(unpaced(evmErrorCalls("execution aborted (timeout = 5s)")), [
        TOKEN,
      ]),
      /The endpoint failed a call to .*: execution aborted \(timeout = 5s\)/,
    );
  });
});
