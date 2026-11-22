/**
 * Where a run of the ratio chart reads its candles: Moralis or
 * GeckoTerminal, one of the two for the whole run.
 * @module chart-price-ratio/ratio-source
 *
 * What: GeckoTerminal takes no key, so a run can always read its candles.
 * Moralis needs the Moralis api key saved in the repo's key store, and
 * then reads two years of daily candles by default. With no Moralis key
 * saved, a run reads GeckoTerminal's candles and asks no question. With one
 * saved, both can give the candles, so the run asks at the terminal which
 * to read, Enter taking Moralis, unless `--source` names one. A run with no
 * terminal to ask at, such as one whose input is a pipe, stops and names
 * `--source`. Whichever source a run reads, DexTools stays its fallback,
 * for current prices, when the candles cannot be had (`ratio-series.js`).
 *
 * How: `chooseSource` settles the source from what the run was given and
 * which keys are saved, asking through a function its caller gives, so a
 * test answers the question itself. `askAtTerminal` asks it on the
 * terminal: the question on stderr, so it stays out of output piped
 * elsewhere, and the answer from stdin.
 *
 * Fit: `pulse-token-ratio.js` settles the source before the run asks any
 * service, and `ratio-command.js` takes `--source` from the choices here.
 */

import readline from "node:readline/promises";
import { SAVE_KEY_HELP } from "./api-keys.js";
import { GECKOTERMINAL_FREE_DAYS } from "./ratio-output.js";

/** The sources of candles, in the order the question lists them. */
export const SOURCES = Object.freeze(["moralis", "geckoterminal"]);

/** How many answers the question takes before the run stops. */
export const TRIES = 3;

/**
 * Says what a source's candles reach back to, for the run's interval.
 *
 * @param {string} source - 'moralis' or 'geckoterminal'
 * @param {{interval: string, maxCandles: number, moralis: {days: number}}} settings - The run's settings (`ratioSettings`)
 * @returns {string} What it reaches
 */
function reach(source, settings) {
  if (settings.interval === "hourly") {
    return `the last ${settings.maxCandles} hours`;
  }
  return source === "moralis"
    ? `the last ${settings.moralis.days} days`
    : `about the last ${GECKOTERMINAL_FREE_DAYS} days`;
}

/**
 * Writes the question of the source.
 *
 * @param {{interval: string, maxCandles: number, moralis: {days: number}}} settings - The run's settings (`ratioSettings`)
 * @returns {string} The question, ending where the answer is typed
 */
export function sourceQuestion(settings) {
  return [
    "A Moralis api key is saved, so Moralis and GeckoTerminal can both give the candles.",
    `  1  Moralis: ${reach("moralis", settings)} (Enter)`,
    `  2  GeckoTerminal: ${reach("geckoterminal", settings)}`,
    "Which should this run read, 1 or 2? ",
  ].join("\n");
}

/**
 * Settles the run's source of candles.
 *
 * @param {Object} choice - What the source is chosen from
 * @param {(string|undefined)} choice.requested - The source `--source` named, if any
 * @param {boolean} choice.moralisKeySaved - Whether a Moralis api key is saved
 * @param {boolean} choice.canAsk - Whether a terminal can answer the question
 * @param {function(string): Promise<string>} choice.ask - Asks the question, and gives the answer typed
 * @param {{interval: string, maxCandles: number, moralis: {days: number}}} choice.settings - The run's settings, for the question
 * @returns {Promise<string>} 'moralis' or 'geckoterminal'
 * @throws {Error} When `--source` names Moralis and no Moralis key is saved, when there is a choice and no terminal to ask, or when TRIES answers are neither 1, 2 nor Enter
 */
export async function chooseSource({
  requested,
  moralisKeySaved,
  canAsk,
  ask,
  settings,
}) {
  if (requested === "moralis" && !moralisKeySaved) {
    throw new Error(
      `--source moralis reads Moralis's candles with the Moralis api key, and none is saved. ${SAVE_KEY_HELP}`,
    );
  }
  if (requested !== undefined) return requested;
  if (!moralisKeySaved) return "geckoterminal";
  if (!canAsk) {
    throw new Error(
      "A Moralis api key is saved, so Moralis and GeckoTerminal can both give the candles, and there is no terminal to ask which: name one with --source moralis or --source geckoterminal.",
    );
  }
  for (let tries = 0; tries < TRIES; tries++) {
    const answer = (await ask(sourceQuestion(settings))).trim();
    if (answer === "" || answer === "1") return "moralis";
    if (answer === "2") return "geckoterminal";
  }
  throw new Error(
    `None of ${TRIES} answers was 1, 2 or Enter, so no source was chosen: run the chart again, or name one with --source.`,
  );
}

/**
 * Asks a question on the terminal: the question on stderr, the answer
 * from stdin.
 *
 * @param {string} question - The question
 * @returns {Promise<string>} The answer typed
 * @throws {Error} When the terminal closes before an answer
 */
export async function askAtTerminal(question) {
  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  try {
    return await terminal.question(question);
  } catch (error) {
    throw new Error("The terminal closed before the question was answered.", {
      cause: error,
    });
  } finally {
    terminal.close();
  }
}
