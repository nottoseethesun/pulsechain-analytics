# PulseChain Token Ratio Chart

A tool, on Node, the program that runs JavaScript outside a browser, that
charts the ratio of two PulseChain tokens' prices (token A / token B) in
the terminal, even when no pool trades one for the other. It
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
- **Intervals:** hourly, daily, the default, or weekly. GeckoTerminal's
  free api serves about the last 184 days of candles, which make 184
  daily points but at most 27 weekly ones.
- **Pairing:** each ratio divides the two tokens' prices of the same time,
  at the times both pools have a candle for, since GeckoTerminal makes no
  candle for a period in which nothing traded.
- **CSV:** it writes the ratios to a CSV file when asked.
- **DexTools fallback:** it needs a saved DexTools key. Without one, the
  chart says so, and charts from GeckoTerminal alone.

## Pre-requisites

Node 24 or later, from nodejs.org or a version manager (a Linux
distribution's own `nodejs` package can be older).

## Installation

git, the version-control program, copies the repo from GitHub, the website
that hosts it, and npm, Node's package manager, installs the tool's
packages:

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
  "interval": "daily",
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

The chart spans at least 90 columns, so its x-axis has room to space its
dates. A series of fewer points is drawn with each point widened over
several columns, the points joined by straight lines. A weekly run from
GeckoTerminal says first that GeckoTerminal's free api serves about the
last 184 days, so its chart shows at most 27 points.

### Basic: daily ratio (default)

`node pulse-token-ratio.js <tokenA> <tokenB>`

### Example with $808 and $pTGC

`node pulse-token-ratio.js 0x50F1ca62e6Fb8Adf438ca1F50067AB83670094A6 0x94534EeEe131840b1c0F61847c572228bdfDDE93`

### Specify Interval

```bash
node pulse-token-ratio.js <tokenA> <tokenB> --interval=hourly
node pulse-token-ratio.js <tokenA> <tokenB> --interval=weekly
```

### Export to CSV

`node pulse-token-ratio.js <tokenA> <tokenB> --interval=daily --csv`

## Output Example

The daily ratio of $808 to $pTGC on PulseChain:

![The ratio chart's output: the daily ratio of $808 to $pTGC, as a line chart in the terminal](pulse-token-ratio-output.png)

## Contributing

See the info on Contributing at `../README.md`.
