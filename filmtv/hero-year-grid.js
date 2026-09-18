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

  function num(value, fallback) {
    var n = parseInt(value, 10);
    return isNaN(n) ? fallback : n;
  }

  function renderGrid(grid) {
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

    var frag = document.createDocumentFragment();
    for (var year = start; year <= end; year++) {
      var cell = proto.cloneNode(true);
      cell.setAttribute("data-year", String(year));
      cell.setAttribute("title", String(year));
      frag.appendChild(cell);
    }

    grid.innerHTML = "";
    grid.appendChild(frag);

    // Mark the first one so the Designer still has something to select
    // and style after a render.
    if (grid.firstElementChild) {
      grid.firstElementChild.setAttribute("data-year-cell-template", "");
    }

    // A screen reader gets the range, not 72 empty divs.
    grid.setAttribute("role", "img");
    grid.setAttribute("aria-label", "涵蓋年份 " + start + " 至 " + end);

    syncLabel(grid, "[data-year-start-label]", start);
    syncLabel(grid, "[data-year-end-label]", end);

    return end - start + 1;
  }

  function syncLabel(grid, selector, year) {
    var scope = grid.closest ? grid.closest("[data-hero]") : null;
    var el = (scope || document).querySelector(selector);
    if (el) el.textContent = String(year);
  }

  function render() {
    var grids = document.querySelectorAll("[data-hero-year-grid]");
    var total = 0;
    Array.prototype.forEach.call(grids, function (grid) {
      total += renderGrid(grid);
    });
    return total;
  }

  window.filmtvHeroYearGrid = { render: render };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
