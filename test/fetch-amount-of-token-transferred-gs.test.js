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
 * error in the cell.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
  for (const { name, chain, amount, error } of TRANSFER_CASES) {
    it(name, () => {
      const script = loadSheetsScript(TRANSFER_SHEETS_SCRIPT, chain());
      if (error === undefined) {
        assert.equal(
          script.getTokenTransferred(TRANSACTION, TOKEN, WALLET),
          amount,
        );
      } else {
        assert.throws(
          () => script.getTokenTransferred(TRANSACTION, TOKEN, WALLET),
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
