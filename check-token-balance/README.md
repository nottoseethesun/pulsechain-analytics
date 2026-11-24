# Token Balance Checker

Finds how much of each token a PulseChain wallet held, at a block or at the
start of a UTC date. Each token is named by its contract address. PLS, the
native gas token, has no contract, so it is named `Pulse_Native_Gas_Token`.
A balance at a past block needs an archive node, since other nodes keep
only the chain's recent state.

IMPORTANT: Use at your own risk as defined in the included file, `../LICENSE`.

## Run

```bash
node bin/end-user/check-token-balance.js --address <wallet> --date 2026-11-01 --tokens Pulse_Native_Gas_Token,0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39
```

Run from the repo's top folder, this prints the PLS and the HEX of the
wallet `<wallet>` stands for at the start of 1 November 2026, UTC. The
checker runs on Node, the program that runs JavaScript outside a browser.
In this folder, `npm ci` (npm is Node's package manager) installs its
packages, at the versions `package-lock.json` keeps. It runs through its
start file, `bin/end-user/check-token-balance.js`, in the repo's
`bin/end-user/`, the folder of the programs only an end user runs, and
reads the `config.json` here whichever
folder it runs in.

### Usage of check-token-balance.js

`node bin/end-user/check-token-balance.js --help` lists its options, with examples
of its common uses and its exit codes, and the file header in `index.js`
gives the details.

The same wallet's PLS at one block, from another rpc endpoint that keeps
past state:

```bash
node bin/end-user/check-token-balance.js --address <wallet> --block 22000000 --tokens Pulse_Native_Gas_Token --rpc https://rpc.pulsechain.com
```

The same wallet's wrapped PLS and HEX at the start of 2026, from a node
on this computer that keeps past state:

```bash
node bin/end-user/check-token-balance.js --address <wallet> --date 2026-01-01 --tokens 0xA1077a294dDE1B09bB078844df40758a5D0f9a27,0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39 --rpc http://localhost:8545
```

## Contributing

See the info on Contributing at `../README.md`.
