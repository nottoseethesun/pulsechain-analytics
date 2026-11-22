#!/usr/bin/env node
/**
 * The start file of the ratio chart, which charts the ratio of two
 * PulseChain tokens' prices in the terminal: `npm start` in
 * `chart-price-ratio/`, or `node bin/pulse-token-ratio.js`.
 * @module bin/pulse-token-ratio
 *
 * What: runs the ratio chart's command line, whose code and packages are in
 * `chart-price-ratio/`; `--help` gives its options, examples and exit codes.
 *
 * How: loads `chart-price-ratio/pulse-token-ratio.js`, which sets the run to end with its exit
 * code, and no stack trace, when the program reading its output closes the
 * pipe, then runs the command line on this process's arguments, reading
 * the `config.json` beside its own files. This file imports nothing else,
 * so the packages `npm ci` installs in `chart-price-ratio/` are all it needs.
 *
 * Fit: in `bin/`, the folder of the programs a reader runs.
 */

import "../chart-price-ratio/pulse-token-ratio.js";
