/**
 * Module: PulseChain Token Transfer Fetcher for Google Sheets
 *
 * Description:
 * This Apps Script module provides a custom function for Google Sheets to fetch the total amount of a specified ERC20 token
 * transferred to a given wallet address in a specific transaction on the PulseChain blockchain. The transaction ID is provided
 * as an input parameter (typically from column L in the sheet). The function reads the transaction's own receipt and adds up
 * the token's Transfer events to the wallet in it. The receipt holds that transaction's events alone, so another transaction
 * in the same block never counts, and it needs no archive node, since no past balance is read.
 *
 * The final amount is returned as a numeric value with exactly 7 decimal places, cut off rather than rounded. If the
 * transaction transferred none of the token to the wallet, it returns 0. If a read fails, or the transaction is not
 * found, it throws, so the cell shows an error, never a number that could be mistaken for an amount.
 *
 * Configurable values (e.g., RPC URL) are defined as a JSON object within the script.
 *
 * Dependencies:
 * - Uses UrlFetchApp for JSON-RPC calls to the PulseChain RPC.
 * - Assumes the token is an ERC20-compatible token with the standard decimals function and Transfer event.
 *
 * Limitations:
 * - Handles large token amounts using BigInt to avoid precision loss.
 * - Relies on a public RPC endpoint; rate limits may apply.
 * - Counts a Transfer event only when the token's own contract emitted it, with the sender and receiver indexed and the
 *   amount in its data, as ERC20 has it. An NFT's Transfer event, whose third indexed value is the token id, is not counted.
 *
 * Note on BigInt Wrapping:
 * Due to a known issue where the Google Apps Script debugger crashes when encountering raw BigInt values, all BigInt instances are wrapped in new Object(BigInt(...)) to enable proper debugging and breakpoint functionality without runtime errors in the development environment.
 *
 * Setup Instructions:
 * 1. Configure the config object in the script with the appropriate RPC URL (set to "https://rpc-pulsechain.g4mm4.io", which needs no API key).
 * 2. In Google Sheets, use the custom function like: =getTokenTransferred(L2, "0xTokenAddress", "0xWalletAddress")
 *    where L2 contains the transaction ID.
 * 3. Added a test function testGetTokenTransferred() at the bottom using the provided example transaction, wallet, and token.
 *    Run it from the script editor to test; it should log the result, expected to be 4745988352 for that transaction.
 *
 * API Documentation:
 *
 * Function: getTokenTransferred(txId, tokenAddress, walletAddress)
 * - Description: Fetches the amount of the token transferred to the wallet in the given transaction, from its receipt.
 * - Parameters:
 *   - txId (string): The transaction ID (hash) from the PulseChain blockchain (e.g., from column L).
 *   - tokenAddress (string): The contract address of the ERC20 token.
 *   - walletAddress (string): The target wallet address to check transfers to.
 * - Returns: Number - The transferred amount with 7 decimal places, or 0 if none.
 * - Throws: When a read fails or the transaction is not found.
 *
 * Helper Function: rpcRequest(method, params, rpcUrl, what)
 * - Description: Sends one JSON-RPC request and returns its result.
 * - Throws: When the endpoint answers with an error, or with something that is not JSON, saying what could not be read.
 *
 * Helper Function: getTokenDecimals(tokenAddress, rpcUrl)
 * - Description: Fetches the decimals of the ERC20 token using eth_call.
 * - Returns: Number - The token's decimal places.
 * - Throws: When the read fails or the token gives no decimals.
 *
 * Helper Function: getTransactionReceipt(txId, rpcUrl)
 * - Description: Fetches the transaction receipt using eth_getTransactionReceipt.
 * - Returns: Object - The transaction receipt.
 * - Throws: When the read fails or the transaction is not found.
 *
 * Helper Function: sumTransfersTo(receipt, tokenAddress, walletAddress)
 * - Description: Adds up the token's Transfer events to the wallet in the receipt.
 * - Returns: Object - Wrapped BigInt of the raw amount, in the token's smallest unit.
 *
 * Helper Function: formatAmount(rawAmount, decimals)
 * - Description: Writes a raw amount in whole tokens, cut off at 7 decimal places.
 * - Returns: Number - The amount.
 */

const config = {
  rpcUrl: "https://rpc-pulsechain.g4mm4.io",
};

// keccak256 of "Transfer(address,address,uint256)": the topic an ERC20 Transfer event leads with.
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// The decimal places of the amount returned.
const DECIMAL_PLACES_RETURNED = 7;

/**
 * Sends one JSON-RPC request and returns its result.
 * @param {string} method The JSON-RPC method.
 * @param {Array} params Its parameters.
 * @param {string} rpcUrl RPC endpoint URL.
 * @param {string} what What the request reads, for the error message.
 * @return {*} The result.
 */
function rpcRequest(method, params, rpcUrl, what) {
  const response = UrlFetchApp.fetch(rpcUrl, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      jsonrpc: "2.0",
      method: method,
      params: params,
      id: 1,
    }),
    muteHttpExceptions: true,
  });
  let json;
  try {
    json = JSON.parse(response.getContentText());
  } catch (err) {
    throw new Error(
      "Cannot read " +
        what +
        ": the endpoint answered with HTTP code " +
        response.getResponseCode(),
      { cause: err },
    );
  }
  if (json.error) {
    throw new Error("Cannot read " + what + ": " + json.error.message);
  }
  return json.result;
}

/**
 * Fetches the decimals of the ERC20 token using eth_call.
 * @param {string} tokenAddress Token contract address.
 * @param {string} rpcUrl RPC endpoint URL.
 * @return {number} The token's decimal places.
 */
function getTokenDecimals(tokenAddress, rpcUrl) {
  const decimalsSelector = "0x313ce567"; // keccak256('decimals()')[:4]
  const what = "the decimals of " + tokenAddress;
  const result = rpcRequest(
    "eth_call",
    [{ to: tokenAddress, data: decimalsSelector }, "latest"],
    rpcUrl,
    what,
  );
  if (typeof result !== "string" || result === "0x") {
    throw new Error("Cannot read " + what + ": the token gave none");
  }
  return parseInt(result, 16);
}

/**
 * Fetches the transaction receipt using eth_getTransactionReceipt.
 * @param {string} txId Transaction ID.
 * @param {string} rpcUrl RPC endpoint URL.
 * @return {Object} The transaction receipt.
 */
function getTransactionReceipt(txId, rpcUrl) {
  const receipt = rpcRequest(
    "eth_getTransactionReceipt",
    [txId],
    rpcUrl,
    "the receipt of " + txId,
  );
  if (receipt === null || receipt === undefined) {
    throw new Error(
      "Transaction " + txId + " not found; it may still be pending",
    );
  }
  return receipt;
}

/**
 * Adds up the token's Transfer events to the wallet in the receipt.
 * @param {Object} receipt The transaction receipt.
 * @param {string} tokenAddress Token contract address, lower case.
 * @param {string} walletAddress Wallet address, lower case.
 * @return {Object} Wrapped BigInt of the raw amount, in the token's smallest unit.
 */
function sumTransfersTo(receipt, tokenAddress, walletAddress) {
  const walletTopic = "0x" + walletAddress.slice(2).padStart(64, "0");
  let total = new Object(BigInt(0)); // The "new Object" code is a workaround: See the file header doc for more info.
  receipt.logs.forEach(function (log) {
    const topics = log.topics;
    const isTokenTransferToWallet =
      log.address.toLowerCase() === tokenAddress &&
      topics.length === 3 &&
      topics[0].toLowerCase() === TRANSFER_TOPIC &&
      topics[2].toLowerCase() === walletTopic;
    if (isTokenTransferToWallet) {
      total = new Object(total + BigInt(log.data)); // The "new Object" code is a workaround: See the file header doc for more info.
    }
  });
  return total;
}

/**
 * Writes a raw amount in whole tokens, cut off at 7 decimal places.
 * @param {Object} rawAmount Wrapped BigInt amount, in the token's smallest unit.
 * @param {number} decimals The token's decimal places.
 * @return {number} The amount.
 */
function formatAmount(rawAmount, decimals) {
  const digits = rawAmount.toString().padStart(decimals + 1, "0");
  const integerPart = digits.slice(0, digits.length - decimals);
  const fractionPart = (
    digits.slice(digits.length - decimals) + "0".repeat(DECIMAL_PLACES_RETURNED)
  ).slice(0, DECIMAL_PLACES_RETURNED);
  return parseFloat(integerPart + "." + fractionPart);
}

/**
 * Fetches the amount of the token transferred to the wallet in the given transaction, from its receipt.
 * @param {string} txId The transaction ID (hash) from the PulseChain blockchain (e.g., from column L).
 * @param {string} tokenAddress The contract address of the ERC20 token.
 * @param {string} walletAddress The target wallet address to check transfers to.
 * @return {number} The transferred amount with 7 decimal places, or 0 if none.
 * @customfunction
 */
function getTokenTransferred(txId, tokenAddress, walletAddress) {
  const rpcUrl = config.rpcUrl;
  const transaction = String(txId).trim().toLowerCase();
  const token = String(tokenAddress).trim().toLowerCase();
  const wallet = String(walletAddress).trim().toLowerCase();

  const receipt = getTransactionReceipt(transaction, rpcUrl);
  const total = sumTransfersTo(receipt, token, wallet);
  console.info("Raw amount transferred: " + total.toString());
  if (total.valueOf() === BigInt(0)) {
    return 0;
  }
  return formatAmount(total, getTokenDecimals(token, rpcUrl));
}

/**
 * Test function to verify getTokenTransferred with example values.
 * Logs the result to the console.
 */
function testGetTokenTransferred() {
  const txId =
    "0xab9c6162b16c9e26149720420cb73c7d445d31b150cf448f3e91da13125b1bd8";
  const tokenAddress = "0x8a7FDcA264e87b6da72D000f22186B4403081A2a";
  const walletAddress = "0xbCB167f16A1aA3ca3F483CC922967e9aCdEC405D";
  const result = getTokenTransferred(txId, tokenAddress, walletAddress);
  console.log("Test result for example transaction: " + result);
}
