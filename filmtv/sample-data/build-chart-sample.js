/* ============================================================
 * build-chart-sample.js — generates chart-sample.json
 *
 * A reproducible result set for building/testing the year-by-publication
 * stacked bar chart (chart.js), in the PRE-AGGREGATED shape the backend sends
 * for large result sets:
 *
 *   { counts:{articles,books}, years:[…], series:[
 *       { key, label, prefixes, counts:[…articles/yr…], bookCounts:[…books/yr…] }
 *   ] }
 *
 * counts[]  drives the ARTICLE view (篇);  bookCounts[] drives the BOOK view (本).
 * The article view must dwarf the book view — each book holds many articles.
 *
 * BOOKS below = issues/books published per year (TV Week is weekly ~52/yr, etc.).
 *   TVW + FMP: ACTUAL per-year issue figures from the live site.
 *   CEM + CEB: synthesised (live numbers weren't to hand).
 * Articles-per-book (apb): FMP & CEB ~15 (flat). TVW & CEM start ~30 and grow to
 *   ~110 in later years (issues got thicker / more ads). counts = books × apb.
 *
 * Run:  node build-chart-sample.js   (writes ./chart-sample.json)
 * ============================================================ */
"use strict";

var fs = require("fs");
var path = require("path");

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

/* --- issues (books) published per year, per publication --- */
var BOOKS = {
  TVW: { // 香港電視 — actual, weekly
    1967: 7, 1968: 52, 1969: 53, 1970: 52, 1971: 52, 1972: 52, 1973: 53, 1974: 52,
    1975: 54, 1976: 53, 1977: 56, 1978: 52, 1979: 54, 1980: 61, 1981: 65, 1982: 64,
    1983: 57, 1984: 55, 1985: 55, 1986: 53, 1987: 57, 1988: 52, 1989: 58, 1990: 53,
    1991: 53, 1992: 55, 1993: 56, 1994: 77, 1995: 58, 1996: 54, 1997: 35
  },
  FMP: { // 電影小冊子 — actual
    1926: 1, 1930: 1, 1937: 1, 1938: 2, 1939: 2, 1943: 3, 1947: 2, 1948: 6, 1949: 18,
    1950: 26, 1951: 67, 1952: 133, 1953: 97, 1954: 72, 1955: 89, 1956: 91, 1957: 75,
    1958: 102, 1959: 100, 1960: 132, 1961: 74, 1962: 53, 1963: 43, 1964: 30, 1965: 21,
    1966: 21, 1967: 19, 1968: 8, 1969: 17, 1970: 8, 1971: 10, 1972: 11, 1973: 7,
    1974: 9, 1975: 5, 1976: 11, 1977: 5, 1978: 5, 1979: 5, 1981: 2, 1982: 1, 1983: 2,
    1984: 1, 1985: 2
  },
  CEM: { // 電影雙周刊 (City Entertainment magazine family) — synthesised, fortnightly
    1979: 12, 1980: 18, 1981: 22, 1982: 28, 1983: 30, 1984: 33, 1985: 35, 1986: 38,
    1987: 40, 1988: 42, 1989: 44, 1990: 45, 1991: 46, 1992: 45, 1993: 44, 1994: 43,
    1995: 42, 1996: 40, 1997: 24
  },
  CEB: { // 電影雙周刊出版書籍 — synthesised, small
    1982: 2, 1983: 3, 1984: 4, 1985: 5, 1986: 6, 1987: 7, 1988: 8, 1989: 9, 1990: 10,
    1991: 11, 1992: 12, 1993: 10, 1994: 9, 1995: 8, 1996: 6, 1997: 4
  }
};

function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
function lerp(a, b, t) { return a + (b - a) * t; }

/* articles-per-book by publication and year */
var APB = {
  FMP: function () { return 15; },
  CEB: function () { return 15; },
  TVW: function (y) { return lerp(30, 110, clamp01((y - 1967) / (1997 - 1967))); },
  CEM: function (y) { return lerp(30, 110, clamp01((y - 1979) / (1997 - 1979))); }
};

var META = {
  FMP: { label: "電影小冊子", prefixes: ["FMP"] },
  TVW: { label: "香港電視", prefixes: ["TVW"] },
  CEM: { label: "電影雙周刊", prefixes: ["CEM", "CEI", "CEY", "CED", "CEF", "CEV", "CEH", "CEP", "CEO"] },
  CEB: { label: "電影雙周刊出版書籍", prefixes: ["CEB"] }
};
var ORDER = ["FMP", "TVW", "CEM", "CEB"]; // taxonomy order = stack + colour order

/* year axis = union of every series' years */
var minY = Infinity, maxY = -Infinity;
ORDER.forEach(function (k) {
  Object.keys(BOOKS[k]).forEach(function (y) {
    y = +y; if (y < minY) minY = y; if (y > maxY) maxY = y;
  });
});
var years = [];
for (var y = minY; y <= maxY; y++) years.push(y);

var totalArticles = 0, totalBooks = 0;
var series = ORDER.map(function (k) {
  var bookCounts = years.map(function (yr) { return BOOKS[k][yr] || 0; });
  var counts = years.map(function (yr) {
    var books = BOOKS[k][yr] || 0;
    if (!books) return 0;
    var jitter = 0.95 + 0.1 * rand(); // ±5% so the article line isn't a perfect multiple
    return Math.round(books * APB[k](yr) * jitter);
  });
  bookCounts.forEach(function (n) { totalBooks += n; });
  counts.forEach(function (n) { totalArticles += n; });
  return { key: k, label: META[k].label, prefixes: META[k].prefixes, counts: counts, bookCounts: bookCounts };
});

var out = { counts: { articles: totalArticles, books: totalBooks }, years: years, series: series };
var dest = path.join(__dirname, "chart-sample.json");
fs.writeFileSync(dest, JSON.stringify(out));

/* ============================================================
 * chart-book-sample.json — the BOOK-VIEW demo dataset (chart.html)
 *
 * In book view the 電影雙周刊 family is NOT rolled up into one series — each of
 * its 9 id prefixes is its own stacked series with its own legend entry/colour.
 * (In article view they stay merged as one 電影雙周刊 — that's chart-sample.json.)
 *
 * CEM is the flagship magazine (reuses the CEM book figures above); the other 8
 * prefixes are small companion lines (book counts synthesised; real sub-line names).
 * Colours are NOT in this payload — they live in chart.css (--filmtv-chart-ce-<key>
 * for the family; color-1..4 for the taxonomy) and are applied by chart.js. Same
 * union years[]; the chart.html driver slices each publication to its own year span
 * ("fit the axis to the publication").
 * ============================================================ */
function clampYr(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
// small companion line: `base`→`peak` books/yr across [start,1997], deterministic
function minorBooks(start, base, peak) {
  return years.map(function (yr) {
    if (yr < start) return 0;
    return Math.max(0, Math.round(lerp(base, peak, clampYr((yr - start) / (1997 - start)))));
  });
}
// 電影雙周刊 (City Entertainment) family — 9 id prefixes shown as SEPARATE series in
// book view (in article view they stay merged as one 電影雙周刊). REAL sub-line names
// (user-supplied, July 2026). CEM is the flagship magazine (reuses BOOKS.CEM figures
// above); the other 8 are smaller companion lines with synthesised book counts
// (start/base/peak tuned so the stack looks varied — swap for real figures when
// known). COLOURS are NOT set here: they live in chart.css (--filmtv-chart-ce-<key>)
// and are applied by chart.js, so this payload carries no colour at all.
var CE_FAMILY = [
  { key: "CEM", label: "正刊" },                                   // flagship
  { key: "CEI", label: "片目及索引", start: 1983, base: 4, peak: 10 },
  { key: "CEY", label: "電影電視黃頁", start: 1980, base: 1, peak: 1 },
  { key: "CED", label: "DVD Magazine", start: 1995, base: 1, peak: 3 },
  { key: "CEF", label: "Foreign Films Magazine", start: 1982, base: 1, peak: 4 },
  { key: "CEV", label: "Home Videos Magazine", start: 1985, base: 1, peak: 3 },
  { key: "CEH", label: "荷里活映畫", start: 1983, base: 2, peak: 5 },
  { key: "CEP", label: "電影海報館", start: 1986, base: 1, peak: 3 },
  { key: "CEO", label: "電影海報精選", start: 1988, base: 1, peak: 2 }
];
function seriesOf(k) { return series.filter(function (s) { return s.key === k; })[0]; }

var ceFamily = CE_FAMILY.map(function (m) {
  if (m.key === "CEM") {                          // flagship — reuse computed CEM figures
    var base = seriesOf("CEM");
    return { key: "CEM", label: m.label, prefixes: ["CEM"], counts: base.counts, bookCounts: base.bookCounts };
  }
  var bc = minorBooks(m.start, m.base, m.peak);
  var ct = bc.map(function (n, yi) { return n ? Math.round(n * APB.CEM(years[yi])) : 0; });
  return { key: m.key, label: m.label, prefixes: [m.key], counts: ct, bookCounts: bc };
});

// FMP/TVW/CEB keep their TAXONOMY colours (chart.css color-1/2/4 via chart.js
// GROUP_ORDER); no colours in this payload — chart.css is the single source.
var bookSeries = [seriesOf("FMP"), seriesOf("TVW")].concat(ceFamily).concat([seriesOf("CEB")]);

var bookOut = { counts: { articles: totalArticles, books: totalBooks }, years: years, series: bookSeries };
var bookDest = path.join(__dirname, "chart-book-sample.json");
fs.writeFileSync(bookDest, JSON.stringify(bookOut));
console.log("wrote " + bookDest + "  (" + bookSeries.length + " series: 電影雙周刊 split into " + ceFamily.length + ")");

console.log("wrote " + dest);
console.log("years " + years[0] + "–" + years[years.length - 1] +
  "  articles " + totalArticles.toLocaleString() + "  books " + totalBooks.toLocaleString() +
  "  (overall " + (totalArticles / totalBooks).toFixed(1) + "× articles/book)");
series.forEach(function (s) {
  var a = s.counts.reduce(function (x, n) { return x + n; }, 0);
  var b = s.bookCounts.reduce(function (x, n) { return x + n; }, 0);
  console.log("  " + s.key + ": " + a.toLocaleString() + " articles / " + b.toLocaleString() +
    " books = " + (a / b).toFixed(1) + " apb");
});
