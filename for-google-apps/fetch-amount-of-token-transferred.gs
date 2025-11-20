/**
 * Module: PulseChain Token Transfer Fetcher for Google Sheets
 *
 * Description:
 * This Apps Script module provides a custom function for Google Sheets to fetch the total amount of a specified ERC20 token
 * transferred to a given wallet address in a specific transaction on the PulseChain blockchain. The transaction ID is provided
 * as an input parameter (typically from column L in the sheet). The function computes the net balance change for the token in the
 * transaction by querying the balance before (at previous block) and after (at the transaction's block) the transaction.
 *
 * The final amount is returned as a numeric value with exactly 7 decimal places. If no tokens were transferred to the wallet
 * in the transaction (net change <= 0), it returns 0.
 *
 * Configurable values (e.g., RPC URL) are defined as a JSON object within the script.
 *
 * Dependencies:
 * - Uses UrlFetchApp for JSON-RPC calls to the PulseChain RPC.
 * - Assumes the token is an ERC20-compatible token with standard balanceOf and decimals functions.
 *
 * Limitations:
 * - Handles large token amounts using BigInt to avoid precision loss.
 * - Relies on a public RPC endpoint; rate limits may apply.
 * - The balance change method assumes no other transactions in the same block affect the target wallet's token balance after this transaction.
 * - Errors are logged to console instead of thrown, and functions return default values (0 or BigInt(0)) on failure.
 *
 * Note on BigInt Wrapping:
 * Due to a known issue where the Google Apps Script debugger crashes when encountering raw BigInt values, all BigInt instances are wrapped in new Object(BigInt(...)) to enable proper debugging and breakpoint functionality without runtime errors in the development environment.
 *
 * Setup Instructions:
 * 1. Configure the config object in the script with the appropriate RPC URL (set to "https://rpc-pulsechain.g4mm4.io" which supports historical queries without API key).
 * 2. In Google Sheets, use the custom function like: =getTokenTransferred(L2, "0xTokenAddress", "0xWalletAddress")
 *    where L2 contains the transaction ID.
 * 3. Added a test function testGetTokenTransferred() at the bottom using the provided example transaction, wallet, and token.
 *    Run it from the script editor to test; it should log the result, expected to be approximately 4745988352.0000000 based on user input.
 *
 * API Documentation:
 *
 * Function: getTokenTransferred(txId, tokenAddress, walletAddress)
 * - Description: Fetches the net token amount transferred to the wallet in the given transaction via balance delta.
 * - Parameters:
 *   - txId (string): The transaction ID (hash) from the PulseChain blockchain (e.g., from column L).
 *   - tokenAddress (string): The contract address of the ERC20 token.
 *   - walletAddress (string): The target wallet address to check transfers to.
 * - Returns: Number - The net transferred amount with 7 decimal places, or 0 if none or error.
 *
 * Helper Function: getTokenDecimals(tokenAddress, rpcUrl)
 * - Description: Fetches the decimals of the ERC20 token using eth_call.
 * - Parameters:
 *   - tokenAddress (string): Token contract address.
 *   - rpcUrl (string): RPC endpoint URL.
 * - Returns: Number - The token's decimal places, or 0 on error.
 *
 * Helper Function: getTransactionReceipt(txId, rpcUrl)
 * - Description: Fetches the transaction receipt using eth_getTransactionReceipt.
 * - Parameters:
 *   - txId (string): Transaction ID.
 *   - rpcUrl (string): RPC endpoint URL.
 * - Returns: Object - The transaction receipt, or null on error.
 *
 * Helper Function: getBalance(tokenAddress, walletAddress, blockTag, rpcUrl)
 * - Description: Fetches the raw token balance of the wallet at the given block tag using eth_call.
 * - Parameters:
 *   - tokenAddress (string): Token contract address.
 *   - walletAddress (string): Wallet address.
 *   - blockTag (string): Block number or tag (hex string).
 *   - rpcUrl (string): RPC endpoint URL.
 * - Returns: BigInt - The raw balance, or BigInt(0) on error.
 */

const config = {
  "rpcUrl": "https://rpc-pulsechain.g4mm4.io"
};

function getTokenDecimals(tokenAddress, rpcUrl) {
  const decimalsSelector = '0x313ce567'; // keccak256('decimals()')[:4]
  const request = {
    jsonrpc: '2.0',
    method: 'eth_call',
    params: [{
      to: tokenAddress,
      data: decimalsSelector
    }, 'latest'],
    id: 1
  };
  const response = UrlFetchApp.fetch(rpcUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(request),
    muteHttpExceptions: true
  });
  const json = JSON.parse(response.getContentText());
  if (json.error || !json.result) {
    console.log('Failed to fetch token decimals: ' + (json.error ? json.error.message : 'No result'));
    return 0;
  }
  return parseInt(json.result, 16);
}

function getTransactionReceipt(txId, rpcUrl) {
  const request = {
    jsonrpc: '2.0',
    method: 'eth_getTransactionReceipt',
    params: [txId],
    id: 1
  };
  const response = UrlFetchApp.fetch(rpcUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(request),
    muteHttpExceptions: true
  });
  const json = JSON.parse(response.getContentText());
  if (json.error || !json.result) {
    console.log('Failed to fetch transaction receipt: ' + (json.error ? json.error.message : 'No result'));
    return null;
  }
  return json.result;
}

function getBalance(tokenAddress, walletAddress, blockTag, rpcUrl) {
  const balanceSelector = '0x70a08231' + ('000000000000000000000000' + walletAddress.slice(2));
  const request = {
    jsonrpc: '2.0',
    method: 'eth_call',
    params: [{
      to: tokenAddress,
      data: balanceSelector
    }, blockTag],
    id: 1
  };
  const response = UrlFetchApp.fetch(rpcUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(request),
    muteHttpExceptions: true
  });
  const json = JSON.parse(response.getContentText());
  if (json.error || !json.result) {
    console.log('Failed to fetch balance at ' + blockTag + ': ' + (json.error ? json.error.message : 'No result'));
    return new Object(BigInt(0));
  }
  return new Object(BigInt(json.result));
}

function getTokenTransferred(txId, tokenAddress, walletAddress) {
  txId = txId.trim();
  tokenAddress = tokenAddress.trim();
  walletAddress = walletAddress.trim();
  
  const rpcUrl = config.rpcUrl;
  
  tokenAddress = tokenAddress.toLowerCase();
  walletAddress = walletAddress.toLowerCase();
  txId = txId.toLowerCase();
  
  const receipt = getTransactionReceipt(txId, rpcUrl);
  if (!receipt) {
    return 0;
  }
  
  const blockNumber = receipt.blockNumber;
  const blockNum = new Object(BigInt(blockNumber));
  const prevBlockTag = '0x' + (blockNum - new Object(BigInt(1))).toString(16);
  
  const decimals = getTokenDecimals(tokenAddress, rpcUrl);
  
  const before = getBalance(tokenAddress, walletAddress, prevBlockTag, rpcUrl);
  const after = getBalance(tokenAddress, walletAddress, blockNumber, rpcUrl);
  
  const delta = new Object(after - before);
  console.info('Delta: ' + delta.toString());
  if (delta <= new Object(BigInt(0))) {
    return 0;
  }
  
  const deltaStr = delta.toString();
  const padded = deltaStr.padStart(decimals + deltaStr.length, '0'); // Ensure enough leading zeros if needed
  const pointPos = padded.length - decimals;
  const integerPart = padded.slice(0, pointPos) || '0';
  let fracPart = padded.slice(pointPos, pointPos + 7);
  fracPart = fracPart.padEnd(7, '0');
  
  const amountStr = integerPart + '.' + fracPart;
  return parseFloat(amountStr);
}

// Test case
function testGetTokenTransferred() {
  const txId = '0xab9c6162b16c9e26149720420cb73c7d445d31b150cf448f3e91da13125b1bd8';
  const tokenAddress = '0x8a7FDcA264e87b6da72D000f22186B4403081A2a';
  const walletAddress = '0xbCB167f16A1aA3ca3F483CC922967e9aCdEC405D';
  const result = getTokenTransferred(txId, tokenAddress, walletAddress);
  console.log('Test result for example transaction: ' + result);
}
