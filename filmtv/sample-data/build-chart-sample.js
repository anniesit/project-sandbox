/* ============================================================
 * build-chart-sample.js — generates chart-sample.json
 *
 * A reproducible result set for building/testing the year-by-publication
 * stacked bar chart (chart.js). Mirrors the REAL data shape
 * ({ counts, imageBase, items[] }) so the chart gets the same payload the
 * backend will send.
 *
 * Publication = first 3 chars of an entry id. The real archive taxonomy:
 *   TVW                                  -> 香港電視 (TV Weekly)
 *   FMP                                  -> 電影小冊子 (Film Pamphlets)
 *   CEM,CEI,CEY,CED,CEF,CEV,CEH,CEP,CEO  -> 電影雙周刊 (City Entertainment
 *                                           Magazines — 9 variants, ONE series)
 *   CEB                                  -> 電影雙周刊出版書籍 (City Ent. Books)
 * The CE* roll-up is done in chart.js (PUBLICATIONS map); here we just emit
 * realistic ids/journals per variant so the roll-up is actually exercised.
 *
 * TVW + FMP yearly counts are the ACTUAL per-year figures from the live site;
 * CEMAG + CEB are synthesised (the live numbers weren't to hand).
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

/* --- actual per-year counts from the live site (TV Weekly) --- */
var TVW = {
  1967: 7, 1968: 52, 1969: 53, 1970: 52, 1971: 52, 1972: 52, 1973: 53, 1974: 52,
  1975: 54, 1976: 53, 1977: 56, 1978: 52, 1979: 54, 1980: 61, 1981: 65, 1982: 64,
  1983: 57, 1984: 55, 1985: 55, 1986: 53, 1987: 57, 1988: 52, 1989: 58, 1990: 53,
  1991: 53, 1992: 55, 1993: 56, 1994: 77, 1995: 58, 1996: 54, 1997: 35
};

/* --- actual per-year counts from the live site (Film Pamphlets) --- */
var FMP = {
  1926: 1, 1930: 1, 1937: 1, 1938: 2, 1939: 2, 1943: 3, 1947: 2, 1948: 6, 1949: 18,
  1950: 26, 1951: 67, 1952: 133, 1953: 97, 1954: 72, 1955: 89, 1956: 91, 1957: 75,
  1958: 102, 1959: 100, 1960: 132, 1961: 74, 1962: 53, 1963: 43, 1964: 30, 1965: 21,
  1966: 21, 1967: 19, 1968: 8, 1969: 17, 1970: 8, 1971: 10, 1972: 11, 1973: 7,
  1974: 9, 1975: 5, 1976: 11, 1977: 5, 1978: 5, 1979: 5, 1981: 2, 1982: 1, 1983: 2,
  1984: 1, 1985: 2
};

/* --- synthesised: City Entertainment magazine family (電影雙周刊), 1979–1997.
   Distributed across the 9 variant prefixes so the chart's roll-up is tested. --- */
var CEMAG_TOTALS = {
  1979: 12, 1980: 18, 1981: 22, 1982: 28, 1983: 30, 1984: 33, 1985: 35, 1986: 38,
  1987: 40, 1988: 42, 1989: 44, 1990: 45, 1991: 46, 1992: 45, 1993: 44, 1994: 43,
  1995: 42, 1996: 40, 1997: 24
};
var CEMAG_VARIANTS = [
  { prefix: "CEM", journal: "電影雙周刊正刊", weight: 6 },
  { prefix: "CEI", journal: "片目及索引", weight: 2 },
  { prefix: "CEY", journal: "電影電視黃頁", weight: 1 },
  { prefix: "CED", journal: "DVD Magazine", weight: 1 },
  { prefix: "CEF", journal: "Foreign Films Magazine", weight: 1 },
  { prefix: "CEV", journal: "Home Videos Magazine", weight: 1 },
  { prefix: "CEH", journal: "荷里活映畫", weight: 1 },
  { prefix: "CEP", journal: "電影海報館", weight: 1 },
  { prefix: "CEO", journal: "電影海報精選", weight: 1 }
];

/* --- synthesised: City Entertainment Books (電影雙周刊出版書籍), small --- */
var CEB = {
  1982: 2, 1983: 3, 1984: 4, 1985: 5, 1986: 6, 1987: 7, 1988: 8, 1989: 9, 1990: 10,
  1991: 11, 1992: 12, 1993: 10, 1994: 9, 1995: 8, 1996: 6, 1997: 4
};

var TYPES = ["1", "2", "4", "5", "6", "9", "11", "14", "21", "28"];
var MONTHS = ["01", "03", "05", "07", "09", "11"];

var items = [];
var serial = {}; // per-prefix running id number
var book = 1000; // running isPost (book) id

function nextId(prefix) {
  serial[prefix] = (serial[prefix] || 0) + 1;
  return prefix + "-" + String(serial[prefix]).padStart(6, "0");
}
function emit(prefix, journal, year, n) {
  for (var i = 0; i < n; i++) {
    if (i % 12 === 0) book++;
    items.push({
      id: nextId(prefix),
      isPost: String(book),
      journal: journal,
      year: String(year),
      datePublished: year + "-" + MONTHS[Math.floor(rand() * MONTHS.length)] + "-01",
      type: TYPES[Math.floor(rand() * TYPES.length)]
    });
  }
}

// pick a CE magazine variant by weight
var CEMAG_BAG = [];
CEMAG_VARIANTS.forEach(function (v) {
  for (var i = 0; i < v.weight; i++) CEMAG_BAG.push(v);
});
function pickVariant() {
  return CEMAG_BAG[Math.floor(rand() * CEMAG_BAG.length)];
}

Object.keys(TVW).forEach(function (y) { emit("TVW", "香港電視", +y, TVW[y]); });
Object.keys(FMP).forEach(function (y) { emit("FMP", "電影小冊子", +y, FMP[y]); });
Object.keys(CEB).forEach(function (y) { emit("CEB", "電影雙周刊出版書籍", +y, CEB[y]); });
Object.keys(CEMAG_TOTALS).forEach(function (y) {
  for (var i = 0; i < CEMAG_TOTALS[y]; i++) {
    var v = pickVariant();
    emit(v.prefix, v.journal, +y, 1);
  }
});

/* shuffle so the file isn't grouped by publication (matches a real result page) */
for (var i = items.length - 1; i > 0; i--) {
  var j = Math.floor(rand() * (i + 1));
  var tmp = items[i];
  items[i] = items[j];
  items[j] = tmp;
}

var out = { counts: { articles: items.length, books: book - 1000 }, imageBase: "", items: items };
var dest = path.join(__dirname, "chart-sample.json");
fs.writeFileSync(dest, JSON.stringify(out));
console.log("wrote " + dest);
console.log("items: " + items.length);
