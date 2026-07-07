/* ============================================================
 * book.js — Film/TV publication BOOK PAGE mock renderer
 *
 * ⚠️ MOCK / PREVIEW ONLY (same status as collection.js). This file fills the
 * Webflow-authored Book page with realistic table-of-contents data so the
 * published preview looks real. The backend colleague writes her OWN renderer
 * against the live by-article data — this file is NOT part of the handoff.
 * It IS, however, the reference for the data-* contract below.
 *
 * The Book page shows ONE book (issue) of a publication:
 *   • a HEADER  (cover, journal + 第N期, publisher, date, access tag)
 *   • a TABLE OF CONTENTS  — the book's articles as <li> rows, minus the
 *     "non-content" article types (see EXCLUDE_TYPES)
 *   • a first-page THUMBNAIL beside the TOC (first article of type 3)
 *   • TABS that switch between the main book and its future ATTACHMENTS
 *
 * ATTACHMENTS (forward-looking): a book's bookNumber may gain a trailing
 * lowercase letter for each attachment, e.g. book "CE_0001" has attachments
 * "CE_0001a", "CE_0001b". They share the same BASE (letters stripped). This
 * renderer groups the pool by that suffix and gives each group its own <ul>
 * panel + tab. Today's sample data has no attachments, so only the "正刊"
 * (main) tab renders and the tab bar is hidden when there is a single group.
 *
 * DATA: reuses the search sample (sample-data/2922.json — all 3 books). The
 * floating dev switcher (bottom-right, injected) re-renders any BookNumber in
 * that file: 25 / 956 (香港電視) or 2922 (多情河歌集).
 *
 * data-* contract (author these hooks in Webflow; most already exist):
 *   [data-book] | [data-collection]   OPTIONAL scope wrapper (else document).
 *     [data-src]                       optional JSON url override (mock only).
 *   HEADER
 *     img[data-field=cover]            book cover image
 *     [data-field=journal]             optional journal name (h1); no hook today
 *     [data-field=journal-issue]       issue number only (第 / 期 stay static)
 *     [data-field=publisher]           publisher; empty in data -> row hidden
 *     [data-field=book-date]           datePublished; empty -> its wrapper hidden
 *     .access-tag                       shown when id prefix in ACCESS_TAG_PREFIXES
 *   TOC
 *     [data-view-toggle]               tab bar; its FIRST .view-toggle-btn is the
 *                                      tab TEMPLATE (cloned per group). aria-pressed
 *                                      + .cc-active mark the active tab.
 *     .thumbnail.cc-book-toc           wrapper hidden when no type-3 image
 *       img[data-field=toc-img]        first page of the first type-3 article
 *     .book-toc-ul                     panel host; its FIRST <ul> is the panel
 *                                      TEMPLATE (cloned per group). Its first
 *                                      li.book-toc-li is the row template with:
 *         [data-field=section]         column / 專欄 (empty -> hidden)
 *         [data-field=title]           title (empty -> "無標題" unless section shown)
 *         [data-field=author]          author(s) (empty -> hidden)
 *         [data-field=article-type]    ARTICLE_TYPES[type] label + colour variant
 *         [data-field=page]            page number
 *         .pipe                        separator, hidden unless section AND title
 *   COUNTS (optional)
 *     [data-count=article]             kept-article total for the book
 *
 * A tab click is a pure CSS panel swap (fade) — no re-fetch. The switcher is a
 * preview-only affordance (backend removes it); a real Book page is reached by
 * its own route carrying the BookNumber.
 * ============================================================ */
(function () {
  "use strict";

  var SELF =
    (document.currentScript && document.currentScript.src) ||
    (function () {
      var s = document.querySelector('script[src*="book.js"]');
      return s ? s.src : window.location.href;
    })();

  /* >>> MOCK DATA URL <<< preview-only. */
  var DATA_URL = new URL("./sample-data/2922.json", SELF).href;

  /* Which BookNumber to show on load (a TVW 香港電視 book with a type-3 目錄). */
  var DEFAULT_BOOK = "956";

  /* Article types dropped from the TOC (公司通訊 / 產品商鋪 / 廣告 / 得獎名單 / 表格). */
  var EXCLUDE_TYPES = { "23": 1, "16": 1, "1": 1, "12": 1, "10": 1 };

  /* Type used for the beside-TOC first-page thumbnail (目錄 / 內容 / 片目索引). */
  var TOC_IMG_TYPE = "3";

  /* Article-type code -> { label, variant }. Kept in sync with results.js. */
  var ARTICLE_TYPES = {
    "21": { label: "電影故事、小說、本事", variant: "is-film" },
    "19": { label: "電影對白、劇本、分鏡大綱", variant: "is-film" },
    "9":  { label: "歌詞、歌譜", variant: "is-film" },
    "6":  { label: "人物專訪、花絮", variant: "is-film" },
    "4":  { label: "電影資訊及評論", variant: "is-film" },
    "5":  { label: "電視節目資訊及評論", variant: "is-film" },
    "25": { label: "電影節、影視文化活動", variant: "is-film" },
    "26": { label: "電影獎項、頒獎典禮", variant: "is-film" },
    "31": { label: "電影票房記錄", variant: "is-film" },
    "11": { label: "電視節目表、活動日程", variant: "is-film" },
    "18": { label: "職員表、演員表、人物表", variant: "is-film" },
    "32": { label: "作品年表", variant: "is-film" },
    "13": { label: "編輯的話、讀者來信、序言、後記", variant: "is-cultural" },
    "15": { label: "唱片、音樂資訊及評論", variant: "is-cultural" },
    "28": { label: "文學創作、書摘", variant: "is-cultural" },
    "27": { label: "文學及藝術評論、書評", variant: "is-cultural" },
    "20": { label: "現場表演、舞台藝術", variant: "is-cultural" },
    "7":  { label: "消閒、資訊讀物、教學文章", variant: "is-cultural" },
    "17": { label: "插畫、漫畫、小遊戲", variant: "is-cultural" },
    "29": { label: "辭典、詞條", variant: "is-cultural" },
    "23": { label: "公司通訊、資料", variant: "is-comm" },
    "16": { label: "產品、商鋪", variant: "is-comm" },
    "1":  { label: "廣告、優惠券", variant: "is-comm" },
    "12": { label: "抽獎得獎名單", variant: "is-comm" },
    "10": { label: "報名、意見調查、雜誌表格", variant: "is-comm" },
    "3":  { label: "目錄、內容、片目索引", variant: "is-other" },
    "14": { label: "封面、封底、版權頁", variant: "is-other" },
    "2":  { label: "照片集", variant: "is-other" },
    "24": { label: "海報、明信片", variant: "is-other" },
    "30": { label: "缺頁", variant: "is-other" },
    "22": { label: "外語文章", variant: "is-other" },
    "33": { label: "其他類別", variant: "is-other" }
  };
  var TYPE_VARIANT_CLASSES = ["is-film", "is-cultural", "is-comm", "is-other"];
  var ACCESS_TAG_PREFIXES = ["TVW"];

  /* ---------- bootstrap ---------- */
  ready(function () {
    injectCss();
    var list = roots();
    for (var i = 0; i < list.length; i++) {
      mockFetch(list[i]);
      mountSwitcher(list[i]);
    }
  });

  function roots() {
    var found = document.querySelectorAll("[data-book], [data-collection]");
    return found.length ? found : [document];
  }
  function srcOf(root) {
    return (root.getAttribute && root.getAttribute("data-src")) || DATA_URL;
  }

  // Panels fade; the inactive one is display:none so heights don't stack. The
  // rule is injected (not in Webflow) so the Designer canvas shows both panels.
  function injectCss() {
    if (document.getElementById("filmtv-book-css")) return;
    var st = document.createElement("style");
    st.id = "filmtv-book-css";
    st.textContent =
      '.book-toc-panel{transition:opacity .18s ease}' +
      '.book-toc-panel.is-entering{opacity:0}' +
      /* floating dev switcher */
      '.book-switcher{position:fixed;right:1rem;bottom:1rem;z-index:9999;display:flex;' +
      'gap:.4rem;align-items:center;padding:.5rem .6rem;border-radius:10px;' +
      'background:rgba(28,26,24,.92);color:#fff;font:500 13px/1.2 system-ui,sans-serif;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.25)}' +
      '.book-switcher label{opacity:.75}' +
      '.book-switcher input{width:6.5rem;padding:.3rem .45rem;border:1px solid rgba(255,255,255,.25);' +
      'border-radius:6px;background:#fff;color:#1c1a18;font:inherit}' +
      '.book-switcher button{padding:.32rem .7rem;border:0;border-radius:6px;cursor:pointer;' +
      'background:#8a1c2b;color:#fff;font:inherit}' +
      '.book-switcher .book-switcher-note{opacity:.7;font-weight:400;max-width:11rem}';
    (document.head || document.documentElement).appendChild(st);
  }

  function mockFetch(root) {
    var url = srcOf(root);
    fetch(url, { credentials: "omit" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) {
        root.__data = data || {};
        var want = (root.getAttribute && root.getAttribute("data-book-number")) || DEFAULT_BOOK;
        render(root, root.__data, want);
      })
      .catch(function (err) { console.error("[book] mock load failed (" + url + "):", err); });
  }

  /* ---------- render ---------- */
  // bookNumber may be a base ("956") or an attachment id ("CE_0001a"); either way
  // the whole family (base + attachments) is grouped and shown across the tabs.
  function render(root, data, bookNumber) {
    data = data || {};
    var imageBase = data.imageBase || "";
    var base = baseOf(bookNumber);

    var pool = (Array.isArray(data.items) ? data.items : []).filter(function (it) {
      return baseOf(it.bookNumber) === base && !EXCLUDE_TYPES[String(it.type)];
    });

    setSwitcherNote(root, pool.length ? "" : "找不到 BookNumber：" + bookNumber);

    var groups = groupBySuffix(pool);              // main ("") first, then a,b,c…
    var mainItems = (groups[0] && groups[0].suffix === "") ? groups[0].items : (groups[0] ? groups[0].items : []);
    var head = mainItems[0] || pool[0] || {};

    renderHeader(root, head, imageBase);
    renderTocImg(root, mainItems, imageBase);
    renderTabsAndPanels(root, groups, imageBase);
    setAll(root, '[data-count="article"]', formatNum(pool.length));
  }

  /* ---------- header ---------- */
  function renderHeader(root, item, imageBase) {
    setImg(root.querySelector('[data-field="cover"]'), item.image, imageBase, bookTitle(item));
    setLeafField(root, "journal", item.journal || "");        // no-op if unhooked
    setIssue(root, item.journalIssue);
    setMetaRow(root, "publisher", item.publisher);            // absent in data -> row hidden
    setDate(root, item.datePublished);
    setAccessTag(root, item);
  }

  /* ---------- first-page thumbnail (first type-3 article) ---------- */
  function renderTocImg(root, items, imageBase) {
    var img = root.querySelector('[data-field="toc-img"]');
    if (!img) return;
    var wrap = img.closest(".thumbnail") || img.parentElement;
    var first = firstOfType(items, TOC_IMG_TYPE);
    if (first && first.image) {
      setImg(img, first.image, imageBase, "目錄首頁");
      if (wrap) wrap.removeAttribute("u-d");
    } else if (wrap) {
      wrap.setAttribute("u-d", "none");                        // no type-3 or no image
    }
  }

  /* ---------- tabs + TOC panels ---------- */
  function renderTabsAndPanels(root, groups, imageBase) {
    var host = root.querySelector(".book-toc-ul");
    var toggle = root.querySelector("[data-view-toggle]");
    if (!host) return;

    var panelTpl = host.querySelector(":scope > ul") || host.querySelector("ul");
    if (!panelTpl) return;
    var liTpl = panelTpl.querySelector(".book-toc-li");
    if (!liTpl) return;
    liTpl = liTpl.cloneNode(true);                             // detach before we clear

    var btnTpl = toggle ? toggle.querySelector(".view-toggle-btn") : null;
    if (btnTpl) btnTpl = btnTpl.cloneNode(true);

    keepOnly(host, panelTpl);                                  // drop old panels
    hideTemplate(panelTpl);
    if (toggle) clearChildren(toggle);                        // drop authored + old tabs

    for (var g = 0; g < groups.length; g++) {
      host.appendChild(buildPanel(panelTpl, liTpl, groups[g], g, imageBase));
      if (toggle && btnTpl) toggle.appendChild(buildTab(btnTpl, groups[g], g));
    }

    // A lone group (just the main book, no attachments) needs no tab bar.
    if (toggle) {
      if (groups.length > 1) toggle.removeAttribute("u-d");
      else toggle.setAttribute("u-d", "none");
    }

    bindTabs(root, toggle, host);
    showPanel(host, 0);
    setActiveTab(toggle, 0);
  }

  function buildPanel(panelTpl, liTpl, group, idx, imageBase) {
    var ul = panelTpl.cloneNode(false);                        // empty <ul>, keep classes
    activate(ul);
    ul.classList.add("book-toc-panel");
    ul.setAttribute("data-toc-panel", String(idx));
    for (var i = 0; i < group.items.length; i++) {
      ul.appendChild(fillRow(liTpl.cloneNode(true), group.items[i]));
    }
    return ul;
  }

  function fillRow(li, a) {
    var sectionEl = leaf(li, "section");
    var titleEl = leaf(li, "title");
    var pipe = li.querySelector(".pipe");
    var section = formatList(a.section);
    var title = a.title == null ? "" : String(a.title);
    var hasSection = section.trim() !== "";
    var hasTitle = title.trim() !== "";

    if (sectionEl) { sectionEl.textContent = section; toggle(sectionEl, hasSection, null); }
    if (titleEl) {
      if (hasTitle) toggle(titleEl, true, title);
      else if (!hasSection) toggle(titleEl, true, "無標題");
      else toggle(titleEl, false, "");
    }
    if (pipe) togglePipe(pipe, hasSection && hasTitle);
    setMeta(li, "author", formatList(a.author));
    setLeafField(li, "page", a.page == null ? "" : String(a.page));
    setArticleType(li, a.type);
    var link = li.querySelector("a[href]");
    if (link && a.href) link.setAttribute("href", a.href);
    return li;
  }

  function buildTab(btnTpl, group, idx) {
    var btn = btnTpl.cloneNode(true);
    activate(btn);
    btn.setAttribute("data-toc-tab", String(idx));
    btn.setAttribute("type", "button");
    // set the label on the deepest text node (the button wraps its label in a div)
    var labelEl = deepestTextHost(btn);
    if (labelEl) labelEl.textContent = group.label;
    return btn;
  }

  function bindTabs(root, toggle, host) {
    if (!toggle || toggle.__bookBound) return;
    toggle.__bookBound = true;
    toggle.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-toc-tab]") : null;
      if (!btn || !toggle.contains(btn)) return;
      e.preventDefault();
      var idx = Number(btn.getAttribute("data-toc-tab"));
      showPanel(host, idx);
      setActiveTab(toggle, idx);
    });
  }

  // Fade the incoming panel in; the outgoing is display:none so heights don't stack.
  function showPanel(host, idx) {
    var panels = host.querySelectorAll("[data-toc-panel]");
    for (var i = 0; i < panels.length; i++) {
      var p = panels[i];
      if (Number(p.getAttribute("data-toc-panel")) === idx) {
        p.classList.add("is-entering");
        p.removeAttribute("u-d");
        void p.offsetHeight;                                   // reflow, then transition
        p.classList.remove("is-entering");
      } else {
        p.setAttribute("u-d", "none");
      }
    }
  }

  function setActiveTab(toggle, idx) {
    if (!toggle) return;
    var btns = toggle.querySelectorAll("[data-toc-tab]");
    for (var i = 0; i < btns.length; i++) {
      var on = Number(btns[i].getAttribute("data-toc-tab")) === idx;
      btns[i].classList.toggle("cc-active", on);
      btns[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  /* ---------- floating dev switcher (preview only) ---------- */
  function mountSwitcher(root) {
    if (root.__switcher || root === document) {
      // when scope is the document, still mount once on <body>
      if (document.querySelector(".book-switcher")) return;
    }
    var box = document.createElement("div");
    box.className = "book-switcher";
    box.innerHTML =
      '<label for="book-switcher-input">BookNumber</label>' +
      '<input id="book-switcher-input" type="text" autocomplete="off" ' +
      'placeholder="25 / 956 / 2922" />' +
      '<button type="button">顯示</button>' +
      '<span class="book-switcher-note"></span>';
    var input = box.querySelector("input");
    var btn = box.querySelector("button");
    input.value = (root.getAttribute && root.getAttribute("data-book-number")) || DEFAULT_BOOK;
    function go() {
      var bn = input.value.trim();
      if (!bn) return;
      var data = root.__data || {};
      if (root.setAttribute) root.setAttribute("data-book-number", bn);
      render(root, data, bn);
    }
    btn.addEventListener("click", go);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    document.body.appendChild(box);
    root.__switcher = box;
  }
  function setSwitcherNote(root, text) {
    var note = document.querySelector(".book-switcher-note");
    if (note) note.textContent = text || "";
  }

  /* ---------- grouping (base + attachment suffix) ---------- */
  function baseOf(bn) {
    return String(bn == null ? "" : bn).replace(/[a-z]+$/, "");
  }
  function suffixOf(bn) {
    var m = String(bn == null ? "" : bn).match(/([a-z]+)$/);
    return m ? m[1] : "";
  }
  function groupBySuffix(items) {
    var map = {}, order = [];
    for (var i = 0; i < items.length; i++) {
      var s = suffixOf(items[i].bookNumber);
      if (!map[s]) { map[s] = { suffix: s, items: [] }; order.push(s); }
      map[s].items.push(items[i]);
    }
    order.sort(function (a, b) { return a === "" ? -1 : b === "" ? 1 : a < b ? -1 : 1; });
    return order.map(function (s) {
      return { suffix: s, label: s === "" ? "正刊" : "附件 " + s.toUpperCase(), items: map[s].items };
    });
  }
  function firstOfType(items, type) {
    for (var i = 0; i < items.length; i++) if (String(items[i].type) === String(type)) return items[i];
    return null;
  }

  /* ---------- template helpers (same conventions as collection.js) ---------- */
  function hideTemplate(el) { if (el.tagName !== "TEMPLATE") el.setAttribute("u-d", "none"); }
  function activate(node) {
    node.removeAttribute("u-d");
    node.removeAttribute("data-tpl");
    node.setAttribute("data-clone", "");
  }
  function keepOnly(host, keep) {
    var kids = host.children, i;
    for (i = kids.length - 1; i >= 0; i--) if (kids[i] !== keep) host.removeChild(kids[i]);
  }
  function clearChildren(host) { while (host.firstChild) host.removeChild(host.firstChild); }

  /* ---------- field helpers ---------- */
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
  function leaf(scope, name) { return leafFields(scope, name)[0] || null; }
  function setLeafField(scope, name, value) {
    var els = leafFields(scope, name);
    for (var i = 0; i < els.length; i++) els[i].textContent = value == null ? "" : String(value);
  }
  function toggle(el, show, text) {
    if (!el) return;
    if (show) { if (text != null) el.textContent = text; el.removeAttribute("u-d"); }
    else el.setAttribute("u-d", "none");
  }
  // The pipe's authored display is "inline" via a u-d attr on its wrapper; keep
  // that value when showing rather than clobbering it.
  function togglePipe(pipe, show) {
    var wrap = pipe.parentElement || pipe;
    if (show) wrap.removeAttribute("u-d");
    else wrap.setAttribute("u-d", "none");
  }
  // Fill the issue number; hide the whole "第 __ 期" heading when there is none
  // (the 第/期 chars are static siblings, so an empty span would read "第  期").
  function setIssue(scope, issue) {
    var el = leaf(scope, "journal-issue");
    if (!el) return;
    var n = issueNumber(issue);
    el.textContent = n;
    var head = el.closest("h1, h2, h3, h4") || el.parentElement;
    if (head) { if (n) head.removeAttribute("u-d"); else head.setAttribute("u-d", "none"); }
  }
  function setDate(scope, date) {
    var el = leaf(scope, "book-date");
    if (!el) return;
    var wrap = el.parentElement || el;
    if (date == null || String(date).trim() === "") wrap.setAttribute("u-d", "none");
    else { el.textContent = String(date); wrap.removeAttribute("u-d"); }
  }
  // A metarow whose value is empty hides the whole row (label + value).
  function setMetaRow(scope, name, value) {
    var el = leaf(scope, name);
    if (!el) return;
    var empty = value == null || String(value).trim() === "";
    var row = el.closest('[u-flex="row-left-center"]') || el.parentElement;
    if (empty) { if (row) row.setAttribute("u-d", "none"); }
    else { el.textContent = String(value); if (row) row.removeAttribute("u-d"); }
  }
  function setMeta(scope, name, value) {
    var els = leafFields(scope, name);
    var empty = value == null || String(value).trim() === "";
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = empty ? "" : String(value);
      if (empty) els[i].setAttribute("u-d", "none");
      else els[i].removeAttribute("u-d");
    }
  }
  function setArticleType(scope, code) {
    var els = scope.querySelectorAll('[data-field="article-type"]');
    var info = typeInfo(code);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!info) { el.setAttribute("u-d", "none"); continue; }
      el.removeAttribute("u-d");
      el.textContent = info.label;
      for (var v = 0; v < TYPE_VARIANT_CLASSES.length; v++) el.classList.remove(TYPE_VARIANT_CLASSES[v]);
      if (info.variant) el.classList.add(info.variant);
    }
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
  function setAccessTag(scope, item) {
    var tag = scope.querySelector(".access-tag");
    if (!tag) return;
    var prefix = String(item && item.id != null ? item.id : "").slice(0, 3);
    if (ACCESS_TAG_PREFIXES.indexOf(prefix) !== -1) tag.removeAttribute("u-d");
    else tag.setAttribute("u-d", "none");
  }
  function placeholder() {
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="219">' +
      '<rect width="100%" height="100%" fill="#e6e9ea"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  // Deepest single-text-child element (the button's label div).
  function deepestTextHost(node) {
    var cur = node;
    while (cur.children && cur.children.length === 1) cur = cur.children[0];
    return cur;
  }

  /* ---------- composition ---------- */
  function issueNumber(issue) {
    if (issue == null || String(issue).trim() === "") return "";
    return String(issue).replace(/^第/, "").replace(/期$/, "").trim();
  }
  function formatIssue(issue) {
    var n = issueNumber(issue);
    return n ? "第" + n + "期" : "";
  }
  function bookTitle(item) { return (item.journal || "") + formatIssue(item.journalIssue); }
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
  function setAll(root, selector, value) {
    var els = root.querySelectorAll(selector);
    for (var i = 0; i < els.length; i++) els[i].textContent = value;
  }
  function formatNum(n) {
    var num = Number(n);
    return isFinite(num) ? num.toLocaleString("en-US") : String(n);
  }

  /* ---------- public API (mock preview only) ---------- */
  window.filmtvBook = {
    render: function (root, bookNumber) {
      var r = root || roots()[0];
      render(r, r.__data || {}, bookNumber || DEFAULT_BOOK);
    }
  };
})();
