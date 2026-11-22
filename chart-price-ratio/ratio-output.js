/**
 * How the ratio chart prints: the title, the chart with its axes' labels,
 * the last ten ratios and the current one, and the CSV.
 * @module chart-price-ratio/ratio-output
 *
 * The chart draws one column for each point, and spans at least
 * `MIN_CHART_COLUMNS` columns: its x-axis spaces four to ten dates under
 * its columns, each date ten characters wide, or sixteen with its hour, and
 * fewer columns leave the dates no room. A series of fewer points is drawn
 * wider: each point takes the same number of columns, and the columns
 * between two points step from the one's ratio to the other's, so the line
 * joins them straight. A run of one point, a current price, prints no
 * chart.
 */

import asciichart from "asciichart";
import fs from "fs";
import { generateNiceTicks } from "./generateNiceTicks.js";

/** The fewest columns the chart is drawn across. */
export const MIN_CHART_COLUMNS = 90;

/**
 * The days of daily candles GeckoTerminal's free api serves for a pool
 * older than that: 184, as it gave on 2026-11-21. A weekly chart from it
 * has at most this many days' worth of points.
 */
export const GECKOTERMINAL_FREE_DAYS = 184;

/**
 * The columns the chart draws a series across: the points themselves, or,
 * for a series too short to span `MIN_CHART_COLUMNS`, each point widened to
 * the same number of columns, with the columns between two points stepping
 * from the one's ratio to the other's.
 *
 * @param {Array<number>} ratios - The ratios, oldest first, at least two
 * @returns {{columns: Array<number>, width: number}} The columns' values, and the columns from one point to the next
 */
export function chartColumns(ratios) {
  const width = Math.max(
    1,
    Math.ceil((MIN_CHART_COLUMNS - 1) / (ratios.length - 1)),
  );
  const columns = ratios.slice(0, -1).flatMap((ratio, i) => {
    const next = ratios[i + 1];
    return Array.from(
      { length: width },
      (_, step) => ratio + ((next - ratio) * step) / width,
    );
  });
  columns.push(ratios[ratios.length - 1]);
  return { columns, width };
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
    return formatted;
  };
}

/**
 * A time as the chart and its rows name it: its day, as YYYY-MM-DD in UTC,
 * and, for an hourly run, its hour too, as YYYY-MM-DD HH:MM.
 *
 * @param {number} timestamp - The time, in milliseconds since 1970
 * @param {string} interval - The run's interval: hourly names the hour
 * @returns {string} The time's name
 */
export function timeLabel(timestamp, interval) {
  const iso = new Date(timestamp).toISOString();
  return interval === "hourly"
    ? iso.replace("T", " ").slice(0, 16)
    : iso.split("T")[0];
}

/**
 * Builds the x-axis' line: sparse dates, or dates and hours, each under the
 * column of the point it names.
 *
 * @param {string} interval - The interval: hourly labels carry the hour
 * @param {Array<number>} chronologicalTimestamps - The points' times, oldest first
 * @param {number} width - The columns from one point to the next (`chartColumns`)
 * @returns {string} The labels, spaced to their columns
 */
function xAxisLine(interval, chronologicalTimestamps, width) {
  const points = chronologicalTimestamps.length;
  const columns = (points - 1) * width + 1;
  const labelCount = Math.min(points, 10, Math.max(4, Math.ceil(columns / 30)));
  const step = Math.floor((points - 1) / (labelCount - 1));

  const labels = [];
  for (let i = 0; i < labelCount - 1; i++) {
    labels.push({
      idx: i * step * width,
      ts: chronologicalTimestamps[i * step],
    });
  }
  labels.push({
    idx: (points - 1) * width,
    ts: chronologicalTimestamps[points - 1],
  });

  const labelTexts = labels.map((l) => timeLabel(l.ts, interval));

  let xAxis = "";
  let prevEnd = 0;
  for (let i = 0; i < labels.length; i++) {
    const { idx } = labels[i];
    const text = labelTexts[i];
    // A label that would run into the one before it is left out
    if (idx < prevEnd + 1 && i > 0) continue;
    xAxis += " ".repeat(idx - prevEnd) + text;
    prevEnd = idx + text.length;
  }
  return xAxis;
}

/**
 * Prints the chart of the ratios, oldest left, newest right.
 *
 * @param {string} interval - The interval
 * @param {Array<number>} chronologicalRatios - The ratios, oldest first
 * @param {Array<number>} chronologicalTimestamps - Their times, oldest first
 */
function printChart(interval, chronologicalRatios, chronologicalTimestamps) {
  const { columns, width } = chartColumns(chronologicalRatios);
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

  const chartLines = asciichart.plot(columns, chartConfig).split("\n");
  chartLines.forEach((line) => console.log(line));

  const yTickWidth = maxLabelLength + 2;
  const xAxis = xAxisLine(interval, chronologicalTimestamps, width);
  console.log(" ".repeat(yTickWidth) + xAxis);
}

/**
 * Prints the ratios: the title, for a weekly chart from GeckoTerminal the
 * most points it can have, the chart or a note that there is one point, the
 * last ten and the current one, and writes the CSV when asked.
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
  if (run.interval === "weekly" && source.startsWith("GeckoTerminal")) {
    const most = Math.ceil(GECKOTERMINAL_FREE_DAYS / run.weeklyResampleDays);
    console.log(
      `GeckoTerminal's free api serves about the last ${GECKOTERMINAL_FREE_DAYS} days of candles, so the weekly chart shows at most ${most} points.\n`,
    );
  }

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
