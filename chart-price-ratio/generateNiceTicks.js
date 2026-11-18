/**
 * The y-axis' values for the ratio chart: round numbers, each one a label
 * no other repeats.
 * @module chart-price-ratio/generateNiceTicks
 */

/**
 * Generate nice tick values for y-axis (unique, human-readable numbers).
 * The ratio chart (`pulse-token-ratio.js`) labels its y-axis with them.
 * @param {number} min
 * @param {number} max
 * @param {number} tickCount Approx number of ticks desired (default 10)
 * @returns {Array<number>} Array of tick values
 */
export function generateNiceTicks(min, max, tickCount = 10) {
  if (min === max) return [min];

  const range = max - min;
  const roughStep = range / (tickCount - 1);

  let step = Math.pow(10, Math.floor(Math.log10(roughStep)));
  if (roughStep / step > 5) step *= 5;
  else if (roughStep / step > 2) step *= 2;

  // Ensure step is at least a small fraction of range
  step = Math.max(step, range / 1000);

  // Start from a multiple of step near min
  let start = Math.floor(min / step) * step;
  if (start < min) start += step;

  const ticks = [];
  for (let val = start; val <= max + step / 2; val += step) {
    if (val >= min - step / 10) {
      ticks.push(val);
    }
  }

  // Force include min and max if they're reasonably close
  if (Math.abs(ticks[0] - min) > step / 10) {
    ticks.unshift(min);
  }
  if (Math.abs(ticks[ticks.length - 1] - max) > step / 10) {
    ticks.push(max);
  }

  // Deduplicate and sort just in case
  const uniqueTicks = [...new Set(ticks.map((v) => Number(v.toFixed(15))))]; // Avoid floating point duplicates
  uniqueTicks.sort((a, b) => a - b);

  return uniqueTicks;
}
