/**
 * Known bugs, each declared with `knownBug` (`helpers/known-bug.js`): the
 * test states what the code should do, and passes while the code does not.
 * A bug's fix makes its test fail; the same change declares the test with
 * `it`, among the tests of the code it is about.
 * @module test/known-bugs.test
 */

import { describe } from "node:test";
import assert from "node:assert/strict";
import { knownBug } from "./helpers/known-bug.js";
import {
  geckoAnswers,
  runChart,
  TOKEN_A,
  TOKEN_B,
} from "./helpers/ratio-chart.js";

describe("pulse-token-ratio.js", () => {
  knownBug(
    "charts fewer points than its date labels are wide apart, and prints the ratios after the chart",
    () => {
      // Fifteen days: the x-axis spaces its four dates four columns apart,
      // and each date is ten characters wide.
      const closesA = Array.from({ length: 15 }, (_, day) => 2 + day * 0.1);
      const closesB = Array.from({ length: 15 }, (_, day) => 1 + day * 0.01);
      const run = runChart([TOKEN_A, TOKEN_B, "daily"], {
        answers: geckoAnswers(closesA, closesB),
      });
      assert.doesNotMatch(run.stderr, /Fatal error/);
      const current = (closesA[14] / closesB[14]).toFixed(12);
      assert.ok(run.stdout.includes(`Current ratio: ${current}\n`), run.stdout);
    },
  );

  knownBug("ends with exit code 1 when it fails", () => {
    // GeckoTerminal knows no pool of either token.
    const run = runChart([TOKEN_A, TOKEN_B, "daily"], { answers: [] });
    assert.match(run.stderr, /Fatal error/);
    assert.equal(run.status, 1);
  });
});
