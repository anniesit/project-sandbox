/* ============================================================
 * results.js — Film/TV publication search-results renderer
 *
 * Webflow authors the markup (hidden templates with data-* hooks).
 * This script fetches ONE data URL, clones those templates, and
 * fills the hooks. Sample JSON now; backend swaps DATA_URL later
 * (same JSON shape — see the data-* contract below).
 *
 * - Dependency-free, multi-instance safe (scoped to each [data-results]).
 * - Never writes inline styles. Toggles classes / data-* / native
 *   attributes only. All styling lives in Webflow (DS tokens).
 *
 * data-* contract (Webflow template <-> JSON key):
 *   [data-results]                 init root; carries data-view state
 *   [data-view-btn=article|book]   toggle buttons (aria-pressed, cc-active)
 *   [data-count=article|book]      <- counts.{articles,books} (fallback: computed)
 *   [data-sort] input[name=sort]   sort key: "year" | "title"
 *   [data-view-panel=article|book] plain block; inactive hidden via u-d="none"
 *   [data-tpl=article-card] <a>    one per item
 *     [data-field=thumbnail] <img> <- imageBase + image (first of "a---b")
 *     [data-field=publication]      <- journal › journalIssue (datePublished)
 *     [data-field=title]            <- title
 *     [data-field-row=section|author|page|type] wrapper (hidden if empty)
 *       [data-field=section|author|page|type] <- section|author|page|type
 *   [data-tpl=book-row] <div>      one per isPost group
 *     [data-field=cover] <img>      <- group cover (first item image)
 *     a[data-field=book-title]      <- journal + journalIssue
 *     [data-field=book-date]        <- datePublished
 *     [data-list=articles]          holds nested article-item clones
 *       [data-tpl=article-item]     one per article in the group
 *         [data-field=title]        <- title
 *         [data-field-row=section]  wrapper (hidden if empty)
 *           [data-field=section]    <- section
 *   [data-chart]                    deferred mount point (untouched)
 * ============================================================ */
(function () {
  "use strict";

  // Resolve this script's own URL so the sample JSON can be fetched
  // relative to it — no host hardcoding needed on Vercel.
  var SELF =
    (document.currentScript && document.currentScript.src) ||
    (function () {
      var s = document.querySelector('script[src*="results.js"]');
      return s ? s.src : window.location.href;
    })();

  /* >>> SINGLE SWAP POINT <<<
     Replace with the live backend API URL (same JSON shape) when ready.
     Default: the bundled sample JSON next to this script. */
  var DATA_URL = new URL("./sample-data/2922.json", SELF).href;

  ready(function () {
    var roots = document.querySelectorAll("[data-results]");
    for (var i = 0; i < roots.length; i++) initResults(roots[i]);
  });

  function initResults(root) {
    var url = root.getAttribute("data-src") || DATA_URL;
    fetch(url, { credentials: "omit" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        setup(root, data || {});
      })
      .catch(function (err) {
        console.error("[results] failed to load " + url + ":", err);
      });
  }

  /* ---------- per-instance setup (everything scoped to `root`) ---------- */
  function setup(root, data) {
    var items = Array.isArray(data.items) ? data.items : [];
    var imageBase = data.imageBase || "";

    var articleTpl = root.querySelector('[data-tpl="article-card"]');
    var bookTpl = root.querySelector('[data-tpl="book-row"]');
    if (!articleTpl && !bookTpl) {
      console.warn("[results] no templates found under [data-results]");
      return;
    }
    var articleHost = articleTpl ? articleTpl.parentNode : null;
    var bookHost = bookTpl ? bookTpl.parentNode : null;
    var sortKey = currentSort(root);

    function buildCard(item) {
      var card = articleTpl.cloneNode(true);
      activate(card);
      if (item.href) card.setAttribute("href", item.href);
      setImg(card.querySelector('[data-field="thumbnail"]'), item, imageBase);
      setText(card, "publication", publication(item));
      setText(card, "title", item.title || "（無標題）");
      fillRow(card, "section", formatList(item.section));
      fillRow(card, "author", formatList(item.author));
      fillRow(card, "page", item.page);
      fillRow(card, "type", item.type);
      return card;
    }

    function buildBookRow(group) {
      var first = group.items[0] || {};
      var row = bookTpl.cloneNode(true);
      activate(row);
      setImg(row.querySelector('[data-field="cover"]'), first, imageBase);
      setText(row, "book-title", bookTitle(first));
      var titleLink = row.querySelector('a[data-field="book-title"]');
      if (titleLink && first.href) titleLink.setAttribute("href", first.href);
      setText(row, "book-date", first.datePublished || "");

      var itemTpl = row.querySelector('[data-tpl="article-item"]');
      if (itemTpl) {
        var itemHost = itemTpl.parentNode;
        for (var i = 0; i < group.items.length; i++) {
          var it = group.items[i];
          var li = itemTpl.cloneNode(true);
          activate(li);
          setText(li, "title", it.title || "（無標題）");
          fillRow(li, "section", formatList(it.section));
          var link = li.querySelector("a");
          if (link && it.href) link.setAttribute("href", it.href);
          itemHost.appendChild(li);
        }
      }
      return row;
    }

    function renderArticles() {
      if (!articleTpl) return;
      removeClones(articleHost);
      var ordered = sortItems(items, sortKey);
      var frag = document.createDocumentFragment();
      for (var i = 0; i < ordered.length; i++) frag.appendChild(buildCard(ordered[i]));
      articleHost.appendChild(frag);
    }

    function renderBooks() {
      if (!bookTpl) return;
      removeClones(bookHost);
      var groups = groupBy(sortItems(items, sortKey), "isPost");
      var frag = document.createDocumentFragment();
      for (var i = 0; i < groups.length; i++) frag.appendChild(buildBookRow(groups[i]));
      bookHost.appendChild(frag);
    }

    function setCounts() {
      var c = data.counts || {};
      var aCount = c.articles != null ? c.articles : items.length;
      var bCount = c.books != null ? c.books : groupBy(items, "isPost").length;
      setAll(root, '[data-count="article"]', formatNum(aCount));
      setAll(root, '[data-count="book"]', formatNum(bCount));
    }

    function setView(view) {
      root.setAttribute("data-view", view);
      var btns = root.querySelectorAll("[data-view-btn]");
      for (var i = 0; i < btns.length; i++) {
        var on = btns[i].getAttribute("data-view-btn") === view;
        btns[i].setAttribute("aria-pressed", on ? "true" : "false");
        btns[i].classList.toggle("cc-active", on);
      }
      var panels = root.querySelectorAll("[data-view-panel]");
      for (var j = 0; j < panels.length; j++) {
        var show = panels[j].getAttribute("data-view-panel") === view;
        if (show) panels[j].removeAttribute("u-d");
        else panels[j].setAttribute("u-d", "none");
      }
    }

    function reorder() {
      sortKey = currentSort(root);
      renderArticles();
      renderBooks();
    }

    // Toggle (delegated, scoped to this root)
    root.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-view-btn]") : null;
      if (btn && root.contains(btn)) setView(btn.getAttribute("data-view-btn"));
    });

    // Sort (DS single-select dropdown writes a hidden input)
    var sortRoot = root.querySelector("[data-sort]");
    if (sortRoot) {
      var input = sortRoot.querySelector('input[name="sort"]');
      if (input) input.addEventListener("change", reorder);
      // Fallback: re-read after an option click (hidden input updates first)
      sortRoot.addEventListener("click", function (e) {
        var opt = e.target.closest ? e.target.closest("[data-dropdown-option]") : null;
        if (opt) window.setTimeout(reorder, 0);
      });
    }

    // Initial paint
    renderArticles();
    renderBooks();
    setCounts();
    setView(root.getAttribute("data-view") || "article");
  }

  /* ---------- field helpers ---------- */
  // strip template markers and reveal a clone
  function activate(node) {
    node.removeAttribute("u-d");
    node.removeAttribute("data-tpl");
    node.setAttribute("data-clone", "");
  }

  function setText(scope, name, value) {
    var el = scope.querySelector('[data-field="' + name + '"]');
    if (el) el.textContent = value == null ? "" : String(value);
  }

  // Show/hide a labelled row depending on whether its value is empty.
  function fillRow(scope, name, value) {
    var row = scope.querySelector('[data-field-row="' + name + '"]');
    var el = scope.querySelector('[data-field="' + name + '"]');
    var empty = value == null || String(value).trim() === "";
    if (el) el.textContent = empty ? "" : String(value);
    if (row) {
      if (empty) row.setAttribute("u-d", "none");
      else row.removeAttribute("u-d");
    }
  }

  function setImg(img, item, imageBase) {
    if (!img) return;
    var file = String(item.image || "").split("---")[0];
    img.alt = item.title || "";
    img.onerror = function () {
      this.onerror = null;
      this.src = placeholder();
    };
    img.src = imageBase && file ? imageBase + file : placeholder();
  }

  function placeholder() {
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="219">' +
      '<rect width="100%" height="100%" fill="#e6e9ea"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  /* ---------- composition ---------- */
  function publication(item) {
    var s = item.journal || "";
    if (item.journalIssue) s += " › " + item.journalIssue;
    if (item.datePublished) s += " (" + item.datePublished + ")";
    return s;
  }

  function bookTitle(item) {
    return (item.journal || "") + (item.journalIssue ? item.journalIssue : "");
  }

  // "李雋青---姚敏" -> "李雋青、姚敏"
  function formatList(v) {
    if (v == null) return "";
    return String(v).split("---").join("、");
  }

  /* ---------- data ops ---------- */
  function groupBy(arr, key) {
    var map = {}, order = [];
    for (var i = 0; i < arr.length; i++) {
      var k = arr[i][key];
      if (!map[k]) {
        map[k] = { key: k, items: [] };
        order.push(k);
      }
      map[k].items.push(arr[i]);
    }
    return order.map(function (k) {
      return map[k];
    });
  }

  // Isolated so a backend returning pre-ordered items can bypass this.
  function sortItems(list, key) {
    var copy = list.slice();
    if (key === "title") {
      copy.sort(function (a, b) {
        return String(a.title || "").localeCompare(String(b.title || ""), "zh-Hant");
      });
    } else if (key === "year") {
      copy.sort(function (a, b) {
        return String(a.year || a.datePublished || "").localeCompare(
          String(b.year || b.datePublished || "")
        );
      });
    }
    return copy;
  }

  /* ---------- dom utils ---------- */
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function removeClones(host) {
    if (!host) return;
    var clones = host.querySelectorAll(":scope > [data-clone]");
    for (var i = 0; i < clones.length; i++) clones[i].remove();
  }

  function setAll(root, selector, value) {
    var els = root.querySelectorAll(selector);
    for (var i = 0; i < els.length; i++) els[i].textContent = value;
  }

  function currentSort(root) {
    var sortRoot = root.querySelector("[data-sort]");
    if (!sortRoot) return "";
    var input = sortRoot.querySelector('input[name="sort"]');
    if (input && input.value) return input.value;
    var sel = sortRoot.querySelector('[data-dropdown-option][aria-selected="true"]');
    return sel ? sel.getAttribute("data-value") : "";
  }

  function formatNum(n) {
    var num = Number(n);
    return isFinite(num) ? num.toLocaleString("en-US") : String(n);
  }
})();
