/**
 * Moralis, for the ratio chart: the pair whose candles price each token,
 * the token's name, and the pair's closes over a span of time, asked with
 * the Moralis api key saved in the repo's key store.
 * @module chart-price-ratio/moralis
 *
 * What: Moralis is a service that prices tokens from the pools of
 * decentralized exchanges, and takes an api key. A run whose candles come
 * from Moralis reads two years of daily candles unless `moralis.days` in
 * config.json, or `--moralis-days`, names another span, where
 * GeckoTerminal's free api serves about the last 184 days.
 *
 * How: crypto-price-fetchers' Moralis client
 * (`crypto-price-fetchers/dex-prices/moralis`) asks Moralis. Moralis's
 * candles of a pair price the token the pair lists first, as in HEX / WPLS,
 * which prices HEX. So `moralisPair` lists the pairs that trade a token and
 * takes the deepest active pair that lists it first (`pairListingFirst`);
 * `getClosesMoralis` checks that the token Moralis's answer names is the
 * chart's token, and gives the closes as `{timestamp, close}`, in USD,
 * oldest first. A run whose candles come from Moralis asks GeckoTerminal
 * nothing.
 *
 * Fit: `ratio-series.js` asks it for each of the chart's two tokens in a
 * run from Moralis.
 */

import {
  moralisSettings,
  pairCandles,
  pairListingFirst,
  tokenPairs,
} from "crypto-price-fetchers/dex-prices/moralis";

/**
 * Moralis's timeframe for each interval whose candles the chart asks it
 * for: the weekly chart is made from daily candles.
 */
export const MORALIS_TIMEFRAMES = Object.freeze({ hourly: "1h", daily: "1d" });

/**
 * A token's name as the chart's title shows it: its name and symbol, its
 * symbol alone when Moralis gives no name, or a stand-in.
 *
 * @param {(import('crypto-price-fetchers/dex-prices/moralis').PairToken|undefined)} token - The token, as the pair lists it
 * @returns {string} The name
 */
function chartName(token) {
  if (token === undefined || token.symbol === "") return "???";
  return token.name === "" ? token.symbol : `${token.name} (${token.symbol})`;
}

/**
 * Finds the pair whose candles price a token: the deepest active pair that
 * lists it first.
 *
 * @param {{chain: string}} moralis - Moralis's id for the chain, such as '0x171'
 * @param {string} apiKey - The Moralis api key
 * @param {string} token - The token's address, in lower case
 * @returns {Promise<{address: string, label: string, token: string, name: string}>} The pair's address and label, the token, and its name
 * @throws {Error} When Moralis answers with an error, or lists no active pair that lists the token first
 */
export async function moralisPair(moralis, apiKey, token) {
  const pairs = await tokenPairs(
    { chain: moralis.chain, token },
    apiKey,
    moralisSettings(),
  );
  const pair = pairListingFirst(pairs, token);
  if (pair === null) {
    throw new Error(
      `Moralis lists no active pair that lists ${token} first, so its candles cannot price it: run the chart again with --source geckoterminal`,
    );
  }
  console.log(
    `Pool ${pair.address.slice(0, 8)}... (${pair.label}): Liquidity ~$${pair.liquidityUsd.toLocaleString()}`,
  );
  return {
    address: pair.address,
    label: pair.label,
    token,
    name: chartName(pair.tokens.find(({ address }) => address === token)),
  };
}

/**
 * Fetches a token's closing prices in its pair, from Moralis's candles.
 *
 * @param {Object} query - What to fetch
 * @param {{chain: string}} query.moralis - Moralis's id for the chain
 * @param {{address: string, token: string}} query.pair - The pair, and the token it lists first (`moralisPair`)
 * @param {string} query.timeframe - Moralis's timeframe, such as '1d' (MORALIS_TIMEFRAMES)
 * @param {number} query.fromSeconds - The span's first time, in unix seconds
 * @param {number} query.toSeconds - The span's last time, in unix seconds
 * @param {string} apiKey - The Moralis api key
 * @returns {Promise<Array<{timestamp: number, close: number}>>} Each candle's time, in milliseconds, and close, oldest first
 * @throws {Error} When Moralis answers with an error, has no candles, or its candles price another token
 */
export async function getClosesMoralis(
  { moralis, pair, timeframe, fromSeconds, toSeconds },
  apiKey,
) {
  const { tokenAddress, candles } = await pairCandles(
    {
      chain: moralis.chain,
      pair: pair.address,
      timeframe,
      fromSeconds,
      toSeconds,
    },
    apiKey,
    moralisSettings(),
  );
  if (candles.length === 0) {
    throw new Error(`Moralis has no candles for pool ${pair.address}`);
  }
  if (tokenAddress !== pair.token) {
    throw new Error(
      `Moralis's candles of pool ${pair.address} price ${tokenAddress ?? "a token its answer does not name"}, not ${pair.token}`,
    );
  }
  return candles.map((candle) => ({
    timestamp: candle.seconds * 1000,
    close: candle.close,
  }));
}
