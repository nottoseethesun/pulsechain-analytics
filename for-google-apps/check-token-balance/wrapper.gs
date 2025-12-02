/**
 * Due to limitations of Google Apps Script with importing libraries,
 * it is (at least sometimes) necessary to call a Wrapper Function from
 * the actual Google Sheet, instead of calling the library function directly.
 * This code should go in the default "Code.gs" editor for your Google
 * Sheet: Access it via the menu option, "Extensions" -> "Apps Script" and
 * paste it in, and then click cntrl-s or cmd-s (on Mac) to save it.
 * Next, just use the `getTokensTransferred` function below.  
 * 
 * Note: You can optionally add as many wrapper functions as you want.
 * Also, if you suspect a problem with the caching, just use 
 * the wrapper function below, `getTokenTransferredNoCache`.
 */

/**
 * Wrapper for library's getTokenTransferred. Fetches token transfer 
 * amount from cache if possible (in order to avoid hitting any API 
 * rate limits), and otherwise, calls the API service directly.
 * 
 * @param {string} txId Transaction ID (e.g., from cell L200).
 * @param {string} tokenAddress ERC-20 token address.
 * @param {string} walletAddress Wallet address to check.
 * @return {number} Transferred amount or 0 on error.
 */
function getTokenTransferred(txId, tokenAddress, walletAddress) {
  try {
    return FetchTokenAmountTransferredSA.getTokenTransferredUseCache(txId, tokenAddress, walletAddress);
  } catch (e) {
    console.error('Error in wrapper: ' + e);
    return 0;  // Or a custom error message like "#ERROR!"
  }
}

/**
 * Wrapper for library's getTokenTransferred. Fetches token transfer
 * amount without using any cache.  Note that this could trigger an 
 * (undesired) API rate limit.
 * 
 * @param {string} txId Transaction ID (e.g., from cell L200).
 * @param {string} tokenAddress ERC-20 token address.
 * @param {string} walletAddress Wallet address to check.
 * @return {number} Transferred amount or 0 on error.
 */
function getTokenTransferredNoCache(txId, tokenAddress, walletAddress) {
  try {
    return FetchTokenAmountTransferredSA.getTokenTransferred(txId, tokenAddress, walletAddress);
  } catch (e) {
    console.error('Error in wrapper: ' + e);
    return 0;  // Or a custom error message like "#ERROR!"
  }
}

/**
 * Test function to verify getTokenTransferred with example values.
 * Logs the result to the console.
 */
function testGetTokenTransferredNoCache() {
  const txId = '0xab9c6162b16c9e26149720420cb73c7d445d31b150cf448f3e91da13125b1bd8';
  const tokenAddress = '0x8a7FDcA264e87b6da72D000f22186B4403081A2a';
  const walletAddress = '0xbCB167f16A1aA3ca3F483CC922967e9aCdEC405D';
  const result = getTokenTransferredNoCache(txId, tokenAddress, walletAddress);
  console.log('Test result for example transaction using function testGetTokenTransferred: ' + result);
}

/**
 * Test function to verify getTokenTransferred with example values.
 * Logs the result to the console.
 */
function testGetTokenTransferred() {
  const txId = '0xab9c6162b16c9e26149720420cb73c7d445d31b150cf448f3e91da13125b1bd8';
  const tokenAddress = '0x8a7FDcA264e87b6da72D000f22186B4403081A2a';
  const walletAddress = '0xbCB167f16A1aA3ca3F483CC922967e9aCdEC405D';
  const result = getTokenTransferred(txId, tokenAddress, walletAddress);
  console.log('Test result for example transaction, first time using function' +
    'testGetTokenTransferredUseCache: ' + result);
  console.log('Test result for example transaction, second time using function' +
    'testGetTokenTransferredUseCache: ' + result);
}
