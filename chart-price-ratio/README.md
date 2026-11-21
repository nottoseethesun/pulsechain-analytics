# PulseChain Token Ratio Chart

A Node tool that charts the ratio of two PulseChain tokens' prices (token A
/ token B) in the terminal, even when no pool trades one for the other. It
prices each token in USD, from a pool of its own, whichever side of the
pool the token is on, so the ratio of the two prices needs no pool between
them.

The prices come from **GeckoTerminal**, a service that lists the pools of
decentralized exchanges with their prices and candles, and needs no api
key. The chart asks it through the GeckoTerminal client of
crypto-price-fetchers, the owner's repo of code his projects share. When
GeckoTerminal has no candles, the chart falls back to each token's current
price from **DexTools**, a second such service, which takes an api key:
one point.

IMPORTANT: Use at your own risk as defined in the included file, `../LICENSE`.

## Features

What the chart does, in brief. The file header of `pulse-token-ratio.js`
gives the details.

- **Pool choice:** for each token, it takes the most liquid of its five
  most liquid pools. A new pool can be the most liquid, with little
  history, so if that pool's history is less than half the longest among
  the five, it takes the pool with the longest history instead, provided
  that pool has at least a tenth of the top pool's liquidity.
- **Names:** it shows each token's name, symbol and contract address.
- **Y-axis:** it spans the lowest ratio to the highest, with no two labels
  the same.
- **X-axis:** dates, or dates with the hour, each under the column it
  labels.
- **Intervals:** hourly, daily, or weekly.
- **CSV:** it writes the ratios to a CSV file when asked.
- **DexTools fallback:** it needs a saved DexTools key. Without one, the
  chart says so, and charts from GeckoTerminal alone.

## Pre-requisites

NodeJs (package name `nodejs`) version 22 or above.

## Installation

```bash
git clone https://github.com/nottoseethesun/pulsechain-analytics.git
cd pulsechain-analytics/chart-price-ratio
npm install
```

`npm install` installs what the chart needs, crypto-price-fetchers among
it, for its key store and its GeckoTerminal client. Which version of
crypto-price-fetchers is installed, and how to change it, is in the repo's
[README](../README.md#choosing-versions-of-dependencies-that-are-raw-github-projects).

## Configuration

Edit `config.json` to set defaults:

```json
{
  "network": "pulsechain",
  "chain": "pulse",
  "dextools": {
    "subscription": "standard",
    "host": "<https://public-api.dextools.io>",
    "version": "v2"
  },
  "csvFilename": "token_ratio.csv",
  "interval": "weekly",
  "maxCandles": 1000,
  "weeklyResampleDays": 7
}
```

### DexTools API key

A DexTools API key enables the current-price fallback when GeckoTerminal
data is unavailable. It is no setting and no command-line argument: save it
encrypted, with a password you choose, in the repo's top folder, whose
`npm run api-keys` runs crypto-price-fetchers' key manager:

```bash
cd ..
npm install
npm run api-keys
```

The chart opens it the first time it asks DexTools, with the password that
`source ./unlock-api-keys.sh`, in the repo's top folder, keeps for the
terminal, or one it asks for. A run that never asks DexTools asks for no
password. See the repo's [README](../README.md#api-keys).

## Usage

`node pulse-token-ratio.js --help` lists every option, each with its
default from `config.json`, and the exit codes: 0 when the ratios were
printed, 1 when they were not.

The chart needs at least 90 points, since its x-axis needs that many
columns to space its dates. With fewer, it says so and stops before
printing anything; a shorter interval gives more points.

### Basic: weekly ratio (default)

`node pulse-token-ratio.js <tokenA> <tokenB>`

### Example with $808 and $pTGC

`node pulse-token-ratio.js 0x50f1ca62e6fb8adf438ca1f50067ab83670094a6 0x94534eeee131840b1c0f61847c572228bdfdde93`

### Specify Interval

```bash
node pulse-token-ratio.js <tokenA> <tokenB> --interval=daily
node pulse-token-ratio.js <tokenA> <tokenB> --interval=hourly
```

### Export to CSV

`node pulse-token-ratio.js <tokenA> <tokenB> --interval=weekly --csv`

## Output Example

The daily ratio of $808 to $pTGC on PulseChain:

![The ratio chart's output: the daily ratio of $808 to $pTGC, as a line chart in the terminal](pulse-token-ratio-output.png)

## Contributing

See the info on Contributing at `../README.md`.
