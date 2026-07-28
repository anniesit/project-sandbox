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
 * Height: at >1440px the drawer is in-flow, so its content sets its height
 * and the page scrolls naturally — nothing to do here. At <=1440px the drawer
 * is an ABSOLUTE overlay, which can't grow its own container; so when open we
 * measure the drawer and grow .sc-split to match, pushing the footer below it
 * (page scrolls, no nested scroll area). On close we hold that height until the
 * slide-out transition ends, then release it — otherwise the parent snaps short
 * mid-slide and the drawer overflows below it for a frame.
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

    // Ease the reserved overlay height back down to natural, then release it,
    // so the footer glides up. Called only after the drawer has slid off-canvas.
    function easeCollapse() {
      if (!split) return;
      if (!overlayQuery.matches || !split.style.minHeight) {
        syncOverlayHeight();
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
      stopCollapseAnim(); // cancel any pending / in-progress collapse from a prior close

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

      drawer.classList.remove("is-open");
      clearActiveState();

      // Return focus BEFORE making the drawer inert, so focus never lands
      // on an inert element.
      var returnTo = lastTrigger;
      lastTrigger = null;
      if (returnTo) returnTo.focus();

      drawer.setAttribute("inert", "");
      drawer.setAttribute("aria-hidden", "true");

      // Keep .sc-split tall until the drawer has finished sliding off-canvas,
      // THEN ease the reserved height back down. Clearing immediately would snap
      // the parent short while the still-full-height drawer is mid-slide (it
      // would briefly overflow below); easing during the slide would do the same.
      stopCollapseAnim();
      var ms = transitionMs(drawer);
      if (ms > 0 && split && split.style.minHeight) {
        collapseTimer = window.setTimeout(easeCollapse, ms + 50);
      } else {
        syncOverlayHeight();
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
