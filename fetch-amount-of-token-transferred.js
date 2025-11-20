import { ethers } from 'ethers';

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

// Test case
async function test() {
  const txId = '0xab9c6162b16c9e26149720420cb73c7d445d31b150cf448f3e91da13125b1bd8';
  const tokenAddress = '0x8a7FDcA264e87b6da72D000f22186B4403081A2a';
  const walletAddress = '0xbCB167f16A1aA3ca3F483CC922967e9aCdEC405D';
  const result = await getTokenTransferred(txId, tokenAddress, walletAddress);
  console.log('Test result for example transaction:', result);
}

test();
