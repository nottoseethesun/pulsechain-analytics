# pulsechain-analytics — System Architecture

pulsechain-analytics answers four questions about PulseChain: how much
of a token one transaction sent a wallet, what a
wallet held at a past block or date, how two tokens' prices compare
over time, and what a wallet moved over a range of blocks. Some answers come as Google Sheets functions, in Apps Script,
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
- [A Wallet's History](#a-wallets-history)
- [Api Keys](#api-keys)
- [crypto-price-fetchers](#crypto-price-fetchers)
- [Technology Choices](#technology-choices)

---

## The Tools

Five tools answer the four questions. Two of them work out the same
amount, one with ethers and one as a Sheets script.

| Tool | Where | What it answers |
| ---- | ----- | --------------- |
| The amount a transaction sent, on ethers | `fetch-amount-of-token-transferred.js` | How much of a token one transaction sent a wallet. |
| The same, as a Sheets script | `for-google-apps/check-token-balance/` | The same, in a sheet's cell, and from Node through the script's Node version. |
| The balance checker | `check-token-balance/` | A wallet's balances of tokens, PLS among them, at a block or a date. A package of its own. |
| The ratio chart | `chart-price-ratio/` | The ratio of two tokens' prices over time, as a chart in the terminal. A package of its own. |
| A wallet's history | `wallet-history/` | Every token and every PLS a wallet moved over a range of blocks, from the chain alone: functions a program calls, with no command line of their own. |

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
2. It fetches each token's candles in its pool at the interval asked,
   hourly, daily, or daily resampled to weeks. A pool holds two tokens, and
   its candles price the one GeckoTerminal calls its base unless a request
   names the other, so each request names the chart's token by its
   address, whichever side of the pool it is on. Both tokens' candles are
   priced in USD, so the ratio of the two is the ratio of the tokens.
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

## A Wallet's History

Bookkeeping needs everything a wallet moved, and an explorer's list of a
wallet's transactions can leave some out and list transfers the chain
does not hold. `wallet-history/` reads the history from the chain alone,
through an rpc endpoint, in four parts, each a different record the chain
keeps:

1. **Tokens, from the logs** (`transfers.js`). A token contract logs a
   Transfer event naming the sender and receiver of every move, and WPLS
   logs a Deposit or Withdrawal when a wallet wraps or unwraps PLS.
   `walletTransferLogs` searches for those that name the wallet, in spans
   of blocks no wider than the endpoint takes (`blocks.js`). They include
   transfers in transactions the wallet did not send, such as airdrops.
2. **The wallet's transactions, from its nonce** (`sent.js`). The count of
   transactions a wallet has sent rises with each one, whatever it does,
   so `walletSentTransactions` halves every span of blocks whose two ends
   show different counts down to single blocks, and reads those. It finds
   the transactions no log names: one that reverted, one that only
   approved, one that cancelled another.
3. **PLS of the wallet's own transactions, from receipts and traces**
   (`receipts.js`, `coin-flows.js`). PLS moves without a log. A
   transaction's receipt gives its gas, and its value is the PLS it sent;
   a trace, the transaction replayed call by call, shows the PLS a
   contract handed back inside it, such as at the end of a swap into PLS.
   `ownCoinFlows` gives each transaction's gas, PLS sent and handed back,
   and the change those make to the wallet's balance.
4. **PLS from elsewhere, from the balance** (`coin-inflows.js`). PLS also
   arrives from transactions the wallet did not send, from validator
   withdrawals and, for a block's fee recipient, from tips. Only the
   wallet's own transactions can take PLS from it, so
   `walletCoinInflows` halves each span whose change in balance its own
   transactions do not explain, and reads each block left for those
   payments: its trace, its withdrawals, and its tips. A block whose
   payments still do not explain its change is reported, never guessed
   at.

`readReceipts` reads each receipt once, and `tokenFacts` asks each token's
contract once for its symbol and decimals. Every request goes through a
paced provider (`paced-provider.js`), a set time after the one before, as
LP Ranger paces its own; requests made together in one turn go as one
json-rpc batch. The counts and balances at past blocks need an endpoint
that keeps past state, and the traces one that offers the debug methods:
g4mm4's does both; rpc.pulsechain.com keeps past state but does not trace.
LP Ranger's wallet report has its own nonce search and pacing, but its
files load LP Ranger's settings as they load, and LP Ranger cannot change,
so `wallet-history/` holds a second copy of each rather than importing
them.

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
from GitHub, as a dependency that `npm install` installs, at the top and in
`chart-price-ratio/`. It gives the runner that runs the Sheets script under
Node (`crypto-price-fetchers/apps-script-runner`), the key store
(`crypto-price-fetchers/api-key-store`), the GeckoTerminal client the ratio
chart asks through (`crypto-price-fetchers/dex-prices/geckoterminal`),
which keeps within a budget of requests and sends a request refused as too
many again after its waits, and the security lint's rule against printing
a secret (`crypto-price-fetchers/eslint-rules/no-secret-logging`).

Both `package.json` files name its main branch (`#main`), the same ref (a
test holds them equal), and each `package-lock.json` keeps the commit
installed, which `npm ci` installs. A change there reaches this repo once
the lockfiles are made again. `npm run github-project-deps -- main` does
that at main's newest commit, and `-- release` switches both to the latest
release (`#semver:*`), its highest version tag: crypto-price-fetchers'
versions tool sets the ref, makes each lockfile again from a fresh
`node_modules`, and puts every `package.json` and lockfile back if an
install fails.

---

## Technology Choices

- **Node 22 or later**, ES modules, and Node's own test runner.
- **ethers** for the chain, where a program reads it in Node.
- **Apps Script's own services** in the Sheets script, which can import no
  package.
- **asciichart** for the ratio chart; **commander** for the command lines
  of the balance checker and the ratio chart.
