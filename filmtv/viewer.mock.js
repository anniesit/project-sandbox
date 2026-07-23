/* ============================================================
 * viewer.mock.js — SAMPLE-DATA LOADER for the Book Viewer (DISPOSABLE)
 *
 * ⚠️ PREVIEW-ONLY REFERENCE — NOT part of the handoff. It exists so the
 * Webflow-authored viewer page shows a real book in the published preview, and
 * is the backend colleague's REFERENCE for driving the real component. Delete
 * this file and, from your own route (which carries the BookNumber in the URL),
 * simply call:
 *
 *     window.filmtvViewer.init({ dataBaseUrl: "/api/books" });   // reads ?book=&page=&article=
 *   or
 *     window.filmtvViewer.load(bookNumber, { page, article });
 *
 * The reusable viewer lives in viewer.js (loaded first). This file only:
 *   1. points DATA_BASE at the local sample-data folder,
 *   2. inits the viewer (default book 2048 電影雙周刊 第1期 — a real 16-page book),
 *   3. mounts a floating dev switcher: swap BookNumber + force any of the four
 *      bookOrientation values (left/right/top/bottom) to exercise spread logic.
 *
 * In production the combined switcher + the sample-data base URL all go away —
 * the backend inits the viewer once and lets it read the page URL.
 * ============================================================ */
(function () {
  "use strict";

  var SELF =
    (document.currentScript && document.currentScript.src) ||
    (function () { var s = document.querySelector('script[src*="viewer.mock.js"]'); return s ? s.src : window.location.href; })();

  var DATA_BASE = new URL("./sample-data", SELF).href;   // {base}/{bookNumber}/book.json
  var DEFAULT_BOOK = "2922";                              // switcher default only (多情河歌集); 2048 花燈記 also available

  ready(function () {
    var root = document.querySelector("[data-viewer]") || document;
    injectSwitcherCss();

    // No default-book seeding: a bare load (no ?book=/?id=) shows the empty state.
    // init() reads the URL itself — ?book= loads that book; a record ?id= (no book)
    // is resolved to its book via the article index (see resolveArticleBook in
    // viewer.js). This mirrors the LIVE record page, whose inline init() call is
    // the same. Use the switcher to preview a specific book on demand.
    window.filmtvViewer.init({
      root: root === document ? undefined : root,
      dataBaseUrl: DATA_BASE
    });

    mountSwitcher(root);
  });

  /* ---------- floating dev switcher ---------- */
  function injectSwitcherCss() {
    if (document.getElementById("filmtv-viewer-switcher-css")) return;
    var st = document.createElement("style");
    st.id = "filmtv-viewer-switcher-css";
    st.textContent =
      '.viewer-switcher{position:fixed;left:1rem;bottom:4.5rem;z-index:9999;display:flex;' +
      'flex-wrap:wrap;gap:.4rem;align-items:center;max-width:22rem;padding:.5rem .6rem;border-radius:10px;' +
      'background:rgba(28,26,24,.92);color:#fff;font:500 13px/1.2 system-ui,sans-serif;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.25)}' +
      '.viewer-switcher label{opacity:.75}' +
      '.viewer-switcher input,.viewer-switcher select{padding:.3rem .45rem;border:1px solid rgba(255,255,255,.25);' +
      'border-radius:6px;background:#fff;color:#1c1a18;font:inherit}' +
      '.viewer-switcher input{width:5rem}' +
      '.viewer-switcher button{padding:.32rem .7rem;border:0;border-radius:6px;cursor:pointer;' +
      'background:#8a1c2b;color:#fff;font:inherit}' +
      '.viewer-switcher .viewer-switcher-note{flex-basis:100%;opacity:.7;font-weight:400}';
    (document.head || document.documentElement).appendChild(st);
  }

  function mountSwitcher(root) {
    if (document.querySelector(".viewer-switcher")) return;
    var box = document.createElement("div");
    box.className = "viewer-switcher";
    box.innerHTML =
      '<label for="vs-book">Book</label>' +
      '<input id="vs-book" type="text" autocomplete="off" placeholder="2922 / 2048" />' +
      '<button type="button" id="vs-go">顯示</button>' +
      '<label for="vs-ori">裝訂</label>' +
      '<select id="vs-ori">' +
      '<option value="left">left 左</option><option value="right">right 右</option>' +
      '<option value="top">top 上</option><option value="bottom">bottom 下</option></select>' +
      '<span class="viewer-switcher-note"></span>';
    document.body.appendChild(box);

    var input = box.querySelector("#vs-book");
    var oriSel = box.querySelector("#vs-ori");
    input.value = new URLSearchParams(window.location.search).get("book") || DEFAULT_BOOK;

    function go() {
      var bn = input.value.trim(); if (!bn) return;
      setNote("載入中…");
      window.filmtvViewer.load(bn).then(function () {
        var st = window.filmtvViewer.state;
        if (st.book) { oriSel.value = st.book.bookOrientation || "left"; setNote(""); }
        else setNote("找不到 Book：" + bn);
      });
    }
    box.querySelector("#vs-go").addEventListener("click", go);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });

    // Force an orientation on the loaded book to test spread logic.
    oriSel.addEventListener("change", function () {
      var st = window.filmtvViewer.state;
      if (!st.book) return;
      st.book.bookOrientation = oriSel.value;
      setNote("裝訂 → " + oriSel.value + "（模擬）");
      window.filmtvViewer.render();
    });

    // reflect the initial book's orientation once it loads
    var tries = 0;
    var t = setInterval(function () {
      var st = window.filmtvViewer.state;
      if (st.book) { oriSel.value = st.book.bookOrientation || "left"; clearInterval(t); }
      if (++tries > 40) clearInterval(t);
    }, 100);
  }

  function setNote(txt) { var n = document.querySelector(".viewer-switcher-note"); if (n) n.textContent = txt || ""; }

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
})();
