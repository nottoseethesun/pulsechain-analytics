/**
 * GeckoTerminal's api, for the ratio chart: a token's name and symbol, and
 * a pool's closing prices from its candles. It needs no key.
 * @module chart-price-ratio/gecko-terminal
 *
 * `pulse-token-ratio.js` and `pool-selector.js` both ask it, so it is a
 * module of its own, which neither of them imports the other for.
 */

/** GeckoTerminal's api. */
const GECKO_TERMINAL = "https://api.geckoterminal.com/api/v2";

/**
 * Fetches a token's name and symbol.
 *
 * @param {string} network - GeckoTerminal's name for the network, such as `pulsechain`
 * @param {string} tokenAddress - The token's contract address
 * @returns {Promise<{name: string, symbol: string}>} Its name and symbol, or stand-ins when GeckoTerminal does not answer
 */
export async function getTokenInfo(network, tokenAddress) {
  const url = `${GECKO_TERMINAL}/networks/${network}/tokens/${tokenAddress}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(
      `Could not fetch token info for ${tokenAddress}: ${res.status}`,
    );
    return { name: "Unknown Token", symbol: "???" };
  }
  const json = await res.json();
  const data = json.data.attributes;
  return {
    name: data.name || "Unknown Token",
    symbol: data.symbol || "???",
  };
}

/**
 * Fetches a pool's closing prices from GeckoTerminal's candles.
 *
 * @param {string} network - GeckoTerminal's name for the network, such as `pulsechain`
 * @param {string} poolAddress - The pool's address
 * @param {string} [timeframe='day'] - The candles' timeframe: `day` or `hour`
 * @param {number} [limit=1000] - The most candles to fetch
 * @returns {Promise<Array<{timestamp: number, close: number}>>} Each candle's time, in milliseconds, and close
 * @throws {Error} When GeckoTerminal does not answer, or has no candles
 */
export async function getClosesGecko(
  network,
  poolAddress,
  timeframe = "day",
  limit = 1000,
) {
  const url = `${GECKO_TERMINAL}/networks/${network}/pools/${poolAddress}/ohlcv/${timeframe}?limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gecko OHLCV fetch failed (${res.status})`);
  const json = await res.json();
  const list = json.data.attributes.ohlcv_list;
  if (list.length === 0) throw new Error("Empty OHLCV data");
  return list.map((c) => ({ timestamp: c[0] * 1000, close: parseFloat(c[4]) }));
}
