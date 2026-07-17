#!/usr/bin/env node
/* ============================================================
 * enrich-viewer-books.js — add the article metadata the VIEWER's side panels
 * need (type / page / section / keywords / externalLink) to the sample
 * per-book book.json files. DISPOSABLE preview tooling (sample-data side).
 *
 * The viewer's Book-Metadata, Search and Article-Info panels read the same
 * catalogue fields the Book PAGE already shows (article type, printed page,
 * 專欄/section, keywords, an external link). The reader's page-manipulation
 * book.json only carried { id,title,author,pageStart,pageEnd,articleBody }, so
 * this merges the richer fields onto each article:
 *   • 2922 《多情河歌集》 — from the REAL catalogue export (2922.csv), matched by id.
 *   • 2048 《花燈記》     — a fabricated OCR mock, so its extra fields are mock too
 *                          (types/keywords chosen to exercise the panels).
 *
 * In production the backend returns these fields inside book.json directly;
 * this script (and the CSV) go away with the rest of the sample-data harness.
 *
 *   node enrich-viewer-books.js     -> rewrites 2922/book.json, 2048/book.json
 * ============================================================ */
"use strict";
var fs = require("fs");
var path = require("path");
var DIR = __dirname;

/* ---- minimal CSV parser (same dialect as build-json.js) ---- */
function parseCSV(text) {
  var rows = [], row = [], field = "", inQ = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
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
function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function writeJson(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n"); }

/* ---- 2922: pull real fields from the catalogue CSV, keyed by article id ---- */
function csvIndex(csvPath) {
  var rows = parseCSV(fs.readFileSync(csvPath, "utf8").replace(/^﻿/, ""));
  var head = rows[0];
  var col = function (name) { return head.indexOf(name); };
  var idI = col("id"), typeI = col("ArticleType"), pageI = col("pageStart"),
      secI = col("articleSection_zht"), kwI = col("keywords"), linkI = col("ExternalLinks");
  var map = {};
  for (var r = 1; r < rows.length; r++) {
    var row = rows[r];
    var id = clean(row[idI]);
    if (!id) continue;
    map[id] = {
      type: clean(row[typeI]),                 // numeric ArticleType code -> ARTICLE_TYPES
      page: clean(row[pageI]),                 // printed page (may be a range/blank)
      section: clean(row[secI]),               // 專欄
      keywords: clean(row[kwI]),               // "a---b---c"
      externalLink: clean(row[linkI])          // catalogue / film DB URL
    };
  }
  return map;
}

function enrichFromCsv(bookPath, csvPath) {
  var book = readJson(bookPath);
  var idx = csvIndex(csvPath);
  book.articles.forEach(function (a) {
    var extra = idx[a.id];
    if (!extra) return;
    if (extra.type != null) a.type = extra.type;
    if (extra.page != null) a.page = extra.page;
    if (extra.section != null && a.section == null) a.section = extra.section;
    if (extra.keywords != null) a.keywords = extra.keywords;
    if (extra.externalLink != null) a.externalLink = extra.externalLink;
  });
  writeJson(bookPath, book);
  var n = book.articles.filter(function (a) { return a.type != null; }).length;
  console.log("2922: enriched " + n + "/" + book.articles.length + " articles from CSV");
}

/* ---- 2048: fabricated pamphlet -> fabricated (but plausible) panel fields ---- */
var MOCK_2048 = {
  "HDJ-0001": { type: "21", keywords: "花燈記---本事---粵劇電影" },                 // 電影故事、小說、本事
  "HDJ-0002": { type: "9",  keywords: "花燈記---曲詞---唐滌生" },                     // 歌詞、歌譜
  "HDJ-0003": { type: "18", keywords: "花燈記---演員表---任劍輝---白雪仙" },          // 職員表、演員表
  "HDJ-0004": { type: "6",  keywords: "花燈記---拍攝花絮" },                          // 人物專訪、花絮
  "HDJ-0005": { type: "27", keywords: "戲曲電影---電影評論" }                         // 文學及藝術評論、書評
};
function enrichMock(bookPath, mock) {
  var book = readJson(bookPath);
  book.articles.forEach(function (a) {
    var extra = mock[a.id];
    if (!extra) return;
    a.type = extra.type;
    a.page = String(a.pageStart);          // printed page == reading page for this mock
    a.keywords = extra.keywords;
    a.externalLink = "#";                  // no real link for the fabricated pamphlet
  });
  writeJson(bookPath, book);
  console.log("2048: enriched " + book.articles.length + " mock articles");
}

enrichFromCsv(path.join(DIR, "2922", "book.json"), path.join(DIR, "2922.csv"));
enrichMock(path.join(DIR, "2048", "book.json"), MOCK_2048);
console.log("done.");
