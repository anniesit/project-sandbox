# Film/TV Archive — Frontend ↔ Backend Integration Handoff

Three dependency-free, vanilla-JS components render the search experience. This
doc is the **integration contract**: what each component expects, what it emits,
and exactly what scaffolding to remove. The JS file headers remain the source of
truth for behaviour — this doc is the quick reference and captures the
project-specific decisions that aren't obvious from the code.

| File | Owns | Public API |
|---|---|---|
| `results.js` | Result list + article/book view toggle | `filmtvResults.render`, `filmtvResults.setView` |
| `chart.js` | Stacked bar chart (entries by year) | `filmtvChart.render` |
| `cooccur.js` | Keyword co-occurrence bubble chart (in a modal) | `filmtvCooccur.render`, `filmtvCooccur.redraw` |

## Ownership split (read this first)

The frontend owns the **visual + the click affordance**. The backend owns the
**search state**: fetching, pagination, loading spinner, result limits, and the
max-5-keyword rule. On a user action a component **fires a bubbling event and
does nothing else** — the backend listens, mutates the query, re-fetches, and
calls `render()` again. Components keep no search state of their own.

## Deploy / CDN (important)

The live Webflow page loads these files from the **CDN**, not from this repo.
Editing the source here does **not** change production until you run the
export/republish step. (There is a stale mirror at
`hkbuproject-sandbox.vercel.app/filmtv/` — sync or ignore it deliberately.)

---

## The integration seam — replace the mock driver

Each JS self-fetches a sample file so the `*.html` pages preview standalone.
That's the **mock driver**; remove it and call `render()` with live data.

**In every JS file** (`results.js`, `chart.js`, `cooccur.js`):
- Delete the `>>> MOCK DATA URL <<<` constant (`DATA_URL`) and the `mockFetch()`
  function, and its call inside `initChart()` / the bootstrap.
- Keep everything else — the components still self-initialise on
  `DOMContentLoaded` from their `[data-*]` host elements.

**In the demo HTML** (`chart.html`, `cooccur.html`) the inline `<script>` driver
is a **backend stand-in** — don't just delete it, *reimplement its calls* against
your real fetch:
- `chart.html` (the demo-only driver block): models fetch → filter → `render()`,
  and the `filmtv:filter` round-trip. Your backend does the same with live data.
- `cooccur.html`: models the modal open + the `filmtv:addKeyword` round-trip.

After removal, your backend is responsible for calling `render()` at the right
times (see each component below).

---

## `results.js` — result list

```js
filmtvResults.render(rootEl, { items, counts, imageBase });
filmtvResults.setView(rootEl, "article" | "book");
```

- `rootEl` — the `[data-results]` element, or omit to render all instances.
- `items` — array for the **current page** (book view groups them by `bookNumber`).
- `counts` — `{ articles, books }` for the toggle labels (optional; else derived).
- `imageBase` — prefix prepended when `item.image` is a bare filename (else `""`).

**`item` shape** (per entry):

```jsonc
{
  "id": "FMP-120504",        // first 3 chars = publication key (FMP/TVW/CEM/CEB)
  "bookNumber": "2922",      // book-view grouping key (one book per bookNumber)
  "journal": "多情河歌集",     // publication name
  "journalIssue": null,      // 期 number or null; rendered as "第N期"
  "datePublished": "1957-01-01",
  "year": "1957",            // used by chart.js when items are raw
  "title": "多情河歌集",       // empty -> "無標題"
  "section": null,           // multi-value joined by "---"; empty -> row hidden
  "author": null,            // multi-value joined by "---"; empty -> row hidden
  "page": "1",
  "type": "14",              // article-type code -> ARTICLE_TYPES[code] in results.js
  "image": "https://…/2922_001.jpg", // full URL, or filename + imageBase; "---" picks first
  "href": "#"                // link target for the card
}
```

**Access tag (id-prefix driven):** each card/book-row thumbnail has a Webflow
`.access-tag` authored **hidden** (`u-d="none"`). `results.js` reveals it when the
entry's 3-char id prefix is listed in `ACCESS_TAG_PREFIXES` (currently `["TVW"]`).
A book shares one prefix across its articles, so the book-row uses its first item.
To cover more publications, add prefixes to that constant — no backend change.

**Pagination:** call `render()` once **per page**. A page turn must NOT re-render
the chart (see chart notes). The result list paginates; the chart does not.

**Emits** `filmtv:viewchange` `{ detail: { view } }` when the user flips the
article/book toggle (only on an actual change). Article and book views share ONE
payload — `render()` fills both panels at once — so the toggle is a pure CSS panel
swap. Do **NOT** re-fetch or re-render results on this event. It fires only so the
chart mirrors the view (see chart notes); a book row shows **all** its articles on
the current page, with no in-book collapse.

---

## `chart.js` — stacked bar chart

```js
filmtvChart.render(rootEl, { years, series, counts });  // pre-aggregated (preferred)
filmtvChart.render(rootEl, { items });                   // raw — chart aggregates
```

**Pre-aggregated shape (send this for the real archive):**

```jsonc
{
  "years": [1926, 1927, …, 1997],   // CONTIGUOUS, ascending, zero-filled
  "series": [
    {
      "key": "FMP",                 // publication key (taxonomy in chart.js)
      "label": "電影小冊子",          // legend label
      "prefixes": ["FMP"],          // id prefixes that roll into this series
      "counts":     [15, 0, 0, …],  // entries per year (article view)  — aligns to years[]
      "bookCounts": [ 1, 0, 0, …]   // distinct books per year (book view) — aligns to years[]
    }
  ],
  "counts": { … }                   // optional; not required by the chart
}
```

Each `counts` / `bookCounts` array is **index-aligned to `years`**. Provide both
so the article/book toggle works without a re-fetch.

### X-axis range — PROJECT RULE

The chart draws **exactly the `years` it's given** (raw `items` auto-fit to the
min/max year present). The agreed behaviour:

| State | `years` to pass |
|---|---|
| Default, incl. **publication/keyword filters** | the **full archive span** (e.g. 1926–1997) → stable, comparable axis |
| **Year-range filter** active | every year in the **user's input range**, contiguous + zero-filled |

When a year filter is active, the axis spans the **user's requested range, not
the result span** — so empty years inside the window stay visible (they're
meaningful: "you asked for these years; these had nothing"). To guarantee this,
send pre-aggregated `years` (raw `items` can't represent empty edge years).

### Grow animation

Bars grow from 0 (~200ms) on **every `render()`** and on the **article/book
toggle**; resize redraws are static. Two rules:
- **Pagination:** never call `filmtvChart.render()` on a page turn, or the bars
  re-grow. The chart reflects the whole result set, not a page.
- **Toggle:** handled internally via `filmtv:viewchange` — do **not** also call
  `render()` on toggle, or the grow double-fires.

### Emits

- `filmtv:filter` `{ detail: { year, publication, label, prefixes } }`
  - click a **bar** → `{ year, publication:null, … }`
  - click a **legend item** → `{ year:null, publication, label, prefixes }`

```js
document.addEventListener("filmtv:filter", e =>
  applySearchFilters(e.detail).then(data => filmtvChart.render(e.target, data)));
```

Also listens to `filmtv:viewchange` (from `results.js`) to switch article/book.

---

## `cooccur.js` — co-occurrence bubble chart

```js
filmtvCooccur.render(rootEl, { keyword, years, series });
filmtvCooccur.redraw(rootEl?);   // re-measure + redraw (e.g. after modal opens)
```

**Shape (pre-aggregated — backend computes the co-occurrence):**

```jsonc
{
  "keyword": "楚原",                 // the searched keyword
  "years": [1955, …, 1997],         // article years, index-aligned to counts[]
  "series": [
    {
      "key": "張寶堅",               // unique key (defaults to label)
      "label": "張寶堅",             // y-axis row label / legend
      "total": 343,                 // total co-occurring articles (sorts rows desc)
      "counts": [0, 0, 0, …]        // per-year article count — aligns to years[]
    }
  ]
}
```

Any order/length is fine: cooccur.js sorts by `total` desc, keeps the **top 10**,
and colours by row.

**Grow animation:** on each `render()` the bubbles grow from 0 (~200ms),
staggered left→right within a row and row-by-row top→bottom (~50ms/row). It runs
on the first **sized** draw — strips are 0-size until the modal opens, so it
fires on open. If you open the modal without re-rendering, call
`filmtvCooccur.redraw(rootEl)` to (re)measure. Tunables `ANIM_ROW_DELAY` /
`ANIM_COL_STEP` / `ANIM_DUR` are at the top of `cooccur.js`.

**Emits** `filmtv:addKeyword` `{ detail: { key, label, total } }` on a row/legend
click. The backend owns everything after: add the term, close the modal, reflect
it in the search input, re-run the search, and enforce the **max-5-keyword rule**
(show the limit message only when the search already holds 5):

```js
document.addEventListener("filmtv:addKeyword", e => addTermAndSearch(e.detail.key));
```

---

## Event summary

| Event | Fired by | Detail | Backend does |
|---|---|---|---|
| `filmtv:viewchange` | results.js | `{ view }` | nothing for results (both panels already rendered); chart switches its own counts |
| `filmtv:filter` | chart.js | `{ year, publication, label, prefixes }` | narrow query, re-fetch, re-render chart |
| `filmtv:addKeyword` | cooccur.js | `{ key, label, total }` | add term, close modal, re-search (max 5) |

All events **bubble to `document`**.

## Integration checklist

- [ ] Remove `DATA_URL` + `mockFetch()` from `results.js`, `chart.js`, `cooccur.js`.
- [ ] Reimplement the demo `<script>` drivers in `chart.html` / `cooccur.html` against the live fetch.
- [ ] Call `filmtvResults.render()` **per page**; wire pagination to results only.
- [ ] Call `filmtvChart.render()` **per search/filter** with pre-aggregated `{ years, series }`; pass the full archive `years` by default, the user's input range when year-filtered.
- [ ] Provide both `counts` and `bookCounts` per chart series so the toggle needs no re-fetch.
- [ ] Don't call `filmtvChart.render()` on page turns or on the toggle.
- [ ] Listen for the three `filmtv:*` events and round-trip them.
- [ ] Run the CDN export/republish step so production picks up the change.
