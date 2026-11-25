/**
 * A preload, for `node --import`, that makes a program a test starts take
 * its stdin and stderr, two pipes, for a terminal, so the ratio chart asks
 * its questions there, as at the owner's terminal.
 * @module test/helpers/stand-in-terminal-preload
 *
 * The chart asks which source to read only when stdin and stderr are a
 * terminal (`isTTY`). readline, which asks its question, and the key
 * store's prompt for the password turn the terminal's raw mode on before
 * they read, so that the terminal shows nothing typed but what the program
 * writes, and off after, with `setRawMode`, which a pipe lacks. This file
 * sets `isTTY` on both and gives stdin a `setRawMode` that keeps `isRaw`
 * and adds each call to the file the environment variable
 * `STAND_IN_TERMINAL_LOG` names, a line of `true` or `false`, so a test
 * can tell that each prompt read in raw mode and left it.
 */

import fs from "node:fs";

/** The file each call of `setRawMode` is added to, when the test names one. */
const log = process.env.STAND_IN_TERMINAL_LOG;

/*-
 *  TEST-ONLY global swap: the ratio chart reads whether stdin and stderr
 *  are a terminal, and turns raw mode on and off, through `process`, and
 *  offers no seam for it. This file runs only in a child process a test
 *  starts for one run of the chart, so the swap is never seen outside that
 *  process, and it ends with the process.
 */
process.stdin.isTTY = true;
process.stderr.isTTY = true;
process.stdin.isRaw = false;
process.stdin.setRawMode = (mode) => {
  process.stdin.isRaw = mode;
  if (log !== undefined) fs.appendFileSync(log, `${mode}\n`);
  return process.stdin;
};
