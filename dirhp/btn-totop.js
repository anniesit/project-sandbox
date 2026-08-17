/* Back-to-top Button */
/* Scroll-to-top button with a circular scroll-progress indicator. */

/*
 * Hooks (data attributes — replaces the original id/class selectors):
 *   [data-totop]            — the button/link (fades in on scroll, scrolls to top)
 *   [data-totop="progress"] — the SVG <circle> drawn as you scroll
 *
 * All styling lives in Webflow (classes + inline SVG stroke attributes).
 * This script only wires up the scroll progress, show/hide, and click-to-top.
 *
 * Optional config (set before this script runs):
 *   window.DS_CONFIG = { totopThreshold: 0.1 } // 0–1 fraction scrolled before showing
 */
(function () {
  "use strict";

  function init() {
    var btn = document.querySelector("[data-totop]");
    var progressBar = document.querySelector('[data-totop="progress"]');
    if (!btn || !progressBar) return;

    var threshold = (window.DS_CONFIG && window.DS_CONFIG.totopThreshold) || 0.1;

    var pathLength = progressBar.getTotalLength();
    progressBar.style.strokeDasharray = pathLength;
    progressBar.style.strokeDashoffset = pathLength;

    window.addEventListener(
      "scroll",
      function () {
        var scrollPercentage =
          (document.documentElement.scrollTop + document.body.scrollTop) /
          (document.documentElement.scrollHeight -
            document.documentElement.clientHeight);
        var drawLength = pathLength * scrollPercentage;
        progressBar.style.strokeDashoffset = pathLength - drawLength;

        // Show/hide the button based on scroll position
        if (scrollPercentage > threshold) {
          btn.style.opacity = 1;
          btn.style.pointerEvents = "auto";
        } else {
          btn.style.opacity = 0;
          btn.style.pointerEvents = "none";
        }
      },
      { passive: true }
    );

    // Scroll to top
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
