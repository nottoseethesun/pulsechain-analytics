/**
 * A stand-in PulseChain rpc endpoint, held in memory, for the tests of the
 * scripts that read how much of a token one transaction sent a wallet.
 * @module test/helpers/stand-in-chain
 *
 * The chain holds one transaction, in block 0x100, from a sender to `WALLET`.
 * Before that block the wallet holds 1,000,000 of `TOKEN`, which has 18
 * decimals. The transaction sends the wallet `received` more, which both its
 * receipt (as the token's Transfer event) and the wallet's balance at the
 * block show, so a script reading either one finds the same amount. A test
 * builds the chain for the case it needs with `standInChain`, then hands
 * each json-rpc request the script sends to the chain's `answer`, directly
 * or through `standInChainFetch`, a fetch for the Node version of the
 * Sheets script.
 *
 * Four options make the other cases. `decimals` is the token's decimals
 * the chain gives, 18 unless set; the amounts stay in units of 18
 * decimals, so more decimals make what a script reads smaller.
 * `otherInBlock` is a second transfer to the wallet, from another
 * transaction in the same block: the wallet's balance at the block shows
 * it, and this transaction's receipt does not.
 * `extraTransfers` are more Transfer events in this transaction's receipt:
 * of the token to the wallet, which its balance shows too, or of another
 * token, to another address, or an NFT's Transfer from the token's address,
 * which the wallet's balance of the token does not show. `fail` names one
 * read the endpoint answers with a json-rpc error, as a busy endpoint does:
 * `'receipt'`, `'decimals'`, or `'before'`, the wallet's balance before the
 * block; or `'no-receipt'`, which answers the receipt with null, as an
 * endpoint does for a transaction it does not know.
 */

export const TOKEN = "0x8a7FDcA264e87b6da72D000f22186B4403081A2a";
export const WALLET = "0xbCB167f16A1aA3ca3F483CC922967e9aCdEC405D";
export const TRANSACTION = "0x" + "ab".repeat(32);
export const OTHER_TOKEN = "0x" + "22".repeat(20);
export const OTHER_WALLET = "0x" + "33".repeat(20);

const SENDER = "0x" + "11".repeat(20);
const BLOCK = 0x100;
const BLOCK_HASH = "0x" + "cd".repeat(32);
const ONE_TOKEN = 10n ** 18n;
const BALANCE_BEFORE = 1000000n * ONE_TOKEN;
const DECIMALS_SELECTOR = "0x313ce567";
// keccak256 of "Transfer(address,address,uint256)": the ERC-20 Transfer event's first topic.
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const quantity = (n) => "0x" + n.toString(16);
const word = (n) => "0x" + BigInt(n).toString(16).padStart(64, "0");
const addressWord = (address) =>
  "0x" + address.slice(2).toLowerCase().padStart(64, "0");

/**
 * Builds one Transfer event of the transaction's receipt.
 *
 * @param {Object} transfer - The transfer
 * @param {string} [transfer.token=TOKEN] - The contract that emits it
 * @param {string} [transfer.to=WALLET] - Who receives
 * @param {bigint} transfer.amount - Whole tokens sent; for an NFT, the token id
 * @param {boolean} [transfer.nft=false] - Whether it is an NFT's Transfer, with the token id indexed and no data
 * @param {number} index - Its place among the receipt's logs
 * @returns {Object} The log, as an endpoint gives it
 */
function transferLog(
  { token = TOKEN, to = WALLET, amount, nft = false },
  index,
) {
  const topics = [TRANSFER_TOPIC, addressWord(SENDER), addressWord(to)];
  if (nft) topics.push(word(amount));
  return {
    address: token,
    topics,
    data: nft ? "0x" : word(amount * ONE_TOKEN),
    blockNumber: quantity(BLOCK),
    blockHash: BLOCK_HASH,
    transactionHash: TRANSACTION,
    transactionIndex: "0x0",
    logIndex: quantity(index),
    removed: false,
  };
}

/**
 * Whole tokens of `TOKEN` that transfers send `WALLET`.
 *
 * @param {Array<Object>} transfers - The transfers, as `transferLog` takes them
 * @returns {bigint} Whole tokens
 */
function sentToWallet(transfers) {
  return transfers
    .filter(
      ({ token = TOKEN, to = WALLET, nft = false }) =>
        token === TOKEN && to === WALLET && !nft,
    )
    .reduce((total, { amount }) => total + amount, 0n);
}

/**
 * Builds the stand-in chain for a transaction that sends the wallet
 * `received` whole tokens. Its `answer` replies to one json-rpc request as an
 * endpoint would: the chain id (PulseChain's, 369), the latest block, the
 * transaction's receipt, the token's decimals, and the wallet's balance
 * before the block (at 0xff) or from the block on. The read named by `fail`
 * gets a json-rpc error instead, and any method the chain lacks gets one
 * naming it.
 *
 * @param {bigint} received - Whole tokens the transaction sends the wallet
 * @param {Object} [options] - The other cases
 * @param {bigint} [options.otherInBlock=0n] - Whole tokens another transaction in the same block sends the wallet
 * @param {Array<Object>} [options.extraTransfers=[]] - More Transfer events in the receipt, as `transferLog` takes them
 * @param {?string} [options.fail=null] - The read that fails: 'receipt', 'decimals', 'before' or 'no-receipt'
 * @param {number} [options.decimals=18] - The token's decimals the chain gives
 * @returns {{answer: function(Object): Object}} The chain
 */
export function standInChain(
  received,
  { otherInBlock = 0n, extraTransfers = [], fail = null, decimals = 18 } = {},
) {
  const transfers =
    received === 0n
      ? extraTransfers
      : [{ amount: received }, ...extraTransfers];
  const logs = transfers.map((transfer, index) => transferLog(transfer, index));
  const amount = sentToWallet(transfers) * ONE_TOKEN;
  const receipt = {
    transactionHash: TRANSACTION,
    transactionIndex: "0x0",
    blockHash: BLOCK_HASH,
    blockNumber: quantity(BLOCK),
    from: SENDER,
    to: TOKEN,
    cumulativeGasUsed: "0x5208",
    gasUsed: "0x5208",
    effectiveGasPrice: "0x1",
    contractAddress: null,
    logs,
    logsBloom: "0x" + "00".repeat(256),
    status: "0x1",
    type: "0x2",
  };
  const blockBefore = quantity(BLOCK - 1);
  const balanceAt = (blockTag) =>
    blockTag === blockBefore
      ? BALANCE_BEFORE
      : BALANCE_BEFORE + amount + otherInBlock * ONE_TOKEN;

  return {
    answer(request) {
      const reply = (result) => ({ jsonrpc: "2.0", id: request.id, result });
      const busy = {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32005, message: "The stand-in chain is busy" },
      };
      switch (request.method) {
        case "eth_chainId":
          return reply("0x171");
        case "eth_blockNumber":
          return reply(quantity(BLOCK + 1));
        case "eth_getTransactionReceipt":
          if (fail === "no-receipt") return reply(null);
          return fail === "receipt" ? busy : reply(receipt);
        case "eth_call": {
          if (request.params[0].data === DECIMALS_SELECTOR)
            return fail === "decimals" ? busy : reply(word(decimals));
          const blockTag = request.params[1];
          if (fail === "before" && blockTag === blockBefore) return busy;
          return reply(word(balanceAt(blockTag)));
        }
        default:
          return {
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: -32601,
              message: `The stand-in chain has no ${request.method}`,
            },
          };
      }
    },
  };
}

/**
 * Builds a fetch, shaped as Node's own, that hands each json-rpc request's
 * body to the chain and answers with the chain's reply, for the Node
 * version of the Sheets script, whose requests go out through a fetch.
 *
 * @param {{answer: function(Object): Object}} chain - The stand-in chain
 * @returns {function(string, Object): Promise<Response>} The fetch, with the requests it answered, `{url, method, body}`, in its `requests` array
 */
export function standInChainFetch(chain) {
  const requests = [];
  const fetch = async (url, init = {}) => {
    requests.push({ url, method: init.method, body: init.body });
    const reply = chain.answer(JSON.parse(init.body));
    return new Response(JSON.stringify(reply), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  fetch.requests = requests;
  return fetch;
}
