/* ============================================================
 * chart.js — Film/TV publication search-results STACKED BAR CHART
 *
 * Renders entry-count-by-year as a stacked bar chart, one colour per
 * publication. A publication is the first 3 characters of an entry id
 * (e.g. "FMP-120504" -> "FMP"); the legend label is taken from the
 * matching journal name. Dependency-free, vanilla SVG.
 *
 *   • x axis  : publication year   • y axis : entry count
 *   • stacks  : publications (colour-coded), legend toggles each on/off
 *   • y axis  : rescales to the max stacked total of what's displayed
 *   • hover   : per-year tooltip with the total + per-publication breakdown
 *
 * Integration API (global), mirrors window.filmtvResults:
 *   window.filmtvChart.render(rootEl, { items })           // raw entries; chart aggregates
 *   window.filmtvChart.render(rootEl, { years, series })   // pre-aggregated (large result sets)
 *       series: [{ key, label, color?, counts:[ per-year ] }]
 *   window.filmtvChart.setView is not needed; redraw happens on resize + legend toggle.
 *
 * A thin self-fetch of DATA_URL runs only as the MOCK driver; the backend
 * removes it and calls render() directly with the live result set.
 *
 * data-* contract:
 *   [data-chart]            chart root (one per instance)
 *   [data-src]             optional JSON url override for the mock driver
 *   [data-height]          optional plot height in px (default 360)
 * ============================================================ */
(function () {
  "use strict";

  var SELF =
    (document.currentScript && document.currentScript.src) ||
    (function () {
      var s = document.querySelector('script[src*="chart.js"]');
      return s ? s.src : window.location.href;
    })();

  /* >>> MOCK DATA URL <<< backend replaces this (or removes the self-fetch). */
  var DATA_URL = new URL("./sample-data/chart-sample.json", SELF).href;

  /* publication key: first 3 chars of an entry id. One-line swap point for
     real data (e.g. a different slice, or item.collection). */
  function publicationKey(item) {
    return String(item && item.id != null ? item.id : "").slice(0, 3);
  }

  /* Fallback categorical palette (CSS vars --filmtv-chart-color-N override). */
  var PALETTE = [
    "#8a1c2b", "#c2683a", "#d6a531", "#4f7a63",
    "#3f6184", "#7a4f86", "#9c6b3f", "#5c6b34"
  ];

  var GEOM = { top: 14, right: 14, bottom: 30, left: 46 };
  var UNIT = " 筆"; // entry-count unit, matches the archive UI

  /* ---------- bootstrap ---------- */
  ready(function () {
    var roots = document.querySelectorAll("[data-chart]");
    for (var i = 0; i < roots.length; i++) initChart(roots[i]);
  });

  function initChart(root) {
    if (root.__filmtv) return;
    var st = {
      height: parseInt(root.getAttribute("data-height"), 10) || 360,
      hidden: {},        // series keys hidden via legend toggle
      model: null,
      raf: 0
    };
    root.__filmtv = st;
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

    mockFetch(root, st);
  }

  // Build the inner DOM once: SVG canvas + tooltip + legend. The host
  // [data-chart] only needs to be an empty element in the page.
  function buildShell(root, st) {
    root.classList.add("filmtv-chart");
    var canvas = el("div", "filmtv-chart-canvas");
    var svgHost = el("div", "filmtv-chart-svg");
    var tooltip = el("div", "filmtv-chart-tooltip");
    tooltip.setAttribute("aria-hidden", "true");
    canvas.appendChild(svgHost);
    canvas.appendChild(tooltip);
    var legend = el("div", "filmtv-chart-legend");
    legend.setAttribute("role", "list");
    root.appendChild(canvas);
    root.appendChild(legend);
    st.canvas = canvas;
    st.svgHost = svgHost;
    st.tooltip = tooltip;
    st.legend = legend;
  }

  function mockFetch(root, st) {
    var url = root.getAttribute("data-src") || DATA_URL;
    fetch(url, { credentials: "omit" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) { render(root, data || {}); })
      .catch(function (err) { console.error("[chart] mock load failed (" + url + "):", err); });
  }

  /* ---------- public render (backend calls this) ---------- */
  function render(root, data) {
    if (!root) {
      var all = document.querySelectorAll("[data-chart]");
      for (var n = 0; n < all.length; n++) render(all[n], data);
      return;
    }
    var st = root.__filmtv || (initChart(root), root.__filmtv);
    st.model = buildModel(root, data || {});
    st.hidden = {};
    renderLegend(root, st);
    draw(root);
  }

  /* ---------- aggregation: data -> { years[], series[] } ---------- */
  function buildModel(root, data) {
    var palette = getPalette(root);

    // pre-aggregated input passes straight through (large result sets).
    if (Array.isArray(data.years) && Array.isArray(data.series)) {
      var ys = data.years.map(Number);
      var series = data.series.map(function (s, i) {
        return {
          key: s.key,
          label: s.label || s.key,
          color: s.color || palette[i % palette.length],
          counts: ys.map(function (_, k) { return Number((s.counts || [])[k]) || 0; }),
          total: (s.counts || []).reduce(function (a, b) { return a + (Number(b) || 0); }, 0)
        };
      });
      return finalizeModel(ys, series, palette);
    }

    // raw entries: aggregate into per-year, per-publication counts.
    var items = Array.isArray(data.items) ? data.items : [];
    var minY = Infinity, maxY = -Infinity;
    var groups = {}; // key -> { key, label, counts:{year->n}, total, labels:{} }

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var year = parseInt(it.year != null ? it.year : (it.datePublished || "").slice(0, 4), 10);
      if (!isFinite(year)) continue;
      if (year < minY) minY = year;
      if (year > maxY) maxY = year;
      var key = publicationKey(it) || "—";
      var g = groups[key] || (groups[key] = { key: key, counts: {}, total: 0, labels: {} });
      g.counts[year] = (g.counts[year] || 0) + 1;
      g.total++;
      // remember the most common journal name as the legend label
      var jr = it.journal || "";
      if (jr) g.labels[jr] = (g.labels[jr] || 0) + 1;
    }
    if (!isFinite(minY)) { minY = 0; maxY = 0; }

    var years = [];
    for (var y = minY; y <= maxY; y++) years.push(y);

    var keys = Object.keys(groups);
    var built = keys.map(function (k) {
      var g = groups[k];
      return {
        key: g.key,
        label: topLabel(g.labels) || g.key,
        counts: years.map(function (yy) { return g.counts[yy] || 0; }),
        total: g.total
      };
    });
    // largest publication at the bottom of the stack (stable order)
    built.sort(function (a, b) { return b.total - a.total || (a.key < b.key ? -1 : 1); });
    built.forEach(function (s, i) { s.color = palette[i % palette.length]; });

    return finalizeModel(years, built, palette);
  }

  function finalizeModel(years, series, palette) {
    series.forEach(function (s, i) { if (!s.color) s.color = palette[i % palette.length]; });
    return { years: years, series: series };
  }

  /* ---------- draw (SVG) ---------- */
  function draw(root) {
    var st = root.__filmtv;
    if (!st || !st.model) return;
    var W = st.canvas.clientWidth || 0;
    var H = st.height;
    if (W < 2) return;

    var model = st.model;
    var years = model.years;
    var n = years.length;
    var series = model.series.filter(function (s) { return !st.hidden[s.key]; });

    // per-year visible stacked totals -> dynamic y axis
    var totals = years.map(function (_, i) {
      return series.reduce(function (a, s) { return a + (s.counts[i] || 0); }, 0);
    });
    var axis = niceAxis(Math.max.apply(null, totals.concat(1)), 5);
    var yMax = axis.max;

    var plotW = W - GEOM.left - GEOM.right;
    var plotH = H - GEOM.top - GEOM.bottom;
    var band = n > 0 ? plotW / n : plotW;
    var barW = Math.max(2, Math.min(band * 0.74, 26));

    function X(i) { return GEOM.left + i * band + band / 2; }
    function Y(v) { return GEOM.top + plotH - (v / yMax) * plotH; }

    var s = [];
    s.push('<svg class="filmtv-chart-svg-el" width="' + W + '" height="' + H +
      '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
      esc(ariaSummary(years, series, totals)) + '">');

    // y gridlines + labels
    for (var t = 0; t <= yMax + 0.0001; t += axis.step) {
      var gy = Y(t);
      s.push('<line class="filmtv-chart-grid" x1="' + GEOM.left + '" y1="' + gy +
        '" x2="' + (W - GEOM.right) + '" y2="' + gy + '"/>');
      s.push('<text class="filmtv-chart-ylabel" x="' + (GEOM.left - 8) + '" y="' + (gy + 4) +
        '" text-anchor="end">' + fmt(t) + '</text>');
    }

    // stacked bars
    for (var i = 0; i < n; i++) {
      var cum = 0;
      for (var k = 0; k < series.length; k++) {
        var v = series[k].counts[i] || 0;
        if (v <= 0) continue;
        var y1 = Y(cum + v), y0 = Y(cum);
        s.push('<rect class="filmtv-chart-bar" x="' + (X(i) - barW / 2) + '" y="' + y1 +
          '" width="' + barW + '" height="' + Math.max(0, y0 - y1) +
          '" fill="' + series[k].color + '"/>');
        cum += v;
      }
    }

    // x axis labels at decade marks (thinned to fit the width)
    var step = labelStep(years, plotW);
    for (var xi = 0; xi < n; xi++) {
      if (years[xi] % step !== 0) continue;
      s.push('<text class="filmtv-chart-xlabel" x="' + X(xi) + '" y="' + (H - 10) +
        '" text-anchor="middle">' + years[xi] + '</text>');
    }

    // transparent full-height hover targets, one per year band
    for (var hi = 0; hi < n; hi++) {
      s.push('<rect class="filmtv-chart-hit" data-yi="' + hi + '" x="' + (GEOM.left + hi * band) +
        '" y="' + GEOM.top + '" width="' + band + '" height="' + plotH + '"/>');
    }

    s.push("</svg>");
    st.svgHost.innerHTML = s.join("");

    // stash geometry for the hover handler
    st.geom = { X: X, Y: Y, band: band, totals: totals, series: series, years: years, plotH: plotH };
  }

  /* ---------- hover tooltip ---------- */
  function bindHover(root, st) {
    st.canvas.addEventListener("mousemove", function (e) {
      var hit = e.target.closest ? e.target.closest(".filmtv-chart-hit") : null;
      if (!hit || !st.geom) return hideTip(st);
      var i = parseInt(hit.getAttribute("data-yi"), 10);
      showTip(root, st, i);
    });
    st.canvas.addEventListener("mouseleave", function () { hideTip(st); });
  }

  function showTip(root, st, i) {
    var g = st.geom;
    var rows = [];
    for (var k = 0; k < g.series.length; k++) {
      var v = g.series[k].counts[i] || 0;
      if (v <= 0) continue;
      rows.push('<li class="filmtv-chart-tip-row"><span class="filmtv-chart-tip-swatch" style="background:' +
        g.series[k].color + '"></span><span class="filmtv-chart-tip-name">' +
        esc(g.series[k].label) + '</span><span class="filmtv-chart-tip-num">' + fmt(v) + '</span></li>');
    }
    st.tooltip.innerHTML =
      '<div class="filmtv-chart-tip-title">西元 ' + g.years[i] + ' 年</div>' +
      '<div class="filmtv-chart-tip-total">總數 ' + fmt(g.totals[i]) + UNIT + '</div>' +
      (rows.length ? '<ul class="filmtv-chart-tip-list">' + rows.join("") + "</ul>" : "");

    // anchor above the bar, centred on the band, clamped to the canvas
    var W = st.canvas.clientWidth;
    var cx = g.X(i);
    var cy = g.Y(g.totals[i]);
    st.tooltip.classList.add("is-on");
    st.tooltip.setAttribute("aria-hidden", "false");
    var tw = st.tooltip.offsetWidth;
    var left = Math.max(tw / 2 + 2, Math.min(cx, W - tw / 2 - 2));
    st.tooltip.style.left = left + "px";
    st.tooltip.style.top = Math.max(8, cy - 10) + "px";
  }

  function hideTip(st) {
    st.tooltip.classList.remove("is-on");
    st.tooltip.setAttribute("aria-hidden", "true");
  }

  /* ---------- legend (click toggles a publication on/off) ---------- */
  function bindLegend(root, st) {
    st.legend.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-key]") : null;
      if (!btn) return;
      var key = btn.getAttribute("data-key");
      if (st.hidden[key]) delete st.hidden[key]; else st.hidden[key] = true;
      btn.classList.toggle("is-off", !!st.hidden[key]);
      btn.setAttribute("aria-pressed", st.hidden[key] ? "false" : "true");
      draw(root); // recomputes the y axis from what's still visible
    });
  }

  function renderLegend(root, st) {
    var html = st.model.series.map(function (s) {
      return '<button type="button" class="filmtv-chart-legend-item" role="listitem" data-key="' +
        esc(s.key) + '" aria-pressed="true">' +
        '<span class="filmtv-chart-legend-swatch" style="background:' + s.color + '"></span>' +
        '<span class="filmtv-chart-legend-label">' + esc(s.label) + '</span>' +
        '<span class="filmtv-chart-legend-count">' + fmt(s.total) + '</span></button>';
    }).join("");
    st.legend.innerHTML = html;
  }

  /* ---------- scales / helpers ---------- */
  // round the axis max up to a "nice" number so gridlines land on clean values
  function niceAxis(max, ticks) {
    if (!isFinite(max) || max <= 0) return { max: 1, step: 1 };
    var rough = max / ticks;
    var mag = Math.pow(10, Math.floor(Math.log10(rough)));
    var norm = rough / mag;
    var nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    var step = nice * mag;
    return { max: Math.ceil(max / step) * step, step: step };
  }

  // pick 5 / 10 / 20-year label spacing so x labels don't collide
  function labelStep(years, plotW) {
    if (!years.length) return 10;
    var span = years[years.length - 1] - years[0] || 1;
    var maxLabels = Math.max(2, Math.floor(plotW / 52));
    var steps = [5, 10, 20, 25, 50];
    for (var i = 0; i < steps.length; i++) {
      if (span / steps[i] <= maxLabels) return steps[i];
    }
    return 50;
  }

  function getPalette(root) {
    var cs = window.getComputedStyle(root);
    var out = [];
    for (var i = 1; i <= 8; i++) {
      var v = cs.getPropertyValue("--filmtv-chart-color-" + i).trim();
      if (v) out.push(v);
    }
    return out.length ? out : PALETTE.slice();
  }

  function topLabel(map) {
    var best = "", n = -1;
    for (var k in map) if (map[k] > n) { n = map[k]; best = k; }
    return best;
  }

  function ariaSummary(years, series, totals) {
    if (!years.length) return "Stacked bar chart, no data.";
    var grand = totals.reduce(function (a, b) { return a + b; }, 0);
    return "Stacked bar chart of entry count by year, " + years[0] + " to " +
      years[years.length - 1] + ", " + series.length + " publications, " +
      fmt(grand) + " entries total.";
  }

  /* ---------- tiny utils ---------- */
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
  function el(tag, cls) { var e = document.createElement(tag); e.className = cls; return e; }
  function fmt(n) {
    var num = Number(n);
    return isFinite(num) ? num.toLocaleString("en-US") : String(n);
  }
  function esc(str) {
    return String(str).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ---------- public API ---------- */
  window.filmtvChart = { render: render, buildModel: buildModel };
})();
