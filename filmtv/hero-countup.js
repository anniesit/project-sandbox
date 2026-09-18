/* ============================================================
 * hero-countup.js — animated totals in the Home page hero
 * Film/TV publication archive (中港電視電影刊物資料庫)
 *
 * Counts the three archive totals up from zero when they scroll into
 * view: 本刊物 (issues), 頁掃描影像 (scanned pages), 字全文內容
 * (characters of full text). The 涵蓋年份 years are NOT counted — they
 * are a range, not a quantity, so they carry no .countup class.
 *
 * Wraps PureCounter (loaded from jsDelivr on demand), same as the HKBU
 * Heritage hero. Two things changed from that version, both needed here:
 *
 *   1. START AND END ARE PER ELEMENT. The Heritage script set one
 *      global start/end pair (1190 -> 1446) because it animated a single
 *      number. Three different totals need three different targets, so
 *      each element carries its own data-purecounter-end and this file
 *      only supplies the shared behaviour.
 *
 *   2. THOUSANDS SEPARATOR IS ON. The design shows 302,317 and
 *      13,529,280; PureCounter's separator defaults to off, which would
 *      have rendered 302317 mid-count and only snapped to the comma
 *      form at the end.
 *
 * Nothing else about the Heritage script was incompatible.
 *
 * ------------------------------------------------------------
 * DOM CONTRACT
 * ------------------------------------------------------------
 *   <span class="countup" data-purecounter-end="302317">302,317</span>
 *
 * The target value may be given either way round:
 *   • data-purecounter-end="302317"   — preferred; explicit
 *   • no attribute at all             — the element's own text is parsed
 *                                       (commas and spaces stripped) and
 *                                       written back as the attribute
 *
 * The second form is what makes this safe for a static build: the
 * numbers currently sit in the markup, and the page still reads
 * correctly with JavaScript off.
 *
 * ------------------------------------------------------------
 * BACKEND / INTEGRATION NOTES
 * ------------------------------------------------------------
 * When these totals start coming from a CSV or the database, write the
 * number to BOTH the element's text (so the page is correct before the
 * script runs, and if it never runs) and data-purecounter-end. Then:
 *
 *     window.filmtvHeroCountup.refresh();
 *
 * re-reads the DOM and re-runs the animation. Values injected after the
 * first run are otherwise missed — PureCounter reads its target once.
 *
 * Attributes may be set per element to override the shared defaults,
 * e.g. data-purecounter-duration="3". See the PureCounter docs.
 * ============================================================ */

(function () {
  "use strict";

  var SELECTOR = ".countup";
  var SRC = "https://cdn.jsdelivr.net/npm/@srexi/purecounterjs/dist/purecounter_vanilla.js";

  var loading = false;
  var queued = false;

  /* Read each element's target BEFORE PureCounter overwrites the text.
   * Returns how many elements are ready to animate. */
  function prepare() {
    var els = document.querySelectorAll(SELECTOR);

    Array.prototype.forEach.call(els, function (el) {
      if (!el.hasAttribute("data-purecounter-end")) {
        var raw = (el.textContent || "").replace(/[,\s ]/g, "");
        var end = parseFloat(raw);
        if (!isNaN(end)) el.setAttribute("data-purecounter-end", String(end));
      }
      if (!el.hasAttribute("data-purecounter-start")) {
        el.setAttribute("data-purecounter-start", "0");
      }
      // Let a refresh re-run an element that has already counted once.
      el.removeAttribute("data-purecounter-duration-done");
    });

    return els.length;
  }

  function run() {
    if (typeof PureCounter === "undefined") return;

    /* Only the settings below that are NOT overridable per element are
     * really "ours"; the rest are defaults each element may override with
     * its own data-purecounter-* attribute. */
    new PureCounter({
      selector: SELECTOR,

      start: 0,           // every total counts up from nothing
      end: 0,             // per element, via data-purecounter-end
      duration: 2,        // seconds
      delay: 20,          // ms between frames
      once: true,         // count once, not on every scroll back
      repeat: false,
      decimals: 0,
      legacy: true,       // scroll-listener fallback for older browsers
      filesizing: false,
      currency: false,
      separator: true     // 302,317 rather than 302317 — matches the design
    });
  }

  function load() {
    if (typeof PureCounter !== "undefined") {
      run();
      return;
    }
    if (loading) {
      queued = true;
      return;
    }
    loading = true;

    var script = document.createElement("script");
    script.src = SRC;
    script.async = true;
    script.onload = function () {
      loading = false;
      run();
      if (queued) {
        queued = false;
        run();
      }
    };
    script.onerror = function () {
      loading = false;
      // The markup already holds the final numbers, so a failed CDN fetch
      // costs the animation and nothing else. Say so rather than failing
      // silently, because the totals will look suspiciously static.
      if (window.console && console.warn) {
        console.warn("[hero-countup] PureCounter failed to load; totals stay static.");
      }
    };
    document.head.appendChild(script);
  }

  function refresh() {
    if (!prepare()) return 0;
    load();
    return document.querySelectorAll(SELECTOR).length;
  }

  window.filmtvHeroCountup = {
    refresh: refresh
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { refresh(); });
  } else {
    refresh();
  }
})();
