/* ============================================================
 * table-rowlink.js — make a whole table row clickable
 *
 * The browse tables carry a full-row link overlay (a.u-link-cover inside a
 * .table-cell). That overlay CANNOT stay pointer-interactive: an absolutely
 * positioned link sitting on top of a horizontally scrollable table swallows
 * the swipe gesture on iPadOS WebKit, so the table can't be scrolled. The fix
 * is `.table-cell .u-link-cover { pointer-events: none }` (in Webflow custom
 * CSS) — which restores scrolling but also disables the link's own click.
 *
 * This script gives the click back WITHOUT re-introducing an interactive
 * overlay: it listens for clicks on the row and navigates to the row's single
 * source of truth — the href on that same a.u-link-cover. So the backend
 * injects the destination in exactly ONE place (the cover's href) and the row
 * is clickable + scrollable on desktop, iPhone and iPad.
 *
 * Keyboard users are unaffected: pointer-events:none does not block keyboard
 * focus/activation, so the cover is still a real, tab-focusable link.
 *
 * Markup contract:
 *   .table-row                     — the clickable row
 *     a.u-link-cover[href]         — carries the destination (backend-injected)
 *
 * Delegated on the document, so rows injected after load are handled too.
 * ============================================================ */
(function () {
  "use strict";

  var READY = "data-rowlink-ready";

  // The one cover we mirror — scoped to match the CSS that neutralised it
  // (`.table-cell .u-link-cover { pointer-events:none }`). A .u-link-cover
  // that is NOT inside a cell is still pointer-interactive and handles its
  // own click, so we must not also navigate for it.
  var COVER = ".table-cell a.u-link-cover[href]";

  // Elements that must handle their own clicks — don't hijack these.
  var INTERACTIVE = "a:not(.u-link-cover), button, input, select, textarea, label";

  function destinationFor(row) {
    var a = row.querySelector(COVER);
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

  function init() {
    var root = document.documentElement;
    if (root.hasAttribute(READY)) return; // idempotent
    root.setAttribute(READY, "");
    document.addEventListener("click", onClick);
  }

  window.initTableRowLink = init;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
