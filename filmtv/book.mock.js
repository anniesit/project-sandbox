/* ============================================================
 * book.mock.js — SAMPLE-DATA LOADER for the Book page (DISPOSABLE)
 *
 * ⚠️ PREVIEW-ONLY REFERENCE — NOT part of the handoff. This file exists so the
 * Webflow-authored Book page shows realistic data in the published preview. It
 * is the backend colleague's REFERENCE for how to drive the real component:
 * delete this file and, after your own fetch of ONE book's articles (the main
 * book + its attachments), call:
 *
 *     window.filmtvBook.render(rootEl, { items, imageBase, counts });
 *
 * The reusable renderer lives in book.js (loaded first). This file only:
 *   1. fetches the combined mock JSON (sample-data/2922.json — all 3 books),
 *   2. selects ONE book family by BookNumber (baseOf match — main + attachments),
 *   3. hands that family to filmtvBook.render(), and
 *   4. mounts a floating bottom-right dev switcher to preview other BookNumbers.
 *
 * In production each book is its own route carrying the BookNumber, so the
 * combined-file fetch, the family selection, AND the switcher all go away —
 * the backend passes exactly one book's data straight to render().
 * ============================================================ */
(function () {
  "use strict";

  var SELF =
    (document.currentScript && document.currentScript.src) ||
    (function () {
      var s = document.querySelector('script[src*="book.mock.js"]');
      return s ? s.src : window.location.href;
    })();

  /* >>> MOCK DATA URL <<< the combined sample (電影雙周刊 CE_0648a + 25 / 956 / 2922).
     Rebuild it from the phpMyAdmin exports with sample-data/build-book-sample.js. */
  var DATA_URL = new URL("./sample-data/book-sample.json", SELF).href;

  /* Which BookNumber to show on load (the new 電影雙周刊 DVD Magazine data). */
  var DEFAULT_BOOK = "CE_0648";

  function roots() {
    var found = document.querySelectorAll("[data-book], [data-collection]");
    return found.length ? found : [document];
  }
  function srcOf(root) {
    return (root.getAttribute && root.getAttribute("data-src")) || DATA_URL;
  }

  /* ---------- bootstrap ---------- */
  ready(function () {
    injectSwitcherCss();
    var list = roots();
    for (var i = 0; i < list.length; i++) {
      if (window.filmtvBook.showLoading) window.filmtvBook.showLoading(list[i]); // skeleton before the fetch
      loadInto(list[i]);
    }
  });

  function loadInto(root) {
    var url = srcOf(root);
    fetch(url, { credentials: "omit" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) {
        root.__data = data || {};                  // cache so the switcher can re-select
        mountSwitcher(root);
        // NOTE: default-book auto-render is intentionally OFF so the empty state is
        // visible on a bare load while it's being designed. Pick a book from the
        // switcher to preview real data. To restore the old auto-preview, call
        // show(root, ... || DEFAULT_BOOK) here instead of showEmpty().
        var initial = root.getAttribute && root.getAttribute("data-book-number");
        if (initial) show(root, initial);
        else window.filmtvBook.showEmpty(root);
      })
      .catch(function (err) { console.error("[book.mock] load failed (" + url + "):", err); });
  }

  // Select one book family from the combined file and hand it to the component.
  // baseOf strips a trailing attachment letter, so "CE_0001" and "CE_0001a" both
  // resolve to the same family. (The backend does the equivalent server-side.)
  function show(root, bookNumber) {
    var data = root.__data || {};
    var base = baseOf(bookNumber);
    var items = (Array.isArray(data.items) ? data.items : []).filter(function (it) {
      return baseOf(it.bookNumber) === base;
    });
    if (root.setAttribute) root.setAttribute("data-book-number", bookNumber);
    window.filmtvBook.render(root, { items: items, imageBase: data.imageBase || "" });
    setSwitcherNote(root, items.length ? "" : "找不到 BookNumber：" + bookNumber);
    markActiveChip(bookNumber);
  }

  function baseOf(bn) {
    return String(bn == null ? "" : bn).replace(/[a-z]+$/, "");
  }
  // Distinct base BookNumbers present in the loaded sample (first-seen order).
  function availableBooks(data) {
    var seen = {}, out = [];
    var items = data && Array.isArray(data.items) ? data.items : [];
    for (var i = 0; i < items.length; i++) {
      var b = baseOf(items[i].bookNumber);
      if (b && !seen[b]) { seen[b] = 1; out.push(b); }
    }
    return out;
  }

  /* ---------- floating dev switcher ---------- */
  function injectSwitcherCss() {
    if (document.getElementById("filmtv-book-switcher-css")) return;
    var st = document.createElement("style");
    st.id = "filmtv-book-switcher-css";
    st.textContent =
      '.book-switcher{position:fixed;right:1rem;bottom:1rem;z-index:9999;display:flex;' +
      'flex-direction:column;gap:.4rem;align-items:stretch;padding:.5rem .6rem;border-radius:10px;' +
      'background:rgba(28,26,24,.92);color:#fff;font:500 13px/1.2 system-ui,sans-serif;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.25)}' +
      '.book-switcher-books{display:flex;flex-wrap:wrap;gap:.3rem;align-items:center;max-width:20rem}' +
      '.book-switcher-books .lbl{opacity:.6;font-weight:400}' +
      '.book-switcher-chip{padding:.18rem .5rem;border:1px solid rgba(255,255,255,.3);border-radius:999px;' +
      'background:transparent;color:#fff;font:inherit;font-size:12px;cursor:pointer}' +
      '.book-switcher-chip:hover{background:rgba(255,255,255,.15)}' +
      '.book-switcher-chip.is-active{background:#8a1c2b;border-color:#8a1c2b}' +
      '.book-switcher-row{display:flex;gap:.4rem;align-items:center}' +
      '.book-switcher label{opacity:.75}' +
      '.book-switcher input{width:6.5rem;padding:.3rem .45rem;border:1px solid rgba(255,255,255,.25);' +
      'border-radius:6px;background:#fff;color:#1c1a18;font:inherit}' +
      '.book-switcher-row button{padding:.32rem .7rem;border:0;border-radius:6px;cursor:pointer;' +
      'background:#8a1c2b;color:#fff;font:inherit}' +
      '.book-switcher .book-switcher-note{opacity:.7;font-weight:400;max-width:20rem}';
    (document.head || document.documentElement).appendChild(st);
  }

  function mountSwitcher(root) {
    if (root.__switcher) return;
    if (document.querySelector(".book-switcher")) return;   // one switcher per page
    var box = document.createElement("div");
    box.className = "book-switcher";
    box.innerHTML =
      '<div class="book-switcher-books"><span class="lbl">可選書號：</span></div>' +
      '<div class="book-switcher-row">' +
      '<label for="book-switcher-input">BookNumber</label>' +
      '<input id="book-switcher-input" type="text" autocomplete="off" ' +
      'placeholder="CE_0648 / 25 / 956 / 2922" />' +
      '<button type="button">顯示</button>' +
      '<span class="book-switcher-note"></span>' +
      '</div>';
    var input = box.querySelector("input");
    var btn = box.querySelector("button");
    input.value = (root.getAttribute && root.getAttribute("data-book-number")) || DEFAULT_BOOK;
    function go() {
      var bn = input.value.trim();
      if (bn) show(root, bn);
    }
    btn.addEventListener("click", go);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });

    // Chips listing every BookNumber available in the loaded sample.
    var booksBox = box.querySelector(".book-switcher-books");
    availableBooks(root.__data).forEach(function (bn) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "book-switcher-chip";
      chip.textContent = bn;
      chip.addEventListener("click", function () { input.value = bn; show(root, bn); });
      booksBox.appendChild(chip);
    });

    document.body.appendChild(box);
    root.__switcher = box;
  }
  function markActiveChip(bookNumber) {
    var base = baseOf(bookNumber);
    var chips = document.querySelectorAll(".book-switcher-chip");
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle("is-active", chips[i].textContent === base);
    }
  }
  function setSwitcherNote(root, text) {
    var note = document.querySelector(".book-switcher-note");
    if (note) note.textContent = text || "";
  }

  /* ---------- utils ---------- */
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
})();
