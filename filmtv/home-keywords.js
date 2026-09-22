/**
 * home-keywords.js — the "資料庫關鍵字" column on the Home page.
 *
 * Renders the suggested-keyword tags from a CSV file so the list can be
 * updated by replacing one small text file on the server, with no Webflow
 * re-export. Every tag is a plain link to the search page carrying the
 * search it should run, so a click needs no JavaScript on the far side:
 *
 *     search-page.html?field_1=author&keyword_1=%E4%BD%99%E6%85%95%E9%9B%B2
 *
 * search.js on the search page reads those indexed params on load
 * (normalizeUrlKeywordParams), fills the form and runs the search.
 *
 * ---------------------------------------------------------------------------
 * CSV CONTRACT — columns, header row required, UTF-8:
 *
 *   group      section heading (作者 / 關鍵字 / 人物). Groups appear in the
 *              order they first occur in the file; a new group needs no code
 *              change.
 *   label      the text printed on the tag.
 *   field      which search field to search in. One of the values the search
 *              page's own dropdown offers: all | article-title | book-title |
 *              author | column. Blank means "all".
 *   query      optional. The text actually searched, when it differs from the
 *              label (e.g. label "電影保育、電影資料館", query "電影保育").
 *   operator   optional. How a multi-keyword row joins its terms:
 *              AND | OR | NOT. Blank means AND.
 *   highlight  optional. A style flag. Its value becomes a combo class on the
 *              tag: "highlight" -> .home-keyword-tag.cc-highlight. To add a
 *              second colour later, type a different word here (e.g. "new")
 *              and create a matching .home-keyword-tag.cc-new combo in the
 *              Webflow Designer. No change to this file is needed.
 *
 * MULTI-KEYWORD ROWS. One tag can run a combined search of up to 5 keywords —
 * the same search the form on the left of the section can build by hand.
 * Separate the terms in `query` with a pipe. `field` and `operator` take
 * either ONE value (reused for every term) or a matching pipe-separated list;
 * an operator list lines up with terms 2…n, because the first term never
 * carries one:
 *
 *   group,label,field,query,operator,highlight
 *   人物,張國榮 × 新浪潮,all,張國榮|香港新浪潮,AND,
 *   人物,張國榮（非訪問）,all,張國榮|訪問,NOT,
 *   作者,舒琪 談 楚原,author|all,舒琪|楚原,AND,
 *
 * -> search-page.html?field_1=author&keyword_1=舒琪
 *                    &field_2=all&operator_2=AND&keyword_2=楚原
 *
 * ---------------------------------------------------------------------------
 * DOM CONTRACT — all of it authored in Webflow; this file creates no styling:
 *
 *   [data-keyword-groups]              root. Carries the tuning attributes:
 *       data-keyword-src="…/home-keywords.csv"   (required)
 *       data-search-url="search-page.html"       (optional, that's the default)
 *     [data-keyword-group-template]    ONE authored group, used as the
 *                                      prototype and then removed
 *       [data-keyword-group-title]     the group heading
 *       [data-keyword-list]            the tag container
 *         [data-keyword-tag]           ONE authored tag (an <a>), the
 *                                      prototype. Any further authored tags
 *                                      are design-time swatches only — they
 *                                      exist so combo classes like
 *                                      cc-highlight can be selected and
 *                                      styled by eye on the Webflow canvas,
 *                                      and never reach the published page.
 *
 * The FIRST [data-keyword-tag] is the prototype and must be the plain one.
 */
(function () {
  "use strict";

  var DEFAULT_SEARCH_URL = "search-page.html";
  // The search page's own cap: search.js reads keyword_1 … keyword_5.
  var MAX_TERMS = 5;

  var state = {
    root: null,
    groupProto: null,
    tagProto: null,
    tagIsListItem: false,
    anchorBaseClass: "",
  };

  ready(function () {
    var root = document.querySelector("[data-keyword-groups]");
    if (!root) return;
    init(root);
    load();
  });

  // ---------------------------------------------------------------- setup

  function init(root) {
    state.root = root;

    var groupProto = root.querySelector("[data-keyword-group-template]");
    if (!groupProto) {
      warn("no [data-keyword-group-template] inside [data-keyword-groups]");
      return;
    }
    state.groupProto = groupProto.cloneNode(true);
    state.groupProto.removeAttribute("data-keyword-group-template");

    var tagProto = state.groupProto.querySelector("[data-keyword-tag]");
    if (!tagProto) {
      warn("no [data-keyword-tag] inside the group template");
      state.groupProto = null;
      return;
    }

    // The prototype is the whole list row when the tags sit in a <ul>.
    var li = tagProto.closest ? tagProto.closest("li") : null;
    state.tagIsListItem = !!(li && state.groupProto.contains(li));
    state.tagProto = (state.tagIsListItem ? li : tagProto).cloneNode(true);

    var protoAnchor = anchorOf(state.tagProto);
    state.anchorBaseClass = protoAnchor ? protoAnchor.className : "";
  }

  function load() {
    var root = state.root;
    var src = root.getAttribute("data-keyword-src");
    if (!src) {
      warn("[data-keyword-groups] has no data-keyword-src");
      hide();
      return;
    }
    // no-store so replacing the CSV on the server takes effect immediately,
    // without anyone having to bump a ?v= on the URL.
    fetch(src, { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.text();
      })
      .then(function (text) {
        render(parseCsv(text));
      })
      .catch(function (err) {
        warn("could not load " + src + " — " + err.message);
        hide();
      });
  }

  // --------------------------------------------------------------- render

  function render(rows) {
    if (!state.root || !state.groupProto) return;
    rows = normalizeRows(rows);
    if (!rows.length) {
      warn("no usable rows in the keyword CSV");
      hide();
      return;
    }

    // Any highlight class the CSV asks for has to be strippable from the
    // prototype, in case the authored prototype happens to carry one.
    var highlightClasses = {};
    rows.forEach(function (row) {
      if (row.highlightClass) highlightClasses[row.highlightClass] = true;
    });
    var baseClass = stripClasses(state.anchorBaseClass, highlightClasses);

    var searchUrl = state.root.getAttribute("data-search-url") || DEFAULT_SEARCH_URL;
    var groups = groupRows(rows);
    var fragment = document.createDocumentFragment();

    groups.forEach(function (group, index) {
      var groupEl = state.groupProto.cloneNode(true);

      var titleEl = groupEl.querySelector("[data-keyword-group-title]");
      var listEl = groupEl.querySelector("[data-keyword-list]");
      if (!listEl) return;

      var titleId = "home-keyword-group-" + (index + 1);
      if (titleEl) {
        setText(titleEl, group.name);
        if (!titleEl.id) titleEl.id = titleId;
        listEl.setAttribute("aria-labelledby", titleEl.id);
      }

      listEl.innerHTML = "";
      group.rows.forEach(function (row) {
        listEl.appendChild(buildTag(row, baseClass, searchUrl));
      });

      fragment.appendChild(groupEl);
    });

    state.root.innerHTML = "";
    state.root.appendChild(fragment);
    show();
  }

  function buildTag(row, baseClass, searchUrl) {
    var node = state.tagProto.cloneNode(true);
    var anchor = anchorOf(node);
    if (!anchor) return node;

    anchor.className = row.highlightClass
      ? (baseClass + " " + row.highlightClass).trim()
      : baseClass;

    anchor.setAttribute("href", buildSearchHref(searchUrl, row));
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener");
    setText(anchor, row.label);
    return node;
  }

  /**
   * Indexed params, not the JSON `keywords` param: they are what the design
   * system's own keyword-field component submits, so one contract covers both
   * the home form and these links.
   *
   * Row 1 carries no operator — that is the search page's own rule, and it is
   * why indexed names beat parallel arrays here.
   */
  function buildSearchHref(searchUrl, row) {
    var params = [];
    for (var i = 0; i < row.terms.length; i++) {
      var n = i + 1;
      params.push("field_" + n + "=" + encodeURIComponent(row.terms[i].field));
      if (i > 0) {
        params.push("operator_" + n + "=" + encodeURIComponent(row.terms[i].operator));
      }
      params.push("keyword_" + n + "=" + encodeURIComponent(row.terms[i].value));
    }
    return searchUrl + (searchUrl.indexOf("?") === -1 ? "?" : "&") + params.join("&");
  }

  // ------------------------------------------------------------- csv + rows

  /**
   * Small RFC-4180 parser: quoted fields, doubled quotes inside them, CRLF,
   * and a leading BOM (which Excel writes and which would otherwise become
   * part of the first column's name).
   */
  function parseCsv(text) {
    text = String(text || "").replace(/^﻿/, "");

    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += ch;
      }
    }
    row.push(field);
    rows.push(row);

    return toObjects(rows);
  }

  function toObjects(rows) {
    rows = rows.filter(function (cells) {
      return cells.some(function (cell) {
        return String(cell).trim() !== "";
      });
    });
    if (!rows.length) return [];

    var header = rows[0].map(function (cell) {
      return String(cell).trim().toLowerCase();
    });

    return rows.slice(1).map(function (cells) {
      var obj = {};
      header.forEach(function (key, i) {
        if (key) obj[key] = String(cells[i] == null ? "" : cells[i]).trim();
      });
      return obj;
    });
  }

  function normalizeRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows
      .map(function (row) {
        var label = row.label || "";
        var terms = buildTerms(row, label);
        if (!label || !terms.length) return null;
        return {
          group: row.group || "",
          label: label,
          terms: terms,
          highlightClass: highlightClass(row.highlight),
        };
      })
      .filter(Boolean);
  }

  /**
   * One row can carry up to MAX_TERMS keywords, separated by a pipe — the same
   * multi-keyword search the form on the left of the section can build by hand:
   *
   *     label   人物與作者
   *     query   張國榮|余慕雲
   *     field   all|author        (or one value, applied to every term)
   *     operator AND              (or a list; the first term never has one)
   *
   * `field` and `operator` may be a single value or a pipe-separated list; a
   * single value is reused for every term, which keeps the common case short.
   * The cap is the search page's own: search.js reads keyword_1 … keyword_5.
   */
  function buildTerms(row, label) {
    var values = splitList(row.query || label);
    if (!values.length) return [];

    if (values.length > MAX_TERMS) {
      warn(
        'row "' + label + '" has ' + values.length + " keywords; the search page " +
          "takes at most " + MAX_TERMS + ", so the extra ones are dropped"
      );
      values = values.slice(0, MAX_TERMS);
    }

    var fields = splitList(row.field);
    var operators = splitList(row.operator);

    return values.map(function (value, i) {
      return {
        value: value,
        field: pick(fields, i) || "all",
        // The first term never carries an operator, so an operator LIST lines
        // up with terms 2…n — "AND|OR" means term 2 AND, term 3 OR.
        operator: i === 0 ? "AND" : (pick(operators, i - 1) || "AND").toUpperCase(),
      };
    });
  }

  function splitList(value) {
    return String(value == null ? "" : value)
      // full-width ｜ too: a Chinese keyboard produces it without warning
      .split(/[|｜]/)
      .map(function (part) {
        return part.trim();
      })
      .filter(function (part) {
        return part !== "";
      });
  }

  /** One value applies to every term; a list applies per term. */
  function pick(list, index) {
    if (!list.length) return "";
    return list.length === 1 ? list[0] : list[index] || "";
  }

  /**
   * "highlight" -> "cc-highlight". Any other word works the same way, which is
   * how a second highlight colour is added: type it in the CSV, then create the
   * matching combo class in the Designer.
   */
  function highlightClass(value) {
    var slug = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    return slug ? "cc-" + slug : "";
  }

  function groupRows(rows) {
    var order = [];
    var byName = {};
    rows.forEach(function (row) {
      var name = row.group || "";
      if (!byName[name]) {
        byName[name] = { name: name, rows: [] };
        order.push(byName[name]);
      }
      byName[name].rows.push(row);
    });
    return order;
  }

  // -------------------------------------------------------------- helpers

  function anchorOf(node) {
    if (!node) return null;
    if (node.hasAttribute && node.hasAttribute("data-keyword-tag")) return node;
    return node.querySelector ? node.querySelector("[data-keyword-tag]") : null;
  }

  function stripClasses(className, drop) {
    return String(className || "")
      .split(/\s+/)
      .filter(function (name) {
        return name && !drop[name];
      })
      .join(" ");
  }

  /** Writes to the deepest text-only descendant, so an icon span survives. */
  function setText(el, text) {
    var target = el;
    while (target.children && target.children.length === 1 && !hasOwnText(target)) {
      target = target.children[0];
    }
    target.textContent = text;
  }

  function hasOwnText(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var node = el.childNodes[i];
      if (node.nodeType === 3 && node.nodeValue.trim()) return true;
    }
    return false;
  }

  function hide() {
    if (!state.root) return;
    state.root.innerHTML = "";
    state.root.hidden = true;
    state.root.classList.add("is-empty");
  }

  function show() {
    if (!state.root) return;
    state.root.hidden = false;
    state.root.classList.remove("is-empty");
  }

  function warn(message) {
    if (window.console && console.warn) console.warn("[home-keywords] " + message);
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      // Wrapped: a bare listener would pass the Event object into fn().
      document.addEventListener("DOMContentLoaded", function () {
        fn();
      });
    } else {
      fn();
    }
  }

  window.filmtvHomeKeywords = {
    /** Re-render from rows already parsed (objects with the CSV's columns). */
    render: function (rows) {
      render(rows);
    },
    /** Re-fetch the CSV — for after the file has been replaced. */
    reload: function () {
      load();
    },
    parseCsv: parseCsv,
  };
})();
