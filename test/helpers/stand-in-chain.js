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
 * each json-rpc request the script sends to the chain's `answer`.
 *
 * Two options make the cases that go wrong. `otherInBlock` is a second
 * transfer to the wallet, from another transaction in the same block: the
 * wallet's balance at the block shows it, and this transaction's receipt
 * does not. `fail` names one read the endpoint answers with a json-rpc
 * error, as a busy endpoint does: `'receipt'`, `'decimals'`, or `'before'`,
 * the wallet's balance before the block.
 */

export const TOKEN = '0x8a7FDcA264e87b6da72D000f22186B4403081A2a';
export const WALLET = '0xbCB167f16A1aA3ca3F483CC922967e9aCdEC405D';
export const TRANSACTION = '0x' + 'ab'.repeat(32);

const SENDER = '0x' + '11'.repeat(20);
const BLOCK = 0x100;
const BLOCK_HASH = '0x' + 'cd'.repeat(32);
const ONE_TOKEN = 10n ** 18n;
const BALANCE_BEFORE = 1000000n * ONE_TOKEN;
const DECIMALS_SELECTOR = '0x313ce567';
// keccak256 of "Transfer(address,address,uint256)": the ERC-20 Transfer event's first topic.
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const quantity = (n) => '0x' + n.toString(16);
const word = (n) => '0x' + BigInt(n).toString(16).padStart(64, '0');
const addressWord = (address) => '0x' + address.slice(2).toLowerCase().padStart(64, '0');

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
 * @param {Object} [options] - The cases that go wrong
 * @param {bigint} [options.otherInBlock=0n] - Whole tokens another transaction in the same block sends the wallet
 * @param {?string} [options.fail=null] - The read that fails: 'receipt', 'decimals' or 'before'
 * @returns {{answer: function(Object): Object}} The chain
 */
export function standInChain(received, { otherInBlock = 0n, fail = null } = {}) {
  const amount = received * ONE_TOKEN;
  const logs = [];
  if (amount !== 0n) {
    logs.push({
      address: TOKEN,
      topics: [TRANSFER_TOPIC, addressWord(SENDER), addressWord(WALLET)],
      data: word(amount),
      blockNumber: quantity(BLOCK),
      blockHash: BLOCK_HASH,
      transactionHash: TRANSACTION,
      transactionIndex: '0x0',
      logIndex: '0x0',
      removed: false
    });
  }
  const receipt = {
    transactionHash: TRANSACTION,
    transactionIndex: '0x0',
    blockHash: BLOCK_HASH,
    blockNumber: quantity(BLOCK),
    from: SENDER,
    to: TOKEN,
    cumulativeGasUsed: '0x5208',
    gasUsed: '0x5208',
    effectiveGasPrice: '0x1',
    contractAddress: null,
    logs,
    logsBloom: '0x' + '00'.repeat(256),
    status: '0x1',
    type: '0x2'
  };
  const blockBefore = quantity(BLOCK - 1);
  const balanceAt = (blockTag) =>
    blockTag === blockBefore ? BALANCE_BEFORE : BALANCE_BEFORE + amount + otherInBlock * ONE_TOKEN;

  return {
    answer(request) {
      const reply = (result) => ({ jsonrpc: '2.0', id: request.id, result });
      const busy = { jsonrpc: '2.0', id: request.id, error: { code: -32005, message: 'The stand-in chain is busy' } };
      switch (request.method) {
        case 'eth_chainId':
          return reply('0x171');
        case 'eth_blockNumber':
          return reply(quantity(BLOCK + 1));
        case 'eth_getTransactionReceipt':
          return fail === 'receipt' ? busy : reply(receipt);
        case 'eth_call': {
          if (request.params[0].data === DECIMALS_SELECTOR) return fail === 'decimals' ? busy : reply(word(18));
          const blockTag = request.params[1];
          if (fail === 'before' && blockTag === blockBefore) return busy;
          return reply(word(balanceAt(blockTag)));
        }
        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: { code: -32601, message: `The stand-in chain has no ${request.method}` }
          };
      }
    }
  };
}
