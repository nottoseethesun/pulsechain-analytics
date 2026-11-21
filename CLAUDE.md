# pulsechain-analytics — notes for Claude

## Conventions

Follow the coding standards of LP Ranger, the owner's bot that manages his
9mm V3 liquidity positions: its `CLAUDE.md` and everything under
`docs/claude/`, in [nottoseethesun/lp-ranger](https://github.com/nottoseethesun/lp-ranger)
or the local clone at `~/code/lp-ranger/github-repo/lp-ranger/`. Read them, and
never change anything in LP Ranger.

The repo's programs run on Node, the program that runs JavaScript outside a
browser; npm, Node's package manager, installs their packages and runs the
commands `package.json` names; git, the version-control program, keeps the
repo's history, on GitHub, the website that hosts it.

Work in this repo, never in a copy of it. Code written to check something goes
into the tests, so that later sessions reuse it instead of writing it again.

**Never show any character of an api key once it is entered**: not in a
reply, a log line, an error message, a test's output, or a listing.

The Sheets scripts in `for-google-apps/`, scripts for Google Sheets,
Google's spreadsheet app, written in Apps Script, Google's platform for
scripts that run inside its apps, change only here. The owner pastes them
into Apps Script and deploys them as a library. The deployed library has
a function this repo's copy lacks, `getTokenTransferredUseCache`, which
`wrapper.gs` calls.

## Node versions of the Sheets scripts

`for-google-apps/check-token-balance/fetch-amount-of-token-transferred.js` is
the Node version of the `.gs` beside it. It runs the `.gs` unchanged, through
the runner of crypto-price-fetchers, the owner's repo of code his projects
share, which this repo installs (below); the runner
(`crypto-price-fetchers/apps-script-runner`) runs an Apps Script file under
Node. The Node version never copies the script's
logic, since LP Ranger's rules forbid a second copy. A fix belongs in the
`.gs`, where it fixes both. `wrapper.gs` gets no Node version: it exists only
because a sheet reaches a library's functions through a wrapper.

A change to the runner reaches this repo once its lockfiles are made again
(see crypto-price-fetchers, below). The Node version reads its rpc
endpoint, the json-rpc api of the PulseChain node it asks, from
`config.json` beside it, which git ignores; `config-example.json`
shows the shape.

The module of the same name at the repo's top folder,
`fetch-amount-of-token-transferred.js`, works out the same amount with
ethers, a library for talking to Ethereum-style chains, in code of its own;
other code imports its `getTokenTransferred`, and running it does nothing.

## Keys

No api key is committed. The keys the programs send (that of DexTools, a
service that prices tokens from the pools of decentralized exchanges, for
the fallback of the ratio chart, which charts the ratio of two tokens'
prices in the terminal, as the top `config.json` lists them under
`apiKeys`) are kept in `api-keys.json` at the repo's top, which git
ignores, encrypted with one password the owner types, by
crypto-price-fetchers' key store (`crypto-price-fetchers/api-key-store`).
`npm run api-keys` runs its manager (`manage-api-keys.js`), and
`source ./unlock-api-keys.sh`, a script at the repo's top, keeps the
password for a terminal in `API_KEYS_PASSWORD`. `unlock-api-keys.sh` is a copy of
crypto-price-fetchers', which a test holds it to; a change to it is made
there. The ratio chart opens the DexTools key the first time it asks
DexTools (`chart-price-ratio/dextools.js`). A key is never a setting in a
file git keeps, nor a command-line argument. A test names a key file of its
own, never the owner's, and passes no `API_KEYS_PASSWORD` it did not set.

## crypto-price-fetchers

The top `package.json`, `chart-price-ratio/package.json` and
`check-token-balance/package.json` install crypto-price-fetchers from
GitHub, following its main branch (`#main`), the same ref in all three,
which `test/dependencies.test.js` holds; each `package-lock.json` keeps the
commit installed. crypto-price-fetchers' versions tool, which this repo
runs as `npm run github-project-deps -- main|release`, sets the ref in all
three to `#main` or `#semver:*` (the latest release) and makes each
lockfile again; the tool lives there, and this repo keeps no copy. A
package that imports a package lists it itself: the top lists commander,
which the Summ sweep and the Sheets script's Node version declare their
command lines with, rather than reach the copy crypto-price-fetchers
installs.

The command lines check a day with crypto-price-fetchers' `dayStartSeconds`
(`crypto-price-fetchers/lib/calendar-day`), which refuses a day the
calendar does not have, and an url with its `isHttpUrl`
(`crypto-price-fetchers/lib/http-url`), as commander parses them; each
entry point calls its `endQuietlyWhenOutputCloses`
(`crypto-price-fetchers/lib/closed-output`) before it starts, so a command
line whose output is piped into a program that stops reading, such as
`head`, ends with its exit code and no stack trace. The help test checks
that of each command line, and `test/repo-checks.test.js` holds the
tracked files to its repo checks (`crypto-price-fetchers/lib/repo-checks`):
every EVM address in EIP-55's form, every npm target named in
`docs/npm-project-commands.md`, every test file and helper named in the
docs, and every link and path in a doc pointing at a file, folder or
heading the repo keeps.

The Summ sweep, which compares a wallet's history with its records in
Summ (below), writes what its command line catches through
crypto-price-fetchers' `messageOf` (`crypto-price-fetchers/lib/message-of`);
this repo keeps no copy of it.

The ratio chart asks GeckoTerminal, a service that lists the pools of
decentralized exchanges with their prices and candles, through
crypto-price-fetchers' client
(`crypto-price-fetchers/dex-prices/geckoterminal`), which
`chart-price-ratio/gecko-terminal.js` shapes for the chart; this repo keeps
no GeckoTerminal client of its own.

## Docs

`docs/architecture.md` says how the tools work, `docs/engineering.md`
covers the files, the gates, the tests and CI (the gates, run by GitHub
Actions at each push), and
`docs/npm-project-commands.md` lists every npm command, as LP Ranger's
`docs/` does. A change keeps them true.

Every doc passes the owner's documentation audit: it tells no story of an
old bug, leads every topic and sub-topic with the context it needs,
introduces each tool where it first names it, explains with facts rather
than adjectives, and leaves out no step in the logic of an explanation. A
tool is anything a reader runs or a program uses: an `npm run` command, a
bin, a script, a package or an outside service. Its introduction starts
from the big picture, gives a few words of context or a scenario where the
tool is used, says which codebase it comes from, and says what it does in
precise words.

## Command lines

Every command line in this repo answers `--help`, and `-h`, with all it
takes and how to use it: each option and argument with what it does, then
examples of its common uses, each a full command and what it does, and its
exit codes. An npm target that runs one passes the flag through, as
`npm run <target> -- --help`. Each is declared with commander, the package
that parses command lines, so the options its help lists come from the
declaration the program parses; the examples and exit codes go in the
help's closing text (`addHelpText("after", …)`).
`docs/npm-project-commands.md` lists every npm target, including those
that run other tools, such as `lint` and `check`, with its flags and an
example. LP Ranger's rules do not yet ask for the examples; this repo does.

## Gates and CI

`npm run check` is the one gate, LP Ranger's: the lint (ESLint, which checks
JavaScript against rules, here LP Ranger's and crypto-price-fetchers'
`no-or-default`, which refuses a default made with `||`; markdownlint, which checks the
form of Markdown files; Prettier, which formats code; actionlint, which
checks the GitHub Actions workflow files, run from its official release by
crypto-price-fetchers' bin `run-actionlint`, which refuses an archive whose
SHA-256 differs from the one it pins; and knip, which finds files nothing
uses), the tests with at least 80% of lines covered, and the security
audits (npm audit, npm's check of the installed packages against known
vulnerabilities, for the three packages, with `run-actionlint --check`,
which checks every archive of that release; the security lint in
`eslint-security.config.js` with crypto-price-fetchers' `no-secret-logging`,
a rule that refuses printing a name that may hold a secret; and secretlint,
which looks for keys and credentials in files). It must pass before a commit
and a push; husky, the package that runs scripts at git's hooks, runs
`npm run lint` before each commit. CI runs `npm run check` on both supported
versions of Node (below), in `ci.yml`, and each audit as a job of its own
(`security-audit.yml`), after installing the three packages. `main` is
protected: those five checks must pass on a pull request, never squashed,
and no branch is deleted. LP Ranger's eight steps in
`docs/claude/CLAUDE-CI.md` take a change to `main`.

## Supported versions of Node

The repo supports two major versions of Node: the newest LTS (long-term
support) version, today 26, and the version two majors before it, today 24.
Every tool and test runs on both. `engines` in `package.json` names only the
oldest supported major as a minimum, `>=24`, raised to a minor version, such
as `>=24.15`, only when the code needs what that version added; no file pins
or requires one exact version of Node.

CI runs the gate on each, as two checks named for their roles, never for
their versions: `check-latest-nodejs-lts` and
`check-oldest-nodejs-supported`, in `ci.yml`. Moving to newer versions
changes the two `node-version` values there, `NODE_VERSION` in
`security-audit.yml`, `engines` and the docs, but never a check's or a
file's name, so `main`'s required checks stay as they are.

## Tests

The tests are in `test/`, on Node's own test runner. They ask no outside
service.

```bash
npm ci
npm ci --prefix chart-price-ratio
npm ci --prefix check-token-balance
npm run check
```

They cover `fetch-amount-of-token-transferred.js`, its Sheets twin, which
runs unchanged under Node, the twin's Node version, the balance checker
(its command line, declared in `check-token-balance/balance-command.js`,
its reads against a stand-in endpoint, and how it writes a balance), the
ratio chart, its command line (declared with
commander, the package that reads a command line's options, in
`chart-price-ratio/ratio-command.js`) included, the api keys, a wallet's
history read from the chain alone (`wallet-history/`, below), and the
Summ sweep (`summ-sweep/`). The
Sheets script also has test functions that the owner runs by hand in Apps
Script; `docs/engineering.md` sets the two kinds apart. `test/helpers/`
holds the stand-ins:

- `stand-in-chain.js` is a PulseChain rpc endpoint held in memory, with
  options for the other cases: a failed read, a transaction it doesn't know,
  more Transfer events in the receipt, or another transfer in the same block.
  `standInChainFetch` hands it the requests of the Node version.
- `transfer-cases.js` lists the cases both copies of `getTokenTransferred` are
  tested on, so the two give the same answers.
- `ethers-stand-in.js` routes ethers' http requests to a stand-in chain.
- `sheets-script.js` runs a Sheets script in the test's thread with the
  runner's services, its `UrlFetchApp` answering from a stand-in chain.
- `stand-in-web-preload.js` replaces `fetch` in a program a test starts,
  with answers from a file the test writes; `ratio-chart.js` runs the ratio
  chart with it, against a stand-in GeckoTerminal and DexTools.
- `known-bug.js` declares a known-bug test, described below.
- `stand-in-wallet-chain.js` is a PulseChain endpoint held in memory for
  `wallet-history/`, built from blocks a test describes. It works out
  balances from the description, never through the code tested, refuses a
  log search wider than its limit, and counts every request.
- `summ-pages.js` writes pages of Summ's results as Summ's connector
  returns them.
- `summ-sweep-case.js` is the made-up wallet history the Summ sweep's tests
  sweep: its chain, LP Ranger's records, Summ's rows, the header of Summ's
  csv template, and temp folders. The tests hold no amount, id, name or
  address from the owner's own books, since the repo is public.
- `summ-gaps.js` builds the legs and transactions the tests of the gap
  rules book, and runs `rowsForGaps` on them.

## A wallet's history

`wallet-history/` reads what a wallet moved from the chain alone: tokens
from the logs, its transactions from its nonce, PLS from receipts, traces
and its balance. The explorer, the website that shows PulseChain's blocks
and transactions, is never asked: its lists are a copy its own
indexer makes, which nothing holds to the chain. Its nonce search and request
pacing are second copies of LP Ranger's wallet report's, since those files
load LP Ranger's settings as they load and LP Ranger is never changed.
Counts and balances at past blocks need an endpoint that keeps past state,
and traces one that offers the debug methods, as that of g4mm4, a
PulseChain node operator that serves public endpoints, does.

## The Summ sweep

`summ-sweep/` (`npm run summ-sweep`) compares a wallet's history with
its records in Summ, the owner's crypto tax calculator, saved a page at a
time from Summ's connector for Claude. It writes a csv of rows for what
Summ lacks, booked by the rules of the owner's skill for missing
transactions, the procedure in his private skill files (`gap-rules.js`,
`gaps.js`), and a report of the withdrawals from 9mm V3 positions to fix
in Summ and the questions for the legs no rule books. Claude makes the
fixes through Summ's connector, and puts the questions to the owner.

The owner gives the time up to which Summ's sync has read the wallet's
transactions (`--summ-synced-to`), since Summ's connector gives an
account's last sync as a date alone; a transaction after that time gets
no gas, for the sync to bring. Addresses are held in EIP-55's mixed case,
as LP Ranger holds them, and compared as text; the Summ csv utility writes
them in lower case.

**Every csv file for Summ is written by crypto-price-fetchers' Summ csv
utility** (`crypto-price-fetchers/summ-csv`), as the sweep writes its csv:
never by a script written for the occasion. The owner's rule.

The sweep reads each withdrawal through LP Ranger's
`util/bookkeeping/coins-in-transaction.js`, which prints what one
transaction moved for a wallet, run as a program of its own in the
owner's LP Ranger checkout, since LP Ranger is never changed. The
chain's facts are in the top `config.json`, under `pulsechain`; the owner's
settings (his template's path, his LP Ranger checkout, his own wallets,
his spam and income tokens, each token's symbols in Summ and in a csv) are
in `summ-sweep/config.json`, which git ignores; `config-example.json`
beside it shows the shape.

## Known bugs

One is known: the balance checker's `--date` reads at the block whose time
is nearest the start of the day, which can be the day's first block, so
its transactions are counted in a balance the help calls the day's start.
When one is found, it gets a test in
`test/known-bugs.test.js`, declared with `knownBug`, so the test passes while
the bug is present. The bug's fix makes its test fail; declare that test with
`it` instead, in the same change, among the tests of the code it is about.
