# Token Balance Checker

Finds how much of each token a PulseChain wallet held, at a block or at the
start of a UTC date. Each token is named by its contract address. PLS, the
native gas token, has no contract, so it is named `Pulse_Native_Gas_Token`.
A balance at a past block needs an archive node, since other nodes keep
only the chain's recent state.

IMPORTANT: Use at your own risk as defined in the included file, `../LICENSE`.

The file header in `index.js` gives the details, and `node index.js --help`
lists the options.

## Contributing

See the info on Contributing at `../../README.md`.
