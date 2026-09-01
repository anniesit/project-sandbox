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
 *     "title": "媒介事件一",          // zh-Hant; falls back to titleEn when empty
 *     "titleEn": "Media Event 1",
 *     "category": "劇場",             // display label
 *     "categoryKey": "theatre-production",  // stable key, matches the radio values
 *     "year": 1982,
 *     "location": "香港",
 *     "venue": "香港藝術中心演奏廳",
 *     "directors": ["沈聖德", "榮念曾"],     // multi-valued, sometimes 18 long
 *     "materialTypes": ["演出照片", "場刊"],
 *     "mediaCount": 2,
 *     "href": "#"
 *   }
 *
 * data-* contract (authored in Webflow; changing these breaks the page):
 *   [data-catalogue]                  the root; everything is queried inside it
 *   [data-rows]                       the <ul> result items are rendered into
 *   [data-row-template]               <li> cloned per record, removed at runtime
 *   [data-field=title|category|year|location|director]   text sinks: a SPAN
 *                                     (or the title <a>), never a <p> — see below
 *   [data-field-group=category|location|director]   the fragment that is
 *                                     removed from the clone when that field is
 *                                     empty (the chip, the "/" + location, the
 *                                     whole 導演： block)
 *   [data-field-link]                 the title <a>; href is set per record
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
        }

        root.addEventListener("dy:query", function (e) {
          run(e.detail);
        });
        run(getQuery(root, 1));
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
  window.dyCatalogue = { render: render, getQuery: getQuery };
})();
