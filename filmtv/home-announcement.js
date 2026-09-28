/**
 * home-announcement.js — the news banner above the Nav on the Home page.
 *
 * Shows ONE message from a CSV file, so a colleague can post and retire news
 * by editing one small text file on the server, with no Webflow re-export.
 * Old rows can stay in the file; it doubles as the record of past messages.
 *
 * ---------------------------------------------------------------------------
 * CSV CONTRACT — columns, header row required, UTF-8:
 *
 *   start    first day the message shows. YYYY-MM-DD (or YYYY/MM/DD).
 *            Required — a row without a readable start is skipped.
 *   end      last day the message shows, inclusive. Same format. Blank means
 *            "no end yet": it shows until someone fills this in.
 *   message  the text of the banner.
 *   link     optional. Where a click on the banner goes. Blank = the banner
 *            is not clickable. A full https://… address opens in a new tab;
 *            a path on this site (e.g. about.html) opens in the same tab.
 *   show_date  optional. Blank = the start date is shown after the message,
 *            in brackets. "no" = no date and no brackets — for a message that
 *            names a date of its own, where a second date would confuse.
 *
 *   start,end,message,link,show_date
 *   2026-10-01,2026-10-31,資料庫新增 126 本刊物,collection.html,
 *   2026-12-20,,聖誕及新年假期期間，查詢回覆或需較長時間,,no
 *
 * WHICH MESSAGE SHOWS:
 *   - A row is ACTIVE from the start of its `start` day to the end of its
 *     `end` day, both inclusive.
 *   - "Today" is the date in HONG KONG, not the visitor's own clock, so a
 *     message switches on and off at the same moment for everyone.
 *   - Of the active rows, the one with the LATEST start wins; on a tie, the
 *     one lower down in the file.
 *   - No active row -> the banner stays hidden.
 *
 * DATES AND EXCEL. Excel rewrites dates it recognises into the computer's own
 * format when it saves (2026-10-01 can come back as 1/10/2026). That format is
 * ambiguous — 1 October or January 10th? — so it is REJECTED rather than
 * guessed: the row is skipped and the console says why. Edit the file in a
 * plain text editor, or format the date columns as Text in Excel first.
 *
 * ---------------------------------------------------------------------------
 * DOM CONTRACT — all of it authored in Webflow; this file creates no styling:
 *
 *   [data-announcement]            the banner. Carries:
 *       data-announcement-src="…/home-announcements.csv"   (required)
 *     [data-announcement-text]     receives the message
 *     [data-announcement-date-wrap]  the date AND its brackets. Removed when
 *                                    the row says show_date = no.
 *       [data-announcement-date]     receives the start date, as YYYY/MM/DD
 *                                    (optional — omit it and no date shows)
 *     [data-announcement-link]     optional <a>, the whole-banner cover link
 *                                  (.u-link-cover). Removed when the active
 *                                  row has no link.
 *
 * STATE CLASSES this file adds to [data-announcement]:
 *   is-active   there is a message to show. The Page CSS hides the banner
 *               until this class arrives, so a missing or broken file, or a
 *               script that fails, leaves NO banner rather than stale text.
 *   is-linked   the active row has a link. Style the hover on the Webflow
 *               combo .nav-banner.is-linked, so an unlinked banner does not
 *               pretend to be clickable.
 *
 * PREVIEWING a future or past message: add ?announcement-date=2026-12-25 to
 * the page URL and the banner is chosen as if that were today.
 */
(function () {
  "use strict";

  var TIME_ZONE = "Asia/Hong_Kong";

  ready(function () {
    var root = document.querySelector("[data-announcement]");
    if (!root) return;

    var src = root.getAttribute("data-announcement-src");
    if (!src) {
      warn("[data-announcement] has no data-announcement-src");
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
        var row = pickActive(normalizeRows(parseCsv(text)), today());
        if (row) show(root, row);
      })
      .catch(function (err) {
        warn("could not load " + src + " — " + err.message);
      });
  });

  // --------------------------------------------------------------- choose

  /** Latest start wins; `>=` lets a later row win a tie. */
  function pickActive(rows, todayKey) {
    var best = null;
    rows.forEach(function (row) {
      if (row.start > todayKey) return;
      if (row.end && row.end < todayKey) return;
      if (!best || row.start >= best.start) best = row;
    });
    return best;
  }

  /**
   * Today's date in Hong Kong as YYYY-MM-DD. Dates in that form compare
   * correctly as plain strings, which is why every date is normalised to it.
   */
  function today() {
    var override = new URLSearchParams(window.location.search).get("announcement-date");
    if (override) {
      var key = dateKey(override);
      if (key) return key;
      warn("ignoring ?announcement-date=" + override + " — use YYYY-MM-DD");
    }

    var parts = {};
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .forEach(function (part) {
        parts[part.type] = part.value;
      });
    return parts.year + "-" + parts.month + "-" + parts.day;
  }

  // --------------------------------------------------------------- render

  function show(root, row) {
    var textEl = root.querySelector("[data-announcement-text]");
    var dateEl = root.querySelector("[data-announcement-date]");
    var dateWrap = root.querySelector("[data-announcement-date-wrap]");
    var linkEl = root.querySelector("[data-announcement-link]");

    if (textEl) textEl.textContent = row.message;
    if (row.showDate) {
      if (dateEl) dateEl.textContent = row.start.replace(/-/g, "/");
    } else {
      // The brackets are authored text around the date, so remove the wrapper
      // that holds all three; without one, remove just the date.
      var dateNode = dateWrap || dateEl;
      if (dateNode) dateNode.parentNode.removeChild(dateNode);
    }

    if (linkEl) {
      if (row.link) {
        linkEl.setAttribute("href", row.link);
        // The cover link has no text of its own; without a label a screen
        // reader announces it as just "link".
        linkEl.setAttribute("aria-label", row.message);
        if (isExternal(row.link)) {
          linkEl.setAttribute("target", "_blank");
          linkEl.setAttribute("rel", "noopener");
        } else {
          linkEl.removeAttribute("target");
          linkEl.removeAttribute("rel");
        }
        root.classList.add("is-linked");
      } else {
        linkEl.parentNode.removeChild(linkEl);
      }
    }

    root.classList.add("is-active");
  }

  function isExternal(href) {
    try {
      return new URL(href, window.location.href).origin !== window.location.origin;
    } catch (e) {
      return false;
    }
  }

  // ------------------------------------------------------------- csv + rows

  function normalizeRows(rows) {
    return rows
      .map(function (row, i) {
        var line = i + 2; // +1 for the header, +1 for counting from 1
        var message = row.message || "";
        if (!message) return null;

        var start = dateKey(row.start);
        if (!start) {
          warn("row " + line + ' skipped — start "' + (row.start || "") +
            '" is not a YYYY-MM-DD date');
          return null;
        }

        var end = "";
        if (row.end) {
          end = dateKey(row.end);
          if (!end) {
            warn("row " + line + ' skipped — end "' + row.end +
              '" is not a YYYY-MM-DD date');
            return null;
          }
          if (end < start) {
            warn("row " + line + " skipped — it ends before it starts");
            return null;
          }
        }

        return {
          start: start,
          end: end,
          message: message,
          link: safeLink(row.link),
          showDate: !isNo(row.show_date),
        };
      })
      .filter(Boolean);
  }

  /** "no", and the other ways people type it. Anything else, blank included, is yes. */
  function isNo(value) {
    return /^(no|n|false|0|hide|否)$/i.test(String(value || "").trim());
  }

  /**
   * "2026-10-01", "2026/10/01" or "2026-10-1" -> "2026-10-01". Anything else,
   * including Excel's regional rewrite (1/10/2026), -> "" so the row is
   * skipped rather than shown on a guessed date.
   */
  function dateKey(value) {
    var m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(String(value || "").trim());
    if (!m) return "";
    var month = +m[2];
    var day = +m[3];
    if (month < 1 || month > 12 || day < 1 || day > 31) return "";
    return m[1] + "-" + pad(month) + "-" + pad(day);
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  /** The link lands in an href, so refuse script URLs outright. */
  function safeLink(value) {
    var link = String(value || "").trim();
    if (/^(javascript|data|vbscript):/i.test(link.replace(/\s+/g, ""))) {
      warn('link "' + link + '" ignored — not a web address');
      return "";
    }
    return link;
  }

  /**
   * Small RFC-4180 parser: quoted fields, doubled quotes inside them, CRLF,
   * and a leading BOM (which Excel writes and which would otherwise become
   * part of the first column's name). Same parser as home-keywords.js.
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

  // ---------------------------------------------------------------- utils

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function warn(message) {
    if (window.console && console.warn) console.warn("[home-announcement] " + message);
  }
})();
