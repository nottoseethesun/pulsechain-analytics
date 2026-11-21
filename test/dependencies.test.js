/**
 * Tests of how pulsechain-analytics installs crypto-price-fetchers: from
 * GitHub, following its main branch or its latest release, at the top, in
 * `chart-price-ratio/` and in `check-token-balance/` alike, with the
 * versions tool, `npm run github-project-deps`, that switches between the
 * two.
 * @module test/dependencies.test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The repo's top folder. */
const REPO_TOP = fileURLToPath(new URL("..", import.meta.url));

/**
 * Reads a package.json.
 *
 * @param {...string} parts - Its folder, from the repo's top folder
 * @returns {Object} Its contents
 */
function readPackage(...parts) {
  return JSON.parse(
    fs.readFileSync(path.join(REPO_TOP, ...parts, "package.json"), "utf8"),
  );
}

describe("crypto-price-fetchers", () => {
  it("is installed from GitHub, following its main branch or its latest release", () => {
    assert.match(
      readPackage().dependencies["crypto-price-fetchers"],
      /^github:nottoseethesun\/crypto-price-fetchers#(main|semver:\*)$/,
    );
  });

  it("is installed the same way by the ratio chart, which opens the DexTools key with it", () => {
    assert.equal(
      readPackage("chart-price-ratio").dependencies["crypto-price-fetchers"],
      readPackage().dependencies["crypto-price-fetchers"],
    );
  });

  it("is installed the same way by the balance checker, which checks its days and url with it", () => {
    assert.equal(
      readPackage("check-token-balance").dependencies["crypto-price-fetchers"],
      readPackage().dependencies["crypto-price-fetchers"],
    );
  });

  it("gives the versions tool that npm run github-project-deps runs", () => {
    assert.equal(
      readPackage().scripts["github-project-deps"],
      "github-project-deps",
    );
    const client = fileURLToPath(
      import.meta.resolve("crypto-price-fetchers/dex-prices/geckoterminal"),
    );
    const packageTop = path.join(path.dirname(client), "..");
    assert.ok(fs.existsSync(path.join(packageTop, "github-project-deps.js")));
  });
});
