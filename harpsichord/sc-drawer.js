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
 * (page scrolls, no nested scroll area).
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
      syncOverlayHeight();

      // Return focus BEFORE making the drawer inert, so focus never lands
      // on an inert element.
      var returnTo = lastTrigger;
      lastTrigger = null;
      if (returnTo) returnTo.focus();

      drawer.setAttribute("inert", "");
      drawer.setAttribute("aria-hidden", "true");
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
    // 1440px boundary while the drawer is open.
    window.addEventListener("resize", syncOverlayHeight);
    if (overlayQuery.addEventListener) {
      overlayQuery.addEventListener("change", syncOverlayHeight);
    } else if (overlayQuery.addListener) {
      overlayQuery.addListener(syncOverlayHeight); // older Safari
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
