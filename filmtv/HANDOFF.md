# Film/TV Archive — Frontend ↔ Backend Integration Handoff

Three dependency-free, vanilla-JS components render the search experience. This
doc is the **integration contract**: what each component expects, what it emits,
and exactly what scaffolding to remove. The JS file headers remain the source of
truth for behaviour — this doc is the quick reference and captures the
project-specific decisions that aren't obvious from the code.

| File | Owns | Public API |
|---|---|---|
| `results.js` | Result list + article/book view toggle | `filmtvResults.render`, `filmtvResults.setView` |
| `chart.js` | Stacked bar chart (entries or books by year) | `filmtvChart.render`, `filmtvChart.setView` |
| `cooccur.js` | Keyword co-occurrence bubble chart (in a modal) | `filmtvCooccur.render`, `filmtvCooccur.redraw` |

## Ownership split (read this first)

The frontend owns the **visual + the click affordance**. The backend owns the
**search state**: fetching, pagination, loading spinner, result limits, and the
max-5-keyword rule. On a user action a component **fires a bubbling event and
does nothing else** — the backend listens, mutates the query, re-fetches, and
calls `render()` again. Components keep no search state of their own.

## Deploy (important)

The Webflow page loads these files **live from Vercel**:
`https://hkbuproject-sandbox.vercel.app/filmtv/…` (e.g. `.../chart.js`). The
project-sandbox is deployed there, so **pushing updates production automatically**
— no CDN purge or manual export step. Just reference the Vercel URL from Webflow.

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

**View toggle (article/book):** both views share ONE payload — `render()` fills
both panels at once — so flipping the toggle is a pure CSS panel swap (article
cards ⇄ book rows). It does **NOT** re-fetch, re-render, or fire any event. A book
row shows **all** its articles on the current page, with no in-book collapse. The
chart is article-only and does not follow this toggle.

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

Each `counts` / `bookCounts` array is **index-aligned to `years`**. Send both:
this page's chart renders `counts` (篇), and the separate **book chart page**
renders `bookCounts` (本). A chart instance picks which via `data-view` (below).

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

Bars grow from 0 (~200ms) on **every `render()`**; resize redraws are static.
- **Pagination:** never call `filmtvChart.render()` on a page turn, or the bars
  re-grow. The chart reflects the whole result set, not a page.

### Emits

- `filmtv:filter` `{ detail: { year, publication, label, prefixes } }`
  - click a **bar** → `{ year, publication:null, … }`
  - click a **legend item** → `{ year:null, publication, label, prefixes }`

```js
document.addEventListener("filmtv:filter", e =>
  applySearchFilters(e.detail).then(data => filmtvChart.render(e.target, data)));
```

**Count view per instance.** A chart element counts entries (篇) by default, or
distinct books (本) when it sets `data-view="book"` — used by the separate **book
chart page**. The chart does **not** follow the results article/book toggle on its
own. The model always carries both `counts` and `bookCounts`, so either view
renders from one payload.

```html
<div data-chart></div>                 <!-- entries (篇), the default -->
<div data-chart data-view="book"></div><!-- distinct books (本), book chart page -->
```

A host that wants its own switcher (e.g. the demo page) can flip a live chart
without re-fetching — it's a pure redraw from the same model:

```js
filmtvChart.setView(rootEl, "book");   // or "article"
```

### Book view — differs from article view (backend shapes the payload)

`chart.js` needs **no special code** for these; they're all decided by the
`{ years, series }` you send. The book chart / **collection page** differs from
the search-page article chart in three ways:

1. **Book count, not article count** — `data-view="book"` renders `bookCounts[]`
   with the 本 unit (article view renders `counts[]` / 篇).
2. **Year axis fitted to the publication's span** — article view keeps the
   STABLE full-archive axis (1926–1997); book view passes only that
   publication's years (e.g. 香港電視 → 1967–1997, contiguous + zero-filled), so
   the axis fits its earliest–latest year.
3. **電影雙周刊 is split, not merged** — in article view its 9 id prefixes
   (`CEM, CEI, CEY, CED, CEF, CEV, CEH, CEP, CEO`) roll up into ONE 電影雙周刊
   series. In book view send them as **9 separate series** (own `key`/`label`), so
   each sub-line gets its own stack + legend entry. **Colours are NOT in the
   payload** — they live in `chart.css` (`--filmtv-chart-ce-<prefix>`, e.g.
   `--filmtv-chart-ce-cem`) and `chart.js` applies them by key. The taxonomy
   colours (`--filmtv-chart-color-1..4`) are unchanged; merged CEM keeps color-3,
   split CEM (正刊) uses `--filmtv-chart-ce-cem`.

The book-view **filter set** is the 4 publications: 電影小冊子 / 香港電視 /
電影雙周刊 / 電影雙周刊出版書籍 (article view keeps the search-result filters).
Demo of all of the above: `chart.html` (view toggle swaps the filter presets and
the dataset); the split book dataset is `sample-data/chart-book-sample.json`.

### Collection page (one publication)

`/collection` shows every book of one publication — a year selector, a grid of
cover cards, and this chart in book view for that publication only. The chart is
`chart.js` unchanged: mount `<div data-chart data-view="book">` and feed it
`{ years:<pub span>, series:[<that one publication, with bookCounts>] }`. The
year buttons + cover cards are rendered separately (mock: `collection.js`, NOT
part of this handoff — the backend renders them from the by-article payload,
grouping by `bookNumber` exactly like results.js book rows).

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
| `filmtv:filter` | chart.js | `{ year, publication, label, prefixes }` | narrow query, re-fetch, re-render chart |
| `filmtv:addKeyword` | cooccur.js | `{ key, label, total }` | add term, close modal, re-search (max 5) |

The results article/book toggle fires **no event** — it's a pure CSS panel swap
over one shared payload (see results.js notes).

All events **bubble to `document`**.

## Integration checklist

- [ ] Remove `DATA_URL` + `mockFetch()` from `results.js`, `chart.js`, `cooccur.js`.
- [ ] Reimplement the demo `<script>` drivers in `chart.html` / `cooccur.html` against the live fetch.
- [ ] Call `filmtvResults.render()` **per page**; wire pagination to results only.
- [ ] Call `filmtvChart.render()` **per search/filter** with pre-aggregated `{ years, series }` (each series carries both `counts` and `bookCounts`); pass the full archive `years` by default, the user's input range when year-filtered.
- [ ] Set `data-view="book"` on the book chart page's chart element; leave it default (article) elsewhere.
- [ ] Book view: fit `years` to the publication's span (not the full archive), and send 電影雙周刊 as its 9 CE\* prefixes split into separate series (see "Book view" above).
- [ ] Collection page: feed the book chart one publication's series; render the year buttons + cover cards from the by-article payload grouped by `bookNumber`.
- [ ] Don't call `filmtvChart.render()` on page turns.
- [ ] Listen for the two `filmtv:*` events (`filmtv:filter`, `filmtv:addKeyword`) and round-trip them.
- [ ] Run the CDN export/republish step so production picks up the change.
