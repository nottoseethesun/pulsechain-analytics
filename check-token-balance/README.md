# Token Balance Checker

Finds how much of each token a PulseChain wallet held, at a block or at the
start of a UTC date. Each token is named by its contract address. PLS, the
native gas token, has no contract, so it is named `Pulse_Native_Gas_Token`.
A balance at a past block needs an archive node, since other nodes keep
only the chain's recent state.

IMPORTANT: Use at your own risk as defined in the included file, `../LICENSE`.

## Run

The checker runs on Node, the program that runs JavaScript outside a
browser. In this folder, `npm ci` (npm is Node's package manager)
installs its packages, at the versions `package-lock.json` keeps. It runs
through its start file, `bin/check-token-balance.js`, in the repo's top
folder, the folder of the programs a reader runs, and reads the
`config.json` here whichever folder it runs in. From the repo's top
folder, its options, with examples of its common uses and its exit codes:

```bash
node bin/check-token-balance.js --help
```

The file header in `index.js` gives the details.

## Contributing

See the info on Contributing at `../README.md`.
