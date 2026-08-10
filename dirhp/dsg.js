/* ============================================================
 * dsg.js — funded-projects list for the DIR grant pages
 *
 * Renders and filters the project table from dsg-projects.json.
 * No dependencies. Safe to load on pages that have no project
 * list — it does nothing if the container is absent.
 *
 * Markup contract (all hooks are data-attributes; every class is
 * yours to change in the Designer without touching this file):
 *
 *   <section data-dsg-projects
 *            data-dsg-track="grant"
 *            data-dsg-src="…/dsg-projects.json">
 *
 *     <input type="search" data-dsg-search>
 *     <select data-dsg-year></select>        ← options injected
 *
 *     <span data-dsg-count="shown"></span>
 *     <span data-dsg-count="active"></span>
 *     <span data-dsg-count="completed"></span>
 *
 *     <div data-dsg-list></div>              ← rows land here
 *     <p   data-dsg-empty hidden></p>
 *
 *     <template data-dsg-row>
 *       <div class="dsg_projects_row">
 *         <span data-dsg-field="year"></span>
 *         <span data-dsg-field="code"></span>
 *         <a    data-dsg-field="title"></a>  ← href set from project_url,
 *         <span data-dsg-field="pi"></span>     unwrapped to text if empty
 *         <span data-dsg-field="department"></span>
 *         <a    data-dsg-field="interview"></a> ← removed if no interview_url
 *         <span data-dsg-field="status"></span>
 *       </div>
 *     </template>
 *   </section>
 * ============================================================ */

(function () {
  "use strict";

  var STATUS_CLASS = {
    active: "is-active",
    completed: "is-completed",
    terminated: "is-terminated"
  };

  /* Case-insensitive, CJK-safe haystack. NFKC folds full-width
     Latin onto half-width so a search typed in a Chinese IME still
     matches an ASCII title. */
  function fold(value) {
    var s = String(value == null ? "" : value);
    return (s.normalize ? s.normalize("NFKC") : s).toLowerCase();
  }

  function matches(project, needle) {
    if (!needle) return true;
    return fold(
      [project.title, project.pi, project.department, project.code, project.year].join("  ")
    ).indexOf(needle) !== -1;
  }

  /* Newest first; the codes sort correctly as strings within a year. */
  function byYearDesc(a, b) {
    if (a.year !== b.year) return a.year < b.year ? 1 : -1;
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  }

  function setField(row, name, text) {
    var el = row.querySelector('[data-dsg-field="' + name + '"]');
    if (el) el.textContent = text || "";
    return el;
  }

  /* Swaps a title <a> for a plain <span> (unfocusable, no dead href)
     and tags it .not-link so the Designer's link styling — colour,
     underline — doesn't apply to text that isn't actually clickable. */
  function markAsNotLink(el, text) {
    if (el.tagName !== "A") {
      el.classList.add("not-link");
      return;
    }
    var span = document.createElement("span");
    span.className = el.className + " not-link";
    span.textContent = text;
    span.setAttribute("data-dsg-field", "title");
    el.parentNode.replaceChild(span, el);
  }

  function buildRow(template, project) {
    var row = template.content.firstElementChild.cloneNode(true);

    setField(row, "year", project.year);
    setField(row, "code", project.code);
    setField(row, "pi", project.pi);
    setField(row, "department", project.department);

    /* Title links to the project site when there is one. When there
       isn't, the anchor is replaced by a plain span rather than left
       as a dead link — an <a> with no href is not focusable and reads
       as a broken control to screen readers. */
    var title = setField(row, "title", project.title);
    if (title) {
      if (project.project_url) {
        title.setAttribute("href", project.project_url);
        title.setAttribute("target", "_blank");
        title.setAttribute("rel", "noopener");
      } else {
        markAsNotLink(title, project.title);
      }
    }

    var interview = row.querySelector('[data-dsg-field="interview"]');
    if (interview) {
      if (project.interview_url) {
        interview.setAttribute("href", project.interview_url);
        interview.setAttribute("target", "_blank");
        interview.setAttribute("rel", "noopener");
        /* The link text is "Interview" everywhere, so name it for the
           specific project or a screen-reader user hears the same
           label seventeen times with no way to tell them apart. */
        interview.setAttribute("aria-label", "PI interview — " + project.title);
      } else {
        interview.parentNode.removeChild(interview);
      }
    }

    var status = setField(row, "status", project.status);
    if (status) {
      var key = fold(project.status);
      if (STATUS_CLASS[key]) status.classList.add(STATUS_CLASS[key]);
    }

    return row;
  }

  /* Fallback when the Webflow <template> is missing, so a markup slip
     degrades to an unstyled list rather than an empty page. */
  function buildPlainRow(project) {
    var row = document.createElement("div");
    row.className = "dsg_projects_row";
    var link = project.project_url
      ? '<a href="' + project.project_url + '" target="_blank" rel="noopener">' + project.title + "</a>"
      : project.title;
    row.innerHTML =
      "<span>" + project.year + " " + project.code + "</span> " +
      "<span>" + link + "</span> " +
      "<span>" + project.pi + " · " + project.department + "</span> " +
      "<span>" + project.status + "</span>";
    return row;
  }

  function initSection(section) {
    var src = section.getAttribute("data-dsg-src");
    var track = section.getAttribute("data-dsg-track") || "";
    var list = section.querySelector("[data-dsg-list]");
    if (!src || !list) return;

    var search = section.querySelector("[data-dsg-search]");
    var yearSelect = section.querySelector("[data-dsg-year]");
    var empty = section.querySelector("[data-dsg-empty]");
    var template = section.querySelector("template[data-dsg-row]");
    var counts = {};
    Array.prototype.forEach.call(section.querySelectorAll("[data-dsg-count]"), function (el) {
      counts[el.getAttribute("data-dsg-count")] = el;
    });

    var projects = [];

    function render() {
      var needle = fold(search ? search.value.trim() : "");
      var year = yearSelect ? yearSelect.value : "";

      var visible = projects.filter(function (p) {
        if (year && p.year !== year) return false;
        return matches(p, needle);
      });

      /* One reflow rather than one per row. */
      var frag = document.createDocumentFragment();
      visible.forEach(function (p) {
        frag.appendChild(template ? buildRow(template, p) : buildPlainRow(p));
      });
      list.textContent = "";
      list.appendChild(frag);

      function tally(status) {
        return visible.filter(function (p) { return fold(p.status) === status; }).length;
      }
      if (counts.shown) counts.shown.textContent = visible.length + " shown";
      if (counts.active) counts.active.textContent = tally("active") + " active";
      if (counts.completed) counts.completed.textContent = tally("completed") + " completed";
      if (counts.terminated) counts.terminated.textContent = tally("terminated") + " terminated";

      if (empty) empty.hidden = visible.length !== 0;

      /* Announce the new result count to screen readers. The region is
         marked aria-live in the markup; changing the text is enough. */
      list.setAttribute("aria-busy", "false");
    }

    function populateYears() {
      if (!yearSelect) return;
      var years = [];
      projects.forEach(function (p) {
        if (p.year && years.indexOf(p.year) === -1) years.push(p.year);
      });
      years.sort().reverse();
      /* Keep whatever "All Years" option the Designer authored. */
      years.forEach(function (y) {
        var opt = document.createElement("option");
        opt.value = y;
        opt.textContent = y;
        yearSelect.appendChild(opt);
      });
    }

    list.setAttribute("aria-busy", "true");

    fetch(src, { credentials: "omit" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        projects = (Array.isArray(data) ? data : [])
          .filter(function (p) { return !track || p.track === track; })
          .sort(byYearDesc);
        populateYears();
        render();
      })
      .catch(function (err) {
        list.setAttribute("aria-busy", "false");
        if (empty) {
          empty.hidden = false;
          empty.textContent =
            "The project list could not be loaded. Please see the Digital Projects Showcase.";
        }
        console.error("[dsg] failed to load " + src, err);
      });

    if (search) {
      var debounce = null;
      search.addEventListener("input", function () {
        clearTimeout(debounce);
        debounce = setTimeout(render, 120);
      });
      /* Enter in a lone search field would submit an enclosing form. */
      search.addEventListener("keydown", function (e) {
        if (e.key === "Enter") e.preventDefault();
      });
    }
    if (yearSelect) yearSelect.addEventListener("change", render);
  }

  function init() {
    var sections = document.querySelectorAll("[data-dsg-projects]");
    Array.prototype.forEach.call(sections, initSection);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
