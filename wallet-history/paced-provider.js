/**
 * Paces the requests a wallet's history sends to an rpc endpoint, so a
 * search of a year of blocks stays within what a public endpoint serves.
 * @module wallet-history/paced-provider
 *
 * What: a public PulseChain endpoint refuses, or answers slowly, a stream
 * of requests sent as fast as a program can send them, and a wallet's
 * history over a year takes thousands of them: log searches over spans of
 * blocks, nonce and balance reads at their ends, receipts and traces.
 * `pacedProvider` wraps an ethers provider so each request waits its
 * turn, a set least time after the one before it, as LP Ranger paces its
 * own (`globalRPCRequestRateIntervalMS`).
 *
 * How: a turn is booked from the moment the request before it went out,
 * rather than from when that one was due, so a timer that fired late does
 * not let the next request follow sooner than the spacing. `ask` sends one
 * request in its turn. `askAll` sends a list of them in one turn: ethers
 * gathers requests made together into one http request, a json-rpc batch,
 * so a set of receipts or traces costs one turn rather than one each.
 * LP Ranger has the same pacing in its wallet report, but that file loads
 * LP Ranger's settings as it loads, and LP Ranger cannot change, so this
 * module is a second copy of the idea, not an import.
 *
 * Fit: every function of `wallet-history/` takes the paced provider this
 * returns, which a program's entry point builds once, from an ethers
 * provider of an endpoint that keeps past state and offers the debug
 * methods, such as g4mm4's, and the spacing LP Ranger uses, 222
 * milliseconds.
 */

/**
 * Waits a number of milliseconds.
 *
 * @param {number} milliseconds - How long
 * @returns {Promise<void>} Settles once the time has passed
 */
function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Wraps a provider so that its requests go out in turns, a least time
 * apart.
 *
 * @param {object} provider - An ethers provider, or a stand-in with the
 *   same methods
 * @param {object} pacing - How the requests are paced
 * @param {number} pacing.spacingMs - The least time between two turns, in
 *   milliseconds
 * @param {function(number): Promise<void>} [pacing.sleep] - Waits a number
 *   of milliseconds; the tests give their own
 * @param {function(): number} [pacing.now] - The time now, in
 *   milliseconds; the tests give their own
 * @returns {{ask: function(string, ...*): Promise<*>,
 *   askAll: function(string, Array<Array<*>>): Promise<Array<*>>}}
 *   `ask(method, ...args)` calls one method of the provider in its turn;
 *   `askAll(method, argsList)` calls it once for each list of arguments,
 *   all in one turn
 */
export function pacedProvider(
  provider,
  { spacingMs, sleep = wait, now = Date.now },
) {
  let nextAt = 0;
  /** Waits for this request's turn, then books the next one's. */
  async function turn() {
    const waitMs = nextAt - now();
    if (waitMs > 0) await sleep(waitMs);
    nextAt = now() + spacingMs;
  }
  return {
    async ask(method, ...args) {
      await turn();
      return provider[method](...args);
    },
    async askAll(method, argsList) {
      if (argsList.length === 0) return [];
      await turn();
      return Promise.all(argsList.map((args) => provider[method](...args)));
    },
  };
}
