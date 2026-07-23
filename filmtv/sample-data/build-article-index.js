#!/usr/bin/env node
/* ============================================================
 * build-article-index.js — generate article-index.json, an id -> bookNumber
 * map so the VIEWER's record page can resolve a book from a bare ?id= (no
 * ?book=). DISPOSABLE preview tooling (sample-data side).
 *
 * The record route carries only the article id (?id=HDJ-0005). viewer.js needs
 * the book to fetch {base}/{bookNumber}/book.json, so it looks the id up in this
 * index (see resolveArticleBook() in viewer.js). This script scans every
 * per-book sample file — sample-data/<bookNumber>/book.json — and records each
 * article id -> that book's number. Only ids with a loadable book.json end up in
 * the index, so a resolved book is always fetchable.
 *
 * In production the article-based backend derives the SAME id -> BookNumber map
 * from its DB (each article row already carries BookNumber, e.g. the phpMyAdmin
 * export 202412LDDimport.json) and serves it at {base}/article-index.json (or an
 * equivalent endpoint). This script + the sample files then go away.
 *
 *   node build-article-index.js     -> writes sample-data/article-index.json
 * ============================================================ */
"use strict";
var fs = require("fs");
var path = require("path");
var DIR = __dirname;

var index = {};
var books = fs
  .readdirSync(DIR, { withFileTypes: true })
  .filter(function (d) { return d.isDirectory(); })
  .map(function (d) { return d.name; });

books.forEach(function (bn) {
  var file = path.join(DIR, bn, "book.json");
  if (!fs.existsSync(file)) return;
  var book;
  try { book = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { console.warn("skip " + bn + ": " + e.message); return; }
  var bookNumber = book.bookNumber || bn; // trust the file's own number, fall back to the dir name
  (book.articles || []).forEach(function (a) {
    if (a && a.id != null) index[a.id] = bookNumber;
  });
});

var out = path.join(DIR, "article-index.json");
fs.writeFileSync(out, JSON.stringify(index, null, 0) + "\n");
console.log("wrote " + out + " (" + Object.keys(index).length + " articles)");
