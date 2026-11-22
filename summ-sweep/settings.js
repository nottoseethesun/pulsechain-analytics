/**
 * The Summ sweep's two settings files, each checked against its JSON
 * Schema before the sweep takes a setting.
 * @module summ-sweep/settings
 *
 * What: the chain's facts are in the top `config.json`, under `pulsechain`,
 * and the owner's settings in `summ-sweep/config.json`, which git ignores
 * (`config-example.json` beside it shows the shape). `readSweepSettings`
 * reads both with crypto-price-fetchers' `readSettingsFile`
 * (`crypto-price-fetchers/lib/settings-file`) and holds each to its schema,
 * built from crypto-price-fetchers' kinds of value
 * (`crypto-price-fetchers/lib/settings-schema`), as LP Ranger checks its
 * settings: a file that is not JSON, a setting missing, a key the schema
 * does not name, or a value of the wrong kind stops the sweep, with every
 * problem listed, before it reads the chain. `ownWallets`, `summSymbols`
 * and `csvSymbols` are keyed by addresses, so each takes any address as a
 * key, and refuses a key that is no address.
 *
 * How: the chain's two contracts are held in EIP-55's mixed case, as the
 * sweep compares addresses as text. The owner's addresses may be written
 * in lower case too, as ethers' `getAddress` takes them, since
 * `owner-lists.js` puts each in EIP-55's case as it reads it; one written
 * in mixed case whose checksum is wrong is refused here, by the format
 * `evm-address`.
 *
 * Fit: `command-line.js` calls `readSweepSettings` once the arguments are
 * parsed.
 */

import fs from "node:fs";
import path from "node:path";
import { isAddress } from "ethers";
import { readSettingsFile } from "crypto-price-fetchers/lib/settings-file";
import { KINDS } from "crypto-price-fetchers/lib/settings-schema";

/**
 * Says whether text is an address the owner's settings may hold: 0x and 40
 * hex digits, in lower case, in upper case, or in EIP-55's mixed case with
 * its checksum right.
 *
 * @param {string} text - The text
 * @returns {boolean} Whether it is one
 */
function isOwnerAddress(text) {
  return /^0x[0-9a-fA-F]{40}$/.test(text) && isAddress(text);
}

/** The format of an address in the owner's settings, for the schema checks. */
const FORMATS = Object.freeze({ "evm-address": isOwnerAddress });

/** An address in the owner's settings. */
const OWNER_ADDRESS = Object.freeze({
  type: "string",
  format: "evm-address",
  description:
    "an address, 0x and 40 hex digits, in lower case or in EIP-55's mixed case",
});

/** A list of addresses in the owner's settings. */
const OWNER_ADDRESSES = Object.freeze({
  type: "array",
  uniqueItems: true,
  items: OWNER_ADDRESS,
  description: "a list of addresses, each once",
});

/**
 * The JSON Schema of the top `config.json`, as the sweep reads it: the
 * chain's facts under `pulsechain`, each required, and `apiKeys`, which
 * crypto-price-fetchers' key store reads.
 */
export const CHAIN_SETTINGS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["pulsechain"],
  properties: {
    apiKeys: {
      type: "array",
      uniqueItems: true,
      items: KINDS.text,
      description:
        "a list of the services whose keys the programs send, each once",
    },
    pulsechain: {
      type: "object",
      additionalProperties: false,
      required: [
        "chainId",
        "rpcEndpoint",
        "positionManager",
        "wrappedCoin",
        "spanBlocks",
        "requestSpacingMs",
        "batchSize",
      ],
      properties: {
        chainId: KINDS.wholeAbove0,
        rpcEndpoint: KINDS.url,
        positionManager: KINDS.address,
        wrappedCoin: KINDS.address,
        spanBlocks: KINDS.wholeAbove0,
        requestSpacingMs: KINDS.wholeAtLeast0,
        batchSize: KINDS.wholeAbove0,
      },
      description: "the chain's facts",
    },
  },
});

/**
 * The JSON Schema of `summ-sweep/config.json`: the paths of the owner's
 * Summ template and LP Ranger checkout, each required, and his lists, each
 * of which may be left out.
 */
export const OWNER_SETTINGS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["templatePath", "lpRangerDir"],
  properties: {
    templatePath: KINDS.text,
    lpRangerDir: KINDS.text,
    ownWallets: {
      type: "object",
      propertyNames: OWNER_ADDRESS,
      additionalProperties: KINDS.text,
      description: "each wallet's name in Summ, by its address",
    },
    spamTokens: OWNER_ADDRESSES,
    incomeTokens: OWNER_ADDRESSES,
    summSymbols: {
      type: "object",
      propertyNames: OWNER_ADDRESS,
      additionalProperties: {
        type: "array",
        minItems: 1,
        uniqueItems: true,
        items: KINDS.text,
        description: "a list of one or more symbols, each once",
      },
      description: "each token's symbols in Summ, by its contract",
    },
    csvSymbols: {
      type: "object",
      propertyNames: OWNER_ADDRESS,
      additionalProperties: KINDS.text,
      description: "each token's symbol in a csv, by its contract",
    },
  },
});

/**
 * Reads a settings file the sweep cannot run without, once it holds to its
 * schema.
 *
 * @param {string} file - The file
 * @param {string} name - The file's name in a problem, from the repo's top
 * @param {Object} schema - Its schema
 * @param {string} missing - What to say when it is not there
 * @returns {Object} The settings
 * @throws {Error} When it is missing, cannot be read, is not JSON, or has a problem the schema finds, every problem listed
 */
function requiredSettings(file, name, schema, missing) {
  if (!fs.existsSync(file)) throw new Error(missing);
  return readSettingsFile(file, {
    required: true,
    schema,
    formats: FORMATS,
    name,
  });
}

/**
 * Reads the chain's facts and the owner's settings.
 *
 * @param {string} repoTop - The folder whose `config.json` and `summ-sweep/config.json` are read
 * @returns {{chain: Object, owner: Object}} The chain's facts, from the top `config.json`'s `pulsechain`, and the owner's settings
 * @throws {Error} When either file is missing, cannot be read, is not JSON, or has a problem its schema finds, every problem listed
 */
export function readSweepSettings(repoTop) {
  const chain = requiredSettings(
    path.join(repoTop, "config.json"),
    "config.json",
    CHAIN_SETTINGS_SCHEMA,
    "The top config.json is missing",
  ).pulsechain;
  const owner = requiredSettings(
    path.join(repoTop, "summ-sweep", "config.json"),
    "summ-sweep/config.json",
    OWNER_SETTINGS_SCHEMA,
    "summ-sweep/config.json is missing: copy summ-sweep/config-example.json to it and fill it in",
  );
  return { chain, owner };
}
