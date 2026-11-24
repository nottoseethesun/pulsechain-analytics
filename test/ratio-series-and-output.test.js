/**
 * Tests for the parts of the ratio chart that turn the two series into
 * its rows and its chart: `ratioRows` (`chart-price-ratio/ratio-series.js`),
 * which dates each row and writes its prices and ratio, and the y-axis
 * `printRatios` (`chart-price-ratio/ratio-output.js`) draws. The chart run
 * whole is tested in `pulse-token-ratio.test.js`.
 * @module test/ratio-series-and-output.test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ratioRows } from "../chart-price-ratio/ratio-series.js";
import { printRatios } from "../chart-price-ratio/ratio-output.js";

describe("ratioRows", () => {
  const hour = 3600000;
  const start = Date.UTC(2026, 0, 1, 10);
  const series = [
    { timestamp: start, close: 2 },
    { timestamp: start + hour, close: 3 },
  ];

  it("dates an hourly run's rows with each one's hour, in UTC", () => {
    const { rows } = ratioRows(series, series, "hourly");
    assert.deepEqual(
      rows.map((row) => row.date),
      ["2026-01-01 10:00", "2026-01-01 11:00"],
    );
  });

  it("dates a daily run's rows with their day", () => {
    const { rows } = ratioRows(series, series, "daily");
    assert.deepEqual(
      rows.map((row) => row.date),
      ["2026-01-01", "2026-01-01"],
    );
  });

  it("writes a price or a ratio below a millionth with its digits, rather than as 0, and one from a millionth up to 12 decimal places", () => {
    const day = 86400000;
    const dataA = [3e-13, 1.23456789e-10, 2].map((close, index) => ({
      timestamp: start + index * day,
      close,
    }));
    const dataB = dataA.map(({ timestamp }) => ({ timestamp, close: 1 }));
    const tiny = ratioRows(dataA, dataB, "daily");
    assert.deepEqual(
      tiny.rows.map((row) => [row.priceA, row.ratio]),
      [
        ["3.00000000000e-13", "3.00000000000e-13"],
        ["1.23456789000e-10", "1.23456789000e-10"],
        ["2.000000000000", "2.000000000000"],
      ],
    );
    const lines = [];
    printRatios(
      { interval: "daily", tokenA: "0xA", tokenB: "0xB", saveCsv: false },
      ["A", "B"],
      "GeckoTerminal",
      {
        ...tiny,
        ratios: tiny.ratios.slice(0, 2),
        timestamps: tiny.timestamps.slice(0, 2),
      },
      (line) => lines.push(line),
    );
    assert.ok(
      lines.includes("\nCurrent ratio: 1.23456789000e-10"),
      lines.join("\n"),
    );
  });
});

/**
 * The lines the ratio chart prints for a daily series, read through its
 * print seam.
 *
 * @param {number[]} ratios - The ratios, oldest first
 * @returns {string[]} The lines, each split at its line breaks
 */
function chartLines(ratios) {
  const lines = [];
  printRatios(
    { interval: "daily", tokenA: "0xA", tokenB: "0xB", saveCsv: false },
    ["A", "B"],
    "GeckoTerminal",
    {
      rows: ratios.map((ratio) => ({ date: "", ratio: String(ratio) })),
      ratios,
      timestamps: ratios.map((_, at) => Date.UTC(2026, 0, 1 + at)),
    },
    (line) => lines.push(...String(line).split("\n")),
  );
  return lines;
}

describe("the chart's y-axis", () => {
  it("stands in one column on every row, each label padded to the longest the chart draws", () => {
    const ratios = Array.from({ length: 40 }, (_, at) => 0.5 + (1.2 * at) / 39);
    const timestamps = ratios.map((_, at) => Date.UTC(2026, 0, 1 + at));
    const lines = [];
    printRatios(
      { interval: "daily", tokenA: "0xA", tokenB: "0xB", saveCsv: false },
      ["A", "B"],
      "GeckoTerminal",
      {
        rows: ratios.map((ratio) => ({ date: "", ratio: String(ratio) })),
        ratios,
        timestamps,
      },
      (line) => lines.push(line),
    );
    const columns = lines
      .flatMap((line) => line.split("\n"))
      .map((line) => line.search(/[┤┼]/))
      .filter((at) => at >= 0);
    assert.ok(columns.length > 10);
    assert.equal(
      new Set(columns).size,
      1,
      `axis columns ${[...new Set(columns)]}`,
    );
  });

  it("labels a series whose ratios are all the same with that ratio, not with asciichart's number for its one row", () => {
    const ratios = [0.5, 0.5, 0.5, 0.5];
    const axis = chartLines(ratios).filter((line) => /[┤┼]/.test(line));
    assert.equal(axis.length, 1);
    const label = axis[0].slice(0, axis[0].search(/[┤┼]/)).trim();
    assert.equal(label, "0.5");
  });

  it("labels each row with a value of its own when the range is under 0.00001, near 1 as near 0", () => {
    for (const low of [1, 0.000001]) {
      const ratios = Array.from(
        { length: 40 },
        (_, at) => low + (low * 0.000005 * at) / 39,
      );
      const labels = chartLines(ratios)
        .filter((line) => /[┤┼]/.test(line))
        .map((line) => line.slice(0, line.search(/[┤┼]/)).trim());
      assert.equal(labels.length, 31);
      assert.equal(new Set(labels).size, 31, labels.join(" "));
    }
  });
});
