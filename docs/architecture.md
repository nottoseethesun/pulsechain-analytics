# pulsechain-analytics — System Architecture

pulsechain-analytics answers five questions about PulseChain: how much
of a token one transaction sent a wallet, what a wallet held at a past
block or date, how two tokens' prices compare over time, what a wallet
moved over a range of blocks, and what of those moves Summ, the crypto
tax calculator the owner keeps his books in, lacks or holds wrongly.
Every answer comes from a program on Node, the program that runs
JavaScript outside a browser, and the first, the amount a transaction
sent, also comes as a function for Google Sheets, Google's spreadsheet
app, in Apps Script, Google's platform for scripts that run inside its
apps.

Two companion references sit alongside this one:

- [`docs/engineering.md`](engineering.md): the files on disk, the gates,
  the tests and CI, the checks GitHub, the website that hosts the repo,
  runs at each push.
- [`docs/npm-project-commands.md`](npm-project-commands.md): every command
  the repo's `package.json` files give npm, Node's package manager, to run,
  and its flags.

---

## Table of Contents

- [The Tools](#the-tools)
- [The Amount a Transaction Sent](#the-amount-a-transaction-sent)
- [The Balance Checker](#the-balance-checker)
- [The Ratio Chart](#the-ratio-chart)
- [A Wallet's History](#a-wallets-history)
- [The Summ Sweep](#the-summ-sweep)
  - [What the Sweep Reads](#what-the-sweep-reads)
  - [Legs and the Match](#legs-and-the-match)
    - [Amounts as Summ Prints Them](#amounts-as-summ-prints-them)
  - [Withdrawals from Positions](#withdrawals-from-positions)
  - [Rows for What Summ Lacks](#rows-for-what-summ-lacks)
    - [The Rules](#the-rules)
    - [What Every Row of a Transaction Shares](#what-every-row-of-a-transaction-shares)
  - [What the Sweep Writes](#what-the-sweep-writes)
- [Settings Files](#settings-files)
- [Api Keys](#api-keys)
- [crypto-price-fetchers](#crypto-price-fetchers)
- [Technology Choices](#technology-choices)

---

## The Tools

Six tools answer the five questions. Two of them work out the same
amount, one with ethers, a library for talking to Ethereum-style chains
such as PulseChain, and one as a Sheets script. Each command line is
declared with commander, the package that parses a command line, and
answers `--help` with its options, examples of its common uses and its
exit codes.

| Tool | Where | What it answers |
| ---- | ----- | --------------- |
| The amount a transaction sent, on ethers | `fetch-amount-of-token-transferred.js` | How much of a token one transaction sent a wallet. |
| The same, as a Sheets script | `for-google-apps/check-token-balance/` | The same, in a sheet's cell, and from Node through the script's Node version. |
| The balance checker | `check-token-balance/` | A wallet's balances of tokens, PLS among them, at a block or a date. A package of its own. |
| The ratio chart | `chart-price-ratio/` | The ratio of two tokens' prices over time, as a chart in the terminal. A package of its own. |
| A wallet's history | `wallet-history/` | Every token and every PLS a wallet moved over a range of blocks, from the chain alone: functions a program calls, with no command line of their own. |
| The Summ sweep | `summ-sweep/`, run by `npm run summ-sweep` | What Summ lacks or holds wrongly of the tokens a wallet moved over a range of days: the withdrawals from 9mm V3 positions to fix in Summ, a csv of rows for what Summ lacks, and questions for the owner about the legs no rule books. |

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
is the script's Node version: it runs the `.gs` unchanged, so a fix in
the `.gs` fixes both. It does so through the runner of
crypto-price-fetchers, the owner's repo of code his projects share, which
this repo installs ([crypto-price-fetchers](#crypto-price-fetchers)); the
runner runs an Apps Script file under Node, with Node versions of Apps
Script's services. The tests hold the two copies to the same answers
(`test/helpers/transfer-cases.js`).

---

## The Balance Checker

`check-token-balance/index.js` reads a wallet's balance of each token named,
PLS or ERC-20, at a block, or at the start of a UTC date: after the last
block made before that midnight, whose state is the chain's when the day
starts, since a block made at midnight or after holds the day's
transactions. A binary search over the blocks' times finds that block. Its command
line, declared in `balance-command.js`, checks each option as it is parsed,
so a block that is no whole number, a date no calendar has, an address that
is not 0x and 40 hex digits, or an endpoint that is not an http or https
url stops the run, naming the option, before the chain is asked anything.
The endpoint's default is `defaultRpc` in the `config.json` beside
`index.js`, whichever folder the command runs in, which `settings.js`
checks against its JSON Schema (see [Settings Files](#settings-files)),
else g4mm4's public endpoint.
It holds addresses in EIP-55's mixed case. It reads each balance once and
writes it twice: with commas between the thousands, and again as plain
digits (`format-balance.js`). A balance at a past block needs an archive
node, since other nodes keep only the chain's recent state.

---

## The Ratio Chart

`chart-price-ratio/pulse-token-ratio.js` charts the ratio of two tokens'
prices, even when no pool holds both. A run reads its candles, the open,
high, low and close prices of each period, from one of two sources, and
from that one alone:

- GeckoTerminal, a service that lists the pools of decentralized exchanges
  with their prices and candles, and takes no key. Its free api serves
  about the last 184 days of candles.
- Moralis, a service that prices tokens from the same pools, with the
  Moralis api key saved in the repo's key store. A run from Moralis reads
  the last two years of daily candles, unless `moralis.days` in the
  chart's `config.json`, or `--moralis-days`, names another span.

With no Moralis key saved, a run reads GeckoTerminal's candles. With one
saved, it asks at the terminal which to read, Enter taking Moralis, unless
`--source` names one; a run with no terminal to ask at, such as one whose
input is a pipe, stops and names `--source` (`ratio-source.js`).

1. Each token's pool. From GeckoTerminal, `pool-selector.js` looks at the
   token's five most liquid pools (`gecko-terminal.js` asks GeckoTerminal
   through crypto-price-fetchers' client), and takes the most liquid. A new
   pool can be the most liquid, with little history to chart. So if that
   pool's history is less than half the longest among the five, it takes
   the pool with the longest history instead, provided that pool has at
   least a tenth of the top pool's liquidity. From Moralis, `moralis.js`
   lists the pairs that trade the token, through crypto-price-fetchers'
   client, and takes the deepest active pair that lists the token first:
   Moralis's candles of a pair price the token the pair lists first, as in
   HEX / WPLS, which prices HEX. A token no active pair lists first stops
   the run, which says to read GeckoTerminal's candles instead.
2. It fetches each token's candles in its pool at the interval asked,
   hourly, daily, the default, or daily resampled to weeks. A pool holds
   two tokens. GeckoTerminal's candles price the one GeckoTerminal calls
   its base unless a request names the other, so each request names the
   chart's token by its address, whichever side of the pool it is on.
   Moralis names in its answer the token its candles price, and the chart
   checks that it is the chart's token. Both tokens' candles are priced in
   USD, so the ratio of the two is the ratio of the tokens. A source can
   list the candles newest first, as GeckoTerminal does, and the chart
   reads them oldest first. GeckoTerminal makes no candle for a period in
   which nothing traded, so a pool can lack a time the other has: the
   chart divides the two tokens' prices of the same time, at the times
   both pools have, and makes weekly points from the days both pools have,
   so both series' weeks start on one day.
3. When the candles cannot be had, the chart falls back to each token's
   current USD price from DexTools, a third such service, which takes an
   api key: one point. It asks DexTools through crypto-price-fetchers'
   client. Each request through crypto-price-fetchers' clients has 30
   seconds to answer in full. One that runs out of time ends the run with
   exit code 1, printing no ratio, when it lists a token's pools at
   GeckoTerminal or its pairs at Moralis, or asks DexTools. The history
   requests of a token's most liquid pools at GeckoTerminal, up to five,
   each a pool's daily candles, end the run only when all of them fail; one
   that fails drops only its pool. On the chart's
   candles, a request that runs out of time means the candles cannot be
   had: the chart falls back to DexTools, or, with no DexTools key saved,
   ends with exit code 1.
4. It prints the chart, with labels on both axes (`generateNiceTicks.js`
   picks the y-axis' values), the last ten ratios and the current one, and
   writes a CSV when asked.

The chart spans at least 90 columns: its x-axis spaces four to ten dates
under its columns, each ten characters wide, or sixteen with the hour, and
fewer columns leave them no room. A series of fewer points is drawn wider:
each point takes the same number of columns, and the columns between two
points step from the one's ratio to the other's, so the line joins them
straight (`chartColumns`). One point, a current price, prints no chart.
GeckoTerminal's 184 days of candles make 184 daily points but at most 27
weekly ones; a weekly run from GeckoTerminal says so before its chart.

`pulse-token-ratio.js` reads `config.json` and runs the command line, which
`ratio-command.js` declares with commander, the package that reads a
command line's options and writes its help, with the settings' defaults
from `config.json`. Before it takes a default, `buildRatioCommand` checks
the settings against their JSON Schema, `RATIO_SETTINGS_SCHEMA` (see
[Settings Files](#settings-files)); each option's parser is made from the
kind of value the schema gives the same setting, and a hook before the
action refuses `--source` beside a `useDexToolsOnly` the file sets, which
commander refuses only when both are typed. `ratio-source.js` settles the
source; `ratio-series.js`
fetches the prices and works out the ratios; `ratio-output.js` prints
them. The run ends with exit code 0 when it printed the ratios, and 1 when
it did not: a mistake in the arguments or in `config.json`, no source
chosen, no prices, or a request that failed.

Each key is opened from the repo's key store the first time the chart asks
its service (`api-keys.js`), so a run that reads GeckoTerminal's candles
and never falls back asks for no password.

---

## A Wallet's History

Bookkeeping needs everything a wallet moved. An explorer, a website that
shows a chain's blocks and transactions, keeps its list of a wallet's
transactions as a copy its own indexer makes, which nothing holds
to the chain, so `wallet-history/` reads the history from the chain alone,
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
LP Ranger, the owner's bot that manages his 9mm V3 liquidity positions and
whose coding standards this repo follows, paces its own; requests made
together in one turn go as one
json-rpc batch. The counts and balances at past blocks need an endpoint
that keeps past state, and the traces one that offers the debug methods:
the endpoint of g4mm4, a PulseChain node operator that serves public
endpoints, does both; rpc.pulsechain.com, PulseChain's own public endpoint,
keeps past state but does not trace.
LP Ranger's wallet report has its own nonce search and pacing, but its
files load LP Ranger's settings as they load, and LP Ranger cannot change,
so `wallet-history/` holds a second copy of each rather than importing
them.

---

## The Summ Sweep

The owner keeps his crypto taxes in Summ, which reads each of his
wallets' transactions itself. Its record of a wallet can lack moves the
chain holds. And it holds a withdrawal from a 9mm V3 position in one of
two ways: as two legs per coin, the principal and the fees apart, or as
one leg per coin, the principal and the fees together, which books the
fees as liquidity removed rather than as income. `summ-sweep/` compares a
wallet's history, read from the chain alone
([A Wallet's History](#a-wallets-history)), with Summ's rows of the
wallet. It says what to fix in Summ, writes rows for
what Summ lacks, and asks the owner about the legs its rules cannot book.
`npm run summ-sweep` runs it (`command-line.js`), and `sweep.js` runs its
steps.

### What the Sweep Reads

A sweep takes a wallet, its first and last day, in UTC, Summ's rows of
the wallet over those days, and the time, in UTC, up to which Summ's sync
has read the wallet's transactions
([Summ's sync](#what-every-row-of-a-transaction-shares) says why). The
command line checks each as it parses it: the wallet must be an address,
each day a date written as YYYY-MM-DD, and the time one written as
YYYY-MM-DD HH:MM:SS. `times.js` reads each with `Date.parse` and keeps
it only when writing it back gives the same text, so a date that does not
exist, such as 2026-02-30, is refused rather than moved to a nearby day.
A mistake stops the run before it reads anything.

Summ's connector for Claude, through which Claude reads and edits the
owner's records in Summ, returns the rows a page at a time, and the pages
are saved to files: `summ-results.js` reads them, and refuses a set with
a page missing or given twice, or a page holding fewer rows than it says
it returned. The range of blocks runs from the first block of the first
day to the last block of the last.

The chain's facts are in the top `config.json`, under `pulsechain`: the
endpoint, the chain's id, the position manager, WPLS, the widest span of
a log search, and the spacing and size of requests. The owner's own
settings are in `summ-sweep/config.json`, which git, the version-control
program that keeps the repo's history, ignores, since the
repo is public: the path of his Summ template and of his LP Ranger
checkout; his own wallets, each with its name; the tokens he counts as
spam, and those he receives as income; and each token's symbols in Summ
and in a csv, where they differ from its contract's own
(`owner-lists.js`). `summ-sweep/config-example.json` shows the shape.
`summ-sweep/settings.js` checks both files against their JSON Schemas
before the sweep takes a setting (see [Settings Files](#settings-files)).
The endpoint must keep past state and offer the debug methods, as for the
history.

### Legs and the Match

A leg is one token in or out of one transaction. `legs.js` makes the
chain's legs from the history's logs: a Transfer of a token, a position's
NFT as a leg of 1, and wrapping or unwrapping PLS as a leg of WPLS. A
transfer from the wallet to itself is two legs, one out and one in. A
leg's time is its block's: the search for the wallet's transactions has
already read the block of each one the wallet sent, so the sweep reads
only the other blocks the logs name.

Every address the sweep keeps, on a leg, a Summ row or the owner's lists,
is held in EIP-55's mixed case, as LP Ranger holds them: ethers'
`getAddress` writes it that way, whatever case it came in, and the
owner's settings can give an address in any case ethers accepts. One
address then has one spelling, so the sweep's maps and matches find it
by its text. An address taken straight from the chain's answers, such as
a transaction's receiver, is compared without regard to case
(`sameAddress`). Transaction hashes, which carry no checksum, are held in
lower case.

`match.js` makes Summ's legs from its rows: each amount on a row is a leg
in or out. A transfer between two of the owner's wallets is one row
holding both sides, so only the swept wallet's side counts. A row entered
by hand has no hash, so it takes the hash of the transaction at its time,
and, when more than one transaction has that time, of the one with its
amount. PLS is left out of both sides, since gas and PLS moves are the
history's flows of PLS rather than token legs.

A chain leg matches a Summ leg of the same transaction, direction and
token whose amount holds the leg's amount, one leg to one first, then the
chain's legs of one token added up against one Summ leg. A token is known
in Summ by its contract's symbol in capitals, or, where Summ's symbol for
it differs, by the symbols the owner's settings list for it. A token
whose contract gave no decimals matches nothing, since its amount cannot
be read as a figure, and neither does one whose contract gave no symbol
and that the settings leave out. What is left on each
side is a gap: a chain leg Summ lacks, or a Summ leg the chain does not
show.

#### Amounts as Summ Prints Them

The chain holds an amount exactly, as a whole number of the token's
smallest units; Summ keeps amounts as JavaScript numbers, which hold
about 16 significant digits. Summ prints an amount in one of two forms:
as its JavaScript number, or rounded to 10 significant digits, keeping
every digit of its whole part. A step is the gap between a JavaScript
number and the next one up. Each turn of an amount into a JavaScript
number moves it by up to half a step, and Summ's figures sit at most one
step from the amount they stand for, so `amounts.js` matches a figure
within two steps of the chain's amount, or of that amount rounded as
Summ rounds.

### Withdrawals from Positions

A withdrawal from a 9mm V3 position is two events of the position
manager: DecreaseLiquidity, which moves the principal out of the pool's
liquidity and states its amounts, and Collect, which pays out what the
position is owed, the principal and the fees it earned. The two can come
in the same transaction or in different ones, so the principal a collect
pays out is the sum of the position's DecreaseLiquidity amounts since its
last collect, and its fees are the rest of what the wallet received.

1. Each transaction the wallet sent to the position manager is read by
   LP Ranger's own tool, `util/bookkeeping/coins-in-transaction.js`, which
   prints, as json, what one transaction moved for a wallet: its kind, the
   position manager's liquidity events, the wallet's coin transfers and
   approvals, and its gas. The sweep runs it as a program of its own in
   the owner's LP Ranger checkout (`lp-ranger.js`). Its files load LP
   Ranger's settings as they load, and LP Ranger is never changed, so the
   sweep runs the tool rather than importing it, and reads the json it
   prints.
2. `positions.js` works out each coin's principal and fees. A pool holds
   two coins, ordered by their contract addresses read as numbers, lowest
   first, so each coin the wallet received is placed on its side by its
   address; as text in EIP-55's mixed case, two addresses can sort the
   other way. The fee comes from what the wallet received, its legs,
   rather than from the Collect event: that event states the amounts the
   position manager asked the pool for, and the pool sends what it owes
   the position, which can be less. LP Ranger's record gives each event's
   NFT id and amounts as strings of digits, and a record of another shape
   stops the sweep, naming the transaction. A collect it cannot split is
   reported, never guessed at: one that collects from two positions, one
   whose coins cannot be placed on the two sides, and one that paid out
   less than the principal.
3. `splits.js` sorts each coin with principal into Summ's three cases.
   Summ holds the whole amount on one leg: the leg is a fix, to be set to
   the principal and the category Remove liquidity through Summ's
   connector, and the fee becomes an income row. Summ holds the principal
   and the fee as two legs: the coin is reconciled. Summ holds neither:
   both parts are legs Summ lacks.

When a pool holds WPLS, the position manager can unwrap it and pay the
wallet PLS inside the transaction, which logs no Transfer. That PLS,
counted as WPLS, places the coins on their sides, but it has no token
leg to match, so the sweep reports it as a problem.

### Rows for What Summ Lacks

What Summ lacks, once the match and the splits are done, is the legs and
parts left over, and the transactions the wallet sent that Summ holds
nothing of and that moved no token. `gaps.js` books them by the rules of
the owner's skill for missing transactions, the written procedure Claude
follows to book a transaction Summ lacks, kept in his private skill files
(`gap-rules.js` holds the rules), and a leg no rule books is a question
for the owner in the report, never a guess.

#### The Rules

The legs of one transaction are booked by what the chain shows it did.
The first rule that fits a leg books it:

1. **A part of a withdrawal from a position**: the principal is Remove
   liquidity, and the fees are Income.
2. **A transaction the wallet sent to the position manager**: a token out
   is a deposit, Add liquidity, to the position its IncreaseLiquidity
   event names, or else to the one whose NFT the transaction minted; the
   position's NFT in is Receive LP token, and out, Return LP token; a coin
   in that a collect with no principal paid is Income, all of it fees.
   The PLS a deposit paid the position manager, less what the manager
   handed back, moves without a log, so the deposit's rows give its amount
   in their descriptions, and the csv holds no row for it.
3. **Wrapping PLS**: the WPLS in is Swap in; unwrapping, the WPLS out is
   Swap out. The PLS side moves without a log, so it has no row.
4. **A token on the owner's list of spam**, coming in: Spam.
5. **A token from or to one of the owner's other wallets**: Receive or
   Send, with the wallet's name in the description.
6. **A swap**: a transaction the wallet sent in which one asset, a token
   or PLS, went out and one other came in, counting every leg the wallet
   has in it, matched or not, and the PLS it sent and was handed back.
   Each token's legs Summ lacks are added up, in less out: a Buy row when
   more came in, a Sell row when more went out. A transaction with more
   than one asset on a side, such as adding liquidity to a pool of two
   tokens, is no swap here, and its legs go to the other rules.
7. **A token on the owner's list of income tokens**, coming in: Income.

Every other leg is a question: a token sent to or received from an
address on none of the owner's lists, a burn or a mint outside the
position manager, an NFT outside it, a transfer from the wallet to
itself, a coin of a collect the sweep could not split, and a token whose
contract gave no decimals, or no symbol that the settings do not give.
The legs of one token, one direction and one NFT id make one row, and the
row says how many legs it adds up.

#### What Every Row of a Transaction Shares

Once the rules have booked a transaction's legs, `gaps.js` gives its rows
three facts about the transaction as a whole:

- **How much of it Summ holds**, in the description: nothing (bucket B);
  only its gas, as an approval (bucket A); or part of it, named by the
  categories Summ gave that part (bucket A).
- **Its gas**: when the wallet sent the transaction and Summ holds nothing
  of it, its gas goes on its first row, and on no other, so Summ counts it
  once. When the transaction has no row, only questions, its questions
  say so.
- **Summ's sync**: the run is given the time up to which Summ's sync has
  read the wallet's transactions (`--summ-synced-to`). The owner gives
  it, since Summ's connector gives an account's last sync as a date
  alone, and Summ's newest row of a wallet is the newest transaction Summ
  holds, which can be older than the point its sync reached. A
  transaction later than that time is one the sync has not read: its rows
  say so, and carry no gas, which that sync brings.

A transaction the wallet sent that Summ holds nothing of and that moved
no token is a Fee row of its gas when it failed, or when it moved no PLS
either, as an approval does. One that moved PLS is a question, since the
sweep writes no rows of PLS, and so is one that created a contract. One
later than the time Summ's sync has reached gets nothing, for that sync
to bring.

### What the Sweep Writes

A sweep writes two files, at the paths its command line names, and
neither over a file already there without `--replace`:

- **The csv**, of the income rows of the fixes' fees and the rows for
  what Summ lacks, through crypto-price-fetchers' Summ csv utility, the
  one way a csv for Summ is written: it takes the header from the owner's
  template, checks every row against Summ's rules, and writes nothing
  while a row breaks one. A sweep with no rows writes no csv.
- **The report**, as json: the fixes, each with the ids Summ gave its
  leg; the legs and parts Summ lacks; the questions, each with its legs
  and the reason no rule books them; Summ's legs no chain leg matched;
  the problems; and the time given as reached by Summ's sync. Amounts are
  written as decimal text of the token's smallest units, and a question's
  leg also gives its amount in whole tokens with its csv symbol, such as
  `2 TKN`, when the token's decimals are known.

Addresses are in EIP-55's mixed case in the report. The Summ csv utility
writes them in lower case, since its settings for PulseChain give an
address no case.

Before it writes either file, the run checks both paths and has the
utility check the rows, so a path already taken or a row that breaks one
of Summ's rules leaves both files unwritten. The run ends with exit code
0 when the report was written, and the csv with it when there were rows;
1 when they were not.

A change in the wallet's balance of PLS that no payment explains stops
the sweep before it matches anything, since a history missing a payment
would be compared as if it were whole.

---

## Settings Files

A tool keeps its settings in a JSON file, and a setting there is a
decision the owner made: a misspelled key a tool passes over, or a value
of the wrong kind it bends to fit, runs the tool on a setting the owner
did not choose. So each settings file is checked against its JSON Schema,
a description in JSON of the keys the file may hold and the kind of value
each takes, before a tool takes a setting, as LP Ranger checks its
settings. crypto-price-fetchers' `readSettingsFile`
(`crypto-price-fetchers/lib/settings-file`) reads the file, and each
schema is built from its kinds of value
(`crypto-price-fetchers/lib/settings-schema`), each with the words a
refusal uses, such as "a whole number above 0". Ajv, an npm package that
checks JSON against a schema, checks them on draft 2020-12, strict, with
every object refusing a key its schema does not name. A file that is not
JSON, a key the schema does not name, or a value of the wrong kind stops
the run, with every problem listed, one line each:

```text
config.json → maxCandles must be a whole number above 0; it is 0
config.json → colour is not a setting this tool reads
```

| File | Schema | Read by |
| --- | --- | --- |
| `chart-price-ratio/config.json` | `RATIO_SETTINGS_SCHEMA` (`chart-price-ratio/ratio-command.js`), every setting optional | `buildRatioCommand`, before it takes a default |
| `check-token-balance/config.json`, beside the checker's files | `SETTINGS_SCHEMA` (`check-token-balance/settings.js`): `defaultRpc`, an http or https url | `defaultRpcFrom`; no file gives g4mm4's endpoint, with a notice |
| The top `config.json` | `CHAIN_SETTINGS_SCHEMA` (`summ-sweep/settings.js`): the chain's facts under `pulsechain`, each required, its two contracts in EIP-55's form | The Summ sweep, and crypto-price-fetchers' key store for `apiKeys` |
| `summ-sweep/config.json` | `OWNER_SETTINGS_SCHEMA` (`summ-sweep/settings.js`): the template's and LP Ranger's paths, required, and the owner's lists, whose addresses may be in lower case | The Summ sweep |
| `for-google-apps/check-token-balance/config.json` | Built from the Sheets script's own config objects, by crypto-price-fetchers' runner | The script's Node version |

A command line whose options take their defaults from a settings file
makes each option's parser from the kind the schema gives the same
setting, so a typed value and the file's meet one rule. Commander refuses
two conflicting options only when both are typed, so the ratio chart
refuses, with crypto-price-fetchers' `checkConflicts`
(`crypto-price-fetchers/lib/option-conflicts`), `--source` beside a
`useDexToolsOnly` its file sets.

---

## Api Keys

The keys this repo's programs send are listed in its top `config.json`,
under `apiKeys`: DexTools', for the ratio chart's fallback to current
prices, and Moralis's, for the ratio chart's candles. They are kept in
`api-keys.json` beside it, which git ignores, encrypted with one password,
by crypto-price-fetchers' key store, a module built on LP Ranger's design
for keeping keys:

- `npm run api-keys`, this repo's command for the key store's manager,
  lists the keys, saved or not, never showing a key's characters, and
  saves each key typed once its service takes it.
- `source ./unlock-api-keys.sh`, a script in this repo's top folder, asks
  for the password once, checks that it opens the keys saved, and keeps it
  for that terminal in `API_KEYS_PASSWORD`. The script is a copy of
  crypto-price-fetchers', which a test holds it to.
- A program opens the key it needs with that password, or asks for one,
  has the service check the key, and keeps it in memory for the run.

An api key is never a setting in a file git keeps, nor a command-line
argument, which the shell's history would keep.

---

## crypto-price-fetchers

This repo installs [crypto-price-fetchers](https://github.com/nottoseethesun/crypto-price-fetchers)
from GitHub, as a dependency that `npm install` installs, at the top, in
`chart-price-ratio/` and in `check-token-balance/`. It gives the runner that runs the Sheets script under
Node (`crypto-price-fetchers/apps-script-runner`), the key store
(`crypto-price-fetchers/api-key-store`), the clients the ratio chart asks
GeckoTerminal, Moralis and DexTools through
(`crypto-price-fetchers/dex-prices/geckoterminal`, `…/dex-prices/moralis`,
`…/dex-prices/dextools`), which give each request 30 seconds to answer in
full and send a request refused as too many again after their waits, the
GeckoTerminal client within a budget of requests, the Summ csv utility the
Summ sweep writes its
csv through (`crypto-price-fetchers/summ-csv`), `messageOf`, which gives
the Summ sweep's command line the message of what it catches
(`crypto-price-fetchers/lib/message-of`), the lint rules against printing
a secret (`crypto-price-fetchers/eslint-rules/no-secret-logging`) and
against a default made with `||`
(`crypto-price-fetchers/eslint-rules/no-or-default`), the bin
`run-actionlint`, which runs actionlint, the checker of GitHub Actions
workflow files, from its official release, refused unless its SHA-256 and
its program's are the ones crypto-price-fetchers pins, the helpers the
command lines check a day with and end quietly with when their output
closes (`crypto-price-fetchers/lib/calendar-day`, `…/lib/closed-output`),
the checks of a settings file against its JSON Schema and the option
parsers made from the same kinds of value (`…/lib/settings-file`,
`…/lib/settings-schema`), `checkConflicts`, which refuses a typed option
that conflicts with one a settings file sets (`…/lib/option-conflicts`),
and the checks the tests make of each command
line's help and of the repo's tracked files
(`crypto-price-fetchers/lib/command-line-help`, `…/lib/repo-checks`).

The three `package.json` files name its main branch (`#main`), the same ref
(a test holds them equal), and each `package-lock.json` keeps the commit
installed, which `npm ci` installs. A change there reaches this repo once
the lockfiles are made again. crypto-price-fetchers' versions tool does
that, and this repo runs it as `npm run github-project-deps`: `-- main`
takes main's newest commit, and `-- release` switches all three to the latest
release (`#semver:*`), its highest version tag. The tool sets the ref,
makes each lockfile again from a fresh `node_modules`, and puts every
`package.json` and lockfile back if an install fails.

---

## Technology Choices

- **Node 24 or later**, ES modules, and Node's own test runner.
- **ethers** for the chain, where a program reads it in Node.
- **Apps Script's own services** in the Sheets script, which can import no
  package.
- **asciichart**, a package that draws a line chart in text, for the ratio
  chart; **commander** for the command lines
  of the balance checker, the ratio chart and the Summ sweep.
