/* ============================================================
 * book.js — Film/TV publication BOOK PAGE renderer (handoff component)
 *
 * This is the REUSABLE frontend component for the Book page — it stays in
 * production after backend integration. It owns the VISUAL only: it renders the
 * data it is handed and manages the tab interaction. It does NOT fetch, and it
 * keeps no state of its own. See HANDOFF.md for the integration contract.
 *
 *   window.filmtvBook.render(rootEl, { items, imageBase, counts }, opts)
 *
 * The sample-data LOADING (fetch of the mock JSON) + the floating BookNumber
 * dev switcher live in the SEPARATE, disposable `book.mock.js` — a reference
 * the backend colleague deletes and replaces with her own fetch → render().
 *
 * The Book page shows ONE book (issue) of a publication:
 *   • a HEADER  (cover, journal + 第N期, publisher, date, access tag)
 *   • a TABLE OF CONTENTS  — the book's articles as <li> rows, minus the
 *     "non-content" article types (see EXCLUDE_TYPES)
 *   • a first-page THUMBNAIL beside the TOC — an attachment's first page,
 *     shown only while that attachment's tab is active
 *   • TABS that switch between the main book and its ATTACHMENTS
 *
 * ATTACHMENTS: a book's bookNumber may gain a trailing lowercase letter per
 * attachment, e.g. book "CE_0001" has attachments "CE_0001a", "CE_0001b" (they
 * share the BASE, letters stripped). `items` for render() is the WHOLE family
 * (main + attachments); the component groups by that suffix and gives each
 * group its own <ul> panel + tab. A lone group (no attachments) hides the bar.
 *
 * TYPE-EXCLUSION: types 23/16/1/12/10 (公司通訊 / 產品商鋪 / 廣告 / 得獎名單 /
 * 表格) are dropped from the TOC. This is applied in ONE place — pickVisible() —
 * so a future user-facing "show excluded types" toggle just calls render() with
 * opts.showExcludedTypes = true. It survives integration (the reader's TOC is
 * guaranteed not to show ads regardless of what the backend sends).
 *
 * data-* contract (author these hooks in Webflow; most already exist):
 *   [data-book] | [data-collection]   OPTIONAL scope wrapper (else document).
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
 *     .thumbnail.cc-book-toc           shown ONLY on an attachment tab (that
 *                                      attachment's first page); hidden for the
 *                                      main book / books without attachments.
 *                                      While hidden, .cc-max-w-90 is added to the
 *                                      nearest .container to cap the wide TOC.
 *       img[data-field=toc-img]        attachment first-page image
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
 *     [data-count=article]             visible-article total (post-exclusion)
 *
 * A tab click is a pure CSS panel swap (fade) — no re-fetch.
 * ============================================================ */
(function () {
  "use strict";

  /* Article types dropped from the TOC (公司通訊 / 產品商鋪 / 廣告 / 得獎名單 / 表格). */
  var EXCLUDE_TYPES = { "23": 1, "16": 1, "1": 1, "12": 1, "10": 1 };

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

  function roots() {
    var found = document.querySelectorAll("[data-book], [data-collection]");
    return found.length ? found : [document];
  }

  // Panels fade; the inactive one is display:none so heights don't stack. The
  // rule is injected (not in Webflow) so the Designer canvas shows both panels.
  // Injected lazily on first render — the component does nothing until called.
  function injectCss() {
    if (document.getElementById("filmtv-book-css")) return;
    var st = document.createElement("style");
    st.id = "filmtv-book-css";
    st.textContent =
      '.book-toc-panel{transition:opacity .18s ease}' +
      '.book-toc-panel.is-entering{opacity:0}';
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------- render (backend calls this) ----------
   * data  = { items, imageBase, counts } — items is the WHOLE book family
   *         (main + attachments). Omit root to render every [data-book] instance.
   * opts  = { showExcludedTypes } — future toggle seam; default drops EXCLUDE_TYPES. */
  function render(root, data, opts) {
    if (!root) {
      var list = roots();
      for (var n = 0; n < list.length; n++) render(list[n], data, opts);
      return;
    }
    injectCss();
    data = data || {};
    var imageBase = data.imageBase || "";
    var items = Array.isArray(data.items) ? data.items : [];

    var pool = pickVisible(items, opts);
    // Order the TOC by page. Source order isn't reliably page-ordered. Stable
    // sort keeps same-page articles in source order; a blank / non-numeric page
    // (or a range like "10-11", sorted by its leading number) sinks to the end.
    pool = stableSort(pool, function (a, b) { return pageNum(a.page) - pageNum(b.page); });

    var groups = groupBySuffix(pool);              // main ("") first, then a,b,c…
    var head = (groups[0] && groups[0].items[0]) || {};

    renderHeader(root, head, imageBase);
    renderTabsAndPanels(root, groups, imageBase);  // also drives the toc-img per active tab

    var count = data.counts && data.counts.articles != null ? data.counts.articles : pool.length;
    setAll(root, '[data-count="article"]', formatNum(count));
  }

  // The single place type-exclusion happens. A future "show excluded types"
  // toggle just passes opts.showExcludedTypes = true.
  function pickVisible(items, opts) {
    var showExcluded = !!(opts && opts.showExcludedTypes);
    return items.filter(function (it) {
      return showExcluded || !EXCLUDE_TYPES[String(it.type)];
    });
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

  /* ---------- beside-TOC thumbnail (ATTACHMENT first page only) ----------
   * The thumbnail shows the first page of an ATTACHMENT and only while that
   * attachment's tab is active; for the main book (and any book without
   * attachments) it stays hidden. When hidden, we cap the otherwise over-wide
   * TOC by adding .cc-max-w-90 to the nearest .container (removed when shown).
   * (Switch `container` -> the .book-toc-ul below to cap only the list column.) */
  function updateTocImg(root, group, imageBase) {
    var img = root.querySelector('[data-field="toc-img"]');
    if (!img) return;
    var wrap = img.closest(".thumbnail") || img.parentElement;
    var container = img.closest(".container");
    var first = group && group.suffix ? group.items[0] : null;  // "" (main) -> no image
    var show = !!(first && first.image);
    if (show) setImg(img, first.image, imageBase, "附件首頁");
    if (wrap) { if (show) wrap.removeAttribute("u-d"); else wrap.setAttribute("u-d", "none"); }
    if (container) container.classList.toggle("cc-max-w-90", !show);
  }

  /* ---------- tabs + TOC panels ---------- */
  function renderTabsAndPanels(root, groups, imageBase) {
    var host = root.querySelector(".book-toc-ul");
    var toggle = root.querySelector("[data-view-toggle]");
    if (!host) return;

    // Capture DETACHED templates ONCE (stashed on the host/toggle) so a later
    // render — even one with zero groups — can never destroy them. (A previous
    // empty render used to wipe the authored tab-button template.)
    if (!host.__panelTpl) {
      var authoredUl = host.querySelector(":scope > ul") || host.querySelector("ul");
      if (!authoredUl) return;
      host.__panelTpl = authoredUl.cloneNode(true);
    }
    var panelTpl = host.__panelTpl;
    var liTpl = panelTpl.querySelector(".book-toc-li");
    if (!liTpl) return;

    if (toggle && !toggle.__btnTpl) {
      var authoredBtn = toggle.querySelector(".view-toggle-btn");
      if (authoredBtn) toggle.__btnTpl = authoredBtn.cloneNode(true);
    }
    var btnTpl = toggle ? toggle.__btnTpl : null;

    clearChildren(host);                                      // drop authored ul / old panels
    if (toggle) clearChildren(toggle);                        // drop authored / old tabs

    for (var g = 0; g < groups.length; g++) {
      host.appendChild(buildPanel(panelTpl, liTpl, groups[g], g, imageBase));
      if (toggle && btnTpl) toggle.appendChild(buildTab(btnTpl, groups[g], g));
    }

    // A lone group (just the main book, no attachments) needs no tab bar.
    if (toggle) {
      if (groups.length > 1) toggle.removeAttribute("u-d");
      else toggle.setAttribute("u-d", "none");
    }

    // Activating a tab swaps the panel, the active state, AND the toc-img.
    var select = function (idx) {
      showPanel(host, idx);
      setActiveTab(toggle, idx);
      updateTocImg(root, groups[idx], imageBase);
    };
    bindTabs(toggle, select);
    select(0);
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

  // Bind once; the listener calls toggle.__bookSelect, which we refresh on every
  // render so a re-render (switching book) never leaves a stale closure behind.
  function bindTabs(toggle, select) {
    if (!toggle) return;
    toggle.__bookSelect = select;
    if (toggle.__bookBound) return;
    toggle.__bookBound = true;
    toggle.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-toc-tab]") : null;
      if (!btn || !toggle.contains(btn)) return;
      e.preventDefault();
      toggle.__bookSelect(Number(btn.getAttribute("data-toc-tab")));
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

  /* ---------- grouping (main book + attachment suffix) ---------- */
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

  /* ---------- template helpers (same conventions as collection.js) ---------- */
  function activate(node) {
    node.removeAttribute("u-d");
    node.removeAttribute("data-tpl");
    node.setAttribute("data-clone", "");
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
  // u-d is a Webflow DISPLAY utility (e.g. u-d="inline" / "inline-flex"), not just
  // a hide flag — so revealing an element must RESTORE its authored value, never
  // removeAttribute (which would strip "inline" and drop it back to block). We
  // remember the authored value the first time we touch a (fresh clone) element.
  function rememberUd(el) { if (!("_ud" in el)) el._ud = el.getAttribute("u-d"); }
  function showEl(el) {
    rememberUd(el);
    if (el._ud != null && el._ud !== "none") el.setAttribute("u-d", el._ud);
    else el.removeAttribute("u-d");
  }
  function hideEl(el) { rememberUd(el); el.setAttribute("u-d", "none"); }
  function toggle(el, show, text) {
    if (!el) return;
    if (show) { if (text != null) el.textContent = text; showEl(el); }
    else hideEl(el);
  }
  function togglePipe(pipe, show) {
    var wrap = pipe.parentElement || pipe;   // authored u-d="inline-flex" lives on the wrapper
    if (show) showEl(wrap); else hideEl(wrap);
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
      if (empty) hideEl(els[i]);
      else showEl(els[i]);            // restore authored u-d (e.g. "inline")
    }
  }
  function setArticleType(scope, code) {
    var els = scope.querySelectorAll('[data-field="article-type"]');
    var info = typeInfo(code);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!info) { hideEl(el); continue; }
      showEl(el);
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
  // Leading integer of a page value; blank / unparseable -> +Infinity (sorts last).
  function pageNum(p) {
    var m = String(p == null ? "" : p).match(/\d+/);
    return m ? parseInt(m[0], 10) : Infinity;
  }
  // Stable sort (decorate-with-index) so it holds even where Array.sort isn't stable.
  function stableSort(arr, cmp) {
    return arr
      .map(function (v, i) { return { v: v, i: i }; })
      .sort(function (a, b) { return cmp(a.v, b.v) || a.i - b.i; })
      .map(function (x) { return x.v; });
  }
  function setAll(root, selector, value) {
    var els = root.querySelectorAll(selector);
    for (var i = 0; i < els.length; i++) els[i].textContent = value;
  }
  function formatNum(n) {
    var num = Number(n);
    return isFinite(num) ? num.toLocaleString("en-US") : String(n);
  }

  /* ---------- public API (backend integration) ---------- */
  window.filmtvBook = { render: render };
})();
