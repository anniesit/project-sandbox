/* ============================================================
 * build-collection-sample.js — generates the COLLECTION PAGE mock data
 *
 * The collection page shows every book (issue) of ONE publication, with a
 * year selector, a grid of book-cover cards, and a book-count-by-year chart.
 * This script produces the two mock payloads for 香港電視 (TVW):
 *
 *   collection-tvw.json        year buttons + one year's book cards
 *   collection-tvw-chart.json  pre-aggregated book chart (chart.js, book view)
 *
 * DATA SHAPE — kept "by article" like 2922.csv / the search payload: the cards
 * are driven by article-level `items[]` grouped by bookNumber (exactly how
 * results.js groups a book). A real book holds many articles; a cover card only
 * needs the first one, so the mock emits ONE cover article per book (type 14 =
 * 封面) — enough to render the grid without inventing hundreds of rows. The
 * per-year figures the buttons + chart need are carried pre-aggregated alongside.
 *
 * ACTIVE YEAR = 1986: issues 8 (1986-01-03) … 59 (1986-12-25), weekly.
 * Thumbnails: https://storage.lib.hkbu.edu.hk/tvweek/Thumbnail/<n>/<n>_001.jpg
 *
 * Run:  node build-collection-sample.js   (writes both json files here)
 * ============================================================ */
"use strict";

var fs = require("fs");
var path = require("path");

var PUBLICATION = { key: "TVW", label: "香港電視", prefixes: ["TVW"] };

/* 香港電視 issues (books) per year — same figures as build-chart-sample.js so the
   collection chart matches the main search chart's TVW stack exactly. */
var BOOKS_BY_YEAR = {
  1967: 7, 1968: 52, 1969: 53, 1970: 52, 1971: 52, 1972: 52, 1973: 53, 1974: 52,
  1975: 54, 1976: 53, 1977: 56, 1978: 52, 1979: 54, 1980: 61, 1981: 65, 1982: 64,
  1983: 57, 1984: 55, 1985: 55, 1986: 53, 1987: 57, 1988: 52, 1989: 58, 1990: 53,
  1991: 53, 1992: 55, 1993: 56, 1994: 77, 1995: 58, 1996: 54, 1997: 35
};

function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
function lerp(a, b, t) { return a + (b - a) * t; }
// articles-per-book grew ~30 → ~110 across TVW's run (issues got thicker)
function apb(y) { return lerp(30, 110, clamp01((y - 1967) / (1997 - 1967))); }

/* ---- active-year (1986) book cards ---- */
var ACTIVE_YEAR = 1986;
var FIRST_ISSUE = 8, LAST_ISSUE = 59;                 // issues 8 … 59
// keep the active year's figures internally consistent: the year badge and the
// chart bar for 1986 must equal the number of cards actually shown (issues 8–59).
BOOKS_BY_YEAR[ACTIVE_YEAR] = LAST_ISSUE - FIRST_ISSUE + 1;   // 52

/* ---- year axis 1967–1997 + per-year counts (buttons + chart) ---- */
var years = [];
for (var y = 1967; y <= 1997; y++) years.push(y);
var bookCounts = years.map(function (yr) { return BOOKS_BY_YEAR[yr] || 0; });
var counts = years.map(function (yr, i) { return Math.round(bookCounts[i] * apb(yr)); });

var START = Date.UTC(1986, 0, 3), END = Date.UTC(1986, 11, 25); // 01-03 … 12-25
var SPAN_DAYS = Math.round((END - START) / 86400000);           // 356
var STEPS = LAST_ISSUE - FIRST_ISSUE;                            // 51 intervals
var DAY = 86400000;
var THUMB = "https://storage.lib.hkbu.edu.hk/tvweek/Thumbnail/";

function isoDate(ms) { return new Date(ms).toISOString().slice(0, 10); }

var items = [];
for (var n = FIRST_ISSUE; n <= LAST_ISSUE; n++) {
  var offset = Math.round((n - FIRST_ISSUE) * SPAN_DAYS / STEPS); // 0 … 356, ~weekly
  var date = isoDate(START + offset * DAY);
  items.push({
    id: "TVW-" + String(600000 + n),   // first 3 chars = publication key (access tag)
    bookNumber: String(n),             // book-view grouping key (one book per issue)
    journal: "香港電視",
    journalIssue: String(n),           // 第 N 期
    datePublished: date,
    year: String(ACTIVE_YEAR),
    title: null,                        // cover page — no article title
    section: null,
    author: null,
    page: "1",
    type: "14",                         // 封面、封底、版權頁
    image: THUMB + n + "/" + n + "_001.jpg",
    href: "#"
  });
}

/* year totals for the whole publication + the active year's book total */
var totalArticles = counts.reduce(function (a, b) { return a + b; }, 0);
var totalBooks = bookCounts.reduce(function (a, b) { return a + b; }, 0);

/* ---- collection-tvw.json (buttons + cards) ---- */
var collection = {
  publication: PUBLICATION,
  imageBase: "",
  activeYear: ACTIVE_YEAR,
  years: years,
  yearBookCounts: bookCounts,   // per-year book counts — year-button badges
  counts: { articles: totalArticles, books: totalBooks },
  items: items                  // 1986 cover articles → grouped by bookNumber into cards
};

/* ---- collection-tvw-chart.json (chart.js, book view, single series) ---- */
var chart = {
  counts: { articles: totalArticles, books: totalBooks },
  years: years,
  series: [{
    key: PUBLICATION.key,
    label: PUBLICATION.label,
    prefixes: PUBLICATION.prefixes,
    counts: counts,
    bookCounts: bookCounts
  }]
};

fs.writeFileSync(path.join(__dirname, "collection-tvw.json"), JSON.stringify(collection));
fs.writeFileSync(path.join(__dirname, "collection-tvw-chart.json"), JSON.stringify(chart));

console.log("wrote collection-tvw.json  (" + items.length + " books for " + ACTIVE_YEAR +
  ", issues " + FIRST_ISSUE + "–" + LAST_ISSUE + ", " + items[0].datePublished +
  " … " + items[items.length - 1].datePublished + ")");
console.log("wrote collection-tvw-chart.json  (years " + years[0] + "–" + years[years.length - 1] +
  ", " + totalBooks + " books / " + totalArticles.toLocaleString() + " articles)");
