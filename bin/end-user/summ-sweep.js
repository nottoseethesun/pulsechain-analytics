#!/usr/bin/env node
/**
 * The entry point of the sweep of a wallet against Summ,
 * `npm run summ-sweep`.
 * @module bin/end-user/summ-sweep
 *
 * What: sweeps a wallet's history on PulseChain against the pages of
 * Summ's results Claude saved, and writes the rows Summ lacks and a report
 * of what to fix; `--help` gives the rest.
 *
 * How: the command line is `summ-sweep/command-line.js`'s, run in the
 * folder npm runs a script in, the repo's top, whose settings it reads.
 *
 * Fit: in `bin/end-user/`, the folder of the programs only an end user runs.
 */

import { endQuietlyWhenOutputCloses } from "crypto-price-fetchers/lib/closed-output";
import { runSummSweep } from "../../summ-sweep/command-line.js";

endQuietlyWhenOutputCloses();

process.exitCode = await runSummSweep(process.argv);
