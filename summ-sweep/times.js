/**
 * Times as the Summ sweep reads and writes them: days and times in UTC.
 * @module summ-sweep/times
 *
 * What: the sweep's command line takes days as `YYYY-MM-DD` and a time as
 * `YYYY-MM-DD HH:MM:SS`, both in UTC, and the rows' notes write a time the
 * second way. `secondsOfTime` reads a time into seconds since 1970,
 * `timeText` writes seconds back as a time, and `dayText` a day's start
 * back as a day; a day is read by crypto-price-fetchers' `dayStartSeconds`
 * (`crypto-price-fetchers/lib/calendar-day`).
 *
 * How: a time is read with `Date.parse`, as an ISO time in UTC, and kept
 * only when writing the seconds back gives the same text, so a time on a
 * day that does not exist, such as `2026-02-30`, or an hour past 23, is
 * refused rather than moved to a nearby day.
 *
 * Fit: `summ-sweep/command-line.js` reads its options with it and names
 * the days of a refusal with it, and `summ-sweep/gaps.js` writes the time
 * in a row's note.
 */

/**
 * A time as the rows' notes write it.
 *
 * @param {number} seconds - Seconds since 1970
 * @returns {string} Such as `2026-11-04 19:22:55`, in UTC
 */
export function timeText(seconds) {
  return new Date(seconds * 1000).toISOString().slice(0, 19).replace("T", " ");
}

/**
 * A day as the command line takes it.
 *
 * @param {number} seconds - The seconds since 1970 of the day's start
 * @returns {string} Such as `2026-11-04`, in UTC
 */
export function dayText(seconds) {
  return timeText(seconds).slice(0, 10);
}

/**
 * The seconds since 1970 of a time in UTC.
 *
 * @param {string} text - The time, as `YYYY-MM-DD HH:MM:SS`
 * @returns {number|null} The seconds; `null` when the text is no real time
 *   written that way
 */
export function secondsOfTime(text) {
  const seconds = Date.parse(`${text.replace(" ", "T")}Z`) / 1000;
  if (!Number.isFinite(seconds)) return null;
  return timeText(seconds) === text ? seconds : null;
}
