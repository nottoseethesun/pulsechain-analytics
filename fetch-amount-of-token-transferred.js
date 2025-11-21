/**
 * @fileoverview
 * This is a Node.js program that interacts with the Pulsechain blockchain (a fork of Ethereum) using the ethers.js library.
 * It provides a function to calculate the net positive balance change (assumed to be a token transfer) for a specific ERC-20 token
 * in a given wallet address, based on a transaction ID. The calculation is done by comparing the token balance just before and after
 * the block containing the transaction.
 *
 * @requires Node.js (version 18 or higher recommended for async/await support)
 * @requires ethers.js (install via: npm install ethers)
 *
 * How to use:
 * 1. Install dependencies: Run `npm init -y` followed by `npm install ethers` in your project directory.
 * 2. Save this code as a file, e.g., `getTokenTransferred.js`.
 * 3. Run the script: Execute `node getTokenTransferred.js` to run the included test case, which logs the result to the console.
 * 4. To use the function in your own code: Import it (if modular) or call `getTokenTransferred(txId, tokenAddress, walletAddress)` 
 *    in an async context and await the result.
 *
 * Note: This program connects to a public Pulsechain RPC endpoint ('https://rpc-pulsechain.g4mm4.io'). Ensure the endpoint is reliable;
 *       you may replace it with another RPC provider if needed (e.g., for rate limiting or privacy).
 *
 * Workarounds and Limitations:
 * - This method calculates the balance delta across the entire block, not isolated to the specific transaction. If the block contains
 *   multiple transactions affecting the same wallet/token balance, the result may inaccurately attribute changes from other txs.
 *   A more precise approach would involve parsing transaction logs for Transfer events (using ethers.js filters or receipt.logs).
 * - Handles only positive deltas (assumed incoming transfers); returns 0 for no change or decreases.
 * - Error handling is basic: Returns 0 on any error (e.g., invalid txId, network issues) and logs the error.
 * - The amount is formatted to 7 decimal places and returned as a float; precision may be lost for very large/small values due to JS number limits.
 * - Assumes the token is ERC-20 compliant with `decimals()` and `balanceOf(address)` functions.
 */

import { ethers } from 'ethers';

/**
 * Calculates the net positive token balance change for a wallet in the block containing the given transaction.
 * This is used as a proxy for the amount "transferred" to the wallet, but see workarounds in file header for limitations.
 *
 * @param {string} txId - The transaction hash (e.g., '0xab9c6162b16c9e26149720420cb73c7d445d31b150cf448f3e91da13125b1bd8').
 * @param {string} tokenAddress - The address of the ERC-20 token contract (e.g., '0x8a7FDcA264e87b6da72D000f22186B4403081A2a').
 * @param {string} walletAddress - The wallet address to check for balance changes (e.g., '0xbCB167f16A1aA3ca3F483CC922967e9aCdEC405D').
 * @returns {Promise<number>} The positive balance delta formatted as a float (to 7 decimal places), or 0 if no positive change, transaction not found, or error.
 */
async function getTokenTransferred(txId, tokenAddress, walletAddress) {
  const provider = new ethers.JsonRpcProvider('https://rpc-pulsechain.g4mm4.io');

  try {
    const receipt = await provider.getTransactionReceipt(txId);
    if (!receipt) {
      console.log('Transaction receipt not found.');
      return 0;
    }

    const blockNumber = receipt.blockNumber;
    const prevBlock = blockNumber - 1;

    const tokenContract = new ethers.Contract(tokenAddress, [
      'function decimals() view returns (uint8)',
      'function balanceOf(address) view returns (uint256)'
    ], provider);

    const decimals = await tokenContract.decimals();

    const before = await tokenContract.balanceOf(walletAddress, { blockTag: prevBlock });
    const after = await tokenContract.balanceOf(walletAddress, { blockTag: blockNumber });

    const delta = after - before;
    if (delta <= 0n) {
      return 0;
    }

    const amount = Number(ethers.formatUnits(delta, decimals)).toFixed(7);
    return parseFloat(amount);
  } catch (error) {
    console.error('Error fetching data:', error);
    return 0;
  }
}

/**
 * A test function to demonstrate usage of getTokenTransferred with hardcoded example values.
 * Logs the result to the console.
 *
 * @returns {Promise<void>} Resolves after logging the test result.
 */
// Test case
async function test() {
  const txId = '0xab9c6162b16c9e26149720420cb73c7d445d31b150cf448f3e91da13125b1bd8';
  const tokenAddress = '0x8a7FDcA264e87b6da72D000f22186B4403081A2a';
  const walletAddress = '0xbCB167f16A1aA3ca3F483CC922967e9aCdEC405D';
  const result = await getTokenTransferred(txId, tokenAddress, walletAddress);
  console.log('Test result for example transaction:', result);
}

// test(); // Uncomment to test this module.
