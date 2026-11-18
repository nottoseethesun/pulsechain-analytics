# pulsechain-analytics — Engineering Reference

The files the programs read and write, the gates every change passes, the
tests, and CI. For how the tools work, see
[`docs/architecture.md`](architecture.md); for every npm command, see
[`docs/npm-project-commands.md`](npm-project-commands.md).

The repo follows LP Ranger's coding standards: its `CLAUDE.md` and
`docs/claude/`, in
[nottoseethesun/lp-ranger](https://github.com/nottoseethesun/lp-ranger).

---

## Table of Contents

- [Quick Start](#quick-start)
- [Files on Disk](#files-on-disk)
- [The Gate: `npm run check`](#the-gate-npm-run-check)
- [Lint](#lint)
- [Tests](#tests)
- [Security Audits](#security-audits)
- [Dead Code Detection](#dead-code-detection)
- [CI and Branch Protection](#ci-and-branch-protection)
- [Known Bugs](#known-bugs)

---

## Quick Start

Node 22 or later. From the repo's top folder:

```bash
npm ci
npm ci --prefix chart-price-ratio
npm ci --prefix check-token-balance
npm run api-keys     # save the DexTools key, once, for the ratio chart
npm run check        # the gate
```

`npm ci` installs crypto-price-fetchers too, from GitHub, at the commit
`package.json` pins: no other step installs it.

---

## Files on Disk

| File | In git | What it holds |
| ---- | ------ | ------------- |
| `config.json` | yes | The services whose keys the programs send, under `apiKeys`. No key. |
| `api-keys.json` | no | The keys, each encrypted with the owner's password. `api-keys.json.tmp` is the file it is written through. `API_KEYS_FILE_PATH` names another, as the tests do. |
| `chart-price-ratio/config.json` | yes | The ratio chart's settings: network, DexTools' plan, the interval, the CSV's name. No key. |
| `check-token-balance/config.json` | yes | The balance checker's rpc endpoint. |
| `for-google-apps/check-token-balance/config.json` | no | The Node version's rpc endpoint; `config-example.json` beside it shows the shape. |
| `coverage/` | no | A test run's coverage report. |

---

## The Gate: `npm run check`

`npm run check` runs every gate, in order, and stops at the first that
fails: the lint, the tests with coverage, then the three security audits.
It must pass before every commit and push, and CI runs it on Node 22 and
Node 24.

---

## Lint

`npm run lint` runs:

| Tool | Configured in | What it holds the repo to |
| ---- | ------------- | ------------------------- |
| ESLint | `eslint.config.js` | LP Ranger's rules, with no warning allowed: cyclomatic complexity ≤ 17, ≤ 500 lines of code a file (blank lines and comments not counted), lines ≤ 80 characters but strings, urls and comments, `===`, no unused name, no `var`, `const` where nothing is reassigned, no `Math.random`, no comment that tells Prettier to skip code, and every import resolved. The Sheets scripts are linted as the plain scripts Apps Script loads, with its services as globals; `wrapper.gs` declares the library it calls in a `/* global */` comment. |
| markdownlint | `.markdownlint-cli2.jsonc` | LP Ranger's settings, over every Markdown file. |
| Prettier | `.prettierrc`, `.prettierignore` | Its formatting, in check mode, over every JavaScript, Sheets script, JSON and YAML file. |
| actionlint | — | The GitHub workflows. |
| knip | `knip.json` | No file nothing reaches. See [Dead Code Detection](#dead-code-detection). |

The lint covers the tools in `chart-price-ratio/` and `check-token-balance/`,
whose imports resolve once their own packages are installed. The husky
pre-commit hook (`.husky/pre-commit`) runs `npm run lint`, which `prepare`
installs; `npm run format` or `npm run lint:fix` fixes formatting. No rule
is ever switched off in a file, no file is left out of the lint, and a file
over 500 lines is split, not excused.

---

## Tests

The tests are in `test/`, on Node's test runner. They ask nothing outside
the computer, and never read the owner's key file or password.

| Test | What it covers |
| ---- | -------------- |
| `fetch-amount-of-token-transferred.test.js` | The ethers tool, against a stand-in chain. |
| `fetch-amount-of-token-transferred-gs.test.js` | The Sheets script, run unchanged under Node. |
| `fetch-amount-of-token-transferred-node-version.test.js` | The Sheets script's Node version, its command line included. |
| `format-balance.test.js` | How the balance checker writes a balance. |
| `pulse-token-ratio.test.js` | The ratio chart, run as its owner runs it, against a stand-in GeckoTerminal and DexTools, with the DexTools key from a key file of the test's own: its prices, its fallback, its command line, its exit codes, and the fewest points it charts. |
| `api-keys.test.js` | The keys `config.json` lists, the key manager, the copy of `unlock-api-keys.sh`, and the ratio chart's pin of crypto-price-fetchers. |

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
  preload, and builds GeckoTerminal's and DexTools' answers.
- `known-bug.js`: declares a known-bug test.

`npm run test:coverage` fails below 80% of lines covered. Code written to
check something goes into the tests, so it is kept and run again rather
than written again.

---

## Security Audits

| Command | What it runs | What it catches |
| ------- | ------------ | --------------- |
| `npm run audit:deps` | `npm audit --audit-level=high --omit=dev`, for the repo, the ratio chart and the balance checker | Known vulnerabilities, of high severity or worse, in the packages that ship. |
| `npm run audit:security` | ESLint with `eslint-security.config.js` | Code open to attack (eslint-plugin-security), strings that look like keys (eslint-plugin-no-secrets), and printing a name that may hold a secret (`no-secret-logging`, from crypto-price-fetchers). |
| `npm run audit:secrets` | secretlint, with `.secretlintrc.json` and `.secretlintignore` | Keys and credentials in any file. |

The security lint follows LP Ranger's: no warning allowed, with
`detect-non-literal-fs-filename` and `detect-object-injection` off.

---

## Dead Code Detection

`npm run knip:files` fails on any file nothing reaches, as in LP Ranger.
`knip.json` names the entry points knip cannot find for itself: the tools
run by their paths, the security config and the tests. Unused exports are
not gated.

---

## CI and Branch Protection

Two workflows run on every push to `main`, every pull request to `main`, and
by hand:

| Workflow | Job | Runs |
| -------- | --- | ---- |
| `ci.yml` | Check (Node 22), Check (Node 24) | `npm run check`, after installing the repo's packages and the two tools'. |
| `security-audit.yml` | Dependency Audit, Security Lint, Secret Scan | Each audit as a job of its own. |

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
