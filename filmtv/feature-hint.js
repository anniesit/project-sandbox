/* ============================================================
 * feature-hint.js — one-off "try this" tooltip for links from the Home page.
 *
 * The Home feature cards link to a page WITH A HASH, e.g.
 *   search-page.html?field_1=all&keyword_1=楚原#try-cooccur
 *   book-viewer.html?book=2712&page=8#try-layout
 * This script reads the hash as the page loads, removes it from the address
 * bar, waits until the target control is on screen, then floats a tooltip up
 * above it. Visiting the page any other way shows nothing.
 *
 * Why a hash: it never reaches the server, and the backend scripts rebuild the
 * address bar after their first render (dropping the hash) — so this file must
 * load BEFORE DOMContentLoaded (a normal <script>, in the head or the footer).
 *
 * Dismissed by any click or tap (including on the target itself, which still
 * does its normal job) or by Esc. No auto-hide timer.
 *
 * Add a hint: add an entry to HINTS. `targets` are tried in order and the first
 * VISIBLE one wins — the Book Viewer's 版面配置 dropdown sits inside a hidden
 * slide-up sheet at ≤991px, where the gear button in the bottom bar is used.
 * Styles: feature-hint.css (uses the site's popover tokens).
 * ============================================================ */
(function () {
  "use strict";

  var HINTS = {
    "try-cooccur": {
      targets: ["[data-cooccur-action] > button"],
      align: "right",
      text: function () {
        var kw = "";
        try {
          kw = (new URLSearchParams(window.location.search).get("keyword_1") || "").trim();
        } catch (e) {}
        return kw ? "按此查看與「" + kw + "」最常一同出現的關鍵字" : "按此打開關鍵字分析圖";
      },
    },
    "try-layout": {
      targets: ["#js-viewer-layout-trigger", "#js-layout-dropdown [data-dropdown-trigger]"],
      align: "center",
      text: function () {
        return "試試「單頁 + 純文字」，原頁影像與全文並排對照";
      },
    },
  };

  var SHOW_DELAY = 600; // ms after the target first appears — let the page settle
  var GIVE_UP = 20000; // ms to wait for the target before giving up
  var GAP = 12; // px between the tooltip and its target
  var GUTTER = 16; // px kept clear of the viewport edges

  var key = (window.location.hash || "").replace(/^#/, "");
  var hint = HINTS[key];
  if (!hint) return;

  // remove the marker so a refresh or a shared link doesn't show it again
  try {
    history.replaceState(history.state, "", window.location.pathname + window.location.search);
  } catch (e) {}

  var tip, target, done = false;

  function isVisible(el) {
    if (!el || !el.getClientRects().length) return false;
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    var cs = getComputedStyle(el);
    return cs.visibility !== "hidden";
  }

  function findTarget() {
    for (var i = 0; i < hint.targets.length; i++) {
      var els = document.querySelectorAll(hint.targets[i]);
      for (var j = 0; j < els.length; j++) if (isVisible(els[j])) return els[j];
    }
    return null;
  }

  function waitForTarget() {
    var started = Date.now();
    var timer = setInterval(function () {
      var el = findTarget();
      if (el) {
        clearInterval(timer);
        setTimeout(function () {
          if (findTarget()) show();
        }, SHOW_DELAY);
      } else if (Date.now() - started > GIVE_UP) {
        clearInterval(timer);
      }
    }, 150);
  }

  function show() {
    if (done) return;
    tip = document.createElement("div");
    tip.className = "filmtv-hint";
    tip.id = "filmtv-hint";
    tip.setAttribute("role", "status"); // polite live region: read once, focus untouched
    var p = document.createElement("p");
    p.className = "filmtv-hint-text paragraph-sm u-mb-0";
    tip.appendChild(p);
    document.body.appendChild(tip);

    place();
    // next frame: fill the live region (so it's announced) and start the float-up
    setTimeout(function () {
      p.textContent = hint.text();
      place();
      tip.classList.add("is-on");
    }, 30);

    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", onKey, true);
  }

  // position: fixed, so viewport coordinates straight from getBoundingClientRect
  function place() {
    if (!tip) return;
    var el = findTarget();
    if (!el) {
      tip.style.visibility = "hidden";
      return;
    }
    tip.style.visibility = "";
    if (el !== target) {
      if (target) target.removeAttribute("aria-describedby");
      target = el;
      target.setAttribute("aria-describedby", tip.id);
    }
    var r = el.getBoundingClientRect();
    var vw = document.documentElement.clientWidth;
    var tw = tip.offsetWidth, th = tip.offsetHeight;

    var left = hint.align === "right" ? r.right - tw : r.left + r.width / 2 - tw / 2;
    left = Math.max(GUTTER, Math.min(left, vw - GUTTER - tw));

    var below = r.top - GAP - th < GUTTER; // no room above -> flip below
    tip.classList.toggle("is-below", below);
    tip.style.left = left + "px";
    tip.style.top = (below ? r.bottom + GAP : r.top - GAP - th) + "px";
    // arrow points at the target's centre, kept inside the rounded corners
    var ax = Math.max(14, Math.min(r.left + r.width / 2 - left, tw - 14));
    tip.style.setProperty("--filmtv-hint-arrow-x", ax + "px");
  }

  function onKey(e) {
    if (e.key === "Escape") hide();
  }

  function hide() {
    if (done) return;
    done = true;
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
    document.removeEventListener("pointerdown", hide, true);
    document.removeEventListener("keydown", onKey, true);
    if (target) target.removeAttribute("aria-describedby");
    if (!tip) return;
    var t = tip;
    t.classList.remove("is-on");
    setTimeout(function () {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 400);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", waitForTarget);
  else waitForTarget();
})();
