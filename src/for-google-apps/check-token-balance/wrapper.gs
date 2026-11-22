/**
 * A cell of Google Sheets, Google's spreadsheet app, calls a function of
 * its own spreadsheet's project in Apps Script, Google's platform for
 * scripts that run inside its apps, but not a function of a library that
 * project adds. So a sheet that uses the library pastes this file into its
 * project, and its cells call the wrapper functions below, each of which
 * calls the library's. This code goes in the default "Code.gs" file of
 * your spreadsheet's project: open it with the menu option
 * "Extensions" -> "Apps Script", paste it in, and press Ctrl+S (Cmd+S on
 * a Mac) to save it. Then call `getTokenTransferred` from a cell.
 *
 * Note: You can optionally add as many wrapper functions as you want.
 * Also, if you suspect a problem with the caching, just use
 * the wrapper function below, `getTokenTransferredNoCache`.
 *
 * A wrapper lets the library's error through, as the library throws it: a
 * failed read, or a transaction the chain does not know, shows in the cell
 * as an error, with the library's message, never as a number that could be
 * mistaken for an amount.
 */

// The identifier Apps Script gives the library these wrappers call, once it
// is added to the sheet's project.
/* global FetchTokenAmountTransferredSA */

/**
 * Wrapper for library's getTokenTransferred. Fetches token transfer
 * amount from cache if possible (in order to avoid hitting any API
 * rate limits), and otherwise, calls the API service directly.
 *
 * @param {string} txId Transaction ID (e.g., from cell L200).
 * @param {string} tokenAddress ERC-20 token address.
 * @param {string} walletAddress Wallet address to check.
 * @return {number} The amount the transaction sent the wallet, or 0 when
 *   it sent none.
 * @throws {Error} The library's error, when a read fails or the chain does
 *   not know the transaction.
 */
function getTokenTransferred(txId, tokenAddress, walletAddress) {
  return FetchTokenAmountTransferredSA.getTokenTransferredUseCache(
    txId,
    tokenAddress,
    walletAddress,
  );
}

/**
 * Wrapper for library's getTokenTransferred. Fetches token transfer
 * amount without using any cache.  Note that this could trigger an
 * (undesired) API rate limit.
 *
 * @param {string} txId Transaction ID (e.g., from cell L200).
 * @param {string} tokenAddress ERC-20 token address.
 * @param {string} walletAddress Wallet address to check.
 * @return {number} The amount the transaction sent the wallet, or 0 when
 *   it sent none.
 * @throws {Error} The library's error, when a read fails or the chain does
 *   not know the transaction.
 */
function getTokenTransferredNoCache(txId, tokenAddress, walletAddress) {
  return FetchTokenAmountTransferredSA.getTokenTransferred(
    txId,
    tokenAddress,
    walletAddress,
  );
}

/**
 * Test function to verify getTokenTransferredNoCache with example values,
 * which asks the chain without the cache. Logs the result to the console.
 */
function testGetTokenTransferredNoCache() {
  const txId =
    "0xab9c6162b16c9e26149720420cb73c7d445d31b150cf448f3e91da13125b1bd8";
  const tokenAddress = "0x8a7FDcA264e87b6da72D000f22186B4403081A2a";
  const walletAddress = "0xbCB167f16A1aA3ca3F483CC922967e9aCdEC405D";
  const result = getTokenTransferredNoCache(txId, tokenAddress, walletAddress);
  console.log(
    "Test result for example transaction, by getTokenTransferredNoCache: " +
      result,
  );
}

/**
 * Test function to verify getTokenTransferred with example values: it
 * calls it twice, the first call asking the chain and keeping the answer
 * in the library's cache, the second answered from the cache. Logs both
 * results to the console, which are the same.
 */
function testGetTokenTransferred() {
  const txId =
    "0xab9c6162b16c9e26149720420cb73c7d445d31b150cf448f3e91da13125b1bd8";
  const tokenAddress = "0x8a7FDcA264e87b6da72D000f22186B4403081A2a";
  const walletAddress = "0xbCB167f16A1aA3ca3F483CC922967e9aCdEC405D";
  const first = getTokenTransferred(txId, tokenAddress, walletAddress);
  console.log(
    "Test result for example transaction, first call of getTokenTransferred, which asks the chain: " +
      first,
  );
  const second = getTokenTransferred(txId, tokenAddress, walletAddress);
  console.log(
    "Test result for example transaction, second call of getTokenTransferred, which the cache answers: " +
      second,
  );
}
