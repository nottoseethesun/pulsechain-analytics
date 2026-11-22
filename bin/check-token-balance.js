#!/usr/bin/env node
/**
 * The start file of the balance checker, which prints a PulseChain
 * wallet's balances of tokens at a block or at the start of a day:
 * `node bin/check-token-balance.js`.
 * @module bin/check-token-balance
 *
 * What: runs the balance checker's command line, whose code and packages are in
 * `check-token-balance/`; `--help` gives its options, examples and exit codes.
 *
 * How: loads `check-token-balance/index.js`, which sets the run to end with its exit
 * code, and no stack trace, when the program reading its output closes the
 * pipe, then runs the command line on this process's arguments, reading
 * the `config.json` beside its own files. This file imports nothing else,
 * so the packages `npm ci` installs in `check-token-balance/` are all it needs.
 *
 * Fit: in `bin/`, the folder of the programs a reader runs.
 */

import "../check-token-balance/index.js";
