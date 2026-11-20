# pulsechain-analytics — `npm` Project Commands

Every npm command of pulsechain-analytics, the owner's tools for
questions about PulseChain: those its top `package.json` defines, which
run from the repo's top folder, and those of the packages of
`chart-price-ratio/` and `check-token-balance/`, with what each does and
what to type. Two of the top folder's commands run tools of
crypto-price-fetchers, the owner's repo of code his projects share, which
this repo installs from GitHub: `api-keys` and `github-project-deps`.

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
- [See Also](#see-also)

---

## Passing Flags

Run with `npm run <name>`; `test` also works without `run`. Flags go after
a `--` separator, which tells npm the rest belongs to the script, as in
these two commands: the first replaces the saved DexTools key
([Api Keys](#api-keys)), and the second runs the ratio chart's tests
alone ([Test](#test)):

```sh
npm run api-keys -- set dextools
npm test -- --test-name-pattern="pulse-token-ratio"
```

---

## Api Keys

The api keys the programs send, DexTools' for the ratio chart, are kept
encrypted in `api-keys.json` by crypto-price-fetchers' key store. One
command runs the store's key manager.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `api-keys` | `set <service>`, `check-password`, `--help` | The key manager, crypto-price-fetchers'. Lists each key the top `config.json` names, saved or not, never showing a key's characters, and asks for each one not saved: the key, then the password. Each key is saved, encrypted, once its service takes it. `set <service>` replaces one key. `check-password` says, by its exit code, whether the password in `API_KEYS_PASSWORD` opens every key saved; `unlock-api-keys.sh` runs it. | `npm run api-keys` · `npm run api-keys -- set dextools` |

`source ./unlock-api-keys.sh`, which is no npm command, keeps the password
for a terminal: see [the README](../README.md#api-keys).

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

crypto-price-fetchers is installed from GitHub, at the top and in
`chart-price-ratio/`, at the commit each `package-lock.json` keeps. One
command, entirely optional, moves both.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `github-project-deps` | `main` or `release`; `--help` | crypto-price-fetchers' versions tool. Sets every dependency installed from GitHub, in each `package.json` git keeps, to its project's main branch (`#main`) or latest release (`#semver:*`), then makes each of those folders' `package-lock.json` again from a fresh `node_modules`, so the newest commit of main, or the newest release, is installed. When an install fails, it puts every `package.json` and `package-lock.json` back and installs `node_modules` again from them. | `npm run github-project-deps -- main` |

---

## Developer Tools

These commands check or fix the form of the code: `lint` runs the checks,
and `format` and `lint:fix` make the fixes the tools can make.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `format` | — | Prettier's write pass over every JavaScript, Sheets script, JSON and YAML file. | `npm run format` |
| `knip:files` | — | The dead-code check: fails on any file nothing reaches. `lint` runs it. | `npm run knip:files` |
| `lint` | — | The linters: ESLint, markdownlint, Prettier in check mode, actionlint, and knip's unused files. husky, the package that runs scripts at git's hooks, runs it before each commit. | `npm run lint` |
| `lint:fix` | — | ESLint and markdownlint with their fixes, then `format`. | `npm run lint:fix` |

---

## Test

These commands run the gates: the tests and the audits. `check` runs all of
them, after the lint, and must pass before a commit and a push.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `audit:deps` | — | `npm audit` at the `high` threshold over the packages that ship (`--omit=dev`): the repo's, the ratio chart's and the balance checker's. | `npm run audit:deps` |
| `audit:secrets` | — | secretlint across the repo. | `npm run audit:secrets` |
| `audit:security` | — | The security lint, `eslint-security.config.js`: eslint-plugin-security, eslint-plugin-no-secrets and `no-secret-logging`. | `npm run audit:security` |
| `check` | — | The full gate: `lint`, `test:coverage` and the three audits, in that order, stopping at the first that fails. | `npm run check` |
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
| `chart-price-ratio/` | `start`, `ratio` | Run the ratio chart. `npm start -- --help` lists its options, each with its default from `config.json`, and its exit codes. | `npm start -- <tokenA> <tokenB> daily` |

The balance checker has no npm command: `node index.js --help`, in its
folder, lists its options.

---

## See Also

- [`docs/engineering.md`](engineering.md) — the gates, the tests and CI.
- [`docs/architecture.md`](architecture.md) — how the tools work.
- [LP Ranger's `docs/claude/CLAUDE-CI.md`](https://github.com/nottoseethesun/lp-ranger/blob/main/docs/claude/CLAUDE-CI.md)
  — the merge protocol these gates feed.
