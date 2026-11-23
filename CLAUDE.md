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

The Sheets scripts in `src/for-google-apps/`, scripts for Google Sheets,
Google's spreadsheet app, written in Apps Script, Google's platform for
scripts that run inside its apps, change only here. The owner pastes them
into Apps Script and deploys them as a library. The deployed library has
a function this repo's copy lacks, `getTokenTransferredUseCache`, which
`wrapper.gs` calls.

## Where things are

The programs a reader runs from a terminal are in `bin/`: the Summ
sweep, the Sheets script's Node version, a start file for each tool
with a package of its own, `check-token-balance.js` and
`pulse-token-ratio.js`, which loads the tool's program from its folder,
the key manager and `unlock-api-keys.sh`. Each tool's code and packages
stay in its own folder, and the Sheets scripts are in
`src/for-google-apps/`. The Summ sweep reads its settings from the
folder it runs in, the repo's top; the ratio chart and the balance
checker read the `config.json` in their own folders, and the Sheets
script's Node version the one beside the `.gs`.

A tool that reads the owner's own files takes them from its `input/`
folder, and writes its results in its `output/` folder, in a folder for
each kind of file: `output/csv/` for csv files and `output/json/` for
json. The ratio chart has `output/csv/`; the Summ sweep has `input/`, for
the saved pages of Summ's results, `output/csv/` and `output/json/`. Git
keeps each such folder by its `.gitkeep`, an empty file, and ignores
everything else in it, as the format check and the secret scan do. A
file a tool writes when no option names one goes in its own `output/`
folder, wherever it runs: the ratio chart's CSV, at config.json's
`csvFilename`, a path read from the chart's folder. A test names its own
files, in temp folders, so it never writes in those folders.

## Node versions of the Sheets scripts

`bin/fetch-amount-of-token-transferred.js` is the Node version of
`src/for-google-apps/check-token-balance/fetch-amount-of-token-transferred.gs`.
It runs the `.gs` unchanged, through
the runner of crypto-price-fetchers, the owner's repo of code his projects
share, which this repo installs (below); the runner
(`crypto-price-fetchers/apps-script-runner`) runs an Apps Script file under
Node. The Node version never copies the script's
logic, since LP Ranger's rules forbid a second copy. A fix belongs in the
`.gs`, where it fixes both. `wrapper.gs` gets no Node version: it exists only
because a sheet reaches a library's functions through a wrapper.

A change to the runner reaches this repo once its lockfiles are made again
(see crypto-price-fetchers, below). The Node version reads its rpc
endpoint, the json-rpc api of the PulseChain node it asks, from the
`config.json` beside the `.gs`, which git ignores; `config-example.json`
there shows the shape.

The module of the same name at the repo's top folder,
`fetch-amount-of-token-transferred.js`, works out the same amount with
ethers, a library for talking to Ethereum-style chains, in code of its own;
other code imports its `getTokenTransferred`, and running it does nothing.

## Keys

No api key is committed. The keys the programs send, as the top
`config.json` lists them under `apiKeys`, are those of the ratio chart,
which charts the ratio of two tokens' prices in the terminal: DexTools',
for its fallback to current prices, and Moralis's, for its candles.
DexTools and Moralis are services that price tokens from the pools of
decentralized exchanges. The keys are kept in `api-keys.json` at the
repo's top, which git ignores, encrypted with one password the owner
types, by crypto-price-fetchers' key store
(`crypto-price-fetchers/api-key-store`). `npm run api-keys` runs its
manager (`bin/manage-api-keys.js`), and `source ./bin/unlock-api-keys.sh`,
a script in `bin/`, keeps the password for a terminal in
`API_KEYS_PASSWORD`. `bin/unlock-api-keys.sh` is a copy of
crypto-price-fetchers', which a test holds it to; a change to it is made
there. The ratio chart opens each key the first time it asks that service
(`chart-price-ratio/api-keys.js`). A key is never a setting in a file git
keeps, nor a command-line argument. A test names a key file of its own,
never the owner's, and passes no `API_KEYS_PASSWORD` it did not set.

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
calendar does not have, and an url or a number with a parser made from
its kinds of value (`crypto-price-fetchers/lib/settings-schema`), the
kinds the settings files' schemas give the same settings (Settings,
below), as commander parses them; the Summ sweep checks with its
`newFileRefusal` (`crypto-price-fetchers/lib/new-file`) that the folder
of each file it writes takes a new file, making one there and removing
it; each entry point calls its `endQuietlyWhenOutputCloses`
(`crypto-price-fetchers/lib/closed-output`) before it starts, so a command
line whose output is piped into a program that stops reading, such as
`head`, ends with its exit code and no stack trace. The help test checks
that of each command line, and `test/repo-checks.test.js` holds the
tracked files to its repo checks (`crypto-price-fetchers/lib/repo-checks`):
every EVM address in EIP-55's form, every npm target named in
`docs/project-commands.md`, every test file and helper named in the
docs, every link and path in a doc pointing at a file, folder or
heading the repo keeps, and a `config-example.json` beside every
`config.json`, holding what a committed `config.json` holds.

The Summ sweep, which compares a wallet's history with its records in
Summ (below), writes what its command line catches through
crypto-price-fetchers' `messageOf` (`crypto-price-fetchers/lib/message-of`);
this repo keeps no copy of it.

The ratio chart asks GeckoTerminal, a service that lists the pools of
decentralized exchanges with their prices and candles, Moralis and
DexTools through crypto-price-fetchers' clients
(`crypto-price-fetchers/dex-prices/geckoterminal`, `…/moralis`,
`…/dextools`), which `chart-price-ratio/gecko-terminal.js`,
`chart-price-ratio/moralis.js` and `chart-price-ratio/ratio-series.js`
shape for the chart; this repo keeps no client of its own for any of the
three. A run reads its candles from GeckoTerminal or from Moralis, never
from both; with a Moralis key saved it asks at the terminal which, unless
`--source` names one (`chart-price-ratio/ratio-source.js`), and DexTools
stays the fallback of either. Moralis's candles of a pair price the token
the pair lists first, so a run from Moralis reads, for each token, the
deepest active pair that lists it first.

## Settings

Each settings file in JSON is checked against its JSON Schema, a
description in JSON of the keys the file may hold and the kind of value
each takes, before a tool takes a setting, as LP Ranger checks its
settings: crypto-price-fetchers' `readSettingsFile`
(`crypto-price-fetchers/lib/settings-file`) reads the file, and each
schema is built from its kinds of value
(`crypto-price-fetchers/lib/settings-schema`), checked by Ajv, an npm
package that checks JSON against a schema, on draft 2020-12, strict. An
object of settings refuses a key its schema does not name; the Summ
sweep's `ownWallets`, `summSymbols` and `csvSymbols`, keyed by addresses,
take any address as a key and refuse any other. A file that is not JSON,
a key refused, or a value of the wrong kind stops the run, with every
problem listed, one line each; a value is refused, never corrected. The
schemas:

- `chart-price-ratio/config.json`: `RATIO_SETTINGS_SCHEMA`, which
  `buildRatioCommand` (`chart-price-ratio/ratio-command.js`) checks before
  it takes a default. Commander refuses two conflicting options only when
  both are typed, so a hook before the action refuses, with
  crypto-price-fetchers' `checkConflicts`
  (`crypto-price-fetchers/lib/option-conflicts`), `--source` beside a
  `useDexToolsOnly` the file sets.
- `check-token-balance/config.json`, read beside the checker's files, so a
  run from the top folder never reads the top `config.json`:
  `check-token-balance/settings.js`.
- The top `config.json`'s `pulsechain` and `summ-sweep/config.json`:
  `summ-sweep/settings.js`.
- The Sheets script's Node version's `config.json`: `CONFIG_SCHEMAS` in
  `bin/fetch-amount-of-token-transferred.js`,
  an http or https url as `config.rpcUrl` and no other field, which
  crypto-price-fetchers' runner checks before the script opens. The
  runner's `configSchemaProblems`, which the Node version's tests run,
  holds the schema to the script: it names every field the script reads
  each time it is called, and none it reads as it loads.

When its file is refused, the ratio chart (`ratioCommandFrom`) and the
balance checker build their command lines from the defaults written in
their code, so `--help` still answers, and a hook before the action stops
any other run on the file's problems.

A schema names only the keys its file is read for; a key is added to one
with the owner's go-ahead.

Each kind of `config.json` ships with a `config-example.json` beside it,
which git keeps and never ignores, and which holds the file's settings
with their default values, those written in the code where the code holds
them, which stay there for now; no program reads an example. A
`config.json` git keeps holds the repo's defaults, so its example holds
the same settings: the top one's, the ratio chart's and the balance
checker's. The examples of the owner's own settings, the Summ sweep's and
the Sheets script's Node version's, show the shape with made-up values.
The repo checks (crypto-price-fetchers, above) find a `config.json` with
no example, and an example that differs from its committed `config.json`.

## Docs

`docs/architecture.md` says how the tools work, `docs/engineering.md`
covers the files, the gates, the tests and CI (the gates, run by GitHub
Actions at each push), and
`docs/project-commands.md` lists every command, those npm runs and those
run with `node` or `source`, as LP Ranger's `docs/` does. A change keeps
them true.

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
help's closing text (`addHelpText("after", …)`). `bin/unlock-api-keys.sh`, the copy of crypto-price-fetchers' script that a terminal sources, is the one command line not in JavaScript: the help it answers is written in it, a reader of that help that stops reading ends it quietly, it ignores any argument but `-h` and `--help`, since a sourced script sees its caller's arguments, and the help test runs it with bash.
`docs/project-commands.md` lists every npm target, including those
that run other tools, such as `lint` and `check`, and every command line
run with `node`, each with its flags and an example. LP Ranger's rules do
not yet ask for the examples; this repo does.

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
Every tool, every test and every npm command, each a target a `package.json`
names (`docs/project-commands.md` lists them), runs on both. `engines` in
`package.json` names only the oldest supported major as a minimum, `>=24`,
raised to a minor version, such as `>=24.15`, only when the code needs what
that version added; no file pins or requires one exact version of Node.

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
  more Transfer events in the receipt, another transfer in the same block,
  or a token of other decimals. `standInChainFetch` hands it the requests
  of the Node version.
- `transfer-cases.js` lists the cases both copies of `getTokenTransferred` are
  tested on, so the two give the same answers.
- `ethers-stand-in.js` routes ethers' http requests to a stand-in chain.
- `sheets-script.js` runs a Sheets script in the test's thread with the
  runner's services, its `UrlFetchApp` answering from a stand-in chain.
- `stand-in-web-preload.js` replaces `fetch` in a program a test starts,
  with answers from a file the test writes; `ratio-chart.js` runs the ratio
  chart with it, against a stand-in GeckoTerminal, Moralis and DexTools,
  and in a pseudo-terminal, through util-linux's `script`, to answer its
  questions as at the owner's terminal.
- `stand-in-settings-preload.js` hands the ratio chart or the balance
  checker, run in a child process, a settings file of the test's own,
  from an environment variable, since each reads the `config.json` beside
  its own files and a test never writes a file git keeps.
- `known-bug.js` declares a known-bug test, described below.
- `stand-in-wallet-chain.js` is a PulseChain endpoint held in memory for
  `wallet-history/`, built from blocks a test describes, with the coins
  each position was owed for the position manager's `positions`. It works
  out balances from the description, never through the code tested,
  refuses a log search wider than its limit, counts every request, and
  records the block each contract call asks at.
- `summ-pages.js` writes pages of Summ's results as Summ's connector
  returns them.
- `summ-sweep-case.js` is the made-up wallet history the Summ sweep's tests
  sweep: its chain, LP Ranger's records, Summ's rows, the header of Summ's
  csv template, and temp folders. The tests hold no amount, id, name or
  address from the owner's own books, since the repo is public.
- `summ-gaps.js` builds the legs and transactions the tests of the gap
  rules book, and runs `rowsForGaps` on them.
- `summ-sweep-command-run.js` runs the Summ sweep's command line on a repo
  top in a temp folder, with the stand-in chain, a saved page of Summ's
  results and LP Ranger's records.

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
owner's LP Ranger checkout, since LP Ranger is never changed. A position
owed coins when the range began, as the position manager's `positions`
shows at the block before it (`summ-sweep/owed.js`), may pay principal
from before the range in its first collect within it: that collect is
reported, never split, and its coins Summ lacks become questions, and so
is each later collect until the range's Collect events have paid out all
it was owed then. The
chain's facts are in the top `config.json`, under `pulsechain`; the owner's
settings (his template's path, his LP Ranger checkout, his own wallets,
his spam and income tokens, each token's symbols in Summ and in a csv) are
in `summ-sweep/config.json`, which git ignores; `config-example.json`
beside it shows the shape.

## Known bugs

One is known, with its test in `test/known-bugs.test.js`: git keeps a
file written directly in the Summ sweep's or the ratio chart's `output/`
folder, which `.gitignore` should ignore.
When one is found, it gets a test in
`test/known-bugs.test.js`, declared with `knownBug`, so the test passes while
the bug is present. The bug's fix makes its test fail; declare that test with
`it` instead, in the same change, among the tests of the code it is about.
