/* ============================================================
 * viewer.js — Film/TV publication BOOK VIEWER (handoff component)
 *
 * Complete as of handoff: Stage 1 — Page Manipulation (layout, page-turn, zoom,
 * rotation, drag, fullscreen, scroll modes, thumbnail, OCR) — AND the three
 * side panels — Book Metadata (目錄), Search (搜尋內文), Article Info (文章資訊)
 * — all live in THIS SAME file (same `state`, same `render()`).
 *
 * This is the REUSABLE, handed-off viewer. It owns the interactive VIEW: it is
 * handed one book's data and renders it, syncing the URL. The sample-data
 * LOADING (fetch of the mock book.json) + the floating dev switcher live in the
 * SEPARATE, disposable `viewer.mock.js`. See HANDOFF.md for the contract.
 *
 *   window.filmtvViewer.init({ root, dataBaseUrl });   // wire once, load from URL
 *   window.filmtvViewer.load(bookNumber, { page, article });  // (re)load a book
 *   window.filmtvViewer.render();                       // re-render current state
 *
 * RENDERING MODEL — declarative "UI = f(state)": every state-changing function
 * mutates `state` then calls render(); render() reads the whole state and makes
 * the DOM match. The one exception is the pan-drag fast path (mousemove), which
 * calls applyTransform() directly for performance (state stays consistent).
 *
 * data-* / id contract (author these in Webflow; IDs must match EXACTLY):
 *   [data-viewer]                     OPTIONAL scope wrapper (else document).
 *   .viewer-root                      root for orientation / fullscreen classes.
 *   main.viewer-stage
 *     button#js-prev-page             LEFT arrow  (logical next/prev by orientation)
 *     div#js-page-container           holds the layout (cloned from a template)
 *     button#js-next-page             RIGHT arrow
 *   footer / bottom bar
 *     input#js-page-input             editable page number (numeric reading pos)
 *     span#js-page-total              " / N"
 *     [data-dropdown]#js-layout-dropdown  layout (double|single|ocr|thumbnail)
 *     button#js-scroll-popover-trigger + div#js-scroll-popover (radios)
 *     [data-dropdown]#js-zoom-dropdown    zoom (fit-page|fit-width|100|150)
 *     button#js-fullscreen
 *     button#js-rotate-cw / button#js-rotate-ccw
 *     button#js-sharpen  toggles the high sharpen filter (.cc-sharpen styles it)
 *   responsive layout drawer (tablet & below):
 *     button#js-viewer-layout-trigger  opens the drawer
 *     div#js-viewer-layout  the drawer (JS toggles .is-open)
 *     button#js-viewer-layout-close  the grab-bar handle that closes it
 *   <template> hooks (inert; cloned by JS):
 *     #tpl-layout-single #tpl-layout-double #tpl-layout-ocr #tpl-layout-thumbnail
 *     #tpl-thumbnail-item #tpl-ocr-article-block #tpl-ocr-toc-popover
 *   SIDE PANELS (目錄 / 搜尋 / 文章資訊) — author these data-* in Webflow. Each
 *   list keeps ONE authored [data-tpl] row (delete the extra sample rows); JS
 *   clones it. Triggers keep their js- ids (PANEL_TRIGGERS maps id -> panel):
 *     [data-viewer-panel="meta|search|article"]  the three drawers
 *     [data-viewer-close]                 a ✕ button inside a panel (closes it)
 *     [data-viewer-alert]                 the "link copied" toast (#js-share)
 *     Book Metadata (meta):
 *       [data-field=journal|journal-issue|publisher|book-date]  header fields
 *       [data-viewer-toc-list] > [data-tpl="toc-item"]  TOC (type-filtered);
 *         row leaves [data-field=column|title|author]
 *     Search (search):
 *       [data-viewer-search-form] [data-viewer-search-input]  (form + input)
 *       [data-viewer-search-empty]        沒有查詢結果 (shown only on 0 matches)
 *       [data-viewer-search-results] > [data-tpl="search-item"]  (column/title/author)
 *     Article Info (article):
 *       [data-field=page-list]            visible page number(s) in the heading
 *       [data-viewer-article-list] > [data-tpl="article-info-item"]  one per
 *         visible article; leaves [data-field=title|author|column|page|article-type]
 *       [data-viewer-keyword-row] (hidden when none) > [data-viewer-keyword-list]
 *         > [data-tpl="keyword-item"] with [data-field=keyword]
 *
 * The Layout/Zoom dropdowns use the design-system dropdown component (forms.js):
 * this file reads them via the `input` event on their hidden <input>. No visual
 * CSS is injected here — the Webflow build owns all styling (ownership split).
 * ============================================================ */
(function () {
  "use strict";

  /* ---------------- config ---------------- */
  var DEFAULT_DATA_BASE = "./sample-data"; // {base}/{bookNumber}/book.json
  var ZOOM_PRESETS = ["fit-page", "fit-width", "100", "150"]; // add "75" here + a Webflow <li> to extend
  var OCR_FONT_SIZES = ["small", "medium", "large"];
  var LINK_ALERT_MS = 4000; // how long the "link copied" toast stays visible
  var PRELOAD_RADIUS = 2; // flip-mode preload window (current ± N)

  /* Side-panel triggers -> the panel each one opens. The triggers keep their
   * existing js- ids (Webflow chrome); each panel carries [data-viewer-panel=<name>].
   * Only ONE panel is open at a time (opening one closes the others). */
  var PANEL_TRIGGERS = { "js-toc-trigger": "meta", "js-search-trigger": "search", "js-article-info": "article" };

  /* Article-type exclusion + labels — the SAME set the Book page (book.js) drops
   * from its TOC, mirrored here so the viewer's 文章目錄 hides ads/company pages.
   * Kept in sync with book.js / results.js. */
  var EXCLUDE_TYPES = { 23: 1, 16: 1, 1: 1, 12: 1, 10: 1 };
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
  var DESKTOP_MIN_WIDTH = 1024; // >= this => default 'double', else 'single'
  var SCROLL_INSTANT_JUMP = 10; // pages: beyond this, jump instantly not smoothly
  // 1×1 transparent GIF — swapped in for a failed image so the browser stops
  // painting its native broken-image chrome (the .is-error CSS background shows the icon).
  var TRANSPARENT_PX = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

  /* ---------------- state ---------------- */
  var state = {
    book: null,
    currentPage: 1,
    layout: "double", // single | double | ocr | thumbnail
    previousLayout: null, // set on entering thumbnail; restored on leaving
    scrollDirection: "flip", // flip | vertical | horizontal (single only)
    zoom: "fit-page", // fit-page | fit-width | 100 | 150
    rotation: 0, // 0 | 90 | 180 | 270
    connectMode: "next", // next | previous (double only)
    isFullscreen: false,
    ocrFontSize: "small",
    sharpen: false, // high-intensity SVG sharpen filter on the reading image(s)
    panX: 0,
    panY: 0,
  };

  /* ---------------- module-level refs ---------------- */
  var scope = document; // the [data-viewer] element (or document)
  var dataBaseUrl = DEFAULT_DATA_BASE;
  // Per-page initial-state overrides (record page): null = use built-in defaults.
  var defaultLayoutOpt = null; // e.g. "ocr" to open in OCR View
  var defaultPanelOpt = null; // e.g. "article" to open a side panel on load
  var scopeArticleId = null; // record mode: the ?id= article the book is scoped to (keeps ?book= out of the URL)
  var imageCache = new Map();
  var loadingSlots = new Set(); // reading-image slots currently fetching (drives the spinner)
  var scrollObserver = null;
  var lastStructureKey = null; // gates the expensive template re-clone
  var lastMetaBook = null; // gates the (book-level) metadata panel rebuild
  var linkAlertTimer = null; // pending hide of the "link copied" toast
  var wired = false; // event listeners attached once per init
  var emptyStateHref = null; // CTA target for the empty state (data-empty-href / opts; else "../")

  /* ---------------- tiny DOM helpers ---------------- */
  function $(sel) {
    return scope.querySelector(sel);
  }
  function byId(id) {
    return scope.querySelector("#" + id);
  }
  function container() {
    return byId("js-page-container");
  }
  // Feature hooks that are plain Webflow chrome (no template clone). Each is a
  // singleton, so the hook is a stable js- id (the Webflow element must carry it);
  // the .viewer-layout / .cc-sharpen classes are for styling only and can be
  // renamed freely without touching this file.
  function sharpenBtn() {
    return byId("js-sharpen");
  }
  function layoutPanel() {
    return byId("js-viewer-layout");
  }
  function layoutPanelTrigger() {
    return byId("js-viewer-layout-trigger");
  }
  // Drawer handle (the grab bar at the top of the drawer) that closes it.
  function layoutPanelClose() {
    return byId("js-viewer-layout-close");
  }
  function rootEl() {
    return scope === document ? document.body : scope;
  }
  function tpl(id) {
    var t = document.getElementById(id);
    return t && t.content ? t.content.cloneNode(true) : null;
  }
  function on(el, ev, fn) {
    if (el) el.addEventListener(ev, fn);
  }
  function setDisabled(el, v) {
    if (el) el.disabled = !!v;
  }
  function setText(el, txt) {
    if (el && el.textContent !== txt) el.textContent = txt;
  }
  function toggleClass(el, cls, v) {
    if (el) el.classList.toggle(cls, !!v);
  }
  function clamp(n, lo, hi) {
    return n < lo ? lo : n > hi ? hi : n;
  }

  /* ============================================================
   * INIT / LOAD  (§5.1)
   * ============================================================ */
  function init(opts) {
    opts = opts || {};
    scope = opts.root || document.querySelector("[data-viewer]") || document;
    dataBaseUrl = opts.dataBaseUrl || (scope.getAttribute && scope.getAttribute("data-src")) || DEFAULT_DATA_BASE;
    // Record-page overrides: from init() opts or [data-viewer] attributes.
    defaultLayoutOpt = opts.defaultLayout || (scope.getAttribute && scope.getAttribute("data-default-layout")) || null;
    defaultPanelOpt = opts.defaultPanel || (scope.getAttribute && scope.getAttribute("data-default-panel")) || null;
    emptyStateHref = opts.emptyStateHref || (scope.getAttribute && scope.getAttribute("data-empty-href")) || null;

    ensureSharpenFilter();
    wireEvents();

    var url = readUrl();
    var bookNumber = opts.bookNumber || url.book || (scope.getAttribute && scope.getAttribute("data-book-number"));
    if (!bookNumber) {
      // No identifier at all (bare URL / stale bookmark) — show the empty state
      // instead of a blank stage. See the EMPTY STATE section below.
      console.error("[viewer] no book specified (URL ?book= or opts.bookNumber)");
      showEmptyState("no-book");
      return;
    }
    // Record mode: ?id=<articleId> (or opts.articleId / data-article-id) scopes the
    // load to a single article and only its pages.
    var scopeId = opts.articleId || url.id || (scope.getAttribute && scope.getAttribute("data-article-id")) || null;
    return load(bookNumber, { page: opts.page || url.page, article: opts.article || url.article, scope: scopeId });
  }

  function load(bookNumber, nav) {
    nav = nav || {};
    return fetchBook(bookNumber)
      .then(function (book) {
        // Record mode: replace the book with a single-article slice (only its pages).
        scopeArticleId = null;
        if (nav.scope) {
          var sa = findArticle(book, nav.scope);
          if (sa) {
            book = sliceBookToArticle(book, sa);
            scopeArticleId = nav.scope;
          } else {
            // Record page: a scope id was requested but no such article is in the book.
            // Show the empty state rather than silently falling through to the WHOLE book
            // (the user asked for one record — the full book would be the wrong result).
            console.warn("[viewer] article not found for scope id:", nav.scope);
            showEmptyState("article-notfound");
            return;
          }
        }
        hideEmptyState(); // a valid book clears any empty state a prior load left up
        state.book = book;
        // reset per-book manual settings
        state.rotation = 0;
        state.zoom = "fit-page";
        state.sharpen = false;
        state.panX = state.panY = 0;
        state.previousLayout = null;
        state.layout = defaultLayoutOpt || defaultLayout();
        state.currentPage = resolveInitialPage(book, nav);
        lastStructureKey = null; // force structural rebuild for the new book
        lastMetaBook = null; // force the metadata panel + TOC to rebuild
        closeAllPanels(); // a fresh book starts with every side panel closed
        resetSearch(); // clear any prior search results / query
        render();
        if (defaultPanelOpt) openPanel(defaultPanelOpt); // record page opens a panel on load
      })
      .catch(function (err) {
        // Fetch failed / book not found (404 / bad data) — same friendly empty state.
        console.error("[viewer] load failed:", err);
        showEmptyState("notfound");
      });
  }

  function fetchBook(bookNumber) {
    var url = dataBaseUrl.replace(/\/+$/, "") + "/" + bookNumber + "/book.json";
    return fetch(url, { credentials: "omit" }).then(function (r) {
      if (!r.ok) throw new Error("Book " + bookNumber + " not found (HTTP " + r.status + ")");
      return r.json();
    });
  }

  function defaultLayout() {
    return window.innerWidth >= DESKTOP_MIN_WIDTH ? "double" : "single";
  }

  function resolveInitialPage(book, nav) {
    var total = book.pages.length;
    if (nav.page) return clamp(parseInt(nav.page, 10) || 1, 1, total);
    if (nav.article) {
      var a = findArticle(book, nav.article);
      if (a) return clamp(a.pageStart, 1, total);
    }
    return 1;
  }

  // Record mode: return a shallow-cloned book scoped to one article — pages trimmed
  // to that article's range, articles reduced to just it (nav indices remapped to the
  // sliced array; the display `page` field is left untouched so the metadata still shows
  // the real publication page).
  function sliceBookToArticle(book, a) {
    var total = book.pages.length;
    var lo = clamp(a.pageStart, 1, total);
    var hi = clamp(a.pageEnd, lo, total);
    var scopedArticle = Object.assign({}, a, { pageStart: 1, pageEnd: hi - lo + 1 });
    return {
      bookNumber: book.bookNumber,
      title: book.title,
      bookOrientation: book.bookOrientation,
      imageBaseUrl: book.imageBaseUrl,
      pages: book.pages.slice(lo - 1, hi),
      articles: [scopedArticle],
    };
  }

  function findArticle(book, id) {
    var arr = book.articles || [];
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  /* ============================================================
   * EMPTY STATE — shown when there is nothing to read: no ?book= (bare URL /
   * stale bookmark), a book that fails to load (404 / bad data), or a record
   * page ?id= that matches no article. Replaces the blank stage with a short
   * message + a CTA back to search/browse.
   *
   * The block is AUTHORED in Webflow as [data-empty-state] (hidden by u-d="none",
   * with the real search/browse link — the nav routes belong to the Webflow build,
   * not this file). If the hook is absent we inject a minimal fallback whose CTA
   * points at `emptyStateHref` (data-empty-href / opts.emptyStateHref) or "../".
   * A [data-empty-heading] leaf (if present) gets a reason-specific heading.
   * The reading chrome is hidden by a single root class (.viewer-is-empty); the
   * rule is injected lazily, mirroring ensureSharpenFilter()'s inject-once pattern.
   * ============================================================ */
  var EMPTY_HEADINGS = { "no-book": "沒有選擇書刊", notfound: "找不到書刊", "article-notfound": "找不到文章" };
  function emptyHeading(reason) {
    return EMPTY_HEADINGS[reason] || EMPTY_HEADINGS["no-book"];
  }
  function showEmptyState(reason) {
    ensureEmptyStateCss();
    var root = rootEl();
    if (root) root.classList.add("viewer-is-empty");
    var el = scope.querySelector("[data-empty-state]") || injectEmptyState();
    if (!el) return;
    var head = el.querySelector("[data-empty-heading]");
    if (head) head.textContent = emptyHeading(reason);
    el.classList.remove("is-hidden");
    el.setAttribute("u-d", "block");
    el.removeAttribute("u-d"); // restore natural display (u-d="none" is what hid it)
  }
  function hideEmptyState() {
    var root = rootEl();
    if (root) root.classList.remove("viewer-is-empty");
    var el = scope.querySelector("[data-empty-state]");
    if (el) {
      el.classList.add("is-hidden");
      el.setAttribute("u-d", "none");
    }
  }
  function injectEmptyState() {
    var host = scope === document ? document.body : scope;
    if (!host) return null;
    var href = emptyStateHref || "../";
    var box = document.createElement("div");
    box.className = "viewer-empty";
    box.setAttribute("data-empty-state", "");
    box.innerHTML =
      '<div class="viewer-empty-inner">' +
      '<p class="viewer-empty-heading" data-empty-heading>沒有選擇書刊</p>' +
      '<p class="viewer-empty-sub">請從搜尋或瀏覽頁面選擇書刊後再開啟閱讀器。</p>' +
      '<a class="viewer-empty-cta" href="' + href + '">返回搜尋</a>' +
      "</div>";
    host.appendChild(box);
    return box;
  }
  function ensureEmptyStateCss() {
    if (document.getElementById("filmtv-viewer-empty-css")) return;
    var st = document.createElement("style");
    st.id = "filmtv-viewer-empty-css";
    st.textContent =
      ".viewer-is-empty .viewer-stage,.viewer-is-empty .viewer-toolbar-top," +
      ".viewer-is-empty .viewer-toolbar-bottom{display:none!important}" +
      ".viewer-empty{display:flex;align-items:center;justify-content:center;" +
      "text-align:center;min-height:60vh;padding:4rem 1.5rem}" +
      ".viewer-empty-inner{display:flex;flex-direction:column;align-items:center;gap:.6rem;max-width:28rem}" +
      ".viewer-empty-heading{margin:0;font-size:1.4rem;font-weight:600}" +
      ".viewer-empty-sub{margin:0;color:#6b6b6b;line-height:1.5}" +
      ".viewer-empty-cta{display:inline-block;margin-top:.6rem;padding:.55rem 1.2rem;border-radius:8px;" +
      "background:var(--accent,#8a1c2b);color:#fff;text-decoration:none;font-weight:500}";
    (document.head || document.documentElement).appendChild(st);
  }

  /* ============================================================
   * URL STATE  (§3.3 / §3.4)  — only book/page/article live in the URL
   * ============================================================ */
  function readUrl() {
    var p = new URLSearchParams(window.location.search);
    return { book: p.get("book"), page: p.get("page"), article: p.get("article"), id: p.get("id") };
  }

  function updateUrlForPage() {
    if (!state.book) return;
    var p = new URLSearchParams(window.location.search);
    if (scopeArticleId) {
      // Record page: keep the ?id= scope + page only — the book comes from
      // data-book-number, so ?book= would just be noise.
      p.set("page", String(state.currentPage));
    } else {
      p.set("book", state.book.bookNumber);
      p.set("page", String(state.currentPage));
      p.delete("article"); // paginating drops the article ref
    }
    var next = window.location.pathname + "?" + p.toString();
    if (next !== window.location.pathname + window.location.search) {
      history.pushState({ page: state.currentPage }, "", next);
    }
  }

  function onPopState() {
    if (!state.book) return;
    var url = readUrl();
    var target = url.page ? parseInt(url.page, 10) : url.article ? (findArticle(state.book, url.article) || {}).pageStart : 1;
    state.currentPage = clamp(target || 1, 1, state.book.pages.length);
    state.panX = state.panY = 0;
    render();
  }

  /* ============================================================
   * ORIENTATION HELPERS  (§5.2)
   * ============================================================ */
  function orientation() {
    return (state.book && state.book.bookOrientation) || "left";
  }
  function isVerticalBinding() {
    var o = orientation();
    return o === "top" || o === "bottom";
  }
  // Which screen-arrow means "advance": right for left/top/bottom, left for right.
  function leftArrowIsNext() {
    return orientation() === "right";
  }
  // Given ascending spread pages, return them in visual (left→right or top→bottom) order.
  function orderForDisplay(pagesAsc) {
    var o = orientation();
    if (o === "right" || o === "bottom") return pagesAsc.slice().reverse();
    return pagesAsc.slice();
  }

  /* ============================================================
   * SPREAD MATH  (§5.5)
   * ============================================================ */
  function getVisibleSpreadPages(currentPage, mode) {
    var total = state.book.pages.length;
    if (mode === "next") {
      // pairs: [1], [2,3], [4,5], ...
      if (currentPage <= 1) return [1];
      if (currentPage % 2 === 0) return currentPage + 1 <= total ? [currentPage, currentPage + 1] : [currentPage];
      return [currentPage - 1, currentPage]; // odd (>1) = right page of its pair
    } else {
      // pairs: [1,2], [3,4], ...
      if (currentPage % 2 === 1) return currentPage + 1 <= total ? [currentPage, currentPage + 1] : [currentPage];
      return [currentPage - 1, currentPage];
    }
  }
  // The leading (lowest-index) page of the spread that contains `page`.
  function spreadLead(page, mode) {
    return getVisibleSpreadPages(clamp(page, 1, state.book.pages.length), mode)[0];
  }

  /* ============================================================
   * RENDER  (§3.5)
   * ============================================================ */
  function render() {
    if (!state.book) return;
    var key = structureKey();
    if (key !== lastStructureKey) {
      renderLayout();
      lastStructureKey = key;
    }
    renderPageContent();
    updatePageIndicator();
    updateToolbarControls();
    updateDropdownValues();
    applyOrientationClass();
    applyZoomClass();
    applyRotationVars();
    applyFullscreenClass();
    applySharpenClass();
    applyTransform();
    updateUrlForPage();
    renderMetaPanel(); // book-level; self-gates on book change
    if (isPanelOpen("meta")) updateMetaTocActive(); // keep .is-active in sync while paging with it open
    if (isPanelOpen("article")) renderArticleInfo(); // keep in sync while paging with it open
    if (isFlipMode()) preloadAdjacent(state.currentPage);
  }

  // Structure is re-cloned when the layout, (single) scroll direction, OR orientation
  // changes — the scroll strip's DOM order depends on binding (right/bottom reverse it),
  // so an orientation change must rebuild it. (Orientation is fixed per book in prod;
  // this only fires via the dev switcher.)
  function structureKey() {
    return state.layout + "|" + (state.layout === "single" ? state.scrollDirection : "flip") + "|" + orientation();
  }
  function isFlipMode() {
    return state.layout !== "thumbnail" && !(state.layout === "single" && state.scrollDirection !== "flip");
  }

  /* ---- structural: clone the right template into the container ---- */
  function renderLayout() {
    var c = container();
    if (!c) return;
    if (scrollObserver) {
      scrollObserver.disconnect();
      scrollObserver = null;
    }
    c.innerHTML = "";
    c.className = "viewer-page-container"; // reset (zoom/scroll classes re-applied below)
    loadingSlots.clear(); // the old slots are gone; drop any pending spinner state

    if (state.layout === "thumbnail") {
      var tg = tpl("tpl-layout-thumbnail");
      if (tg) c.appendChild(tg);
      renderThumbnails();
      return;
    }
    if (state.layout === "thumbnail") return;

    if (state.layout === "single") {
      if (state.scrollDirection === "flip") {
        var s = tpl("tpl-layout-single");
        if (s) c.appendChild(s);
        markRotationTarget(c.querySelector('[data-role="page-image"]'));
        addLoadingOverlay(c);
      } else {
        renderScrollStrip(c);
      }
      return;
    }
    if (state.layout === "double") {
      var d = tpl("tpl-layout-double");
      if (d) c.appendChild(d);
      markRotationTarget(c.querySelector('[data-role="page-spread"]') || c.firstElementChild);
      addLoadingOverlay(c);
      return;
    }
    if (state.layout === "ocr") {
      var o = tpl("tpl-layout-ocr");
      if (o) c.appendChild(o);
      markRotationTarget(c.querySelector('[data-role="page-image"]'));
      addLoadingOverlay(c.querySelector('[data-role="ocr-page-stage"]') || c); // over the image, not the text
      return;
    }
  }

  function markRotationTarget(el) {
    var prev = container().querySelector(".rotation-target");
    if (prev) prev.classList.remove("rotation-target");
    if (el) el.classList.add("rotation-target");
  }

  /* ---- content: fill the current page(s) / toggle active ---- */
  function renderPageContent() {
    var c = container();
    if (!c) return;
    if (state.layout === "single" && state.scrollDirection === "flip") {
      renderPageImage(c.querySelector('[data-role="page-image"]'), pageAt(state.currentPage));
    } else if (state.layout === "single") {
      highlightScrollPage();
    } else if (state.layout === "double") {
      renderDoubleContent(c);
    } else if (state.layout === "ocr") {
      renderPageImage(c.querySelector('[data-role="page-image"]'), pageAt(state.currentPage));
      renderOcrPanel();
    } else if (state.layout === "thumbnail") {
      highlightThumbnail();
    }
  }

  function pageAt(idx) {
    return state.book.pages[idx - 1];
  }

  function renderDoubleContent(c) {
    var pages = getVisibleSpreadPages(state.currentPage, state.connectMode);
    var slotLeft = c.querySelector('[data-role="page-image"][data-side="left"]');
    var slotRight = c.querySelector('[data-role="page-image"][data-side="right"]');
    toggleClass(c.querySelector('[data-role="page-spread"]') || c, "spread-lone", pages.length === 1);
    if (pages.length === 1) {
      // lone first page — show it in the orientation-appropriate single slot
      renderPageImage(slotLeft, pageAt(pages[0]));
      renderPageImage(slotRight, null);
      return;
    }
    var vis = orderForDisplay(pages); // [firstVisual, secondVisual]
    renderPageImage(slotLeft, pageAt(vis[0]));
    renderPageImage(slotRight, pageAt(vis[1]));
  }

  /* ============================================================
   * IMAGE LOADING  (§5.13) — placeholder -> image | error
   * ============================================================ */
  function renderPageImage(slot, page) {
    if (!slot) return;
    if (!page) {
      slot.removeAttribute("src");
      slot.alt = "";
      slot.classList.add("is-empty");
      return;
    }
    slot.classList.remove("is-empty");
    var url = state.book.imageBaseUrl + page.file;

    // For a bare <img> slot we set src directly + let CSS aspect-ratio hold space;
    // for a wrapper slot we swap placeholder -> img (see harness templates).
    if (slot.tagName === "IMG") {
      applyAspect(slot, page);
      slot.alt = page.label || "";
      if (slot.getAttribute("src") !== url) {
        slot.classList.remove("is-error"); // clear a prior failure before retrying
        slot.setAttribute("src", url);
        // Spinner only for a genuine fetch — a cached image reports complete
        // synchronously (and the reveal delay covers anything else that's fast).
        setSlotLoading(slot, !slot.complete);
      }
      slot.onerror = function () {
        slot.classList.add("is-error");
        // Keep a descriptive alt so assistive tech announces the failure — the icon
        // is a CSS background with no text of its own. It stays visually hidden (the
        // .is-error rule zeroes font-size/colour) and the transparent-pixel swap below
        // stops the browser's native broken-image chrome from painting it over the glyph.
        slot.alt = "圖片無法載入：" + (page.label || page.file);
        setSlotLoading(slot, false);
        // A broken <img> keeps drawing the browser's native broken-image chrome
        // (icon + alt) OVER our .is-error background, even after the src is cleared.
        // Swap in a valid transparent pixel so nothing is "broken" to paint; the
        // CSS background then shows the icon alone. Detach the handlers first so
        // this placeholder's load doesn't clear is-error.
        slot.onload = slot.onerror = null;
        slot.src = TRANSPARENT_PX;
      };
      slot.onload = function () {
        slot.classList.remove("is-error");
        setSlotLoading(slot, false);
      };
    }
  }

  // Spinner overlay (flip layouts). A bare <img> slot keeps the OLD page painted
  // until the new src decodes, so the spinner sits ON TOP (absolute overlay), not
  // behind. viewer.js toggles .is-loading on the container while any reading image
  // is fetching; CSS reveals the overlay after a short delay so fast/cached pages
  // never flash it. The overlay node is (re)added by renderLayout per structure.
  function addLoadingOverlay(host) {
    if (!host) return;
    var ov = document.createElement("div");
    ov.className = "page-loading-overlay";
    ov.setAttribute("aria-hidden", "true");
    var sp = document.createElement("div");
    sp.className = "page-placeholder-spinner";
    ov.appendChild(sp);
    host.appendChild(ov);
  }
  function setSlotLoading(slot, on) {
    if (on) loadingSlots.add(slot);
    else loadingSlots.delete(slot);
    var c = container();
    if (c) {
      var loading = loadingSlots.size > 0;
      c.classList.toggle("is-loading", loading);
      // aria-busy tells assistive tech the reading area is fetching, so it holds off
      // announcing the stale image until load/error clears the flag (the spinner
      // itself is decorative / aria-hidden).
      c.setAttribute("aria-busy", loading ? "true" : "false");
    }
  }

  function applyAspect(el, page) {
    if (!el) return;
    if (page && page.width && page.height) el.style.aspectRatio = page.width + " / " + page.height;
    else el.style.aspectRatio = "3 / 4";
  }

  function preloadAdjacent(center) {
    var total = state.book.pages.length;
    for (var off = -PRELOAD_RADIUS; off <= PRELOAD_RADIUS; off++) {
      var idx = center + off;
      if (idx >= 1 && idx <= total) preloadImage(state.book.pages[idx - 1]);
    }
  }
  function preloadImage(page) {
    if (imageCache.has(page.file)) return;
    var img = new Image();
    img.src = state.book.imageBaseUrl + page.file;
    imageCache.set(page.file, img);
  }

  /* ============================================================
   * PAGE TURN / JUMP  (§5.4, D2)
   * ============================================================ */
  function turnPage(direction) {
    // direction: 'next' | 'previous'
    if (state.layout === "thumbnail") return;
    var total = state.book.pages.length;
    if (state.layout === "double") {
      // Spread-aware: step to the page just past (or before) the current spread
      // (handles the lone first page and a lone last page), then land on that
      // spread's LEADING page so the indicator advances cleanly.
      var vis = getVisibleSpreadPages(state.currentPage, state.connectMode);
      if (direction === "next") {
        if (vis[vis.length - 1] >= total) return;
        setPage(spreadLead(vis[vis.length - 1] + 1, state.connectMode));
      } else {
        if (vis[0] <= 1) return;
        setPage(spreadLead(vis[0] - 1, state.connectMode));
      }
      return;
    }
    var target = direction === "next" ? state.currentPage + 1 : state.currentPage - 1;
    if (target < 1 || target > total) return;
    setPage(target);
  }

  function setPage(idx) {
    // currentPage is the FOCUS page (any page). In double it need not be a spread
    // start — getVisibleSpreadPages() derives the pair that contains it. This is
    // what lets a connect-mode toggle keep the same page visible (see setConnectMode).
    state.currentPage = clamp(idx, 1, state.book.pages.length);
    state.panX = state.panY = 0; // rotation persists; pan resets
    render();
    if (state.layout === "single" && state.scrollDirection !== "flip") scrollToPage(state.currentPage);
  }

  // Screen arrow -> logical direction (orientation-aware)
  function onLeftArrow() {
    turnPage(leftArrowIsNext() ? "next" : "previous");
  }
  function onRightArrow() {
    turnPage(leftArrowIsNext() ? "previous" : "next");
  }

  /* ============================================================
   * LAYOUT SWITCH  (§5.3)
   * ============================================================ */
  function setLayout(newLayout) {
    if (!newLayout || state.layout === newLayout) return;
    // currentPage carries over untouched — double derives the spread containing it.
    if (newLayout === "thumbnail") {
      state.previousLayout = state.layout;
      // Close the responsive layout drawer (tablet & below) — otherwise it covers
      // the thumbnails and is hard to dismiss without tapping one (which navigates away).
      toggleLayoutPanel(false);
    }
    if (state.layout !== "single") state.scrollDirection = "flip"; // reset when not single
    state.layout = newLayout;
    state.zoom = "fit-page";
    state.panX = state.panY = 0;
    render();
    if (state.layout === "thumbnail") scrollThumbnailIntoView(state.currentPage);
  }

  function setConnectMode(newMode) {
    if (state.layout !== "double" || state.connectMode === newMode) return;
    // Keep the SAME focus page visible; only its companion flips. This makes the
    // 連接下頁/連接上頁 toggle a stable 2-state loop (e.g. [2,3] <-> [1,2] around
    // page 2) instead of walking forward through the book. Boundary pages fall out
    // naturally: page 1 shows lone in 'next' but pairs [1,2] in 'previous'; a lone
    // last page (16) shows alone in 'next' but pairs [15,16] in 'previous'.
    state.connectMode = newMode;
    render();
  }

  function setScrollDirection(dir) {
    if (state.scrollDirection === dir) return;
    state.scrollDirection = dir;
    state.zoom = "fit-page";
    state.panX = state.panY = 0;
    render();
    if (dir !== "flip") scrollToPage(state.currentPage);
  }

  /* ============================================================
   * ZOOM  (§5.7, D1: dropdown-only)
   * ============================================================ */
  function setZoom(newZoom) {
    if (state.layout === "thumbnail") return;
    if (ZOOM_PRESETS.indexOf(newZoom) === -1 || state.zoom === newZoom) return;
    state.zoom = newZoom;
    state.panX = state.panY = 0;
    render();
  }

  /* ============================================================
   * ROTATION  (§5.9)
   * ============================================================ */
  function rotate(direction) {
    // 'cw' | 'ccw'
    if (!isFlipMode()) return; // no .rotation-target in thumbnail or single's scroll strip
    var delta = direction === "cw" ? 90 : -90;
    state.rotation = (state.rotation + delta + 360) % 360;
    render();
  }
  function getRotationTarget() {
    var c = container();
    return c ? c.querySelector(".rotation-target") : null;
  }
  function applyTransform() {
    var t = getRotationTarget();
    if (!t) return;
    // Order matters: translate is OUTERMOST (applied last) so panning is in SCREEN
    // space and still feels natural when the image is rotated. Zoom scale is folded
    // in (not CSS) so it composes with rotate + pan on the same element.
    t.style.transform = "translate(" + state.panX + "px," + state.panY + "px) rotate(" + state.rotation + "deg) scale(" + zoomScale() + ")";
  }
  function zoomScale() {
    var n = parseFloat(state.zoom);
    return isNaN(n) ? 1 : n / 100;
  }

  // Expose the container's usable size as CSS vars + a rotated flag, so the fit
  // rules can swap width/height constraints when the page is turned 90°/270°.
  function applyRotationVars() {
    var c = container();
    if (!c) return;
    // Measure the box that actually clips the page image — in OCR that's the
    // narrower .ocr-page-stage, elsewhere the container — so rotated fit is correct.
    var box = c.querySelector('[data-role="ocr-page-stage"]') || c;
    c.style.setProperty("--vw", Math.max(0, box.clientWidth - 24) + "px"); // minus padding/margin
    c.style.setProperty("--vh", Math.max(0, box.clientHeight - 24) + "px");
    c.classList.toggle("is-rot-90", state.rotation % 180 === 90);
  }

  /* ============================================================
   * DRAG-TO-PAN  (§5.8) — fast path, bypasses full render()
   * ============================================================ */
  var dragStart = null;
  function beginDrag(clientX, clientY, target) {
    if (state.zoom === "fit-page" || !isFlipMode()) return false; // pan only when zoomed, flip modes
    // Only pan when the gesture STARTS on the image's clip box. In OCR that box is
    // the narrow .ocr-page-stage (panViewport), and the scrollable text panel is a
    // sibling INSIDE the same container — without this guard, scrolling the OCR
    // text on touch would drag the zoomed page underneath it.
    var vp = panViewport();
    if (vp && target && !vp.contains(target)) return false;
    dragStart = { x: clientX - state.panX, y: clientY - state.panY };
    toggleClass(container(), "is-dragging", true);
    return true; // signals caller to preventDefault (kills native img drag)
  }
  function moveDrag(clientX, clientY) {
    if (!dragStart) return;
    state.panX = clampPan(clientX - dragStart.x, "x");
    state.panY = clampPan(clientY - dragStart.y, "y");
    applyTransform(); // direct — no full render
  }
  function endDrag() {
    if (!dragStart) return;
    dragStart = null;
    toggleClass(container(), "is-dragging", false);
  }
  // The box that actually CLIPS the panned image = the pan viewport. In OCR the
  // image lives in the narrower .ocr-page-stage (its own overflow:hidden box), so
  // pan bounds must be measured against THAT, not the full container — otherwise
  // the limit is computed from the wrong axis extent (too small horizontally when
  // the stage is a row half, vertically when it's a column half). Elsewhere the
  // container is the clip box. Mirrors applyRotationVars()'s stage-aware measure.
  function panViewport() {
    var c = container();
    if (!c) return null;
    return (state.layout === "ocr" && c.querySelector('[data-role="ocr-page-stage"]')) || c;
  }
  function clampPan(v, axis) {
    var t = getRotationTarget();
    var box = panViewport();
    if (!t || !box) return v;
    var tr = t.getBoundingClientRect(),
      cr = box.getBoundingClientRect();
    var overflow = axis === "x" ? tr.width - cr.width : tr.height - cr.height;
    if (overflow <= 0) return 0; // nothing to pan
    var limit = overflow / 2;
    return clamp(v, -limit, limit);
  }

  /* ============================================================
   * FULLSCREEN  (§5.10)
   * ============================================================ */
  function toggleFullscreen() {
    var el = rootEl();
    if (!document.fullscreenElement) {
      if (el.requestFullscreen)
        el.requestFullscreen().catch(function (e) {
          console.error(e);
        });
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }

  /* ============================================================
   * SHARPEN (銳化) — a single high-intensity convolution filter on the reading
   * image(s). The <filter> primitive is a functional asset (not visual styling),
   * so viewer.js injects it once if the page doesn't already define #sharpen-hi;
   * the `filter:` application + .is-sharpened state live in viewer.css.
   * ============================================================ */
  function ensureSharpenFilter() {
    if (document.getElementById("sharpen-hi")) return; // author may supply it in Webflow
    var holder = document.createElement("div");
    // High-level 3x3 sharpen kernel (from the demo): centre 9, orthogonal −2 each.
    holder.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" ' +
      'style="position:absolute;width:0;height:0;overflow:hidden;pointer-events:none">' +
      '<filter id="sharpen-hi">' +
      '<feConvolveMatrix order="3" preserveAlpha="true" kernelMatrix="0 -2 0 -2 9 -2 0 -2 0"/>' +
      "</filter></svg>";
    if (holder.firstChild) document.body.appendChild(holder.firstChild);
  }
  function toggleSharpen() {
    if (state.layout === "thumbnail") return; // disabled in thumbnail (no reading image)
    state.sharpen = !state.sharpen;
    applySharpenClass(); // no re-render needed — the class cascades via CSS
  }

  /* ============================================================
   * RESPONSIVE LAYOUT DRAWER (tablet & below) — the .viewer-layout controls are
   * translated off-frame at small breakpoints; .viewer-layout-trigger reveals
   * them by toggling .is-open (translateY:0 override in viewer.css). Outside
   * click / Esc close it (see wireEvents / onKeydown), same as the popovers.
   * ============================================================ */
  // Close the design-system single-select dropdowns (layout / zoom). Their own
  // triggers close each other via forms.js, but the bespoke scroll popover isn't a
  // [data-dropdown], so it calls this to close them when it opens.
  function closeDsDropdowns() {
    scope.querySelectorAll("[data-dropdown].is-open").forEach(function (dd) {
      dd.classList.remove("is-open");
      var trig = dd.querySelector("[data-dropdown-trigger]");
      if (trig) trig.setAttribute("aria-expanded", "false");
    });
  }

  function toggleLayoutPanel(force) {
    var panel = layoutPanel();
    if (!panel) return;
    var open = typeof force === "boolean" ? force : !panel.classList.contains("is-open");
    panel.classList.toggle("is-open", open);
    var trig = layoutPanelTrigger();
    if (trig) trig.setAttribute("aria-expanded", open ? "true" : "false");
    // The layout/zoom DS dropdowns live inside this drawer. Their own close relies on
    // a document click bubbling to forms.js — which never happens when the drawer is
    // closed via #js-viewer-layout-close (its handler stops propagation) or Escape. Close
    // them explicitly here so the drawer closing always takes any open dropdown with it.
    if (!open) closeDsDropdowns();
  }

  /* ============================================================
   * SCROLL MODES  (§5.14) — single layout, vertical/horizontal
   * ============================================================ */
  function renderScrollStrip(c) {
    c.classList.add("viewer-scroll", "scroll-direction-" + state.scrollDirection);
    // Match reading direction to the binding by reversing the DOM ORDER (not
    // flex-direction — reverse flex + overflow has a well-known bug where the far
    // end isn't scrollable, which was pinning the strip mid-book). data-page-index
    // still carries the TRUE page number, so the observer / jumps are unaffected.
    // right-bound: horizontal reads right->left. bottom-bound: vertical reads bottom->top.
    var reverse = (state.scrollDirection === "horizontal" && orientation() === "right") || (state.scrollDirection === "vertical" && orientation() === "bottom");
    var order = state.book.pages.map(function (page, i) {
      return { page: page, idx: i + 1 };
    });
    if (reverse) order.reverse();
    var frag = document.createDocumentFragment();
    order.forEach(function (o) {
      var img = document.createElement("img");
      img.className = "page-image";
      img.setAttribute("data-role", "page-image");
      img.draggable = false;
      img.setAttribute("data-page-index", String(o.idx));
      img.loading = "lazy";
      img.alt = o.page.label || "";
      applyAspect(img, o.page);
      img.src = state.book.imageBaseUrl + o.page.file;
      frag.appendChild(img);
    });
    c.appendChild(frag);
    setupScrollObserver();
  }

  function setupScrollObserver() {
    if (scrollObserver) scrollObserver.disconnect();
    scrollObserver = new IntersectionObserver(
      function (entries) {
        var best = entries
          .filter(function (e) {
            return e.isIntersecting;
          })
          .sort(function (a, b) {
            return b.intersectionRatio - a.intersectionRatio;
          })[0];
        if (!best) return;
        var idx = parseInt(best.target.getAttribute("data-page-index"), 10);
        if (idx && idx !== state.currentPage) {
          state.currentPage = idx;
          updatePageIndicator();
          updateUrlForPage();
          highlightScrollPage();
        }
      },
      { root: container(), threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    container()
      .querySelectorAll('[data-role="page-image"][data-page-index]')
      .forEach(function (img) {
        scrollObserver.observe(img);
      });
  }

  function highlightScrollPage() {
    var c = container();
    if (!c) return;
    c.querySelectorAll('[data-role="page-image"][data-page-index]').forEach(function (img) {
      img.classList.toggle("is-active", parseInt(img.getAttribute("data-page-index"), 10) === state.currentPage);
    });
  }

  function scrollToPage(idx) {
    var target = container().querySelector('[data-page-index="' + idx + '"]');
    if (!target) return;
    var far = Math.abs(idx - state.currentPage) > SCROLL_INSTANT_JUMP;
    // inline:"nearest" (NOT "start"): scrollIntoView scrolls EVERY scrollable
    // ancestor to satisfy the requested alignment. On the live site the stage is
    // horizontally scrollable (the off-canvas side panels overflow it to the right),
    // so inline:"start" forced the stage to scroll sideways — dragging the whole
    // viewer left. The page is already fully visible on the inline axis, so "nearest"
    // leaves the stage's horizontal scroll untouched while block:"start" still lines
    // the page up to the top/left of the strip container as before.
    target.scrollIntoView({ behavior: far ? "instant" : "smooth", block: "start", inline: "nearest" });
  }

  /* ============================================================
   * THUMBNAIL  (§5.12)
   * ============================================================ */
  function renderThumbnails() {
    var grid = byId("js-thumbnail-grid");
    if (!grid) return;
    grid.innerHTML = "";
    var base = state.book.thumbnailBaseUrl || state.book.imageBaseUrl;
    var frag = document.createDocumentFragment();
    state.book.pages.forEach(function (page, i) {
      var item = tpl("tpl-thumbnail-item");
      if (!item) return;
      var btn = item.querySelector('[data-role="thumbnail-item"]');
      if (btn) btn.setAttribute("data-page-index", String(i + 1));
      var img = item.querySelector('[data-role="thumbnail-image"]');
      if (img) {
        img.src = base + page.file;
        img.alt = page.label || "";
        img.loading = "lazy";
        img.draggable = false;
        applyAspect(img, page);
      }
      setText(item.querySelector('[data-role="thumbnail-label"]'), page.label || "");
      frag.appendChild(item);
    });
    grid.appendChild(frag);
    highlightThumbnail();
  }

  function highlightThumbnail() {
    var grid = byId("js-thumbnail-grid");
    if (!grid) return;
    grid.querySelectorAll('[data-role="thumbnail-item"]').forEach(function (btn) {
      btn.classList.toggle("is-active", parseInt(btn.getAttribute("data-page-index"), 10) === state.currentPage);
    });
  }
  function scrollThumbnailIntoView(idx) {
    var grid = byId("js-thumbnail-grid");
    if (!grid) return;
    var el = grid.querySelector('[data-role="thumbnail-item"][data-page-index="' + idx + '"]');
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  /* ============================================================
   * OCR  (§5.11)
   * ============================================================ */
  // Some pages have an article RECORD covering them (e.g. a cover/back-cover
  // entry) whose articleBody is empty — no text was actually OCR'd for that
  // page. Those must NOT count as "has OCR text" (book 2922's page 1 / 16 are
  // exactly this: an article spans the page but articleBody === "").
  function articlesOnCurrentPage() {
    return (state.book.articles || []).filter(function (a) {
      return state.currentPage >= a.pageStart && state.currentPage <= a.pageEnd && stripHtml(a.articleBody).trim() !== "";
    });
  }
  function renderOcrPanel() {
    var panel = container().querySelector('[data-role="ocr-panel"]');
    if (panel) {
      panel.classList.remove("ocr-font-small", "ocr-font-medium", "ocr-font-large");
      panel.classList.add("ocr-font-" + state.ocrFontSize);
    }
    // Disable the +/− buttons at the ends of the size scale so the :disabled style applies.
    var fontIdx = OCR_FONT_SIZES.indexOf(state.ocrFontSize);
    setDisabled(byId("js-ocr-font-decrease"), fontIdx <= 0);
    setDisabled(byId("js-ocr-font-increase"), fontIdx >= OCR_FONT_SIZES.length - 1);
    var content = byId("js-ocr-content");
    var trigger = byId("js-ocr-toc-trigger");
    if (!content) return;
    content.innerHTML = "";
    var articles = articlesOnCurrentPage();
    if (!articles.length) {
      content.textContent = "本頁並無純文字內容";
      if (trigger) trigger.classList.add("is-hidden");
      return;
    }
    if (trigger) trigger.classList.toggle("is-hidden", articles.length < 2);
    articles.forEach(function (a) {
      var block = tpl("tpl-ocr-article-block");
      if (!block) return;
      // articleBody is backend OCR (the CSV `text_zht`), which carries HTML markup
      // (<p>, ocrHead). It is trusted archive content, so render it as HTML.
      var body = block.querySelector('[data-role="ocr-article-body"]');
      if (body) body.innerHTML = a.articleBody || "";
      if (block.firstElementChild) block.firstElementChild.id = "js-ocr-article-" + a.id;
      content.appendChild(block);
    });
  }
  function adjustOcrFontSize(direction) {
    var idx = OCR_FONT_SIZES.indexOf(state.ocrFontSize);
    var next = direction === "increase" ? Math.min(idx + 1, OCR_FONT_SIZES.length - 1) : Math.max(idx - 1, 0);
    if (OCR_FONT_SIZES[next] === state.ocrFontSize) return;
    state.ocrFontSize = OCR_FONT_SIZES[next];
    render();
  }
  function toggleOcrTocPopover() {
    var pop = byId("js-ocr-toc-popover");
    if (!pop) {
      buildOcrTocPopover();
      pop = byId("js-ocr-toc-popover");
    }
    if (pop) pop.classList.toggle("is-open");
  }
  // The Webflow-authored row (one row, hooked via [data-tpl="ocr-toc-item"]) is cached
  // from the popover template and cloned per article — the "one template row, JS
  // repeats it" pattern the search page's result-card list uses, so the row is styled
  // in Webflow, not in viewer.css.
  var ocrTocItemTpl = null;
  function buildOcrTocPopover() {
    var host = container().querySelector('[data-role="ocr-panel"]') || container();
    var frag = tpl("tpl-ocr-toc-popover");
    if (!frag) return;
    host.appendChild(frag);
    var list = byId("js-ocr-toc-list");
    ocrTocItemTpl = list ? list.querySelector('[data-tpl="ocr-toc-item"]') : null;
    refreshOcrTocList();
  }
  function refreshOcrTocList() {
    var list = byId("js-ocr-toc-list");
    if (!list) return;
    var articles = articlesOnCurrentPage();
    var header = scope.querySelector('#js-ocr-toc-popover [data-role="ocr-toc-header"]');
    if (header) header.textContent = "本頁有 " + articles.length + " 篇文章純文字";
    list.innerHTML = "";
    articles.forEach(function (a) {
      var li = ocrTocItemTpl ? ocrTocItemTpl.cloneNode(true) : document.createElement("li");
      li.setAttribute("data-article-id", a.id);
      if (li.querySelector("[data-field]")) {
        // column = the article's section/rubric (backend field); hidden when absent
        setTocField(li, "column", a.section != null ? a.section : a.column, true);
        setTocField(li, "title", a.title || "無標題", false);
        setTocField(li, "author", a.author, true);
      } else {
        setText(li, a.title || "無標題"); // plain <li> fallback (no [data-field] leaves)
      }
      list.appendChild(li);
    });
  }
  // Fill a [data-field] leaf inside a TOC row. Multi-values are "---"-joined
  // (design-system convention). hideWhenEmpty toggles .is-hidden so an absent
  // column/author leaves no empty line — matching the result-card behaviour.
  function setTocField(scope, name, value, hideWhenEmpty) {
    var el = scope.querySelector('[data-field="' + name + '"]');
    if (!el) return;
    var txt = value == null ? "" : String(value).split("---").join("、").trim();
    el.textContent = txt;
    if (hideWhenEmpty) el.classList.toggle("is-hidden", txt === "");
  }
  function jumpToArticleInOcr(id) {
    var block = byId("js-ocr-article-" + id);
    if (block) block.scrollIntoView({ behavior: "smooth", block: "start" });
    var pop = byId("js-ocr-toc-popover");
    if (pop) pop.classList.remove("is-open");
  }

  /* ============================================================
   * TOOLBAR / INDICATOR / DROPDOWN SYNC  (§5.6, §5.3)
   * ============================================================ */
  function updatePageIndicator() {
    var input = byId("js-page-input");
    if (input && document.activeElement !== input) input.value = String(state.currentPage);
    setText(byId("js-page-total"), state.book.pages.length);
  }

  function updateToolbarControls() {
    var isThumb = state.layout === "thumbnail";
    var total = state.book.pages.length;

    // Arrows: HIDDEN in scroll modes and thumbnail (only shown in flip modes);
    // otherwise disabled per spread-aware bounds mapped to screen position by orientation.
    var showArrows = isFlipMode();
    var leftBtn = byId("js-prev-page"),
      rightBtn = byId("js-next-page");
    toggleClass(leftBtn, "is-hidden", !showArrows);
    toggleClass(rightBtn, "is-hidden", !showArrows);
    var canNext, canPrev;
    if (state.layout === "double") {
      var vis = getVisibleSpreadPages(state.currentPage, state.connectMode);
      canNext = vis[vis.length - 1] < total;
      canPrev = vis[0] > 1;
    } else {
      canNext = state.currentPage < total;
      canPrev = state.currentPage > 1;
    }
    if (leftArrowIsNext()) {
      // right-bound book: left arrow advances
      setDisabled(leftBtn, !showArrows || !canNext);
      setDisabled(rightBtn, !showArrows || !canPrev);
    } else {
      setDisabled(leftBtn, !showArrows || !canPrev);
      setDisabled(rightBtn, !showArrows || !canNext);
    }

    // Zoom dropdown (no +/- buttons — D1) — same no-op-outside-flip-modes reasoning
    // as rotation below (applyTransform scales through .rotation-target too, which
    // doesn't exist in thumbnail or single's scroll strip).
    var canRotate = isFlipMode();
    var zt = scope.querySelector("#js-zoom-dropdown [data-dropdown-trigger]");
    setDisabled(zt, !canRotate);

    // Rotation — no-op outside flip modes: thumbnail has no reading image, and
    // single's vertical/horizontal scroll strip has no single .rotation-target
    // (see renderLayout/rotate), so disable there too, not just in thumbnail.
    setDisabled(byId("js-rotate-cw"), !canRotate);
    setDisabled(byId("js-rotate-ccw"), !canRotate);

    // Sharpen (銳化) — nothing to sharpen in thumbnail; reflect the disabled state
    setDisabled(sharpenBtn(), isThumb);

    // Page input
    setDisabled(byId("js-page-input"), isThumb);

    // Article-info panel trigger — nothing to describe in thumbnail (no reading
    // page), so disable it and close the panel if it was open.
    setDisabled(byId("js-article-info"), isThumb);
    if (isThumb && isPanelOpen("article")) closePanel("article");

    // Scroll popover (捲動方向 + 連接方向) — check-select options, reflect state + availability
    updateScrollPopover();
  }

  // The popover options use the design-system dropdown check pattern (aria-selected
  // drives .dropdown-option-check), NOT radios. viewer.js owns selection because it's
  // two single-select groups in one menu (forms.js single-select handles only one).
  function updateScrollPopover() {
    var isThumb = state.layout === "thumbnail";
    // 捲動方向: single -> all enabled; thumbnail -> only 垂直; otherwise only 翻頁
    scope.querySelectorAll("[data-scroll-direction]").forEach(function (o) {
      var val = o.getAttribute("data-scroll-direction");
      var disabled = isThumb ? val !== "vertical" : state.layout === "single" ? false : val !== "flip";
      setPopoverOption(o, val === state.scrollDirection, disabled);
    });
    // 連接方向: only meaningful in 雙頁 (double)
    scope.querySelectorAll("[data-connect-mode]").forEach(function (o) {
      var val = o.getAttribute("data-connect-mode");
      setPopoverOption(o, val === state.connectMode, state.layout !== "double");
    });
  }
  // Options are <li> like the DS dropdown lists (not buttons), so unavailability is
  // conveyed by aria-disabled + a class (+ tabindex to drop it from the tab order);
  // viewer.js also wires Enter/Space + Arrow keys since there's no native button.
  function setPopoverOption(o, selected, disabled) {
    o.setAttribute("aria-selected", selected ? "true" : "false");
    o.setAttribute("aria-disabled", disabled ? "true" : "false");
    o.classList.toggle("is-disabled", disabled);
    o.setAttribute("tabindex", disabled ? "-1" : "0");
  }
  function activateScrollOption(opt) {
    if (!opt || opt.getAttribute("aria-disabled") === "true") return;
    if (opt.hasAttribute("data-scroll-direction")) setScrollDirection(opt.getAttribute("data-scroll-direction"));
    else if (opt.hasAttribute("data-connect-mode")) setConnectMode(opt.getAttribute("data-connect-mode"));
    closeScrollPopover(); // dismiss on selection, like the DS layout/zoom dropdowns
  }
  // Close the bespoke scroll popover + reset its trigger's aria-expanded. (The DS
  // dropdowns close themselves via forms.js; this menu is viewer.js-owned.)
  function closeScrollPopover() {
    var pop = byId("js-scroll-popover");
    if (pop) pop.classList.remove("is-open");
    var trig = byId("js-scroll-popover-trigger");
    if (trig) trig.setAttribute("aria-expanded", "false");
  }

  function updateDropdownValues() {
    syncDropdown("js-layout-dropdown", state.layout);
    syncDropdown("js-zoom-dropdown", state.zoom);
  }
  function syncDropdown(id, value) {
    var dd = byId(id);
    if (!dd) return;
    var hidden = dd.querySelector('input[type="hidden"]');
    if (hidden && hidden.value !== value) hidden.value = value;
    // Design-system single-select marks selection with aria-selected (drives the
    // .dropdown-option-check icon). .is-active is kept for the older/simple preview
    // markup. Label comes from .dropdown-option-label when present, else textContent.
    var opts = dd.querySelectorAll("[data-dropdown-option], .dropdown-option");
    var label = "";
    opts.forEach(function (o) {
      var active = o.getAttribute("data-value") === value;
      o.classList.toggle("is-active", active);
      o.setAttribute("aria-selected", active ? "true" : "false");
      if (active) {
        var lab = o.querySelector("[data-dropdown-option-label], .dropdown-option-label");
        label = ((lab ? lab.textContent : o.textContent) || "").trim();
      }
    });
    var valueEl = dd.querySelector("[data-dropdown-value]");
    if (valueEl && label) setText(valueEl, label);
  }

  /* ---- visual state classes ---- */
  function applyOrientationClass() {
    var r = rootEl();
    if (!r) return;
    ["left", "right", "top", "bottom"].forEach(function (o) {
      r.classList.toggle("layout-orientation-" + o, orientation() === o);
    });
  }
  function applyZoomClass() {
    var c = container();
    if (!c) return;
    ZOOM_PRESETS.forEach(function (z) {
      c.classList.toggle("zoom-" + z, state.zoom === z);
    });
    // grab-cursor affordance: pannable only in flip modes when zoomed past fit-page
    c.classList.toggle("is-pannable", isFlipMode() && state.zoom !== "fit-page");
  }
  function applyFullscreenClass() {
    var r = rootEl();
    if (r) r.classList.toggle("is-fullscreen", state.isFullscreen);
  }
  // Sharpen state lives on the ROOT (a stable node render() never wipes), so the
  // filter cascades to every current AND future-cloned .page-image via one CSS
  // rule — and never touches .thumbnail-image. The button mirrors it with .is-active.
  function applySharpenClass() {
    var r = rootEl();
    if (r) r.classList.toggle("is-sharpened", state.sharpen);
    var b = sharpenBtn();
    if (b) b.classList.toggle("is-active", state.sharpen);
  }

  /* ============================================================
   * EVENT WIRING  (once per init)
   * ============================================================ */
  function wireEvents() {
    if (wired) return;
    wired = true;

    on(byId("js-prev-page"), "click", onLeftArrow);
    on(byId("js-next-page"), "click", onRightArrow);

    // page input jump (D2)
    var pageInput = byId("js-page-input");
    on(pageInput, "change", commitPageInput);
    on(pageInput, "keydown", function (e) {
      if (e.key === "Enter") {
        commitPageInput();
        pageInput.blur();
      }
    });

    // layout / zoom dropdowns via hidden input (forms.js dispatches 'input')
    var layoutHidden = scope.querySelector('#js-layout-dropdown input[type="hidden"]');
    on(layoutHidden, "input", function () {
      setLayout(layoutHidden.value);
    });
    var zoomHidden = scope.querySelector('#js-zoom-dropdown input[type="hidden"]');
    on(zoomHidden, "input", function () {
      setZoom(zoomHidden.value);
    });

    // scroll popover (custom): trigger toggles it; options are check-select <li>
    // (data-scroll-direction / data-connect-mode), read via one delegated click.
    on(byId("js-scroll-popover-trigger"), "click", function (e) {
      e.stopPropagation();
      var pop = byId("js-scroll-popover");
      if (!pop) return;
      // A [data-dropdown] trigger closes its sibling DS dropdowns; this popover is
      // NOT a [data-dropdown], so it must close the layout/zoom menus itself to match.
      closeDsDropdowns();
      var open = pop.classList.toggle("is-open");
      byId("js-scroll-popover-trigger").setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        var first = pop.querySelector('[data-scroll-direction]:not([aria-disabled="true"]), [data-connect-mode]:not([aria-disabled="true"])');
        if (first) first.focus();
      }
    });
    on(byId("js-scroll-popover"), "click", function (e) {
      activateScrollOption(e.target.closest && e.target.closest("[data-scroll-direction], [data-connect-mode]"));
    });
    // <li> options aren't natively keyboard-operable — wire Enter/Space + Arrow roving
    on(byId("js-scroll-popover"), "keydown", function (e) {
      var cur = e.target.closest && e.target.closest("[data-scroll-direction], [data-connect-mode]");
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        if (cur) {
          e.preventDefault();
          activateScrollOption(cur);
        }
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      var opts = Array.prototype.slice.call(byId("js-scroll-popover").querySelectorAll("[data-scroll-direction], [data-connect-mode]")).filter(function (o) {
        return o.getAttribute("aria-disabled") !== "true";
      });
      if (!opts.length) return;
      var i = opts.indexOf(cur);
      var dir = e.key === "ArrowDown" ? 1 : -1;
      (opts[(i + dir + opts.length) % opts.length] || opts[0]).focus();
    });

    // fullscreen + rotation
    on(byId("js-fullscreen"), "click", toggleFullscreen);
    on(byId("js-rotate-cw"), "click", function () {
      rotate("cw");
    });
    on(byId("js-rotate-ccw"), "click", function () {
      rotate("ccw");
    });

    // sharpen toggle (銳化)
    on(sharpenBtn(), "click", toggleSharpen);

    // side panels (目錄 / 搜尋 / 文章資訊) + copy-link toast
    wirePanels();

    // responsive layout drawer trigger (stopPropagation so the document
    // outside-click handler below doesn't immediately re-close it)
    on(layoutPanelTrigger(), "click", function (e) {
      e.stopPropagation();
      toggleLayoutPanel();
    });
    // drawer handle: closes the drawer (it lives inside the panel, so the
    // outside-click handler never sees it — the close must be explicit)
    on(layoutPanelClose(), "click", function (e) {
      e.stopPropagation();
      toggleLayoutPanel(false);
    });
    document.addEventListener("fullscreenchange", function () {
      state.isFullscreen = !!document.fullscreenElement;
      render();
    });

    // thumbnail click (delegated)
    var c = container();
    on(c, "click", function (e) {
      var thumb = e.target.closest && e.target.closest('[data-role="thumbnail-item"]');
      if (thumb) {
        var idx = parseInt(thumb.getAttribute("data-page-index"), 10);
        state.currentPage = idx;
        setLayout(state.previousLayout || "single");
        return;
      }
      var ocrTrigger = e.target.closest && e.target.closest("#js-ocr-toc-trigger");
      if (ocrTrigger) {
        toggleOcrTocPopover();
        return;
      }
      var ocrLi = e.target.closest && e.target.closest('#js-ocr-toc-list [data-tpl="ocr-toc-item"]');
      if (ocrLi) {
        jumpToArticleInOcr(ocrLi.getAttribute("data-article-id"));
        return;
      }
      var fUp = e.target.closest && e.target.closest("#js-ocr-font-increase");
      if (fUp) {
        adjustOcrFontSize("increase");
        return;
      }
      var fDown = e.target.closest && e.target.closest("#js-ocr-font-decrease");
      if (fDown) {
        adjustOcrFontSize("decrease");
        return;
      }
    });

    // drag-to-pan (container is stable; slots inside change).
    // preventDefault on a started drag stops the browser's native image drag-and-drop
    // (the half-transparent ghost + stuck grab seen on Mac trackpads); dragstart is
    // also cancelled as a belt-and-suspenders since <img> is draggable by default.
    on(c, "dragstart", function (e) {
      e.preventDefault();
    });
    on(c, "mousedown", function (e) {
      if (beginDrag(e.clientX, e.clientY, e.target)) e.preventDefault();
    });
    document.addEventListener("mousemove", function (e) {
      moveDrag(e.clientX, e.clientY);
    });
    document.addEventListener("mouseup", endDrag);
    on(
      c,
      "touchstart",
      function (e) {
        if (e.touches.length === 1) beginDrag(e.touches[0].clientX, e.touches[0].clientY, e.target);
      },
      { passive: true },
    );
    document.addEventListener(
      "touchmove",
      function (e) {
        if (dragStart && e.touches.length === 1) moveDrag(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true },
    );
    document.addEventListener("touchend", endDrag);
    window.addEventListener("resize", function () {
      if (state.book) render();
    });

    // keyboard
    document.addEventListener("keydown", onKeydown);

    // close popovers / layout drawer on outside click / ESC
    document.addEventListener("click", function (e) {
      closeIfOutside(byId("js-scroll-popover"), byId("js-scroll-popover-trigger"), e.target);
      closeIfOutside(byId("js-ocr-toc-popover"), byId("js-ocr-toc-trigger"), e.target);
      // layout drawer: click anywhere outside the drawer AND its trigger closes it
      var panel = layoutPanel();
      if (panel && panel.classList.contains("is-open") && !panel.contains(e.target)) {
        var trig = layoutPanelTrigger();
        if (!(trig && trig.contains(e.target))) toggleLayoutPanel(false);
      }
      // side panels: an open panel closes when the click is outside it AND its trigger
      ["meta", "search", "article"].forEach(function (name) {
        var p = panelEl(name);
        if (!p || !p.classList.contains("is-open") || p.contains(e.target)) return;
        var t = triggerFor(name);
        if (!(t && t.contains(e.target))) closePanel(name);
      });
    });

    window.addEventListener("popstate", onPopState);
  }

  function commitPageInput() {
    var input = byId("js-page-input");
    if (!input) return;
    var n = parseInt(input.value, 10);
    if (isNaN(n)) {
      input.value = String(state.currentPage);
      return;
    }
    setPage(n);
  }

  function onKeydown(e) {
    // Escape closes popovers / drawer / panels — handled BEFORE the input guard so
    // it still fires while the search field (auto-focused on open) or page input
    // holds focus. (A type=search field also clears on Esc; closing takes priority.)
    if (e.key === "Escape") {
      var s = byId("js-scroll-popover");
      if (s) s.classList.remove("is-open");
      var o = byId("js-ocr-toc-popover");
      if (o) o.classList.remove("is-open");
      toggleLayoutPanel(false);
      closeAllPanels();
      return;
    }
    var tag = (document.activeElement && document.activeElement.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    switch (e.key) {
      case "ArrowLeft":
        onLeftArrow();
        break;
      case "ArrowRight":
        onRightArrow();
        break;
      case "PageUp":
        turnPage("previous");
        break;
      case "PageDown":
        turnPage("next");
        break;
      default:
        return;
    }
  }

  function closeIfOutside(pop, trigger, target) {
    if (!pop || !pop.classList.contains("is-open")) return;
    if (pop.contains(target) || (trigger && trigger.contains(target))) return;
    pop.classList.remove("is-open");
  }

  /* ============================================================
   * SIDE PANELS  — Book Metadata (目錄), Search (搜尋內文), Article Info (文章資訊)
   *
   * Three drawers authored in Webflow, each translated off-canvas and carrying
   * [data-viewer-panel="meta|search|article"]. viewer.js toggles .is-open (the
   * translate:0 + inert-when-closed rules live in viewer.css). Only ONE panel is
   * open at a time; a click outside, the ✕ close button, or Esc closes it. The
   * nav triggers keep their existing js- ids (PANEL_TRIGGERS maps id -> panel).
   *
   * Content is DATA-DRIVEN from state.book (same source as the reader): the meta
   * panel mirrors the Book page's header + type-filtered TOC; search filters the
   * articles; article-info describes the article(s) on the visible page(s)
   * (spread- and connect-mode-aware). Rows are cloned from a single authored
   * [data-tpl] template per list (the result-card / OCR-TOC pattern).
   * ============================================================ */
  function panelEl(name) {
    return scope.querySelector('[data-viewer-panel="' + name + '"]');
  }
  function triggerFor(name) {
    for (var id in PANEL_TRIGGERS) if (PANEL_TRIGGERS[id] === name) return byId(id);
    return null;
  }
  function isPanelOpen(name) {
    var p = panelEl(name);
    return !!(p && p.classList.contains("is-open"));
  }
  function openPanel(name) {
    ["meta", "search", "article"].forEach(function (n) {
      if (n !== name) closePanel(n);
    }); // one at a time
    var p = panelEl(name);
    if (!p) return;
    p.classList.add("is-open");
    var t = triggerFor(name);
    if (t) t.setAttribute("aria-expanded", "true");
    if (name === "meta") updateMetaTocActive();
    if (name === "article") renderArticleInfo();
    if (name === "search") {
      var i = p.querySelector("[data-viewer-search-input]");
      if (i) i.focus();
    }
  }
  function closePanel(name) {
    var p = panelEl(name);
    if (!p) return;
    var hadFocus = p.contains(document.activeElement);
    p.classList.remove("is-open");
    var t = triggerFor(name);
    if (t) t.setAttribute("aria-expanded", "false");
    // The panel is now visibility:hidden (inert), so focus can't stay inside it —
    // return it to the trigger, else the keyboard user is stranded on <body>.
    if (hadFocus && t) t.focus();
  }
  function togglePanel(name) {
    if (isPanelOpen(name)) closePanel(name);
    else openPanel(name);
  }
  function closeAllPanels() {
    ["meta", "search", "article"].forEach(closePanel);
  }

  /* ---- shared row/template helpers ---- */
  // Clone a list's ONE authored [data-tpl] row per item. The template is captured
  // (and detached) on first use so re-renders clone from the cache; prior clones
  // ([data-clone]) are cleared each pass. New rows land before the panel's
  // .viewer-close-spacer (bottom padding) when present, else at the end.
  function renderRows(listEl, tplSel, items, fillFn) {
    if (!listEl) return;
    if (!listEl.__tpl) {
      var t = listEl.querySelector(tplSel);
      listEl.__tpl = t ? t.cloneNode(true) : null;
      if (t && t.parentNode) t.parentNode.removeChild(t);
    }
    clearClones(listEl);
    var tpl = listEl.__tpl;
    if (!tpl) return;
    var anchor = listEl.querySelector(".viewer-close-spacer");
    for (var i = 0; i < items.length; i++) {
      var row = tpl.cloneNode(true);
      row.setAttribute("data-clone", "");
      row.removeAttribute("data-tpl");
      fillFn(row, items[i], i);
      if (anchor) listEl.insertBefore(row, anchor);
      else listEl.appendChild(row);
    }
  }
  function clearClones(listEl) {
    if (!listEl) return;
    listEl.querySelectorAll("[data-clone]").forEach(function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
  }
  // Fill a [data-field] leaf (multi-values "---"-joined -> 、). hideWhenEmpty
  // toggles .is-hidden so an absent column/author leaves no blank line. Same
  // contract as setTocField (reused for the panel rows).
  function fillLeaf(scope_, name, value, hideWhenEmpty) {
    setTocField(scope_, name, value, hideWhenEmpty);
  }
  function setArticleBadge(scope_, code) {
    var el = scope_.querySelector('[data-field="article-type"]');
    if (!el) return;
    var info = code != null && String(code).trim() !== "" ? ARTICLE_TYPES[code] || { label: String(code), variant: "" } : null;
    TYPE_VARIANT_CLASSES.forEach(function (v) {
      el.classList.remove(v);
    });
    if (!info) {
      el.textContent = "";
      el.classList.add("is-hidden");
      return;
    }
    el.classList.remove("is-hidden");
    el.textContent = info.label;
    if (info.variant) el.classList.add(info.variant);
  }
  // Leading integer of a page value; blank/unparseable sorts last (mirrors book.js).
  function pageNum(p) {
    var m = String(p == null ? "" : p).match(/\d+/);
    return m ? parseInt(m[0], 10) : Infinity;
  }
  function stableSort(arr, cmp) {
    return arr
      .map(function (v, i) {
        return { v: v, i: i };
      })
      .sort(function (a, b) {
        return cmp(a.v, b.v) || a.i - b.i;
      })
      .map(function (x) {
        return x.v;
      });
  }
  function articleColumn(a) {
    return a.section != null ? a.section : a.column;
  }
  function articleNav(id) {
    var a = findArticle(state.book, id);
    if (!a) return;
    setPage(a.pageStart);
    closeAllPanels();
  }

  /* ---- 1. Book Metadata Panel (目錄) — book-level; rebuilt only on book change ---- */
  function renderMetaPanel() {
    if (!state.book || lastMetaBook === state.book.bookNumber) return;
    var panel = panelEl("meta");
    if (panel) {
      fillMetaHeader(panel);
      buildMetaToc(panel);
    }
    lastMetaBook = state.book.bookNumber;
  }
  function fillMetaHeader(panel) {
    var b = state.book;
    var jr = panel.querySelector('[data-field="journal"]');
    if (jr) jr.textContent = b.title || "";
    // 第 N 期 — hide the whole heading line when there is no issue.
    var issueEl = panel.querySelector('[data-field="journal-issue"]');
    if (issueEl) {
      var iss = issueNumber(b.issue);
      issueEl.textContent = iss;
      var head = issueEl.closest("h1,h2,h3,h4,.h4") || issueEl.parentElement;
      if (head) head.classList.toggle("is-hidden", iss === "");
    }
    // publisher — querySelector hits the real publisher dd (first match), so the
    // duplicate-field 全冊頁數 row is left untouched. Empty -> hide the row.
    setMetaDetailRow(panel, "publisher", b.publisher);
    // 出版日期
    var dateEl = panel.querySelector('[data-field="book-date"]');
    if (dateEl) {
      var timeEl = dateEl.querySelector("time") || dateEl;
      var d = b.date || "";
      timeEl.textContent = d;
      if (timeEl.tagName === "TIME" && d) timeEl.setAttribute("datetime", d);
      var wrap = dateEl.closest("[u-flex]") || dateEl.parentElement;
      if (wrap) wrap.classList.toggle("is-hidden", d === "");
    }
  }
  function setMetaDetailRow(panel, name, value) {
    var el = panel.querySelector('[data-field="' + name + '"]');
    if (!el) return;
    var empty = value == null || String(value).trim() === "";
    var row = el.closest("[u-flex]") || el.parentElement;
    el.textContent = empty ? "" : String(value);
    if (row) row.classList.toggle("is-hidden", empty);
  }
  function issueNumber(issue) {
    if (issue == null || String(issue).trim() === "") return "";
    return String(issue).replace(/^第/, "").replace(/期$/, "").trim();
  }
  // The article TOC — same type-exclusion as the Book page (drops ads/company
  // pages), sorted by page. Rows navigate to the article's first page on click.
  function buildMetaToc(panel) {
    var list = panel.querySelector("[data-viewer-toc-list]");
    if (!list) return;
    var pool = (state.book.articles || []).filter(function (a) {
      return !EXCLUDE_TYPES[String(a.type)];
    });
    pool = stableSort(pool, function (a, b) {
      return pageNum(a.page != null ? a.page : a.pageStart) - pageNum(b.page != null ? b.page : b.pageStart);
    });
    renderRows(list, '[data-tpl="toc-item"]', pool, fillArticleRow);
  }
  // Highlight the TOC row(s) whose article is showing on the current visible
  // page(s) — SAME "showing" rule as the Article Info panel (visibleArticles(),
  // §3 below). Separate from buildMetaToc() above: the TOC rows are built once
  // per book, but which one is "active" changes on every page turn.
  function updateMetaTocActive() {
    var panel = panelEl("meta");
    if (!panel) return;
    var list = panel.querySelector("[data-viewer-toc-list]");
    if (!list) return;
    var visibleIds = {};
    visibleArticles().forEach(function (a) {
      visibleIds[a.id] = true;
    });
    list.querySelectorAll("[data-article-id]").forEach(function (row) {
      row.classList.toggle("is-active", !!visibleIds[row.getAttribute("data-article-id")]);
    });
  }
  // Shared filler for the meta-TOC and search-result rows (column / title / author + nav id).
  // The rows navigate on click, so make them keyboard-operable (button role + tab stop);
  // wirePanels wires Enter/Space to the same articleNav the click uses.
  function fillArticleRow(row, a) {
    fillLeaf(row, "column", articleColumn(a), true);
    fillLeaf(row, "title", a.title || "無標題", false);
    fillLeaf(row, "author", a.author, true);
    row.setAttribute("data-article-id", a.id);
    if (row.tagName !== "A" && row.tagName !== "BUTTON") {
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
    }
  }

  /* ---- 2. Search Panel (搜尋內文) ---- */
  function resetSearch() {
    var panel = panelEl("search");
    if (!panel) return;
    var input = panel.querySelector("[data-viewer-search-input]");
    if (input) input.value = "";
    showSearchState(panel, "idle", []);
  }
  function runSearch(q) {
    var panel = panelEl("search");
    if (!panel) return;
    q = (q || "").trim();
    if (!q) return showSearchState(panel, "idle", []);
    var matches = searchArticles(q);
    showSearchState(panel, matches.length ? "results" : "empty", matches);
  }
  // idle: nothing shown · empty: 沒有查詢結果 · results: the list.
  function showSearchState(panel, mode, matches) {
    var results = panel.querySelector("[data-viewer-search-results]");
    var empty = panel.querySelector("[data-viewer-search-empty]");
    if (empty) empty.classList.toggle("is-hidden", mode !== "empty");
    if (results) {
      results.classList.toggle("is-hidden", mode !== "results");
      if (mode === "results") renderRows(results, '[data-tpl="search-item"]', matches, fillArticleRow);
      else clearClones(results);
    }
  }
  function searchArticles(q) {
    var needle = q.toLowerCase();
    return (state.book.articles || []).filter(function (a) {
      var hay = [a.title, a.author, articleColumn(a), a.keywords, stripHtml(a.articleBody)].filter(Boolean).join(" ").toLowerCase();
      return hay.indexOf(needle) !== -1;
    });
  }
  function stripHtml(s) {
    return s == null ? "" : String(s).replace(/<[^>]*>/g, " ");
  }

  /* ---- 3. Article Metadata Panel (文章資訊) — the article(s) on the visible
   * page(s). Double-page shows both pages' articles; connect-mode decides which
   * pages are visible (連接上頁/下頁). Disabled in thumbnail (updateToolbarControls). ---- */
  function visiblePages() {
    if (state.layout === "double") return getVisibleSpreadPages(state.currentPage, state.connectMode);
    return [state.currentPage];
  }
  function visibleArticles() {
    var pages = visiblePages();
    var lo = Math.min.apply(null, pages),
      hi = Math.max.apply(null, pages);
    return (state.book.articles || []).filter(function (a) {
      return a.pageStart <= hi && a.pageEnd >= lo;
    });
  }
  function renderArticleInfo() {
    var panel = panelEl("article");
    if (!panel) return;
    var pageList = panel.querySelector('[data-field="page-list"]');
    if (pageList) pageList.textContent = visiblePages().join("、");
    var list = panel.querySelector("[data-viewer-article-list]");
    if (!list) return;
    renderArticleEmpty(list, false);
    var arts = visibleArticles();
    if (!arts.length) {
      clearClones(list);
      renderArticleEmpty(list, true);
      return;
    }
    renderRows(list, '[data-tpl="article-info-item"]', arts, fillArticleInfoItem);
  }
  // A tiny inline empty-state (no authored node for it); toggled, not cloned.
  function renderArticleEmpty(list, show) {
    var msg = list.querySelector("[data-viewer-article-empty]");
    if (show && !msg) {
      msg = document.createElement("p");
      msg.setAttribute("data-viewer-article-empty", "");
      msg.className = "paragraph-lg";
      msg.textContent = "本頁沒有文章資訊";
      var anchor = list.querySelector(".viewer-close-spacer");
      if (anchor) list.insertBefore(msg, anchor);
      else list.appendChild(msg);
    } else if (!show && msg) {
      msg.parentNode.removeChild(msg);
    }
  }
  function fillArticleInfoItem(item, a) {
    fillLeaf(item, "title", a.title || "無標題", false);
    // Name each <article> by its title. The authored template carries an EMPTY
    // aria-labelledby (points at nothing); give the title a unique id per clone
    // (a.id is unique + valid) and point the article at it, so a double-page
    // spread's two articles are announced as "文章，等情郎" / "…，河上相思".
    var titleEl = item.querySelector('[data-field="title"]');
    if (titleEl && a.id != null) {
      titleEl.id = "js-article-info-title-" + a.id;
      item.setAttribute("aria-labelledby", titleEl.id);
    }
    fillInfoRow(item, "author", a.author);
    fillInfoRow(item, "column", articleColumn(a));
    fillInfoRow(item, "page", a.page != null ? a.page : a.pageStart);
    setArticleBadge(item, a.type);
    hideRowIfLeafHidden(item, "article-type"); // badge hidden (unknown type) -> hide its row
    fillKeywords(item, a.keywords);
  }
  // Fill a value leaf (multi-values "---"-joined -> 、) and hide the WHOLE
  // article-info row (label + value) when the value is empty — so an absent
  // 專欄/作者 leaves no dangling label.
  function fillInfoRow(item, name, value) {
    var el = item.querySelector('[data-field="' + name + '"]');
    if (!el) return;
    var txt = value == null ? "" : String(value).split("---").join("、").trim();
    el.textContent = txt;
    var row = el.closest(".article-info-row") || el.parentElement;
    if (row) row.classList.toggle("is-hidden", txt === "");
  }
  function hideRowIfLeafHidden(item, name) {
    var el = item.querySelector('[data-field="' + name + '"]');
    if (!el) return;
    var row = el.closest(".article-info-row");
    if (row) row.classList.toggle("is-hidden", el.classList.contains("is-hidden"));
  }
  // Keyword chips — one authored [data-tpl="keyword-item"] li cloned per keyword.
  // The whole [data-viewer-keyword-row] hides when the article has no keywords.
  function fillKeywords(item, keywords) {
    var list = item.querySelector("[data-viewer-keyword-list]");
    var row = item.querySelector("[data-viewer-keyword-row]") || (list && list.closest(".article-info-row"));
    var kws = keywords
      ? String(keywords)
          .split("---")
          .map(function (s) {
            return s.trim();
          })
          .filter(Boolean)
      : [];
    if (row) row.classList.toggle("is-hidden", kws.length === 0);
    if (!list) return;
    renderRows(list, '[data-tpl="keyword-item"]', kws, function (li, kw) {
      var t = li.querySelector('[data-field="keyword"]') || li.querySelector("div");
      if (t) t.textContent = kw;
    });
  }

  /* ---- 4. Copy page link to clipboard (#js-share) ---- */
  function copyPageLink() {
    var url = window.location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(showLinkAlert, function () {
        legacyCopy(url);
        showLinkAlert();
      });
    } else {
      legacyCopy(url);
      showLinkAlert();
    }
  }
  function legacyCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch (e) {
      /* clipboard unavailable — the toast still confirms the attempt */
    }
  }
  // Reveal the toast (opacity + translateY via .is-visible in CSS), auto-hide after LINK_ALERT_MS.
  function showLinkAlert() {
    var alert = scope.querySelector("[data-viewer-alert]");
    if (!alert) return;
    alert.classList.add("is-visible");
    if (linkAlertTimer) clearTimeout(linkAlertTimer);
    linkAlertTimer = setTimeout(function () {
      alert.classList.remove("is-visible");
      linkAlertTimer = null;
    }, LINK_ALERT_MS);
  }

  /* ---- panel event wiring (called from wireEvents) ---- */
  function wirePanels() {
    // triggers (stopPropagation so the document outside-click handler doesn't
    // immediately re-close the panel it just opened). aria-haspopup advertises the
    // drawer to assistive tech (aria-expanded is kept in sync by open/closePanel).
    Object.keys(PANEL_TRIGGERS).forEach(function (id) {
      var trig = byId(id);
      if (trig && !trig.hasAttribute("aria-haspopup")) trig.setAttribute("aria-haspopup", "dialog");
      on(trig, "click", function (e) {
        e.stopPropagation();
        togglePanel(PANEL_TRIGGERS[id]);
      });
    });
    // per-panel delegated clicks + keyboard: ✕ close button + result-row navigation
    ["meta", "search", "article"].forEach(function (name) {
      var p = panelEl(name);
      if (!p) return;
      // Give the panel an accessible name + each ✕ button one, if the author didn't
      // (the button is icon-only, so without this a screen reader announces just "button").
      if (!p.getAttribute("aria-label") && !p.getAttribute("aria-labelledby")) {
        var t = triggerFor(name);
        var lbl = t ? t.textContent.replace(/​/g, "").trim() : name;
        if (lbl) p.setAttribute("aria-label", lbl);
      }
      p.querySelectorAll("[data-viewer-close]").forEach(function (btn) {
        if (!btn.getAttribute("aria-label")) btn.setAttribute("aria-label", "關閉");
      });
      on(p, "click", function (e) {
        if (e.target.closest && e.target.closest("[data-viewer-close]")) {
          closePanel(name);
          return;
        }
        var row = e.target.closest && e.target.closest("[data-article-id]");
        if (row) articleNav(row.getAttribute("data-article-id"));
      });
      // keyboard activation for the button-role result/TOC rows (Enter / Space)
      on(p, "keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
        var row = e.target.closest && e.target.closest("[data-article-id]");
        if (row) {
          e.preventDefault();
          articleNav(row.getAttribute("data-article-id"));
        }
      });
    });
    // share / copy link — make the toast a polite live region so a screen reader
    // announces the copy (4.1.3 Status Messages) instead of it being silent.
    var alertEl = scope.querySelector("[data-viewer-alert]");
    if (alertEl) {
      if (!alertEl.getAttribute("role")) alertEl.setAttribute("role", "status");
      if (!alertEl.hasAttribute("aria-live")) alertEl.setAttribute("aria-live", "polite");
    }
    on(byId("js-share"), "click", function (e) {
      e.stopPropagation();
      copyPageLink();
    });
    // search: submit (form / 🔍 button) + Enter, and live-reset when the field is cleared
    var searchPanel = panelEl("search");
    if (searchPanel) {
      var input = searchPanel.querySelector("[data-viewer-search-input]");
      var form = searchPanel.querySelector("[data-viewer-search-form]") || (input && input.closest("form"));
      if (form)
        on(form, "submit", function (e) {
          e.preventDefault();
          if (input) runSearch(input.value);
        });
      if (input) {
        on(input, "input", function () {
          if (input.value.trim() === "") runSearch("");
        });
        on(input, "keydown", function (e) {
          if (e.key === "Enter") {
            e.preventDefault();
            runSearch(input.value);
          }
        });
      }
      var clear = searchPanel.querySelector("[data-input-clear]");
      if (clear)
        on(clear, "click", function () {
          // forms.js empties the field on its own click; reset results next tick
          setTimeout(function () {
            runSearch("");
          }, 0);
        });
    }
  }

  /* ---------------- expose ---------------- */
  window.filmtvViewer = {
    init: init,
    load: load,
    render: render,
    state: state, // read-only-ish handle for debugging / the mock switcher
  };
})();
