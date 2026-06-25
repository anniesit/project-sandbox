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
 *              buttons; clicking one ADDS the keyword to the search
 *
 * LAYOUT: each keyword is one ROW = [label button] + [bubble strip] in a 2-col
 * grid (see cooccur.css). At <=767px the grid collapses to one column, so each
 * left-aligned label stacks on top of its own strip. A shared year axis sits
 * at the bottom.
 *
 * HOVER IS GRID-CELL BASED, NOT BUBBLE BASED. Each (year × keyword) cell is a
 * transparent hit target; bubbles have pointer-events:none, so overlapping
 * bubbles never create dead zones — the cursor always resolves to one cell.
 *
 * BUBBLE SIZE is absolute: r = sqrt(count) * MULT, with a floor at the legend
 * dot's radius (so count=1 reads as a real dot) and a cap at ~half the strip
 * height (so big counts can't overflow into neighbouring rows). It does NOT
 * depend on viewport width, so bubbles keep their size as the modal narrows.
 *
 * Integration API (global), mirrors window.filmtvChart:
 *   window.filmtvCooccur.render(rootEl, data)
 *   window.filmtvCooccur.redraw(rootEl?)        // re-measure + redraw (e.g. on modal open)
 *
 * data shape (pre-aggregated — the backend computes the co-occurrence):
 *   { keyword:"楚原", years:[1955,…,1997],
 *     series:[ { key, label, total, counts:[…per year…] }, … ] }   // any order
 * cooccur.js sorts series by total desc, keeps the top 10, colours them by row.
 *
 * CLICK → SEARCH (ownership split, see chart.js): the chart only makes the
 * legend clickable and FIRES one bubbling event per click; it keeps NO search
 * state of its own. The backend listens, adds the term, closes the modal,
 * reflects it in the search input and re-runs the search — and owns the max-5
 * rule (show the limit message only when the search already holds 5 keywords):
 *   • click a keyword -> filmtv:addKeyword { detail: { key, label, total } }
 *   document.addEventListener("filmtv:addKeyword", e => addTermAndSearch(e.detail.key));
 *
 * A thin self-fetch of DATA_URL runs only as the MOCK driver; the backend
 * removes it and calls render() with the live result set.
 *
 * data-* contract:
 *   [data-cooccur]   chart root (one per instance)
 *   [data-src]       optional JSON url override for the mock driver
 *   [data-height]    optional total plot height in px (default 480)
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

  var TOP_N = 10;       // keyword rows shown
  var UNIT = " 篇";     // article-count unit, matches the archive UI
  var AXIS_H = 26;      // year-axis height (px), kept in sync with cooccur.css

  // ---- bubble sizing (absolute; viewport-width independent) ----
  var MULT = 3;         // r = sqrt(count) * MULT  (your mock's "Multiplier 3, Floor 0")
  var MIN_R = 4;        // smallest bubble radius (px) = legend colour-dot radius (dot is 8px ⌀)
  var PAD_X = 4;        // horizontal inset inside a strip so edge bubbles aren't clipped

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
      raf: 0
    };
    root.__cooccur = st;
    buildShell(root, st);
    bindHover(root, st);
    bindLegend(root, st);

    if (typeof ResizeObserver === "function") {
      new ResizeObserver(function () {
        if (st.raf) return;
        st.raf = requestAnimationFrame(function () { st.raf = 0; draw(root); });
      }).observe(st.rows);
    } else {
      window.addEventListener("resize", function () { draw(root); });
    }

    // inside a <dialog> (the design-system modal) the strips are 0-size until it
    // opens — redraw the moment it does.
    var dlg = root.closest && root.closest("dialog");
    if (dlg && typeof MutationObserver === "function") {
      new MutationObserver(function () {
        if (dlg.open) requestAnimationFrame(function () { draw(root); });
      }).observe(dlg, { attributes: true, attributeFilter: ["open"] });
    }

    mockFetch(root, st);
    return st;
  }

  // Build the persistent shell once: the rows grid + a tooltip.
  function buildShell(root, st) {
    root.classList.add("filmtv-cooccur");
    // strip height derives from data-height: (total - axis) / rows
    var rowH = Math.max(20, Math.round((st.height - AXIS_H) / TOP_N));
    root.style.setProperty("--filmtv-cooccur-row-h", rowH + "px");

    var rows = el("div", "filmtv-cooccur-rows");
    var tooltip = el("div", "filmtv-cooccur-tooltip");
    tooltip.setAttribute("aria-hidden", "true");
    root.appendChild(rows);
    root.appendChild(tooltip);
    st.root = root; st.rows = rows; st.tooltip = tooltip;
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
    hideTip(st);
    renderRows(root, st);
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

    return { keyword: data.keyword || "", years: years, series: series };
  }

  /* ---------- build the per-row DOM (label + empty strip), once per render ---------- */
  function renderRows(root, st) {
    var m = st.model, html = "";
    m.series.forEach(function (s, ki) {
      html +=
        '<button type="button" class="filmtv-cooccur-legend-item" data-key="' + esc(s.key) +
          '" aria-label="' + esc("加入搜尋：" + s.label + "（共" + fmt(s.total) + "篇）") + '">' +
          '<span class="filmtv-cooccur-legend-label">' + esc(s.label) + '</span>' +
          '<span class="filmtv-cooccur-legend-count">（共' + fmt(s.total) + '篇）</span>' +
          '<span class="filmtv-cooccur-legend-dot" style="background:' + s.color + '"></span>' +
        '</button>' +
        '<div class="filmtv-cooccur-strip" data-ki="' + ki + '"></div>';
    });
    html += '<div class="filmtv-cooccur-axis-spacer"></div><div class="filmtv-cooccur-axis-plot"></div>';
    st.rows.innerHTML = html;
  }

  /* ---------- draw: fill each strip's SVG from its measured size ---------- */
  function draw(root) {
    var st = root.__cooccur;
    if (!st || !st.model) return;
    var m = st.model, years = m.years, ny = years.length;
    if (!ny || !m.series.length) return;

    var strips = st.rows.querySelectorAll(".filmtv-cooccur-strip");
    if (!strips.length) return;
    var W = strips[0].clientWidth || 0;
    if (W < 2) return;   // hidden (modal not open yet) — redrawn on open

    var plotW = Math.max(1, W - PAD_X * 2);
    var band = plotW / ny;
    function X(yi) { return PAD_X + (yi + 0.5) * band; }

    for (var ki = 0; ki < strips.length; ki++) {
      var strip = strips[ki];
      var H = strip.clientHeight || 0;
      var cy = H / 2;
      var capR = Math.max(MIN_R, H * 0.46);          // never taller than the row
      var row = m.series[ki];
      var s = ['<svg class="filmtv-cooccur-svg-el" width="' + W + '" height="' + H +
        '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
        esc(row.label + "：" + ariaRow(m, ki)) + '">'];

      // row baseline
      s.push('<line class="filmtv-cooccur-baseline" x1="0" y1="' + round(H - 0.5) +
        '" x2="' + W + '" y2="' + round(H - 0.5) + '"/>');

      // bubbles
      for (var yi = 0; yi < ny; yi++) {
        var v = row.counts[yi];
        if (v <= 0) continue;
        var r = Math.min(capR, Math.max(MIN_R, Math.sqrt(v) * MULT));
        s.push('<circle class="filmtv-cooccur-bubble" cx="' + round(X(yi)) + '" cy="' + round(cy) +
          '" r="' + r.toFixed(1) + '" fill="' + row.color + '"/>');
      }

      // transparent hit cell per year
      for (yi = 0; yi < ny; yi++) {
        s.push('<rect class="filmtv-cooccur-hit" data-ki="' + ki + '" data-yi="' + yi +
          '" x="' + round(PAD_X + yi * band) + '" y="0" width="' + Math.ceil(band) +
          '" height="' + H + '"/>');
      }
      s.push("</svg>");
      strip.innerHTML = s.join("");
    }

    // shared year axis
    var axis = st.rows.querySelector(".filmtv-cooccur-axis-plot");
    if (axis) {
      var aw = axis.clientWidth || W, ah = axis.clientHeight || AXIS_H;
      var apW = Math.max(1, aw - PAD_X * 2), aband = apW / ny;
      var step = labelStep(years, apW);
      var a = ['<svg class="filmtv-cooccur-svg-el" width="' + aw + '" height="' + ah +
        '" viewBox="0 0 ' + aw + ' ' + ah + '">'];
      for (var xi = 0; xi < ny; xi++) {
        if (years[xi] % step !== 0) continue;
        a.push('<text class="filmtv-cooccur-xlabel" x="' + round(PAD_X + (xi + 0.5) * aband) +
          '" y="15" text-anchor="middle">' + years[xi] + '</text>');
      }
      a.push("</svg>");
      axis.innerHTML = a.join("");
    }
  }

  /* ---------- hover: tooltip keyed to the GRID CELL ---------- */
  function bindHover(root, st) {
    if (HOVER) {
      st.rows.addEventListener("mousemove", function (e) {
        var hit = closest(e.target, ".filmtv-cooccur-hit");
        if (!hit) return hideTip(st);
        showTip(root, st, hit);
      });
      st.rows.addEventListener("mouseleave", function () { hideTip(st); });
    } else {
      st.rows.addEventListener("click", function (e) {
        var hit = closest(e.target, ".filmtv-cooccur-hit");
        if (hit) showTip(root, st, hit);
      });
      document.addEventListener("click", function (e) {
        if (!root.contains(e.target)) hideTip(st);
      });
    }
  }

  function showTip(root, st, hit) {
    var ki = +hit.getAttribute("data-ki"), yi = +hit.getAttribute("data-yi");
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

    // place above the hovered cell's centre, in root-relative coords
    var hr = hit.getBoundingClientRect(), rr = root.getBoundingClientRect();
    var cx = hr.left - rr.left + hr.width / 2;
    var cyMid = hr.top - rr.top + hr.height / 2;
    var tw = st.tooltip.offsetWidth, th = st.tooltip.offsetHeight;
    st.tooltip.style.left = Math.max(tw / 2 + 2, Math.min(cx, rr.width - tw / 2 - 2)) + "px";
    var below = (cyMid - 12 - th) < 0;
    st.tooltip.classList.toggle("is-below", below);
    st.tooltip.style.top = (below ? cyMid + 12 : cyMid - 12) + "px";
  }

  function hideTip(st) {
    st.tooltip.classList.remove("is-on", "is-below");
    st.tooltip.setAttribute("aria-hidden", "true");
  }

  /* ---------- legend click: fire ONE add-keyword event, nothing else ----------
     The backend owns everything after this: it adds the term, closes the modal,
     reflects the keyword in the search input, re-runs the search, and enforces
     the max of 5 keywords (showing the limit message only when 5 already exist). */
  function bindLegend(root, st) {
    st.rows.addEventListener("click", function (e) {
      var btn = closest(e.target, "[data-key]");
      if (!btn) return;
      var s = findSeries(st, btn.getAttribute("data-key"));
      if (!s) return;
      emit(root, "filmtv:addKeyword", { key: s.key, label: s.label, total: s.total });
    });
  }

  function findSeries(st, key) {
    var ss = st.model ? st.model.series : [];
    for (var i = 0; i < ss.length; i++) if (ss[i].key === key) return ss[i];
    return null;
  }

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

  function ariaRow(m, ki) {
    var row = m.series[ki];
    return "共 " + fmt(row.total) + " 篇，" + m.years[0] + " 至 " + m.years[m.years.length - 1] + " 年。";
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
