/* ============================================================
 * table-rowlink.js — clickable + accessibly-named table rows
 *
 * The browse tables carry a full-row link overlay (a.u-link-cover inside a
 * .table-cell). That overlay CANNOT stay pointer-interactive: an absolutely
 * positioned link sitting on top of a horizontally scrollable table swallows
 * the swipe gesture on iPadOS WebKit, so the table can't be scrolled. The fix
 * is `.table-cell .u-link-cover { pointer-events: none }` (in Webflow custom
 * CSS) — which restores scrolling but also disables the link's own click.
 *
 * This script does two things, both without re-introducing an interactive
 * overlay:
 *
 * 1. NAVIGATION — a delegated click listener navigates to the row's single
 *    source of truth, the href on that same a.u-link-cover. The backend
 *    injects the destination in exactly ONE place (the cover's href) and the
 *    row is clickable + scrollable on desktop, iPhone and iPad.
 *
 * 2. ACCESSIBLE NAME — the cover is an EMPTY anchor, so without help a screen
 *    reader announces a nameless link (it reads out the URL). Here we point
 *    the cover's `aria-labelledby` at the row's first cell ("Code"), so the
 *    link is named by that row's own visible identifier — unique per row, no
 *    duplicated copy, and it stays in sync with the cell text. Keyboard use is
 *    unaffected (pointer-events:none blocks pointer input only), and Enter on
 *    the focused cover navigates natively.
 *
 * Because the accessible name is applied in JS, it is JS-dependent — but so is
 * the whole clickable-row setup (pointer-events:none + this script), so it adds
 * no new failure mode. Server-rendered aria-labelledby would be more robust.
 *
 * Markup contract:
 *   .table-row                         — a body row (header row has no cover)
 *     .table-cell (first) > p          — the "Code" identifier text
 *     .table-cell a.u-link-cover[href] — carries the destination + gets named
 *
 * Handles rows the backend injects after load via a MutationObserver, so the
 * name is present before a screen-reader user reaches the link (not on click).
 * ============================================================ */
(function () {
  "use strict";

  var READY = "data-rowlink-ready";

  // Covers scoped to match the CSS that neutralised them
  // (`.table-cell .u-link-cover { pointer-events:none }`). A .u-link-cover
  // that is NOT inside a cell (e.g. the footer logo) stays pointer-interactive
  // and handles its own click, so we must not touch it.
  var COVER = ".table-cell a.u-link-cover";
  var COVER_LINK = COVER + "[href]"; // a cover that is actually a link yet

  // Elements that must handle their own clicks — don't hijack these.
  var INTERACTIVE = "a:not(.u-link-cover), button, input, select, textarea, label";

  // ---- accessible name -------------------------------------------------

  var seq = 0;
  function uniqueId() {
    var id;
    do {
      id = "rowlink-code-" + ++seq;
    } while (document.getElementById(id));
    return id;
  }

  // Name each row's cover after its first cell ("Code"). Idempotent, and a
  // no-op on the header row (no cover) or a row whose Code is blank (leaving
  // it unnamed rather than pointing at empty text).
  function nameRow(row) {
    var cover = row.querySelector(COVER);
    if (!cover) return;

    var cell = row.querySelector(".table-cell");
    if (!cell) return;

    // Prefer the text <p>, never the <td> — the <td> may also contain the
    // cover anchor, and labelling by an ancestor of the cover risks a cycle.
    var target = cell.querySelector("p") || cell;
    if (!target.textContent || !target.textContent.trim()) return;

    if (!target.id) target.id = uniqueId();
    if (cover.getAttribute("aria-labelledby") !== target.id) {
      cover.setAttribute("aria-labelledby", target.id);
    }
  }

  function nameAll(root) {
    var rows = (root || document).querySelectorAll(".table-row");
    for (var i = 0; i < rows.length; i++) nameRow(rows[i]);
  }

  // Catch rows the backend injects after load, so the name exists before the
  // link is reached — not deferred to click time.
  function watch() {
    if (!window.MutationObserver || !document.body) return;
    new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType !== 1) continue; // elements only
          if (node.matches && node.matches(".table-row")) nameRow(node);
          if (node.querySelectorAll) nameAll(node); // descendant rows
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ---- navigation ------------------------------------------------------

  function destinationFor(row) {
    var a = row.querySelector(COVER_LINK);
    if (!a) return null;
    var href = a.getAttribute("href");
    if (!href || href === "#") return null; // not wired yet
    return a; // return the element so we get its resolved .href + target
  }

  function onClick(e) {
    if (e.defaultPrevented || e.button !== 0) return; // left click / tap only

    // Keyboard activation (Enter) fires a click whose target IS the cover —
    // pointer-events:none never lets a pointer land there. Let the real <a>
    // do its native navigation so we don't double-handle it.
    if (e.target.closest("a.u-link-cover")) return;

    // A drag-to-select shouldn't navigate.
    var sel = window.getSelection && window.getSelection();
    if (sel && sel.type === "Range" && String(sel).length) return;

    var row = e.target.closest(".table-row");
    if (!row) return;
    if (e.target.closest(INTERACTIVE)) return; // real control won — leave it

    var a = destinationFor(row);
    if (!a) return;

    if (e.metaKey || e.ctrlKey || e.shiftKey || a.target === "_blank") {
      window.open(a.href, "_blank", "noopener");
    } else {
      window.location.href = a.href;
    }
  }

  // ---- init ------------------------------------------------------------

  function init() {
    var root = document.documentElement;
    if (root.hasAttribute(READY)) return; // idempotent
    root.setAttribute(READY, "");

    document.addEventListener("click", onClick);
    nameAll(document); // server-rendered rows
    watch(); // backend-injected rows
  }

  window.initTableRowLink = init;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
