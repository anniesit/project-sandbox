#!/usr/bin/env node
/* ============================================================
 * build-book-sample.js — convert phpMyAdmin JSON export(s) of book article data
 * into the frontend Book-page sample shape ({ counts, imageBase, items }).
 *
 * The library exports data as a phpMyAdmin JSON dump: a 3-element array
 * [{type:header}, {type:database}, {type:table, data:[…rows…]}] whose rows carry
 * the FULL (tri-lingual) catalogue schema. book.js/results.js consume a slimmer
 * per-article shape — this script maps one to the other (the build-json.js role).
 *
 * It merges the converted rows with the existing 2922.json items so the Book
 * page's dev switcher still reaches 25 / 956 / 2922 alongside the new CE books.
 * Reusable: as more exports arrive, add their filenames to CE_EXPORTS and re-run.
 *
 *   node build-book-sample.js   ->   writes book-sample.json
 * ============================================================ */
"use strict";
var fs = require("fs");
var path = require("path");
var DIR = __dirname;

/* >>> Thumbnail base URL for the CE 電影雙周刊 DVD-Magazine images. The export
 * carries only filenames (e.g. "CE_0648a_001.jpg"), so set this to the storage
 * prefix that makes them resolve — e.g.
 *   "https://storage.lib.hkbu.edu.hk/<path>/Thumbnail/"
 * Leave "" to preview structure with grey placeholders. TVW/FMP items are
 * unaffected (their image is already a full https URL). <<< */
var IMAGE_BASE = "";

var CE_EXPORTS = ["202412LDDimport.json"];   // add more phpMyAdmin exports here
var MERGE_SAMPLE = "2922.json";              // existing TVW/FMP items to keep
var OUT = "book-sample.json";

/* FABRICATED mock rows (no real data yet) to exercise the tab + book-name logic
 * for the CE_0648 family, alongside the real CE_0648a (DVD Magazine) export:
 *   • CE_0648  正刊  — one 封面 (cover) article; its journal 電影雙周刊 is the book
 *     name shown in the header (data-field=journal).
 *   • CE_0648b 附件  — one postcard (an attachment that is "not a book"); its
 *     journal 電影雙周刊 MATCHES 正刊, so it labels as 附件 1 (a 2nd such attachment
 *     would be 附件 2, …). CE_0648a differs (DVD Magazine) so it keeps that name.
 * Delete this block once real CE_0648 / CE_0648b data arrives. */
var MOCK_ITEMS = [
  { id: "CEM-064801", bookNumber: "CE_0648", journal: "電影雙周刊", journalIssue: "648",
    datePublished: "2004-02-12", year: "2004", title: "", section: null, author: null,
    page: "1", type: "14", image: "CE_0648_001.jpg", publisher: "電影雙周刊出版社", href: "#" },
  { id: "CEP-064801", bookNumber: "CE_0648b", journal: "電影雙周刊", journalIssue: "648",
    datePublished: "2004-02-12", year: "2004", title: "隨書明信片", section: null, author: null,
    page: "1", type: "24", image: "CE_0648b_001.jpg", publisher: "電影雙周刊出版社", href: "#" }
];

/* ---------- helpers ---------- */
function pad2(s) { s = String(s == null ? "" : s).trim(); return s && s.length < 2 ? "0" + s : s; }
function nonEmpty() {
  for (var i = 0; i < arguments.length; i++) {
    var v = arguments[i];
    if (v != null && String(v).trim() !== "") return v;
  }
  return null;
}
function composeDate(r) {
  if (!r.date_yyyy) return null;
  return r.date_yyyy + "-" + (r.date_mm ? pad2(r.date_mm) : "01") + "-" + (r.date_dd ? pad2(r.date_dd) : "01");
}
// The thumbnail filename: first entry of Files ("label##file---label##file"),
// falling back to url_storage_filename ("path#file;file;…").
function firstFile(r) {
  if (r.Files) {
    var first = String(r.Files).split("---")[0].split("##");
    return first[first.length - 1].trim();
  }
  if (r.url_storage_filename) {
    return String(r.url_storage_filename).split("#").pop().split(";")[0].trim();
  }
  return "";
}
// Real start page; the 88888 / 888 sentinel (covers etc.) becomes null so it
// doesn't render a bogus "頁 88888" and sorts to the end of the TOC.
function pageOf(r) {
  var p = r.pageStart == null ? "" : String(r.pageStart).trim();
  if (p === "" || p === "88888" || p === "888") return null;
  return p;
}
function baseOf(bn) { return String(bn == null ? "" : bn).replace(/[a-z]+$/, ""); }

// One export row -> one frontend item (same shape as 2922.json items).
function toItem(r) {
  return {
    id: r.id,
    bookNumber: r.BookNumber,
    journal: nonEmpty(r["published_in_zh-Hant"], r["dataset_name_zh-Hant"], r.published_in_en) || "",
    journalIssue: nonEmpty(r.issue),
    datePublished: composeDate(r),
    year: r.date_yyyy || null,
    title: nonEmpty(r["title_zh-Hant"], r.title_en) || "",
    section: nonEmpty(r.articleSection_zht),
    author: nonEmpty(r["authors_zh-Hant"], r.contributor_zht),
    page: pageOf(r),
    type: r.ArticleType != null ? String(r.ArticleType) : null,
    image: firstFile(r),
    publisher: nonEmpty(r["publisher_zh-Hant"]),
    href: nonEmpty(r.url_permalink, r.identifier) || "#"
  };
}
function rowsOf(exportJson) {
  var table = Array.isArray(exportJson)
    ? exportJson.filter(function (o) { return o && o.type === "table"; })[0]
    : null;
  return table && Array.isArray(table.data) ? table.data : [];
}
function readJson(f) { return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); }

/* ---------- build ---------- */
var items = [];
CE_EXPORTS.forEach(function (f) {
  var rows = rowsOf(readJson(f));
  items = items.concat(rows.map(toItem));
  console.log("· " + f + ": " + rows.length + " rows");
});
items = items.concat(MOCK_ITEMS);
console.log("· mock rows (CE_0648 正刊 + CE_0648b 附件): " + MOCK_ITEMS.length);

// Keep the existing TVW/FMP sample so the switcher still previews them.
try {
  var base = readJson(MERGE_SAMPLE);
  if (base && Array.isArray(base.items)) {
    items = base.items.concat(items);
    console.log("· merged " + base.items.length + " items from " + MERGE_SAMPLE);
  }
} catch (e) { console.warn("! could not merge " + MERGE_SAMPLE + ": " + e.message); }

var books = {};
items.forEach(function (it) { books[baseOf(it.bookNumber)] = 1; });
var out = { counts: { articles: items.length, books: Object.keys(books).length }, imageBase: IMAGE_BASE, items: items };
fs.writeFileSync(path.join(DIR, OUT), JSON.stringify(out));
console.log("→ " + OUT + ": " + items.length + " items, " + Object.keys(books).length + " books, imageBase=" + JSON.stringify(IMAGE_BASE));
