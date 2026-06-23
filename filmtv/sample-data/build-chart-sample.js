/* ============================================================
 * build-chart-sample.js — generates chart-sample.json
 *
 * A synthetic, reproducible result set for building/testing the
 * year-by-publication stacked bar chart (chart.js). It mirrors the
 * REAL data shape ({ counts, imageBase, items[] }) so the chart can be
 * fed the exact same payload the backend will send to results.js.
 *
 * Why synthetic: the shipped sample (2922.json) only covers 3 years.
 * The live database spans 1920–1997, so we fabricate several publications
 * with overlapping life-spans to exercise the stacking, the dynamic
 * y-axis, the legend toggles, and the per-year hover tooltip.
 *
 * Publication = first 3 chars of an entry id (e.g. "FMP-120504" -> "FMP").
 * Each publication below owns a unique 3-letter prefix + a journal name;
 * the chart derives its legend label from the journal field.
 *
 * Run:  node build-chart-sample.js   (writes ./chart-sample.json)
 * ============================================================ */
"use strict";

var fs = require("fs");
var path = require("path");

/* deterministic PRNG so the dataset is identical on every run */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
var rand = mulberry32(20250623);

/* prefix · journal · first year · last year · peak year · peak entries/year.
   The bell curve below makes each title rise toward its peak and taper off,
   so the stack composition shifts realistically across the decades. */
var PUBLICATIONS = [
  { prefix: "DHB", journal: "電影畫報", start: 1920, end: 1958, peak: 1936, height: 17 },
  { prefix: "MXB", journal: "明星畫報", start: 1926, end: 1965, peak: 1948, height: 21 },
  { prefix: "FMP", journal: "電影特刊", start: 1930, end: 1972, peak: 1955, height: 28 },
  { prefix: "YWJ", journal: "藝文雜誌", start: 1938, end: 1985, peak: 1962, height: 15 },
  { prefix: "GSK", journal: "歌聲季刊", start: 1945, end: 1988, peak: 1969, height: 13 },
  { prefix: "TVW", journal: "香港電視", start: 1960, end: 1997, peak: 1983, height: 32 },
  { prefix: "SDY", journal: "新電影", start: 1972, end: 1997, peak: 1990, height: 22 }
];

var TYPES = ["1", "2", "4", "5", "6", "9", "11", "14", "21", "28"];
var MONTHS = ["01", "03", "05", "07", "09", "11"];

function bell(year, peak, sigma) {
  var d = year - peak;
  return Math.exp(-(d * d) / (2 * sigma * sigma));
}

var items = [];
var serial = {}; // per-prefix running id number
var book = 1000; // running isPost (book) id

PUBLICATIONS.forEach(function (pub) {
  var sigma = (pub.end - pub.start) / 4.2;
  serial[pub.prefix] = 0;
  for (var year = pub.start; year <= pub.end; year++) {
    // expected entries this year, with multiplicative noise (0.6–1.25)
    var base = pub.height * bell(year, pub.peak, sigma);
    var count = Math.round(base * (0.6 + rand() * 0.65));
    if (count <= 0) continue;
    // group this year's entries into 1–3 "books" (isPost) for realism
    var booksThisYear = 1 + Math.floor(rand() * 3);
    for (var n = 0; n < count; n++) {
      if (n % Math.ceil(count / booksThisYear) === 0) book++;
      serial[pub.prefix]++;
      var num = String(serial[pub.prefix]).padStart(6, "0");
      items.push({
        id: pub.prefix + "-" + num,
        isPost: String(book),
        journal: pub.journal,
        year: String(year),
        datePublished: year + "-" + MONTHS[Math.floor(rand() * MONTHS.length)] + "-01",
        type: TYPES[Math.floor(rand() * TYPES.length)]
      });
    }
  }
});

/* shuffle so the file isn't grouped by publication (matches a real result page) */
for (var i = items.length - 1; i > 0; i--) {
  var j = Math.floor(rand() * (i + 1));
  var tmp = items[i];
  items[i] = items[j];
  items[j] = tmp;
}

var out = {
  counts: { articles: items.length, books: book - 1000 },
  imageBase: "",
  items: items
};

var dest = path.join(__dirname, "chart-sample.json");
fs.writeFileSync(dest, JSON.stringify(out));
console.log("wrote " + dest);
console.log("items: " + items.length + "  publications: " + PUBLICATIONS.length);
