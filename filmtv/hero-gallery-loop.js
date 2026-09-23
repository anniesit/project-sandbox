/* ============================================================
 * hero-gallery-loop.js — Home page HERO CAROUSEL
 * Film/TV publication archive (中港電視電影刊物資料庫)
 *
 * Auto-loops through the collections listed in the hero's "Collection
 * list", swapping a stacked set of magazine-cover images for each one.
 *
 * Adapted from the HKBU Heritage hero gallery, with four differences:
 *   1. The active collection is shown by a COLOUR CHANGE on the list item
 *      (class `is-active`), not by a moving pointer element.
 *   2. The list shows at most N items (default 4) and scrolls past that.
 *      Up/down arrows appear only when the list overflows; stepping the
 *      highlight past the visible window scrolls the list by one step —
 *      including the wrap from the last item back to the first.
 *   3. Each collection's image is a SET of separate layers that fade and
 *      drift in from the top right (rotating clockwise) and out to the
 *      bottom left (rotating anti-clockwise), staggered bottom-left first.
 *      All of that motion lives in hero.css; this file only toggles classes.
 *   4. The page first shows a "page load default" slide standing for the
 *      whole archive, with NO collection highlighted. It is retired for
 *      good the moment anything takes over — the timer running out, or a
 *      hover, focus, arrow press or list scroll, whichever comes first.
 *
 * ROW MODE (tablet and below) — kept from the Heritage gallery's mobile
 * behaviour. When Webflow lays the list out as a horizontal row (its
 * flex-direction starts with "row"), two things link the list's scroll
 * position to the slide, in both directions:
 *   • Changing slide scrolls the highlighted item to the FRONT (left edge)
 *     of the list.
 *   • Scrolling the list by hand highlights whichever item is nearest the
 *     front, and shows its slide. The auto loop pauses while the reader
 *     scrolls and resumes data-hero-resume ms after they stop.
 * The mode is read from the list's computed style, not from a hard-coded
 * width, so moving the breakpoint in Webflow moves this behaviour with it.
 * The "front" is the list's left padding edge, or its scroll-padding-left
 * if one is set on the class — that is the knob to inset it.
 *
 * Dependency-free. No build step. Served from the project-sandbox Vercel
 * deployment and linked from the Webflow page's "Page JS" embed.
 *
 * ------------------------------------------------------------
 * DOM CONTRACT (authored in Webflow — this file creates nothing)
 * ------------------------------------------------------------
 *   [data-hero]                      root; holds the tuning attributes
 *     [data-hero-list]               the scrolling list (a <ul>)
 *       [data-hero-item]             one per collection (an <a> inside <li>)
 *            data-collection="KEY"   must match a slide's data-collection
 *     [data-hero-nav]                wrapper for the two arrow buttons
 *       [data-hero-prev]             step the highlight up
 *       [data-hero-next]             step the highlight down
 *     [data-hero-gallery]            the image stage
 *       [data-hero-slide]            one per collection + one default
 *            data-collection="KEY"   or data-collection="__default__"
 *         [data-layer="1".."5"]      the individual images, 1 = the one
 *                                    that animates FIRST (bottom left)
 *
 * State classes this file toggles (styled in hero.css / Webflow):
 *   slide   .is-active  currently shown     .is-leaving  animating out
 *           .is-retired the page-load default, once spent
 *   item    .is-active  the highlighted collection
 *   nav     .is-hidden  list fits, arrows not needed (column mode: fewer
 *                       items than data-hero-visible; row mode: the row
 *                       does not overflow its width)
 *
 * The covers start hidden, so nothing is visible until this script makes
 * a slide active. hero.css carves out the Webflow Designer canvas
 * (html.wf-design-mode), where page JavaScript never runs.
 *
 * ------------------------------------------------------------
 * TUNING (data attributes on [data-hero], all optional)
 * ------------------------------------------------------------
 *   data-hero-interval="5000"     ms each collection stays on screen
 *   data-hero-first-delay="2500"  LONGEST the default slide stays; a hover,
 *                                 focus or arrow ends it sooner
 *   data-hero-visible="4"         max list items visible before it scrolls
 *   data-hero-clear="1200"        ms to keep the outgoing slide animating;
 *                                 must be >= the longest transition in
 *                                 hero.css (duration + stagger)
 *   data-hero-resume="5000"       row mode: ms after the reader stops
 *                                 scrolling the list before the loop resumes
 *
 * ------------------------------------------------------------
 * BACKEND / INTEGRATION NOTES
 * ------------------------------------------------------------
 *   • Collections are read from the DOM at init, so the list can grow from
 *     3 to 5–6 items by adding markup only — no change here. Add a
 *     [data-hero-item] and a matching [data-hero-slide]; the arrows and
 *     the scrolling switch themselves on once the count passes
 *     data-hero-visible.
 *   • An item with no matching slide is skipped (with a console warning)
 *     rather than looping to an empty stage.
 *   • Clicks are NOT intercepted. The list items are real links, so
 *     setting their href in Webflow is all that is needed to make them
 *     navigate to each collection page.
 *   • Re-scan after injecting collections dynamically:
 *       window.filmtvHero.init()
 * ============================================================ */

(function () {
  "use strict";

  var DEFAULT_KEY = "__default__";

  var CONFIG = {
    interval: 5000,
    firstDelay: 2500,
    visible: 4,
    clear: 1200,
    resume: 5000
  };

  // How long the list must be still before a script-driven scroll counts
  // as finished. Scroll events from our own scrollTo() are ignored until
  // then, so they are never mistaken for the reader scrolling.
  var SCROLL_SETTLE = 150;

  var instances = [];

  /* ---------- small helpers ---------- */

  function num(value, fallback) {
    var n = parseInt(value, 10);
    return isNaN(n) ? fallback : n;
  }

  function readConfig(root) {
    return {
      interval: num(root.getAttribute("data-hero-interval"), CONFIG.interval),
      firstDelay: num(root.getAttribute("data-hero-first-delay"), CONFIG.firstDelay),
      visible: num(root.getAttribute("data-hero-visible"), CONFIG.visible),
      clear: num(root.getAttribute("data-hero-clear"), CONFIG.clear),
      resume: num(root.getAttribute("data-hero-resume"), CONFIG.resume)
    };
  }

  function reducedMotion() {
    return window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /* ============================================================
   * One hero instance
   * ============================================================ */

  function Hero(root) {
    this.root = root;
    this.cfg = readConfig(root);

    this.list = root.querySelector("[data-hero-list]");
    this.nav = root.querySelector("[data-hero-nav]");
    this.gallery = root.querySelector("[data-hero-gallery]");

    this.slides = {};
    this.defaultSlide = null;
    this.items = [];

    this.index = -1;          // -1 = nothing highlighted (default slide showing)
    this.current = null;      // the slide element on screen
    this.started = false;     // has the auto loop taken over from the default?
    this.paused = false;

    this.timer = null;
    this.startTimer = null;
    this.clearTimer = null;
    this.resumeTimer = null;
    this.retireTimer = null;
    this.scrollResumeTimer = null;

    this.autoScrolling = false;  // our own scrollTo() is still moving the list
    this.settleTimer = null;

    this.collect();
    this.wire();
    this.applyVisibleWindow();

    /* Let one frame paint at the resting state before the first slide
     * is made active, otherwise the browser can collapse the two states
     * into one style resolution and the opening animation is skipped. */
    var self = this;
    if (window.requestAnimationFrame) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { self.showDefault(); });
      });
    } else {
      this.showDefault();
    }
  }

  /* --- read the authored markup --------------------------- */

  Hero.prototype.collect = function () {
    var self = this;
    var slideEls = this.gallery
      ? this.gallery.querySelectorAll("[data-hero-slide]")
      : [];

    this.slides = {};
    this.defaultSlide = null;

    Array.prototype.forEach.call(slideEls, function (el) {
      var key = el.getAttribute("data-collection") || DEFAULT_KEY;
      if (key === DEFAULT_KEY) {
        self.defaultSlide = el;
      } else {
        self.slides[key] = el;
      }
    });

    // Only keep list items that actually have a slide to show.
    var itemEls = this.root.querySelectorAll("[data-hero-item]");
    this.items = Array.prototype.filter.call(itemEls, function (el) {
      var key = el.getAttribute("data-collection");
      if (key && self.slides[key]) return true;
      if (window.console && console.warn) {
        console.warn(
          "[hero] no [data-hero-slide] with data-collection=\"" + key +
          "\" — this list item will be skipped.", el
        );
      }
      return false;
    });
  };

  /* --- events --------------------------------------------- */

  Hero.prototype.wire = function () {
    var self = this;

    var prev = this.root.querySelector("[data-hero-prev]");
    var next = this.root.querySelector("[data-hero-next]");

    if (prev) {
      prev.addEventListener("click", function (e) {
        e.preventDefault();
        self.step(-1);
      });
    }
    if (next) {
      next.addEventListener("click", function (e) {
        e.preventDefault();
        self.step(1);
      });
    }

    // Hovering or keyboard-focusing the list holds the current collection,
    // so a reader is never interrupted mid-glance.
    if (this.list) {
      this.list.addEventListener("mouseenter", function () { self.hold(true); });
      this.list.addEventListener("mouseleave", function () { self.hold(false); });
      this.list.addEventListener("focusin", function () { self.hold(true); });
      this.list.addEventListener("focusout", function () { self.hold(false); });

      /* Row mode: the reader scrolling the list picks the collection.
       * Any sign of a hand on the list cancels a script scroll still in
       * flight, so the reader's own scroll is never ignored as ours. */
      var userIntent = function () { self.endAutoScroll(); };
      this.list.addEventListener("touchstart", userIntent, { passive: true });
      this.list.addEventListener("wheel", userIntent, { passive: true });
      this.list.addEventListener("pointerdown", userIntent);
      this.list.addEventListener("scroll", function () { self.onListScroll(); },
        { passive: true });
    }

    /* Pointing at a collection previews it straight away — including
     * while the page-load default is still up. Someone who reaches for
     * the list has chosen; making them wait out the default's timer
     * first would read as the hover being broken. */
    this.items.forEach(function (item, i) {
      var preview = function () {
        var first = self.takeOver();
        self.go(i);
        if (first) self.retireDefault();
      };
      item.addEventListener("mouseenter", preview);
      item.addEventListener("focus", preview);
    });

    // A backgrounded tab would otherwise queue up transitions.
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) self.stop();
      else if (self.started && !self.paused) self.start();
    });

    window.addEventListener("resize", function () {
      self.applyVisibleWindow();
      if (self.index >= 0) self.scrollIntoWindow(self.index, true);
    });
  };

  /* --- layout mode ----------------------------------------- */

  /* "row" when Webflow lays the list out horizontally (tablet and below),
   * "column" otherwise. Read from the live style on every call, so a
   * resize across the breakpoint switches behaviour with no bookkeeping. */
  Hero.prototype.isRow = function () {
    if (!this.list) return false;
    var dir = window.getComputedStyle(this.list).flexDirection || "";
    return dir.indexOf("row") === 0;
  };

  /* --- the visible window on the list ---------------------- */

  /* The list item at index i may be wrapped (an <a> inside an <li>), so
   * walk up to whichever element is the list's own child — that is the
   * thing that actually occupies a row. */
  Hero.prototype.rowFor = function (i) {
    var row = this.items[i];
    while (row && row.parentNode !== this.list) row = row.parentNode;
    return row || null;
  };

  /* A row's top and bottom measured against the list's scrollable content
   * box. Deliberately NOT offsetTop: that is measured from the nearest
   * POSITIONED ancestor, which is rarely the list itself, and the wrong
   * ancestor silently yields a too-large height and a list that never
   * scrolls. Rects are relative to the viewport, so the difference is
   * correct whatever the two elements' position values are. */
  Hero.prototype.rowBounds = function (row) {
    var listRect = this.list.getBoundingClientRect();
    var rowRect = row.getBoundingClientRect();
    var top = rowRect.top - listRect.top - this.list.clientTop + this.list.scrollTop;
    var left = rowRect.left - listRect.left - this.list.clientLeft + this.list.scrollLeft;
    return {
      top: top, bottom: top + rowRect.height,
      left: left, right: left + rowRect.width
    };
  };

  /* The list shows at most cfg.visible items and scrolls past that. The
   * height is MEASURED from the authored items rather than hard-coded, so
   * restyling the pills in Webflow keeps "exactly N visible" true. */
  Hero.prototype.applyVisibleWindow = function () {
    if (!this.list) return;

    // Row mode has no item cap — the row simply scrolls sideways — so the
    // arrows are needed only when the row is wider than the list.
    if (this.isRow()) {
      this.list.style.maxHeight = "";
      if (this.nav) {
        this.nav.classList.toggle("is-hidden",
          this.list.scrollWidth <= this.list.clientWidth + 1);
      }
      return;
    }

    var overflowing = this.items.length > this.cfg.visible;

    if (this.nav) this.nav.classList.toggle("is-hidden", !overflowing);

    if (!overflowing) {
      this.list.style.maxHeight = "";
      return;
    }

    // Measure unclipped. With the cap still applied the last visible row
    // may be scrolled out of view, which would feed the next measurement
    // its own previous result.
    var saved = this.list.scrollTop;
    this.list.style.maxHeight = "";
    this.list.scrollTop = 0;

    var row = this.rowFor(this.cfg.visible - 1);
    if (row) {
      var cs = window.getComputedStyle(this.list);
      // Webflow boxes are border-box, so the cap has to carry the list's
      // own padding and border or it would clip the last row short.
      var chrome =
        parseFloat(cs.paddingTop || 0) + parseFloat(cs.paddingBottom || 0) +
        parseFloat(cs.borderTopWidth || 0) + parseFloat(cs.borderBottomWidth || 0);

      this.list.style.maxHeight =
        Math.ceil(this.rowBounds(row).bottom + chrome) + "px";
    }

    this.list.scrollTop = saved;
  };

  /* Column mode: scroll by ONE step — only far enough to bring the target
   * into the visible window. Wrapping from the last item to the first
   * therefore scrolls the list back to the top on its own.
   * Row mode: bring the target to the FRONT of the row instead.
   * `instant` skips the smooth scroll (used on resize). */
  Hero.prototype.scrollIntoWindow = function (i, instant) {
    if (!this.list) return;
    if (this.isRow()) {
      this.scrollListTo({ left: this.frontTarget(i) }, instant);
      return;
    }
    if (this.list.scrollHeight <= this.list.clientHeight) return;

    var row = this.rowFor(i);
    if (!row) return;

    var bounds = this.rowBounds(row);
    var top = bounds.top;
    var bottom = bounds.bottom;
    var viewTop = this.list.scrollTop;
    var viewBottom = viewTop + this.list.clientHeight;
    var target = null;

    if (bottom > viewBottom) target = bottom - this.list.clientHeight;
    else if (top < viewTop) target = top;

    if (target === null) return;

    this.scrollListTo({ top: target }, instant);
  };

  /* Every script-driven scroll of the list goes through here, flagged so
   * onListScroll() can tell it apart from the reader's own scrolling. */
  Hero.prototype.scrollListTo = function (pos, instant) {
    var list = this.list;
    var axis = pos.left !== undefined ? "scrollLeft" : "scrollTop";
    var value = pos.left !== undefined ? pos.left : pos.top;

    if (Math.abs(list[axis] - value) < 1) return;   // already there

    this.autoScrolling = true;
    this.armSettle();

    if (list.scrollTo) {
      pos.behavior = instant || reducedMotion() ? "auto" : "smooth";
      list.scrollTo(pos);
    } else {
      list[axis] = value;
    }
  };

  /* The script scroll counts as finished once the list has been still for
   * SCROLL_SETTLE ms. Each scroll event re-arms this, so a long smooth
   * scroll stays flagged for its whole run. Armed up front too, in case
   * no scroll event fires at all. */
  Hero.prototype.armSettle = function () {
    var self = this;
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(function () {
      self.settleTimer = null;
      self.autoScrolling = false;
    }, SCROLL_SETTLE);
  };

  Hero.prototype.endAutoScroll = function () {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    this.autoScrolling = false;
  };

  /* --- row mode: scroll position <-> highlighted item ------ */

  /* Where the row's "front" sits, measured in from the list's left edge:
   * scroll-padding-left when the class sets one, else the list's own
   * left padding (so item 1 at rest already counts as "at the front"). */
  Hero.prototype.frontOffset = function () {
    var cs = window.getComputedStyle(this.list);
    var sp = parseFloat(cs.scrollPaddingLeft);
    return isNaN(sp) || sp === 0 ? parseFloat(cs.paddingLeft) || 0 : sp;
  };

  /* The scrollLeft that puts item i at the front — clamped, because the
   * last few items can never travel all the way to the left edge. */
  Hero.prototype.frontTarget = function (i) {
    var row = this.rowFor(i);
    if (!row) return 0;
    var max = this.list.scrollWidth - this.list.clientWidth;
    var target = this.rowBounds(row).left - this.frontOffset();
    return Math.max(0, Math.min(max, Math.round(target)));
  };

  /* The item the reader has scrolled to: the one whose front position is
   * nearest the current scroll. Comparing CLAMPED targets (not raw left
   * edges) keeps this in agreement with frontTarget(), so an item the
   * script scrolled to is always the item read back. Where several items
   * share the end position, the current highlight wins if it is one of
   * them; otherwise the first does. */
  Hero.prototype.nearestToFront = function () {
    var scroll = this.list.scrollLeft;
    var best = -1;
    var bestDist = Infinity;
    for (var i = 0; i < this.items.length; i++) {
      var dist = Math.abs(this.frontTarget(i) - scroll);
      if (dist < bestDist - 0.5 ||
          (Math.abs(dist - bestDist) <= 0.5 && i === this.index)) {
        best = i;
        bestDist = dist;
      }
    }
    return best;
  };

  /* The reader scrolled the list by hand (row mode only). Highlight what
   * is at the front, pause the loop, and resume once they have stopped. */
  Hero.prototype.onListScroll = function () {
    var self = this;

    if (this.autoScrolling) {
      this.armSettle();
      return;
    }
    if (!this.isRow() || !this.items.length) return;

    var first = this.takeOver();
    this.stop();

    var i = this.nearestToFront();
    if (i >= 0) this.go(i, true);
    if (first) this.retireDefault();

    if (this.scrollResumeTimer) clearTimeout(this.scrollResumeTimer);
    this.scrollResumeTimer = setTimeout(function () {
      self.scrollResumeTimer = null;
      if (!self.paused) self.start();
    }, this.cfg.resume);
  };

  /* --- slide swapping -------------------------------------- */

  Hero.prototype.showSlide = function (slide) {
    var self = this;
    var outgoing = this.current;

    if (outgoing === slide) return;

    if (outgoing) {
      outgoing.classList.remove("is-active");
      outgoing.classList.add("is-leaving");
    }

    if (slide) {
      slide.classList.remove("is-leaving");
      slide.classList.add("is-active");
    }

    this.current = slide || null;

    // Park the outgoing slide back at its start position once it has
    // finished animating out, ready to be shown again later.
    if (this.clearTimer) clearTimeout(this.clearTimer);
    if (outgoing) {
      this.clearTimer = setTimeout(function () {
        outgoing.classList.remove("is-leaving");
        self.clearTimer = null;
      }, this.cfg.clear);
    }
  };

  Hero.prototype.showDefault = function () {
    var self = this;

    if (this.defaultSlide) this.showSlide(this.defaultSlide);

    this.items.forEach(function (item) {
      item.classList.remove("is-active");
      item.removeAttribute("aria-current");
    });

    if (!this.items.length) return;

    // Hand over to the auto loop; the default slide is retired for good.
    this.startTimer = setTimeout(function () {
      self.startTimer = null;
      self.takeOver();
      self.go(0);
      self.retireDefault();
      self.start();
    }, this.defaultSlide ? this.cfg.firstDelay : 0);
  };

  /* Cut the page-load default short. It only stands for "no collection
   * chosen yet", so any deliberate interaction — a hover, a focus, an
   * arrow — ends it rather than waiting out data-hero-first-delay.
   * Returns true only for the interaction that actually did it, so the
   * caller knows whether to start the default slide retiring. */
  Hero.prototype.takeOver = function () {
    if (this.started) return false;
    if (this.startTimer) clearTimeout(this.startTimer);
    this.startTimer = null;
    this.started = true;
    return true;
  };

  /* The page-load default is spent once the loop takes over — but the
   * marking has to WAIT for its exit animation. `.is-retired` sets
   * visibility:hidden, and setting it in the same breath as the handover
   * cut the slide's drift-out off before it could play: the covers just
   * vanished. Call this AFTER go(), never before. */
  Hero.prototype.retireDefault = function () {
    var self = this;
    var slide = this.defaultSlide;
    if (!slide) return;

    if (this.retireTimer) clearTimeout(this.retireTimer);
    this.retireTimer = setTimeout(function () {
      slide.classList.add("is-retired");
      self.retireTimer = null;
    }, this.cfg.clear);
  };

  /* --- highlighting ---------------------------------------- */

  /* Highlight item i and show its slide. `noScroll` leaves the list where
   * it is — used when the reader's own scroll picked the item, so the
   * script never drags the list out from under their finger. */
  Hero.prototype.go = function (i, noScroll) {
    if (!this.items.length) return;

    var n = this.items.length;
    i = ((i % n) + n) % n;

    if (i === this.index) return;
    this.index = i;

    this.items.forEach(function (item, j) {
      var on = j === i;
      item.classList.toggle("is-active", on);
      if (on) item.setAttribute("aria-current", "true");
      else item.removeAttribute("aria-current");
    });

    var key = this.items[i].getAttribute("data-collection");
    this.showSlide(this.slides[key] || null);
    if (!noScroll) this.scrollIntoWindow(i);
  };

  /* An arrow press. Steps the highlight and restarts the countdown, so the
   * auto loop never yanks the view away the instant someone clicks. */
  Hero.prototype.step = function (delta) {
    if (!this.items.length) return;

    // An arrow press before the loop has started skips the default slide.
    if (this.takeOver()) {
      this.go(delta > 0 ? 0 : this.items.length - 1);
      this.retireDefault();
    } else {
      this.go(this.index + delta);
    }

    this.stop();
    this.start();
  };

  /* --- the timer ------------------------------------------- */

  Hero.prototype.start = function () {
    var self = this;
    if (this.timer || !this.items.length || this.items.length < 2) return;
    this.timer = setInterval(function () {
      self.go(self.index + 1);
    }, this.cfg.interval);
  };

  Hero.prototype.stop = function () {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  };

  Hero.prototype.hold = function (on) {
    var self = this;
    this.paused = on;
    if (this.resumeTimer) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }
    if (on) {
      this.stop();
    } else if (this.started) {
      // A short grace period stops a mouse skimming across the list from
      // firing a swap the moment it leaves.
      this.resumeTimer = setTimeout(function () {
        self.resumeTimer = null;
        if (!self.paused) self.start();
      }, 400);
    }
  };

  Hero.prototype.destroy = function () {
    this.stop();
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.clearTimer) clearTimeout(this.clearTimer);
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    if (this.retireTimer) clearTimeout(this.retireTimer);
    if (this.scrollResumeTimer) clearTimeout(this.scrollResumeTimer);
    if (this.settleTimer) clearTimeout(this.settleTimer);
  };

  /* ============================================================
   * boot
   * ============================================================ */

  function init() {
    instances.forEach(function (h) { h.destroy(); });
    instances = [];

    var roots = document.querySelectorAll("[data-hero]");
    Array.prototype.forEach.call(roots, function (root) {
      if (!root.querySelector("[data-hero-gallery]")) return;
      instances.push(new Hero(root));
    });

    return instances.length;
  }

  window.filmtvHero = {
    init: init,
    instances: function () { return instances.slice(); }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init(); });
  } else {
    init();
  }
})();
