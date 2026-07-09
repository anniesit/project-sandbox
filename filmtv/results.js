/* ============================================================
 * results.js — Film/TV publication search-results RENDERER
 *
 * Ownership split:
 *   - results.js (this file) owns the VISUAL: rendering data into the
 *     Webflow templates + the view toggle (article <-> book).
 *   - The backend integration owns the STATE: fetching, the loading
 *     spinner, pagination, and result limits. It calls render() with
 *     each page of data; this file does not paginate or manage loading.
 *
 * Integration API (global):
 *   window.filmtvResults.render(rootEl, { items, counts, imageBase })
 *     rootEl  : the [data-results] element (or omit to render all)
 *     items   : the SAME array drives both views — article cards AND book rows
 *               (book view groups them by bookNumber). One render fills both.
 *     counts  : { articles, books } for the toggle (optional; else computed)
 *     imageBase: optional prefix when items carry filenames (else full URLs)
 *   window.filmtvResults.setView(rootEl, "article" | "book")
 *
 * A thin self-fetch of DATA_URL runs only as the MOCK driver; the backend
 * can remove it and call render() directly. See HANDOFF.md for the full
 * three-file integration contract (results + chart + cooccur).
 *
 * VIEW TOGGLE: article and book views share ONE payload, so flipping the toggle
 * does NOT paginate or re-fetch — both panels are pre-rendered and the toggle is
 * a pure CSS panel swap. It fires no event; the chart is article-only and does
 * not follow this toggle.
 *
 * PAGINATION: call THIS render() once per page of results. A page turn must NOT
 * re-render the chart (filmtvChart) — the chart shows the whole result set and
 * would re-animate. The chart is (re)rendered per search/filter, not per page.
 *
 * - Dependency-free, multi-instance safe. Never writes inline element styles.
 *   (It injects ONE <style> rule at runtime for view-panel visibility — see
 *   injectViewCss; this keeps the Designer canvas showing both panels.)
 *
 * data-* contract: see the Webflow build. Field hooks:
 *   [data-tpl=article-card] / [data-tpl=book-row]   (templates; may be <template> tags)
 *   img[data-field=thumbnail|cover]
 *   [data-field=publication]   journal › 第N期 (book: journal+第N期) — LEAF nodes only
 *   [data-field=book-date]     datePublished; empty -> hide its wrapper
 *   [data-field=title]         empty -> "無標題" (book article: only if section also empty)
 *   [data-field=section|author|page]  value only; empty -> hide its row + label
 *   [data-field=article-type]  ARTICLE_TYPES[code] -> label + colour variant; empty -> hide
 *   [data-field=attachment]    special_issue_belongs_to (attachment records only); empty -> hide the element
 *   .access-tag                in the thumbnail; authored hidden (u-d=none). Shown
 *                              when id's 3-char prefix is in ACCESS_TAG_PREFIXES.
 *   .book-article-list > .book-row-article  (nested article template = first one)
 *   [data-view-toggle] / [data-view-btn] / [data-count] / [data-view-panel]
 * ============================================================ */
(function () {
  "use strict";

  var SELF =
    (document.currentScript && document.currentScript.src) ||
    (function () {
      var s = document.querySelector('script[src*="results.js"]');
      return s ? s.src : window.location.href;
    })();

  /* >>> MOCK DATA URL <<< the backend replaces this (or removes the self-fetch
     and calls render() directly with live, paginated data). book-sample.json is
     the combined sample (TVW/FMP + the 電影雙周刊 CE_0648 family) so the search
     page shows the attachment records too. */
  var DATA_URL = new URL("./sample-data/book-sample.json", SELF).href;

  /* Article-type code -> { label, variant }. Sourced from the "文章類別" filter
     accordion (the 3 dividers split it into 4 colour groups). Single source of truth. */
  var ARTICLE_TYPES = {
    21: { label: "電影故事、小說、本事", variant: "is-film" },
    19: { label: "電影對白、劇本、分鏡大綱", variant: "is-film" },
    9: { label: "歌詞、歌譜", variant: "is-film" },
    6: { label: "人物專訪、花絮", variant: "is-film" },
    4: { label: "電影資訊及評論", variant: "is-film" },
    5: { label: "電視節目資訊及評論", variant: "is-film" },
    25: { label: "電影節、影視文化活動", variant: "is-film" },
    26: { label: "電影獎項、頒獎典禮", variant: "is-film" },
    31: { label: "電影票房記錄", variant: "is-film" },
    11: { label: "電視節目表、活動日程", variant: "is-film" },
    18: { label: "職員表、演員表、人物表", variant: "is-film" },
    32: { label: "作品年表", variant: "is-film" },
    13: { label: "編輯的話、讀者來信、序言、後記", variant: "is-cultural" },
    15: { label: "唱片、音樂資訊及評論", variant: "is-cultural" },
    28: { label: "文學創作、書摘", variant: "is-cultural" },
    27: { label: "文學及藝術評論、書評", variant: "is-cultural" },
    20: { label: "現場表演、舞台藝術", variant: "is-cultural" },
    7: { label: "消閒、資訊讀物、教學文章", variant: "is-cultural" },
    17: { label: "插畫、漫畫、小遊戲", variant: "is-cultural" },
    29: { label: "辭典、詞條", variant: "is-cultural" },
    23: { label: "公司通訊、資料", variant: "is-comm" },
    16: { label: "產品、商鋪", variant: "is-comm" },
    1: { label: "廣告、優惠券", variant: "is-comm" },
    12: { label: "抽獎得獎名單", variant: "is-comm" },
    10: { label: "報名、意見調查、雜誌表格", variant: "is-comm" },
    3: { label: "目錄、內容、片目索引", variant: "is-other" },
    14: { label: "封面、封底、版權頁", variant: "is-other" },
    2: { label: "照片集", variant: "is-other" },
    24: { label: "海報、明信片", variant: "is-other" },
    30: { label: "缺頁", variant: "is-other" },
    22: { label: "外語文章", variant: "is-other" },
    33: { label: "其他類別", variant: "is-other" },
  };
  var TYPE_VARIANT_CLASSES = ["is-film", "is-cultural", "is-comm", "is-other"];

  // Article ids whose first 3 chars are in this list get their (Webflow-authored,
  // hidden) .access-tag shown on the card thumbnail. Add prefixes here to grow it.
  var ACCESS_TAG_PREFIXES = ["TVW"];

  /* ---------- bootstrap ---------- */
  ready(function () {
    injectViewCss();
    var roots = document.querySelectorAll("[data-results]");
    for (var i = 0; i < roots.length; i++) {
      initToggle(roots[i]);
      mockFetch(roots[i]); // MOCK driver only; backend calls render() instead
    }
  });

  // Runtime-only rule so the inactive view-panel is hidden even though the
  // panels are CSS grids (`.u-grid` would beat `[u-d="none"]`). Injected by JS,
  // so the Designer canvas (no JS) keeps both panels visible for editing.
  function injectViewCss() {
    if (document.getElementById("filmtv-results-css")) return;
    var st = document.createElement("style");
    st.id = "filmtv-results-css";
    st.textContent = '[data-results][data-view="article"] [data-view-panel="book"],' + '[data-results][data-view="book"] [data-view-panel="article"]{display:none !important}';
    (document.head || document.documentElement).appendChild(st);
  }

  function mockFetch(root) {
    var url = root.getAttribute("data-src") || DATA_URL;
    fetch(url, { credentials: "omit" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        renderResults(root, data || {});
      })
      .catch(function (err) {
        console.error("[results] mock load failed (" + url + "):", err);
      });
  }

  /* ---------- view toggle (visual; no data) ---------- */
  // Both views render from the SAME payload, so flipping the toggle is a pure CSS
  // panel swap (article cards <-> book rows): no re-fetch, no re-render, no event.
  // The chart is article-only and does not follow this toggle.
  function initToggle(root) {
    root.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-view-btn]") : null;
      if (!btn || !root.contains(btn)) return;
      e.preventDefault();
      var view = btn.getAttribute("data-view-btn");
      if (view === root.getAttribute("data-view")) return; // already showing it
      setView(root, view);
    });
    setView(root, root.getAttribute("data-view") || "article"); // initial state
  }

  function setView(root, view) {
    root.setAttribute("data-view", view);
    var btns = root.querySelectorAll("[data-view-btn]");
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute("data-view-btn") === view;
      btns[i].setAttribute("aria-pressed", on ? "true" : "false");
      btns[i].classList.toggle("cc-active", on);
    }
  }

  /* ---------- renderer (backend calls this per page) ---------- */
  function renderResults(root, data) {
    if (!root) {
      var all = document.querySelectorAll("[data-results]");
      for (var n = 0; n < all.length; n++) renderResults(all[n], data);
      return;
    }
    data = data || {};
    var items = Array.isArray(data.items) ? data.items : [];
    var imageBase = data.imageBase || "";

    var aTplEl = root.querySelector('[data-tpl="article-card"]');
    var bTplEl = root.querySelector('[data-tpl="book-row"]');

    if (aTplEl) {
      var aTpl = tplSource(aTplEl),
        aHost = aTplEl.parentNode;
      hideTemplate(aTplEl);
      removeClones(aHost);
      var af = document.createDocumentFragment();
      for (var i = 0; i < items.length; i++) af.appendChild(buildCard(aTpl, items[i], imageBase));
      aHost.appendChild(af);
    }
    if (bTplEl) {
      var bTpl = tplSource(bTplEl),
        bHost = bTplEl.parentNode;
      hideTemplate(bTplEl);
      removeClones(bHost);
      var groups = groupBy(items, "bookNumber");
      var bf = document.createDocumentFragment();
      for (var g = 0; g < groups.length; g++) bf.appendChild(buildBookRow(bTpl, groups[g], imageBase));
      bHost.appendChild(bf);
    }
    setCounts(root, data, items);
  }

  function setCounts(root, data, items) {
    var c = data.counts || {};
    var aCount = c.articles != null ? c.articles : items.length;
    var bCount = c.books != null ? c.books : groupBy(items, "bookNumber").length;
    setAll(root, '[data-count="article"]', formatNum(aCount));
    setAll(root, '[data-count="book"]', formatNum(bCount));
  }

  /* ---------- builders ---------- */
  function buildCard(tpl, item, imageBase) {
    var card = tpl.cloneNode(true);
    activate(card);
    if (item.href) card.setAttribute("href", item.href);
    setImg(card.querySelector('[data-field="thumbnail"]'), item.image, imageBase, item.title);
    setAccessTag(card, item);
    setLeafField(card, "publication", articlePublication(item));
    setDate(card, item.datePublished);
    setTitle(card, item.title);
    setMeta(card, "section", formatList(item.section));
    setMeta(card, "author", formatList(item.author));
    setMeta(card, "page", item.page);
    setArticleType(card, item.type);
    setAttachment(card, item.special_issue_belongs_to);
    return card;
  }

  function buildBookRow(tpl, group, imageBase) {
    var first = group.items[0] || {};
    var row = tpl.cloneNode(true);
    activate(row);
    setImg(row.querySelector('[data-field="cover"]'), first.image, imageBase, first.journal);
    setAccessTag(row, first);
    setLeafField(row, "publication", bookTitle(first));
    setDate(row, first.datePublished);
    setAttachment(row, first.special_issue_belongs_to);
    renderBookArticles(row, group.items);
    return row;
  }

  // Nested article list inside a book row (.book-article-list). The first
  // .book-row-article's <li> is the template; the rest (static demo) are dropped.
  // Both views share one payload, so a book holds only the articles on this page —
  // we render them ALL inline (no cap, no "顯示其餘 N 篇 / 收起" collapse).
  function renderBookArticles(row, articles) {
    var list = row.querySelector(".book-article-list");
    if (!list) return;
    var article0 = list.querySelector(".book-row-article");
    if (!article0) return;
    var liTpl = article0.closest("li") || article0;
    var liHost = liTpl.parentNode;
    while (liHost.firstChild) liHost.removeChild(liHost.firstChild);

    for (var i = 0; i < articles.length; i++) {
      var li = liTpl.cloneNode(true);
      fillBookArticle(li, articles[i]);
      liHost.appendChild(li);
    }

    // The "顯示其餘 N 篇 / 收起" toggle is AUTHORED in Webflow as a .text-link
    // button inside .book-article-list-wrap. There's no longer anything to
    // collapse, so hide it if present (styling + icon stay in the Designer).
    var toggle = findBookToggle(liHost);
    if (toggle) toggle.setAttribute("u-d", "none");
  }

  // Find the authored toggle: the .text-link (or [data-book-toggle]) directly
  // inside .book-article-list-wrap. Article rows use .book-row-article, so this
  // never matches an article link.
  function findBookToggle(liHost) {
    var wrap = liHost.parentNode;
    if (!wrap) return null;
    return wrap.querySelector(":scope > [data-book-toggle], :scope > .text-link") || null;
  }

  // "section ｜ title" + type tag. both empty -> "無標題"; only one -> show it
  // (hide the pipe); type empty -> hide tag.
  function fillBookArticle(li, a) {
    var sectionEl = leaf(li, "section");
    var titleEl = leaf(li, "title");
    var pipe = li.querySelector(".pipe-wrap, .pipe");
    var section = formatList(a.section);
    var title = a.title == null ? "" : String(a.title);
    var hasSection = section.trim() !== "";
    var hasTitle = title.trim() !== "";

    if (sectionEl) toggle(sectionEl, hasSection, section);
    if (titleEl) {
      if (hasTitle) toggle(titleEl, true, title);
      else if (!hasSection) toggle(titleEl, true, "無標題");
      else toggle(titleEl, false, "");
    }
    if (pipe) toggle(pipe, hasSection && hasTitle, null);
    setArticleType(li, a.type);
    var link = li.querySelector("a[href]");
    if (link && a.href) link.setAttribute("href", a.href);
  }

  /* ---------- template helpers ---------- */
  // Accept either a normal element template or a <template> tag. NOTE: when
  // using <template>, put data-tpl on the <template> element itself (its inner
  // content is not reachable via the page's querySelector).
  function tplSource(el) {
    if (el && el.content && el.content.firstElementChild) return el.content.firstElementChild;
    return el;
  }
  function hideTemplate(el) {
    if (el.tagName === "TEMPLATE") return; // inert already, nothing rendered
    el.setAttribute("u-d", "none");
  }
  function activate(node) {
    node.removeAttribute("u-d");
    node.removeAttribute("data-tpl");
    node.setAttribute("data-clone", "");
  }

  /* ---------- field helpers ---------- */
  function leafFields(scope, name) {
    var all = scope.querySelectorAll('[data-field="' + name + '"]');
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (!all[i].querySelector("[data-field]")) out.push(all[i]);
    }
    return out;
  }
  function leaf(scope, name) {
    return leafFields(scope, name)[0] || null;
  }
  function setLeafField(scope, name, value) {
    var els = leafFields(scope, name);
    for (var i = 0; i < els.length; i++) els[i].textContent = value == null ? "" : String(value);
  }
  function toggle(el, show, text) {
    if (!el) return;
    if (show) {
      if (text != null) el.textContent = text;
      el.removeAttribute("u-d");
    } else el.setAttribute("u-d", "none");
  }
  function setTitle(scope, title) {
    var el = leaf(scope, "title");
    if (el) el.textContent = title && String(title).trim() ? String(title) : "無標題";
  }
  function setDate(scope, date) {
    var el = leaf(scope, "book-date");
    if (!el) return;
    var wrap = el.parentElement || el;
    if (date == null || String(date).trim() === "") wrap.setAttribute("u-d", "none");
    else {
      el.textContent = String(date);
      wrap.removeAttribute("u-d");
    }
  }
  function setArticleType(scope, code) {
    var els = scope.querySelectorAll('[data-field="article-type"]');
    var info = typeInfo(code);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!info) {
        el.setAttribute("u-d", "none");
        continue;
      }
      el.removeAttribute("u-d");
      el.textContent = info.label;
      for (var v = 0; v < TYPE_VARIANT_CLASSES.length; v++) el.classList.remove(TYPE_VARIANT_CLASSES[v]);
      if (info.variant) el.classList.add(info.variant);
    }
  }
  function setMeta(scope, name, value) {
    var els = leafFields(scope, name);
    var empty = value == null || String(value).trim() === "";
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = empty ? "" : String(value);
      var row = els[i].closest("li") || els[i].closest(".article-card-metarow");
      if (row) {
        if (empty) row.setAttribute("u-d", "none");
        else row.removeAttribute("u-d");
      }
    }
  }
  // Optional attachment / special-issue label (item.special_issue_belongs_to).
  // Fills every [data-field="attachment"] leaf; hides the element when empty
  // (only attachment records carry a value, e.g. "電影雙周刊第 648 期附件").
  function setAttachment(scope, value) {
    var els = leafFields(scope, "attachment");
    var empty = value == null || String(value).trim() === "";
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = empty ? "" : String(value);
      if (empty) els[i].setAttribute("u-d", "none");
      else els[i].removeAttribute("u-d");
    }
  }
  function setImg(img, image, imageBase, alt) {
    if (!img) return;
    var file = String(image || "").split("---")[0];
    img.alt = alt || "";
    img.onerror = function () {
      this.onerror = null;
      this.src = placeholder();
    };
    var src = "";
    if (file) src = /^https?:\/\//.test(file) ? file : (imageBase || "") + file;
    img.src = src || placeholder();
  }
  // The .access-tag lives in .result-card-thumbnail (sibling to the thumbnail img),
  // authored hidden in Webflow. Reveal it only for ids whose 3-char prefix is listed.
  function setAccessTag(card, item) {
    var tag = card.querySelector(".access-tag");
    if (!tag) return;
    var prefix = String(item && item.id != null ? item.id : "").slice(0, 3);
    if (ACCESS_TAG_PREFIXES.indexOf(prefix) !== -1) tag.removeAttribute("u-d");
    else tag.setAttribute("u-d", "none");
  }
  function placeholder() {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="219">' + '<rect width="100%" height="100%" fill="#e6e9ea"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  /* ---------- composition ---------- */
  function formatIssue(issue) {
    if (issue == null || String(issue).trim() === "") return "";
    var s = String(issue).trim();
    return /期/.test(s) ? s : "第 " + s + " 期";
  }
  function articlePublication(item) {
    var s = item.journal || "";
    var iss = formatIssue(item.journalIssue);
    if (iss) s += " › " + iss;
    return s;
  }
  function bookTitle(item) {
    return (item.journal || "") + formatIssue(item.journalIssue);
  }
  function typeInfo(code) {
    if (code == null || String(code).trim() === "") return null;
    return ARTICLE_TYPES[code] || { label: String(code), variant: "" };
  }
  function formatList(v) {
    if (v == null) return "";
    return String(v).split("---").join("、");
  }

  /* ---------- utils ---------- */
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
  function groupBy(arr, key) {
    var map = {},
      order = [];
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
  function removeClones(host) {
    if (!host) return;
    var clones = host.querySelectorAll(":scope > [data-clone]");
    for (var i = 0; i < clones.length; i++) clones[i].remove();
  }
  function setAll(root, selector, value) {
    var els = root.querySelectorAll(selector);
    for (var i = 0; i < els.length; i++) els[i].textContent = value;
  }
  function formatNum(n) {
    var num = Number(n);
    return isFinite(num) ? num.toLocaleString("en-US") : String(n);
  }

  /* ---------- public API (for backend integration) ---------- */
  window.filmtvResults = { render: renderResults, setView: setView };
})();
