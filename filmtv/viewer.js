/* ============================================================
 * viewer.js — Film/TV publication BOOK VIEWER (handoff component)
 *
 * STAGE 1: Page Manipulation (layout, page-turn, zoom, rotation, drag,
 * fullscreen, scroll modes, thumbnail, OCR). Navigation / Search / Metadata
 * are LATER stages that extend THIS SAME file (same `state`, same `render()`).
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
 *     button.cc-sharpen (or #js-sharpen)  toggles the high sharpen filter
 *   responsive layout drawer (tablet & below):
 *     .viewer-layout-trigger (or #js-viewer-layout-trigger)  opens the drawer
 *     .viewer-layout (or #js-viewer-layout)  the drawer (JS toggles .is-open)
 *   <template> hooks (inert; cloned by JS):
 *     #tpl-layout-single #tpl-layout-double #tpl-layout-ocr #tpl-layout-thumbnail
 *     #tpl-thumbnail-item #tpl-ocr-article-block #tpl-ocr-toc-popover
 *     #tpl-page-placeholder #tpl-page-error
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
  var PRELOAD_RADIUS = 2; // flip-mode preload window (current ± N)
  var DESKTOP_MIN_WIDTH = 1024; // >= this => default 'double', else 'single'
  var SCROLL_INSTANT_JUMP = 10; // pages: beyond this, jump instantly not smoothly

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
  var imageCache = new Map();
  var scrollObserver = null;
  var lastStructureKey = null; // gates the expensive template re-clone
  var wired = false; // event listeners attached once per init

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
  // Feature hooks that are plain Webflow chrome (no template clone): prefer a
  // js- id if the author adds one, else fall back to the unique Webflow class.
  function sharpenBtn() {
    return byId("js-sharpen") || $(".cc-sharpen");
  }
  function layoutPanel() {
    return byId("js-viewer-layout") || $(".viewer-layout");
  }
  function layoutPanelTrigger() {
    return byId("js-viewer-layout-trigger") || $(".viewer-layout-trigger");
  }
  function rootEl() {
    return scope.querySelector(".viewer-root") || (scope.querySelector ? scope : document.body);
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

    ensureSharpenFilter();
    wireEvents();

    var url = readUrl();
    var bookNumber = opts.bookNumber || url.book || (scope.getAttribute && scope.getAttribute("data-book-number"));
    if (!bookNumber) {
      console.error("[viewer] no book specified (URL ?book= or opts.bookNumber)");
      return;
    }
    return load(bookNumber, { page: opts.page || url.page, article: opts.article || url.article });
  }

  function load(bookNumber, nav) {
    nav = nav || {};
    return fetchBook(bookNumber)
      .then(function (book) {
        state.book = book;
        // reset per-book manual settings
        state.rotation = 0;
        state.zoom = "fit-page";
        state.sharpen = false;
        state.panX = state.panY = 0;
        state.previousLayout = null;
        state.layout = defaultLayout();
        state.currentPage = resolveInitialPage(book, nav);
        lastStructureKey = null; // force structural rebuild for the new book
        render();
      })
      .catch(function (err) {
        console.error("[viewer] load failed:", err);
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

  function findArticle(book, id) {
    var arr = book.articles || [];
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  /* ============================================================
   * URL STATE  (§3.3 / §3.4)  — only book/page/article live in the URL
   * ============================================================ */
  function readUrl() {
    var p = new URLSearchParams(window.location.search);
    return { book: p.get("book"), page: p.get("page"), article: p.get("article") };
  }

  function updateUrlForPage() {
    if (!state.book) return;
    var p = new URLSearchParams(window.location.search);
    p.set("book", state.book.bookNumber);
    p.set("page", String(state.currentPage));
    p.delete("article"); // paginating drops the article ref
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
        markRotationTarget(c.querySelector(".page-image"));
      } else {
        renderScrollStrip(c);
      }
      return;
    }
    if (state.layout === "double") {
      var d = tpl("tpl-layout-double");
      if (d) c.appendChild(d);
      markRotationTarget(c.querySelector(".page-spread") || c.firstElementChild);
      return;
    }
    if (state.layout === "ocr") {
      var o = tpl("tpl-layout-ocr");
      if (o) c.appendChild(o);
      markRotationTarget(c.querySelector(".page-image"));
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
      renderPageImage(c.querySelector(".page-image"), pageAt(state.currentPage));
    } else if (state.layout === "single") {
      highlightScrollPage();
    } else if (state.layout === "double") {
      renderDoubleContent(c);
    } else if (state.layout === "ocr") {
      renderPageImage(c.querySelector(".page-image"), pageAt(state.currentPage));
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
    var slotLeft = c.querySelector(".page-image--left");
    var slotRight = c.querySelector(".page-image--right");
    toggleClass(c.querySelector(".page-spread") || c, "spread-lone", pages.length === 1);
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
      if (slot.getAttribute("src") !== url) slot.setAttribute("src", url);
      slot.onerror = function () {
        slot.classList.add("is-error");
      };
      slot.onload = function () {
        slot.classList.remove("is-error");
      };
      return;
    }

    var ph = tpl("tpl-page-placeholder");
    if (ph) {
      setText(ph.querySelector(".page-placeholder-label"), page.label || "");
      applyAspect(ph.firstElementChild, page);
    }
    slot.innerHTML = "";
    if (ph) slot.appendChild(ph);

    var img = new Image();
    img.className = "page-image";
    img.draggable = false;
    img.alt = page.label || "";
    applyAspect(img, page);
    img.addEventListener("load", function () {
      slot.innerHTML = "";
      slot.appendChild(img);
      markRotationTarget(img);
    });
    img.addEventListener("error", function () {
      var er = tpl("tpl-page-error");
      if (er) setText(er.querySelector(".page-error-label"), "無法載入：" + (page.label || page.file));
      slot.innerHTML = "";
      if (er) slot.appendChild(er);
    });
    img.src = url;
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
    if (newLayout === "thumbnail") state.previousLayout = state.layout;
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
    if (state.layout === "thumbnail") return;
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
    var box = c.querySelector(".ocr-page-stage") || c;
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
    return (state.layout === "ocr" && c.querySelector(".ocr-page-stage")) || c;
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
    state.sharpen = !state.sharpen;
    applySharpenClass(); // no re-render needed — the class cascades via CSS
  }

  /* ============================================================
   * RESPONSIVE LAYOUT DRAWER (tablet & below) — the .viewer-layout controls are
   * translated off-frame at small breakpoints; .viewer-layout-trigger reveals
   * them by toggling .is-open (translateY:0 override in viewer.css). Outside
   * click / Esc close it (see wireEvents / onKeydown), same as the popovers.
   * ============================================================ */
  function toggleLayoutPanel(force) {
    var panel = layoutPanel();
    if (!panel) return;
    var open = typeof force === "boolean" ? force : !panel.classList.contains("is-open");
    panel.classList.toggle("is-open", open);
    var trig = layoutPanelTrigger();
    if (trig) trig.setAttribute("aria-expanded", open ? "true" : "false");
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
      .querySelectorAll(".page-image[data-page-index]")
      .forEach(function (img) {
        scrollObserver.observe(img);
      });
  }

  function highlightScrollPage() {
    var c = container();
    if (!c) return;
    c.querySelectorAll(".page-image[data-page-index]").forEach(function (img) {
      img.classList.toggle("is-active", parseInt(img.getAttribute("data-page-index"), 10) === state.currentPage);
    });
  }

  function scrollToPage(idx) {
    var target = container().querySelector('[data-page-index="' + idx + '"]');
    if (!target) return;
    var far = Math.abs(idx - state.currentPage) > SCROLL_INSTANT_JUMP;
    target.scrollIntoView({ behavior: far ? "instant" : "smooth", block: "start", inline: "start" });
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
      var btn = item.querySelector(".thumbnail-item");
      if (btn) btn.setAttribute("data-page-index", String(i + 1));
      var img = item.querySelector(".thumbnail-image");
      if (img) {
        img.src = base + page.file;
        img.alt = page.label || "";
        img.loading = "lazy";
        img.draggable = false;
        applyAspect(img, page);
      }
      setText(item.querySelector(".thumbnail-label"), page.label || "");
      frag.appendChild(item);
    });
    grid.appendChild(frag);
    highlightThumbnail();
  }

  function highlightThumbnail() {
    var grid = byId("js-thumbnail-grid");
    if (!grid) return;
    grid.querySelectorAll(".thumbnail-item").forEach(function (btn) {
      btn.classList.toggle("is-active", parseInt(btn.getAttribute("data-page-index"), 10) === state.currentPage);
    });
  }
  function scrollThumbnailIntoView(idx) {
    var grid = byId("js-thumbnail-grid");
    if (!grid) return;
    var el = grid.querySelector('.thumbnail-item[data-page-index="' + idx + '"]');
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  /* ============================================================
   * OCR  (§5.11)
   * ============================================================ */
  function articlesOnCurrentPage() {
    return (state.book.articles || []).filter(function (a) {
      return state.currentPage >= a.pageStart && state.currentPage <= a.pageEnd;
    });
  }
  function renderOcrPanel() {
    var panel = container().querySelector(".ocr-panel");
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
      content.textContent = "無內文";
      if (trigger) trigger.classList.add("is-hidden");
      return;
    }
    if (trigger) trigger.classList.toggle("is-hidden", articles.length < 2);
    articles.forEach(function (a) {
      var block = tpl("tpl-ocr-article-block");
      if (!block) return;
      // articleBody is backend OCR (the CSV `text_zht`), which carries HTML markup
      // (<p>, ocrHead). It is trusted archive content, so render it as HTML.
      var body = block.querySelector(".ocr-article-body");
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
  // The Webflow-authored .ocr-toc-item (one row) is cached from the popover template
  // and cloned per article — the "one template row, JS repeats it" pattern the search
  // page's result-card list uses, so the row is styled in Webflow, not in viewer.css.
  var ocrTocItemTpl = null;
  function buildOcrTocPopover() {
    var host = container().querySelector(".ocr-panel") || container();
    var frag = tpl("tpl-ocr-toc-popover");
    if (!frag) return;
    host.appendChild(frag);
    var list = byId("js-ocr-toc-list");
    ocrTocItemTpl = list ? list.querySelector(".ocr-toc-item") : null;
    refreshOcrTocList();
  }
  function refreshOcrTocList() {
    var list = byId("js-ocr-toc-list");
    if (!list) return;
    var articles = articlesOnCurrentPage();
    var header = scope.querySelector("#js-ocr-toc-popover .ocr-toc-header");
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

    // Zoom dropdown (no +/- buttons — D1)
    var zt = scope.querySelector("#js-zoom-dropdown [data-dropdown-trigger]");
    setDisabled(zt, isThumb);

    // Rotation
    setDisabled(byId("js-rotate-cw"), isThumb);
    setDisabled(byId("js-rotate-ccw"), isThumb);

    // Page input
    setDisabled(byId("js-page-input"), isThumb);

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
      var opts = Array.prototype.slice
        .call(byId("js-scroll-popover").querySelectorAll("[data-scroll-direction], [data-connect-mode]"))
        .filter(function (o) {
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

    // responsive layout drawer trigger (stopPropagation so the document
    // outside-click handler below doesn't immediately re-close it)
    on(layoutPanelTrigger(), "click", function (e) {
      e.stopPropagation();
      toggleLayoutPanel();
    });
    document.addEventListener("fullscreenchange", function () {
      state.isFullscreen = !!document.fullscreenElement;
      render();
    });

    // thumbnail click (delegated)
    var c = container();
    on(c, "click", function (e) {
      var thumb = e.target.closest && e.target.closest(".thumbnail-item");
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
      var ocrLi = e.target.closest && e.target.closest("#js-ocr-toc-list .ocr-toc-item");
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
      case "Escape":
        var s = byId("js-scroll-popover");
        if (s) s.classList.remove("is-open");
        var o = byId("js-ocr-toc-popover");
        if (o) o.classList.remove("is-open");
        toggleLayoutPanel(false);
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

  /* ---------------- expose ---------------- */
  window.filmtvViewer = {
    init: init,
    load: load,
    render: render,
    state: state, // read-only-ish handle for debugging / the mock switcher
  };
})();
