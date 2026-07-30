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
 * Close is the reverse of open — a slide/collapse OUT, not a fade: drop
 * .is-open so <=1440 the transform slides the card off-canvas and >1440 the
 * width collapses. .is-closing keeps the >1440 content laid out during the
 * collapse so it un-reveals (mirror of the open reveal) instead of vanishing;
 * it's dropped (-> display:none) once the transition ends. Then .sc-split's
 * reserved height eases back down (easeCollapse) so the footer glides up.
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
    var overlayQuery = window.matchMedia("(max-width: 1440px)");
    var lastTrigger = null;
    var collapseTimer = null;
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
      stopCollapseAnim();               // cancel any pending / in-progress collapse
      drawer.classList.remove("is-closing"); // in case reopened mid-close

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
      stopCollapseAnim();

      clearActiveState();

      // Return focus BEFORE making the drawer inert, so focus never lands
      // on an inert element.
      var returnTo = lastTrigger;
      lastTrigger = null;
      if (returnTo) returnTo.focus();

      drawer.setAttribute("inert", "");
      drawer.setAttribute("aria-hidden", "true");

      // Hold the pre-close height so the footer doesn't snap up during / after
      // the slide-out; we ease it down once the drawer has finished moving.
      var reserve = split ? split.offsetHeight : 0;
      if (split) split.style.minHeight = reserve + "px";

      // Slide/collapse OUT (reverse of open): <=1440 the transform slides the
      // card off-canvas; >1440 the width collapses and .is-closing keeps the
      // content laid out so it un-reveals instead of vanishing.
      drawer.classList.add("is-closing");
      drawer.classList.remove("is-open");

      // After the drawer's own slide/width transition, finalize: drop
      // .is-closing (>1440 -> content display:none) and ease the height down.
      var finalize = function () {
        collapseTimer = null;
        drawer.classList.remove("is-closing");
        if (split) easeCollapse();
      };
      var ms = transitionMs(drawer);
      if (ms > 0) {
        collapseTimer = window.setTimeout(finalize, ms + 50);
      } else {
        finalize();
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
    // Suppress the drawer's transition while resizing, so the value changes at
    // the breakpoint snap instead of animating a phantom slide; re-enable once
    // resizing settles.
    var resizeSettle = null;
    function onViewportChange() {
      stopCollapseAnim();
      drawer.classList.add("no-transition");
      syncOverlayHeight();
      window.clearTimeout(resizeSettle);
      resizeSettle = window.setTimeout(function () {
        drawer.classList.remove("no-transition");
      }, 120);
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
