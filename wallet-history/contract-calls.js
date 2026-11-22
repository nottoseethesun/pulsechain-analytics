/**
 * Whether an error ethers threw for a contract call is the contract's own
 * refusal, or the endpoint failing.
 * @module wallet-history/contract-calls
 *
 * What: ethers throws a CALL_EXCEPTION for every error answer an endpoint
 * gives to `eth_call` (`JsonRpcApiProvider.getRpcError`). Two are the
 * contract's answer: a revert, and an error of the EVM, the Ethereum
 * Virtual Machine that runs a contract's code, such as an invalid opcode,
 * which stops the code where it stands. The others are the endpoint's own
 * failures, such as a rate limit, its limit on a call's time or a past
 * state it no longer holds, which say nothing of the contract.
 * `contractRefused` tells the contract's answers apart: a revert carries
 * the data the contract reverted with, or the endpoint's message says the
 * call reverted; an error of the EVM is the endpoint's message, worded as
 * geth, the Ethereum node program that PulseChain's node, go-pulse, is
 * built from, words it. `endpointFailure` turns any other error into one
 * that names the call and gives the endpoint's own message.
 *
 * Fit: `wallet-history/receipts.js` reads a token's symbol and decimals
 * with them, and `summ-sweep/owed.js` the coins a position was owed.
 */

/** Hex digits after 0x, as revert data is written. */
const HEX_DIGITS = /^0x[0-9a-fA-F]+$/;

/**
 * Whether a value is revert data: 0x and at least one whole byte.
 *
 * @param {*} data - The value
 * @returns {boolean} Whether it is
 */
function isRevertData(data) {
  return (
    typeof data === "string" && HEX_DIGITS.test(data) && data.length % 2 === 0
  );
}

/**
 * The errors of the EVM that stop a contract's code, as geth words them:
 * an invalid opcode, a jump to no jump destination, the gas run out, a
 * stack too short or too deep, a write in a call that may not write, a
 * read past the data a call returned, and calls nested past the limit.
 */
const EVM_ERRORS =
  /^(invalid opcode|invalid jump destination|out of gas|stack underflow|stack limit reached|write protection|return data out of bounds|max call depth exceeded)/i;

/**
 * Whether ethers' error for a call is the contract's refusal: a revert, or
 * an error of the EVM that stopped the contract's code.
 *
 * @param {*} thrown - What the call threw
 * @returns {boolean} True for either; false for any other error, an
 *   endpoint's failure among them
 */
export function contractRefused(thrown) {
  if (typeof thrown !== "object" || thrown === null) return false;
  if (thrown.code !== "CALL_EXCEPTION") return false;
  if (isRevertData(thrown.data)) return true;
  const message = thrown.info?.error?.message;
  if (typeof message !== "string") return false;
  return /revert/i.test(message) || EVM_ERRORS.test(message);
}

/**
 * An error for a call the endpoint failed, naming the call and giving the
 * endpoint's own message.
 *
 * @param {*} thrown - What the call threw
 * @param {string} call - The call, as the error names it
 * @returns {Error} The error, with the one thrown as its cause
 */
export function endpointFailure(thrown, call) {
  const message =
    thrown?.info?.error?.message ?? thrown?.message ?? String(thrown);
  return new Error(`The endpoint failed ${call}: ${message}`, {
    cause: thrown,
  });
}
