# pulsechain-analytics — System Architecture

pulsechain-analytics answers three questions about PulseChain: how much
of a token one transaction sent a wallet, what a
wallet held at a past block or date, and how two tokens' prices compare
over time. Some answers come as Google Sheets functions, in Apps Script,
and all of them as Node programs.

Two companion references sit alongside this one:

- [`docs/engineering.md`](engineering.md): the files on disk, the gates,
  the tests and CI.
- [`docs/npm-project-commands.md`](npm-project-commands.md): every npm
  command and its flags.

---

## Table of Contents

- [The Tools](#the-tools)
- [The Amount a Transaction Sent](#the-amount-a-transaction-sent)
- [The Balance Checker](#the-balance-checker)
- [The Ratio Chart](#the-ratio-chart)
- [Api Keys](#api-keys)
- [crypto-price-fetchers](#crypto-price-fetchers)
- [Technology Choices](#technology-choices)

---

## The Tools

Four tools answer the three questions. Two of them work out the same
amount, one with ethers and one as a Sheets script.

| Tool | Where | What it answers |
| ---- | ----- | --------------- |
| The amount a transaction sent, on ethers | `fetch-amount-of-token-transferred.js` | How much of a token one transaction sent a wallet. |
| The same, as a Sheets script | `for-google-apps/check-token-balance/` | The same, in a sheet's cell, and from Node through the script's Node version. |
| The balance checker | `check-token-balance/` | A wallet's balances of tokens, PLS among them, at a block or a date. A package of its own. |
| The ratio chart | `chart-price-ratio/` | The ratio of two tokens' prices over time, as a chart in the terminal. A package of its own. |

---

## The Amount a Transaction Sent

Two tools work out how much of a token one transaction sent a wallet:
`fetch-amount-of-token-transferred.js`, with ethers, and the Sheets script
`fetch-amount-of-token-transferred.gs`, in Apps Script, with `UrlFetchApp`
and json-rpc. Both read the transaction's own receipt and add up the
token's Transfer events to the wallet in it. A receipt holds that
transaction's events alone, so another transaction in the same block never
counts. And no archive node is needed, since no past balance is read. A
read that fails throws, so a failure is never taken for an amount.

The owner deploys the Sheets script as a library. A cell cannot call a
library's functions directly, only those of the sheet's own project, so a
sheet reaches them through a wrapper, `wrapper.gs`, pasted into the sheet's
project. The deployed library also has a function the repo's copy lacks,
`getTokenTransferredUseCache`, which caches each answer, so a sheet full of
cells stays within the endpoint's rate limits. The wrapper's
`getTokenTransferred` calls it; its `getTokenTransferredNoCache` calls the
function without the cache.

`for-google-apps/check-token-balance/fetch-amount-of-token-transferred.js`
is the script's Node version: it runs the `.gs` unchanged, through
crypto-price-fetchers' runner, so a fix in the `.gs` fixes both. The tests
hold the two copies to the same answers (`test/helpers/transfer-cases.js`).

---

## The Balance Checker

`check-token-balance/index.js` reads a wallet's balance of each token named,
PLS or ERC-20, at a block, or at the block closest to the start of a UTC
date, which it finds by a binary search over the blocks' times. It writes
each balance twice: with commas between the thousands, and again as plain
digits (`format-balance.js`). A balance at a past block needs an archive
node, since other nodes keep only the chain's recent state.

---

## The Ratio Chart

`chart-price-ratio/pulse-token-ratio.js` charts the ratio of two tokens'
prices, even when no pool holds both:

1. For each token, `pool-selector.js` looks at its five most liquid pools
   on GeckoTerminal (`gecko-terminal.js`), and takes the most liquid. A new
   pool can be the most liquid, with little history to chart. So if that
   pool's history is less than half the longest among the five, it takes
   the pool with the longest history instead, provided that pool has at
   least a tenth of the top pool's liquidity.
2. It fetches each pool's candles at the interval asked, hourly, daily, or
   daily resampled to weeks, priced in PLS, so the ratio of the two is the
   ratio of the tokens.
3. When GeckoTerminal has no candles, it falls back to each token's current
   USD price from DexTools (`dextools.js`): one point.
4. It prints the chart, with labels on both axes (`generateNiceTicks.js`
   picks the y-axis' values), the last ten ratios and the current one, and
   writes a CSV when asked.

The chart needs at least 90 points: its x-axis spaces four to ten dates
under its columns, each ten characters wide, or sixteen with the hour, and
fewer points leave them no room. A run with more than one point and fewer
than 90 stops before it prints anything, saying so, and naming the
interval that gives more points; one point, a current price, prints no
chart.

`pulse-token-ratio.js` reads `config.json` and runs the command line, which
`ratio-command.js` declares with commander, with the settings' defaults
from `config.json`; `ratio-series.js` fetches the prices and works out the
ratios; `ratio-output.js` prints them. The run ends with exit code 0 when
it printed the ratios, and 1 when it did not: a mistake in the arguments,
too few points, no prices, or a request that failed.

The DexTools key is opened from the repo's key store the first time the
chart asks DexTools, so a run that never falls back asks for no password.

---

## Api Keys

The keys this repo's programs send are listed in its top `config.json`,
under `apiKeys`: DexTools', for the ratio chart. They are kept in
`api-keys.json` beside it, which git ignores, encrypted with one password,
by crypto-price-fetchers' key store, LP Ranger's design:

- `npm run api-keys` lists the keys, saved or not, never showing a key's
  characters, and saves each key typed once its service takes it.
- `source ./unlock-api-keys.sh` asks for the password once, checks that it
  opens the keys saved, and keeps it for that terminal in
  `API_KEYS_PASSWORD`. The script is a copy of crypto-price-fetchers', which
  a test holds it to.
- A program opens the key it needs with that password, or asks for one,
  has the service check the key, and keeps it in memory for the run.

An api key is never a setting in a file git keeps, nor a command-line
argument, which the shell's history would keep.

---

## crypto-price-fetchers

This repo installs [crypto-price-fetchers](https://github.com/nottoseethesun/crypto-price-fetchers)
from GitHub, pinned to a commit, as a dependency that `npm install`
installs, at the top and in `chart-price-ratio/`, at the same commit (a
test holds them equal). It gives the runner that runs the Sheets script
under Node (`crypto-price-fetchers/apps-script-runner`), the key store
(`crypto-price-fetchers/api-key-store`), and the security lint's rule
against printing a secret (`crypto-price-fetchers/eslint-rules/no-secret-logging`).
A change there reaches this repo when the pin moves.

---

## Technology Choices

- **Node 22 or later**, ES modules, and Node's own test runner.
- **ethers** for the chain, where a program reads it in Node.
- **Apps Script's own services** in the Sheets script, which can import no
  package.
- **asciichart** for the ratio chart; **commander** for the command lines
  of the balance checker and the ratio chart.
