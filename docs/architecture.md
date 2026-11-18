# pulsechain-analytics — System Architecture

pulsechain-analytics answers questions about PulseChain that the usual
tools do not: how much of a token one transaction sent a wallet, what a
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

| Tool | Where | What it answers |
| ---- | ----- | --------------- |
| The amount a transaction sent, on ethers | `fetch-amount-of-token-transferred.js` | How much of a token one transaction sent a wallet. |
| The same, as a Sheets script | `for-google-apps/check-token-balance/` | The same, in a sheet's cell, and from Node through the script's Node version. |
| The balance checker | `check-token-balance/` | A wallet's balances of tokens, PLS among them, at a block or a date. A package of its own. |
| The ratio chart | `chart-price-ratio/` | The ratio of two tokens' prices over time, as a chart in the terminal. A package of its own. |

---

## The Amount a Transaction Sent

Both copies read the transaction's own receipt and add up the token's
Transfer events to the wallet in it. A receipt holds that transaction's
events alone, so another transaction in the same block never counts, and
no archive node is needed, since no past balance is read. A read that
fails throws, so a failure is never taken for an amount.

`fetch-amount-of-token-transferred.js` does it with ethers.
`fetch-amount-of-token-transferred.gs` does it in Apps Script, with
`UrlFetchApp` and json-rpc, and caches its answers so a sheet full of cells
stays within the endpoint's rate limits. The owner deploys it as a library;
a sheet reaches a library's functions through a wrapper, `wrapper.gs`,
pasted into the sheet's own project. The deployed library has a function
the repo's copy lacks, `getTokenTransferredUseCache`, which the wrapper
calls.

`for-google-apps/check-token-balance/fetch-amount-of-token-transferred.js`
is the script's Node version: it runs the `.gs` unchanged, through
crypto-price-fetchers' runner, so a fix in the `.gs` fixes both. The tests
hold the two copies to the same answers (`test/helpers/transfer-cases.js`).

---

## The Balance Checker

`check-token-balance/index.js` reads a wallet's balance of each token named,
PLS or ERC-20, at a block, or at the block closest to the start of a UTC
date, which it finds by a binary search over the blocks' times. It writes each balance with
commas between the thousands, and plain (`format-balance.js`). A past block
needs an archive node.

---

## The Ratio Chart

`chart-price-ratio/pulse-token-ratio.js` charts the ratio of two tokens'
prices, even when no pool holds both:

1. For each token, `pool-selector.js` finds its pools on GeckoTerminal
   (`gecko-terminal.js`) and picks the one with the most liquidity, unless
   a pool with at least a tenth of that liquidity has a much deeper history.
2. It fetches each pool's candles at the interval asked, hourly, daily, or
   daily resampled to weeks, priced in PLS, so the ratio of the two is the
   ratio of the tokens.
3. When GeckoTerminal has no candles, it falls back to each token's current
   USD price from DexTools (`dextools.js`): one point.
4. It prints the chart, with labels on both axes (`generateNiceTicks.js`
   picks the y-axis' values), the last ten ratios and the current one, and
   writes a CSV when asked.

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
- **asciichart** for the ratio chart; **commander** for the balance
  checker's command line.
