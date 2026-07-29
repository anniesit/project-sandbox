/* ============================================================
 * nav-scroll.js — navbar background slide-down on scroll
 *
 * The nav sits transparent at the top of every page; once the page is
 * scrolled past a threshold, a background panel slides down into the navbar
 * and stays. Scroll back to the top and it slides back up.
 *
 * Why not a Webflow interaction / GSAP: the nav is injected at runtime by
 * component-loader.js. An IX2 scroll interaction applies its initial state
 * at init time, so a nav that lands after the user has already scrolled
 * would sit in the wrong state until the next scroll tick — and IX2's
 * animation data lives in the host page, not in the injected partial. An
 * IntersectionObserver reports the correct state on the first callback,
 * whenever that happens to be.
 *
 * Markup contract (authored in the Webflow Nav component):
 *   [data-nav-scroll] — the background panel itself (.nav-bg), absolutely
 *                       positioned behind the nav content, parked at
 *                       translateY(-100%) and revealed by .is-scrolled
 *
 * All styling lives in WEBFLOW (.nav-bg + the .is-scrolled combo). Pairs
 * with nav-scroll.css, which only holds the two things a Webflow class
 * can't express: the JS-only .no-anim state and reduced motion.
 *
 * Optional config (set before this script runs):
 *   window.DS_CONFIG = { navScrollThreshold: 80 } // px scrolled before reveal
 * ============================================================ */
(function () {
  "use strict";

  var DEFAULT_THRESHOLD = 80;

  var bg = null;          // the background panel we toggle
  var sentinel = null;    // zero-size marker at the top of the document
  var observer = null;    // IntersectionObserver watching the sentinel
  var pending = null;     // MutationObserver waiting for a late-injected nav

  function threshold() {
    var v = window.DS_CONFIG && window.DS_CONFIG.navScrollThreshold;
    return typeof v === "number" ? v : DEFAULT_THRESHOLD;
  }

  // Flip the panel. The FIRST application is instant — otherwise a page that
  // loads already-scrolled (or a nav injected mid-page) would play the reveal
  // as an unprompted animation. Every later flip is a real scroll response.
  function setScrolled(on, instant) {
    if (!instant) {
      bg.classList.toggle("is-scrolled", on);
      return;
    }
    bg.classList.add("no-anim");
    bg.classList.toggle("is-scrolled", on);
    void bg.offsetHeight; // flush the change while the transition is disabled
    bg.classList.remove("no-anim");
  }

  // Out-of-flow marker pinned to the top of the document and made exactly as
  // TALL as the threshold: it is in view while scrollY < threshold and has left
  // the viewport once scrollY >= it. So "is it intersecting" is the state we
  // want, with no scroll handler, and observe() self-reports it immediately.
  //
  // Its height is what encodes the threshold — do NOT swap this for a zero-size
  // marker plus a negative rootMargin. That inverse looks equivalent but the
  // marker then sits permanently outside the inset root, so the observer
  // reports "not intersecting" forever and the panel sticks open.
  function makeSentinel() {
    var el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    el.style.cssText =
      "position:absolute;top:0;left:0;width:1px;height:" +
      Math.max(1, threshold()) +
      "px;pointer-events:none;visibility:hidden;";
    document.body.insertBefore(el, document.body.firstChild);
    return el;
  }

  function teardown() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (sentinel && sentinel.parentNode) {
      sentinel.parentNode.removeChild(sentinel);
    }
    sentinel = null;
  }

  // Re-run init once the nav actually lands in the DOM (component-loader.js
  // injects it asynchronously). Self-disconnects on the first success.
  function waitForNav() {
    if (pending || !window.MutationObserver || !document.body) return;
    pending = new MutationObserver(function () {
      if (!document.querySelector("[data-nav-scroll]")) return;
      pending.disconnect();
      pending = null;
      init();
    });
    pending.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    var next = document.querySelector("[data-nav-scroll]");
    if (!next) {
      waitForNav(); // not injected yet — try again when it is
      return;
    }
    if (next === bg && next.hasAttribute("data-nav-scroll-ready")) return;

    teardown(); // a previous nav may have left an observer behind
    bg = next;
    bg.setAttribute("data-nav-scroll-ready", "");

    // No observer support: fall back to simply showing the panel.
    if (!window.IntersectionObserver) {
      setScrolled(true, true);
      return;
    }

    sentinel = makeSentinel();
    var first = true;
    observer = new IntersectionObserver(function (entries) {
      setScrolled(!entries[entries.length - 1].isIntersecting, first);
      first = false;
    });
    observer.observe(sentinel);
  }

  // Exposed so component-loader.js can re-init explicitly after injecting the
  // nav, the same way nav.js exposes initSkipLink. Safe to call repeatedly.
  window.initNavScroll = init;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
