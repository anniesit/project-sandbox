/* ============================================================
 * catalogue.js — Danny Yung archive CATALOGUE (目錄) renderer
 *
 * Ownership split (same shape as the film/TV archive components):
 *   - catalogue.js (this file) owns the VISUAL: rendering records into the
 *     Webflow result-item template, filling the facet dropdowns, painting the
 *     pagination control, and firing an event when the user changes a filter.
 *   - The backend integration owns the STATE: fetching, which records match,
 *     sorting, and which page is current. It calls render() with each page of
 *     data; this file keeps no search state of its own.
 *
 * Integration API (global):
 *   window.dyCatalogue.render(rootEl, { items, total, page, pages, facets })
 *     rootEl : the [data-catalogue] element (or omit to render all instances)
 *     items  : array of records for the CURRENT page (shape below)
 *     total  : total matching records, for the count line (optional)
 *     page   : 1-based current page (optional; default 1)
 *     pages  : total page count (optional; default 1)
 *     facets : { locations: [], directors: [] } to populate the dropdowns
 *              (optional; only needs sending once)
 *   window.dyCatalogue.getQuery(rootEl)  -> the current UI selection
 *   window.dyCatalogue.applyQuery(rootEl, query)  -> set the controls to match
 *     The inverse of getQuery. Fires nothing. Use it to restore a view from a
 *     URL, a saved search, or a browser Back.
 *
 * Events (bubbling, on the [data-catalogue] root):
 *   "dy:query"  detail = { category, yearFrom, yearTo, location, director,
 *                          q, sort, page }
 *     category is a SINGLE value, not a list — the category facet is a radio
 *     group. "all" means no filter; "other" means records whose categoryKey is
 *     empty (6 of the 88 sample records, mostly the 其他-YYYY buckets).
 *     Fired whenever the user touches a control. The backend listens, refetches
 *     and calls render() again. The component does NOT filter on its own —
 *     except inside the MOCK DRIVER below.
 *
 * Record shape (see sample-data/catalogue-sample.json, which IS the contract):
 *   {
 *     "id": "DYP-000017",
 *     "title": "媒介事件一",
 *     "titleEn": "Media Event 1",
 *     "category": "劇場",             // display label
 *     "categoryKey": "theatre-production",  // stable key, matches the radio values
 *     "year": 1982,
 *     "location": "香港",
 *     "venue": "香港藝術中心演奏廳",
 *     "directors": ["沈聖德", "榮念曾"],     // multi-valued, sometimes 18 long
 *     "notes": "Date: …\nStage Manager: …",  // free text, MULTI-LINE, entry page
 *     "mediaCount": 2,
 *     "href": "#"
 *   }
 *
 * LANGUAGE FALLBACK IS THE DATA LAYER'S JOB, NOT THIS FILE'S. Many source
 * columns are filled in one language only, so title / category / location /
 * venue / directors arrive already resolved: preferred language, else the other
 * one, else empty. A value on a Chinese page may therefore be English. This
 * component renders whatever string it is handed and never chooses a language —
 * keep it that way, or the rule ends up implemented in two places that drift.
 *
 * data-* contract (authored in Webflow; changing these breaks the page):
 *   [data-catalogue]                  the root; everything is queried inside it
 *   [data-rows]                       the <ul> result items are rendered into
 *   [data-row-template]               <li> cloned per record, removed at runtime
 *   [data-field=title|category|year|location|director]   text sinks: a SPAN,
 *                                     never a <p> — see below. `title` has TWO
 *                                     sinks per item and both are written: the
 *                                     visible one in the <h2>, and the
 *                                     .u-sr-only one inside the cover link that
 *                                     gives that link its accessible name.
 *   [data-field-group=category|location|director]   the fragment that is
 *                                     removed from the clone when that field is
 *                                     empty (the chip, the "/" + location, the
 *                                     whole 導演： block)
 *   [data-field-link]                 the a.u-link-cover stretched over the
 *                                     whole <li>. Its href is THE record's
 *                                     destination and the only one — nothing
 *                                     else on the item carries a URL or a click
 *                                     handler. Setting a second one is how the
 *                                     two drift apart.
 *   [data-facet=category|year|location|director]         facet wrappers
 *   [data-facet-value]                category radio -> categoryKey; plus the
 *                                     two synthetic values "all" and "other"
 *   [data-year-from] / [data-year-to] numeric year inputs
 *   [data-search]                     search input
 *   [data-sort]                       the sort .dropdown
 *   [data-count]                      result count line (aria-live)
 *   [data-empty]                      shown when nothing matches
 *   [data-pagination]                 nav; buttons are generated into it
 *
 * Dropdowns reuse the design system's markup (.dropdown / .dropdown-trigger /
 * .dropdown-list / .dropdown-option). Option <li>s for location and director
 * are generated from the data, so no one maintains them by hand.
 *
 * NO <p> ON THIS PAGE. The design system gives p a --bottom-margin token, which
 * fights every gap set on a flex/grid parent. Text sits directly in a span or
 * div. This file only ever sets textContent on existing nodes, so it stays
 * correct either way — but anything added to the Webflow page by hand must use
 * data_whtml_builder (a single root element with direct text), not a Paragraph.
 * See CATALOGUE.md for why the other three routes fail.
 *
 * Dependency-free, multi-instance safe, writes no inline element styles.
 * ============================================================ */
(function () {
  "use strict";

  var SELF =
    (document.currentScript && document.currentScript.src) ||
    (function () {
      var s = document.querySelector('script[src*="catalogue.js"]');
      return s ? s.src : window.location.href;
    })();

  /* >>> MOCK DATA URL <<< the backend replaces this (or removes the mock driver
     at the bottom of this file entirely and calls render() with live data). */
  var DATA_URL = new URL("./sample-data/catalogue-sample.json", SELF).href;

  var PER_PAGE = 12;

  /* ---------- rendering ---------- */

  function render(root, payload) {
    if (!root) {
      var all = document.querySelectorAll("[data-catalogue]");
      for (var i = 0; i < all.length; i++) render(all[i], payload);
      return;
    }
    payload = payload || {};
    var items = payload.items || [];
    var page = payload.page || 1;
    var pages = payload.pages || 1;
    var total = payload.total == null ? items.length : payload.total;

    if (payload.facets) fillFacets(root, payload.facets);

    var body = root.querySelector("[data-rows]");
    var tpl = template(root);
    if (!body || !tpl) return;

    removeClones(body);
    for (var j = 0; j < items.length; j++) {
      body.appendChild(buildRow(tpl, items[j]));
    }

    var countEl = root.querySelector("[data-count]");
    if (countEl) {
      countEl.textContent = total
        ? "共 " + total + " 項，顯示第 " + ((page - 1) * PER_PAGE + 1) + "–" + ((page - 1) * PER_PAGE + items.length) + " 項"
        : "共 0 項";
    }
    var emptyEl = root.querySelector("[data-empty]");
    if (emptyEl) emptyEl.hidden = items.length > 0;

    paint(root, page, pages);

    /* Set by a pagination click, honoured here — after the new rows exist.
       It is a flag rather than something the click handler does itself because
       render() is not synchronous with the click once a real backend is behind
       it: the click emits, the backend fetches, render lands later. Scrolling
       in the click handler would move the page before the rows changed. */
    if (root.__pageChanged) {
      root.__pageChanged = false;
      returnToTop(root);
    }
  }

  /* After paging, the reader is at the BOTTOM of the previous page and the new
     rows have appeared above them — without this they are staring at the
     pagination of a list they have not seen.

     Two things move, not one:
       - the scroll position, back to the top of the page;
       - FOCUS, because paint() destroys and rebuilds the pagination buttons,
         including the one that was just clicked. Focus would otherwise fall to
         <body> and a keyboard user would be dumped at the start of the tab
         order with no idea the page changed. It lands on the results list, so
         a screen reader announces "list, N items" and the next Tab continues
         from the results rather than from the top of the document.

     Only pagination does this. Filter and search changes must NOT — scrolling
     the page on every keystroke in the search box would be unusable. */
  function returnToTop(root) {
    var list = root.querySelector("[data-rows]");
    if (list) {
      list.setAttribute("tabindex", "-1");
      /* preventScroll: focus() would otherwise jump the list into view and
         fight the smooth scroll below. */
      try { list.focus({ preventScroll: true }); } catch (e) { list.focus(); }
    }

    /* The top of the DOCUMENT, not the top of the results — a page change
       should put the reader back at the start of the page, nav and all.
       No sticky-header offset is needed as a result.

       An INSTANT jump, deliberately. The content was replaced wholesale, so
       gliding past a thousand pixels of results the reader will never look at
       only delays them, and it needs no prefers-reduced-motion branch. It is
       also the only reliable option: `behavior: "smooth"` silently does nothing
       in some embedded browsers (measured in the preview pane used to verify
       this), which would leave the reader stranded at the bottom with no error
       to explain it. */
    window.scrollTo(0, 0);
  }


  /* The result-item template is authored in Webflow and stays VISIBLE on the
     canvas so it can be styled. It is lifted out of the DOM on first render. */
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

  function buildRow(tpl, item) {
    var li = tpl.cloneNode(true);
    li.setAttribute("data-clone", "");
    li.setAttribute("data-id", item.id || "");
    setField(li, "title", item.title || item.titleEn || "無標題");
    setField(li, "category", item.category);
    setField(li, "year", item.year);
    setField(li, "location", item.location);
    setField(li, "director", (item.directors || []).join("、"));
    var link = li.querySelector("a[data-field-link]");
    if (link && item.href) link.setAttribute("href", item.href);
    return li;
  }

  /* A missing value drops the whole fragment that carries it, rather than
     printing an em dash. In the list layout an em dash reads as content —
     "2004 / —" and a bare "導演：" both look like data errors. Any element
     marked [data-field-group="<name>"] is removed from the clone when that
     field is empty; the separator carries the location group, so "/" goes
     with it. 16 of 88 sample records have no location, 19 no director, 6 no
     category. Fields with no group (title, year) still fall back to an em
     dash, since dropping them would leave the row headless. */
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

  /* ---------- facet dropdowns ---------- */

  function fillFacets(root, facets) {
    fillDropdown(root, "location", facets.locations || []);
    fillDropdown(root, "director", facets.directors || []);
  }

  function fillDropdown(root, facetName, values) {
    var wrap = root.querySelector('[data-facet="' + facetName + '"]');
    if (!wrap) return;
    var list = wrap.querySelector("[data-dropdown-list]");
    if (!list) return;
    removeClones(list);
    for (var i = 0; i < values.length; i++) {
      list.appendChild(option(values[i], values[i]));
    }
  }

  function option(value, label) {
    var li = document.createElement("li");
    li.className = "dropdown-option";
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", "false");
    li.setAttribute("tabindex", "-1");
    li.setAttribute("data-value", value);
    li.setAttribute("data-dropdown-option", "");
    li.setAttribute("data-clone", "");
    var span = document.createElement("span");
    span.className = "dropdown-option-label";
    span.setAttribute("data-dropdown-option-label", "");
    span.textContent = label;
    li.appendChild(span);
    return li;
  }

  /* ---------- pagination (visual only; emits dy:query) ---------- */

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
    var category = "all";
    var radios = root.querySelectorAll('[data-facet="category"] input[data-facet-value]');
    for (var i = 0; i < radios.length; i++) {
      if (radios[i].checked) category = radios[i].getAttribute("data-facet-value");
    }
    return {
      category: category,
      yearFrom: num(root.querySelector("[data-year-from]")),
      yearTo: num(root.querySelector("[data-year-to]")),
      location: selected(root, '[data-facet="location"]'),
      director: selected(root, '[data-facet="director"]'),
      q: val(root.querySelector("[data-search]")),
      sort: selected(root, "[data-sort]") || "year-desc",
      page: page || 1,
    };
  }

  function emit(root, page) {
    var detail = getQuery(root, page);
    root.dispatchEvent(new CustomEvent("dy:query", { detail: detail, bubbles: true }));
  }

  /* Set the controls to match a query. The inverse of getQuery(), and the other
     half of making a catalogue view addressable: whoever owns state (the mock
     driver here, the backend in production) decides WHEN a query is restored;
     this only knows HOW to show it.

     Deliberately silent — it fires no "dy:query", because the caller already
     has the query it just passed in. Emitting here would loop. */
  function applyQuery(root, q) {
    if (!root || !q) return;
    var radios = root.querySelectorAll('[data-facet="category"] input[data-facet-value]');
    for (var i = 0; i < radios.length; i++) {
      radios[i].checked = radios[i].getAttribute("data-facet-value") === (q.category || "all");
    }
    setInput(root.querySelector("[data-year-from]"), q.yearFrom);
    setInput(root.querySelector("[data-year-to]"), q.yearTo);
    setInput(root.querySelector("[data-search]"), q.q);
    selectOption(root.querySelector('[data-facet="location"]'), q.location || "all");
    selectOption(root.querySelector('[data-facet="director"]'), q.director || "all");
    selectOption(root.querySelector("[data-sort]"), q.sort || "year-desc");
  }

  function setInput(el, v) {
    if (el) el.value = v == null || v === "" ? "" : String(v);
  }

  /* Mirrors what a user click does to a design system dropdown: aria-selected on
     the options, the trigger's visible label, and the hidden input forms.js
     reads. Missing any one of the three leaves the control lying about itself. */
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

    root.addEventListener("change", function (e) {
      if (e.target.closest && e.target.closest("[data-facet-value]")) emit(root, 1);
    });
    root.addEventListener("input", function (e) {
      var t = e.target;
      if (!t || !t.matches) return;
      if (t.matches("[data-search], [data-year-from], [data-year-to]")) emit(root, 1);
    });

    /* Option clicks. The design system's own dropdown script may also run; both
       setting the label is harmless, and doing it here means the page still
       works if that script is absent. */
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
    var roots = document.querySelectorAll("[data-catalogue]");
    for (var i = 0; i < roots.length; i++) {
      init(roots[i]);
      mockDriver(roots[i]); // MOCK only; the backend calls render() instead
    }
  });

  /* ============================================================
   * >>> MOCK DRIVER <<< — delete this whole block for production.
   *
   * This is the backend stand-in. It fetches the sample file, then does what
   * the backend will do: listen for "dy:query", filter/sort/page the records,
   * and call render(). Nothing above this line filters anything.
   *
   * The real backend reimplements these calls against live data — it does not
   * need to reimplement the logic, only the seam: listen to dy:query, and call
   * dyCatalogue.render(root, { items, total, page, pages, facets }).
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
        var facets = {
          locations: uniq(
            all.map(function (i) {
              return i.location;
            })
          ),
          directors: uniq(
            all.reduce(function (acc, i) {
              return acc.concat(i.directors || []);
            }, [])
          ),
        };
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
            facets: first ? facets : null,
          });
          first = false;
          mockWriteUrl(q);
          mockSaveContext(list, q);
        }

        root.addEventListener("dy:query", function (e) {
          run(e.detail);
        });

        /* Restore the view from the URL before the first render, so a shared or
           bookmarked catalogue link opens on the same results. The facets have
           to exist first — the location and director options are generated from
           the data — which is why this runs here and not at page load. */
        var fromUrl = mockReadUrl();
        if (fromUrl) {
          render(root, { items: [], total: 0, page: 1, pages: 1, facets: facets });
          first = false;
          applyQuery(root, fromUrl);
          run(fromUrl);
        } else {
          run(getQuery(root, 1));
        }
      })
      .catch(function (err) {
        console.error("[catalogue] mock load failed (" + url + "):", err);
      });
  }

  function mockMatch(item, q) {
    /* "other" is the escape hatch for records the client left uncategorised —
       it matches an EMPTY categoryKey, not a category called "other". */
    if (q.category === "other") {
      if (item.categoryKey) return false;
    } else if (q.category && q.category !== "all") {
      if (item.categoryKey !== q.category) return false;
    }
    if (q.yearFrom && (!item.year || item.year < q.yearFrom)) return false;
    if (q.yearTo && (!item.year || item.year > q.yearTo)) return false;
    if (q.location !== "all" && item.location !== q.location) return false;
    if (q.director !== "all" && (item.directors || []).indexOf(q.director) < 0) return false;
    if (q.q) {
      var hay = [item.title, item.titleEn, item.category, item.location, item.venue, (item.directors || []).join(" "), item.year]
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

  /* ---- the catalogue view as a URL ----
     Only non-default values are written, so a plain /catalogue stays clean.
     replaceState, not pushState: typing in the search box should not fill the
     user's Back history with one entry per keystroke. */
  var URL_KEYS = [
    ["category", "category", "all"],
    ["yearFrom", "from", null],
    ["yearTo", "to", null],
    ["location", "location", "all"],
    ["director", "director", "all"],
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

  /* ---- the handoff the ENTRY page reads ----
     Stores the WHOLE matching, sorted id list — not just the visible page — so
     the entry page's 上一項 / 下一項 walk the result set the user was actually
     browsing, and can cross a page boundary. Plus the catalogue URL, which is
     what 返回 goes back to.

     sessionStorage, not localStorage: this is one browsing session's context,
     and it must not leak into a new tab opened days later.

     IN PRODUCTION the backend owns this. It can keep this shape, or answer
     "neighbours of X given query Q" from the server — entry.js does not care,
     because it is handed the answer rather than computing it. */
  function mockSaveContext(list, q) {
    try {
      sessionStorage.setItem(
        "dy:catalogue-context",
        JSON.stringify({
          url: location.pathname + location.search,
          query: q,
          ids: list.map(function (i) { return i.id; }),
          titles: list.reduce(function (acc, i) {
            acc[i.id] = i.title || i.titleEn || "";
            return acc;
          }, {}),
          hrefs: list.reduce(function (acc, i) {
            acc[i.id] = i.href || "";
            return acc;
          }, {}),
        })
      );
    } catch (e) {
      /* Private mode, or storage full. The entry page falls back to its own
         default ordering, so this is a degraded experience, not a broken one. */
    }
  }

  function uniq(arr) {
    return arr
      .filter(function (v, i) {
        return v && arr.indexOf(v) === i;
      })
      .sort(function (a, b) {
        return String(a).localeCompare(String(b), "zh-Hant");
      });
  }
  /* >>> END MOCK DRIVER <<< */

  /* ---------- public API (for backend integration) ---------- */
  window.dyCatalogue = { render: render, getQuery: getQuery, applyQuery: applyQuery };
})();
