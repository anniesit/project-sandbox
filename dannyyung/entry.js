/* ============================================================
 * entry.js — Danny Yung archive ENTRY page (作品頁) renderer
 *
 * Same ownership split as catalogue.js:
 *   - entry.js (this file) owns the VISUAL: filling the production info,
 *     building the archival-material groups and thumbnails, and swapping the
 *     viewer between an image, a PDF and a video when a thumbnail is chosen.
 *   - The backend integration owns the STATE: which record this page is, and
 *     where the media files live. It calls render() once with the record.
 *
 * Integration API (global):
 *   window.dyEntry.render(rootEl, record, context)
 *     rootEl  : the [data-entry] element (or omit to render all instances)
 *     record  : one item from entry-sample.json (shape below)
 *     context : { backHref, categoryHref, prev, next } — where 返回 and the
 *               breadcrumb's category crumb go, and the neighbours
 *               in the result set the user was browsing. Optional; without it
 *               the two arrows hide and 返回 keeps its authored href.
 *   window.dyEntry.select(rootEl, materialId)   open a material by id
 *
 * Events (bubbling, on the [data-entry] root):
 *   "dy:material"  detail = { id, groupKey, viewer, filename }
 *     Fired when the viewer changes material. Useful for analytics or for a
 *     backend that wants to lazily sign a media URL.
 *
 * Record shape (see sample-data/entry-sample.json, which IS the contract):
 *   {
 *     "id": "DYP-000012",
 *     "title": "大路",              // resolved — see the language note below
 *     "titleEn": "The Road",
 *     "category": "劇場",
 *     "categoryKey": "theatre-production",
 *     "year": 1981,
 *     "date": "1981-11-11",         // language-NEUTRAL: 1981 | 1981-11 |
 *                                   // 1981-11-11. This file formats it.
 *     "location": "香港",
 *     "venue": "香港大會堂展覽廳",
 *     "directors": ["榮念曾"],
 *     "notes": "Date: …\nStage Manager: …",   // free text, MULTI-LINE
 *     "mediaCount": 14,
 *     "materialGroups": [ { "key": "performance-photo", "label": "演出照片",
 *                           "items": [ material, … ] }, … ]
 *   }
 *
 *   material = {
 *     "id": "10012", "order": 1,
 *     "groupKey": "performance-photo", "group": "演出照片",
 *     "contentType": "Photograph",     // DISPLAYED. Does not pick the viewer.
 *     "title": "", "author": "", "publisher": "",
 *     "publishedDate": "1981", "issue": "", "pageNumber": "",
 *     "filename": "The Road_001.jpg",
 *     "viewer": "image" | "pdf" | "video",   // derived from the EXTENSION
 *     "src": ""                        // empty until the library uploads
 *   }
 *
 * WHY `viewer` AND NOT `contentType`. The client's `media_content_type_en`
 * says "Digital Document" for scanned house-programme pages that are really
 * .jpg files — 14 of its 37 "Digital Document" rows are images. Choosing the
 * element from it would wrap a PDF viewer around a photograph. The data layer
 * derives `viewer` from the file extension; this file switches on that field
 * and never inspects contentType. If a new file type appears, add it there,
 * not here.
 *
 * NO FILES EXIST YET. Every material has an empty `src` (all storage URLs
 * 404ed on 2026-09-01), so the viewer shows its placeholder and the thumbnails
 * show a labelled box. The three real elements — <img>, <iframe>, <video
 * controls> — are already in the markup and already selected correctly per
 * material, so filling `src` in the data is the only step to going live.
 *
 * LANGUAGE FALLBACK IS THE DATA LAYER'S JOB, NOT THIS FILE'S — same rule as
 * catalogue.js. Strings arrive already resolved (preferred language, else the
 * other one). This file only formats the date, which is language-neutral in
 * the data on purpose.
 *
 * data-* contract (authored in Webflow; changing these breaks the page):
 *   [data-entry]                      the root; everything is queried inside it
 *   [data-entry-id]                   optional; the record id, so the mock
 *                                     driver can pick without a query string
 *   [data-field=…]                    text sinks, always a SPAN or DIV,
 *                                     never a <p> — see CATALOGUE.md
 *   [data-field-group=…]              the fragment removed when that field is
 *                                     empty (same convention as the catalogue)
 *   [data-groups] / [data-group-template] / [data-group-items]
 *                                     the left column: one block per content
 *                                     category, thumbnails nested inside
 *   [data-thumb-template]             a <button> cloned per material
 *   [data-viewer]                     wraps the four viewer states
 *   [data-viewer=image|pdf|video|empty]   exactly one is shown at a time
 *   [data-material]                   the metadata panel under the viewer
 *   [data-back]                       the 返回 link; href is set from context
 *   [data-crumb-category]             the breadcrumb's category link; href is
 *                                     set from context.categoryHref
 *   [data-prev] / [data-next]         the neighbour links; hidden when there is
 *                                     no neighbour
 *   [data-field=prevTitle|nextTitle]  the neighbour's title inside each link
 *
 * Dependency-free, multi-instance safe, writes no inline element styles.
 * ============================================================ */
(function () {
  "use strict";

  var SELF =
    (document.currentScript && document.currentScript.src) ||
    (function () {
      var s = document.querySelector('script[src*="entry.js"]');
      return s ? s.src : window.location.href;
    })();

  /* >>> MOCK DATA URL <<< the backend replaces this (or removes the mock
     driver at the bottom of this file entirely and calls render() directly). */
  var DATA_URL = new URL("./sample-data/entry-sample.json", SELF).href;

  /* >>> MOCK PATHS <<< only the mock driver's fallbacks use these — when there
     is no stored catalogue context to take the real URLs from. */
  var CATALOGUE_PATH = "/catalogue";
  var ENTRY_PATH = "/entry";

  /* ---------- small helpers ---------- */

  function $(root, sel) {
    return root.querySelector(sel);
  }
  function all(root, sel) {
    return Array.prototype.slice.call(root.querySelectorAll(sel));
  }

  /* Text sinks + the empty-fragment rule, identical to catalogue.js so the two
     pages behave the same way in front of missing data. A field with a group
     disappears entirely rather than printing an em dash. */
  function setField(scope, name, value) {
    var text = value == null || value === "" ? "" : String(value);
    if (text === "") {
      all(scope, '[data-field-group="' + name + '"]').forEach(function (g) {
        if (g.parentNode) g.parentNode.removeChild(g);
      });
    }
    all(scope, '[data-field="' + name + '"]').forEach(function (el) {
      el.textContent = text === "" ? "—" : text;
    });
  }

  var MONTHS_ZH = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

  /* The data carries 1981 / 1981-11 / 1981-11-11 and this decides how to say
     it. Chinese is the primary language; the English page passes lang="en".
     Precision is preserved — a year-only date must not become "1981年1月". */
  function formatDate(value, lang) {
    var s = value == null ? "" : String(value).trim();
    if (!s) return "";
    var p = s.split("-");
    var y = p[0], m = p[1] ? parseInt(p[1], 10) : null, d = p[2] ? parseInt(p[2], 10) : null;
    if (lang === "en") {
      var EN = ["January","February","March","April","May","June","July",
                "August","September","October","November","December"];
      if (!m) return y;
      if (!d) return EN[m - 1] + " " + y;
      return EN[m - 1] + " " + d + ", " + y;
    }
    if (!m) return y + "年";
    if (!d) return y + "年" + MONTHS_ZH[m - 1];
    return y + "年" + MONTHS_ZH[m - 1] + d + "日";
  }

  function lang(root) {
    var el = root.closest("[lang]") || document.documentElement;
    return (el.getAttribute("lang") || "zh-Hant").toLowerCase().indexOf("en") === 0
      ? "en"
      : "zh";
  }

  /* Templates are authored in Webflow and stay VISIBLE on the canvas so they
     can be styled. Each is lifted out of the DOM on first render. */
  function template(root, key, sel) {
    root.__tpl = root.__tpl || {};
    if (root.__tpl[key]) return root.__tpl[key];
    var el = $(root, sel);
    if (!el) return null;
    var clone = el.cloneNode(true);
    clone.removeAttribute(sel.replace(/[\[\]]/g, ""));
    el.parentNode.removeChild(el);
    root.__tpl[key] = clone;
    return clone;
  }

  function removeClones(parent) {
    all(parent, "[data-clone]").forEach(function (n) {
      n.parentNode.removeChild(n);
    });
  }

  /* ---------- rendering ---------- */

  function render(root, record, context) {
    if (!root) {
      all(document, "[data-entry]").forEach(function (r) { render(r, record, context); });
      return;
    }
    if (!record) return;
    root.__record = record;
    var L = lang(root);

    setField(root, "title", record.title || record.titleEn || "無標題");
    setField(root, "titleEn", record.titleEn);
    setField(root, "category", record.category);
    setField(root, "date", formatDate(record.date, L));
    setField(root, "venue", record.venue);
    setField(root, "location", record.location);
    setField(root, "director", (record.directors || []).join("、"));
    setField(root, "notes", record.notes);
    setField(root, "mediaCount", record.mediaCount);

    /* The breadcrumb's middle crumb links to the catalogue filtered to this
       category — "all 劇場 works", a fresh view. It deliberately carries only
       the category and none of the user's other filters or their page: it is a
       position in the hierarchy, not a return to what they were doing. 返回 is
       the control that does that.

       The URL comes from `context`, not from this file. Routing is the
       backend's, same as prev/next and for the same reason.

       The six records with no category get no crumb at all: the anchor and the
       separator after it both carry data-field-group="category", so setField
       above has already removed them, and the breadcrumb reads 目錄 / 標題. */
    var crumb = $(root, "[data-crumb-category]");
    if (crumb && context && context.categoryHref) {
      crumb.setAttribute("href", context.categoryHref);
    }

    renderNav(root, context);
    buildGroups(root, record.materialGroups || []);

    /* Open the first material so the viewer is never empty on load. */
    var first = firstMaterial(record);
    if (first) select(root, first.id);
    else showViewer(root, "empty");

    return root;
  }

  /* ---------- back / previous / next ----------
   *
   * This file does NOT work out what the neighbours are. It is handed them:
   *
   *   context = {
   *     backHref: "/catalogue?category=…&sort=…&page=3",
   *     prev: { id, title, href } | null,
   *     next: { id, title, href } | null
   *   }
   *
   * WHY NOT COMPUTE THEM HERE. "Previous" only means something relative to a
   * result set. The user arrived from a catalogue that was filtered and sorted
   * some way, and the neighbour they expect is the neighbour in THAT list —
   * not the record with the adjacent id, which would be an unrelated work from
   * a different decade. Whoever owns the query owns the answer: the mock driver
   * below reads it from the catalogue's handoff, and the backend will answer it
   * from the server. Same seam as everything else on these two pages.
   *
   * Absent neighbours are hidden rather than disabled — a dead control at the
   * first and last record is noise. `.entry-nav-next` carries `margin-left:auto`
   * so 下一項 stays hard right even when 上一項 is gone.
   */
  function renderNav(root, context) {
    context = context || {};
    var back = $(root, "[data-back]");
    if (back && context.backHref) back.setAttribute("href", context.backHref);

    ["prev", "next"].forEach(function (which) {
      var el = $(root, "[data-" + which + "]");
      if (!el) return;
      var item = context[which];
      if (!item || !item.href) {
        el.hidden = true;
        el.removeAttribute("href");
        return;
      }
      el.hidden = false;
      el.setAttribute("href", item.href);
      setField(el, which + "Title", item.title || "");
    });
  }

  function firstMaterial(record) {
    var groups = record.materialGroups || [];
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].items && groups[i].items.length) return groups[i].items[0];
    }
    return null;
  }

  function buildGroups(root, groups) {
    var host = $(root, "[data-groups]");
    /* The thumb template is authored INSIDE the group template, so it has to be
       lifted out first — taking the group out first removes the thumb with it
       and template() then finds nothing. The group clone is meant to be empty
       anyway; thumbs are appended into [data-group-items]. */
    var thumbTpl = template(root, "thumb", "[data-thumb-template]");
    var groupTpl = template(root, "group", "[data-group-template]");
    if (!host || !groupTpl || !thumbTpl) return;

    removeClones(host);
    groups.forEach(function (g) {
      var node = groupTpl.cloneNode(true);
      node.setAttribute("data-clone", "");
      node.setAttribute("data-group-key", g.key || "");
      setField(node, "groupLabel", g.label);
      setField(node, "groupCount", (g.items || []).length);

      var items = $(node, "[data-group-items]");
      if (items) {
        removeClones(items);
        (g.items || []).forEach(function (m) {
          items.appendChild(buildThumb(thumbTpl, m));
        });
      }
      host.appendChild(node);
    });
  }

  /* The template is the <li>, not the button inside it. Cloning the button
     alone leaves the authored <li> behind, holding the first grid cell empty. */
  function buildThumb(tpl, m) {
    var li = tpl.cloneNode(true);
    li.setAttribute("data-clone", "");
    var b = $(li, "button") || li;
    b.setAttribute("data-material-id", m.id);
    b.setAttribute("data-viewer-kind", m.viewer || "");
    /* The button's accessible name is the material's own title when it has
       one, and its filename otherwise — never a bare "thumbnail". */
    setField(b, "thumbLabel", m.title || m.filename);
    var img = $(b, "[data-thumb-image]");
    if (img) {
      if (m.src && m.viewer === "image") {
        img.setAttribute("src", m.src);
        img.setAttribute("alt", m.title || m.filename || "");
        img.hidden = false;
      } else {
        /* No file yet, or not an image: the labelled box stands in. Removing
           the <img> rather than leaving it src-less avoids a broken-image
           icon in every thumbnail. */
        img.parentNode.removeChild(img);
      }
    }
    return li;
  }

  /* ---------- the viewer ---------- */

  function select(root, materialId) {
    var record = root.__record;
    if (!record) return;
    var m = findMaterial(record, materialId);
    if (!m) return;
    root.__material = m;

    all(root, "[data-material-id]").forEach(function (b) {
      var on = b.getAttribute("data-material-id") === String(materialId);
      b.setAttribute("aria-current", on ? "true" : "false");
      b.classList.toggle("cc-active", on);
    });

    /* One of the four viewer states is shown; the other three are hidden but
       stay in the DOM, so no markup is rebuilt when the user picks another
       material. Only the chosen element gets a src — a hidden <video> with a
       src would still download. */
    var kind = m.src ? (m.viewer || "empty") : "empty";
    showViewer(root, kind);

    var img = $(root, '[data-viewer="image"] img');
    var frame = $(root, '[data-viewer="pdf"] iframe');
    var video = $(root, '[data-viewer="video"] video');

    if (img) {
      if (kind === "image") {
        img.setAttribute("src", m.src);
        img.setAttribute("alt", m.title || m.filename || "");
      } else {
        img.removeAttribute("src");
      }
    }
    if (frame) {
      if (kind === "pdf") frame.setAttribute("src", m.src);
      else frame.removeAttribute("src");
    }
    if (video) {
      if (kind === "video") {
        video.setAttribute("src", m.src);
      } else {
        video.pause && video.pause();
        video.removeAttribute("src");
        video.load && video.load();
      }
    }

    /* The placeholder says which kind of file WOULD open here, so a reviewer
       can tell an unbuilt PDF viewer from an unbuilt video player. */
    setField(root, "viewerKind", m.viewer);
    setField(root, "viewerFilename", m.filename);

    fillMaterialMeta(root, m);

    root.dispatchEvent(new CustomEvent("dy:material", {
      bubbles: true,
      detail: { id: m.id, groupKey: m.groupKey, viewer: m.viewer, filename: m.filename },
    }));
  }

  function fillMaterialMeta(root, m) {
    var panel = $(root, "[data-material]");
    if (!panel) return;
    /* The metadata panel is rebuilt from its own template each time, because
       setField REMOVES the fragments of empty fields — after one material with
       no author, the author row would be gone for every later material too. */
    var tpl = template(root, "material", "[data-material-template]");
    if (tpl) {
      var fresh = tpl.cloneNode(true);
      fresh.setAttribute("data-clone", "");
      panel.innerHTML = "";
      panel.appendChild(fresh);
    }
    var L = lang(root);
    setField(panel, "materialGroup", m.group);
    /* materialType and materialFilename have no sink on the page any more —
       both rows were removed by hand on 2026-09-01. The calls stay because
       setField on a missing sink is a no-op, and re-adding either row in
       Webflow makes it fill again with no JS change. The data still carries
       both fields; the page just does not show them. */
    setField(panel, "materialType", m.contentType);
    setField(panel, "materialTitle", m.title);
    setField(panel, "materialAuthor", m.author);
    setField(panel, "materialPublisher", m.publisher);
    setField(panel, "materialPublished", formatDate(m.publishedDate, L));
    setField(panel, "materialIssue", m.issue);
    setField(panel, "materialPage", m.pageNumber);
    setField(panel, "materialFilename", m.filename);
  }

  /* NOTE FOR THE PAGE'S CSS: the `hidden` attribute is only `display: none` in
     the UA stylesheet, so ANY class on these elements that sets a display
     (`display: flex` on the viewer stage, say) outranks it and all four states
     render at once. The page needs a `[hidden] { display: none !important }`
     rule — it is in the project override block in Webflow, and in the harness
     stylesheet here. Toggling a class instead would hide the state from
     assistive tech, which `hidden` does correctly. */
  function showViewer(root, kind) {
    all(root, "[data-viewer]").forEach(function (v) {
      v.hidden = v.getAttribute("data-viewer") !== kind;
    });
  }

  function findMaterial(record, id) {
    var groups = record.materialGroups || [];
    for (var i = 0; i < groups.length; i++) {
      var items = groups[i].items || [];
      for (var j = 0; j < items.length; j++) {
        if (String(items[j].id) === String(id)) return items[j];
      }
    }
    return null;
  }

  /* ---------- wiring ---------- */

  function init(root) {
    if (root.__wired) return;
    root.__wired = true;
    root.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-material-id]");
      if (b && root.contains(b)) {
        e.preventDefault();
        select(root, b.getAttribute("data-material-id"));
      }
    });
  }

  function boot() {
    all(document, "[data-entry]").forEach(init);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.dyEntry = { render: render, select: select };

  /* >>> MOCK DRIVER <<< — delete this whole block for production.
     It fetches the sample file and picks the record from ?id=, from
     [data-entry-id], or falls back to the first one. The backend replaces it
     by calling dyEntry.render(root, record) with the real record. Nothing
     above this fence changes. */
  (function mock() {
    function run() {
      var roots = all(document, "[data-entry]");
      if (!roots.length) return;
      var src = roots[0].getAttribute("data-src") || DATA_URL;
      fetch(src)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var items = (data && data.items) || [];
          var wanted =
            new URLSearchParams(window.location.search).get("id") ||
            roots[0].getAttribute("data-entry-id") ||
            "";
          roots.forEach(function (root) {
            var id = root.getAttribute("data-entry-id") || wanted;
            var rec = null;
            for (var i = 0; i < items.length && id; i++) {
              if (items[i].id === id) { rec = items[i]; break; }
            }
            rec = rec || items[0];
            render(root, rec, mockContext(rec, items));
          });
        })
        .catch(function (err) {
          if (window.console) console.error("entry.js sample load failed:", err);
        });
    }
    /* Work out 返回 / 上一項 / 下一項 from the context the CATALOGUE stored on
       its way out (see mockSaveContext in catalogue.js).

       Falls back to the full sample in its default order when there is no
       stored context — someone opening an entry URL cold, from a bookmark or a
       search engine. The arrows then still work; they just walk the default
       list rather than a filtered one. That is the honest fallback: hiding
       them would be worse, and guessing a filter would be a lie. */
    function mockContext(record, items) {
      var stored = null;
      try {
        stored = JSON.parse(sessionStorage.getItem("dy:catalogue-context") || "null");
      } catch (e) {
        stored = null;
      }

      var ids, titles, hrefs, backHref;
      if (stored && stored.ids && stored.ids.indexOf(record.id) >= 0) {
        ids = stored.ids;
        titles = stored.titles || {};
        hrefs = stored.hrefs || {};
        backHref = stored.url || CATALOGUE_PATH;
      } else {
        /* Default order = newest year first, the catalogue's own default sort. */
        var sorted = items.slice().sort(function (a, b) {
          return (b.year || 0) - (a.year || 0);
        });
        ids = sorted.map(function (i) { return i.id; });
        titles = {};
        hrefs = {};
        sorted.forEach(function (i) {
          titles[i.id] = i.title || i.titleEn || "";
          hrefs[i.id] = i.href || "";
        });
        backHref = CATALOGUE_PATH;
      }

      var at = ids.indexOf(record.id);
      function neighbour(step) {
        var id = ids[at + step];
        if (at < 0 || !id) return null;
        return {
          id: id,
          title: titles[id] || "",
          href: hrefs[id] || (ENTRY_PATH + "?id=" + encodeURIComponent(id)),
        };
      }
      return {
        backHref: backHref,
        categoryHref: record.categoryKey
          ? CATALOGUE_PATH + "?category=" + encodeURIComponent(record.categoryKey)
          : "",
        prev: neighbour(-1),
        next: neighbour(1),
      };
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run);
    } else {
      run();
    }
  })();
  /* >>> END MOCK DRIVER <<< */
})();
