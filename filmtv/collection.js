/* ============================================================
 * collection.js — Film/TV publication COLLECTION PAGE mock renderer
 *
 * ⚠️ MOCK / PREVIEW ONLY. This file exists so the Webflow-authored collection
 * page shows realistic data in the published preview (like results.js does for
 * search). The backend colleague writes her OWN renderer against the live data —
 * this file is NOT part of the handoff. The ONE shared, handed-off component on
 * this page is the chart, which is chart.js (mounted via a [data-chart] hook,
 * data-view="book") — collection.js does not touch it.
 *
 * The collection page lists every book (issue) of ONE publication:
 *   • a YEAR selector  (buttons, one per year the publication ran)
 *   • a GRID of book-cover cards for the selected year
 *   • a book-count-by-year chart  (chart.js, separate — see above)
 *
 * Data (mock): sample-data/collection-tvw.json — carries the year list with
 * per-year book counts, and article-level items[] for the ACTIVE year, grouped
 * by bookNumber into one card per book (same grouping as results.js). A real
 * book holds many articles; a cover card only needs the first.
 *
 * data-* contract (author these hooks in Webflow to match):
 *   [data-collection]              OPTIONAL wrapper — scopes the hooks below to one
 *                                  widget (like [data-results] on search). Omit it
 *                                  and the whole document is the scope, so the hooks
 *                                  can sit anywhere in the layout.
 *     [data-src]                   optional JSON url override (mock only); with no
 *                                  wrapper the default mock URL is used
 *   [data-year-list]               year-button container (a <ul> is fine)
 *     [data-tpl="year-button"]     ONE template — a <button>/<a>, OR an <li>
 *                                  wrapping one (for a semantic <ul> list)
 *       [data-field="year"]        year number text
 *       [data-field="year-count"]  optional per-year book count badge
 *   [data-book-grid]               book-card container
 *     [data-tpl="book-card"]       ONE card template inside it
 *       img[data-field="cover"]    issue cover
 *       [data-field="book-title"]  journal name (香港電視)
 *       [data-field="book-issue"]  第 N 期
 *       [data-field="book-date"]   datePublished; empty -> hides its wrapper
 *   [data-count="book"]            optional: total books in the publication
 *   [data-count="year"]            optional: books shown for the active year
 *   [data-count="year-label"]      optional: the active year number (e.g. 1986)
 *
 * Selecting a year sets the active button and fires (bubbling) filmtv:selectYear
 * { detail:{ year } } — the backend listens, fetches that year's books, calls
 * render() again. The mock only carries the active year, so clicking another year
 * just moves the active state (no cards to swap).
 * ============================================================ */
(function () {
  "use strict";

  var SELF =
    (document.currentScript && document.currentScript.src) ||
    (function () {
      var s = document.querySelector('script[src*="collection.js"]');
      return s ? s.src : window.location.href;
    })();

  /* >>> MOCK DATA URL <<< preview-only; there is no backend seam to keep here. */
  var DATA_URL = new URL("./sample-data/collection-tvw.json", SELF).href;

  // The scope element the hooks are looked up under. [data-collection] is OPTIONAL
  // — wrap the widget in it to scope queries (like [data-results] on the search
  // page, e.g. for multiple widgets); if absent, the whole document is the scope,
  // so [data-year-list] / [data-book-grid] / [data-count] can live anywhere.
  function roots() {
    var found = document.querySelectorAll("[data-collection]");
    return found.length ? found : [document];
  }
  function srcOf(root) {
    return (root.getAttribute && root.getAttribute("data-src")) || DATA_URL;
  }

  /* ---------- bootstrap ---------- */
  ready(function () {
    var list = roots();
    for (var i = 0; i < list.length; i++) {
      bindYearClicks(list[i]);
      mockFetch(list[i]);
    }
  });

  function mockFetch(root) {
    var url = srcOf(root);
    fetch(url, { credentials: "omit" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) { render(root, data || {}); })
      .catch(function (err) { console.error("[collection] mock load failed (" + url + "):", err); });
  }

  /* ---------- render ---------- */
  function render(root, data) {
    if (!root) {
      var list = roots();
      for (var n = 0; n < list.length; n++) render(list[n], data);
      return;
    }
    data = data || {};
    root.__data = data;
    renderYears(root, data);
    renderBooks(root, data);
    setCounts(root, data);
  }

  function renderYears(root, data) {
    var container = root.querySelector("[data-year-list]");
    var tpl = container && container.querySelector('[data-tpl="year-button"]');
    if (!tpl) return;
    // clones become SIBLINGS of the template (like results.js), so an <li> template
    // inside a <ul> yields real <li> list items in that <ul>.
    var host = tpl.parentNode;
    hideTemplate(tpl);
    removeClones(host);

    var years = data.years || [];
    var countsByYear = data.yearBookCounts || [];
    var active = data.activeYear;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < years.length; i++) {
      var btn = tpl.cloneNode(true);
      activate(btn);
      var y = years[i];
      btn.setAttribute("data-year", String(y));
      setLeafField(btn, "year", y);
      setLeafField(btn, "year-count", countsByYear[i] != null ? formatNum(countsByYear[i]) : "");
      setYearActive(btn, String(y) === String(active));
      frag.appendChild(btn);
    }
    host.appendChild(frag);
  }

  function renderBooks(root, data) {
    var container = root.querySelector("[data-book-grid]");
    var tpl = container && container.querySelector('[data-tpl="book-card"]');
    if (!tpl) return;
    var host = tpl.parentNode;   // clones become siblings of the template
    hideTemplate(tpl);
    removeClones(host);

    var items = Array.isArray(data.items) ? data.items : [];
    var imageBase = data.imageBase || "";
    var groups = groupBy(items, "bookNumber");   // one card per book (issue)
    var frag = document.createDocumentFragment();
    for (var g = 0; g < groups.length; g++) {
      frag.appendChild(buildCard(tpl, groups[g].items[0] || {}, imageBase));
    }
    host.appendChild(frag);
  }

  function buildCard(tpl, item, imageBase) {
    var card = tpl.cloneNode(true);
    activate(card);
    if (item.href) card.setAttribute("href", item.href);
    setImg(card.querySelector('[data-field="cover"]'), item.image, imageBase, bookTitle(item));
    setLeafField(card, "book-title", item.journal || "");
    setLeafField(card, "book-issue", formatIssue(item.journalIssue));
    setDate(card, item.datePublished);
    return card;
  }

  function setCounts(root, data) {
    var c = data.counts || {};
    var total = c.books != null ? c.books
      : (data.yearBookCounts || []).reduce(function (a, b) { return a + (b || 0); }, 0);
    var yearCards = groupBy(data.items || [], "bookNumber").length; // books shown (active year)
    setAll(root, '[data-count="book"]', formatNum(total));       // whole-publication total
    setAll(root, '[data-count="year"]', formatNum(yearCards));   // active year's book count
    setAll(root, '[data-count="year-label"]', data.activeYear != null ? String(data.activeYear) : "");
  }

  /* ---------- year selection ---------- */
  function bindYearClicks(root) {
    root.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-year]") : null;
      if (!btn || !root.contains(btn)) return;
      e.preventDefault();
      var year = btn.getAttribute("data-year");
      // move the active state (visual affordance we own)
      var btns = root.querySelectorAll("[data-year]");
      for (var i = 0; i < btns.length; i++) setYearActive(btns[i], btns[i] === btn);
      // fire for the backend to fetch that year's books (bubbles to document)
      emit(root, "filmtv:selectYear", { year: Number(year) });
    });
  }

  // Mark a year selected. Works whether the [data-tpl] clone is the button/link
  // itself or an <li> wrapping one: cc-active goes on the clone (so an <li> can be
  // styled), aria-pressed on the actual control.
  function yearControl(node) {
    if (node.matches && node.matches("a, button")) return node;
    return node.querySelector("a, button") || node;
  }
  function setYearActive(node, on) {
    node.classList.toggle("cc-active", on);
    var ctrl = yearControl(node);
    ctrl.setAttribute("aria-pressed", on ? "true" : "false");
    if (ctrl !== node) ctrl.classList.toggle("cc-active", on);
  }

  function emit(root, name, detail) {
    var ev;
    try { ev = new CustomEvent(name, { detail: detail, bubbles: true }); }
    catch (err) {
      ev = document.createEvent("CustomEvent");
      ev.initCustomEvent(name, true, false, detail);
    }
    root.dispatchEvent(ev);
  }

  /* ---------- template helpers (same conventions as results.js) ---------- */
  function hideTemplate(el) { if (el.tagName !== "TEMPLATE") el.setAttribute("u-d", "none"); }
  function activate(node) {
    node.removeAttribute("u-d");
    node.removeAttribute("data-tpl");
    node.setAttribute("data-clone", "");
  }
  function removeClones(host) {
    if (!host) return;
    var clones = host.querySelectorAll(":scope > [data-clone]");
    for (var i = 0; i < clones.length; i++) clones[i].remove();
  }

  /* ---------- field helpers ---------- */
  // Collect the leaf [data-field="name"] nodes in scope. IMPORTANT: the hook can
  // be on the clone ROOT itself (e.g. the year <button> carries both data-tpl and
  // data-field="year") — querySelectorAll only sees descendants, so check the
  // scope element too, or that field would never be filled.
  function leafFields(scope, name) {
    var sel = '[data-field="' + name + '"]';
    var found = [];
    if (scope.matches && scope.matches(sel)) found.push(scope);
    var all = scope.querySelectorAll(sel);
    for (var i = 0; i < all.length; i++) found.push(all[i]);
    var out = [];
    for (var j = 0; j < found.length; j++) if (!found[j].querySelector("[data-field]")) out.push(found[j]);
    return out;
  }
  function setLeafField(scope, name, value) {
    var els = leafFields(scope, name);
    for (var i = 0; i < els.length; i++) els[i].textContent = value == null ? "" : String(value);
  }
  function setDate(scope, date) {
    var el = leafFields(scope, "book-date")[0];
    if (!el) return;
    var wrap = el.parentElement || el;
    if (date == null || String(date).trim() === "") wrap.setAttribute("u-d", "none");
    else { el.textContent = String(date); wrap.removeAttribute("u-d"); }
  }
  function setImg(img, image, imageBase, alt) {
    if (!img) return;
    var file = String(image || "").split("---")[0];
    img.alt = alt || "";
    img.onerror = function () { this.onerror = null; this.src = placeholder(); };
    var src = "";
    if (file) src = /^https?:\/\//.test(file) ? file : (imageBase || "") + file;
    img.src = src || placeholder();
  }
  function placeholder() {
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="219">' +
      '<rect width="100%" height="100%" fill="#e6e9ea"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  /* ---------- composition ---------- */
  function formatIssue(issue) {
    if (issue == null || String(issue).trim() === "") return "";
    var s = String(issue).trim();
    return /期/.test(s) ? s : "第" + s + "期";
  }
  function bookTitle(item) { return (item.journal || "") + formatIssue(item.journalIssue); }

  /* ---------- utils ---------- */
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
  function groupBy(arr, key) {
    var map = {}, order = [];
    for (var i = 0; i < arr.length; i++) {
      var k = arr[i][key];
      if (!map[k]) { map[k] = { key: k, items: [] }; order.push(k); }
      map[k].items.push(arr[i]);
    }
    return order.map(function (k) { return map[k]; });
  }
  function setAll(root, selector, value) {
    var els = root.querySelectorAll(selector);
    for (var i = 0; i < els.length; i++) els[i].textContent = value;
  }
  function formatNum(n) {
    var num = Number(n);
    return isFinite(num) ? num.toLocaleString("en-US") : String(n);
  }

  /* ---------- public API (mock preview only) ---------- */
  window.filmtvCollection = { render: render };
})();
