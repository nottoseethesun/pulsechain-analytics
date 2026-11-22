/**
 * GeckoTerminal, for the ratio chart: a token's name and symbol, the pools
 * that trade it, and a pool's closing prices from its candles. It needs no
 * key.
 * @module chart-price-ratio/gecko-terminal
 *
 * What: the chart titles its two tokens by name, picks a pool for each
 * (`pool-selector.js`), and charts the ratio of the two pools' closes.
 *
 * How: crypto-price-fetchers' GeckoTerminal client
 * (`crypto-price-fetchers/dex-prices/geckoterminal`) asks GeckoTerminal.
 * It keeps within its budget of requests, sends a request refused as too
 * many (429) again after its waits, and reads the answers as numbers. This
 * module shapes them as the chart uses them: a name and symbol, with
 * stand-ins where GeckoTerminal gives none, and a token's closes in a pool
 * as `{timestamp, close}`, in USD, oldest first: GeckoTerminal gives the
 * candles newest first, and the chart reads its series from the oldest.
 *
 * Fit: `ratio-series.js` and `pool-selector.js` both ask it, so it is a
 * module of its own, which neither of them imports the other for.
 */

import {
  candlePage,
  geckoTerminalSettings,
  tokenInfo,
  tokenPools,
} from "crypto-price-fetchers/dex-prices/geckoterminal";

/** The name a token is given when GeckoTerminal gives none. */
const UNKNOWN_NAME = "Unknown Token";

/** The symbol a token is given when GeckoTerminal gives none. */
const UNKNOWN_SYMBOL = "???";

/**
 * A text GeckoTerminal gave, or a stand-in where it gave none or an empty
 * one.
 *
 * @param {(string|null)} text - What GeckoTerminal gave
 * @param {string} standIn - The stand-in
 * @returns {string} The text, or the stand-in
 */
function textOr(text, standIn) {
  return typeof text === "string" && text !== "" ? text : standIn;
}

/**
 * Fetches a token's name and symbol.
 *
 * @param {string} network - GeckoTerminal's name for the network, such as `pulsechain`
 * @param {string} tokenAddress - The token's contract address
 * @returns {Promise<{name: string, symbol: string}>} Its name and symbol, or stand-ins when GeckoTerminal does not answer
 */
export async function getTokenInfo(network, tokenAddress) {
  try {
    const info = await tokenInfo(
      { network, token: tokenAddress },
      geckoTerminalSettings(),
    );
    return {
      name: textOr(info.name, UNKNOWN_NAME),
      symbol: textOr(info.symbol, UNKNOWN_SYMBOL),
    };
  } catch (e) {
    console.warn(
      `Could not fetch token info for ${tokenAddress}: ${e.message}`,
    );
    return { name: UNKNOWN_NAME, symbol: UNKNOWN_SYMBOL };
  }
}

/**
 * Lists the pools that trade a token, in GeckoTerminal's order.
 *
 * @param {string} network - GeckoTerminal's name for the network, such as `pulsechain`
 * @param {string} tokenAddress - The token's contract address
 * @returns {Promise<Array<{address: string, name: string, liquidityUsd: number}>>} The pools, with the value each holds, in USD
 * @throws {Error} When GeckoTerminal does not answer
 */
export async function getTokenPools(network, tokenAddress) {
  return tokenPools({ network, token: tokenAddress }, geckoTerminalSettings());
}

/**
 * Fetches a token's closing prices in a pool, from GeckoTerminal's candles.
 * The token is named by its address, since a pool's candles price its base
 * token unless they name another, and the token can be on either side of
 * the pool.
 *
 * @param {Object} query - What to fetch
 * @param {string} query.network - GeckoTerminal's name for the network, such as `pulsechain`
 * @param {string} query.pool - The pool's address
 * @param {string} query.token - The token's address
 * @param {string} [query.timeframe='day'] - The candles' timeframe: `day` or `hour`
 * @param {number} [query.limit=1000] - The most candles to fetch
 * @returns {Promise<Array<{timestamp: number, close: number}>>} Each candle's time, in milliseconds, and close, oldest first
 * @throws {Error} When GeckoTerminal does not answer, or has no candles
 */
export async function getClosesGecko({
  network,
  pool,
  token,
  timeframe = "day",
  limit = 1000,
}) {
  const page = await candlePage(
    { network, pool, token, timeframe, limit },
    geckoTerminalSettings(),
  );
  if (page.candles.length === 0) throw new Error("Empty OHLCV data");
  return page.candles
    .map((candle) => ({ timestamp: candle[0] * 1000, close: candle[4] }))
    .sort((a, b) => a.timestamp - b.timestamp);
}
