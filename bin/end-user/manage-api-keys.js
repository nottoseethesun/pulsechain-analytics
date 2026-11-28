/**
 * The api key manager of pulsechain-analytics: `npm run api-keys`.
 * @module bin/end-user/manage-api-keys
 *
 * What: lists the api keys of the services this project's `config.json`
 * names under `apiKeys` (DexTools, for the ratio chart's fallback to
 * current prices, and Moralis, for its candles), numbered in the services'
 * order of priority, each saved or not, never showing their characters,
 * and asks for each one not saved, keeping it encrypted in `api-keys.json`
 * in the repo's top folder, which git ignores; then, while that file holds
 * no order of priority for those services, it asks for one and saves it
 * there.
 * `npm run api-keys -- set <service>` replaces one, `rank` changes the
 * order, and `check-password` is what `bin/unlock-api-keys.sh` runs;
 * `--help` gives the rest.
 *
 * How: the manager is crypto-price-fetchers' (`api-key-store`), run with
 * the repo's top folder, two above this one, as the project's top folder.
 */

import { fileURLToPath } from "node:url";
import { runKeyManager } from "crypto-price-fetchers/api-key-store";
import { endQuietlyWhenOutputCloses } from "crypto-price-fetchers/lib/closed-output";

endQuietlyWhenOutputCloses();

process.exitCode = await runKeyManager(process.argv, {
  projectTop: fileURLToPath(new URL("../..", import.meta.url)),
});
