/**
 * A preload, for `node --import`, that replaces `fetch` in a program a test
 * starts with a stand-in web that answers from a file the test writes.
 * @module test/helpers/stand-in-web-preload
 *
 * `STAND_IN_WEB_ANSWERS` names a JSON file of answers, each
 * `{ url, status, body }`: the url asked, exactly, and the status and JSON
 * body answered. A url with no answer fails, as a request with no network
 * would, so a program never reaches the real web. `STAND_IN_WEB_LOG`, when
 * set, names a file each request is added to, a line of JSON: its url, and
 * whether it sent the api key `STAND_IN_WEB_KEY` in `x-api-key`. The log
 * never holds a key.
 */

import fs from "node:fs";

/** The answers, from the file the test wrote. */
const answers = JSON.parse(
  fs.readFileSync(process.env.STAND_IN_WEB_ANSWERS, "utf8"),
);

/*-
 *  TEST-ONLY global swap: the ratio chart is a command line that reaches
 *  GeckoTerminal and DexTools, and the key store's check of the DexTools
 *  key, only through the global fetch, at fixed addresses, and offers no
 *  seam for it. This file runs only in a child process a test starts for
 *  one run of the chart, so the swap is never seen outside that process,
 *  and it ends with the process.
 */
globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  if (process.env.STAND_IN_WEB_LOG) {
    const sent = new Headers(init.headers).get("x-api-key");
    const line = { url: href, sentKey: sent === process.env.STAND_IN_WEB_KEY };
    fs.appendFileSync(
      process.env.STAND_IN_WEB_LOG,
      `${JSON.stringify(line)}\n`,
    );
  }
  const answer = answers.find((candidate) => candidate.url === href);
  if (!answer)
    throw new TypeError(`fetch failed: no stand-in answer for ${href}`);
  return new Response(JSON.stringify(answer.body), {
    status: answer.status ?? 200,
    headers: { "content-type": "application/json" },
  });
};
