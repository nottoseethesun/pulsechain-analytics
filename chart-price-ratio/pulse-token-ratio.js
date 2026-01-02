/**
 * pulse-token-ratio.js
 * 
 * A flexible Node.js script to display the price ratio of any two PulseChain tokens
 * (Token A / Token B) in a single ASCII chart, even when no direct liquidity pool exists between them.
 * 
 * How it works:
 *  - Primarily uses GeckoTerminal API (free, no key) to discover pools and fetch historical OHLCV data.
 *  - Smart pool selection via pool-selector.js module.
 *  - Computes the ratio: price_A_in_PLS / price_B_in_PLS → direct comparable ratio.
 *  - Supports hourly, daily, and weekly timeframes.
 *  - Improved ASCII chart:
 *    • Y-scale uses data min/max with smart tick spacing for unique, readable values.
 *    • Uses sufficient precision to avoid repeated tick labels.
 *    • Switches to scientific notation for values < 0.0001.
 *    • All y-tick labels are right-padded for perfect visual alignment.
 *    • X-scale with perfectly aligned sparse date/hour labels.
 *  - Optional CSV export.
 * 
 * Fallback: If GeckoTerminal fails, uses current USD prices via DexTools v2 API.
 * 
 * Installation:
 *   1. Ensure nodejs v18+ is installed.
 *   2. Run: npm install
 *   3. (Optional) Edit config.json
 * 
 * Configuration:
 *   - All settings are loaded from config.json in the same directory.
 *   - Command-line flags can override specific config values (see examples below).
 *   - Supported overrides:
 *     --network=<value>       (e.g., --network=eth for Ethereum; default: pulsechain)
 *     --chain=<value>         (e.g., --chain=ether for DexTools chain name)
 *     --api-key=<value>       (overrides dextools.apiKey for DexTools fallback)
 *     --subscription=<value>  (overrides dextools.subscription, e.g., pro)
 *     --host=<value>          (overrides dextools.host URL)
 *     --version=<value>       (overrides dextools.version, e.g., v3)
 *     --csv-filename=<value>  (overrides csvFilename, e.g., my_ratio.csv)
 *     --interval=<value>      (overrides interval: hourly/daily/weekly)
 *     --max-candles=<number>  (overrides maxCandles, e.g., 500)
 *     --weekly-days=<number>  (overrides weeklyResampleDays, e.g., 14 for bi-weekly)
 * 
 * Requirements:
 *   Node.js v18+ (native fetch, ESM support)
 *   npm install asciichart
 * 
 * Usage Examples:
 *   # Basic: weekly ratio (default) for two tokens
 *   node pulse-token-ratio.js 0x50f1ca62e6fb8adf438ca1f50067ab83670094a6 0x94534eeee131840b1c0f61847c572228bdfdde93
 * 
 *   # Specify interval
 *   node pulse-token-ratio.js <tokenA> <tokenB> daily
 *   node pulse-token-ratio.js <tokenA> <tokenB> hourly
 * 
 *   # With CSV export
 *   node pulse-token-ratio.js <tokenA> <tokenB> weekly --csv
 * 
 *   # Override config values via flags
 *   node pulse-token-ratio.js <tokenA> <tokenB> --network=eth --api-key=ABC123 --csv-filename=custom.csv --csv
 * 
 *   # Combine interval and overrides
 *   node pulse-token-ratio.js <tokenA> <tokenB> weekly --max-candles=500 --weekly-days=14 --csv
 * 
 * Notes:
 *  - Token addresses must be lowercase hex (0x + 40 chars).
 *  - For DexTools fallback, configure a valid apiKey in config.json or via --api-key flag.
 *  - Intervals finer than 'hourly' are not supported by GeckoTerminal and will cause graceful failure.
 *  - Y-scale automatically computes unique tick values using a nice number algorithm.
 *  - X-scale shows sparse timestamps perfectly aligned with chart columns.
 *  - CSV includes columns: date, price_tokenA, price_tokenB, ratio.
 *  - Edit config.json for persistent changes; use flags for one-off overrides.
 */

import asciichart from 'asciichart';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { getBestPoolWithHistory } from './pool-selector.js';

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load config
const configPath = path.join(__dirname, 'config.json');
let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
  console.error('Error loading config.json:', err.message);
  process.exit(1);
}

const {
  network: defaultNetwork = 'pulsechain',
  chain: defaultChain = 'pulse',
  dextools: defaultDextools = {},
  csvFilename: defaultCsvFilename = 'token_ratio.csv',
  interval: configInterval = 'weekly',
  maxCandles: defaultMaxCandles = 1000,
  weeklyResampleDays: defaultWeeklyResampleDays = 7
} = config;

const { 
  apiKey: defaultApiKey = 'YOUR_API_KEY_HERE', 
  subscription: defaultSubscription = 'standard', 
  host: defaultHost = 'https://public-api.dextools.io', 
  version: defaultVersion = 'v2' 
} = defaultDextools;

// Parse args
const args = process.argv.slice(2);
const flags = {};
let positionalArgs = [];

args.forEach(arg => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=');
    flags[key] = value !== undefined ? value : true;
  } else {
    positionalArgs.push(arg);
  }
});

if (positionalArgs.length < 2) {
  console.error('Usage: node pulse-token-ratio.js <tokenA> <tokenB> [hourly|daily|weekly] [--csv] ...');
  process.exit(1);
}

let tokenA = positionalArgs[0].toLowerCase();
let tokenB = positionalArgs[1].toLowerCase();

let interval = positionalArgs.slice(2).find(a => ['hourly', 'daily', 'weekly'].includes(a)) 
  || flags.interval 
  || configInterval;

if (!['hourly', 'daily', 'weekly'].includes(interval)) {
  console.error('Invalid or unsupported interval. Supported values: hourly, daily, weekly.\n' +
                'Finer intervals (e.g., minute, second) are not available via GeckoTerminal OHLCV API.');
  process.exit(1);
}

const saveCsv = !!flags.csv;

const network = flags.network || defaultNetwork;
const chain = flags.chain || defaultChain;
const DEXTOOLS_API_KEY = flags['api-key'] || defaultApiKey;
const DEXTOOLS_SUBSCRIPTION = flags.subscription || defaultSubscription;
const DEXTOOLS_HOST = flags.host || defaultHost;
const DEXTOOLS_VERSION = flags.version || defaultVersion;
const csvFilename = flags['csv-filename'] || defaultCsvFilename;
const maxCandles = parseInt(flags['max-candles'] || defaultMaxCandles, 10);
const weeklyResampleDays = parseInt(flags['weekly-days'] || defaultWeeklyResampleDays, 10);

// Check DexTools API key and warn if missing
if (!DEXTOOLS_API_KEY || DEXTOOLS_API_KEY === 'YOUR_API_KEY_HERE') {
  console.warn('\n⚠️  No valid DexTools API key provided.');
  console.warn('   → Fallback to current prices will not be available if GeckoTerminal fails.');
  console.warn('   → To enable fallback, add your key to config.json or use --api-key=your_key');
  console.warn('   → Get a key at: https://developers.dextools.io/\n');
}

/**
 * Fetch token name and symbol
 * @param {string} tokenAddress
 * @returns {Promise<{name: string, symbol: string}>}
 */
async function getTokenInfo(tokenAddress) {
  const url = `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${tokenAddress}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`Could not fetch token info for ${tokenAddress}: ${res.status}`);
    return { name: 'Unknown Token', symbol: '???' };
  }
  const json = await res.json();
  const data = json.data.attributes;
  return {
    name: data.name || 'Unknown Token',
    symbol: data.symbol || '???'
  };
}

/**
 * Fetches closing prices from GeckoTerminal
 * @param {string} poolAddress
 * @param {string} timeframe
 * @param {number} limit
 * @returns {Promise<Array<{timestamp: number, close: number}>>}
 */
export async function getClosesGecko(poolAddress, timeframe = 'day', limit = 1000) {
  const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${poolAddress}/ohlcv/${timeframe}?limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gecko OHLCV fetch failed (${res.status})`);
  const json = await res.json();
  const list = json.data.attributes.ohlcv_list;
  if (list.length === 0) throw new Error('Empty OHLCV data');
  return list.map(c => ({ timestamp: c[0] * 1000, close: parseFloat(c[4]) }));
}

/**
 * Fallback current USD price via DexTools
 * @param {string} tokenAddress
 * @returns {Promise<number>}
 */
async function getCurrentUsdPriceDexTools(tokenAddress) {
  if (!DEXTOOLS_API_KEY || DEXTOOLS_API_KEY === 'YOUR_API_KEY_HERE') {
    throw new Error('DexTools API key missing — cannot fetch current price fallback');
  }
  const url = `${DEXTOOLS_HOST}/${DEXTOOLS_SUBSCRIPTION}/${DEXTOOLS_VERSION}/token/${chain}/${tokenAddress}/price`;
  const res = await fetch(url, { headers: { 'x-api-key': DEXTOOLS_API_KEY } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DexTools error ${res.status}: ${text}`);
  }
  const json = await res.json();
  const price = json.data?.price;
  if (!price) throw new Error('Price field missing');
  console.log(`DexTools USD price for ${tokenAddress.slice(0, 8)}...: $${price}`);
  return parseFloat(price);
}

/**
 * Resample to weekly
 * @param {Array<{timestamp: number, close: number}>} dailyData
 * @returns {Array<{timestamp: number, close: number}>}
 */
function resampleToWeekly(dailyData) {
  if (dailyData.length === 0) return [];
  const weekly = [];
  let weekStart = dailyData[0].timestamp;
  let weekClose = dailyData[0].close;
  for (const d of dailyData.slice(1)) {
    if (d.timestamp - weekStart >= weeklyResampleDays * 24 * 60 * 60 * 1000) {
      weekly.push({ timestamp: weekStart, close: weekClose });
      weekStart = d.timestamp;
    }
    weekClose = d.close;
  }
  weekly.push({ timestamp: weekStart, close: weekClose });
  return weekly;
}

/**
 * Generate nice tick values for y-axis (unique, human-readable numbers)
 * @param {number} min
 * @param {number} max
 * @param {number} tickCount Approx number of ticks desired (default 10)
 * @returns {Array<number>} Array of tick values
 */
function generateNiceTicks(min, max, tickCount = 10) {
  if (min === max) return [min];

  const range = max - min;
  const roughStep = range / (tickCount - 1);

  // Handle very small ranges by using a minimum step based on precision
  const minStep = range * 1e-10;
  const stepMagnitude = Math.pow(10, Math.floor(Math.log10(Math.max(roughStep, minStep))));

  let step = Math.pow(10, Math.floor(Math.log10(roughStep)));
  if (roughStep / step > 5) step *= 5;
  else if (roughStep / step > 2) step *= 2;

  step = Math.max(step, range / 1000);

  let start = Math.floor(min / step) * step;
  if (start < min) start += step;

  const ticks = [];
  for (let val = start; val <= max + step / 2; val += step) {
    if (val >= min - step / 10) {
      ticks.push(val);
    }
  }

  if (Math.abs(ticks[0] - min) > step / 10) {
    ticks.unshift(min);
  }
  if (Math.abs(ticks[ticks.length - 1] - max) > step / 10) {
    ticks.push(max);
  }

  const uniqueTicks = [...new Set(ticks.map(v => Number(v.toFixed(15))))];
  uniqueTicks.sort((a, b) => a - b);

  return uniqueTicks;
}

/**
 * Main function
 */
async function main() {
  if (!/^0x[a-f0-9]{40}$/.test(tokenA) || !/^0x[a-f0-9]{40}$/.test(tokenB)) {
    console.error('Invalid contract address format.');
    process.exit(1);
  }

  console.log(`\nComputing ratio: ${tokenA.slice(0, 8)}... / ${tokenB.slice(0, 8)}... (${interval})\n`);

  const [tokenAInfo, tokenBInfo] = await Promise.all([
    getTokenInfo(tokenA),
    getTokenInfo(tokenB)
  ]);

  const tokenAName = tokenAInfo.name !== 'Unknown Token' ? `${tokenAInfo.name} (${tokenAInfo.symbol})` : tokenAInfo.symbol;
  const tokenBName = tokenBInfo.name !== 'Unknown Token' ? `${tokenBInfo.name} (${tokenBInfo.symbol})` : tokenBInfo.symbol;

  let poolA, poolB;
  try {
    poolA = await getBestPoolWithHistory(tokenA, network, maxCandles);
    poolB = await getBestPoolWithHistory(tokenB, network, maxCandles);
  } catch (e) {
    console.warn(`GeckoTerminal pool discovery failed: ${e.message}`);
    throw e;
  }

  let dataA, dataB, source = 'GeckoTerminal (PLS-based historical)';

  try {
    if (interval === 'weekly') {
      console.log('Fetching daily data for weekly resampling...');
      const dailyA = await getClosesGecko(poolA.address, 'day', maxCandles);
      const dailyB = await getClosesGecko(poolB.address, 'day', maxCandles);
      dataA = resampleToWeekly(dailyA);
      dataB = resampleToWeekly(dailyB);
    } else {
      const tf = interval === 'hourly' ? 'hour' : 'day';
      console.log(`Fetching ${interval} data...`);
      dataA = await getClosesGecko(poolA.address, tf, maxCandles);
      dataB = await getClosesGecko(poolB.address, tf, maxCandles);
    }
  } catch (e) {
    console.warn(`GeckoTerminal historical data failed: ${e.message}`);
    if (DEXTOOLS_API_KEY && DEXTOOLS_API_KEY !== 'YOUR_API_KEY_HERE') {
      console.log('Falling back to current USD prices via DexTools (single point only)...');
      source = 'DexTools (current USD-based ratio)';
      const priceA = await getCurrentUsdPriceDexTools(tokenA);
      const priceB = await getCurrentUsdPriceDexTools(tokenB);
      const now = Date.now();
      dataA = [{ timestamp: now, close: priceA }];
      dataB = [{ timestamp: now, close: priceB }];
    } else {
      console.error('Cannot fall back to current prices: No DexTools API key provided.');
      console.error('Add your key to config.json or use --api-key flag to enable fallback.');
      return;
    }
  }

  const minLen = Math.min(dataA.length, dataB.length);
  const rows = [];
  const ratios = [];
  const timestamps = [];

  for (let i = 0; i < minLen; i++) {
    const pA = dataA[i].close;
    const pB = dataB[i].close;
    if (pB > 0 && pA > 0) {
      const ratio = pA / pB;
      ratios.push(ratio);
      timestamps.push(dataA[i].timestamp);
      const date = new Date(dataA[i].timestamp).toISOString().split('T')[0];
      rows.push({ date, priceA: pA.toFixed(12), priceB: pB.toFixed(12), ratio: ratio.toFixed(12) });
    }
  }

  if (ratios.length === 0) {
    console.error('No valid ratio data could be computed.');
    return;
  }

  console.log(`\n${tokenAName} / ${tokenBName} ratio (${interval}, ${ratios.length} points) - Source: ${source}`);
  console.log(`C.A.: ${tokenA} / ${tokenB}\n`);

  if (ratios.length > 1) {
    const minRatio = Math.min(...ratios);
    const maxRatio = Math.max(...ratios);
    const range = maxRatio - minRatio;

    // Raw formatter for calculating label length
    const formatYRaw = (value) => {
      let precision = 6;
      if (range < 0.01) precision = 8;
      if (range < 0.001) precision = 10;
      if (range < 0.0001) precision = 12;
      if (range < 0.00001) {
        return value.toExponential(4);
      }

      let formatted = value.toFixed(precision);
      formatted = formatted.replace(/0+$/, '');
      if (formatted.endsWith('.')) formatted = formatted.slice(0, -1);
      return formatted || '0';
    };

    // Find max label length for padding
    const testTicks = generateNiceTicks(minRatio, maxRatio, 10);
    const rawLabels = testTicks.map(formatYRaw);
    const maxLabelLength = Math.max(...rawLabels.map(l => l.length), 1);

    // Final formatter with right-padding
    const formatY = (value) => {
      const raw = formatYRaw(value);
      return raw.padEnd(maxLabelLength, ' ');
    };

    const chartConfig = {
      height: 30,
      min: minRatio,
      max: maxRatio,
      format: formatY,
    };

    const chartLines = asciichart.plot(ratios, chartConfig).split('\n');
    chartLines.forEach(line => console.log(line));

    const yTickWidth = maxLabelLength + 2; // +2 for " ┤"
    const maxLabels = 10;
    const minLabels = 4;
    const labelCount = Math.min(maxLabels, Math.max(minLabels, Math.ceil(ratios.length / 30)));
    const step = Math.floor((ratios.length - 1) / (labelCount - 1));

    const labels = [];
    for (let i = 0; i < labelCount - 1; i++) {
      labels.push({ idx: i * step, ts: timestamps[i * step] });
    }
    labels.push({ idx: ratios.length - 1, ts: timestamps[timestamps.length - 1] });

    const formatLabel = (ts) => {
      const d = new Date(ts);
      if (interval === 'hourly') {
        return d.toISOString().replace('T', ' ').slice(0, 16);
      }
      return d.toISOString().split('T')[0];
    };

    const labelTexts = labels.map(l => formatLabel(l.ts));

    let xAxis = '';
    let prevEnd = 0;
    for (let i = 0; i < labels.length; i++) {
      const { idx } = labels[i];
      const text = labelTexts[i];
      const padding = idx - prevEnd;
      xAxis += ' '.repeat(padding) + text;
      prevEnd = idx + text.length;
    }

    console.log(' '.repeat(yTickWidth) + xAxis);
  } else {
    console.log('(Single data point - no historical chart available)');
    console.log('Note: This often occurs with new or low-volume pools. Try a shorter interval.\n');
  }

  console.log('\nRecent ratios (last 10):');
  rows.slice(-10).forEach(r => console.log(`${r.date}: ${r.ratio}`));
  console.log(`\nCurrent ratio: ${ratios[ratios.length - 1].toFixed(12)}`);

  if (saveCsv) {
    const csv = 'date,price_tokenA,price_tokenB,ratio\n' +
      rows.map(r => `${r.date},${r.priceA},${r.priceB},${r.ratio}`).join('\n');
    fs.writeFileSync(csvFilename, csv);
    console.log(`\nCSV saved as ${csvFilename}`);
  }
}

main().catch(err => console.error('Fatal error:', err.message));
