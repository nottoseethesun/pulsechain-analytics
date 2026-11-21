/**
 * Picks the pool the ratio chart reads a token's prices from.
 * @module chart-price-ratio/pool-selector
 *
 * What: the chart needs a pool with liquidity, so its prices are the
 * market's, and with history, so the chart reaches back. The pool with the
 * most liquidity can be new, with little history, while a pool with a
 * little less has much more.
 *
 * How: it takes the five pools of the token that hold the most value, as
 * GeckoTerminal lists them (`gecko-terminal.js`), and counts each one's
 * daily candles, up to the chart's most. It keeps the pool with the most
 * liquidity, unless that pool has less than half the history of the
 * deepest one: then it takes the deepest pool that holds at least a tenth
 * of the top pool's liquidity. A pool with no candles is left out.
 *
 * Fit: `ratio-series.js` asks it for each of the chart's two tokens.
 */

import { getClosesGecko, getTokenPools } from "./gecko-terminal.js";

/**
 * Picks the pool a token's prices are read from, from GeckoTerminal's
 * list of its pools, by the rule the module's header gives.
 *
 * @param {string} tokenAddress - Token contract address (lowercase)
 * @param {string} network - Network name for GeckoTerminal API (e.g., 'pulsechain')
 * @param {number} maxCandles - Maximum candles to fetch for history check
 * @returns {Promise<{address: string, token: string, name: string, liquidity: number, historyDays: number}>}
 *          Selected pool details, with the token whose prices the chart reads from it
 */
export async function getBestPoolWithHistory(
  tokenAddress,
  network = "pulsechain",
  maxCandles = 1000,
) {
  const pools = await getTokenPools(network, tokenAddress);
  if (pools.length === 0) throw new Error("No pools found on GeckoTerminal");

  // Sort by liquidity descending
  pools.sort((a, b) => b.liquidityUsd - a.liquidityUsd);

  // Limit to top 5 to reduce API load
  const topPools = pools.slice(0, Math.min(5, pools.length));

  const poolHistories = [];
  for (const pool of topPools) {
    try {
      const ohlcv = await getClosesGecko({
        network,
        pool: pool.address,
        token: tokenAddress,
        timeframe: "day",
        limit: maxCandles,
      });
      const entry = {
        address: pool.address,
        token: tokenAddress,
        name: pool.name,
        liquidity: pool.liquidityUsd,
        historyDays: ohlcv.length,
      };
      poolHistories.push(entry);
      console.log(
        `Pool ${entry.address.slice(0, 8)}... (${entry.name}): Liquidity ~$${entry.liquidity.toLocaleString()}, History: ${entry.historyDays} days`,
      );
    } catch {
      console.warn(`Skipping pool ${pool.address}: no historical data`);
    }
  }

  if (poolHistories.length === 0)
    throw new Error("No pools with historical data found");

  // Determine maximum history depth
  const maxHistory = Math.max(...poolHistories.map((p) => p.historyDays));

  const topPool = poolHistories[0];
  const topLiquidity = topPool.liquidity;

  // Use top liquidity pool if it has reasonable history
  if (topPool.historyDays >= 0.5 * maxHistory) {
    console.log(
      `Selected top liquidity pool for ${tokenAddress.slice(0, 8)}...: ${topPool.name} (${topPool.address})`,
    );
    return topPool;
  }

  // Look for deeper-history alternative with decent liquidity
  const thresholdLiquidity = 0.1 * topLiquidity;
  const goodAlternatives = poolHistories.filter(
    (p) => p.historyDays === maxHistory && p.liquidity >= thresholdLiquidity,
  );

  if (goodAlternatives.length > 0) {
    goodAlternatives.sort((a, b) => b.liquidity - a.liquidity);
    const selected = goodAlternatives[0];
    console.log(
      `Switched to deeper-history pool for ${tokenAddress.slice(0, 8)}...: ${selected.name} (${selected.address}) - ${selected.historyDays} days history`,
    );
    return selected;
  }

  // Fallback to top liquidity
  console.log(
    `No suitable deeper-history pool found; using top liquidity pool for ${tokenAddress.slice(0, 8)}...: ${topPool.name} (${topPool.address})`,
  );
  return topPool;
}
