/**
 * Tests for for-google-apps/check-token-balance/fetch-amount-of-token-transferred.js,
 * the Node version of fetch-amount-of-token-transferred.gs (item 16).
 * @module test/fetch-amount-of-token-transferred-node-version.test
 *
 * The real `.gs` runs under the runner from crypto-price-fetchers. Its rpc
 * requests go to the stand-in chain (`helpers/stand-in-chain.js`) through
 * `standInChainFetch`, so the tests ask nothing outside the computer. Item
 * 9's known bugs are the script's own, so they hold here too; the tests of
 * the script itself keep them.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  openTokenTransferFetcher,
  runCommandLine
} from '../for-google-apps/check-token-balance/fetch-amount-of-token-transferred.js';
import { standInChain, standInChainFetch, TOKEN, TRANSACTION, WALLET } from './helpers/stand-in-chain.js';

const NODE_VERSION = new URL('../for-google-apps/check-token-balance/fetch-amount-of-token-transferred.js', import.meta.url);
const RPC_URL = 'https://rpc.stand-in.test';

/**
 * Opens the Node version with the stand-in chain, runs `use` on it, and
 * closes it.
 *
 * @param {{answer: function(Object): Object}} chain - The stand-in chain
 * @param {function(Object, function): Promise<void>} use - Takes the open function and the stand-in fetch
 * @param {Object} [config] - The config values; by default, the stand-in endpoint's url
 * @returns {Promise<void>} Settles once closed
 */
async function withFetcher(chain, use, config = { config: { rpcUrl: RPC_URL } }) {
  const fetch = standInChainFetch(chain);
  const fetcher = await openTokenTransferFetcher({ config, fetch });
  try {
    await use(fetcher, fetch);
  } finally {
    await fetcher.close();
  }
}

/**
 * A stream stand-in that keeps what is written to it.
 *
 * @returns {{write: function(string): boolean, text: string}} The stand-in
 */
function captured() {
  const output = {
    text: '',
    write(chunk) {
      output.text += chunk;
      return true;
    }
  };
  return output;
}

describe('openTokenTransferFetcher', () => {
  it('gives the amount the transaction sent the wallet, asking the endpoint in the config', async () => {
    await withFetcher(standInChain(250n), async (fetcher, fetch) => {
      assert.equal(await fetcher.getTokenTransferred(TRANSACTION, TOKEN, WALLET), 250);
      assert.ok(fetch.requests.length > 0, 'the script asked the chain nothing');
      assert.ok(fetch.requests.every((request) => request.url === RPC_URL && request.method === 'POST'));
    });
  });

  it('gives 0 when the transaction sent the wallet nothing', async () => {
    await withFetcher(standInChain(0n), async (fetcher) => {
      assert.equal(await fetcher.getTokenTransferred(TRANSACTION, TOKEN, WALLET), 0);
    });
  });

  it('asks the endpoint written in the script when the config sets none', async () => {
    await withFetcher(
      standInChain(250n),
      async (fetcher, fetch) => {
        await fetcher.getTokenTransferred(TRANSACTION, TOKEN, WALLET);
        assert.equal(fetch.requests[0].url, 'https://rpc-pulsechain.g4mm4.io');
      },
      {}
    );
  });

  it("opens with config-example.json, whose fields are all the script's", async () => {
    const example = fileURLToPath(new URL('../for-google-apps/check-token-balance/config-example.json', import.meta.url));
    const fetcher = await openTokenTransferFetcher({ configFile: example, fetch: standInChainFetch(standInChain(0n)) });
    await fetcher.close();
  });
});

describe('fetch-amount-of-token-transferred.js, the command line', () => {
  let folder;
  let configFile;

  before(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsechain-analytics-test-cli-'));
    configFile = path.join(folder, 'config.json');
    fs.writeFileSync(configFile, JSON.stringify({ config: { rpcUrl: RPC_URL } }));
  });

  after(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  /**
   * Runs the command line against the stand-in chain.
   *
   * @param {string[]} args - The arguments after the file's name
   * @returns {Promise<{exitCode: number, stdout: string, stderr: string}>} What it did
   */
  async function run(args) {
    const stdout = captured();
    const stderr = captured();
    const exitCode = await runCommandLine(['node', 'fetch-amount-of-token-transferred.js', ...args], {
      fetch: standInChainFetch(standInChain(250n)),
      stdout,
      stderr
    });
    return { exitCode, stdout: stdout.text, stderr: stderr.text };
  }

  it('prints the amount, with exit code 0', async () => {
    assert.deepEqual(await run([TRANSACTION, TOKEN, WALLET, '--config', configFile]), {
      exitCode: 0,
      stdout: '250\n',
      stderr: ''
    });
  });

  it('refuses a transaction hash that is not one, before asking the chain', async () => {
    const result = await run(['0x1234', TOKEN, WALLET, '--config', configFile]);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /invalid for argument 'transaction'\. It is not a transaction hash/);
  });

  it('refuses an address that is not one', async () => {
    const result = await run([TRANSACTION, TOKEN, 'wallet', '--config', configFile]);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /invalid for argument 'wallet'\. It is not an address/);
  });

  it('answers --help on stdout, with exit code 0', async () => {
    const result = await run(['--help']);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Usage: fetch-amount-of-token-transferred \[options\] <transaction> <token> <wallet>/);
    assert.equal(result.stderr, '');
  });

  it('runs as a program: node fetch-amount-of-token-transferred.js --help', () => {
    const output = execFileSync(process.execPath, [fileURLToPath(NODE_VERSION), '--help'], {
      encoding: 'utf8',
      timeout: 15000
    });
    assert.match(output, /Usage: fetch-amount-of-token-transferred/);
  });
});
