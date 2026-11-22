/**
 * The coins each 9mm V3 position was owed when the swept range began.
 * @module summ-sweep/owed
 *
 * What: a withdrawal from a position can take two transactions: a
 * DecreaseLiquidity, which takes principal out of the pool's liquidity,
 * and a later Collect, which pays it out with the fees. The position
 * manager adds what a DecreaseLiquidity takes out to the coins the
 * position is owed, `tokensOwed0` and `tokensOwed1` of its
 * `positions(tokenId)`, and a Collect pays them out. So a position owed
 * coins when the range began can pay principal from a DecreaseLiquidity
 * before the range in its first Collect within it, which the range's own
 * events do not show. The sweep reports that collect and books none of it
 * (`splitCollects`, `summ-sweep/positions.js`), as the owner's skill for
 * missing transactions asks of a collect whose principal is not known.
 *
 * How: each position is asked at the block before the range, which needs
 * an endpoint that keeps past state. A call the position manager refuses,
 * or answers with nothing, as it does for an NFT not yet minted, means the
 * position was owed nothing.
 *
 * Fit: the sweep asks for each position collected in the range that was
 * not minted within it (`summ-sweep/sweep.js`).
 */

import { Interface } from "ethers";

/** The position manager's `positions`, as its contract declares it. */
const POSITION_MANAGER = new Interface([
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
]);

/**
 * The coins one position was owed at a block.
 *
 * @param {{ask: function}} paced - The paced provider
 * @param {string} positionManager - The position manager's contract
 * @param {string} nftId - The position's NFT id, as digits
 * @param {number} block - The block
 * @returns {Promise<bigint[]>} The two coins owed, in the pool's order
 * @throws {Error} When the endpoint fails, which is not the contract's
 *   answer
 */
async function owedAt(paced, positionManager, nftId, block) {
  let answer;
  try {
    answer = await paced.ask("call", {
      to: positionManager,
      data: POSITION_MANAGER.encodeFunctionData("positions", [BigInt(nftId)]),
      blockTag: block,
    });
  } catch (thrown) {
    if (
      typeof thrown === "object" &&
      thrown !== null &&
      thrown.code === "CALL_EXCEPTION"
    )
      return [0n, 0n];
    throw thrown;
  }
  if (answer === "0x") return [0n, 0n];
  const position = POSITION_MANAGER.decodeFunctionResult("positions", answer);
  return [position.tokensOwed0, position.tokensOwed1];
}

/**
 * The coins each position was owed when the range began, for the
 * positions owed any.
 *
 * @param {{ask: function}} paced - The paced provider, of an endpoint that
 *   keeps past state
 * @param {object} asking - What to ask
 * @param {string} asking.positionManager - The position manager's contract
 * @param {string[]} asking.nftIds - The positions, by NFT id, once each
 * @param {number} asking.fromBlock - The range's first block
 * @returns {Promise<Map<string, bigint[]>>} The two coins owed, by NFT id,
 *   of each position owed any
 */
export async function owedWhenRangeBegan(
  paced,
  { positionManager, nftIds, fromBlock },
) {
  const owed = new Map();
  if (fromBlock === 0) return owed;
  for (const nftId of nftIds) {
    const coins = await owedAt(paced, positionManager, nftId, fromBlock - 1);
    if (coins[0] > 0n || coins[1] > 0n) owed.set(nftId, coins);
  }
  return owed;
}
