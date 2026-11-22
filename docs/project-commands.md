# pulsechain-analytics — Project Commands

Every command of pulsechain-analytics, the owner's tools for questions about
PulseChain, with what each does and what to type. Most run through npm, the
package manager of Node, the program that runs JavaScript outside a
browser, from a `package.json`: those its top `package.json` defines, which
run from the repo's top folder, and the ratio chart's, in
`chart-price-ratio/`. The rest run with `node`, or `source`, at a terminal
([Commands Run Without npm](#commands-run-without-npm)). Two of the top folder's commands run tools of
crypto-price-fetchers, the owner's repo of code his projects share, which
this repo installs from GitHub, the website that hosts his code: `api-keys`,
its key manager, which saves and lists the api keys, and
`github-project-deps`, its versions tool, which moves crypto-price-fetchers
to its newest main or its latest release.

Each command runs on both major versions of Node the repo supports: the
newest LTS (long-term support) version, today 26, and the version two
majors before it, today 24.

Companion to [`docs/engineering.md`](engineering.md), which covers how the
gates work. This file covers how to drive them.

---

## Table of Contents

- [Passing Flags](#passing-flags)
- [Api Keys](#api-keys)
- [Bookkeeping](#bookkeeping)
- [Dependency Versions](#dependency-versions)
- [Developer Tools](#developer-tools)
- [Test](#test)
- [Commands That Are Usually Not Run Alone](#commands-that-are-usually-not-run-alone)
- [The Tools' Own Packages](#the-tools-own-packages)
- [Commands Run Without npm](#commands-run-without-npm)
- [See Also](#see-also)

---

## Passing Flags

Run with `npm run <name>`; `test` also works without `run`. Flags go after
a `--` separator, which tells npm the rest belongs to the script, as in
these two commands: the first replaces the saved key of DexTools, a
service that prices tokens from the pools of decentralized exchanges,
([Api Keys](#api-keys)), and the second runs the ratio chart's tests
alone ([Test](#test)):

```sh
npm run api-keys -- set dextools
npm test -- --test-name-pattern="pulse-token-ratio"
```

A command that runs one of the repo's command lines passes `--help` on to
it, which then lists its options, examples of its common uses and its exit
codes: `npm run summ-sweep -- --help`.

---

## Api Keys

The api keys the programs send, the ratio chart's, are kept encrypted in
`api-keys.json` by crypto-price-fetchers' key store: DexTools', for the
chart's fallback to current prices, and Moralis's, for its candles, from
Moralis, a service that prices tokens from the pools of decentralized
exchanges. One command runs the store's key manager.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `api-keys` | `set <service>`, `check-password`, `--help` | The key manager, crypto-price-fetchers'. Lists each key the top `config.json` names, saved or not, never showing a key's characters, and asks for each one not saved: the key, then the password. Each key is saved, encrypted, once its service takes it. `set <service>` replaces one key. `check-password` says, by its exit code, whether the password in `API_KEYS_PASSWORD` opens every key saved; `unlock-api-keys.sh`, the script that keeps the password for a terminal, runs it. | `npm run api-keys` · `npm run api-keys -- set moralis` |

`source ./unlock-api-keys.sh`, a script in the repo's top folder, keeps the
password for a terminal ([Commands Run Without npm](#commands-run-without-npm)).

---

## Bookkeeping

The owner keeps his crypto taxes in Summ. One command compares a wallet's
history on PulseChain with Summ's rows of it; `docs/architecture.md`
says [how](architecture.md#the-summ-sweep).

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `summ-sweep` | `--wallet <address>`, `--start-date <day>`, `--end-date <day>`, `--summ-synced-to <time>`, `--summ-results <files...>`, `--out <file>`, `--report <file>`, all required; `--replace`; `--help` | Sweeps the wallet's history from the first day to the last, each `YYYY-MM-DD` in UTC, against the pages of Summ's results saved to the files named. `--summ-synced-to` is the time, as `"YYYY-MM-DD HH:MM:SS"` in UTC, up to which Summ's sync has read the wallet's transactions: a transaction after it gets no gas, for that sync to bring. Each option is checked as it is parsed, and a mistake stops the run before it reads anything. Writes the csv through crypto-price-fetchers' Summ csv utility: the income rows of the withdrawals to fix in Summ, and the rows for what Summ lacks. Writes a report, as json, of the withdrawals to fix, the legs Summ lacks, the questions about the legs no rule books, Summ's legs no chain leg matched, and the problems found. Checks both paths and the rows before writing either file, and writes over neither without `--replace`. Reads the chain's facts from the top `config.json` and the owner's settings from `summ-sweep/config.json`. Exits with 0 when the report was written, and the csv with it when there were rows; 1 when they were not. | `npm run summ-sweep -- --wallet 0x… --start-date 2026-01-01 --end-date 2026-11-20 --summ-synced-to "2026-11-20 06:00:00" --summ-results page-1.txt page-2.txt --out rows.csv --report report.json` |

---

## Dependency Versions

crypto-price-fetchers is installed from GitHub, at the top, in
`chart-price-ratio/` and in `check-token-balance/`, at the commit each
`package-lock.json` keeps. One command, entirely optional, moves all
three.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `github-project-deps` | `main` or `release`; `--help` | crypto-price-fetchers' versions tool. Sets every dependency installed from GitHub, in each `package.json` git, the version-control program, keeps, to its project's main branch (`#main`) or latest release (`#semver:*`), then makes each of those folders' `package-lock.json` again from a fresh `node_modules`, so the newest commit of main, or the newest release, is installed. When an install fails, it puts every `package.json` and `package-lock.json` back and installs `node_modules` again from them. | `npm run github-project-deps -- main` |

---

## Developer Tools

These commands check or fix the form of the code: `lint` runs the checks,
and `format` and `lint:fix` make the fixes the tools can make.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `format` | — | The write pass of Prettier, the package that formats code, over every JavaScript, Sheets script, JSON and YAML file. | `npm run format` |
| `knip:files` | — | The dead-code check: fails on any file nothing reaches. `lint` runs it. | `npm run knip:files` |
| `lint` | — | The linters: ESLint, which checks JavaScript against rules; markdownlint, which checks the form of Markdown files; Prettier in check mode; actionlint, which checks the GitHub Actions workflow files, run from its official release by crypto-price-fetchers' bin `run-actionlint`, which checks the release's SHA-256; and knip's check for files nothing uses. husky, the package that runs scripts at the hooks of git, the version-control program, runs it before each commit. | `npm run lint` |
| `lint:fix` | — | ESLint and markdownlint with their fixes, then `format`. | `npm run lint:fix` |

---

## Test

These commands run the gates: the tests and the audits. `check` runs all of
them, after the lint, and must pass before a commit and a push.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `audit:actionlint` | `--help` | Runs `run-actionlint --check`, a bin of crypto-price-fetchers: downloads every archive of the release of actionlint, the checker of GitHub Actions workflow files, that `lint` runs, and fails when one cannot be downloaded or its SHA-256 differs from the one crypto-price-fetchers pins; npm audit does not cover actionlint, which is no npm package. `audit:deps` runs it. | `npm run audit:actionlint` |
| `audit:deps` | — | `npm audit`, npm's check of the installed packages against known vulnerabilities, at the `high` threshold over the packages that ship (`--omit=dev`): the repo's, the ratio chart's and the balance checker's; then `audit:actionlint`. | `npm run audit:deps` |
| `audit:secrets` | — | secretlint, which looks for keys and credentials in files, across the repo. | `npm run audit:secrets` |
| `audit:security` | — | The security lint, `eslint-security.config.js`: the rules of eslint-plugin-security, against code open to attack, of eslint-plugin-no-secrets, against strings that look like keys, and crypto-price-fetchers' `no-secret-logging`, against printing a name that may hold a secret. | `npm run audit:security` |
| `check` | — | The full gate: `lint`, `test:coverage`, `audit:deps` (with `audit:actionlint`), `audit:security` and `audit:secrets`, in that order, stopping at the first that fails. | `npm run check` |
| `format:check` | — | Prettier in check mode; fails rather than rewriting. | `npm run format:check` |
| `test` | any `node --test` flag | The tests, on Node's test runner. | `npm test -- --test-name-pattern="api keys"` |
| `test:coverage` | — | The same tests with coverage, failing below 80% of lines covered. | `npm run test:coverage` |

---

## Commands That Are Usually Not Run Alone

npm runs this command itself, after another one.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `prepare` | — | Runs after `npm install`; installs the husky hooks. | automatic |

---

## The Tools' Own Packages

`chart-price-ratio/` and `check-token-balance/` each have a package of
their own: run `npm install` in the folder before using the tool there.

| Folder | Command | Description | Example |
| ------ | ------- | ----------- | ------- |
| `chart-price-ratio/` | `start`, `ratio` | Run the ratio chart. With a Moralis key saved, a run asks which source to read, Moralis or GeckoTerminal, unless `--source` names one. `npm start -- --help` lists its options, each with its default from `config.json`, examples of its common uses, and its exit codes. | `npm start -- <tokenA> <tokenB> daily` · `npm start -- <tokenA> <tokenB> --source moralis` |

The balance checker has no npm command: it runs with `node`
([Commands Run Without npm](#commands-run-without-npm)).

---

## Commands Run Without npm

These command lines run with `node`, or, for the password script,
`source`, at a terminal. Each Node command line answers `--help` with its
options, examples of its common uses and its exit codes;
[the README's Usage](../README.md#usage) shows each at work.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `node fetch-amount-of-token-transferred.js` | `<transaction> <token> <wallet>`, `--config <file>`, `--verbose`, `--help` | The Node version of the Sheets script, in `for-google-apps/check-token-balance/`: how much of a token one PulseChain transaction sent a wallet, read from the rpc endpoint its `config.json` names. From another folder, give the file's path. | `node for-google-apps/check-token-balance/fetch-amount-of-token-transferred.js <transaction-hash> 0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39 <wallet>` |
| `node index.js` | `--address <address>`, `--block <block>` or `--date <date>`, `--tokens <tokens>`, `--rpc <url>`, `--help` | The balance checker, in `check-token-balance/`: a wallet's balance of each token named, PLS as `Pulse_Native_Gas_Token`, at a block or at the start of a day in UTC. | `node index.js --address <wallet> --date 2026-11-01 --tokens Pulse_Native_Gas_Token` |
| `node pulse-token-ratio.js` | `<tokenA> <tokenB> [interval]` and the options of `start` above | The ratio chart, in `chart-price-ratio/`, as `npm start` runs it. | `node pulse-token-ratio.js <tokenA> <tokenB> --source geckoterminal` |
| `source ./unlock-api-keys.sh` | — | Asks for the key store's password, showing nothing typed, checks that it opens every key saved, and keeps it in `API_KEYS_PASSWORD` for the terminal, so the programs open their keys without asking. Runs in bash or zsh. | `source ./unlock-api-keys.sh` |

---

## See Also

- [`docs/engineering.md`](engineering.md) — the gates, the tests and CI,
  the checks GitHub Actions runs at each push.
- [`docs/architecture.md`](architecture.md) — how the tools work.
- [LP Ranger's `docs/claude/CLAUDE-CI.md`](https://github.com/nottoseethesun/lp-ranger/blob/main/docs/claude/CLAUDE-CI.md)
  — the merge protocol of LP Ranger, the owner's bot that manages his 9mm V3
  liquidity positions, which these gates feed.
