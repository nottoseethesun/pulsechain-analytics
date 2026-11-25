/**
 * Tests of the bugs known in the repo's code, each declared with
 * `knownBug` (`helpers/known-bug.js`), which passes while the bug is there.
 * @module test/known-bugs.test
 *
 * The Summ sweep's command line runs as its tests run it
 * (`helpers/summ-sweep-command-run.js`), on a stand-in chain of
 * `helpers/summ-sweep-case.js` that makes a block once the sweep has read
 * its newest.
 */

import { describe } from "node:test";
import assert from "node:assert/strict";
import { knownBug } from "./helpers/known-bug.js";
import { sweepChain } from "./helpers/summ-sweep-case.js";
import { argsFor, repo, runOn } from "./helpers/summ-sweep-command-run.js";

/**
 * The case's chain, which makes a block once its newest has been read, as
 * PulseChain makes one every 10 seconds while a sweep looks up its blocks.
 *
 * @returns {Object} The chain's provider
 */
function growingChain() {
  const chain = sweepChain();
  const newest = chain.getBlockNumber.bind(chain);
  let reads = 0;
  chain.getBlockNumber = async () => {
    reads += 1;
    return (await newest()) + (reads > 1 ? 1 : 0);
  };
  return chain;
}

describe("the Summ sweep, while the chain makes a block", () => {
  knownBug(
    "says the range's last day ends after the chain's newest block, sweeping up to the block it read first",
    async () => {
      const top = repo();
      const run = await runOn(
        top,
        argsFor(top, { "--end-date": "2026-11-30" }),
        { makeChain: growingChain },
      );
      assert.equal(run.code, 0, run.err);
      assert.match(
        run.out,
        /--end-date's day, 2026-11-30, ends after the chain's newest block, 1000, made at .* UTC: the sweep stops at that block/,
      );
      assert.match(run.out, /Blocks 0 to 1000: /);
    },
  );
});
