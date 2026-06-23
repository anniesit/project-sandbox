/* ============================================================
 * chart.js — Film/TV publication search-results STACKED BAR CHART
 *
 * Renders entry-count-by-year as a stacked bar chart, one colour per
 * publication. A publication is the first 3 characters of an entry id
 * (e.g. "FMP-120504" -> "FMP"); the legend label is taken from the
 * matching journal name. Dependency-free, vanilla SVG.
 *
 *   • x axis  : publication year   • y axis : entry count
 *   • stacks  : publications (colour-coded), labelled by the legend
 *   • y axis  : rescales to the max stacked total of what's displayed
 *   • hover   : per-year tooltip with the total + per-publication breakdown
 *
 * Integration API (global), mirrors window.filmtvResults:
 *   window.filmtvChart.render(rootEl, { items })           // raw entries; chart aggregates
 *   window.filmtvChart.render(rootEl, { years, series })   // pre-aggregated (large result sets)
 *       series: [{ key, label, color?, counts:[ per-year ] }]
 *
 * Ownership split (same as results.js): this file owns the VISUAL + the click
 * affordance; the backend owns the SEARCH STATE. On a user selection the chart
 * FIRES a bubbling event and does nothing else — the backend listens, mutates
 * the query, re-fetches, and calls render() again:
 *   • click a bar  (desktop) / tap a bar then "查看此年結果 →" (touch)
 *       -> filmtv:filter  { detail: { year, publication:null } }
 *   • click a legend item
 *       -> filmtv:filter  { detail: { year:null, publication, label, prefixes } }
 *   document.addEventListener("filmtv:filter", e =>
 *     applySearchFilters(e.detail).then(data => filmtvChart.render(e.target, data)));
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

  /* Publication taxonomy — the stack groups. A publication is keyed by the
     first 3 chars of an entry id, but several prefixes can roll up into ONE
     series (the City Entertainment magazine family -> 電影雙周刊). This array is
     the single source of truth for grouping, legend label, stack order and
     colour; edit it when the real id scheme is finalised. Unlisted prefixes
     fall back to the prefix itself, labelled from the item's journal field. */
  var PUBLICATIONS = [
    { key: "FMP", label: "電影小冊子", prefixes: ["FMP"] },
    { key: "TVW", label: "香港電視", prefixes: ["TVW"] },
    { key: "CEM", label: "電影雙周刊", prefixes: ["CEM", "CEI", "CEY", "CED", "CEF", "CEV", "CEH", "CEP", "CEO"] },
    { key: "CEB", label: "電影雙周刊出版書籍", prefixes: ["CEB"] }
  ];
  var PREFIX_MAP = {}, GROUP_ORDER = {}, GROUP_LABEL = {}, GROUP_PREFIXES = {};
  PUBLICATIONS.forEach(function (p, i) {
    GROUP_ORDER[p.key] = i;
    GROUP_LABEL[p.key] = p.label;
    GROUP_PREFIXES[p.key] = p.prefixes;
    p.prefixes.forEach(function (pre) { PREFIX_MAP[pre] = p.key; });
  });

  // true on devices with a real hover+fine pointer (desktop): bar click commits
  // directly. Touch devices tap a bar to pin the tooltip, then tap its button.
  var HOVER = !!(window.matchMedia &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches);

  // entry -> stack group key: first 3 id chars, mapped through the taxonomy.
  function publicationKey(item) {
    var prefix = String(item && item.id != null ? item.id : "").slice(0, 3);
    return PREFIX_MAP[prefix] || prefix;
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
      model: null,
      tipIndex: null,    // year index the tooltip currently describes
      raf: 0
    };
    root.__filmtv = st;
    buildShell(root, st);
    bindInteractions(root, st);
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
    hideTip(st);
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
          prefixes: s.prefixes || GROUP_PREFIXES[s.key] || [s.key],
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

    var built = Object.keys(groups).map(function (k) {
      var g = groups[k];
      return {
        key: g.key,
        label: GROUP_LABEL[g.key] || topLabel(g.labels) || g.key,
        prefixes: GROUP_PREFIXES[g.key] || [g.key],
        counts: years.map(function (yy) { return g.counts[yy] || 0; }),
        total: g.total
      };
    });
    // taxonomy order first (stable stack + colour), then any unlisted by size
    built.sort(function (a, b) {
      var ia = a.key in GROUP_ORDER ? GROUP_ORDER[a.key] : 1e9;
      var ib = b.key in GROUP_ORDER ? GROUP_ORDER[b.key] : 1e9;
      return ia - ib || b.total - a.total || (a.key < b.key ? -1 : 1);
    });
    // fixed colour per publication (by taxonomy index) so colours don't shift
    // when the result set filters down to a subset of publications
    var spare = PUBLICATIONS.length;
    built.forEach(function (s) {
      s.color = s.key in GROUP_ORDER
        ? palette[GROUP_ORDER[s.key] % palette.length]
        : palette[(spare++) % palette.length];
    });

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
    var series = model.series;

    // per-year visible stacked totals -> dynamic y axis
    var totals = years.map(function (_, i) {
      return series.reduce(function (a, s) { return a + (s.counts[i] || 0); }, 0);
    });
    var axis = niceAxis(Math.max.apply(null, totals.concat(1)));
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

  /* ---------- tooltip + selection (a bar commits a YEAR filter) ---------- */
  function bindInteractions(root, st) {
    var canvas = st.canvas;

    // desktop: hover reveals the transient tooltip
    if (HOVER) {
      canvas.addEventListener("mousemove", function (e) {
        var hit = closest(e.target, ".filmtv-chart-hit");
        if (!hit || !st.geom) return hideTip(st);
        showTip(root, st, +hit.getAttribute("data-yi"), false);
      });
      canvas.addEventListener("mouseleave", function () { hideTip(st); });
    }

    // click doubles as a tap on touch devices
    canvas.addEventListener("click", function (e) {
      if (closest(e.target, ".filmtv-chart-commit")) {       // the tooltip button
        e.preventDefault();
        if (st.tipIndex != null) commitYear(root, st, st.tipIndex);
        return;
      }
      var hit = closest(e.target, ".filmtv-chart-hit");
      if (!hit || !st.geom) return;
      var i = +hit.getAttribute("data-yi");
      if (HOVER) commitYear(root, st, i);   // desktop: one click commits
      else showTip(root, st, i, true);      // touch: first tap pins the tooltip
    });

    // touch: a tap anywhere outside the chart dismisses a pinned tooltip
    if (!HOVER) {
      document.addEventListener("click", function (e) {
        if (!root.contains(e.target)) hideTip(st);
      });
    }
  }

  // build + position the tooltip; `pin` keeps it open and tappable (touch)
  function showTip(root, st, i, pin) {
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
      '<div class="filmtv-chart-tip-head">' +
        '<span class="filmtv-chart-tip-year">' + g.years[i] + ' 年</span>' +
        '<span class="filmtv-chart-tip-total">總數 ' + fmt(g.totals[i]) + UNIT + '</span>' +
      '</div>' +
      (rows.length ? '<ul class="filmtv-chart-tip-list">' + rows.join("") + "</ul>" : "") +
      '<button type="button" class="filmtv-chart-commit">查看此年結果 →</button>';

    st.tipIndex = i;
    st.tooltip.classList.add("is-on");
    st.tooltip.classList.toggle("is-pinned", !!pin);
    st.tooltip.setAttribute("aria-hidden", "false");

    // centre on the band; sit above the bar, flipping below if there's no room
    var W = st.canvas.clientWidth;
    var cx = g.X(i), cy = g.Y(g.totals[i]);
    var tw = st.tooltip.offsetWidth, th = st.tooltip.offsetHeight;
    st.tooltip.style.left = Math.max(tw / 2 + 2, Math.min(cx, W - tw / 2 - 2)) + "px";
    var below = (cy - 10 - th) < 4;
    st.tooltip.classList.toggle("is-below", below);
    st.tooltip.style.top = (below ? cy + 12 : cy - 10) + "px";
  }

  function hideTip(st) {
    st.tooltip.classList.remove("is-on", "is-pinned", "is-below");
    st.tooltip.setAttribute("aria-hidden", "true");
    st.tipIndex = null;
  }

  // emit a year-filter selection for the backend to act on
  function commitYear(root, st, i) {
    emitFilter(root, { year: st.geom.years[i], publication: null, label: null, prefixes: null });
    hideTip(st);
  }

  /* ---------- legend (click commits a PUBLICATION filter) ---------- */
  function bindLegend(root, st) {
    st.legend.addEventListener("click", function (e) {
      var btn = closest(e.target, "[data-key]");
      if (!btn) return;
      var key = btn.getAttribute("data-key");
      var s = findSeries(st, key);
      emitFilter(root, {
        year: null,
        publication: key,
        label: s ? s.label : key,
        prefixes: s ? s.prefixes : [key]
      });
    });
  }

  function renderLegend(root, st) {
    var html = st.model.series.map(function (s) {
      return '<button type="button" class="filmtv-chart-legend-item" role="listitem" data-key="' +
        esc(s.key) + '" aria-label="' + esc("篩選：" + s.label) + '">' +
        '<span class="filmtv-chart-legend-swatch" style="background:' + s.color + '"></span>' +
        '<span class="filmtv-chart-legend-label">' + esc(s.label) + '</span>' +
        '<span class="filmtv-chart-legend-count">' + fmt(s.total) + '</span></button>';
    }).join("");
    st.legend.innerHTML = html;
  }

  function findSeries(st, key) {
    var ss = st.model ? st.model.series : [];
    for (var i = 0; i < ss.length; i++) if (ss[i].key === key) return ss[i];
    return null;
  }

  // dispatch the search-filter selection (bubbles to document for the backend)
  function emitFilter(root, detail) {
    var ev;
    try { ev = new CustomEvent("filmtv:filter", { detail: detail, bubbles: true }); }
    catch (err) {
      ev = document.createEvent("CustomEvent");
      ev.initCustomEvent("filmtv:filter", true, false, detail);
    }
    root.dispatchEvent(ev);
  }

  /* ---------- scales / helpers ---------- */
  // Smallest "nice" axis max >= data max, using integer steps of 1/2/5×10^k
  // that yield 2–8 gridlines. Among those, pick the one with the LEAST empty
  // headroom (so 63 -> 70, not 80), tie-broken toward ~5 gridlines.
  function niceAxis(max) {
    max = Math.max(Number(max) || 0, 1);
    var exp = Math.floor(Math.log10(max));
    var bases = [1, 2, 5];
    var best = null;
    for (var e = exp + 1; e >= exp - 2; e--) {
      var pow = Math.pow(10, e);
      for (var b = 0; b < bases.length; b++) {
        var step = bases[b] * pow;
        var ticks = Math.ceil(max / step);
        if (ticks < 2 || ticks > 8) continue;
        var axisMax = ticks * step;
        var dist = Math.abs(ticks - 5);
        if (!best || axisMax < best.max || (axisMax === best.max && dist < best.dist)) {
          best = { max: axisMax, step: step, dist: dist };
        }
      }
    }
    return best ? { max: best.max, step: best.step } : { max: max, step: max };
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
  function closest(target, sel) { return target && target.closest ? target.closest(sel) : null; }
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
