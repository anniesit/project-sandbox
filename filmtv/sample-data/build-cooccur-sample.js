#!/usr/bin/env node
/* build-cooccur-sample.js — generates cooccur-sample.json, the MOCK result set
 * for the keyword co-occurrence bubble chart (cooccur.js).
 *
 * Shape mirrors filmtvChart's pre-aggregated input, plus a `keyword` (the
 * searched term X) used in the chart title:
 *   { keyword, years:[...], series:[ { key, label, total, counts:[per-year] } ] }
 * series is the 10 keywords most often co-mentioned with X, desc by total.
 *
 * Counts are synthesised so each keyword's per-year counts sum EXACTLY to its
 * total, with a Gaussian-ish profile (matches the archive's ~1978 peak). Purely
 * sample data — the backend replaces this file with the real aggregation.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const KEYWORD = "楚原"; // searched term X (matches the reference chart)

// [label, total, peakYear, spread] — totals match the reference screenshot.
const SPEC = [
  ["張寶堅", 265, 1980, 16],   // broad, decades-long presence
  ["邵氏兄弟香港有限公司", 60, 1978, 5],
  ["井莉", 42, 1977, 4],
  ["謝賢", 35, 1972, 9],
  ["南紅", 32, 1968, 7],
  ["羅烈", 27, 1978, 3],
  ["何守信", 26, 1983, 5],
  ["古龍", 26, 1978, 2],
  ["張瑛", 26, 1971, 8],
  ["余安安", 24, 1979, 2]
];

const Y0 = 1955, Y1 = 1997;
const years = [];
for (let y = Y0; y <= Y1; y++) years.push(y);

// deterministic PRNG so the sample is stable across runs
let seed = 20260624;
function rand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

function distribute(total, peak, spread) {
  // gaussian weight per year + light noise, then largest-remainder rounding so
  // the integer counts sum to exactly `total`.
  const w = years.map((y) => {
    const g = Math.exp(-Math.pow((y - peak) / spread, 2));
    return Math.max(0, g * (0.85 + 0.3 * rand()));
  });
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  const raw = w.map((x) => (x / sum) * total);
  const base = raw.map(Math.floor);
  let used = base.reduce((a, b) => a + b, 0);
  // hand out the remaining units to the largest fractional parts
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (used < total) { base[order[k % order.length].i]++; used++; k++; }
  return base;
}

const series = SPEC
  .map(([label, total, peak, spread]) => ({
    key: label,            // backend may swap in a stable keyword id
    label,
    total,
    counts: distribute(total, peak, spread)
  }))
  .sort((a, b) => b.total - a.total);

const out = { keyword: KEYWORD, years, series };
const dest = path.join(__dirname, "cooccur-sample.json");
fs.writeFileSync(dest, JSON.stringify(out));

// sanity: every series sums to its total
const bad = series.filter((s) => s.counts.reduce((a, b) => a + b, 0) !== s.total);
console.log("wrote", dest, "· series:", series.length, "· years:", years.length,
  "· sum mismatches:", bad.length);
