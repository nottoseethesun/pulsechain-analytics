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

## Tests

The tests are in `test/`, on Node's own test runner. They ask no outside
service.

```bash
npm ci
npm test
```

They cover `fetch-amount-of-token-transferred.js` and its Sheets twin, which
runs unchanged under Node. `test/helpers/` holds the stand-ins:

- `stand-in-chain.js` is a PulseChain rpc endpoint held in memory, with
  options for the cases that go wrong: a failed read, or another transfer in
  the same block.
- `ethers-stand-in.js` routes ethers' http requests to a stand-in chain.
- `sheets-script.js` runs a Sheets script with its `UrlFetchApp` answering
  from a stand-in chain.
- `known-bug.js` declares a known-bug test, described below.

`check-token-balance/` and `chart-price-ratio/` have no tests yet.

## Known bugs

`test/known-bugs.test.js` holds one test per known bug, declared with
`knownBug`, so it passes while the bug is present. A bug's fix makes its test
fail; declare that test with `it` instead, in the same change.

| Item | Bug |
| --- | --- |
| 9 | `getTokenTransferred`, in both copies, works out the amount from the wallet's balance around the block, so a failed read gives a wrong amount or 0, and another transfer in the same block is counted in |
