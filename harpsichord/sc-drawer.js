/* ============================================================
 * sc-drawer.js — Search Catalogue entry detail drawer
 *
 * Opens #sc-entry-drawer when a result row trigger [data-sc-entry] is
 * clicked; closes it via [data-sc-close] or the Escape key.
 *
 * Non-modal disclosure pattern:
 *   - trigger buttons carry aria-expanded + aria-controls="sc-entry-drawer"
 *   - the drawer is inert + aria-hidden while closed (it hides via a
 *     transform, not display:none, so its controls must be made inert)
 *   - no focus trap; focus returns to the triggering row on close
 *
 * Height: the card's content sets its height. At <=1440px the drawer is an
 * ABSOLUTE overlay, so on open we measure it and grow .sc-split to contain it
 * (page scrolls, no nested scroll area); at >1440px it's in-flow and grows the
 * row naturally.
 *
 * Close is a two-phase, breakpoint-agnostic sequence: (1) fade the whole card
 * out in place — keep .is-open so it stays laid out while opacity -> 0; then
 * (2) drop .is-open to collapse it (width/slide + display:none) and ease
 * .sc-split's reserved height back down (easeCollapse) so the footer glides up.
 * Collapsing only after the fade means it's never visible — so there's no
 * slide-wait/overflow dance and both breakpoints behave the same.
 *
 * Elements are FOUND via data-* hooks; visual state is the .is-open (drawer)
 * and .is-active (row) classes the CSS keys on. Pairs with sc-drawer.css.
 * ============================================================ */
(function () {
  "use strict";

  function init() {
    var drawer = document.querySelector("[data-sc-drawer]");
    if (!drawer) return; // not the Search Catalogue page — no-op

    var split = drawer.closest(".sc-split");
    var content = drawer.querySelector(".cc-entry");
    var overlayQuery = window.matchMedia("(max-width: 1440px)");
    var lastTrigger = null;
    var collapseTimer = null;
    var fadeTimer = null;
    var onSplitTransitionEnd = null;

    // In overlay mode, size .sc-split to the open drawer so it isn't clipped
    // by / spilling out of the row. In-flow mode (>1440px) needs no override.
    function syncOverlayHeight() {
      if (!split) return;
      if (drawer.classList.contains("is-open") && overlayQuery.matches) {
        split.style.minHeight = drawer.offsetHeight + "px";
      } else {
        split.style.minHeight = "";
      }
    }

    // Length of an element's transition, in ms (handles "0.7s"/"700ms").
    function transitionMs(el) {
      var cs = window.getComputedStyle(el);
      function ms(v) {
        v = String(v || "").split(",")[0].trim();
        if (!v) return 0;
        return v.indexOf("ms") > -1 ? parseFloat(v) || 0 : (parseFloat(v) || 0) * 1000;
      }
      return ms(cs.transitionDuration) + ms(cs.transitionDelay);
    }

    // Cancel a pending fade→collapse hand-off (e.g. when reopened mid-fade).
    function stopFade() {
      window.clearTimeout(fadeTimer);
      fadeTimer = null;
    }

    // Cancel any pending / in-progress height animation and leave .sc-split in a
    // clean state (no transition class) so the next open grows instantly.
    function stopCollapseAnim() {
      window.clearTimeout(collapseTimer);
      collapseTimer = null;
      if (split && onSplitTransitionEnd) {
        split.removeEventListener("transitionend", onSplitTransitionEnd);
        onSplitTransitionEnd = null;
      }
      if (split) split.classList.remove("is-collapsing");
    }

    // Ease the reserved height back down to natural, then release it, so the
    // footer glides up. Assumes .sc-split.style.minHeight currently holds the
    // pre-close (tall) height. Works in both overlay and in-flow modes.
    function easeCollapse() {
      if (!split || !split.style.minHeight) {
        if (split) syncOverlayHeight();
        return;
      }

      var from = parseFloat(split.style.minHeight) || split.offsetHeight;
      split.style.minHeight = "";           // measure the natural (collapsed) height
      var to = split.offsetHeight;
      if (to >= from) return;               // nothing to reclaim; leave it cleared
      split.style.minHeight = from + "px";  // restore, then animate down
      void split.offsetHeight;              // reflow so the next change transitions

      split.classList.add("is-collapsing");
      split.style.minHeight = to + "px";

      var done = function () {
        stopCollapseAnim();
        split.style.minHeight = "";
      };
      onSplitTransitionEnd = function (e) {
        if (e.target === split && e.propertyName === "min-height") done();
      };
      split.addEventListener("transitionend", onSplitTransitionEnd);
      collapseTimer = window.setTimeout(done, transitionMs(split) + 80); // fallback
    }

    function clearActiveState() {
      document.querySelectorAll("[data-sc-entry]").forEach(function (el) {
        el.setAttribute("aria-expanded", "false");
      });
      document.querySelectorAll(".sc-source-li.is-active").forEach(function (el) {
        el.classList.remove("is-active");
      });
    }

    function openDrawer(trigger) {
      lastTrigger = trigger;
      stopFade();          // cancel a fade→collapse in progress from a prior close
      stopCollapseAnim();  // cancel any pending / in-progress collapse
      drawer.classList.remove("is-fading");

      clearActiveState();
      trigger.setAttribute("aria-expanded", "true");
      var row = trigger.closest(".sc-source-li");
      if (row) row.classList.add("is-active");

      drawer.classList.add("is-open");
      drawer.removeAttribute("inert");
      drawer.setAttribute("aria-hidden", "false");

      // Stage-2 seam: populate per-entry details from trigger.dataset.entryId here.

      syncOverlayHeight();

      // Move focus into the panel (non-trapping) for keyboard / AT users.
      var closeBtn = drawer.querySelector("[data-sc-close]");
      if (closeBtn) closeBtn.focus();
    }

    function closeDrawer() {
      if (!drawer.classList.contains("is-open")) return;
      stopFade();
      stopCollapseAnim();

      clearActiveState();

      // Return focus BEFORE making the drawer inert, so focus never lands
      // on an inert element.
      var returnTo = lastTrigger;
      lastTrigger = null;
      if (returnTo) returnTo.focus();

      drawer.setAttribute("inert", "");
      drawer.setAttribute("aria-hidden", "true");

      // Capture the height while the card is still laid out, so we can hold it
      // and ease it down rather than let the row snap short once it collapses.
      var reserve = split ? split.offsetHeight : 0;

      // Phase 1: fade the whole card out IN PLACE — keep .is-open so the layout
      // (width/position/height) holds steady while opacity goes to 0.
      drawer.classList.add("is-fading");

      // Phase 2: once invisible, drop .is-open to collapse the card (slide/width
      // + display:none) and ease the reserved height down. Doing this only after
      // the fade means the collapse is never visible, in either breakpoint mode.
      var collapse = function () {
        fadeTimer = null;
        if (split) split.style.minHeight = reserve + "px"; // hold before content drops
        drawer.classList.remove("is-fading");
        drawer.classList.remove("is-open");
        if (split) easeCollapse();
      };

      var fadeMs = content ? transitionMs(content) : 0;
      if (fadeMs > 0) {
        fadeTimer = window.setTimeout(collapse, fadeMs + 30);
      } else {
        collapse();
      }
    }

    document.addEventListener("click", function (e) {
      var trigger = e.target.closest("[data-sc-entry]");
      if (trigger) {
        e.preventDefault();
        openDrawer(trigger);
        return;
      }
      if (e.target.closest("[data-sc-close]")) {
        e.preventDefault();
        closeDrawer();
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeDrawer();
    });

    // Recompute the overlay height when the viewport changes or crosses the
    // 1440px boundary. Cancel any in-flight ease first so it settles cleanly.
    function onViewportChange() {
      stopCollapseAnim();
      syncOverlayHeight();
    }
    window.addEventListener("resize", onViewportChange);
    if (overlayQuery.addEventListener) {
      overlayQuery.addEventListener("change", onViewportChange);
    } else if (overlayQuery.addListener) {
      overlayQuery.addListener(onViewportChange); // older Safari
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
