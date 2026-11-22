# pulsechain-analytics — Engineering Reference

The files the programs read and write, the gates every change passes, the
tests, and CI: the same gates, run at each push by GitHub Actions, the
service of GitHub, the website that hosts the repo. The programs are this
repo's tools for questions about PulseChain: the amount a transaction sent
(a module for Node programs and a script for Google Sheets, Google's
spreadsheet app), the balance checker, which prints a wallet's balances of
tokens at a block or a day, the ratio chart, which charts the ratio of two
tokens' prices over time, a wallet's history, and the Summ sweep, which
compares a wallet's history with its records in Summ, the owner's crypto tax
calculator. For how the tools work, see
[`docs/architecture.md`](architecture.md); for every command, those the
repo's `package.json` files give npm, the package manager of Node, the
program that runs JavaScript outside a browser, to run and those run with
`node` or `source`, see [`docs/project-commands.md`](project-commands.md).

The repo follows the coding standards of LP Ranger, the owner's bot that
manages his 9mm V3 liquidity positions: its `CLAUDE.md` and
`docs/claude/`, in
[nottoseethesun/lp-ranger](https://github.com/nottoseethesun/lp-ranger).

---

## Table of Contents

- [Quick Start](#quick-start)
- [Files on Disk](#files-on-disk)
- [The Gate: `npm run check`](#the-gate-npm-run-check)
- [Lint](#lint)
- [Tests](#tests)
  - [How the Sheets Script Is Tested](#how-the-sheets-script-is-tested)
- [Security Audits](#security-audits)
- [Dead Code Detection](#dead-code-detection)
- [CI and Branch Protection](#ci-and-branch-protection)
- [Known Bugs](#known-bugs)

---

## Quick Start

The repo supports two major versions of Node: the newest LTS (long-term
support) version, today 26, and the version two majors before it, today
24. Every tool, every test and every npm command runs on both, and CI runs
the gate on each (below).

A working copy needs Node 24 or later, the packages of the repo and of its
two tools that have packages of their own, and the keys the ratio chart
sends: DexTools', for its fallback to current prices, and, for two years
of daily candles, Moralis's. DexTools and Moralis are services that price
tokens from the pools of decentralized exchanges. The keys are kept by the
key store of
crypto-price-fetchers, the owner's repo of code his projects share, which
each of the three `npm ci` below installs from GitHub, at the commit its
folder's `package-lock.json` keeps. This repo's `npm run api-keys` runs the key
store's manager, and `npm run check` runs the gate below. From the repo's
top folder:

```bash
npm ci
npm ci --prefix chart-price-ratio
npm ci --prefix check-token-balance
npm run api-keys     # save the DexTools and Moralis keys, once, for the ratio chart
npm run check        # the gate
```

---

## Files on Disk

The programs and their tests read and write these files. Git, the
version-control program that keeps the repo's history, keeps only the ones
that hold no key and none of the owner's own settings.

| File | In git | What it holds |
| ---- | ------ | ------------- |
| `config.json` | yes | The services whose keys the programs send, under `apiKeys`, and the chain's facts the Summ sweep reads, under `pulsechain`. No key. |
| `summ-sweep/config.json` | no | The owner's settings for the Summ sweep: the path of his Summ template and of his LP Ranger checkout, his own wallets with their names, his spam and income tokens, and each token's symbols in Summ and in a csv. `summ-sweep/config-example.json` beside it shows the shape, with made-up addresses. |
| `api-keys.json` | no | The keys, each encrypted with the owner's password. `api-keys.json.tmp` is the file it is written through. `API_KEYS_FILE_PATH` names another, as the tests do. |
| `chart-price-ratio/config.json` | yes | The ratio chart's settings, checked against `RATIO_SETTINGS_SCHEMA`: GeckoTerminal's network, DexTools' plan, Moralis's chain and the days a run reads from it, the interval, the CSV's name. No key. |
| `check-token-balance/config.json` | yes | The balance checker's rpc endpoint, the json-rpc api of a PulseChain node it reads balances from, checked against `SETTINGS_SCHEMA` in `check-token-balance/settings.js`. |
| `for-google-apps/check-token-balance/config.json` | no | The Node version's rpc endpoint, an http or https url (`CONFIG_SCHEMAS`); `config-example.json` beside it shows the shape. |
| `coverage/` | no | A test run's coverage report. |

The Summ sweep writes its csv and its report at the paths its command line
names, outside the repo, and never over a file already there without
`--replace`. It checks both paths before it writes either.

---

## The Gate: `npm run check`

`npm run check` runs every gate, in order, and stops at the first that
fails: the lint, the tests with coverage, then the three security audits. It
must pass before every commit and push, and CI runs it on Node 26, the
newest LTS (long-term support) version, and on Node 24, the oldest the repo
supports.

---

## Lint

The lint checks each file's form before any test runs: the rules the code
follows, its formatting, the workflows, and files nothing uses.
`npm run lint` runs five tools: four npm packages, and actionlint, a
program its author publishes for each system, which the table's fourth
row explains:

| Tool | Configured in | What it does, and what it holds the repo to |
| ---- | ------------- | ------------------------------------------- |
| ESLint | `eslint.config.js` | Checks JavaScript against rules: LP Ranger's, with no warning allowed: cyclomatic complexity ≤ 17, ≤ 500 lines of code a file (blank lines and comments not counted), lines ≤ 80 characters but strings, urls and comments, `===`, no unused name, no `var`, `const` where nothing is reassigned, no `Math.random`, no comment that tells Prettier, the formatter in the row below, to skip code, and every import resolved. It reads the Sheets scripts too, as the paragraph below the table says. And `no-or-default`, crypto-price-fetchers' rule against `a \|\| b` whose value is kept, as a default is, when `b` is no boolean: `\|\|` takes its fallback for every falsy value, so a default is written with `??` or an explicit check. |
| markdownlint | `.markdownlint-cli2.jsonc` | Checks the form of Markdown files, with LP Ranger's settings, over every Markdown file. |
| Prettier | `.prettierrc`, `.prettierignore` | Formats code; in check mode, it fails when its formatting would change any JavaScript, Sheets script, JSON or YAML file. |
| actionlint | crypto-price-fetchers' `actionlint/release.js` | Checks the GitHub Actions workflow files, in `.github/workflows/`, for mistakes in their syntax, their expressions and the shell scripts their steps run. The lint runs the official release of actionlint, rhysd's program, through `run-actionlint`, a bin of crypto-price-fetchers: the first run downloads the archive for its system, refuses it unless its SHA-256 is the one crypto-price-fetchers pins, and keeps the program in `node_modules/.cache/actionlint/`, which later runs use. |
| knip | `knip.json` | Finds files nothing imports or runs, and fails on any. See [Dead Code Detection](#dead-code-detection). |

The Sheets scripts are plain scripts, not modules: Apps Script, Google's
platform for scripts that run inside its apps, loads them
without imports, with its services as globals. ESLint reads them the same
way. `wrapper.gs` calls the deployed library by the name Apps Script gives
it, which no import declares, so a `/* global */` comment declares it.

The lint covers the tools in `chart-price-ratio/` and `check-token-balance/`,
whose imports resolve once their own packages are installed. husky, a
package that runs scripts at git's hooks, runs `npm run lint` before each
commit (`.husky/pre-commit`); this repo's `prepare` script installs the
hook at `npm install`. `npm run format` or `npm run lint:fix` fixes
formatting. No rule
is ever switched off in a file, no file is left out of the lint, and a file
over 500 lines is split, not excused.

---

## Tests

The tests are in `test/`, on Node's test runner. They run the tools against
stand-ins for PulseChain; GeckoTerminal, a service that lists the pools of
decentralized exchanges with their prices and candles; Moralis; DexTools; and LP
Ranger's bookkeeping tool, which prints what one transaction moved for a
wallet; so they ask nothing outside the computer. They never read the
owner's key file or password.

| Test | What it covers |
| ---- | -------------- |
| `fetch-amount-of-token-transferred.test.js` | The module on ethers, a library for talking to Ethereum-style chains, against a stand-in chain. |
| `fetch-amount-of-token-transferred-gs.test.js` | The Sheets script, run unchanged under Node; and `wrapper.gs`, against a stand-in of the deployed library, giving its amount and letting its error through. |
| `fetch-amount-of-token-transferred-node-version.test.js` | The Sheets script's Node version, its command line included; its schema of the script's config object held to the script by crypto-price-fetchers' `configSchemaProblems`, and a `config.json` it refuses. |
| `format-balance.test.js` | How the balance checker writes a balance. |
| `check-token-balance.test.js` | The balance checker: its command line, each option checked as it is parsed, and a mistake refused, naming its option, before the chain is asked anything; and the real program, run against a stand-in PulseChain endpoint served on the computer: each balance read once at the block given, or at the last block made before the start of the date given, even when the day's first block is nearer that start, then written with commas and plain, and a failed read's exit code. |
| `check-token-balance-settings.test.js` | The balance checker's settings (`check-token-balance/settings.js`): the committed `config.json` held to its schema, g4mm4's endpoint for a file that names none and, with a notice, for no file, a key no setting has and an endpoint that is no url refused, listing every problem; and a copy of the checker's files in a temp folder, run with a `config.json` beside it that is not JSON or names no url, stopping with exit code 1, naming the file or the setting, after naming a mistake in an option first, and reading the `config.json` beside it, not the one of the folder it runs in. |
| `ratio-command.test.js` | The ratio chart's command line as it takes `config.json`'s settings, parsed in the test's thread: the committed file held to its schema and taken as the options' defaults, a `maxCandles` of 0 and several problems at once, nested settings among them, refused, `--source` refused beside a `useDexToolsOnly` the file sets, as beside a typed one, an empty value refused for each option that takes text, and the command `ratioCommandFrom` builds when the settings are refused: its help, a run stopped on the settings' problems, and a mistake in the arguments named first. |
| `pulse-token-ratio.test.js` | The ratio chart, run as its owner runs it, reading GeckoTerminal's candles, against a stand-in GeckoTerminal, which lists candles newest first and makes none for a day in which nothing traded, as GeckoTerminal does, and a stand-in DexTools, with the DexTools key from a key file of the test's own: its prices, read oldest first, its recent and current ratios, its weekly points, its pairing of the two tokens' prices by time, a token's own prices when it is its pool's quote token, its fallback, its command line, its default interval, its exit codes, a series of few points drawn with each point widened, and the most points a weekly chart from GeckoTerminal can have, which a weekly run says; and the rows' dates, with the hour in an hourly run (`ratioRows`). |
| `refused-settings.test.js` | The ratio chart and the balance checker, run whole with a refused `config.json` handed to them by `helpers/stand-in-settings-preload.js`: each answers `--help` with its help, and stops any other run, with exit code 1, on the file's problems. |
| `pulse-token-ratio-moralis.test.js` | The ratio chart reading Moralis's candles, against a stand-in Moralis, GeckoTerminal and DexTools, with the Moralis and DexTools keys from key files of the test's own: the deepest active pair that lists each token first, the two years of daily candles it reads unless `--moralis-days` names another span, its hourly and weekly charts, its fallback to DexTools when Moralis's candles price another token, and its stop when no pair lists a token first; and the choice of the source (`ratio-source.js`): the question asked when a Moralis key is saved, Enter taking Moralis, an answer asked again, `--source` in its place, the stop with no terminal to ask at, and `--source` refused with `--useDexToolsOnly` or with no Moralis key saved; and the question answered in a pseudo-terminal, on Linux: Enter taking Moralis, then the password, which the terminal never shows, and 2 taking GeckoTerminal, opening no key. |
| `command-line-help.test.js` | Every command line's help, `--help` and `-h`, and its help into a pipe closed before it is written, which must end with exit code 0 and nothing on stderr: the Summ sweep's, the ratio chart's, the balance checker's, the Sheets script's Node version's, the key manager's, and those of the bins of crypto-price-fetchers the npm targets run, its versions tool and `run-actionlint`, each with its options, examples and exit codes, by crypto-price-fetchers' checks (`crypto-price-fetchers/lib/command-line-help`); and that its list holds every command line the repo runs, every bin of crypto-price-fetchers among them. |
| `api-keys.test.js` | The keys `config.json` lists, the key manager, which saves and lists the api keys, and the copy of `unlock-api-keys.sh`, the script that keeps the password for a terminal. |
| `repo-checks.test.js` | The repo's tracked files, by crypto-price-fetchers' checks (`crypto-price-fetchers/lib/repo-checks`): every EVM address in EIP-55's form, every npm target named in `docs/project-commands.md`, every test file and helper named in this doc or `CLAUDE.md`, and every link and path in a doc pointing at a file, folder or heading the repo keeps. |
| `dependencies.test.js` | crypto-price-fetchers installed from GitHub, following its main branch or its latest release, by the ratio chart and the balance checker too, with the same ref, and `npm run github-project-deps` running its versions tool. |
| `wallet-history.test.js` | The paced provider, the blocks of a range, the logs that name a wallet, the transactions it sent, their receipts and its tokens' facts, against a stand-in chain. |
| `wallet-history-coin.test.js` | The PLS a wallet moved: the calls of a trace that pay it, the flows of its own transactions, and the payments from elsewhere its balance reveals, against a stand-in chain whose balances are worked out apart from the code tested. |
| `summ-sweep.test.js` | The Summ sweep's reading of Summ's saved pages, its match of amounts in both forms Summ prints, the legs of a wallet's logs, and the match of the chain's legs with Summ's, a later match leaving out the Summ legs an earlier one used. |
| `summ-sweep-splits.test.js` | The split of withdrawals from positions into principal and fees, a pool's coins ordered by their addresses as numbers, the collects it refuses to split, LP Ranger's records of another shape refused, and LP Ranger's tool run through a stand-in and as a real program; the coins paid as PLS handed back apart, with principal or without, and a token coin with no principal left to the match (`sortSplits`); and the coins each position was owed when the range began (`owedWhenRangeBegan`). |
| `summ-sweep-run.test.js` | The whole sweep, `sweepWallet`, against a stand-in chain: a split Summ holds whole and one it holds in parts, the gaps booked, a question's amount in whole tokens, no block read for its time that the search for the wallet's transactions already read, a withdrawal paid as PLS, a position's first collect in the range reported when the position was owed coins as the range began, its coins asked about rather than booked, and a change of balance no payment explains. |
| `summ-sweep-command.test.js` | The sweep's command line: the csv written through crypto-price-fetchers' Summ csv utility, with addresses in lower case, and the report in EIP-55's mixed case; neither file written when one path is taken; a mistake in an option refused as it is parsed, before anything is read; the chain's facts of the wrong kind and an owner's address whose checksum is wrong refused, every problem listed, before the chain is read; the committed top `config.json` and `summ-sweep/config-example.json` held to their schemas; and its help, with its exit codes. |
| `summ-sweep-gap-rules.test.js` | The rules that book the legs Summ lacks outside a swap (a position's deposits, with the position's number and the PLS a deposit paid, NFTs, withdrawals and fees; wraps; spam; the owner's wallets; income tokens), and the question for each leg no rule books. |
| `summ-sweep-gaps.test.js` | The rows of swaps, of tokens and of PLS, with only what Summ lacks; how much of a transaction Summ holds; where its gas goes; a transaction later than the time given as reached by Summ's sync; and the Fee rows and questions of transactions that moved no token. |

`test/helpers/` holds the stand-ins:

- `stand-in-chain.js`: a PulseChain rpc endpoint held in memory, with
  options for the other cases: a failed read, a transaction it doesn't
  know, more Transfer events in the receipt, or another transfer in the
  same block. `standInChainFetch` hands it the Node version's requests.
- `transfer-cases.js`: the cases both copies of `getTokenTransferred` are
  tested on, so the two give the same answers.
- `ethers-stand-in.js`: routes ethers' http requests to a stand-in chain.
- `sheets-script.js`: runs a Sheets script in the test's thread with the
  runner's services, its `UrlFetchApp` answering from a stand-in chain.
- `stand-in-web-preload.js`: a preload for `node --import` that replaces
  `fetch` in a program a test starts with answers from a file the test
  writes, each for a url or for every url that starts with a text, and
  logs each request without any key.
- `ratio-chart.js`: runs the ratio chart in a child process with that
  preload, and builds GeckoTerminal's, Moralis's and DexTools' answers,
  among them a pool whose base token is not the chart's token
  (`quoteSideAnswers`) and a deeper pair at Moralis that lists a token
  second (`moralisAnswers`). `runChartInTerminal` runs the chart in a
  pseudo-terminal, through util-linux's `script`, a program that runs a
  command in one, and types each reply once its prompt shows.
- `stand-in-settings-preload.js`: a preload for `node --import` that
  hands the ratio chart or the balance checker, run in a child process, a
  settings file of the test's own, from the environment variable
  `STAND_IN_SETTINGS`, since each reads the `config.json` beside its own
  files, a file git keeps.
- `known-bug.js`: declares a known-bug test.
- `stand-in-wallet-chain.js`: a PulseChain endpoint held in memory for
  `wallet-history/`, built from the blocks a test describes: their
  transactions, logs, payments inside them, withdrawals and fee
  recipient. It answers block, log, count, balance, receipt, trace and
  contract requests, the position manager's `positions` among them, with
  the coins owed a test gives, takes an address in any case, refuses a log
  search wider than its limit, and counts every request. Its balances come from
  the description, not from the code tested.
- `summ-pages.js`: writes pages of Summ's results in the form Summ's
  connector returns them, for the Summ sweep to read.
- `summ-sweep-case.js`: the made-up wallet history the Summ sweep's tests
  sweep: its stand-in chain, LP Ranger's records of its withdrawals,
  Summ's rows of it, the time given as reached by Summ's sync, the header
  of Summ's csv template, and the temp folders the tests make and remove.
- `summ-gaps.js`: builds the legs, transactions and Summ rows the tests
  of the gap rules book, and runs `rowsForGaps` on them.

`npm run test:coverage` fails below 80% of lines covered. Code written to
check something goes into the tests, so it is kept and run again rather
than written again.

### How the Sheets Script Is Tested

`for-google-apps/check-token-balance/` holds a Sheets script,
`fetch-amount-of-token-transferred.gs`, and `wrapper.gs`, which a sheet
uses to call it. A Sheets script runs on Google's servers, which no test
can reach. Two separate sets of tests check it.

**The Node tests** run the real `.gs` file, unchanged, against the stand-in
chain, in two ways:

- `fetch-amount-of-token-transferred-gs.test.js` runs it in the test's own
  thread (`test/helpers/sheets-script.js`). Its `UrlFetchApp.fetch` answers
  at once from the stand-in chain, so nothing waits.
- `fetch-amount-of-token-transferred-node-version.test.js` runs it through
  its Node version, in crypto-price-fetchers' runner, which runs an Apps
  Script file under Node. In Apps Script,
  `UrlFetchApp.fetch` holds the script until the response arrives, while
  Node's `fetch` returns a promise. So the runner runs the script in a
  worker thread, a second thread of JavaScript that Node runs beside the
  main one, which waits on each request while the main thread does it
  ([why](https://github.com/nottoseethesun/crypto-price-fetchers/blob/main/docs/engineering.md#the-node-tests)).

`transfer-cases.js` holds the cases that both the ethers tool and the
Sheets script are tested on, so the two give the same answers.

**The Apps Script tests** are functions the owner runs by hand, from the
Apps Script editor, against the real rpc endpoint: `testGetTokenTransferred`
in the script, and `testGetTokenTransferred` and
`testGetTokenTransferredNoCache` in `wrapper.gs`. The wrapper's tests call
the deployed library, its caching function included. That function is not
in the repo, so no Node test runs it; a Node test runs the wrapper itself
against a stand-in library, and checks that it lets the library's error
through.

---

## Security Audits

Four audits look for security problems: in the packages the repo and its
tools install, through npm audit, npm's check of installed packages against
known vulnerabilities; in the release of actionlint the lint runs; in the
code, through ESLint with security rules; and in the text of every file,
through secretlint, which looks for keys and credentials.

| Command | What it runs | What it catches |
| ------- | ------------ | --------------- |
| `npm run audit:deps` | `npm audit --audit-level=high --omit=dev`, for the repo, the ratio chart and the balance checker, then `npm run audit:actionlint` | Known vulnerabilities, of high severity or worse, in the packages that ship; then what the next row says. |
| `npm run audit:actionlint` | `run-actionlint --check`: downloads every archive of the actionlint release crypto-price-fetchers pins | An archive that cannot be downloaded, or whose SHA-256 differs from the one pinned. npm audit does not cover actionlint, which is no npm package; the lint makes the same check on the one archive it runs. |
| `npm run audit:security` | ESLint with `eslint-security.config.js` | Code open to attack (eslint-plugin-security), strings that look like keys (eslint-plugin-no-secrets), and printing a name that may hold a secret (`no-secret-logging`, from crypto-price-fetchers). |
| `npm run audit:secrets` | secretlint, with `.secretlintrc.json` and `.secretlintignore` | Keys and credentials in any file. |

The security lint follows LP Ranger's: no warning allowed, with
`detect-non-literal-fs-filename` and `detect-object-injection` off.

---

## Dead Code Detection

A file nothing in the repo uses is dead code. knip finds such a file: it
follows the imports from each entry point, a file that a program or a test
starts from, and reports any file it never reaches. `npm run knip:files`
fails on one, as in LP Ranger. The tools are started by their paths rather
than imported, so `knip.json` names them as entry points, with the
security config and the tests. Unused exports are not gated.

---

## CI and Branch Protection

CI runs the gate again on GitHub, so a change reaches `main` only after it
passes there too. Two workflows run on every push to `main`, every pull
request to `main`, and by hand:

| Workflow | Job | Runs |
| -------- | --- | ---- |
| `ci.yml` | check-latest-nodejs-lts (Node 26), check-oldest-nodejs-supported (Node 24) | `npm run check`, after installing the repo's packages and the two tools'. |
| `security-audit.yml` | Dependency Audit, Security Lint, Secret Scan | Each audit as a job of its own; Dependency Audit runs `npm run audit:deps`, so the check of actionlint's archives with it. |

The two checks of `ci.yml` are named for their roles, not their Node
versions, so moving to newer versions renames no check.

`main` is protected: a change reaches it only by a pull request whose five
checks, those five jobs, have passed. Force pushes and deletion are
refused. Merges are merge commits, never squashed, and no branch is
deleted. The steps from a branch to `main` are LP Ranger's eight, in its
`docs/claude/CLAUDE-CI.md`.

---

## Known Bugs

None is known. A bug found gets a test in `test/known-bugs.test.js`,
declared with `knownBug` (`test/helpers/known-bug.js`), so the test passes
while the bug is present. The bug's fix makes its test fail; the same change
declares the test with `it`, among the tests of the code it is about.
