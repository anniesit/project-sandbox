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
 * (display:grid, 10 columns) — not from this file.
 *
 * ------------------------------------------------------------
 * HEAT MAP (optional)
 * ------------------------------------------------------------
 * Give the grid a per-year count and each square is shaded by how much
 * the archive holds for that year, turning a decorative block into a
 * readable picture of where the collection is thick and thin:
 *
 *   <div data-hero-year-grid
 *        data-year-start="1926" data-year-end="1997"
 *        data-year-counts='{"1926":3,"1927":11, ... }'>
 *
 * or, from script (handy once the counts come from the database):
 *
 *   window.filmtvHeroYearGrid.render({ "1926": 3, "1927": 11 });
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

  /* Counts may arrive as a JSON object on the element, or be handed to
   * render() directly. An array is accepted too, indexed from the start
   * year, because that is the shape an aggregate query falls out in. */
  function readCounts(grid, supplied) {
    var raw = supplied;

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

    var proto = template.cloneNode(true);
    proto.removeAttribute("data-year-cell-template");

    var counts = readCounts(grid, supplied);
    var scale = grid.getAttribute("data-year-scale") || "sqrt";
    var heatMin = float(grid.getAttribute("data-year-heat-min"), HEAT_MIN);
    var unit = grid.getAttribute("data-year-unit") || "本";

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
        cell.setAttribute("title", String(year));
      } else if (count <= 0) {
        cell.classList.add("is-empty");
        cell.setAttribute("data-count", "0");
        cell.setAttribute("title", year + "（沒有收藏）");
      } else {
        var t = intensity(count, max, scale);
        cell.style.opacity = String((heatMin + (1 - heatMin) * t).toFixed(3));
        cell.setAttribute("data-count", String(count));
        cell.setAttribute("title", year + "（" + count + " " + unit + "）");
      }

      frag.appendChild(cell);
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
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
