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
 * Elements are FOUND via data-* hooks; visual state is the .is-open (drawer)
 * and .is-active (row) classes the CSS keys on. Pairs with sc-drawer.css.
 * ============================================================ */
(function () {
  "use strict";

  function init() {
    var drawer = document.querySelector("[data-sc-drawer]");
    if (!drawer) return; // not the Search Catalogue page — no-op

    var lastTrigger = null;

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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
