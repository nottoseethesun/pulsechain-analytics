/**
 * Tests for the Sheets script fetch-amount-of-token-transferred.gs, which
 * reads how much of a token one PulseChain transaction sent a wallet.
 * @module test/fetch-amount-of-token-transferred-gs.test
 *
 * The script runs here unchanged, under Node, through
 * `helpers/sheets-script.js`: its one Apps Script service, `UrlFetchApp`,
 * hands each json-rpc request to the stand-in chain in
 * `helpers/stand-in-chain.js`, so the tests ask nothing outside the
 * computer. The cases are the ones the Node script is held to too
 * (`helpers/transfer-cases.js`). A failure throws, which a sheet shows as an
 * error in the cell. The wrapper a sheet pastes into its own project,
 * `wrapper.gs`, runs here too, against a stand-in of the deployed library.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createAppsScriptServices,
  loadAppsScript,
} from "crypto-price-fetchers/apps-script-runner";
import {
  TOKEN,
  WALLET,
  TRANSACTION,
  standInChain,
} from "./helpers/stand-in-chain.js";
import { TRANSFER_CASES } from "./helpers/transfer-cases.js";
import {
  loadSheetsScript,
  TRANSFER_SHEETS_SCRIPT,
} from "./helpers/sheets-script.js";

describe("getTokenTransferred, the Sheets script", () => {
  for (const {
    name,
    chain,
    amount,
    error,
    transaction = TRANSACTION,
    token = TOKEN,
    wallet = WALLET,
  } of TRANSFER_CASES) {
    it(name, () => {
      const script = loadSheetsScript(TRANSFER_SHEETS_SCRIPT, chain());
      if (error === undefined) {
        assert.equal(
          script.getTokenTransferred(transaction, token, wallet),
          amount,
        );
      } else {
        assert.throws(
          () => script.getTokenTransferred(transaction, token, wallet),
          error,
        );
      }
    });
  }

  it("takes the addresses in any case, with spaces around them", () => {
    const script = loadSheetsScript(TRANSFER_SHEETS_SCRIPT, standInChain(250n));
    assert.equal(
      script.getTokenTransferred(
        ` ${TRANSACTION} `,
        TOKEN.toLowerCase(),
        ` ${WALLET.toUpperCase().replace("0X", "0x")}`,
      ),
      250,
    );
  });
});

describe("wrapper.gs, which a sheet's cells call", () => {
  /**
   * Loads the wrapper with a stand-in of the deployed library, whose two
   * functions answer as `answer` does.
   *
   * @param {function(): number} answer - Gives each call's amount, or throws
   * @returns {Object} The context holding the wrapper's functions
   */
  function loadWrapper(answer) {
    const wrapper = new URL(
      "../src/for-google-apps/check-token-balance/wrapper.gs",
      import.meta.url,
    );
    return loadAppsScript(
      [{ source: fs.readFileSync(wrapper, "utf8"), filename: "wrapper.gs" }],
      {
        ...createAppsScriptServices({
          fetchSync: () => ({ status: 500, headers: {}, text: "" }),
        }),
        FetchTokenAmountTransferredSA: {
          getTokenTransferred: answer,
          getTokenTransferredUseCache: answer,
        },
      },
    );
  }

  it("gives the library's amount, from the cached function and from the other", () => {
    const script = loadWrapper(() => 250);
    assert.equal(script.getTokenTransferred(TRANSACTION, TOKEN, WALLET), 250);
    assert.equal(
      script.getTokenTransferredNoCache(TRANSACTION, TOKEN, WALLET),
      250,
    );
  });

  it("lets the library's error through, so the cell shows an error rather than 0", () => {
    const script = loadWrapper(() => {
      throw new Error("Cannot read the transaction's receipt");
    });
    assert.throws(
      () => script.getTokenTransferred(TRANSACTION, TOKEN, WALLET),
      /Cannot read/,
    );
    assert.throws(
      () => script.getTokenTransferredNoCache(TRANSACTION, TOKEN, WALLET),
      /Cannot read/,
    );
  });
});
