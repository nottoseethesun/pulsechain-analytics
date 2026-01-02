/**
 * pool-selector.js
 * 
 * Standalone module for intelligently selecting the best liquidity pool
 * for a given token on GeckoTerminal.
 * 
 * Logic:
 * - Fetches the top 5 pools by liquidity.
 * - Measures historical data depth (daily candles) for each.
 * - Prefers the highest-liquidity pool.
 * - If that pool has less than 50% of the deepest history available,
 *   switches to the pool with the longest history, provided it has
 *   at least 10% of the top pool's liquidity.
 * 
 * This prevents using a high-liquidity but brand-new pool when
 * a slightly lower-liquidity pool has much deeper historical data.
 */

import { getClosesGecko } from './pulse-token-ratio.js'; // Circular avoided: only used internally

/**
 * Fetches the best liquidity pool for a token using GeckoTerminal,
 * prioritizing history depth when the top pool is shallow.
 * 
 * @param {string} tokenAddress - Token contract address (lowercase)
 * @param {string} network - Network name for GeckoTerminal API (e.g., 'pulsechain')
 * @param {number} maxCandles - Maximum candles to fetch for history check
 * @returns {Promise<{address: string, name: string, liquidity: number, historyDays: number}>}
 *          Selected pool details
 */
export async function getBestPoolWithHistory(tokenAddress, network = 'pulsechain', maxCandles = 1000) {
  const url = `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${tokenAddress}/pools?page=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gecko pool discovery failed (${res.status})`);
  const json = await res.json();
  let pools = json.data;
  if (pools.length === 0) throw new Error('No pools found on GeckoTerminal');

  // Sort by liquidity descending
  pools.sort((a, b) => parseFloat(b.attributes.reserve_in_usd) - parseFloat(a.attributes.reserve_in_usd));

  // Limit to top 5 to reduce API load
  const topPools = pools.slice(0, Math.min(5, pools.length));

  const poolHistories = [];
  for (const pool of topPools) {
    try {
      const ohlcv = await getClosesGecko(pool.attributes.address, 'day', maxCandles);
      const historyLength = ohlcv.length;
      const entry = {
        address: pool.attributes.address,
        name: pool.attributes.name,
        liquidity: parseFloat(pool.attributes.reserve_in_usd),
        historyDays: historyLength,
      };
      poolHistories.push(entry);
      console.log(`Pool ${entry.address.slice(0, 8)}... (${entry.name}): Liquidity ~$${entry.liquidity.toLocaleString()}, History: ${entry.historyDays} days`);
    } catch (err) {
      console.warn(`Skipping pool ${pool.attributes.address}: no historical data`);
    }
  }

  if (poolHistories.length === 0) throw new Error('No pools with historical data found');

  // Determine maximum history depth
  const maxHistory = Math.max(...poolHistories.map(p => p.historyDays));

  const topPool = poolHistories[0];
  const topLiquidity = topPool.liquidity;

  // Use top liquidity pool if it has reasonable history
  if (topPool.historyDays >= 0.5 * maxHistory) {
    console.log(`Selected top liquidity pool for ${tokenAddress.slice(0, 8)}...: ${topPool.name} (${topPool.address})`);
    return topPool;
  }

  // Look for deeper-history alternative with decent liquidity
  const thresholdLiquidity = 0.1 * topLiquidity;
  const goodAlternatives = poolHistories.filter(
    p => p.historyDays === maxHistory && p.liquidity >= thresholdLiquidity
  );

  if (goodAlternatives.length > 0) {
    goodAlternatives.sort((a, b) => b.liquidity - a.liquidity);
    const selected = goodAlternatives[0];
    console.log(`Switched to deeper-history pool for ${tokenAddress.slice(0, 8)}...: ${selected.name} (${selected.address}) - ${selected.historyDays} days history`);
    return selected;
  }

  // Fallback to top liquidity
  console.log(`No suitable deeper-history pool found; using top liquidity pool for ${tokenAddress.slice(0, 8)}...: ${topPool.name} (${topPool.address})`);
  return topPool;
}
