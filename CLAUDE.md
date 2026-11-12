# pulsechain-analytics — notes for Claude

## Conventions

Follow LP Ranger's coding standards: its `CLAUDE.md` and everything under
`docs/claude/`, in [nottoseethesun/lp-ranger](https://github.com/nottoseethesun/lp-ranger)
or the local clone at `~/code/lp-ranger/github-repo/lp-ranger/`. Read them, and
never change anything in LP Ranger.

Work in this repo, never in a copy of it. Code written to check something goes
into the tests, so that later sessions reuse it instead of writing it again.

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

## Tests

The tests are in `test/`, on Node's own test runner. They ask no outside
service.

```bash
npm ci
npm test
```

They cover `fetch-amount-of-token-transferred.js`, its Sheets twin, which
runs unchanged under Node, and the twin's Node version. `test/helpers/`
holds the stand-ins:

- `stand-in-chain.js` is a PulseChain rpc endpoint held in memory, with
  options for the cases that go wrong: a failed read, or another transfer in
  the same block. `standInChainFetch` hands it the requests of the Node
  version.
- `ethers-stand-in.js` routes ethers' http requests to a stand-in chain.
- `sheets-script.js` runs a Sheets script in the test's thread with the
  runner's services, its `UrlFetchApp` answering from a stand-in chain.
- `known-bug.js` declares a known-bug test, described below.

`check-token-balance/` and `chart-price-ratio/` have no tests yet.

## Known bugs

`test/known-bugs.test.js` holds one test per known bug, declared with
`knownBug`, so it passes while the bug is present. A bug's fix makes its test
fail; declare that test with `it` instead, in the same change.

| Item | Bug |
| --- | --- |
| 9 | `getTokenTransferred`, in both copies, works out the amount from the wallet's balance around the block, so a failed read gives a wrong amount or 0, and another transfer in the same block is counted in. The Node version of the Sheets script runs the script, so it has the bug too |
