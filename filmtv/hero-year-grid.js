/* ============================================================
 * hero-year-grid.js — the 涵蓋年份 coverage grid in the Home page hero
 * Film/TV publication archive (中港電視電影刊物資料庫)
 *
 * Draws one small square per year the archive covers, wrapping into
 * rows of ten. 1926–1997 is 72 squares, which is far too many to author
 * by hand in Webflow and — more to the point — the span is not fixed:
 * it grows as material is added, so the backend has to be able to move
 * it without anyone reopening the Designer.
 *
 * ------------------------------------------------------------
 * DOM CONTRACT (authored in Webflow)
 * ------------------------------------------------------------
 *   <div data-hero-year-grid data-year-start="1926" data-year-end="1997">
 *     <div class="hero-year-cell" data-year-cell-template></div>
 *   </div>
 *
 * The one authored cell is the TEMPLATE: it is cloned for every year, so
 * restyling it in the Designer restyles the whole grid, and the grid is
 * never empty on the canvas. Each clone carries its own year:
 *
 *   <div class="hero-year-cell" data-year="1926" title="1926"></div>
 *
 * Rows of ten come from the grid container's own Webflow styling
 * (display:grid, 10 columns) — not from this file. One row is one
 * DECADE: the first square is indented into the column matching its
 * last digit, so 1926 sits in column 7 and every later row starts on a
 * year ending in 0.
 *
 * ------------------------------------------------------------
 * THE TOOLTIP (optional)
 * ------------------------------------------------------------
 *   <div class="popover cc-year-tip" popover="manual" data-year-tip>
 *     <p class="paragraph-sm cc-tip" data-year-tip-text>1952（133 本）</p>
 *   </div>
 *
 * Authored in Webflow, next to the grid, reusing the site's own
 * .popover class so it matches the search page's tooltips and can be
 * restyled in the Designer. This file only writes the text into
 * [data-year-tip-text] and positions the box; it creates nothing.
 *
 * Hover a square to show it, and on touch, tap. If no such element
 * exists the squares fall back to a plain `title` attribute — the
 * browser's own slow, unstyleable tooltip — so the grid still explains
 * itself either way.
 *
 * The wording is built from the same data-year-unit used elsewhere,
 * plus data-year-empty-label (default 沒有收藏) for a year with nothing
 * in it.
 *
 * ------------------------------------------------------------
 * HEAT MAP (optional)
 * ------------------------------------------------------------
 * Give the grid a per-year count and each square is shaded by how much
 * the archive holds for that year, turning a decorative block into a
 * readable picture of where the collection is thick and thin:
 *
 *   window.FILMTV_YEAR_COUNTS = { "1926": 1, "1927": 0, ... };
 *
 * declared in the page's JS embed ahead of this file. That is the seam
 * the backend replaces — emit the object and the grid shades itself,
 * with no markup change. A short table can instead ride on the element
 * as data-year-counts='{"1926":1, ... }', but Webflow rejects attribute
 * values much past a few hundred characters, so a full 72-year run does
 * not fit. render() also takes the object directly:
 *
 *   window.filmtvHeroYearGrid.render({ "1926": 1, "1927": 0 });
 *
 * With no counts, nothing is shaded and the grid looks exactly as it
 * does without this feature — so wiring the data later changes nothing
 * else.
 *
 * The intensity is 72 different values, one per square, so it cannot
 * live on a class: the script writes it as an inline `opacity` and
 * hero.css deliberately does not compete for that property. The
 * square's COLOUR stays on the .hero-year-cell Webflow class, so the
 * hue is still chosen in the Designer.
 *
 * Counts are mapped through a SQUARE ROOT by default, not linearly. A
 * weekly like 香港電視 runs to ~52 issues a year against a handful for
 * a sparse year, and a linear ramp would flatten every thin year into
 * the same near-invisible wash. Override with data-year-scale:
 *   "sqrt" (default) | "linear" | "log"
 * and set the faintest step with data-year-heat-min (default 0.18), so
 * a year with one item still reads as present rather than absent.
 * A year with NO entries gets the .is-empty class instead.
 *
 * ------------------------------------------------------------
 * BACKEND / INTEGRATION NOTES
 * ------------------------------------------------------------
 * To move the span, set the two attributes and re-run:
 *
 *   grid.setAttribute("data-year-end", "2007");
 *   window.filmtvHeroYearGrid.render();
 *
 * The two year chips beside the grid are separate elements — update
 * them too, or they will disagree with the squares. They are marked
 * [data-year-start-label] and [data-year-end-label] so a single pass can
 * keep all three in step; render() does that for you when the labels
 * are present.
 * ============================================================ */

(function () {
  "use strict";

  var FALLBACK_START = 1926;
  var FALLBACK_END = 1997;

  var HEAT_MIN = 0.18;

  function num(value, fallback) {
    var n = parseInt(value, 10);
    return isNaN(n) ? fallback : n;
  }

  function float(value, fallback) {
    var n = parseFloat(value);
    return isNaN(n) ? fallback : n;
  }

  /* Counts may arrive three ways, in this order of precedence:
   *   1. handed to render() directly
   *   2. window.FILMTV_YEAR_COUNTS  — a data block in the page's JS embed
   *   3. data-year-counts on the element, as a JSON string
   *
   * (2) is the seam for the backend: emit the object and this picks it
   * up, with no markup change. (3) suits a one-off grid, but Webflow
   * rejects attribute values much beyond a few hundred characters, so a
   * full 72-year table belongs in (2).
   *
   * An array is accepted too, indexed from the start year, because that
   * is the shape an aggregate query tends to fall out in. */
  function readCounts(grid, supplied) {
    /* Guard against being handed something that is not a count table.
     * render() used to be registered straight as the DOMContentLoaded
     * handler, which quietly passed the Event object in here: truthy,
     * an object, and with no year keys — so every square read as "no
     * data" and the grid drew flat while a manual render() worked. */
    var raw = (supplied && typeof supplied === "object" &&
               !(window.Event && supplied instanceof window.Event))
      ? supplied
      : null;

    if (!raw && typeof window.FILMTV_YEAR_COUNTS !== "undefined") {
      raw = window.FILMTV_YEAR_COUNTS;
    }

    if (!raw) {
      var attr = grid.getAttribute("data-year-counts");
      if (!attr) return null;
      try {
        raw = JSON.parse(attr);
      } catch (e) {
        if (window.console && console.warn) {
          console.warn("[hero-year-grid] data-year-counts is not valid JSON; " +
                       "the grid will render unshaded.", e);
        }
        return null;
      }
    }
    return raw && typeof raw === "object" ? raw : null;
  }

  function countFor(counts, year, start) {
    if (!counts) return null;
    if (Array.isArray(counts)) {
      var v = counts[year - start];
      return typeof v === "number" ? v : null;
    }
    var n = counts[String(year)];
    return typeof n === "number" ? n : (n == null ? null : Number(n) || 0);
  }

  /* Map a count onto 0..1. Square root by default — see the header for
   * why a linear ramp reads badly on this collection. */
  function intensity(count, max, scale) {
    if (!max || count <= 0) return 0;
    if (scale === "linear") return count / max;
    if (scale === "log") return Math.log(1 + count) / Math.log(1 + max);
    return Math.sqrt(count) / Math.sqrt(max);
  }

  /* ============================================================
   * The hover tooltip
   *
   * The box itself is authored in Webflow — it reuses the site's own
   * .popover class, so it looks like the tooltips on the search page
   * and is restyled in the Designer like any other element. This file
   * only fills in the text and places it.
   *
   * Two differences from the search page's popovers: those are opened by
   * a click on a <button popovertarget>, and positioned by CSS anchor
   * positioning against that one button. Neither works for 72 squares
   * that want to respond to hover, so this opens the popover from script
   * and positions it from the hovered square's rect.
   *
   * Still a NATIVE popover, though, and that part matters: a popover
   * renders in the browser's top layer, so it is never clipped by an
   * ancestor's overflow — and the hero's container does clip.
   * ============================================================ */

  var TIP_GAP = 10;      // px between the square and the tooltip
  var TIP_EDGE = 8;      // px minimum gap from the viewport edge

  var CAN_POPOVER = typeof HTMLElement !== "undefined" &&
    Object.prototype.hasOwnProperty.call(HTMLElement.prototype, "popover");

  function labelFor(year, count, unit, emptyLabel) {
    if (count === null) return String(year);
    if (count <= 0) return year + "（" + emptyLabel + "）";
    return year + "（" + count + " " + unit + "）";
  }

  /* Scoped to the hero first, so a second grid on the same page would
   * find its own tooltip rather than the first one's. */
  function findTip(grid) {
    var scope = grid.closest ? grid.closest("[data-hero]") : null;
    return (scope || document).querySelector("[data-year-tip]");
  }

  function showTip(tipEl, cell) {
    var text = tipEl.querySelector("[data-year-tip-text]") || tipEl;
    text.textContent = cell.getAttribute("data-label") || "";

    if (CAN_POPOVER && !tipEl.__open) {
      try { tipEl.showPopover(); } catch (e) { /* already open */ }
    }
    tipEl.classList.add("is-visible");
    tipEl.__open = true;

    // Measure AFTER showing — a hidden box has no width to centre on.
    var c = cell.getBoundingClientRect();
    var t = tipEl.getBoundingClientRect();

    var left = c.left + c.width / 2 - t.width / 2;
    var top = c.top - t.height - TIP_GAP;

    // Flip below when there is no room above, and stay on screen.
    if (top < TIP_EDGE) top = c.bottom + TIP_GAP;
    left = Math.max(TIP_EDGE, Math.min(left, window.innerWidth - t.width - TIP_EDGE));

    tipEl.style.left = Math.round(left) + "px";
    tipEl.style.top = Math.round(top) + "px";
  }

  function hideTip(tipEl) {
    if (!tipEl.__open) return;
    tipEl.classList.remove("is-visible");
    tipEl.__open = false;
    if (CAN_POPOVER) {
      try { tipEl.hidePopover(); } catch (e) { /* already closed */ }
    }
  }

  function cellFrom(e, grid) {
    var el = e.target;
    if (!el || !el.closest) return null;
    var cell = el.closest("[data-year]");
    return cell && grid.contains(cell) ? cell : null;
  }

  /* Listeners go on the GRID, not on each square — one set of handlers
   * however many years the archive grows to, and they survive the
   * squares being rebuilt on every render. */
  function wireTip(grid, tipEl) {
    if (!tipEl || grid.__tipWired) return;
    grid.__tipWired = true;

    grid.addEventListener("mouseover", function (e) {
      var cell = cellFrom(e, grid);
      if (cell) showTip(tipEl, cell);
    });

    grid.addEventListener("mouseleave", function () { hideTip(tipEl); });

    // Touch: tap a square to read it, tap anywhere else to dismiss.
    grid.addEventListener("click", function (e) {
      var cell = cellFrom(e, grid);
      if (cell) showTip(tipEl, cell);
    });
    document.addEventListener("click", function (e) {
      if (!grid.contains(e.target)) hideTip(tipEl);
    });

    // A fixed-position box would otherwise hang in mid-air once the page
    // moves under it.
    window.addEventListener("scroll", function () { hideTip(tipEl); }, true);
    window.addEventListener("resize", function () { hideTip(tipEl); });
  }

  function renderGrid(grid, supplied) {
    var start = num(grid.getAttribute("data-year-start"), FALLBACK_START);
    var end = num(grid.getAttribute("data-year-end"), FALLBACK_END);

    if (end < start) {
      var swap = start;
      start = end;
      end = swap;
    }

    // Keep the authored cell as the template. On a re-render the first
    // generated cell stands in for it, so the template survives being
    // cloned repeatedly.
    var template =
      grid.querySelector("[data-year-cell-template]") ||
      grid.firstElementChild;

    if (!template) {
      if (window.console && console.warn) {
        console.warn(
          "[hero-year-grid] no cell to clone — add one child element to " +
          "[data-hero-year-grid] to act as the template.", grid
        );
      }
      return 0;
    }

    /* The template is the previous render's first cell, so it arrives
     * carrying that render's state. Strip it, or every clone starts life
     * wearing one particular year's shading. */
    var proto = template.cloneNode(true);
    proto.removeAttribute("data-year-cell-template");
    proto.removeAttribute("data-count");
    proto.removeAttribute("title");
    proto.classList.remove("is-empty");
    proto.style.opacity = "";
    proto.style.gridColumnStart = "";

    var counts = readCounts(grid, supplied);
    var scale = grid.getAttribute("data-year-scale") || "sqrt";
    var heatMin = float(grid.getAttribute("data-year-heat-min"), HEAT_MIN);
    var unit = grid.getAttribute("data-year-unit") || "本";
    var emptyLabel = grid.getAttribute("data-year-empty-label") || "沒有收藏";
    var tipEl = findTip(grid);

    var max = 0;
    var total = 0;
    if (counts) {
      for (var y = start; y <= end; y++) {
        var c = countFor(counts, y, start) || 0;
        if (c > max) max = c;
        total += c;
      }
    }

    var frag = document.createDocumentFragment();
    for (var year = start; year <= end; year++) {
      var cell = proto.cloneNode(true);
      cell.setAttribute("data-year", String(year));

      var count = countFor(counts, year, start);

      if (count === null) {
        // No data for this grid at all — leave the square as authored.
      } else if (count <= 0) {
        cell.classList.add("is-empty");
        cell.setAttribute("data-count", "0");
      } else {
        var t = intensity(count, max, scale);
        cell.style.opacity = String((heatMin + (1 - heatMin) * t).toFixed(3));
        cell.setAttribute("data-count", String(count));
      }

      /* The label the tooltip shows. Only fall back to `title` — and so
       * to the browser's own slow, unstyleable tooltip — when no tooltip
       * element was authored, so the grid still explains itself. */
      cell.setAttribute("data-label", labelFor(year, count, unit, emptyLabel));
      if (!tipEl) cell.setAttribute("title", cell.getAttribute("data-label"));

      frag.appendChild(cell);
    }

    /* One row per DECADE. The columns are the last digit of the year, so
     * 1926 sits in column 7 and every row starts on a year ending in 0.
     * Only the FIRST cell needs saying: it is indented into its column
     * and the rest flow along behind it. Reading down a column then
     * compares the same point in each decade. */
    var firstCell = frag.firstElementChild;
    if (firstCell) {
      firstCell.style.gridColumnStart = String((start % 10) + 1);
    }

    grid.innerHTML = "";
    grid.appendChild(frag);

    // Mark the first one so the Designer still has something to select
    // and style after a render.
    if (grid.firstElementChild) {
      grid.firstElementChild.setAttribute("data-year-cell-template", "");
    }

    /* A screen reader gets the range — and, when the squares actually
     * carry data, the total — rather than 72 empty divs. */
    grid.setAttribute("role", "img");
    grid.setAttribute("aria-label",
      counts
        ? "涵蓋年份 " + start + " 至 " + end + "，共 " + total + " " + unit +
          "，方格顏色深淺代表該年的收藏數量"
        : "涵蓋年份 " + start + " 至 " + end);

    syncLabel(grid, "[data-year-start-label]", start);
    syncLabel(grid, "[data-year-end-label]", end);

    wireTip(grid, tipEl);

    return end - start + 1;
  }

  function syncLabel(grid, selector, year) {
    var scope = grid.closest ? grid.closest("[data-hero]") : null;
    var el = (scope || document).querySelector(selector);
    if (el) el.textContent = String(year);
  }

  /* render()            — re-read the DOM and redraw
   * render(counts)      — redraw, shading by { "1926": 3, … } */
  function render(counts) {
    var grids = document.querySelectorAll("[data-hero-year-grid]");
    var cells = 0;
    Array.prototype.forEach.call(grids, function (grid) {
      cells += renderGrid(grid, counts);
    });
    return cells;
  }

  window.filmtvHeroYearGrid = { render: render };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { render(); });
  } else {
    render();
  }
})();
