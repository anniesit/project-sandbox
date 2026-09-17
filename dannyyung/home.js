/* ============================================================
 * home.js — Danny Yung archive HOME PAGE, 精選檔案 / Highlights
 *
 * Picks N works at random from a hand-curated shortlist and renders them into
 * the three highlight cards. A fresh trio on every page load, and another one
 * every time the reader presses the shuffle button.
 *
 * Ownership split (same shape as catalogue.js):
 *   - home.js (this file) owns the VISUAL: cloning the Webflow card template,
 *     filling its text sinks, pointing the cover link and the thumbnail.
 *   - The SHORTLIST is editorial, so it lives in CONFIG below — not in the
 *     data layer. The backend never chooses which works are highlighted.
 *   - The DATA comes from the catalogue feed, so a highlighted work's title,
 *     category, year, location and director are never re-typed by hand.
 *
 * ------------------------------------------------------------
 *  >>> EDIT THE SHORTLIST IN THE `CONFIG` BLOCK BELOW. <<<
 *  Nothing else in this file needs touching to change what is highlighted.
 * ------------------------------------------------------------
 *
 * data-* contract (authored in Webflow; changing these breaks the section):
 *   [data-home-highlights]     the root. It is the .home-card-wrap div, and
 *                              everything is queried inside it.
 *     data-src                 ABSOLUTE URL of the catalogue JSON. Required —
 *                              a relative path would resolve against the PAGE,
 *                              and /en/home would ask for /en/sample-data/…
 *                              (same rule as every other page on this site).
 *     data-img-base            OPTIONAL. Folder the thumbnails live in, with a
 *                              trailing slash. Overrides CONFIG.IMG_BASE — use
 *                              it if one page ever needs a different folder.
 *   [data-card-template]       the .home-card that is cloned per work. It is
 *                              authored and STYLED in Webflow, stays visible on
 *                              the canvas, and is lifted out of the DOM on the
 *                              first render. Any other .home-card sitting next
 *                              to it is a no-JS fallback and is removed at the
 *                              same moment.
 *   [data-field=title|category|year|location|director]   text sinks: a SPAN or
 *                              a heading, never a <p>. `title` has TWO sinks
 *                              and both are written — the visible <h3>, and
 *                              the .u-sr-only text inside the cover link that
 *                              gives that link its accessible name.
 *   [data-field-group=category|location|director]        the fragment removed
 *                              from the clone when that field is empty (the
 *                              chip, the "/" + location, the whole 導演： line)
 *   [data-field-link]          the a.u-link-cover stretched over the card. Its
 *                              href is THE card's destination and the only one.
 *   [data-field-img]           the <img>. Gets src + alt. If the file 404s it
 *                              is removed, and the .u-img-cover placeholder
 *                              already sitting behind it shows through.
 *   [data-home-random]         the shuffle button. Optional — without it the
 *                              section still randomises on load, it just can
 *                              not be reshuffled. The attribute may sit on the
 *                              .button wrapper or on anything inside it.
 *
 * Dependency-free, multi-instance safe, writes no inline element styles.
 * ============================================================ */
(function () {
  "use strict";

  var SELF =
    (document.currentScript && document.currentScript.src) ||
    (function () {
      var s = document.querySelector('script[src*="home.js"]');
      return s ? s.src : window.location.href;
    })();

  /* ============================================================
   * CONFIG — the only block you edit
   * ============================================================ */

  /* >>> THE SHORTLIST <<<
     Entry ids from the catalogue, exactly as they appear in the `id` column.
     Add as many as you like; N of them are drawn at random per load.

     An id that is not in the catalogue feed is skipped and logged to the
     console — a typo costs you a card, not the page.

     Seeded with the three works that were placed statically in Webflow:       */
  var HIGHLIGHT_IDS = [
    "DYP-000024", // 錄影窗 / Video Window (1987)
    "DYP-000027", // 拾日譚 / Decameron (1988, 台北)
    "DYP-000087", // 佛洛伊德尋找中國情與事 (東京) / …in Search of… (Tokyo) (2003)
  ];

  /* How many cards to show. The Webflow grid is built for 3. */
  var PICK = 3;

  /* >>> THUMBNAILS <<<
     One file per entry id, named after the id: DYP-000024.webp

     The default resolves against THIS SCRIPT's own URL, so it works unchanged
     on the Webflow site, on the Vercel sandbox and in the local harness — the
     script and the images travel together.

     AT CODE EXPORT: change this one line to the site-absolute folder

         var IMG_BASE = "/images/home-highlights/";

     …or set data-img-base on [data-home-highlights] in Webflow, which wins. */
  var IMG_BASE = new URL("./images/home-highlights/", SELF).href;
  var IMG_EXT = ".webp";

  /* ============================================================
   * Nothing below here needs editing to change what is highlighted.
   * ============================================================ */

  /* `lang` is read from the nearest [lang] ancestor, so the same file serves
     / and /en/home with no configuration: the folder-duplicated English page
     carries lang="en" and this follows it. Same switch catalogue.js and
     entry.js use. */
  function lang(root) {
    var el = (root.closest && root.closest("[lang]")) || document.documentElement;
    return (el.getAttribute("lang") || "zh-Hant").toLowerCase().indexOf("en") === 0
      ? "en"
      : "zh";
  }

  function noTitle(root) {
    return lang(root) === "en" ? "Untitled" : "無標題";
  }

  /* The director list is joined with the separator its own script expects.
     Chinese uses the enumeration comma; English a plain comma. */
  function joinNames(root, names) {
    return (names || []).join(lang(root) === "en" ? ", " : "、");
  }

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  /* ---------- the card template ---------- */

  /* The card is authored in Webflow and stays VISIBLE on the canvas so it can
     be styled. On the first render it is lifted out of the DOM, and the other
     static cards beside it — the no-JS fallback — go with it. */
  function template(root) {
    if (root.__tpl) return root.__tpl;
    var el = root.querySelector("[data-card-template]");
    if (!el) return null;
    var clone = el.cloneNode(true);
    clone.removeAttribute("data-card-template");
    root.__tpl = clone;
    root.innerHTML = "";
    return clone;
  }

  /* A missing value drops the whole fragment that carries it, rather than
     printing an em dash: "2004 / —" and a bare "導演：" both read as data
     errors. Any element marked [data-field-group="<name>"] is removed from the
     clone when that field is empty; the "/" separator sits inside the location
     group, so it goes with it. Fields with no group (title, year) still fall
     back to an em dash, since dropping them would leave the card headless. */
  function setField(card, name, value) {
    var text = value == null || value === "" ? "" : String(value);
    if (text === "") {
      var groups = card.querySelectorAll('[data-field-group="' + name + '"]');
      for (var g = 0; g < groups.length; g++) {
        if (groups[g].parentNode) groups[g].parentNode.removeChild(groups[g]);
      }
    }
    var els = card.querySelectorAll('[data-field="' + name + '"]');
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = text === "" ? "—" : text;
    }
  }

  function imgBase(root) {
    var attr = root.getAttribute("data-img-base");
    return attr ? attr : IMG_BASE;
  }

  function buildCard(root, tpl, item) {
    var card = tpl.cloneNode(true);
    var title = item.title || item.titleEn || noTitle(root);

    card.setAttribute("data-id", item.id || "");
    setField(card, "title", title);
    setField(card, "category", item.category);
    setField(card, "year", item.year);
    setField(card, "location", item.location);
    setField(card, "director", joinNames(root, item.directors));

    var link = card.querySelector("[data-field-link]");
    if (link) {
      link.setAttribute("href", item.href || "#");
      /* The visible title is inside the card, not inside the link, so the link
         needs its own accessible name. The .u-sr-only sink carries it when the
         template has one; aria-label is the fallback for the bare <a>. */
      if (!link.querySelector('[data-field="title"]')) {
        link.setAttribute("aria-label", title);
      }
    }

    var img = card.querySelector("[data-field-img]");
    if (img) {
      /* alt="" on purpose: the thumbnail is decorative here. The card already
         states the title in a heading, and the cover link is named after it,
         so alt text would make a screen reader say the title three times. */
      img.setAttribute("alt", "");
      img.setAttribute("loading", "lazy");
      img.setAttribute("decoding", "async");
      img.removeAttribute("srcset");
      img.removeAttribute("sizes");
      img.onerror = function () {
        /* No thumbnail yet, or a typo in the filename. Drop the <img> and let
           the .u-img-cover placeholder behind it show, rather than leaving a
           broken-image icon in the layout. */
        if (img.parentNode) img.parentNode.removeChild(img);
      };
      img.setAttribute("src", imgBase(root) + encodeURIComponent(item.id) + IMG_EXT);
    }

    return card;
  }

  /* ---------- picking ---------- */

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  /* Draw PICK ids at random. Pressing shuffle and getting the same three back
     reads as a broken button, so when the shortlist is long enough to offer an
     alternative the draw is retried a few times until it differs from the one
     on screen. With a shortlist of exactly PICK there is no alternative, and
     the retry gives up quietly. */
  function pick(ids, previous) {
    var n = Math.min(PICK, ids.length);
    var chosen = shuffle(ids).slice(0, n);
    if (!previous || ids.length <= n) return chosen;
    for (var tries = 0; tries < 8 && sameSet(chosen, previous); tries++) {
      chosen = shuffle(ids).slice(0, n);
    }
    return chosen;
  }

  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) === -1) return false;
    return true;
  }

  /* ---------- rendering ---------- */

  function render(root, byId, ids) {
    var tpl = template(root);
    if (!tpl) return;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < ids.length; i++) {
      frag.appendChild(buildCard(root, tpl, byId[ids[i]]));
    }
    root.innerHTML = "";
    root.appendChild(frag);
  }

  function init(root) {
    var url = root.getAttribute("data-src");
    if (!url) {
      console.error("[home] [data-home-highlights] has no data-src");
      return;
    }

    fetch(url, { credentials: "omit" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        var all = (data && data.items) || [];
        var byId = {};
        for (var i = 0; i < all.length; i++) byId[all[i].id] = all[i];

        var ids = [];
        var missing = [];
        for (var k = 0; k < HIGHLIGHT_IDS.length; k++) {
          if (byId[HIGHLIGHT_IDS[k]]) ids.push(HIGHLIGHT_IDS[k]);
          else missing.push(HIGHLIGHT_IDS[k]);
        }
        if (missing.length) {
          console.warn(
            "[home] highlight ids not found in " + url + ": " + missing.join(", ")
          );
        }
        /* Nothing to show. The static cards are still in the DOM at this point
           — template() has not run — so leaving them alone is the best of the
           bad outcomes: the section looks authored rather than empty. */
        if (!ids.length) {
          console.error("[home] no highlight ids matched the data; cards left as authored");
          return;
        }

        var current = pick(ids, null);
        render(root, byId, current);

        /* The button lives outside the card wrap (it is a sibling, up in
           .home-highlight-content), so the search starts at the section and
           only falls back to the document. */
        var scope = (root.closest && root.closest(".home-highlight")) || document;
        var btn = scope.querySelector("[data-home-random]") ||
                  document.querySelector("[data-home-random]");
        if (!btn) return;
        /* The attribute may be on the .button wrapper or on something inside
           it, and the Webflow button wraps a stretched <a>. Listening on the
           whole thing catches the click wherever it lands. */
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          current = pick(ids, current);
          render(root, byId, current);
        });
      })
      .catch(function (err) {
        console.error("[home] highlight load failed (" + url + "):", err);
      });
  }

  ready(function () {
    var roots = document.querySelectorAll("[data-home-highlights]");
    for (var i = 0; i < roots.length; i++) init(roots[i]);
  });
})();
