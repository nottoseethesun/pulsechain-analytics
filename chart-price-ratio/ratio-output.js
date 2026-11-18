/**
 * How the ratio chart prints: the title, the chart with its axes' labels,
 * the last ten ratios and the current one, and the CSV.
 * @module chart-price-ratio/ratio-output
 *
 * The chart needs `MIN_CHART_POINTS` points or more: its x-axis spaces four
 * to ten dates under its columns, each date ten characters wide, or
 * sixteen with its hour, so fewer points leave the dates no room. A run
 * with more than one point and fewer than that stops before it prints,
 * with `tooFewPointsMessage`; a run of one point, a current price, prints
 * no chart.
 */

import asciichart from "asciichart";
import fs from "fs";
import { generateNiceTicks } from "./generateNiceTicks.js";

/** The fewest points the chart draws. */
export const MIN_CHART_POINTS = 90;

/**
 * Says why a run of too few points draws no chart, and what gives more.
 *
 * @param {number} count - The points the run has
 * @param {string} interval - The interval asked: hourly, daily or weekly
 * @returns {string} The message
 */
export function tooFewPointsMessage(count, interval) {
  const more = {
    weekly: "A shorter interval, daily or hourly, gives more.",
    daily: "The hourly interval gives more.",
    hourly: "The pools have too little history for a chart.",
  }[interval];
  return `Only ${count} points could be worked out, too few to chart: the chart needs at least ${MIN_CHART_POINTS}. ${more}`;
}

/**
 * Builds the y-axis' label for a value, with the precision the chart's
 * range needs.
 *
 * @param {number} range - The highest ratio less the lowest
 * @returns {function(number): string} The label for a value
 */
function yLabelFormat(range) {
  return (value) => {
    let precision = 6;
    if (range < 0.01) precision = 8;
    if (range < 0.001) precision = 10;
    if (range < 0.0001) precision = 12;
    if (range < 0.00001) {
      return value.toExponential(4);
    }

    let formatted = value.toFixed(precision);
    formatted = formatted.replace(/0+$/, "");
    if (formatted.endsWith(".")) formatted = formatted.slice(0, -1);
    return formatted || "0";
  };
}

/**
 * Builds the x-axis' line: sparse dates, or dates and hours, under the
 * chart's columns.
 *
 * @param {string} interval - The interval: hourly labels carry the hour
 * @param {Array<number>} chronologicalRatios - The ratios, oldest first
 * @param {Array<number>} chronologicalTimestamps - Their times, oldest first
 * @returns {string} The labels, spaced to their columns
 */
function xAxisLine(interval, chronologicalRatios, chronologicalTimestamps) {
  const maxLabels = 10;
  const minLabels = 4;
  const labelCount = Math.min(
    maxLabels,
    Math.max(minLabels, Math.ceil(chronologicalRatios.length / 30)),
  );
  const step = Math.floor((chronologicalRatios.length - 1) / (labelCount - 1));

  const labels = [];
  for (let i = 0; i < labelCount - 1; i++) {
    labels.push({ idx: i * step, ts: chronologicalTimestamps[i * step] });
  }
  labels.push({
    idx: chronologicalRatios.length - 1,
    ts: chronologicalTimestamps[chronologicalTimestamps.length - 1],
  });

  const formatLabel = (ts) => {
    const d = new Date(ts);
    if (interval === "hourly") {
      return d.toISOString().replace("T", " ").slice(0, 16);
    }
    return d.toISOString().split("T")[0];
  };

  const labelTexts = labels.map((l) => formatLabel(l.ts));

  let xAxis = "";
  let prevEnd = 0;
  for (let i = 0; i < labels.length; i++) {
    const { idx } = labels[i];
    const text = labelTexts[i];
    const padding = idx - prevEnd;
    xAxis += " ".repeat(padding) + text;
    prevEnd = idx + text.length;
  }
  return xAxis;
}

/**
 * Prints the chart of the ratios, oldest left, newest right.
 *
 * @param {string} interval - The interval
 * @param {Array<number>} ratios - The ratios, newest first
 * @param {Array<number>} timestamps - Their times, newest first
 */
function printChart(interval, ratios, timestamps) {
  // Reverse data for chronological order (oldest left → newest right)
  const chronologicalRatios = ratios.slice().reverse();
  const chronologicalTimestamps = timestamps.slice().reverse();

  const minRatio = Math.min(...chronologicalRatios);
  const maxRatio = Math.max(...chronologicalRatios);
  const formatYRaw = yLabelFormat(maxRatio - minRatio);

  const testTicks = generateNiceTicks(minRatio, maxRatio, 10);
  const rawLabels = testTicks.map(formatYRaw);
  const maxLabelLength = Math.max(...rawLabels.map((l) => l.length), 1);

  const formatY = (value) => {
    const raw = formatYRaw(value);
    return raw.padEnd(maxLabelLength, " ");
  };

  const chartConfig = {
    height: 30,
    min: minRatio,
    max: maxRatio,
    format: formatY,
  };

  const chartLines = asciichart
    .plot(chronologicalRatios, chartConfig)
    .split("\n");
  chartLines.forEach((line) => console.log(line));

  const yTickWidth = maxLabelLength + 2;
  const xAxis = xAxisLine(
    interval,
    chronologicalRatios,
    chronologicalTimestamps,
  );
  console.log(" ".repeat(yTickWidth) + xAxis);
}

/**
 * Prints the ratios: the title, the chart or a note that there is one
 * point, the last ten and the current one, and writes the CSV when asked.
 *
 * @param {Object} run - The run's settings
 * @param {Array<string>} names - Token A's name and token B's
 * @param {string} source - Where the prices came from
 * @param {{rows: Array<Object>, ratios: Array<number>, timestamps: Array<number>}} series - The ratios
 */
export function printRatios(run, names, source, { rows, ratios, timestamps }) {
  const [tokenAName, tokenBName] = names;
  const pointsText =
    ratios.length === 1 ? "current only" : `${ratios.length} points`;
  const intervalText = run.useDexToolsOnly ? "current" : run.interval;

  console.log(
    `\n${tokenAName} / ${tokenBName} ratio (${intervalText}, ${pointsText}) - Source: ${source}`,
  );
  console.log(`C.A.: ${run.tokenA} / ${run.tokenB}\n`);

  if (ratios.length > 1) {
    printChart(run.interval, ratios, timestamps);
  } else {
    console.log("(Single data point - no historical chart available)");
    if (!run.useDexToolsOnly) {
      console.log(
        "Note: This often occurs with new or low-volume pools. Try a shorter interval.\n",
      );
    }
  }

  console.log("\nRecent ratios (last 10):");
  rows.slice(-10).forEach((r) => console.log(`${r.date}: ${r.ratio}`));
  console.log(`\nCurrent ratio: ${ratios[ratios.length - 1].toFixed(12)}`);

  if (run.saveCsv) {
    const csv =
      "date,price_tokenA,price_tokenB,ratio\n" +
      rows
        .map((r) => `${r.date},${r.priceA},${r.priceB},${r.ratio}`)
        .join("\n");
    fs.writeFileSync(run.csvFilename, csv);
    console.log(`\nCSV saved as ${run.csvFilename}`);
  }
}
