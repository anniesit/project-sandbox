/* ============================================================
 * dataviz.js — Danny Yung archive DATA VIZ (資料視覺化) renderer
 *
 * Two charts, both of which exist to hand the reader a FILTERED CATALOGUE:
 *
 *   1. "作品年份與類別" — a bubble chart. x = year, y = category band,
 *      colour = location, area = how many works are in that exact cell.
 *      One bubble is one (year x category x location) group, NOT one work,
 *      because a bubble's href has to be a catalogue query and a query is
 *      exactly those three dimensions. Clicking 1982 · 劇場 · 香港 lands on
 *      /catalogue?category=theatre-production&from=1982&to=1982&location=香港
 *      showing the same 4 works the bubble is sized for.
 *
 *   2. "合作導演與創作者" — a squarified treemap. Area = credits.
 *      Clicking a box lands on /catalogue?director=<name>.
 *
 * Ownership split (same shape as catalogue.js and entry.js):
 *   - dataviz.js (this file) owns the VISUAL: the scales, the layout maths,
 *     the SVG, the treemap rectangles, the legends, the tooltips and the
 *     fallback tables.
 *   - The backend owns the DATA: which works exist and how they aggregate.
 *     It calls render() with the payload below. This file computes no counts
 *     of its own and filters nothing.
 *
 * Integration API (global):
 *   window.dyDataviz.render(rootEl, payload)
 *     rootEl : the [data-dataviz] element (or omit to render every instance)
 *     payload: the shape sample-data/dataviz-sample.json documents, which IS
 *              the contract. Built by sample-data/build-dataviz-sample.py by
 *              aggregating the CATALOGUE's own published records — see that
 *              file for why it must not re-read the spreadsheets.
 *
 * There is no "dy:query" here. The page carries no controls: every mark is a
 * plain link, and the catalogue page is what owns filtering. That is the whole
 * design — the viz is a way in, not a second search UI.
 *
 * data-* contract (authored in Webflow; changing these breaks the page):
 *   [data-dataviz]                       the root; everything is queried inside
 *   [data-chart="temporal"]              the bubble chart card
 *   [data-chart="collaborators"]         the treemap card
 *   [data-legend]      (inside a card)   legend items are generated into it
 *   [data-plot]        (inside a card)   the chart is generated into it; it is
 *                                        emptied first, so nothing may be
 *                                        authored inside it in Webflow
 *   [data-note]        (inside a card)   one line of text about what is and is
 *                                        not on the chart (optional)
 *   [data-table]       (inside a card)   the fallback <table> is generated into
 *                                        it (optional but strongly wanted — it
 *                                        is how the data is reachable without
 *                                        colour, hover or a pointer)
 *
 * COLOUR LIVES IN CSS, GEOMETRY LIVES HERE. Positions and sizes are inline
 * attributes because they are computed per viewport and cannot be classes. Every
 * colour, by contrast, is a CSS custom property. The defaults are injected once
 * under :where([data-dataviz]) — zero specificity — so ANY rule authored in the
 * Webflow Designer overrides them without !important and without touching this
 * file. Re-declare --dyviz-* on .section, on [data-dataviz], or in the project
 * override block to retheme the charts.
 *
 * The location palette is validated, not chosen by eye: six hues checked for
 * the OKLCH lightness band, a chroma floor, colour-vision-deficiency separation
 * (worst adjacent pair ΔE 10.1 deutan), a normal-vision floor and >= 3:1
 * contrast against the chart surface, in BOTH light and dark. Do not edit a hex
 * here without re-running that check — the failure mode is silent for the author
 * and total for the reader.
 *
 * Colour is never the only encoding. Location is in every tooltip, every
 * accessible name and every row of the fallback table; the legend is always
 * present; "no location recorded" is a hollow ring rather than a seventh hue.
 *
 * Dependency-free, multi-instance safe, re-renders on resize (debounced).
 * ============================================================ */
(function () {
  "use strict";

  var SELF =
    (document.currentScript && document.currentScript.src) ||
    (function () {
      var s = document.querySelector('script[src*="dataviz.js"]');
      return s ? s.src : window.location.href;
    })();

  /* >>> MOCK DATA URL <<< the backend replaces this (or removes the mock driver
     at the bottom of this file entirely and calls render() with live data). */
  var DATA_URL = new URL("./sample-data/dataviz-sample.json", SELF).href;

  var NS = "http://www.w3.org/2000/svg";

  /* ---------- text ----------
     Same switch catalogue.js and entry.js use: the nearest [lang] ancestor, so
     one file serves /dataviz and /en/dataviz with no configuration. */
  function lang(root) {
    var el = (root.closest && root.closest("[lang]")) || document.documentElement;
    return (el.getAttribute("lang") || "zh-Hant").toLowerCase().indexOf("en") === 0
      ? "en"
      : "zh";
  }

  /* Chinese uses full-width brackets and no space before them; English uses
     ASCII ones with a leading space. One helper rather than a ternary at every
     call site, because getting it wrong looks like a typo, not a bug. */
  function paren(en, inner) {
    return en ? " (" + inner + ")" : "（" + inner + "）";
  }

  var T = {
    zh: {
      en: false,
      year: "年份",
      category: "類別",
      works: function (n) { return n + " 項作品"; },
      credits: function (n) { return n + " 項合作"; },
      filter: "篩選目錄：",
      noLocation: "未註明地點",
      legendLocation: "地點（顏色）",
      legendCredits: "合作數量",
      fewer: "少",
      more: "多",
      tableYear: "年份",
      tableCategory: "類別",
      tableLocation: "地點",
      tableCount: "作品數",
      tableName: "姓名",
      tableCredits: "合作數",
      noteTemporal: function (d) {
        return "共 " + d.works + " 項作品，" + d.dated + " 項有年份可繪於圖上。"
          + "每個圓點代表同一年份、同一類別、同一地點的作品，面積為數量。";
      },
      noteCollab: function (d) {
        return "共 " + d.n + " 位合作者。榮念曾本人不列於此圖：他參與大部分作品，"
          + "若計入將佔去大半圖面，其他人便看不見了。";
      },
      empty: "沒有可顯示的資料。",
    },
    en: {
      en: true,
      year: "Year",
      category: "Category",
      works: function (n) { return n + (n === 1 ? " work" : " works"); },
      credits: function (n) { return n + (n === 1 ? " credit" : " credits"); },
      filter: "Filter the catalogue: ",
      noLocation: "No location recorded",
      legendLocation: "Location (colour)",
      legendCredits: "Number of credits",
      fewer: "fewer",
      more: "more",
      tableYear: "Year",
      tableCategory: "Category",
      tableLocation: "Location",
      tableCount: "Works",
      tableName: "Name",
      tableCredits: "Credits",
      noteTemporal: function (d) {
        return d.works + " works, " + d.dated + " of them dated and plottable. "
          + "One bubble is every work sharing a year, a category and a location; "
          + "its area is how many.";
      },
      noteCollab: function (d) {
        return d.n + " collaborators. Danny Yung himself is left off this chart — "
          + "he is credited on most of the archive, and including him would cover "
          + "the chart and hide everyone else.";
      },
      empty: "Nothing to show.",
    },
  };

  /* ---------- default colours (zero specificity — Webflow always wins) ----------
     Six location hues + a hollow ring for "unrecorded", and a five-step
     sequential ramp for the treemap. The dark values are SELECTED, not a flip of
     the light ones: they were re-validated against the dark surface, because a
     hue that clears contrast on paper-white does not on near-black.

     DARK IS KEYED ON html.u-mode-dark, NOT ON prefers-color-scheme. The design
     system's theme-toggle script owns that class: it seeds it from the OS
     preference once, then lets a saved choice or the toggle override it. Asking
     the media query directly here would paint dark marks on a page the toggle
     had just switched to light — which is exactly what it did before this
     comment existed. If the theme script is absent the class is absent and the
     charts render light, which is the right way to fail against an unstyled
     white page. Nothing needs re-rendering when the toggle flips: these are
     custom properties, so the swap is pure CSS. */
  var CSS =
    ":where([data-dataviz]){" +
    "--dyviz-surface:#ffffff;--dyviz-ink:#1d1c1a;--dyviz-muted:#6f6a60;" +
    "--dyviz-line:#cccabf;--dyviz-grid:#e6e3da;" +
    "--dyviz-loc-0:#c0442a;--dyviz-loc-1:#1268a8;--dyviz-loc-2:#b98600;" +
    "--dyviz-loc-3:#7b4fb5;--dyviz-loc-4:#3f8a3a;--dyviz-loc-5:#a8447e;" +
    "--dyviz-loc-none:transparent;--dyviz-loc-none-ring:#8d877b;" +
    "--dyviz-ramp-1:#efece3;--dyviz-ramp-2:#d9cfbd;--dyviz-ramp-3:#b39b7e;" +
    "--dyviz-ramp-4:#8a5f45;--dyviz-ramp-5:#5d2f1e;" +
    "--dyviz-ramp-ink-1:#1d1c1a;--dyviz-ramp-ink-2:#1d1c1a;" +
    "--dyviz-ramp-ink-3:#1d1c1a;--dyviz-ramp-ink-4:#ffffff;" +
    "--dyviz-ramp-ink-5:#ffffff;" +
    "--dyviz-focus:#d14424;" +
    "}" +
    ":where(html.u-mode-dark) :where([data-dataviz]){" +
    "--dyviz-surface:#1d1c1a;--dyviz-ink:#f2efe6;--dyviz-muted:#a09a8e;" +
    "--dyviz-line:#4a4640;--dyviz-grid:#33302b;" +
    "--dyviz-loc-0:#d8563c;--dyviz-loc-1:#3e90cc;--dyviz-loc-2:#b08514;" +
    "--dyviz-loc-3:#9878d4;--dyviz-loc-4:#4da648;--dyviz-loc-5:#c95a96;" +
    "--dyviz-loc-none-ring:#8d877b;" +
    "--dyviz-ramp-1:#2b2823;--dyviz-ramp-2:#463d33;--dyviz-ramp-3:#6b5745;" +
    "--dyviz-ramp-4:#96725a;--dyviz-ramp-5:#c99a78;" +
    "--dyviz-ramp-ink-1:#f2efe6;--dyviz-ramp-ink-2:#f2efe6;" +
    "--dyviz-ramp-ink-3:#f2efe6;--dyviz-ramp-ink-4:#1d1c1a;" +
    "--dyviz-ramp-ink-5:#1d1c1a;" +
    "}" +
    /* Structural rules only — anything that is a design decision (type, spacing,
       borders on the card) belongs to the Webflow classes, not to this file. */
    ".dyviz-plot{position:relative}" +
    ".dyviz-svg{display:block;width:100%;height:auto;overflow:visible}" +
    ".dyviz-hit{fill:transparent;stroke:none}" +
    ".dyviz-mark{transition:opacity .12s}" +
    ".dyviz-a{cursor:pointer;outline-offset:2px}" +
    ".dyviz-a:focus-visible{outline:2px solid var(--dyviz-focus)}" +
    ".dyviz-a:hover .dyviz-mark,.dyviz-a:focus-visible .dyviz-mark{" +
    "stroke:var(--dyviz-focus);stroke-width:2px}" +
    ".dyviz-tree{position:relative;width:100%}" +
    ".dyviz-cell{position:absolute;display:flex;flex-direction:column;" +
    "align-items:center;justify-content:center;gap:2px;overflow:hidden;" +
    "padding:4px;text-align:center;text-decoration:none;box-sizing:border-box;" +
    "outline-offset:-2px}" +
    ".dyviz-cell:focus-visible{outline:2px solid var(--dyviz-focus)}" +
    ".dyviz-cell:hover{filter:brightness(1.06)}" +
    /* A long name in a small box has to lose its tail, not push the count out
       of the box or crop through the middle of a glyph. Two lines, clipped
       cleanly; the full name is in the tooltip, the accessible name and the
       table. Falls back to plain overflow:hidden where line-clamp is absent. */
    ".dyviz-cell-name{font-size:11px;line-height:1.25;font-weight:600;" +
    "display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;" +
    "overflow:hidden;max-width:100%;overflow-wrap:anywhere}" +
    ".dyviz-cell-count{flex:none;font-size:10px;line-height:1;opacity:.75}" +
    ".dyviz-tip{position:absolute;z-index:9;pointer-events:none;opacity:0;" +
    "transform:translate(-50%,-100%);white-space:nowrap;padding:6px 8px;" +
    "font-size:12px;line-height:1.35;background:var(--dyviz-ink);" +
    "color:var(--dyviz-surface);transition:opacity .1s}" +
    ".dyviz-tip[data-on]{opacity:1}" +
    ".dyviz-legend{display:flex;flex-wrap:wrap;align-items:center;" +
    "gap:6px 16px;list-style:none;margin:0;padding:0}" +
    ".dyviz-legend-item{display:flex;align-items:center;gap:6px}" +
    ".dyviz-swatch{flex:none;width:10px;height:10px;border-radius:50%}" +
    ".dyviz-ramp{display:flex;align-items:center;gap:2px}" +
    ".dyviz-ramp-step{width:20px;height:10px}" +
    ".dyviz-table{width:100%;border-collapse:collapse;font-size:13px}" +
    ".dyviz-table th,.dyviz-table td{padding:4px 8px;text-align:left;" +
    "border-bottom:1px solid var(--dyviz-grid)}" +
    "@media (prefers-reduced-motion:reduce){.dyviz-mark,.dyviz-tip{transition:none}}";

  function injectCss() {
    if (document.getElementById("dyviz-css")) return;
    var s = document.createElement("style");
    s.id = "dyviz-css";
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------- small DOM helpers ---------- */
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  function svg(tag, attrs, text) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  function empty(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }
  function card(root, name) {
    return root.querySelector('[data-chart="' + name + '"]');
  }
  function part(scope, name) {
    return scope ? scope.querySelector("[data-" + name + "]") : null;
  }
  function locVar(slot) {
    return slot < 0 ? "var(--dyviz-loc-none)" : "var(--dyviz-loc-" + slot + ")";
  }

  /* ---------- render ---------- */

  function render(root, payload) {
    if (!root) {
      var all = document.querySelectorAll("[data-dataviz]");
      for (var i = 0; i < all.length; i++) render(all[i], payload);
      return;
    }
    injectCss();
    if (payload) root.__data = payload;
    var data = root.__data;
    if (!data) return;

    drawTemporal(root, card(root, "temporal"), data);
    drawTreemap(root, card(root, "collaborators"), data);
    watchResize(root);
  }

  /* Re-layout on resize. Both charts are laid out in pixels against the
     container's measured width, so a viewport change is a re-render, not a CSS
     reflow. Debounced because a drag-resize fires this continuously, and the
     treemap does real work. */
  function watchResize(root) {
    if (root.__resize) return;
    root.__resize = true;
    var t = null;
    var last = 0;
    window.addEventListener("resize", function () {
      clearTimeout(t);
      t = setTimeout(function () {
        var w = root.clientWidth;
        if (w === last) return;   /* a phone's URL bar collapsing is not a resize */
        last = w;
        render(root, null);
      }, 150);
    });
  }

  /* ---------- chart 1: the bubble chart ---------- */

  function drawTemporal(root, host, data) {
    if (!host) return;
    var t = T[lang(root)];
    var plot = part(host, "plot");
    var bubbles = data.bubbles || [];
    var cats = data.categories || [];
    if (!plot) return;

    legendLocations(host, data, t);
    note(host, t.noteTemporal({ works: data.totals.works, dated: data.totals.dated }));
    tableTemporal(host, data, t);

    empty(plot);
    plot.className = "dyviz-plot";
    if (!bubbles.length || !cats.length) {
      plot.appendChild(el("div", null, t.empty));
      return;
    }

    /* Geometry. The left margin holds the rotated axis title only — the
       category names sit INSIDE the plot at the top of their own band, as in
       the Figma frame, which buys the data the full width. */
    var W = Math.max(plot.clientWidth || 0, 320);
    var M = { top: 10, right: 12, bottom: 34, left: 34 };
    var bandH = 74;
    var H = M.top + bandH * cats.length + M.bottom;
    var x0 = M.left, x1 = W - M.right;
    var y0 = M.top, y1 = H - M.bottom;

    var minY = data.years.min, maxY = data.years.max;
    /* Guard the degenerate one-year archive: a zero-width domain would put every
       bubble on the axis line and divide by zero. */
    var span = Math.max(maxY - minY, 1);
    /* Inset the domain by one bubble's worth so the first and last years are not
       drawn half on top of the axis rule and half outside the card. */
    var pad = 12;
    function X(year) {
      return x0 + pad + ((year - minY) / span) * (x1 - x0 - pad * 2);
    }

    var rows = {};
    for (var i = 0; i < cats.length; i++) rows[cats[i].key] = i;
    function bandTop(key) { return y0 + rows[key] * bandH; }

    /* Area, not radius, carries the count — a radius-proportional bubble makes
       4 works look 16 times 1. rMin is 4.5 so a single work is still a >= 9px
       mark, the floor below which a dot stops being clickable. */
    function R(count) { return 4.5 * Math.sqrt(count); }

    var s = svg("svg", {
      class: "dyviz-svg",
      viewBox: "0 0 " + W + " " + H,
      role: "img",
      "aria-label": t.noteTemporal({ works: data.totals.works, dated: data.totals.dated }),
    });

    /* Axes: recessive. One 1px baseline, one 1px vertical rule, and a hairline
       between bands — nothing that competes with a 9px dot. */
    for (var c = 0; c < cats.length; c++) {
      var by = bandTop(cats[c].key);
      if (c > 0) {
        s.appendChild(svg("line", {
          x1: x0, x2: x1, y1: by, y2: by,
          stroke: "var(--dyviz-grid)", "stroke-width": 1,
        }));
      }
      s.appendChild(svg("text", {
        x: x0 + 6, y: by + 14, fill: "var(--dyviz-ink)",
        "font-size": 11, "font-weight": 600,
      }, cats[c].label + " · " + cats[c].count));
    }
    s.appendChild(svg("line", {
      x1: x0, x2: x1, y1: y1, y2: y1, stroke: "var(--dyviz-line)", "stroke-width": 1,
    }));
    s.appendChild(svg("line", {
      x1: x0, x2: x0, y1: y0, y2: y1, stroke: "var(--dyviz-line)", "stroke-width": 1,
    }));

    /* Year ticks every 6 years, plus the last year if the step misses it. */
    var ticks = [];
    for (var yr = minY; yr <= maxY; yr += 6) ticks.push(yr);
    if (ticks[ticks.length - 1] !== maxY) ticks.push(maxY);
    for (var k = 0; k < ticks.length; k++) {
      var tx = X(ticks[k]);
      s.appendChild(svg("text", {
        x: tx, y: y1 + 13, fill: "var(--dyviz-muted)", "font-size": 10,
        "text-anchor": k === 0 ? "start" : k === ticks.length - 1 ? "end" : "middle",
      }, String(ticks[k])));
    }
    s.appendChild(svg("text", {
      x: (x0 + x1) / 2, y: H - 4, fill: "var(--dyviz-muted)",
      "font-size": 10, "text-anchor": "middle",
    }, t.year + paren(t.en, minY + "\u2013" + maxY)));
    var axisTitle = svg("text", {
      fill: "var(--dyviz-muted)", "font-size": 10, "text-anchor": "middle",
      transform: "translate(11," + (y0 + y1) / 2 + ") rotate(-90)",
    }, t.category);
    s.appendChild(axisTitle);

    /* Dodge. Several locations can share one year and category, which would
       stack their bubbles exactly on top of each other. Spread that group
       vertically around its band centre, ordered by colour slot so the same
       cluster looks the same on every render — a random jitter would reshuffle
       on each resize and read as the data changing. */
    var clusters = {};
    for (var b = 0; b < bubbles.length; b++) {
      var d = bubbles[b];
      if (!(d.categoryKey in rows)) continue;
      var ck = d.year + "|" + d.categoryKey;
      (clusters[ck] || (clusters[ck] = [])).push(d);
    }

    var marks = svg("g", null);
    var tip = tooltip(plot);
    Object.keys(clusters).forEach(function (ck) {
      var group = clusters[ck].slice().sort(function (a, bb) {
        return a.locationSlot - bb.locationSlot;
      });
      var maxR = 0;
      group.forEach(function (g) { maxR = Math.max(maxR, R(g.count)); });
      var step = maxR * 2 + 2;                 /* 2px surface gap between marks */
      var centre = bandTop(group[0].categoryKey) + bandH / 2 + 4;
      group.forEach(function (g, i) {
        var cx = X(g.year);
        var cy = centre + (i - (group.length - 1) / 2) * step;
        marks.appendChild(bubble(root, g, cx, cy, R(g.count), t, tip, plot));
      });
    });
    s.appendChild(marks);
    plot.appendChild(s);
  }

  function bubble(root, d, cx, cy, r, t, tip, plot) {
    var place = d.location || t.noLocation;
    var label = place + " · " + d.year + " · " + t.works(d.count);
    var a = svg("a", { class: "dyviz-a", href: d.href, "aria-label": t.filter + label });
    a.appendChild(svg("title", null, label));

    var circle = svg("circle", {
      class: "dyviz-mark", cx: cx, cy: cy, r: r,
      fill: locVar(d.locationSlot),
      /* A 2px ring in the surface colour keeps overlapping bubbles legible as
         separate marks. The unrecorded-location bubble has no fill at all, so
         its ring is the mark and has to be ink, not surface. */
      stroke: d.locationSlot < 0 ? "var(--dyviz-loc-none-ring)" : "var(--dyviz-surface)",
      "stroke-width": d.locationSlot < 0 ? 1.5 : 2,
    });
    a.appendChild(circle);
    /* An invisible >= 22px target over the mark. A 9px circle is a legitimate
       size for the ENCODING and an illegitimate one for a finger. */
    a.appendChild(svg("circle", { class: "dyviz-hit", cx: cx, cy: cy, r: Math.max(r, 11) }));
    hover(a, tip, plot, label, function () { return { x: cx, y: cy - r - 6 }; });
    return a;
  }

  /* ---------- chart 2: the treemap ---------- */

  function drawTreemap(root, host, data) {
    if (!host) return;
    var t = T[lang(root)];
    var plot = part(host, "plot");
    var list = data.collaborators || [];
    if (!plot) return;

    legendRamp(host, t);
    note(host, t.noteCollab({ n: list.length }));
    tableCollab(host, data, t);

    empty(plot);
    plot.className = "dyviz-plot dyviz-tree";
    if (!list.length) {
      plot.appendChild(el("div", null, t.empty));
      return;
    }

    var W = Math.max(plot.clientWidth || 0, 280);
    /* Height grows with how many people there are, so 43 boxes do not each end
       up a 12px sliver on a phone. Capped so it cannot swallow the page. */
    var H = Math.max(320, Math.min(760, Math.round(Math.sqrt(list.length) * W * 0.11)));
    plot.style.height = H + "px";

    var min = list[list.length - 1].count, max = list[0].count;
    var tip = tooltip(plot);

    squarify(list.map(function (d) { return { d: d, v: d.count }; }),
      { x: 0, y: 0, w: W, h: H }).forEach(function (cell) {
        var d = cell.d;
        var step = ramp(d.count, min, max);
        var label = d.name + " · " + t.credits(d.count);
        var a = el("a", {
          class: "dyviz-cell", href: d.href, "aria-label": t.filter + label,
          title: label,
        });
        a.style.left = cell.x + "px";
        a.style.top = cell.y + "px";
        /* The 2px gap is taken OUT of each box rather than added between them,
           so the areas still sum to the container and the encoding stays true. */
        a.style.width = Math.max(cell.w - 2, 0) + "px";
        a.style.height = Math.max(cell.h - 2, 0) + "px";
        a.style.background = "var(--dyviz-ramp-" + step + ")";
        a.style.color = "var(--dyviz-ramp-ink-" + step + ")";

        /* Direct-label whatever has room; the rest are reachable by hover, by
           the accessible name, and by the table below. Writing a name into a
           28px box just produces a smear of clipped glyphs. */
        if (cell.w >= 46 && cell.h >= 26) {
          a.appendChild(el("span", { class: "dyviz-cell-name" }, d.name));
          if (cell.h >= 40) {
            a.appendChild(el("span", { class: "dyviz-cell-count" }, String(d.count)));
          }
        }
        hover(a, tip, plot, label, function () {
          return { x: cell.x + cell.w / 2, y: cell.y + 6 };
        });
        plot.appendChild(a);
      });
  }

  /* Five steps, assigned by where the value sits in the range rather than by
     rank, so two people on 3 credits always get the same shade. */
  function ramp(v, min, max) {
    if (max === min) return 3;
    return 1 + Math.round(((v - min) / (max - min)) * 4);
  }

  /* Squarified treemap (Bruls, Huizing & van Wijk). Plain rows would give the
     tail of a long-tailed list 700x8px slivers, which are unreadable and
     unclickable; this keeps every rectangle near square. */
  function squarify(items, rect) {
    var out = [];
    var total = items.reduce(function (a, i) { return a + i.v; }, 0);
    if (!total) return out;
    /* Work in area units so a value maps straight to pixels. */
    var scale = (rect.w * rect.h) / total;
    var queue = items.map(function (i) { return { d: i.d, a: i.v * scale }; });
    var free = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    var row = [];

    function side() { return Math.min(free.w, free.h); }
    function worst(r, extra) {
      var s = side();
      var sum = r.reduce(function (a, i) { return a + i.a; }, 0) + (extra ? extra.a : 0);
      if (!sum) return Infinity;
      var mx = 0, mn = Infinity;
      r.concat(extra ? [extra] : []).forEach(function (i) {
        mx = Math.max(mx, i.a); mn = Math.min(mn, i.a);
      });
      var s2 = s * s, sum2 = sum * sum;
      return Math.max((s2 * mx) / sum2, sum2 / (s2 * mn));
    }
    function flush() {
      if (!row.length) return;
      var sum = row.reduce(function (a, i) { return a + i.a; }, 0);
      var horizontal = free.w >= free.h;
      var thick = sum / side();
      var at = horizontal ? free.y : free.x;
      row.forEach(function (i) {
        var len = i.a / thick;
        out.push(horizontal
          ? { d: i.d, x: free.x, y: at, w: thick, h: len }
          : { d: i.d, x: at, y: free.y, w: len, h: thick });
        at += len;
      });
      if (horizontal) { free.x += thick; free.w -= thick; }
      else { free.y += thick; free.h -= thick; }
      row = [];
    }

    while (queue.length) {
      var next = queue[0];
      if (!row.length || worst(row, next) <= worst(row)) {
        row.push(queue.shift());
      } else {
        flush();
      }
      if (free.w <= 0 || free.h <= 0) break;
    }
    flush();
    return out;
  }

  /* ---------- legends, notes, tooltips, tables ---------- */

  function legendLocations(host, data, t) {
    var box = part(host, "legend");
    if (!box) return;
    empty(box);
    box.className = "dyviz-legend";
    box.setAttribute("role", "list");
    (data.locations || []).forEach(function (l) {
      var li = el("div", { class: "dyviz-legend-item", role: "listitem" });
      var sw = el("span", { class: "dyviz-swatch", "aria-hidden": "true" });
      if (l.slot < 0) {
        sw.style.background = "transparent";
        sw.style.boxShadow = "inset 0 0 0 1.5px var(--dyviz-loc-none-ring)";
      } else {
        sw.style.background = locVar(l.slot);
      }
      li.appendChild(sw);
      /* The count is in the legend on purpose: it is the one place a reader can
         compare locations without counting dots. */
      li.appendChild(el("span", null, l.label + paren(t.en, l.count)));
      /* Which real places the catch-all bucket covers, so "其他地點" is not a
         dead end. */
      if (l.places && l.places.length > 1) li.title = l.places.join(" · ");
      box.appendChild(li);
    });
  }

  function legendRamp(host, t) {
    var box = part(host, "legend");
    if (!box) return;
    empty(box);
    box.className = "dyviz-legend";
    box.appendChild(el("span", null, t.legendCredits));
    var ramp = el("span", { class: "dyviz-ramp", "aria-hidden": "true" });
    ramp.appendChild(el("span", null, t.fewer));
    for (var i = 1; i <= 5; i++) {
      var st = el("span", { class: "dyviz-ramp-step" });
      st.style.background = "var(--dyviz-ramp-" + i + ")";
      ramp.appendChild(st);
    }
    ramp.appendChild(el("span", null, t.more));
    box.appendChild(ramp);
  }

  function note(host, text) {
    var n = part(host, "note");
    if (n) n.textContent = text;
  }

  function tooltip(plot) {
    var tip = el("div", { class: "dyviz-tip" });
    plot.appendChild(tip);
    return tip;
  }

  /* One tooltip per chart, moved rather than created per mark. Bound to focus as
     well as hover, so a keyboard reader gets the same reading a mouse does. */
  function hover(node, tip, plot, text, at) {
    function show() {
      /* Both charts are laid out in the plot box's own pixels — the SVG's
         viewBox is set to the measured width — so a mark's coordinates are
         already the tooltip's coordinates. No scaling step, and none should be
         added without also fixing the viewBox. */
      var p = at();
      tip.textContent = text;
      tip.style.left = p.x + "px";
      tip.style.top = p.y + "px";
      tip.setAttribute("data-on", "");
    }
    function hide() { tip.removeAttribute("data-on"); }
    node.addEventListener("mouseenter", show);
    node.addEventListener("mouseleave", hide);
    node.addEventListener("focus", show);
    node.addEventListener("blur", hide);
  }

  /* The fallback tables are not a courtesy. They are the route to the same
     numbers without colour, without hover and without a pointer — and the only
     one that survives printing. They are generated, so they cannot drift. */
  function tableTemporal(host, data, t) {
    var box = part(host, "table");
    if (!box) return;
    empty(box);
    var tb = el("table", { class: "dyviz-table" });
    var head = el("tr");
    [t.tableYear, t.tableCategory, t.tableLocation, t.tableCount].forEach(function (h) {
      head.appendChild(el("th", { scope: "col" }, h));
    });
    tb.appendChild(el("thead")).appendChild(head);
    var body = el("tbody");
    var byCat = {};
    (data.categories || []).forEach(function (c) { byCat[c.key] = c.label; });
    (data.bubbles || []).forEach(function (b) {
      var tr = el("tr");
      tr.appendChild(el("td", null, String(b.year)));
      tr.appendChild(el("td", null, byCat[b.categoryKey] || b.categoryKey));
      tr.appendChild(el("td", null, b.location || t.noLocation));
      var td = el("td");
      td.appendChild(el("a", { href: b.href }, String(b.count)));
      tr.appendChild(td);
      body.appendChild(tr);
    });
    tb.appendChild(body);
    box.appendChild(tb);
  }

  function tableCollab(host, data, t) {
    var box = part(host, "table");
    if (!box) return;
    empty(box);
    var tb = el("table", { class: "dyviz-table" });
    var head = el("tr");
    [t.tableName, t.tableCredits].forEach(function (h) {
      head.appendChild(el("th", { scope: "col" }, h));
    });
    tb.appendChild(el("thead")).appendChild(head);
    var body = el("tbody");
    (data.collaborators || []).forEach(function (c) {
      var tr = el("tr");
      var td = el("td");
      td.appendChild(el("a", { href: c.href }, c.name));
      tr.appendChild(td);
      tr.appendChild(el("td", null, String(c.count)));
      body.appendChild(tr);
    });
    tb.appendChild(body);
    box.appendChild(tb);
  }

  /* ---------- boot ---------- */

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  ready(function () {
    injectCss();
    var roots = document.querySelectorAll("[data-dataviz]");
    for (var i = 0; i < roots.length; i++) mockDriver(roots[i]);
  });

  /* >>> MOCK DRIVER <<< — delete this whole block for production.
   *
   * It fetches the sample aggregate and calls render(). That is all a backend
   * has to replace: fetch your own aggregate, call dyDataviz.render(root, it).
   * Nothing above this fence changes. Also delete the DATA_URL constant marked
   * >>> MOCK DATA URL <<< at the top.
   *
   * A root may override the sample with data-src="..." to test another dataset
   * without editing this file.
   */
  function mockDriver(root) {
    var url = root.getAttribute("data-src") || DATA_URL;
    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status + " for " + url);
        return r.json();
      })
      .then(function (data) { render(root, data); })
      .catch(function (err) {
        if (window.console) console.error("[dataviz] " + err.message);
      });
  }
  /* >>> END MOCK DRIVER <<< */

  /* ---------- public API (for backend integration) ---------- */
  window.dyDataviz = { render: render };
})();
