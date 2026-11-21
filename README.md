# PulseChain Analytics

![PulseChain Gandalf, in grey robes and a pointed hat, stands in the stone vaulted archives of Minas Tirith holding an unrolled parchment scroll covered in glowing ancient runes mixed with streams of digital 0s and 1s in blue, cyan, and magenta. Tall shelves of books and scrolls line the hall, lit by torches and cool moonlight from high windows.](./assets/images/pulsechain-gandalf-at-the-archives-of-minas-tirith_1280-640.jpeg "PulseChain Analytics")

[![Lint (JS+Apps Script+MD)](https://img.shields.io/github/actions/workflow/status/nottoseethesun/pulsechain-analytics/ci.yml?branch=main&label=lint)](https://github.com/nottoseethesun/pulsechain-analytics/actions/workflows/ci.yml)
[![Tests (Node 24/26)](https://img.shields.io/github/actions/workflow/status/nottoseethesun/pulsechain-analytics/ci.yml?branch=main&label=tests)](https://github.com/nottoseethesun/pulsechain-analytics/actions/workflows/ci.yml)
[![Security Audit](https://img.shields.io/github/actions/workflow/status/nottoseethesun/pulsechain-analytics/security-audit.yml?branch=main&label=security)](https://github.com/nottoseethesun/pulsechain-analytics/actions/workflows/security-audit.yml)

## Overview

USE AT YOUR OWN RISK: SEE LICENSE FILE, INCLUDED.

Tools that answer questions about PulseChain: how much of a token one
transaction sent a wallet, what a wallet held at a past block or date, how
two tokens' prices compare over time, what a wallet moved over a range of
blocks, read from the chain alone (`wallet-history/`), and what of those
moves the crypto tax calculator Summ lacks or holds wrongly
(`summ-sweep/`, run by `npm run summ-sweep`; npm, the package manager of
Node, the program that runs JavaScript outside a browser, runs the commands
a `package.json` names).

The first tool, the amount a transaction sent, also comes as a script for
Google Sheets, Google's spreadsheet app, written in Apps Script, Google's
platform for scripts that run inside its apps, so that a sheet's cell can
call it. Apps Script cannot import npm packages, such as ethers, a library
for talking to Ethereum-style chains such as PulseChain. So the Apps
Script version does by hand, with `UrlFetchApp`, Apps Script's service for
web requests, and json-rpc, the protocol a chain's rpc endpoint answers,
what the ethers version, a module for programs on Node, does with ethers;
its code is longer and looks different.

## Prerequisites

### Google Apps Script

Apps Script has no versions to choose from: every script runs on the
current one. When a script stops working, Google's release notes may say
what changed: <https://developers.google.com/apps-script/release-notes>

### Node

Node 24 or later.

## Installation

The tools run on two platforms, Google Apps Script and Node, and each
installs its own way.

### Google Apps Script

A Sheets script in `for-google-apps/` is added to a sheet as a library: the
sheet's project then runs the owner's deployed copy of the script. Adding
it takes the script's ID, the part of its library URL before the final
`/n`, where `n` is the version number. The README beside each script gives
the ID, and the full deployment info, such as:

```terminal
Version 5 on Nov 21, 2025, 4:07 PM
Deployment ID: AKfycbyBWersgxf4_JBg40CT-h9iAwfcfC3Rj4T_3aoVtfTj1EpjLQtqH6Ac3xG7CjyGZ4c
Library URL:  https://script.google.com/macros/library/d/1HFXEAhRh3-fSqNLzi9i-oMDLwr2aV4zp8-NNxv6moDfRDVGDgHn7BtqG/5
```

To add the library:

1. Copy the script's ID from the README beside the script.
2. In the sheet, choose **Extensions → Apps Script**.
3. On the left, click **Libraries**, and paste the ID into the dialog's
   first field.
4. Click **Look Up**, choose the latest version (the highest number), and
   click **Add**.

A cell cannot call a library's functions directly, only those of the
sheet's own Apps Script project. So the project also needs a wrapper: a
function of its own for each library function, which calls the library.
Paste the tool's `wrapper.gs` into the sheet's project, as
[Pasting a Script In](#pasting-a-script-in) describes, and call the
wrapper's functions from cells. You can add wrappers of your own.

#### Pasting a Script In

Instead of adding a library, a script can be pasted into the sheet's own
project. The sheet then runs that copy, which does not change when the
repo does.

1. On GitHub, the website that hosts the repo, open the file, and copy it
   with the **Copy raw file** button.
2. In the sheet, choose **Extensions → Apps Script**.
3. Select all the code in the editor (Ctrl+A, or Cmd+A on a Mac), and paste
   over it (Ctrl+V, or Cmd+V).
4. Save (Ctrl+S, or Cmd+S), and name the file. Apps Script adds `.gs` to
   the name itself.

### Node

The Node tools need the repo's packages. From the repo's top folder:

```bash
npm install
```

It installs everything the top folder's tools need, among them
crypto-price-fetchers, the owner's repo of code his projects share, from
GitHub: it runs the Sheets script under Node, keeps the api keys, asks
GeckoTerminal, a service that lists the pools of decentralized exchanges
with their prices and candles, for the ratio chart, and writes the Summ
sweep's csv.
`chart-price-ratio/` and `check-token-balance/` each have a package of
their own: run `npm install` in the folder of the tool you use too.

### Choosing Versions of Dependencies that are Raw Github Projects

This step is entirely optional: `npm install` already installs everything
the tools need.

crypto-price-fetchers is installed straight from its GitHub project,
rather than from the npm registry, by the top folder and by
`chart-price-ratio/`. Each `package.json` names it with a ref: `#main`,
its main branch, which this repo follows, or `#semver:*`, its latest
release, its highest version tag. Each `package-lock.json` keeps the commit
the ref named when the lockfile was made, and `npm ci` installs that
commit.

crypto-price-fetchers also holds the tool that moves both: its versions
tool, which this repo runs as `npm run github-project-deps`. To move both
to the newest commit of main, or to switch both to the latest release,
from the repo's top folder:

```bash
npm run github-project-deps -- main
npm run github-project-deps -- release
```

Each sets the ref in both `package.json` files, then makes each folder's
`package-lock.json` again from a fresh `node_modules`, so the newest commit
of main, or the newest release, is installed. If an install fails, as it
does for a release whose top folder has no package.json, every
`package.json` and `package-lock.json` goes back as it was, and
`node_modules` is installed again from them.
`npm run github-project-deps -- --help` says more.

### Api keys

The ratio chart, `chart-price-ratio/`, can fall back to DexTools, a service
that prices tokens from the pools of decentralized exchanges, which takes an
api key. The key is kept in `api-keys.json` in the repo's top folder, which
git, the version-control program that keeps the repo's history, ignores,
encrypted with a password you choose, by crypto-price-fetchers' key store,
which keeps keys as LP Ranger, the owner's bot that manages his 9mm V3
liquidity positions, keeps its own. This repo's `npm run api-keys` runs the
store's key manager. To save the key, from the repo's top folder:

```bash
npm run api-keys
```

It lists each key the top `config.json` names, saved or not, never showing
its characters, and asks for each one not saved: the key, then the
password, twice the first time, showing nothing of what is typed. Each key
is saved only once its service takes it.

To keep the password for a terminal, so the tools open their keys without
asking, run `unlock-api-keys.sh`, a script in the repo's top folder, a
copy of crypto-price-fetchers':

```bash
source ./unlock-api-keys.sh
```

It asks for the password once, checks that it opens the keys, and keeps it
in `API_KEYS_PASSWORD` until the terminal closes. Without it, a tool asks
for the password when it first needs a key. The password is kept nowhere
on disk, and the keys only in memory, for one run. A key is never a setting
in a file, nor a command-line argument.

## Usage

Each tool's file header says how to use it. A Sheets script also has
functions whose names start with "test". Each calls the script's functions
with sample arguments, which show how to call them.

### The Summ Sweep

The Summ sweep (`summ-sweep/`), this repo's bookkeeping tool, compares a
wallet's history on PulseChain with its records in Summ, the crypto tax
calculator, and writes a csv of rows for what Summ lacks and a report of
what to fix; `npm run summ-sweep` runs it.

The sweep needs the owner's settings in `summ-sweep/config.json`, which git
ignores: copy `summ-sweep/config-example.json` to it, and set the path of
the Summ csv template, the path of an LP Ranger checkout, whose
bookkeeping tool reads each withdrawal from a position, the owner's other
wallets with their names, the tokens to book as spam and as income, and
the symbols Summ and a csv give each token whose symbol differs from its
contract's.

It also needs Summ's rows of the wallet, saved to files a page at a time
from Summ's connector for Claude, and the time up to which Summ's sync has
read the wallet's transactions, which `--summ-synced-to` takes.
`npm run summ-sweep -- --help` lists its options, with examples of its
common uses and its exit codes, as each tool's `--help` does;
[`docs/npm-project-commands.md`](docs/npm-project-commands.md#bookkeeping)
gives an example.

## Node Versions of the Sheets Scripts

A Google Apps Script here can have a Node version beside it, of the same
name ending in `.js`, which runs the same `.gs` file under Node, unchanged,
so the two give the same answers. `for-google-apps/check-token-balance/`
has one; its README says how to use it.

## Test

The repo's tests run on a computer, in one gate that must pass before a
commit, LP Ranger's: the lint, the tests and the security audits. From the
repo's top folder:

```bash
npm ci
npm ci --prefix chart-price-ratio
npm ci --prefix check-token-balance
npm run check
```

## Documentation

The `docs/` folder holds three references:

- [`docs/architecture.md`](docs/architecture.md): how the tools work.
- [`docs/engineering.md`](docs/engineering.md): the files, the gates, the
  tests and CI, the checks GitHub Actions, GitHub's service for running
  them, runs at each push.
- [`docs/npm-project-commands.md`](docs/npm-project-commands.md): every npm
  command.

## Contributing

Fork me on GitHub. :)  Contributions are welcome but note that any contributions are subject to the license as defined in the LICENSE file here.
