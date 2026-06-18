/* ============================================================
 * results.js — Film/TV publication search-results renderer
 *
 * Webflow authors the markup (one visible template per list, with
 * data-* hooks). This script fetches ONE data URL, hides each
 * template, and renders cloned + filled copies. Sample JSON now;
 * backend swaps DATA_URL later (same JSON shape).
 *
 * - Dependency-free, multi-instance safe (scoped to each [data-results]).
 * - Never writes inline styles. Toggles classes / data-* / native
 *   attributes only. All styling lives in Webflow (DS tokens).
 *
 * data-* contract (revised to match the Webflow build):
 *   [data-results]                     init root; carries data-view state
 *   [data-view-btn=article|book]       toggle buttons (aria-pressed, cc-active)
 *   [data-count=article|book]          <- counts.{articles,books} (fallback: computed)
 *   [data-dropdown] (sort)             DS single-select dropdown
 *     input[name="sort"][data-sort]      holds chosen value ("year"|"title")
 *     [data-dropdown-option][data-value]  options
 *   [data-view-panel=article|book]     view container (grid)
 *
 *   ARTICLE template: [data-tpl=article-card]
 *     img[data-field=thumbnail]        <- imageBase + image (first of "a---b")
 *     [data-field=publication]         <- journal › journalIssue  (LEAF node only)
 *     [data-field=book-date]           <- datePublished; empty -> hide its "(…)" wrapper
 *     [data-field=title]               <- title; empty -> "無標題"
 *     [data-field=section|author|page] <- value only; empty -> hide its row + label (closest li)
 *     [data-field=article-type]        <- ARTICLE_TYPES[code].label + colour variant
 *                                         class (is-film/-cultural/-comm/-other); empty -> hide
 *
 *   BOOK template: [data-tpl=book-row]   (one per isPost group)
 *     img[data-field=cover]            <- group cover image
 *     [data-field=publication]         <- journal (book/issue title)   (LEAF node only)
 *     [data-field=book-date]           <- datePublished; empty -> hide the date row
 *     .book-article-list > (item tpl = first .book-row-article)  "section ｜ title" + tag
 *       [data-field=section]           <- article section (empty -> hidden)
 *       [data-field=title]             <- article title  (empty -> hidden; if section ALSO
 *                                         empty -> "無標題"); .pipe hidden unless both present
 *       [data-field=article-type]      <- type tag (label + variant; empty -> hide)
 *   [data-chart]                       deferred mount point (untouched)
 *
 * NOTE: "publication" appears on >1 element in the article card; we only
 * write LEAF nodes (no nested [data-field]) so the "(date)" wrapper that
 * holds [data-field=book-date] is never clobbered.
 * ============================================================ */
(function () {
  "use strict";

  var SELF =
    (document.currentScript && document.currentScript.src) ||
    (function () {
      var s = document.querySelector('script[src*="results.js"]');
      return s ? s.src : window.location.href;
    })();

  /* >>> SINGLE SWAP POINT <<< replace with the live API URL (same JSON shape). */
  var DATA_URL = new URL("./sample-data/2922.json", SELF).href;

  /* Article-type code -> { label, variant }. Sourced from the "文章類別"
     filter accordion in Webflow; the 3 dividers split the list into 4 colour
     groups (is-film / is-cultural / is-comm / is-other). Keep in sync with
     that accordion (single source of truth).
     NOTE: code "1" is duplicated in the accordion (廣告、優惠券 AND
     雜誌表格…); mapped here to the first. Give one a unique code upstream. */
  var ARTICLE_TYPES = {
    // is-film
    "21": { label: "電影故事、小說、本事", variant: "is-film" },
    "19": { label: "電影對白、劇本、分鏡大綱", variant: "is-film" },
    "9":  { label: "歌詞、歌譜", variant: "is-film" },
    "6":  { label: "人物專訪、花絮", variant: "is-film" },
    "4":  { label: "電影資訊及評論", variant: "is-film" },
    "5":  { label: "電視節目資訊及評論", variant: "is-film" },
    "25": { label: "電影節、影視文化活動", variant: "is-film" },
    "26": { label: "電影獎項、頒獎典禮", variant: "is-film" },
    "31": { label: "電影票房記錄", variant: "is-film" },
    "11": { label: "電視節目表、活動日程", variant: "is-film" },
    "18": { label: "職員表、演員表、人物表", variant: "is-film" },
    "32": { label: "作品年表", variant: "is-film" },
    // is-cultural
    "13": { label: "編輯的話、讀者來信、序言、後記", variant: "is-cultural" },
    "15": { label: "唱片、音樂資訊及評論", variant: "is-cultural" },
    "28": { label: "文學創作、書摘", variant: "is-cultural" },
    "27": { label: "文學及藝術評論、書評", variant: "is-cultural" },
    "20": { label: "現場表演、舞台藝術", variant: "is-cultural" },
    "7":  { label: "消閒讀物、資訊讀物、教學文章", variant: "is-cultural" },
    "17": { label: "插畫、漫畫、小遊戲", variant: "is-cultural" },
    "29": { label: "辭典、詞條", variant: "is-cultural" },
    // is-comm
    "23": { label: "公司通訊、資料", variant: "is-comm" },
    "16": { label: "產品、商鋪", variant: "is-comm" },
    "1":  { label: "廣告、優惠券", variant: "is-comm" },
    "12": { label: "抽獎得獎名單", variant: "is-comm" },
    "10": { label: "雜誌表格、意見調查表格、報名表格", variant: "is-comm" },
    // is-other
    "3":  { label: "目錄、內容、片目索引", variant: "is-other" },
    "14": { label: "封面、封底、版權頁", variant: "is-other" },
    "2":  { label: "照片集", variant: "is-other" },
    "24": { label: "海報、明信片", variant: "is-other" },
    "30": { label: "缺頁", variant: "is-other" },
    "22": { label: "外語文章", variant: "is-other" },
    "33": { label: "其他類別", variant: "is-other" }
  };
  var TYPE_VARIANT_CLASSES = ["is-film", "is-cultural", "is-comm", "is-other"];

  ready(function () {
    var roots = document.querySelectorAll("[data-results]");
    for (var i = 0; i < roots.length; i++) initResults(roots[i]);
  });

  function initResults(root) {
    var url = root.getAttribute("data-src") || DATA_URL;
    fetch(url, { credentials: "omit" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        setup(root, data || {});
      })
      .catch(function (err) {
        console.error("[results] failed to load " + url + ":", err);
      });
  }

  function setup(root, data) {
    var items = Array.isArray(data.items) ? data.items : [];
    var imageBase = data.imageBase || "";

    var articleTpl = root.querySelector('[data-tpl="article-card"]');
    var bookTpl = root.querySelector('[data-tpl="book-row"]');
    if (!articleTpl && !bookTpl) {
      console.warn("[results] no templates under [data-results]");
      return;
    }
    // Cache pristine templates, then hide the originals so only clones show
    // at runtime (in the Designer there is no JS, so the static template stays
    // visible for QC).
    var articleHost = articleTpl ? articleTpl.parentNode : null;
    var articlePristine = articleTpl ? articleTpl.cloneNode(true) : null;
    if (articleTpl) articleTpl.setAttribute("u-d", "none");

    var bookHost = bookTpl ? bookTpl.parentNode : null;
    var bookPristine = bookTpl ? bookTpl.cloneNode(true) : null;
    if (bookTpl) bookTpl.setAttribute("u-d", "none");

    var sortKey = currentSort(root);

    function buildCard(item) {
      var card = articlePristine.cloneNode(true);
      activate(card);
      if (item.href) card.setAttribute("href", item.href);
      setImg(card.querySelector('[data-field="thumbnail"]'), item.image, imageBase, item.title);
      setLeafField(card, "publication", articlePublication(item)); // journal › issue
      setDate(card, item.datePublished);          // the "(date)" span; hides wrapper if empty
      setTitle(card, item.title);                 // 無標題 fallback
      setMeta(card, "section", formatList(item.section));
      setMeta(card, "author", formatList(item.author));
      setMeta(card, "page", item.page);
      setArticleType(card, item.type);            // label + colour variant; hides if empty
      return card;
    }

    function buildBookRow(group) {
      var first = group.items[0] || {};
      var row = bookPristine.cloneNode(true);
      activate(row);
      setImg(row.querySelector('[data-field="cover"]'), first.image, imageBase, first.journal);
      setLeafField(row, "publication", bookTitle(first)); // book/issue title
      setDate(row, first.datePublished);                  // hides the date row if empty
      renderBookArticles(row, group.items);
      return row;
    }

    // Nested article list inside a book row (the hooked .book-article-list).
    function renderBookArticles(row, articles) {
      var list = row.querySelector(".book-article-list");
      if (!list) return;
      var article0 = list.querySelector(".book-row-article");
      if (!article0) return;
      var liTpl = article0.closest("li") || article0;
      var liHost = liTpl.parentNode;
      while (liHost.firstChild) liHost.removeChild(liHost.firstChild); // drop static demo rows
      for (var i = 0; i < articles.length; i++) {
        var li = liTpl.cloneNode(true);
        fillBookArticle(li, articles[i]);
        liHost.appendChild(li);
      }
    }

    // A nested book article shows "section ｜ title" + a type tag.
    // both empty -> "無標題"; only one -> show it (hide the pipe); type empty -> hide tag.
    function fillBookArticle(li, a) {
      var sectionEl = leaf(li, "section");
      var titleEl = leaf(li, "title");
      var pipe = li.querySelector(".pipe-wrap, .pipe");
      var section = formatList(a.section);
      var title = a.title == null ? "" : String(a.title);
      var hasSection = section.trim() !== "";
      var hasTitle = title.trim() !== "";

      if (sectionEl) toggle(sectionEl, hasSection, section);
      if (titleEl) {
        if (hasTitle) toggle(titleEl, true, title);
        else if (!hasSection) toggle(titleEl, true, "無標題"); // both empty
        else toggle(titleEl, false, ""); // section only
      }
      if (pipe) toggle(pipe, hasSection && hasTitle, null);
      setArticleType(li, a.type);
      var link = li.querySelector("a[href]");
      if (link && a.href) link.setAttribute("href", a.href);
    }

    function renderArticles() {
      if (!articleTpl) return;
      removeClones(articleHost);
      var ordered = sortItems(items, sortKey);
      var frag = document.createDocumentFragment();
      for (var i = 0; i < ordered.length; i++) frag.appendChild(buildCard(ordered[i]));
      articleHost.appendChild(frag);
    }

    function renderBooks() {
      if (!bookTpl) return;
      removeClones(bookHost);
      var groups = groupBy(sortItems(items, sortKey), "isPost");
      var frag = document.createDocumentFragment();
      for (var i = 0; i < groups.length; i++) frag.appendChild(buildBookRow(groups[i]));
      bookHost.appendChild(frag);
    }

    function setCounts() {
      var c = data.counts || {};
      var aCount = c.articles != null ? c.articles : items.length;
      var bCount = c.books != null ? c.books : groupBy(items, "isPost").length;
      setAll(root, '[data-count="article"]', formatNum(aCount));
      setAll(root, '[data-count="book"]', formatNum(bCount));
    }

    function setView(view) {
      root.setAttribute("data-view", view);
      var btns = root.querySelectorAll("[data-view-btn]");
      for (var i = 0; i < btns.length; i++) {
        var on = btns[i].getAttribute("data-view-btn") === view;
        btns[i].setAttribute("aria-pressed", on ? "true" : "false");
        btns[i].classList.toggle("cc-active", on);
      }
      var panels = root.querySelectorAll("[data-view-panel]");
      for (var j = 0; j < panels.length; j++) {
        var show = panels[j].getAttribute("data-view-panel") === view;
        if (show) panels[j].removeAttribute("u-d");
        else panels[j].setAttribute("u-d", "none");
      }
    }

    function reorder() {
      sortKey = currentSort(root);
      renderArticles();
      renderBooks();
    }

    // Toggle (delegated)
    root.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-view-btn]") : null;
      if (btn && root.contains(btn)) {
        e.preventDefault();
        setView(btn.getAttribute("data-view-btn"));
      }
    });

    // Sort — DS single-select dropdown writes its value to input[name="sort"].
    var sortInput = root.querySelector('[name="sort"]');
    if (sortInput) sortInput.addEventListener("change", reorder);
    var sortDropdown = root.querySelector("[data-dropdown]");
    if (sortDropdown) {
      sortDropdown.addEventListener("click", function (e) {
        if (e.target.closest && e.target.closest("[data-dropdown-option]")) {
          window.setTimeout(reorder, 0);
        }
      });
    }

    renderArticles();
    renderBooks();
    setCounts();
    setView(root.getAttribute("data-view") || "article");
  }

  /* ---------- field helpers ---------- */
  function activate(node) {
    node.removeAttribute("u-d");
    node.removeAttribute("data-tpl");
    node.setAttribute("data-clone", "");
  }

  // Return only LEAF [data-field=name] nodes (no nested [data-field]),
  // so wrapper nodes that contain another field (e.g. the "(date)" block)
  // are never overwritten.
  function leafFields(scope, name) {
    var all = scope.querySelectorAll('[data-field="' + name + '"]');
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (!all[i].querySelector("[data-field]")) out.push(all[i]);
    }
    return out;
  }

  function setLeafField(scope, name, value) {
    var els = leafFields(scope, name);
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = value == null ? "" : String(value);
    }
  }

  function leaf(scope, name) {
    return leafFields(scope, name)[0] || null;
  }

  // Show (and set text) or hide an element via the u-d="none" attribute.
  function toggle(el, show, text) {
    if (!el) return;
    if (show) {
      if (text != null) el.textContent = text;
      el.removeAttribute("u-d");
    } else {
      el.setAttribute("u-d", "none");
    }
  }

  // Main heading: always shown, "無標題" when title is empty.
  function setTitle(scope, title) {
    var el = leaf(scope, "title");
    if (el) el.textContent = title && String(title).trim() ? String(title) : "無標題";
  }

  // book-date value sits inside a wrapper (the "(…)" block on the card, or the
  // "出版日期：" row in the book). Empty -> hide the whole wrapper (label included).
  function setDate(scope, date) {
    var el = leaf(scope, "book-date");
    if (!el) return;
    var wrap = el.parentElement || el;
    if (date == null || String(date).trim() === "") {
      wrap.setAttribute("u-d", "none");
    } else {
      el.textContent = String(date);
      wrap.removeAttribute("u-d");
    }
  }

  // article-type tag: set label + swap colour variant class; hide tag if empty.
  function setArticleType(scope, code) {
    var els = scope.querySelectorAll('[data-field="article-type"]');
    var info = typeInfo(code);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!info) {
        el.setAttribute("u-d", "none");
        continue;
      }
      el.removeAttribute("u-d");
      el.textContent = info.label;
      for (var v = 0; v < TYPE_VARIANT_CLASSES.length; v++) el.classList.remove(TYPE_VARIANT_CLASSES[v]);
      if (info.variant) el.classList.add(info.variant);
    }
  }

  // Set a meta value; hide its row (closest <li> / .article-card-metarow) when empty.
  function setMeta(scope, name, value) {
    var els = leafFields(scope, name);
    var empty = value == null || String(value).trim() === "";
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = empty ? "" : String(value);
      var row = els[i].closest("li") || els[i].closest(".article-card-metarow");
      if (row) {
        if (empty) row.setAttribute("u-d", "none");
        else row.removeAttribute("u-d");
      }
    }
  }

  function setImg(img, image, imageBase, alt) {
    if (!img) return;
    var file = String(image || "").split("---")[0];
    img.alt = alt || "";
    img.onerror = function () {
      this.onerror = null;
      this.src = placeholder();
    };
    img.src = imageBase && file ? imageBase + file : placeholder();
  }

  function placeholder() {
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="219">' +
      '<rect width="100%" height="100%" fill="#e6e9ea"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  /* ---------- composition ---------- */
  // "25" -> "第25期"; leaves an already-formatted issue untouched; empty -> "".
  function formatIssue(issue) {
    if (issue == null || String(issue).trim() === "") return "";
    var s = String(issue).trim();
    return /期/.test(s) ? s : "第" + s + "期";
  }
  // Article publication line = journal › 第N期  (date lives in [data-field=book-date]).
  function articlePublication(item) {
    var s = item.journal || "";
    var iss = formatIssue(item.journalIssue);
    if (iss) s += " › " + iss;
    return s;
  }
  // Book/issue title = journal + 第N期 (when present).
  function bookTitle(item) {
    return (item.journal || "") + formatIssue(item.journalIssue);
  }
  function typeInfo(code) {
    if (code == null || String(code).trim() === "") return null;
    return ARTICLE_TYPES[code] || { label: String(code), variant: "" };
  }
  function formatList(v) {
    if (v == null) return "";
    return String(v).split("---").join("、");
  }

  /* ---------- data ops ---------- */
  function groupBy(arr, key) {
    var map = {}, order = [];
    for (var i = 0; i < arr.length; i++) {
      var k = arr[i][key];
      if (!map[k]) {
        map[k] = { key: k, items: [] };
        order.push(k);
      }
      map[k].items.push(arr[i]);
    }
    return order.map(function (k) {
      return map[k];
    });
  }

  // Isolated so a backend returning pre-ordered items can bypass this.
  function sortItems(list, key) {
    var copy = list.slice();
    if (key === "title") {
      copy.sort(function (a, b) {
        return String(a.title || "").localeCompare(String(b.title || ""), "zh-Hant");
      });
    } else if (key === "year") {
      copy.sort(function (a, b) {
        return String(a.year || a.datePublished || "").localeCompare(
          String(b.year || b.datePublished || "")
        );
      });
    }
    return copy;
  }

  /* ---------- dom utils ---------- */
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
  function removeClones(host) {
    if (!host) return;
    var clones = host.querySelectorAll(":scope > [data-clone]");
    for (var i = 0; i < clones.length; i++) clones[i].remove();
  }
  function setAll(root, selector, value) {
    var els = root.querySelectorAll(selector);
    for (var i = 0; i < els.length; i++) els[i].textContent = value;
  }
  function currentSort(root) {
    var input = root.querySelector('[name="sort"]');
    if (input && input.value) return input.value;
    var sel = root.querySelector('[data-dropdown-option][aria-selected="true"]');
    return sel ? sel.getAttribute("data-value") : "";
  }
  function formatNum(n) {
    var num = Number(n);
    return isFinite(num) ? num.toLocaleString("en-US") : String(n);
  }
})();
