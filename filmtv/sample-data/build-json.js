/* ============================================================
 * build-json.js — convert 2922.csv -> 2922.json (the sample result set)
 *
 * Usage:  node build-json.js
 *
 * Reads the CSV in this folder and writes the JSON results.js consumes.
 * Re-run this whenever the CSV changes. The CSV may hold MULTIPLE
 * publications (one BookNumber per book); the book view groups by bookNumber.
 *
 * Field mapping (CSV column -> JSON key) follows the data-* contract.
 * Thumbnails live at  <THUMB_BASE>/<bookNumber>/<file>.
 * ============================================================ */
var fs = require("fs");
var path = require("path");

var CSV = path.join(__dirname, "2922.csv");
var OUT = path.join(__dirname, "2922.json");

// Display totals shown in the toggle (real DB totals, not the sample size).
var COUNTS = { articles: 10390, books: 1935 };

// Per-publication thumbnail config (sample only; a real backend returns image
// URLs directly). base = storage path up to (not including) the <bookNumber>/ folder.
//   coverOnly true  -> every article shows the issue cover (<bookNumber>_001.jpg)
//             false -> per-article image from the CSV "image" column
var PUB_CONFIG = {
  "2922": { base: "https://storage.lib.hkbu.edu.hk/filmpamphlet/Thumbnail/", coverOnly: false },
  "25":   { base: "https://storage.lib.hkbu.edu.hk/tvweek/Thumbnail/",       coverOnly: true  },
  "956":  { base: "https://storage.lib.hkbu.edu.hk/tvweek/Thumbnail/",       coverOnly: true  }
};
var DEFAULT_CONFIG = { base: "https://storage.lib.hkbu.edu.hk/filmpamphlet/Thumbnail/", coverOnly: false };

function parseCSV(text) {
  var rows = [], row = [], field = "", inQ = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* skip */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function clean(v) {
  if (v == null) return null;
  var s = String(v).trim();
  return s === "" || s === "NULL" ? null : s;
}

function thumb(bookNumber, image) {
  if (!bookNumber) return null;
  var cfg = PUB_CONFIG[bookNumber] || DEFAULT_CONFIG;
  var folder = cfg.base + bookNumber + "/";
  if (cfg.coverOnly) return folder + bookNumber + "_001.jpg"; // issue cover for all articles
  var file = clean(image);
  if (!file) return null;
  file = file.split("---")[0].trim();            // first image of a "a---b" pair
  return file ? folder + file : null;
}

var text = fs.readFileSync(CSV, "utf8").replace(/^﻿/, "");
var rows = parseCSV(text);
var header = rows.shift();
var col = {};
header.forEach(function (h, i) { col[h.trim()] = i; });

var items = rows
  .filter(function (r) { return r.length > 1 && clean(r[col["id"]]); })
  .map(function (r) {
    var bookNumber = clean(r[col["BookNumber"]]);
    return {
      id: clean(r[col["id"]]),
      bookNumber: bookNumber,
      journal: clean(r[col["journal_zht"]]),
      publisher: clean(r[col["publisher_zht"]]),
      journalIssue: clean(r[col["journalIssue"]]),
      datePublished: clean(r[col["datePublished"]]),
      year: clean(r[col["Year"]]),
      title: clean(r[col["title_zht"]]),
      section: clean(r[col["articleSection_zht"]]),
      author: clean(r[col["author_zht"]]),
      page: clean(r[col["pageStart"]]),
      type: clean(r[col["ArticleType"]]),
      image: thumb(bookNumber, r[col["image"]]),
      href: "#"
    };
  });

var out = { counts: COUNTS, imageBase: "", items: items };
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");

// summary
var byBook = {};
items.forEach(function (it) { byBook[it.bookNumber] = (byBook[it.bookNumber] || 0) + 1; });
console.log("wrote " + items.length + " items to " + path.basename(OUT));
console.log("books (bookNumber):", byBook);
console.log("sample image:", items[0].image);
