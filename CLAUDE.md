# pulsechain-analytics — notes for Claude

## Conventions

Follow LP Ranger's coding standards: its `CLAUDE.md` and everything under
`docs/claude/`, in [nottoseethesun/lp-ranger](https://github.com/nottoseethesun/lp-ranger)
or the local clone at `~/code/lp-ranger/github-repo/lp-ranger/`. Read them, and
never change anything in LP Ranger.

Work in this repo, never in a copy of it. Code written to check something goes
into the tests, so that later sessions reuse it instead of writing it again.

**Never show any character of an api key once it is entered**: not in a
reply, a log line, an error message, a test's output, or a listing.

The Sheets scripts in `for-google-apps/` change only here. The owner pastes
them into Apps Script and deploys them as a library. The deployed library has
a function this repo's copy lacks, `getTokenTransferredUseCache`, which
`wrapper.gs` calls.

## Node versions of the Sheets scripts

`for-google-apps/check-token-balance/fetch-amount-of-token-transferred.js` is
the Node version of the `.gs` beside it. It runs the `.gs` unchanged, through
the runner crypto-price-fetchers provides
(`crypto-price-fetchers/apps-script-runner`), and never copies the script's
logic, since LP Ranger's rules forbid a second copy. A fix belongs in the
`.gs`, where it fixes both. `wrapper.gs` gets no Node version: it exists only
because a sheet reaches a library's functions through a wrapper.

`package.json` installs crypto-price-fetchers from GitHub, pinned to a
commit; a change to the runner reaches this repo when the pin moves. The
Node version reads its rpc endpoint from `config.json` beside it, which git
ignores; `config-example.json` shows the shape.

The script of the same name at the repo's top folder,
`fetch-amount-of-token-transferred.js`, is a separate tool, on ethers, with
code of its own.

## Keys

No api key is committed. The keys the programs send (DexTools', for the
ratio chart's fallback, as the top `config.json` lists them under
`apiKeys`) are kept in `api-keys.json` at the repo's top, which git
ignores, encrypted with one password the owner types, by
crypto-price-fetchers' key store (`crypto-price-fetchers/api-key-store`).
`npm run api-keys` runs its manager (`manage-api-keys.js`), and
`source ./unlock-api-keys.sh` keeps the password for a terminal in
`API_KEYS_PASSWORD`. `unlock-api-keys.sh` is a copy of
crypto-price-fetchers', which a test holds it to; a change to it is made
there. The ratio chart opens the DexTools key the first time it asks
DexTools (`chart-price-ratio/dextools.js`). A key is never a setting in a
file git keeps, nor a command-line argument. A test names a key file of its
own, never the owner's, and passes no `API_KEYS_PASSWORD` it did not set.

`chart-price-ratio/package.json` pins crypto-price-fetchers at the same
commit as the top `package.json`, which a test holds; move both together.

## Docs

`docs/architecture.md` says how the tools work, `docs/engineering.md`
covers the files, the gates, the tests and CI, and
`docs/npm-project-commands.md` lists every npm command, as LP Ranger's
`docs/` does. A change keeps them true.

Every doc passes the owner's documentation audit: it tells no story of an
old bug, leads every topic and sub-topic with the context it needs,
explains with facts rather than adjectives, and leaves out no step in the
logic of an explanation.

## Gates and CI

`npm run check` is the one gate, LP Ranger's: the lint (ESLint with LP
Ranger's rules, markdownlint, Prettier, actionlint, knip's unused files),
the tests with at least 80% of lines covered, and the security audits (npm
audit for the three packages, the security lint in
`eslint-security.config.js` with crypto-price-fetchers' `no-secret-logging`,
secretlint). It must pass before a commit and a push; the husky pre-commit
hook runs `npm run lint`. CI runs `npm run check` on Node 22 and 24
(`ci.yml`) and each audit as a job of its own (`security-audit.yml`), after
installing the three packages. `main` is protected: those five checks must
pass on a pull request, never squashed, and no branch is deleted. LP
Ranger's eight steps in `docs/claude/CLAUDE-CI.md` take a change to `main`.

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
runs unchanged under Node, the twin's Node version, how the balance checker
writes a balance, the ratio chart, its command line (commander, in
`chart-price-ratio/ratio-command.js`) included, and the api keys. The
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

## Known bugs

None is known. When one is found, it gets a test in
`test/known-bugs.test.js`, declared with `knownBug`, so the test passes while
the bug is present. The bug's fix makes its test fail; declare that test with
`it` instead, in the same change, among the tests of the code it is about.
