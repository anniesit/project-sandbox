/* ============================================================
 * supplementary.js — Danny Yung archive SUPPLEMENTARY MATERIALS renderer
 *
 * Sibling of catalogue.js, not a variant of it loaded on the same page. The
 * two pages currently show OVERLAPPING record sets — this one is an explicit
 * ID allowlist for a concept mockup, not a categoryKey filter, so a record
 * can appear here and still carry a real category like "劇場" (see
 * build-supplementary-sample.py) — and the credit line means something
 * different on each: 導演 (director) on the catalogue, 作者 (author) here,
 * because these records are books and commentary ABOUT Danny Yung's work,
 * not productions he directed. Keeping them as separate files means a fix to
 * one page's filters cannot silently change the other's.
 *
 * Ownership split, same as catalogue.js:
 *   - this file owns the VISUAL: rendering records into the result-item
 *     template, painting pagination, firing an event on filter change.
 *   - the backend integration owns the STATE: fetching, matching, sorting,
 *     current page. It calls render() with each page; this file keeps no
 *     search state of its own.
 *
 * Integration API (global):
 *   window.dySupplementary.render(rootEl, { items, total, page, pages })
 *     rootEl : the [data-supplementary] element (or omit to render all)
 *     items  : array of records for the CURRENT page (shape below)
 *   window.dySupplementary.getQuery(rootEl)  -> the current UI selection
 *   window.dySupplementary.applyQuery(rootEl, query)  -> set controls to match
 *
 * Events (bubbling, on the [data-supplementary] root):
 *   "dy:supp-query"  detail = { yearFrom, yearTo, q, sort, page }
 *     A different event name than the catalogue's "dy:query", on purpose —
 *     the two components can sit in the same document (they do not today)
 *     without a listener on one accidentally answering the other.
 *
 * Record shape (see sample-data/supplementary-sample.json, the contract):
 *   {
 *     "id": "DYP-000105",
 *     "title": "其他-1996",
 *     "titleEn": "Non-project-based-1996",
 *     "category": "",                  // shown as is; "" drops the chip
 *     "year": 1996,
 *     "location": "",
 *     "authors": ["榮念曾"],           // multi-valued, joined with "、"
 *     "notes": "",
 *     "mediaCount": 1,
 *     "href": "/entry?id=DYP-000105"
 *   }
 * category IS rendered here, and shown AS IS — including "劇場" on the two
 * records (DYP-000099, DYP-000104) whose spreadsheet row still tags them a
 * theatre production. That mismatch is deliberately visible, not hidden: see
 * build-supplementary-sample.py's header for why this page's selection is an
 * ID list rather than a categoryKey filter. A record with a genuinely empty
 * category (the five 其他-YYYY records, and DYP-000102) still drops the chip
 * via the same [data-field-group=category] rule the catalogue page uses.
 *
 * data-* contract (authored in Webflow; changing these breaks the page):
 *   [data-supplementary]              the root; everything queried inside it
 *   [data-rows] / [data-row-template] the result list and its clone source
 *   [data-field=title|year|location|author]   text sinks
 *   [data-field-group=category|location|author]  fragment removed when that
 *                                     field is empty (the leftover chip, the
 *                                     "/" + location, the whole 作者： block)
 *   [data-field-link]                 the whole-row link; only URL on the item
 *   [data-year-from] / [data-year-to] numeric year inputs
 *   [data-search]                     search input
 *   [data-sort]                       the sort .dropdown
 *   [data-count]                      result count line (aria-live)
 *   [data-empty]                      shown when nothing matches
 *   [data-pagination]                 nav; buttons generated into it
 *
 * No category facet and no author/location facet dropdowns — this page has
 * 8 records today and no filtering need for either. If the set grows enough
 * to need filtering by author, add a facet the way catalogue.js adds director,
 * rather than teaching this file categories it does not have.
 * ============================================================ */
(function () {
  "use strict";

  var SELF =
    (document.currentScript && document.currentScript.src) ||
    (function () {
      var s = document.querySelector('script[src*="supplementary.js"]');
      return s ? s.src : window.location.href;
    })();

  /* >>> MOCK DATA URL <<< the backend replaces this (or removes the mock
     driver at the bottom of this file and calls render() with live data). */
  var DATA_URL = new URL("./sample-data/supplementary-sample.json", SELF).href;

  var PER_PAGE = 12;

  /* ---------- rendering ---------- */

  function render(root, payload) {
    if (!root) {
      var all = document.querySelectorAll("[data-supplementary]");
      for (var i = 0; i < all.length; i++) render(all[i], payload);
      return;
    }
    payload = payload || {};
    var items = payload.items || [];
    var page = payload.page || 1;
    var pages = payload.pages || 1;
    var total = payload.total == null ? items.length : payload.total;

    var body = root.querySelector("[data-rows]");
    var tpl = template(root);
    if (!body || !tpl) return;

    removeClones(body);
    for (var j = 0; j < items.length; j++) {
      body.appendChild(buildRow(root, tpl, items[j]));
    }

    var countEl = root.querySelector("[data-count]");
    if (countEl) countEl.textContent = countLine(root, total, page, items.length);
    var emptyEl = root.querySelector("[data-empty]");
    if (emptyEl) emptyEl.hidden = items.length > 0;

    paint(root, page, pages);

    if (root.__pageChanged) {
      root.__pageChanged = false;
      returnToTop(root);
    }
  }

  /* Same rationale as catalogue.js: pagination moves both scroll and focus,
     filter/search changes move neither. See catalogue.js for the long form. */
  function returnToTop(root) {
    var list = root.querySelector("[data-rows]");
    if (list) {
      list.setAttribute("tabindex", "-1");
      try { list.focus({ preventScroll: true }); } catch (e) { list.focus(); }
    }
    window.scrollTo(0, 0);
  }

  function lang(root) {
    var el = (root.closest && root.closest("[lang]")) || document.documentElement;
    return (el.getAttribute("lang") || "zh-Hant").toLowerCase().indexOf("en") === 0
      ? "en"
      : "zh";
  }

  function countLine(root, total, page, shown) {
    var en = lang(root) === "en";
    if (!total) return en ? "No records" : "共 0 項";
    var from = (page - 1) * PER_PAGE + 1;
    var to = (page - 1) * PER_PAGE + shown;
    return en
      ? total + " records — showing " + from + "–" + to
      : "共 " + total + " 項，顯示第 " + from + "–" + to + " 項";
  }

  function noTitle(root) {
    return lang(root) === "en" ? "Untitled" : "無標題";
  }

  function template(root) {
    if (root.__tpl) return root.__tpl;
    var el = root.querySelector("[data-row-template]");
    if (!el) return null;
    var clone = el.cloneNode(true);
    clone.removeAttribute("data-row-template");
    el.remove();
    root.__tpl = clone;
    return clone;
  }

  function buildRow(root, tpl, item) {
    var li = tpl.cloneNode(true);
    li.setAttribute("data-clone", "");
    li.setAttribute("data-id", item.id || "");
    setField(li, "title", item.title || item.titleEn || noTitle(root));
    setField(li, "category", item.category);
    setField(li, "year", item.year);
    setField(li, "location", item.location);
    setField(li, "author", (item.authors || []).join("、"));
    var link = li.querySelector("a[data-field-link]");
    if (link && item.href) link.setAttribute("href", item.href);
    return li;
  }

  /* Identical rule to catalogue.js's setField: a missing value drops the
     fragment that carries it (the chip, the "/" + location, the 作者： line)
     instead of printing an em dash. Title and year have no group and fall
     back to an em dash instead, since dropping them would leave a headless
     row. */
  function setField(row, name, value) {
    var text = value == null || value === "" ? "" : String(value);
    if (text === "") {
      var groups = row.querySelectorAll('[data-field-group="' + name + '"]');
      for (var g = 0; g < groups.length; g++) {
        if (groups[g].parentNode) groups[g].parentNode.removeChild(groups[g]);
      }
    }
    var els = row.querySelectorAll('[data-field="' + name + '"]');
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = text === "" ? "—" : text;
    }
  }

  /* ---------- pagination (visual only; emits dy:supp-query) ---------- */

  function paint(root, page, pages) {
    var nav = root.querySelector("[data-pagination]");
    if (!nav) return;
    removeClones(nav);
    if (pages < 2) return;
    var seq = [];
    for (var i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || Math.abs(i - page) <= 1) seq.push(i);
      else if (seq[seq.length - 1] !== "…") seq.push("…");
    }
    for (var k = 0; k < seq.length; k++) {
      nav.appendChild(pageButton(root, seq[k], page));
    }
  }

  function pageButton(root, value, current) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "pagination-btn" + (value === current ? " cc-current" : "");
    b.textContent = value;
    b.setAttribute("data-clone", "");
    if (value === "…") {
      b.disabled = true;
    } else {
      if (value === current) b.setAttribute("aria-current", "page");
      b.addEventListener("click", function () {
        root.__pageChanged = true;
        emit(root, value);
      });
    }
    return b;
  }

  /* ---------- reading the controls ---------- */

  function getQuery(root, page) {
    return {
      yearFrom: num(root.querySelector("[data-year-from]")),
      yearTo: num(root.querySelector("[data-year-to]")),
      q: val(root.querySelector("[data-search]")),
      sort: selected(root, "[data-sort]") || "year-desc",
      page: page || 1,
    };
  }

  function emit(root, page) {
    var detail = getQuery(root, page);
    root.dispatchEvent(new CustomEvent("dy:supp-query", { detail: detail, bubbles: true }));
  }

  function applyQuery(root, q) {
    if (!root || !q) return;
    setInput(root.querySelector("[data-year-from]"), q.yearFrom);
    setInput(root.querySelector("[data-year-to]"), q.yearTo);
    setInput(root.querySelector("[data-search]"), q.q);
    selectOption(root.querySelector("[data-sort]"), q.sort || "year-desc");
  }

  function setInput(el, v) {
    if (el) el.value = v == null || v === "" ? "" : String(v);
  }

  function selectOption(scope, value) {
    if (!scope) return;
    var dd = scope.matches("[data-dropdown]") ? scope : scope.querySelector("[data-dropdown]");
    if (!dd) return;
    var opts = dd.querySelectorAll("[data-dropdown-option]");
    var chosen = null;
    for (var i = 0; i < opts.length; i++) {
      var on = opts[i].getAttribute("data-value") === String(value);
      opts[i].setAttribute("aria-selected", on ? "true" : "false");
      if (on) chosen = opts[i];
    }
    if (!chosen) return;
    var label = dd.querySelector("[data-dropdown-value]");
    if (label) label.textContent = chosen.textContent.trim();
    var hidden = dd.querySelector('input[type="hidden"]');
    if (hidden) hidden.value = String(value);
  }

  function selected(root, sel) {
    var dd = root.querySelector(sel);
    if (!dd) return "all";
    var opt = dd.querySelector('[data-dropdown-option][aria-selected="true"]');
    return opt ? opt.getAttribute("data-value") : "all";
  }
  function val(el) {
    return el && el.value ? el.value.trim() : "";
  }
  function num(el) {
    var n = el ? parseInt(el.value, 10) : NaN;
    return isFinite(n) ? n : null;
  }

  /* ---------- wiring (visual; every change just emits) ---------- */

  function init(root) {
    if (root.__wired) return;
    root.__wired = true;

    root.addEventListener("input", function (e) {
      var t = e.target;
      if (!t || !t.matches) return;
      if (t.matches("[data-search], [data-year-from], [data-year-to]")) emit(root, 1);
    });

    root.addEventListener("click", function (e) {
      var opt = e.target.closest ? e.target.closest("[data-dropdown-option]") : null;
      if (!opt || !root.contains(opt)) return;
      var dd = opt.closest("[data-dropdown]");
      if (!dd) return;
      var label = dd.querySelector("[data-dropdown-value]");
      if (label) label.textContent = opt.textContent.trim();
      var opts = dd.querySelectorAll("[data-dropdown-option]");
      for (var i = 0; i < opts.length; i++) {
        opts[i].setAttribute("aria-selected", opts[i] === opt ? "true" : "false");
      }
      emit(root, 1);
    });
  }

  /* ---------- utils ---------- */

  function removeClones(host) {
    if (!host) return;
    var clones = host.querySelectorAll(":scope > [data-clone]");
    for (var i = 0; i < clones.length; i++) clones[i].remove();
  }
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    var roots = document.querySelectorAll("[data-supplementary]");
    for (var i = 0; i < roots.length; i++) {
      init(roots[i]);
      mockDriver(roots[i]); // MOCK only; the backend calls render() instead
    }
  });

  /* ============================================================
   * >>> MOCK DRIVER <<< — delete this whole block for production.
   * ============================================================ */
  function mockDriver(root) {
    var url = root.getAttribute("data-src") || DATA_URL;
    fetch(url, { credentials: "omit" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        var all = (data && data.items) || [];
        var first = true;

        function run(q) {
          var list = all.filter(function (i) {
            return mockMatch(i, q);
          });
          mockSort(list, q.sort);
          var pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
          var page = Math.min(q.page || 1, pages);
          render(root, {
            items: list.slice((page - 1) * PER_PAGE, page * PER_PAGE),
            total: list.length,
            page: page,
            pages: pages,
          });
          first = false;
          mockWriteUrl(q);
        }

        root.addEventListener("dy:supp-query", function (e) {
          run(e.detail);
        });

        var fromUrl = mockReadUrl();
        if (fromUrl) {
          render(root, { items: [], total: 0, page: 1, pages: 1 });
          first = false;
          applyQuery(root, fromUrl);
          run(fromUrl);
        } else {
          run(getQuery(root, 1));
        }
      })
      .catch(function (err) {
        console.error("[supplementary] mock load failed (" + url + "):", err);
      });
  }

  function mockMatch(item, q) {
    if (q.yearFrom && (!item.year || item.year < q.yearFrom)) return false;
    if (q.yearTo && (!item.year || item.year > q.yearTo)) return false;
    if (q.q) {
      var hay = [item.title, item.titleEn, item.category, item.location, (item.authors || []).join(" "), item.year]
        .join(" ")
        .toLowerCase();
      if (hay.indexOf(q.q.toLowerCase()) < 0) return false;
    }
    return true;
  }

  function mockSort(list, sort) {
    list.sort(function (a, b) {
      if (sort === "title") return String(a.title || "").localeCompare(String(b.title || ""), "zh-Hant");
      var d = (a.year || 0) - (b.year || 0);
      return sort === "year-asc" ? d : -d;
    });
  }

  var URL_KEYS = [
    ["yearFrom", "from", null],
    ["yearTo", "to", null],
    ["q", "q", ""],
    ["sort", "sort", "year-desc"],
    ["page", "page", 1],
  ];

  function mockWriteUrl(q) {
    if (!window.history || !window.history.replaceState) return;
    var p = new URLSearchParams();
    for (var i = 0; i < URL_KEYS.length; i++) {
      var k = URL_KEYS[i][0], param = URL_KEYS[i][1], dflt = URL_KEYS[i][2];
      var v = q[k];
      if (v == null || v === "" || String(v) === String(dflt)) continue;
      p.set(param, String(v));
    }
    var qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
  }

  function mockReadUrl() {
    var p = new URLSearchParams(location.search);
    if (!p.toString()) return null;
    var q = {};
    for (var i = 0; i < URL_KEYS.length; i++) {
      var k = URL_KEYS[i][0], param = URL_KEYS[i][1], dflt = URL_KEYS[i][2];
      var raw = p.get(param);
      if (raw == null) { q[k] = dflt; continue; }
      q[k] = (k === "yearFrom" || k === "yearTo" || k === "page")
        ? (parseInt(raw, 10) || dflt)
        : raw;
    }
    q.page = q.page || 1;
    return q;
  }
  /* >>> END MOCK DRIVER <<< */

  /* ---------- public API (for backend integration) ---------- */
  window.dySupplementary = { render: render, getQuery: getQuery, applyQuery: applyQuery };
})();
