#!/usr/bin/env node
/* build-cooccur-sample.js — generates cooccur-sample.json, the MOCK result set
 * for the keyword co-occurrence bubble chart (cooccur.js).
 *
 * Shape mirrors filmtvChart's pre-aggregated input, plus a `keyword` (the
 * searched term X) used in the chart title:
 *   { keyword, years:[...], series:[ { key, label, total, counts:[per-year] } ] }
 * series is the 10 keywords most often co-mentioned with X, desc by total.
 *
 * Distributions are MULTI-PEAK (a few Gaussian bumps + light noise per keyword)
 * so the rows fluctuate like the real archive ridgelines, with bigger totals.
 * Each keyword's per-year counts sum EXACTLY to its total (largest-remainder
 * rounding). Purely sample data — the backend replaces this file with the real
 * aggregation.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const KEYWORD = "楚原"; // searched term X (keywords/labels kept from before)

// [label, total, winStart, winEnd, nBumps] — totals bumped up to the reference's
// scale (343…114); window = roughly active years; nBumps = how many peaks.
const SPEC = [
  ["張寶堅", 343, 1965, 1996, 4],
  ["邵氏兄弟香港有限公司", 329, 1968, 1993, 3],
  ["井莉", 286, 1969, 1991, 3],
  ["謝賢", 175, 1963, 1989, 3],
  ["南紅", 164, 1961, 1986, 3],
  ["羅烈", 148, 1970, 1991, 2],
  ["何守信", 145, 1971, 1994, 3],
  ["古龍", 122, 1972, 1987, 2],
  ["張瑛", 118, 1958, 1983, 3],
  ["余安安", 114, 1973, 1993, 2]
];

const Y0 = 1955, Y1 = 1997;
const years = [];
for (let y = Y0; y <= Y1; y++) years.push(y);

// deterministic PRNG so the sample is stable across runs
let seed = 20260625;
function rand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

function distribute(total, winStart, winEnd, nBumps) {
  // scatter nBumps Gaussian peaks across the active window, varied height/width
  const bumps = [];
  for (let b = 0; b < nBumps; b++) {
    bumps.push({
      center: winStart + rand() * (winEnd - winStart),
      width: 1.6 + rand() * 2.6,
      amp: 0.45 + rand() * 1.1
    });
  }
  const w = years.map((y) => {
    let v = 0;
    for (const b of bumps) v += b.amp * Math.exp(-Math.pow((y - b.center) / b.width, 2));
    if (y >= winStart - 1 && y <= winEnd + 1) v += 0.06 * rand(); // light baseline fluctuation
    return Math.max(0, v);
  });
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  const raw = w.map((x) => (x / sum) * total);
  const base = raw.map(Math.floor);
  let used = base.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (used < total) { base[order[k % order.length].i]++; used++; k++; }
  return base;
}

const series = SPEC
  .map(([label, total, ws, we, nb]) => ({
    key: label,            // backend may swap in a stable keyword id
    label,
    total,
    counts: distribute(total, ws, we, nb)
  }))
  .sort((a, b) => b.total - a.total);

const out = { keyword: KEYWORD, years, series };
const dest = path.join(__dirname, "cooccur-sample.json");
fs.writeFileSync(dest, JSON.stringify(out));

// sanity: every series sums to its total
const bad = series.filter((s) => s.counts.reduce((a, b) => a + b, 0) !== s.total);
console.log("wrote", dest, "· series:", series.length, "· years:", years.length,
  "· sum mismatches:", bad.length);
series.forEach((s) => console.log(
  `  ${s.label.padEnd(12)} total=${String(s.total).padStart(3)}  peak/yr=${Math.max(...s.counts)}  activeYears=${s.counts.filter((c) => c > 0).length}`));
