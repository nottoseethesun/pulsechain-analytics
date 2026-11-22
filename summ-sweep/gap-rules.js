/**
 * The rules that turn the legs Summ lacks of one transaction into rows,
 * and the legs no rule settles into questions.
 * @module summ-sweep/gap-rules
 *
 * What: the rules are those of the owner's skill for missing
 * transactions, applied to what the chain shows a transaction did. The
 * first rule that fits a leg books it:
 *
 * 1. A part of a withdrawal from a 9mm V3 position: the principal is
 *    Remove liquidity, and the fees are Income.
 * 2. A transaction the wallet sent to the position manager: a token out
 *    is a deposit, Add liquidity, into the position its IncreaseLiquidity
 *    event names; the position's NFT the position manager mints to the
 *    wallet is Receive LP token, and the one it burns, Return LP token, an
 *    NFT sent or received in a transfer going to the rules below; a coin
 *    in that a collect with no principal paid is
 *    Income, all of it fees. A deposit's rows name the PLS the
 *    transaction paid the position manager, which has no log.
 * 3. Wrapping PLS: the WPLS in is Swap in. Unwrapping: the WPLS out is
 *    Swap out. The PLS side moves without a log, so it has no row here.
 * 4. A swap: a transaction the wallet sent in which one asset, a token
 *    or PLS, went out and one other came in. Each token's legs Summ lacks
 *    are added up, in less out: a Buy row when more came in, a Sell row
 *    when more went out.
 * 5. A token on the owner's list of spam, coming in: Spam.
 * 6. A token from or to one of the owner's other wallets: Receive or
 *    Send.
 * 7. A token on the owner's list of income tokens, coming in: Income.
 *
 * Any other leg is a question for the owner, never a guess: a token or an
 * NFT sent to or received from an address on none of his lists, a token
 * burned or minted outside a transaction to the position manager, an NFT
 * minted or burned outside a transaction the wallet sent to the position
 * manager, a transfer from the wallet to itself, a coin of a collect the
 * sweep could not split, a coin the position manager paid that no collect
 * in the transaction accounts for, a swap's token whose legs Summ lacks,
 * in and out, add up to nothing, and a token whose contract gave no
 * decimals, or no symbol a csv can carry (`csvSymbolOf`), which the
 * owner's settings do not give.
 *
 * How: the swap rule runs first, on the whole transaction, since it needs
 * every leg the wallet has in it, matched or not, and the PLS it sent and
 * was handed back: an asset's side of the swap can be in Summ already. It
 * takes no transaction to the position manager, none with an NFT and none
 * that wraps, so rules 1 to 3 come first in effect.
 * The other legs Summ lacks are gathered token by token: the legs of one
 * token, one direction and one NFT id become one row, as the skill
 * allows, and the row says how many legs it adds up.
 *
 * Fit: `summ-sweep/gaps.js` runs `transactionGaps` on each transaction
 * with legs Summ lacks, then adds what all the rows of a transaction
 * share: Summ's hold on it, and its gas.
 */

import { ZeroAddress } from "ethers";
import { decimalText } from "./amounts.js";
import { csvSymbolOf, symbolLack } from "./owner-lists.js";
import { PLS, PLS_DECIMALS, legRow } from "./rows.js";

/** The zero address: the sender of a mint, and the receiver of a burn. */
const ZERO = ZeroAddress;

/**
 * A leg's amount, with its symbol, as a description writes it.
 *
 * @param {bigint} amount - The amount, in the token's smallest units
 * @param {object} leg - A leg of the token: `decimals`
 * @param {string} symbol - The token's symbol in the csv
 * @returns {string} Such as `12345.67890123 HEX`
 */
function amountOf(amount, leg, symbol) {
  return `${decimalText(amount, leg.decimals)} ${symbol}`;
}

/**
 * The number of the position a deposit went into: the NFT its
 * IncreaseLiquidity event names, in LP Ranger's record, or else the NFT
 * the position manager minted to the wallet in the transaction.
 *
 * @param {object} transaction - The transaction
 * @returns {string} Such as ` #12345`, or the empty text when neither
 *   names one
 */
function positionNumber(transaction) {
  const events = transaction.record?.liquidity ?? [];
  const increase = events.find((event) => event.event === "IncreaseLiquidity");
  const minted = transaction.legs.find(
    (leg) =>
      leg.nftId !== undefined &&
      leg.direction === "in" &&
      leg.counterparty === ZERO,
  );
  if (increase !== undefined) return ` #${increase.nftId}`;
  return minted === undefined ? "" : ` #${minted.nftId}`;
}

/**
 * The note of the PLS a transaction paid the position manager, which
 * wraps it into the pool's WPLS: the PLS it sent, less any the position
 * manager handed back.
 *
 * @param {object} transaction - The transaction
 * @param {object} env - The wallet, the owner's lists and the chain
 * @returns {string} The note, or the empty text when it paid none
 */
function plsDepositNote(transaction, env) {
  const { flow } = transaction;
  if (flow === undefined) return "";
  const refunded = flow.handedBack
    .filter((one) => one.from === env.chain.positionManager)
    .reduce((sum, one) => sum + one.amount, 0n);
  const paid = flow.sent - refunded;
  if (paid <= 0n) return "";
  return ` The transaction also paid the position manager ${decimalText(paid, PLS_DECIMALS)} ${PLS}, which moved without a log, so this file holds no row for it.`;
}

/**
 * Whether a leg's token has what a row needs: its decimals, and a symbol
 * for the csv.
 *
 * @param {object} leg - The leg
 * @param {object} env - The wallet, the owner's lists and the chain
 * @returns {boolean} Whether it has both
 */
function hasFacts(leg, env) {
  return (
    leg.decimals !== null &&
    csvSymbolOf(env.lists, leg.token, leg.symbol) !== null
  );
}

/**
 * What a transaction the wallet sent swapped: the one asset that went
 * out and the one that came in, each a token or PLS, with its amount.
 *
 * A transaction with an NFT, a wrap, or a token without its facts is no
 * swap here: its legs go through the other rules.
 *
 * @param {object} transaction - The transaction
 * @param {object} env - The wallet, the owner's lists and the chain
 * @returns {{out: {asset: string, amount: bigint}, in: {asset: string,
 *   amount: bigint}}|null} The swap; `null` when it is none
 */
function swapOf(transaction, env) {
  const { legs, flow } = transaction;
  if (flow === undefined || !flow.succeeded) return null;
  if (transaction.toPositionManager) return null;
  const plain = (leg) =>
    leg.nftId === undefined && leg.wrap === undefined && hasFacts(leg, env);
  if (!legs.every(plain)) return null;
  const net = new Map();
  const add = (asset, amount) =>
    net.set(asset, (net.get(asset) ?? 0n) + amount);
  for (const leg of legs)
    add(leg.token, leg.direction === "in" ? leg.amount : -leg.amount);
  const handedBack = flow.handedBack.reduce((sum, one) => sum + one.amount, 0n);
  add(PLS, handedBack - flow.sent);
  const outs = [...net].filter(([, amount]) => amount < 0n);
  const ins = [...net].filter(([, amount]) => amount > 0n);
  if (outs.length !== 1 || ins.length !== 1) return null;
  return {
    out: { asset: outs[0][0], amount: -outs[0][1] },
    in: { asset: ins[0][0], amount: ins[0][1] },
  };
}

/**
 * A leg's facts for a question.
 *
 * @param {object} leg - The leg
 * @param {object} env - The wallet, the owner's lists and the chain
 * @returns {object} Its direction, token, symbol, amount (in the token's
 *   smallest units, and as whole tokens with the csv symbol, `null` when
 *   the token lacks its decimals or a symbol), decimals, counterparty, and
 *   its NFT id and part when it has them
 */
function legFacts(leg, env) {
  return {
    direction: leg.direction,
    token: leg.token,
    symbol: leg.symbol,
    amount: leg.amount,
    amountText: hasFacts(leg, env)
      ? amountOf(leg.amount, leg, csvSymbolOf(env.lists, leg.token, leg.symbol))
      : null,
    decimals: leg.decimals,
    counterparty: leg.counterparty,
    nftId: leg.nftId,
    part: leg.part,
  };
}

/**
 * A question for the owner about legs of a transaction that no rule
 * settles.
 *
 * @param {object[]} legs - The legs
 * @param {string} reason - Why no rule settles them
 * @param {object} env - The wallet, the owner's lists and the chain
 * @returns {object} The question
 */
function question(legs, reason, env) {
  return {
    hash: legs[0].hash,
    timestamp: legs[0].timestamp,
    reason,
    legs: legs.map((leg) => legFacts(leg, env)),
  };
}

/**
 * The text of an asset's side of a swap.
 *
 * @param {{asset: string, amount: bigint}} side - The side
 * @param {object} transaction - The transaction
 * @param {object} env - The wallet, the owner's lists and the chain
 * @returns {string} Such as `100 DAI`
 */
function sideText(side, transaction, env) {
  if (side.asset === PLS)
    return `${decimalText(side.amount, PLS_DECIMALS)} ${PLS}`;
  const leg = transaction.legs.find((one) => one.token === side.asset);
  return amountOf(
    side.amount,
    leg,
    csvSymbolOf(env.lists, leg.token, leg.symbol),
  );
}

/**
 * The rows of a swap's sides Summ lacks.
 *
 * @param {object} transaction - The transaction
 * @param {object} swap - What it swapped, from `swapOf`
 * @param {object} env - The wallet, the owner's lists and the chain
 * @returns {{rows: object[], questions: object[], booked: Set<object>}}
 *   The rows, each with the log index it sorts by; the questions; and
 *   the legs Summ lacks that they cover
 */
function swapRows(transaction, swap, env) {
  const sides = [swap.out, swap.in]
    .filter((side) => side.asset !== PLS)
    .map((side) => {
      const legs = transaction.gaps.filter(
        (leg) => leg.part === undefined && leg.token === side.asset,
      );
      const net = legs.reduce(
        (sum, leg) => sum + (leg.direction === "in" ? leg.amount : -leg.amount),
        0n,
      );
      return { side, legs, net };
    })
    .filter((one) => one.legs.length > 0);
  const result = { rows: [], questions: [], booked: new Set() };
  for (const one of sides) {
    for (const leg of one.legs) result.booked.add(leg);
    if (one.net === 0n)
      result.questions.push(
        question(
          one.legs,
          "its legs Summ lacks of this token, in and out, add up to nothing",
          env,
        ),
      );
  }
  const rowed = sides.filter((one) => one.net !== 0n);
  for (const one of rowed)
    result.rows.push(swapRow(one, rowed, transaction, swap, env));
  return result;
}

/**
 * The row of one token's side of a swap.
 *
 * @param {object} one - The side, its legs Summ lacks, and their net
 * @param {object[]} rowed - The sides that get rows
 * @param {object} transaction - The transaction
 * @param {object} swap - What it swapped
 * @param {object} env - The wallet, the owner's lists and the chain
 * @returns {{order: number, row: object}} The row, with the log index it
 *   sorts by
 */
function swapRow(one, rowed, transaction, swap, env) {
  const leg = one.legs[0];
  const symbol = csvSymbolOf(env.lists, leg.token, leg.symbol);
  const buy = one.net > 0n;
  const amount = buy ? one.net : -one.net;
  const other = one.side === swap.out ? swap.in : swap.out;
  const otherText = sideText(other, transaction, env);
  const outText = sideText(swap.out, transaction, env);
  const inText = sideText(swap.in, transaction, env);
  const lead = `${buy ? "Buy" : "Sell"} side of a swap of ${outText} for ${inText}.`;
  const otherNote =
    other.asset === PLS
      ? ` The ${otherText} moved without a log, so this file holds no row for it.`
      : rowed.some((side) => side.side === other)
        ? ` The ${buy ? "sell" : "buy"} row of the same hash holds the ${otherText}.`
        : ` Summ holds the ${otherText}.`;
  const partNote =
    amount === one.side.amount
      ? ""
      : ` This row holds the ${amountOf(amount, leg, symbol)} of it Summ lacks.`;
  const summedNote =
    one.legs.length > 1
      ? ` It adds up ${one.legs.length} legs of ${symbol}.`
      : "";
  const wallet = env.wallet;
  const counterparty = leg.counterparty;
  return {
    order: leg.logIndex,
    row: legRow(leg, {
      type: buy ? "buy" : "sell",
      symbol,
      amount,
      from: buy ? counterparty : wallet,
      to: buy ? wallet : counterparty,
      description: `${lead}${otherNote}${partNote}${summedNote}`,
    }),
  };
}

/**
 * Rule 1: a part of a withdrawal from a position.
 *
 * @param {object} group - The legs gathered
 * @param {object} transaction - The transaction
 * @param {object} env - The wallet, the owner's lists and the chain
 * @returns {object|undefined} The booking, or `undefined` when the rule
 *   does not fit
 */
function partRule(group, transaction, env) {
  const leg = group.first;
  if (leg.part === undefined) return undefined;
  const { split } = leg;
  const symbol = csvSymbolOf(env.lists, leg.token, leg.symbol);
  const received = amountOf(split.received, leg, symbol);
  const principal = amountOf(split.principal, leg, symbol);
  const from = leg.counterparty;
  return leg.part === "principal"
    ? {
        type: "remove-liquidity",
        from,
        to: env.wallet,
        text: `Principal of 9mm V3 position #${split.nftId}: of the ${received} it paid out, the ${principal} its DecreaseLiquidity events since its last collect name.`,
      }
    : {
        type: "income",
        from,
        to: env.wallet,
        text: `Fees of 9mm V3 position #${split.nftId}: the ${received} it paid out, less the principal of ${principal}.`,
      };
}

/**
 * Rule 2: a transaction the wallet sent to the position manager.
 *
 * @param {object} group - The legs gathered
 * @param {object} transaction - The transaction
 * @param {object} env - The wallet, the owner's lists and the chain
 * @returns {object|undefined} The booking, or `undefined` when the rule
 *   does not fit
 */
function positionRule(group, transaction, env) {
  if (!transaction.toPositionManager) return undefined;
  const leg = group.first;
  const position = `9mm V3 position${positionNumber(transaction)}`;
  const plsNote = plsDepositNote(transaction, env);
  if (leg.nftId !== undefined) {
    // An NFT the position manager mints or burns; one sent or received in
    // a transfer goes to the rules below, the owner's own wallets among them
    if (leg.counterparty !== ZERO) return undefined;
    return leg.direction === "in"
      ? {
          type: "receive-lp-token",
          from: leg.token,
          to: env.wallet,
          text: `The NFT of 9mm V3 position #${leg.nftId}, which the position manager gave the wallet for the position.${plsNote}`,
        }
      : {
          type: "return-lp-token",
          from: env.wallet,
          to: leg.token,
          text: `The NFT of 9mm V3 position #${leg.nftId}, which left the wallet as the position manager burned it.`,
        };
  }
  if (leg.direction === "out")
    return {
      type: "add-liquidity",
      from: env.wallet,
      to: leg.counterparty,
      text: `Deposit into ${position}.${plsNote}`,
    };
  if (transaction.problem !== undefined)
    return {
      question: `the sweep could not split this collect: ${transaction.problem}`,
    };
  const split = transaction.splits.find(
    (one) => one.token === leg.token && one.principal === 0n,
  );
  if (split === undefined)
    return {
      question:
        "a coin the position manager paid that no collect in this transaction accounts for",
    };
  return {
    type: "income",
    from: leg.counterparty,
    to: env.wallet,
    text: `Fees of 9mm V3 position #${split.nftId}: no principal left the position since its last collect, so all of it is fees.`,
  };
}

/**
 * Rule 3: wrapping or unwrapping PLS.
 *
 * @param {object} group - The legs gathered
 * @param {object} transaction - The transaction
 * @param {object} env - The wallet, the owner's lists and the chain
 * @returns {object|undefined} The booking, or `undefined` when the rule
 *   does not fit
 */
function wrapRule(group, transaction, env) {
  const leg = group.first;
  const pls =
    " The PLS side moved without a log, so this file holds no row for it.";
  if (leg.wrap === "withdrawal")
    return {
      type: "swap-out",
      from: env.wallet,
      to: leg.counterparty,
      text: `Unwrap of WPLS into PLS: the WPLS side.${pls}`,
    };
  if (leg.wrap === "deposit")
    return {
      type: "swap-in",
      from: leg.counterparty,
      to: env.wallet,
      text: `Wrap of PLS into WPLS: the WPLS side.${pls}`,
    };
  return undefined;
}

/**
 * Rule 5: a token on the owner's list of spam, coming in.
 *
 * @param {object} group - The legs gathered
 * @param {object} transaction - The transaction
 * @param {object} env - The wallet, the owner's lists and the chain
 * @returns {object|undefined} The booking, or `undefined` when the rule
 *   does not fit
 */
function spamRule(group, transaction, env) {
  const leg = group.first;
  if (leg.direction !== "in" || !env.lists.spamTokens.has(leg.token))
    return undefined;
  return {
    type: "spam",
    from: leg.counterparty,
    to: env.wallet,
    text: "Spam: the token is on the owner's list of spam tokens.",
  };
}

/**
 * Rule 6: a token from or to one of the owner's other wallets.
 *
 * @param {object} group - The legs gathered
 * @param {object} transaction - The transaction
 * @param {object} env - The wallet, the owner's lists and the chain
 * @returns {object|undefined} The booking, or `undefined` when the rule
 *   does not fit
 */
function ownWalletRule(group, transaction, env) {
  const leg = group.first;
  if (leg.counterparty === env.wallet)
    return { question: "a transfer from the wallet to itself" };
  const name = env.lists.ownWallets.get(leg.counterparty);
  if (name === undefined) return undefined;
  return leg.direction === "in"
    ? {
        type: "receive",
        from: leg.counterparty,
        to: env.wallet,
        text: `Transfer in from the owner's wallet ${name}.`,
      }
    : {
        type: "send",
        from: env.wallet,
        to: leg.counterparty,
        text: `Transfer out to the owner's wallet ${name}.`,
      };
}

/**
 * Rule 7: a token on the owner's list of income tokens, coming in.
 *
 * @param {object} group - The legs gathered
 * @param {object} transaction - The transaction
 * @param {object} env - The wallet, the owner's lists and the chain
 * @returns {object|undefined} The booking, or `undefined` when the rule
 *   does not fit
 */
function incomeRule(group, transaction, env) {
  const leg = group.first;
  if (leg.direction !== "in" || !env.lists.incomeTokens.has(leg.token))
    return undefined;
  return {
    type: "income",
    from: leg.counterparty,
    to: env.wallet,
    text: "Income: the token is on the owner's list of tokens received as income.",
  };
}

/** The rules for legs outside a swap, in the order they are tried. */
const RULES = Object.freeze([
  partRule,
  positionRule,
  wrapRule,
  spamRule,
  ownWalletRule,
  incomeRule,
]);

/**
 * Why no rule settles the legs of one token, one direction and one NFT
 * id in a transaction.
 *
 * @param {object} leg - The first of them
 * @returns {string} The reason
 */
function reasonOf(leg) {
  if (leg.nftId !== undefined) {
    if (leg.counterparty === ZERO)
      return leg.direction === "out"
        ? "an NFT burned, not in a transaction the wallet sent to the position manager"
        : "an NFT minted to the wallet, not in a transaction it sent to the position manager";
    return leg.direction === "out"
      ? "an NFT sent to an address on none of the owner's lists"
      : "an NFT received from an address on none of the owner's lists";
  }
  if (leg.counterparty === ZERO)
    return leg.direction === "out"
      ? "sent to the zero address: a burn or a stake"
      : "minted to the wallet: an airdrop, the end of a stake, or a bridge";
  return leg.direction === "out"
    ? "sent to an address on none of the owner's lists"
    : "received from an address on none of the owner's lists";
}

/**
 * Gathers legs Summ lacks: each part of a split coin alone, and the
 * other legs by token, direction and NFT id.
 *
 * @param {object[]} gaps - The legs
 * @returns {object[]} The groups: `first`, `legs` and `amount`
 */
function gather(gaps) {
  const groups = new Map();
  for (const leg of gaps) {
    const key =
      leg.part === undefined
        ? `${leg.direction} ${leg.token} ${leg.nftId ?? ""}`
        : `${leg.part} ${leg.token}`;
    const group = groups.get(key) ?? { first: leg, legs: [], amount: 0n };
    group.legs.push(leg);
    group.amount += leg.amount;
    groups.set(key, group);
  }
  return [...groups.values()];
}

/**
 * Books one group of legs by the first rule that fits.
 *
 * @param {object} group - The legs gathered
 * @param {object} transaction - The transaction
 * @param {object} env - The wallet, the owner's lists and the chain
 * @returns {{row: object}|{question: object}} Its row, with the log index
 *   it sorts by, or its question
 */
function bookGroup(group, transaction, env) {
  const leg = group.first;
  const symbol = csvSymbolOf(env.lists, leg.token, leg.symbol);
  if (!hasFacts(leg, env))
    return {
      question: question(
        group.legs,
        leg.decimals === null
          ? "its contract gave no decimals"
          : `its contract ${symbolLack(leg.symbol)}, and the owner's settings give none`,
        env,
      ),
    };
  for (const rule of RULES) {
    const booked = rule(group, transaction, env);
    if (booked === undefined) continue;
    if (booked.question !== undefined)
      return { question: question(group.legs, booked.question, env) };
    const summed =
      group.legs.length > 1
        ? ` It adds up ${group.legs.length} legs of ${symbol}.`
        : "";
    return {
      row: {
        order: leg.logIndex,
        row: legRow(leg, {
          type: booked.type,
          symbol,
          amount: group.amount,
          from: booked.from,
          to: booked.to,
          description: `${booked.text}${summed}`,
        }),
      },
    };
  }
  return { question: question(group.legs, reasonOf(leg), env) };
}

/**
 * The rows and questions of one transaction's legs Summ lacks.
 *
 * @param {object} transaction - The transaction: `hash`; `legs`, every
 *   leg the wallet has in it; `gaps`, those Summ lacks; `flow`, its PLS,
 *   when the wallet sent it; `toPositionManager`; `record`, LP Ranger's
 *   record of it; `splits`, its coins of collects; and `problem`, why its
 *   collect could not be split, when it could not
 * @param {object} env - `wallet`; `lists`, the owner's lists; `chain`,
 *   the chain's facts, `positionManager` among them; every address in
 *   EIP-55's mixed case
 * @returns {{rows: object[], questions: object[]}} The rows, each with the
 *   log index it sorts by, and the questions
 */
export function transactionGaps(transaction, env) {
  const swap = swapOf(transaction, env);
  const swapped =
    swap === null
      ? { rows: [], questions: [], booked: new Set() }
      : swapRows(transaction, swap, env);
  const rest = transaction.gaps.filter((leg) => !swapped.booked.has(leg));
  const result = { rows: swapped.rows, questions: swapped.questions };
  for (const group of gather(rest)) {
    const booked = bookGroup(group, transaction, env);
    if (booked.row !== undefined) result.rows.push(booked.row);
    else result.questions.push(booked.question);
  }
  return result;
}
