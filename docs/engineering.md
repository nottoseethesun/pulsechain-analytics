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
[`docs/architecture.md`](architecture.md); for every command the repo's
`package.json` gives npm, the package manager of Node, the program that runs
JavaScript outside a browser, to run, see
[`docs/npm-project-commands.md`](npm-project-commands.md).

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

A working copy needs Node 24 or later, the packages of the repo and of its
two tools that have packages of their own, and the key of DexTools, a
service that prices tokens from the pools of decentralized exchanges,
which the ratio chart sends. The key is kept by the key store of
crypto-price-fetchers, the owner's repo of code his projects share, which
`npm ci` installs from GitHub, at the commit `package-lock.json` keeps: no
other step installs it. This repo's `npm run api-keys` runs the key
store's manager, and `npm run check` runs the gate below. From the repo's
top folder:

```bash
npm ci
npm ci --prefix chart-price-ratio
npm ci --prefix check-token-balance
npm run api-keys     # save the DexTools key, once, for the ratio chart
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
| `chart-price-ratio/config.json` | yes | The ratio chart's settings: network, DexTools' plan, the interval, the CSV's name. No key. |
| `check-token-balance/config.json` | yes | The balance checker's rpc endpoint, the json-rpc api of a PulseChain node it reads balances from. |
| `for-google-apps/check-token-balance/config.json` | no | The Node version's rpc endpoint; `config-example.json` beside it shows the shape. |
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
`npm run lint` runs five tools, each an npm package:

| Tool | Configured in | What it does, and what it holds the repo to |
| ---- | ------------- | ------------------------------------------- |
| ESLint | `eslint.config.js` | Checks JavaScript against rules: LP Ranger's, with no warning allowed: cyclomatic complexity ≤ 17, ≤ 500 lines of code a file (blank lines and comments not counted), lines ≤ 80 characters but strings, urls and comments, `===`, no unused name, no `var`, `const` where nothing is reassigned, no `Math.random`, no comment that tells Prettier, the formatter in the row below, to skip code, and every import resolved. It reads the Sheets scripts too, as the paragraph below the table says. |
| markdownlint | `.markdownlint-cli2.jsonc` | Checks the form of Markdown files, with LP Ranger's settings, over every Markdown file. |
| Prettier | `.prettierrc`, `.prettierignore` | Formats code; in check mode, it fails when its formatting would change any JavaScript, Sheets script, JSON or YAML file. |
| actionlint | — | Checks the GitHub Actions workflow files, in `.github/workflows/`, for mistakes in their syntax and expressions. |
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
decentralized exchanges with their prices and candles; DexTools; and LP
Ranger's bookkeeping tool, which prints what one transaction moved for a
wallet; so they ask nothing outside the computer. They never read the
owner's key file or password.

| Test | What it covers |
| ---- | -------------- |
| `fetch-amount-of-token-transferred.test.js` | The module on ethers, a library for talking to Ethereum-style chains, against a stand-in chain. |
| `fetch-amount-of-token-transferred-gs.test.js` | The Sheets script, run unchanged under Node. |
| `fetch-amount-of-token-transferred-node-version.test.js` | The Sheets script's Node version, its command line included. |
| `format-balance.test.js` | How the balance checker writes a balance. |
| `pulse-token-ratio.test.js` | The ratio chart, run as its owner runs it, against a stand-in GeckoTerminal and DexTools, with the DexTools key from a key file of the test's own: its prices, a token's own prices when it is its pool's quote token, its fallback, its command line, its exit codes, and the fewest points it charts. |
| `command-line-help.test.js` | Every command line's help, `--help` and `-h`: the Summ sweep's, the ratio chart's, the balance checker's, the Sheets script's Node version's, the key manager's and crypto-price-fetchers' versions tool's, each with its options, examples and exit codes, by crypto-price-fetchers' checks (`crypto-price-fetchers/lib/command-line-help`); and that its list holds every command line the repo runs. |
| `api-keys.test.js` | The keys `config.json` lists, the key manager, which saves and lists the api keys, and the copy of `unlock-api-keys.sh`, the script that keeps the password for a terminal. |
| `dependencies.test.js` | crypto-price-fetchers installed from GitHub, following its main branch or its latest release, by the ratio chart too, and `npm run github-project-deps` running its versions tool. |
| `wallet-history.test.js` | The paced provider, the blocks of a range, the logs that name a wallet, the transactions it sent, their receipts and its tokens' facts, against a stand-in chain. |
| `wallet-history-coin.test.js` | The PLS a wallet moved: the calls of a trace that pay it, the flows of its own transactions, and the payments from elsewhere its balance reveals, against a stand-in chain whose balances are worked out apart from the code tested. |
| `summ-sweep.test.js` | The Summ sweep's reading of Summ's saved pages, its match of amounts in both forms Summ prints, the legs of a wallet's logs, and the match of the chain's legs with Summ's, a later match leaving out the Summ legs an earlier one used. |
| `summ-sweep-splits.test.js` | The split of withdrawals from positions into principal and fees, a pool's coins ordered by their addresses as numbers, the collects it refuses to split, LP Ranger's records of another shape refused, and LP Ranger's tool run through a stand-in and as a real program. |
| `summ-sweep-run.test.js` | The whole sweep, `sweepWallet`, against a stand-in chain: a split Summ holds whole and one it holds in parts, the gaps booked, a question's amount in whole tokens, no block read for its time that the search for the wallet's transactions already read, a withdrawal paid as PLS, and a change of balance no payment explains. |
| `summ-sweep-command.test.js` | The sweep's command line: the csv written through crypto-price-fetchers' Summ csv utility, with addresses in lower case, and the report in EIP-55's mixed case; neither file written when one path is taken; a mistake in an option refused as it is parsed, before anything is read; and its help, with its exit codes. |
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
  writes, and logs each request without any key.
- `ratio-chart.js`: runs the ratio chart in a child process with that
  preload, and builds GeckoTerminal's and DexTools' answers, among them a
  pool whose base token is not the chart's token (`quoteSideAnswers`).
- `known-bug.js`: declares a known-bug test.
- `stand-in-wallet-chain.js`: a PulseChain endpoint held in memory for
  `wallet-history/`, built from the blocks a test describes: their
  transactions, logs, payments inside them, withdrawals and fee
  recipient. It answers block, log, count, balance, receipt, trace and
  contract requests, takes an address in any case, refuses a log search
  wider than its limit, and counts every request. Its balances come from
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
in the repo, so no Node test runs it.

---

## Security Audits

Three audits look for security problems: in the packages the repo and its
tools install, through npm audit, npm's check of installed packages against
known vulnerabilities; in the code, through ESLint with security rules; and
in the text of every file, through secretlint, which looks for keys and
credentials.

| Command | What it runs | What it catches |
| ------- | ------------ | --------------- |
| `npm run audit:deps` | `npm audit --audit-level=high --omit=dev`, for the repo, the ratio chart and the balance checker | Known vulnerabilities, of high severity or worse, in the packages that ship. |
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
| `security-audit.yml` | Dependency Audit, Security Lint, Secret Scan | Each audit as a job of its own. |

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
