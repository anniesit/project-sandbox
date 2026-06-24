/* ============================================================
 * cooccur.js — keyword CO-OCCURRENCE bubble chart (vanilla SVG, no deps)
 *
 * Answers "the 10 keywords most often mentioned in the same article as
 * keyword X". Opens inside the search-results modal once a search has run.
 *
 *   • x axis : article year
 *   • y axis : the 10 co-occurring keywords, one row each, sorted by total
 *              article count DESC (biggest at top)
 *   • bubble : area encodes that keyword's count in that year
 *   • legend : the y-axis labels themselves — right-aligned "keyword（共N篇）"
 *              buttons; clicking one adds the keyword to the search
 *
 * HOVER / CLICK ARE GRID-CELL BASED, NOT BUBBLE BASED. Each (year × keyword)
 * cell is a transparent hit target; the bubbles have pointer-events:none. So
 * overlapping bubbles never create dead zones or ambiguous targets — the cursor
 * always resolves to exactly one cell.
 *
 * Integration API (global), mirrors window.filmtvChart:
 *   window.filmtvCooccur.render(rootEl, data)
 *   window.filmtvCooccur.redraw(rootEl?)        // re-measure + redraw (e.g. on modal open)
 *
 * data shape (pre-aggregated — the backend computes the co-occurrence):
 *   {
 *     keyword : "楚原",                 // the searched term X (for the title/aria)
 *     years   : [1955, ... 1997],       // x domain, ascending
 *     series  : [ { key, label, total, counts:[ per-year ] }, ... ],  // any order
 *     selected: ["井莉", ...]            // OPTIONAL: keys already in the search bar
 *   }                                    //  (authoritative selected state, if known)
 * cooccur.js sorts series by total desc, keeps the top 10, and colours them by
 * row. `key` is a stable id (may differ from the display `label`).
 *
 * Ownership split (same as chart.js): this file owns the VISUAL + the click
 * affordance; the BACKEND owns the SEARCH STATE. Clicking a keyword FIRES a
 * bubbling event and nothing else — the backend listens, adds/removes the term
 * (enforcing the max of 5 keywords per search), and re-renders with `selected`:
 *   • add a keyword     -> filmtv:addKeyword     { detail: { key, label, total } }
 *   • remove a keyword  -> filmtv:removeKeyword   { detail: { key, label } }
 *   document.addEventListener("filmtv:addKeyword", e =>
 *     addTermToSearch(e.detail.key).then(data => filmtvCooccur.render(rootEl, data)));
 *
 * A thin self-fetch of DATA_URL runs only as the MOCK driver; the backend
 * removes it and calls render() with the live result set.
 *
 * data-* contract:
 *   [data-cooccur]   chart root (one per instance)
 *   [data-src]       optional JSON url override for the mock driver
 *   [data-height]    optional plot height in px (default 480)
 * ============================================================ */
(function () {
  "use strict";

  var SELF =
    (document.currentScript && document.currentScript.src) ||
    (function () {
      var s = document.querySelector('script[src*="cooccur.js"]');
      return s ? s.src : window.location.href;
    })();

  /* >>> MOCK DATA URL <<< backend replaces this (or removes the self-fetch). */
  var DATA_URL = new URL("./sample-data/cooccur-sample.json", SELF).href;

  var TOP_N = 10;            // keyword rows shown
  var MAX_KEYWORDS = 5;      // UI guard only — the backend is the source of truth
  var UNIT = " 篇";          // article-count unit, matches the archive UI

  // plot insets (px). top/bottom are mirrored as legend padding so the rows of
  // the HTML legend line up with the SVG rows. left is a small gutter (the
  // labels live outside the SVG); bottom leaves room for the year axis.
  var GEOM = { top: 10, right: 18, bottom: 28, left: 6 };

  /* Fallback categorical palette (CSS vars --filmtv-cooccur-color-N override). */
  var PALETTE = [
    "#534AB7", "#D4537E", "#1D9E75", "#D85A30", "#4E7622",
    "#378ADD", "#BA7517", "#6E6B63", "#A32D2D", "#2E8C8C"
  ];

  // desktop (hover + fine pointer) shows the transient tooltip on mousemove.
  var HOVER = !!(window.matchMedia &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches);

  /* ---------- bootstrap ---------- */
  ready(function () {
    var roots = document.querySelectorAll("[data-cooccur]");
    for (var i = 0; i < roots.length; i++) initChart(roots[i]);
  });

  function initChart(root) {
    if (root.__cooccur) return root.__cooccur;
    var st = {
      height: parseInt(root.getAttribute("data-height"), 10) || 480,
      model: null,
      selected: {},     // key -> true (local mirror; backend may overwrite via render)
      noteTimer: 0,
      raf: 0
    };
    root.__cooccur = st;
    buildShell(root, st);
    bindHover(root, st);
    bindLegend(root, st);

    // redraw on container resize (debounced to one frame)
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(function () {
        if (st.raf) return;
        st.raf = requestAnimationFrame(function () { st.raf = 0; draw(root); });
      }).observe(st.canvas);
    } else {
      window.addEventListener("resize", function () { draw(root); });
    }

    // if the chart sits inside a <dialog> (the design-system modal), the canvas
    // has zero size until the dialog opens — redraw the moment it does.
    var dlg = root.closest && root.closest("dialog");
    if (dlg && typeof MutationObserver === "function") {
      new MutationObserver(function () {
        if (dlg.open) requestAnimationFrame(function () { draw(root); });
      }).observe(dlg, { attributes: true, attributeFilter: ["open"] });
    }

    mockFetch(root, st);
    return st;
  }

  // Build the inner DOM once: legend column (left) + canvas with SVG + tooltip.
  function buildShell(root, st) {
    root.classList.add("filmtv-cooccur");
    // expose the row-band insets so the CSS legend padding can match the SVG
    root.style.setProperty("--filmtv-cooccur-pad-top", GEOM.top + "px");
    root.style.setProperty("--filmtv-cooccur-pad-bottom", GEOM.bottom + "px");

    var body = el("div", "filmtv-cooccur-body");
    var legend = el("div", "filmtv-cooccur-legend");
    legend.setAttribute("role", "list");
    var canvas = el("div", "filmtv-cooccur-canvas");
    canvas.style.height = st.height + "px";
    legend.style.height = st.height + "px";
    var svgHost = el("div", "filmtv-cooccur-svg");
    var tooltip = el("div", "filmtv-cooccur-tooltip");
    tooltip.setAttribute("aria-hidden", "true");
    var note = el("div", "filmtv-cooccur-note");
    note.setAttribute("aria-hidden", "true");

    canvas.appendChild(svgHost);
    canvas.appendChild(tooltip);
    canvas.appendChild(note);
    body.appendChild(legend);
    body.appendChild(canvas);
    root.appendChild(body);

    st.body = body; st.legend = legend; st.canvas = canvas;
    st.svgHost = svgHost; st.tooltip = tooltip; st.note = note;
  }

  function mockFetch(root, st) {
    var url = root.getAttribute("data-src") || DATA_URL;
    fetch(url, { credentials: "omit" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) { render(root, data || {}); })
      .catch(function (err) { console.error("[cooccur] mock load failed (" + url + "):", err); });
  }

  /* ---------- public render (backend calls this) ---------- */
  function render(root, data) {
    if (!root) {
      var all = document.querySelectorAll("[data-cooccur]");
      for (var n = 0; n < all.length; n++) render(all[n], data);
      return;
    }
    var st = root.__cooccur || initChart(root);
    st.model = buildModel(root, data || {});
    // authoritative selected state from the backend, when provided
    if (Array.isArray(data && data.selected)) {
      st.selected = {};
      data.selected.forEach(function (k) { st.selected[k] = true; });
    }
    hideTip(st);
    renderLegend(root, st);
    draw(root);
  }

  /* ---------- model: keep top-10 series, colour by row ---------- */
  function buildModel(root, data) {
    var palette = getPalette(root);
    var years = (Array.isArray(data.years) ? data.years : []).map(Number);

    var series = (Array.isArray(data.series) ? data.series : [])
      .map(function (s) {
        var counts = years.map(function (_, k) { return Number((s.counts || [])[k]) || 0; });
        var total = (typeof s.total === "number")
          ? s.total
          : counts.reduce(function (a, b) { return a + b; }, 0);
        return { key: s.key != null ? s.key : s.label, label: s.label || s.key, total: total, counts: counts };
      })
      .sort(function (a, b) { return b.total - a.total || (a.label < b.label ? -1 : 1); })
      .slice(0, TOP_N);

    series.forEach(function (s, i) { s.color = palette[i % palette.length]; });

    var maxCount = 0;
    series.forEach(function (s) {
      for (var i = 0; i < s.counts.length; i++) if (s.counts[i] > maxCount) maxCount = s.counts[i];
    });

    return { keyword: data.keyword || "", years: years, series: series, maxCount: maxCount || 1 };
  }

  /* ---------- draw (SVG) ---------- */
  function draw(root) {
    var st = root.__cooccur;
    if (!st || !st.model) return;
    var W = st.canvas.clientWidth || 0;
    var H = st.height;
    if (W < 2) return;   // hidden (e.g. modal not open yet) — redrawn on open

    var m = st.model, years = m.years, series = m.series;
    var ny = years.length, nk = series.length;
    if (!ny || !nk) { st.svgHost.innerHTML = ""; return; }

    var plotW = Math.max(1, W - GEOM.left - GEOM.right);
    var plotH = Math.max(1, H - GEOM.top - GEOM.bottom);
    var band = plotW / ny;             // width of one year column
    var rowH = plotH / nk;             // height of one keyword row

    function X(yi) { return GEOM.left + (yi + 0.5) * band; }
    function rowMid(ki) { return GEOM.top + (ki + 0.5) * rowH; }

    // bubble area ∝ count. Largest count fills most of a row; capped so it never
    // dwarfs the band. Tiny but non-zero counts keep a visible minimum dot.
    var maxR = Math.max(3, Math.min(rowH * 0.46, band * 0.95));
    function R(v) { return v > 0 ? Math.max(2.5, Math.sqrt(v / m.maxCount) * maxR) : 0; }

    var s = [];
    s.push('<svg class="filmtv-cooccur-svg-el" width="' + W + '" height="' + H +
      '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
      esc(ariaSummary(m)) + '">');

    // row baselines (one per keyword) — faint, like the reference chart
    for (var ki = 0; ki < nk; ki++) {
      var by = round(rowMid(ki) + rowH / 2);
      s.push('<line class="filmtv-cooccur-baseline" x1="' + GEOM.left + '" y1="' + by +
        '" x2="' + round(W - GEOM.right) + '" y2="' + by + '"/>');
    }

    // bubbles (pointer-events:none so the hit cells below receive the cursor)
    for (ki = 0; ki < nk; ki++) {
      var row = series[ki], cy = round(rowMid(ki));
      for (var yi = 0; yi < ny; yi++) {
        var v = row.counts[yi];
        if (v <= 0) continue;
        s.push('<circle class="filmtv-cooccur-bubble" cx="' + round(X(yi)) + '" cy="' + cy +
          '" r="' + R(v).toFixed(1) + '" fill="' + row.color + '"/>');
      }
    }

    // year axis labels at decade/5-year marks (thinned to fit the width)
    var step = labelStep(years, plotW);
    for (yi = 0; yi < ny; yi++) {
      if (years[yi] % step !== 0) continue;
      s.push('<text class="filmtv-cooccur-xlabel" x="' + round(X(yi)) + '" y="' + (H - 9) +
        '" text-anchor="middle">' + years[yi] + '</text>');
    }

    // transparent hit cell per (year × keyword) — the interaction surface
    for (ki = 0; ki < nk; ki++) {
      var ry = round(GEOM.top + ki * rowH);
      for (yi = 0; yi < ny; yi++) {
        s.push('<rect class="filmtv-cooccur-hit" data-ki="' + ki + '" data-yi="' + yi +
          '" x="' + round(GEOM.left + yi * band) + '" y="' + ry +
          '" width="' + Math.ceil(band) + '" height="' + Math.ceil(rowH) + '"/>');
      }
    }

    s.push("</svg>");
    st.svgHost.innerHTML = s.join("");
    st.geom = { X: X, rowMid: rowMid, band: band, rowH: rowH };
  }

  /* ---------- hover: tooltip keyed to the GRID CELL ---------- */
  function bindHover(root, st) {
    var canvas = st.canvas;
    if (HOVER) {
      canvas.addEventListener("mousemove", function (e) {
        var hit = closest(e.target, ".filmtv-cooccur-hit");
        if (!hit || !st.geom) return hideTip(st);
        showTip(root, st, +hit.getAttribute("data-ki"), +hit.getAttribute("data-yi"));
      });
      canvas.addEventListener("mouseleave", function () { hideTip(st); });
    } else {
      // touch: tap a cell to reveal its tooltip; tap elsewhere to dismiss
      canvas.addEventListener("click", function (e) {
        var hit = closest(e.target, ".filmtv-cooccur-hit");
        if (!hit || !st.geom) return;
        showTip(root, st, +hit.getAttribute("data-ki"), +hit.getAttribute("data-yi"));
      });
      document.addEventListener("click", function (e) {
        if (!root.contains(e.target)) hideTip(st);
      });
    }
  }

  function showTip(root, st, ki, yi) {
    var m = st.model, row = m.series[ki];
    if (!row) return hideTip(st);
    var v = row.counts[yi] || 0, year = m.years[yi];

    st.tooltip.innerHTML =
      '<div class="filmtv-cooccur-tip-head">' +
        '<span class="filmtv-cooccur-tip-kw">' + esc(row.label) + '</span>' +
        '<span class="filmtv-cooccur-tip-year">' + year + ' 年</span>' +
      '</div>' +
      '<div class="filmtv-cooccur-tip-count">' + fmt(v) + UNIT + '</div>';
    st.tooltip.classList.add("is-on");
    st.tooltip.setAttribute("aria-hidden", "false");

    // centre over the cell, above it, flipping below near the top edge
    var W = st.canvas.clientWidth;
    var cx = st.geom.X(yi), cy = st.geom.rowMid(ki);
    var tw = st.tooltip.offsetWidth, th = st.tooltip.offsetHeight;
    st.tooltip.style.left = Math.max(tw / 2 + 2, Math.min(cx, W - tw / 2 - 2)) + "px";
    var below = (cy - 12 - th) < 4;
    st.tooltip.classList.toggle("is-below", below);
    st.tooltip.style.top = (below ? cy + 12 : cy - 12) + "px";
  }

  function hideTip(st) {
    st.tooltip.classList.remove("is-on", "is-below");
    st.tooltip.setAttribute("aria-hidden", "true");
  }

  /* ---------- legend (= y-axis labels): click adds the keyword ---------- */
  function bindLegend(root, st) {
    st.legend.addEventListener("click", function (e) {
      var btn = closest(e.target, "[data-key]");
      if (!btn) return;
      var key = btn.getAttribute("data-key");
      var s = findSeries(st, key);
      var label = s ? s.label : key;

      if (st.selected[key]) {                       // already in the search -> remove
        delete st.selected[key];
        setSelected(btn, false);
        emit(root, "filmtv:removeKeyword", { key: key, label: label });
        return;
      }
      if (countSelected(st) >= MAX_KEYWORDS) {       // UI guard; backend also enforces
        showNote(st, "最多可選 " + MAX_KEYWORDS + " 個關鍵字");
        return;
      }
      st.selected[key] = true;                       // add to the search
      setSelected(btn, true);
      emit(root, "filmtv:addKeyword", { key: key, label: label, total: s ? s.total : null });
    });
  }

  function renderLegend(root, st) {
    var html = st.model.series.map(function (s) {
      var on = !!st.selected[s.key];
      return '<button type="button" class="filmtv-cooccur-legend-item' + (on ? " is-selected" : "") +
        '" role="listitem" data-key="' + esc(s.key) + '" aria-pressed="' + on +
        '" aria-label="' + esc((on ? "從搜尋移除：" : "加入搜尋：") + s.label + "（共" + fmt(s.total) + "篇）") + '">' +
        '<span class="filmtv-cooccur-legend-label">' + esc(s.label) + '</span>' +
        '<span class="filmtv-cooccur-legend-count">（共' + fmt(s.total) + '篇）</span>' +
        '<span class="filmtv-cooccur-legend-dot" style="background:' + s.color + '"></span>' +
        '</button>';
    }).join("");
    st.legend.innerHTML = html;
  }

  function setSelected(btn, on) {
    btn.classList.toggle("is-selected", on);
    btn.setAttribute("aria-pressed", String(on));
    var s = btn.getAttribute("data-key");
    var label = btn.querySelector(".filmtv-cooccur-legend-label");
    var count = btn.querySelector(".filmtv-cooccur-legend-count");
    btn.setAttribute("aria-label",
      (on ? "從搜尋移除：" : "加入搜尋：") + (label ? label.textContent : s) + (count ? count.textContent : ""));
  }

  function showNote(st, msg) {
    st.note.textContent = msg;
    st.note.classList.add("is-on");
    clearTimeout(st.noteTimer);
    st.noteTimer = setTimeout(function () { st.note.classList.remove("is-on"); }, 1800);
  }

  function countSelected(st) { return Object.keys(st.selected).length; }
  function findSeries(st, key) {
    var ss = st.model ? st.model.series : [];
    for (var i = 0; i < ss.length; i++) if (ss[i].key === key) return ss[i];
    return null;
  }

  // dispatch a keyword selection (bubbles to document for the backend)
  function emit(root, name, detail) {
    var ev;
    try { ev = new CustomEvent(name, { detail: detail, bubbles: true }); }
    catch (err) {
      ev = document.createEvent("CustomEvent");
      ev.initCustomEvent(name, true, false, detail);
    }
    root.dispatchEvent(ev);
  }

  /* ---------- helpers ---------- */
  // pick 5 / 10 / 20-year label spacing so x labels don't collide
  function labelStep(years, plotW) {
    if (!years.length) return 10;
    var span = years[years.length - 1] - years[0] || 1;
    var maxLabels = Math.max(2, Math.floor(plotW / 52));
    var steps = [5, 10, 20, 25, 50];
    for (var i = 0; i < steps.length; i++) if (span / steps[i] <= maxLabels) return steps[i];
    return 50;
  }

  function getPalette(root) {
    var cs = window.getComputedStyle(root);
    var out = [];
    for (var i = 1; i <= TOP_N; i++) {
      var v = cs.getPropertyValue("--filmtv-cooccur-color-" + i).trim();
      if (v) out.push(v);
    }
    return out.length ? out : PALETTE.slice();
  }

  function ariaSummary(m) {
    if (!m.years.length) return "Keyword co-occurrence bubble chart, no data.";
    return "Bubble chart: the " + m.series.length + " keywords most often mentioned with “" +
      m.keyword + "”, by year " + m.years[0] + " to " + m.years[m.years.length - 1] +
      ". Bubble size is the article count.";
  }

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
  function el(tag, cls) { var e = document.createElement(tag); e.className = cls; return e; }
  function closest(t, sel) { return t && t.closest ? t.closest(sel) : null; }
  function round(n) { return Math.round(n * 10) / 10; }
  function fmt(n) { var x = Number(n); return isFinite(x) ? x.toLocaleString("en-US") : String(n); }
  function esc(str) {
    return String(str).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ---------- public API ---------- */
  window.filmtvCooccur = {
    render: render,
    buildModel: buildModel,
    redraw: function (root) {
      if (root) return draw(root);
      var all = document.querySelectorAll("[data-cooccur]");
      for (var i = 0; i < all.length; i++) draw(all[i]);
    }
  };
})();
