# Amount a Transaction Sent, in Google Sheets

## Overview

`fetch-amount-of-token-transferred.gs`, a script for Google Sheets,
Google's spreadsheet app, written in Apps Script, Google's platform for
scripts that run inside its apps, gives, in a sheet's cell, how much of a
token one PulseChain transaction sent a wallet:
`getTokenTransferred(transaction, token, wallet)`. It reads the
transaction's receipt and adds up the token's transfers to the wallet in
it. `wrapper.gs` is what a sheet pastes into its own project to call it.

## Pre-requisites

See the Google Apps Script prerequisites in the repo's
[README](../../../README.md#prerequisites).

## Installation

The script is added to a sheet as a library, as
[Adding the Library](../../../README.md#adding-the-library), in the repo's
README, describes. Apps Script
asks for the library's script ID, which is:

```terminal
1HFXEAhRh3-fSqNLzi9i-oMDLwr2aV4zp8-NNxv6moDfRDVGDgHn7BtqG
```

The full deployment info, in case it is needed (the number at the end of
the library URL grows with each new version):

```terminal
Version 5 on Nov 21, 2025, 4:07 PM
Deployment ID: AKfycbyBWersgxf4_JBg40CT-h9iAwfcfC3Rj4T_3aoVtfTj1EpjLQtqH6Ac3xG7CjyGZ4c
Library URL:  https://script.google.com/macros/library/d/1HFXEAhRh3-fSqNLzi9i-oMDLwr2aV4zp8-NNxv6moDfRDVGDgHn7BtqG/5
```

## The Node Version

`bin/end-user/fetch-amount-of-token-transferred.js`, in the repo's
`bin/end-user/`, the folder of the programs only an end user runs, runs
`fetch-amount-of-token-transferred.gs` itself, unchanged, under Node, the
program that runs JavaScript outside a browser, so it answers as
`getTokenTransferred` does in a sheet, from a Node program or the command
line ([Run](#run)). It needs no wrapper: a Node program imports it
directly. npm, Node's package manager, installs the repo's packages with
`npm ci`, and the Node version runs from the repo's top folder, on Node 24
or later. The PulseChain rpc endpoint, the json-rpc api of the node it
asks, can go in `config.json` here, beside the script, which git, the
version-control program, ignores; `config-example.json` shows the shape.

It runs the script with the runner of
[crypto-price-fetchers](https://github.com/nottoseethesun/crypto-price-fetchers),
the owner's repo of code his projects share, which `npm ci` installs; the
runner runs an Apps Script file under Node, with Node versions of Apps
Script's services. The file header says what differs from the sheet.

## A Note on Caching

A sheet recalculates its cells often, and a large sheet can call the same
function many times with the same arguments. Each call that reaches the
rpc endpoint counts against its rate limit, and too many calls get the
sheet blocked. So the deployed library also has a caching function,
`getTokenTransferredUseCache`, which answers a repeated call from its
cache. A transaction's amount does not change once the transaction is on
the chain, so a cached answer stays right. The wrapper's
`getTokenTransferred` calls the caching function, and its
`getTokenTransferredNoCache` calls the function without the cache.

The caching function is in the deployed library only, not in the repo's
copy of the script. The repo's copy, its Node version and the module at
the repo's top folder that works out the same amount with ethers, a
library for talking to Ethereum-style chains, keep no cache.

## Run

The script runs in a sheet's cell, once it is added to the sheet
([Installation](#installation)) and `wrapper.gs` is pasted into the
sheet's own project; its Node version runs from the repo's top folder.
Each sub-section below covers one: first an example of how to run it,
then what it does, and, under its Usage, more examples.

### fetch-amount-of-token-transferred.gs

```text
=getTokenTransferred(A2, "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39", B2)
```

In a cell, this gives the HEX that the transaction in cell A2 sent the
wallet in cell B2, through the wrapper, which asks the library's caching
function ([A Note on Caching](#a-note-on-caching)).

#### Usage of fetch-amount-of-token-transferred.gs

The same amount, asked of the chain each time, without the cache:

```text
=getTokenTransferredNoCache(A2, "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39", B2)
```

Each row's own token, its contract address in column C:

```text
=getTokenTransferred(A2, C2, B2)
```

### fetch-amount-of-token-transferred.js

```bash
node bin/end-user/fetch-amount-of-token-transferred.js <transaction> <token> <wallet>
```

This prints how much of the token the transaction sent the wallet.
`--help` lists the options, with examples and the exit codes.

#### Usage of fetch-amount-of-token-transferred.js

How much HEX one transaction sent a wallet, with the script's log on
stderr, which shows each step it took:

```bash
node bin/end-user/fetch-amount-of-token-transferred.js --verbose <transaction> 0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39 <wallet>
```

From a Node program in the repo's top folder:

```js
import { openTokenTransferFetcher } from './bin/end-user/fetch-amount-of-token-transferred.js';

const fetcher = await openTokenTransferFetcher();
const amount = await fetcher.getTokenTransferred(txId, tokenAddress, walletAddress);
await fetcher.close();
```

## Contributing

See the info on Contributing at `../../../README.md`.

### Development Notes

The Google Apps Script library is named, "FetchTokenAmountTransferredSA" (the "SA" at the end comes from
the fact that this is a Stand-alone Google Apps script, meaning, it's not attached to any document such
as a Google Sheet).  Optionally, find the actual Google Apps Script library file that users will be
importing,
here: <https://script.google.com/home/projects/1HFXEAhRh3-fSqNLzi9i-oMDLwr2aV4zp8-NNxv6moDfRDVGDgHn7BtqG>
and edit it here:
<https://script.google.com/home/projects/1HFXEAhRh3-fSqNLzi9i-oMDLwr2aV4zp8-NNxv6moDfRDVGDgHn7BtqG/edit> .
