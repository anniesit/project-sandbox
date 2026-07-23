# Film/TV Archive — Frontend ↔ Backend Integration Handoff

These dependency-free, vanilla-JS components render the archive UI. This doc is
the **integration contract**: what each component expects, what it emits, and
exactly what scaffolding to remove. The JS file headers remain the source of
truth for behaviour — this doc is the quick reference and captures the
project-specific decisions that aren't obvious from the code.

| File | Owns | Public API |
|---|---|---|
| `results.js` | Result list + article/book view toggle | `filmtvResults.render`, `filmtvResults.setView` |
| `chart.js` | Stacked bar chart (entries or books by year) | `filmtvChart.render`, `filmtvChart.setView` |
| `cooccur.js` | Keyword co-occurrence bubble chart (in a modal) | `filmtvCooccur.render`, `filmtvCooccur.redraw` |
| `book.js` | Book page table of contents (one book + attachments) | `filmtvBook.render` |
| `viewer.js` | Book Viewer (page-by-page reader: layout/zoom/rotate/scroll/OCR + 目錄/搜尋/文章資訊 panels) | `filmtvViewer.init`, `filmtvViewer.load`, `filmtvViewer.render` |

`book.js` renders the separate **Book page**. Unlike the others its mock driver
is a **separate file, `book.mock.js`** (sample-data loader + dev switcher) —
delete that whole file rather than stripping an inline fetch. See its section.

`viewer.js` renders the separate **Book Viewer page** and is the same kind of
exception — its mock driver is also a **separate file, `viewer.mock.js`**. See
its section.

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

**`book.js` and `viewer.js` are the exceptions** — their mock drivers are already
separate files (`book.mock.js`, `viewer.mock.js`), not an inline fetch. Just
**delete the mock file** and call `filmtvBook.render()` / `filmtvViewer.init()`
from your own fetch (see each component's section).

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
  "special_issue_belongs_to": null,  // attachment records only -> [data-field=attachment]; empty hides that element
  "href": "#"                // link target for the card
}
```

**Attachment label:** `special_issue_belongs_to` is a free-text "belongs to" label
(e.g. `電影雙周刊第 648 期附件`) carried only by attachment records. `results.js`
fills every `[data-field="attachment"]` element and **hides it when the value is
empty** (so ordinary records show nothing). The mock now loads the combined
`book-sample.json` (TVW/FMP + the 電影雙周刊 CE_0648 family) instead of `2922.json`,
so the attachment records appear in the sample.

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

## `book.js` — Book page table of contents

```js
filmtvBook.render(rootEl, { items, imageBase, counts }, opts);
filmtvBook.showEmpty(rootEl, { emptyHref });   // bare /book route: no book to draw
```

- `rootEl` — the `[data-book]` element (legacy `[data-collection]` also accepted),
  or omit to render every instance.
- `items` — **one book family**: the main book's articles PLUS its attachments'
  articles. Attachments are distinguished by a trailing lowercase letter on
  `bookNumber` (`CE_0001` → `CE_0001a`, `CE_0001b`); the component groups by that
  suffix into a **正刊 tab + 附件 A/B… tabs** (bar hidden when there are none).
- `imageBase` — prefix for bare `item.image` filenames (else `""`), as in `results.js`.
- `counts` — optional `{ articles }` for `[data-count=article]`; else the visible
  count is derived.
- `opts` — optional `{ showExcludedTypes: boolean }` (default `false`). See below.

**`item` shape** — same as `results.js` (above), plus an optional `publisher`
string for the header. `page` drives the TOC order (ascending, stable).

**Type-exclusion (built in):** article types **23, 16, 1, 12, 10** (公司通訊 /
產品商鋪 / 廣告 / 得獎名單 / 表格) are dropped from the TOC. This is applied inside
`render()` (one place: `pickVisible`), so it holds regardless of what you send.
A future "show excluded types" UI toggle just calls `render(root, data, { showExcludedTypes: true })`.

**toc-img (attachment only):** the beside-TOC thumbnail (`img[data-field=toc-img]`
in `.thumbnail.cc-book-toc`) shows an **attachment's first page**, and only while
that attachment's tab is active. For the main book / books with no attachments it
is hidden — and while hidden the component adds `.cc-max-w-90` to the nearest
`.container` to cap the otherwise over-wide TOC (removed when the image shows).
**Webflow must define `.cc-max-w-90`** (the header uses a different `cc-min-w-90`).

**Mock driver — `book.mock.js` (delete on integration):** it fetches the combined
`sample-data/2922.json`, selects one book family by BookNumber (`baseOf` match),
mounts a floating dev switcher, and calls `filmtvBook.render()`. In production
each book is its own route carrying the BookNumber, so you fetch that one book's
family server-side and call `render()` directly — no switcher, no family select.

**Empty state (bare / missing / not-found book):** for the bare `/book` route (no
book in the URL, so no data to render), call `filmtvBook.showEmpty(rootEl)` instead
of `render()` — otherwise the authored placeholder TOC shows as if it were real,
empty content. `render()` also routes there itself if handed an empty family. The
empty block is **authored in Webflow as `[data-empty-state]`** (hidden by
`u-d="none"`, carrying the real search/browse link — nav routes are yours). If that
hook is absent, a minimal fallback is injected whose CTA uses `[data-book]`'s
`data-empty-href` attribute (or `showEmpty`'s `{ emptyHref }`), defaulting to `../`.

**Still open (as of handoff):** (1) `publisher` is absent from the current article
data → the header row hides; supply a `publisher` field or hardcode it in Webflow.
(2) Attachment tab labels (正刊 / 附件 A…) and their real data are unconfirmed until
attachment records exist.

---

## `viewer.js` — Book Viewer (page-by-page reader)

An interactive, **stateful** in-browser reader for ONE book's scanned pages —
unlike the other components (stateless `render(data)`), this one owns a state
machine, event handling, and URL sync. **Complete as of this handoff:** Stage 1
— Page Manipulation (layout, page-turn, zoom, rotation, drag-to-pan, fullscreen,
scroll modes, thumbnail, OCR) — AND the three side panels — Book Metadata
(目錄), Search (搜尋內文), Article Info (文章資訊) — all live in this SAME
file/state/`render()`.

```js
filmtvViewer.init({ root, dataBaseUrl });        // wire once; reads ?book=&page=&article=
filmtvViewer.load(bookNumber, { page, article }); // (re)load a book
filmtvViewer.render();                            // re-render current state
```

- `root` — optional `[data-viewer]` element (else `document`).
- `dataBaseUrl` — base for the data fetch; **`{dataBaseUrl}/{bookNumber}/book.json`**.
  Dev = the local `sample-data` folder; prod = your API (e.g. `/api/books`). The
  path shape is the ONLY thing that changes at deploy — keep it aligned.
- URL contract (shareable): `?book=<n>` · `?book=<n>&page=<i>` · `?book=<n>&article=<id>`.
  Only book/page/article live in the URL; layout/zoom/rotation intentionally do not.
  `history.pushState` on every page change; `popstate` navigates pages.

**Record page (`?id=` only) — book resolution:** the record route carries just the
article id (`/record?id=HDJ-0005`), no `?book=`. viewer.js resolves the article's
book from an **article index**: a JSON map `{ "<articleId>": "<bookNumber>", … }`
(a `{ "articles": { … } }` wrapper is also accepted) served at
**`{data-src}/article-index.json`** — override with `[data-article-index]` on
`[data-viewer]` or `init({ articleIndex })`. It then loads that book scoped to the
article. In production the article-based backend derives the same id→BookNumber map
from its DB (each row already carries `BookNumber`, per the phpMyAdmin export
`202412LDDimport.json`) and serves it at that path (or points `[data-article-index]`
at an equivalent endpoint). For the sample harness, regenerate it with
`node sample-data/build-article-index.js` (scans every `sample-data/<book>/book.json`).
An `?id=` that resolves to no book shows the `找不到文章` empty state.

**Empty state (missing / not-found book, missing record article):** reached with
**no `?book=`** (bare URL / stale bookmark), a book that **fails to load** (404 /
bad data), or a **record page whose `?id=` matches no article**, the viewer shows a
short empty state + a CTA back to search/browse instead of a blank stage (the
record case no longer silently falls back to the whole book). Author the block in
Webflow as **`[data-empty-state]`** (hidden by `u-d="none"`, carrying the real
link); if absent a minimal fallback is injected whose CTA uses `data-empty-href` on
`[data-viewer]` (or `init`'s `{ emptyStateHref }`), default `../`. A
`[data-empty-heading]` leaf, if present, gets a reason-specific heading
(沒有選擇書刊 / 找不到書刊 / 找不到文章).

**`book.json` shape** (backend returns this at the path above):
```json
{ "bookNumber":"2048", "title":"…", "issue":"", "date":"", "publisher":"",
  "bookOrientation":"right",                      // left | right | top | bottom (binding edge)
  "imageBaseUrl":"https://…/2048/",               // full URL = imageBaseUrl + page.file
  "thumbnailBaseUrl":"https://…/",                // optional; falls back to imageBaseUrl
  "pages":[ { "label":"封面", "file":"2048_001.jpg", "width":700, "height":1000 } ],
  "articles":[ { "id":"…","title":"…","author":"","pageStart":3,"pageEnd":8,"articleBody":"…",
    "type":"9","page":"3","section":"曲詞","keywords":"a---b---c","externalLink":"https://…" } ] }
```
The first six article keys drive the reader (OCR + navigation); the last five feed
the **side panels** and are the same catalogue fields the Book page already shows —
all OPTIONAL (each degrades gracefully when absent): `type` (ArticleType code ->
label + the meta-TOC type-exclusion, same set as the Book page), `page` (printed
page shown as 頁碼), `section` (專欄; the reader also reads this for OCR), `keywords`
(`---`-joined chips), `externalLink` (catalogue/film-DB URL). `pageStart`/`pageEnd`
are **1-based indices into `pages[]`** (reading position), NOT
printed page numbers. `label` is a pre-formatted display string (backend maps
special cases like 封面/封底); the viewer never sees raw numeric page values.

**Webflow HTML contract:** author the ids / `data-*` hooks / `<template>` elements
listed in the header comment of `viewer.js` (IDs must match exactly). Layout & Zoom
use the design-system **dropdown component** — the viewer reads them via the
`input` event on each dropdown's hidden `<input>`. The Layout/Zoom **step +/−
buttons are intentionally absent** (design decision — dropdown only); to add a
zoom level, add one entry to `ZOOM_PRESETS` in `viewer.js` + one `<li>` option.
The page number is an **editable numeric jump input** (`#js-page-input`).

**Search (搜尋內文) is 100% client-side** — it filters `state.book.articles`
already sitting in memory from the `book.json` fetch (title, author, section,
keywords, and the OCR `articleBody` with HTML tags stripped). No backend search
endpoint is called. This depends on `articleBody` being present up front, so it
directly trades off against backend ask (3) below: if you lazy-fetch
`articleBody` per article instead of inlining it, full-text search over OCR
content will silently stop matching anything beyond title/author/keywords.

**Mock driver — `viewer.mock.js` (delete on integration):** points `dataBaseUrl`
at `sample-data`, inits the viewer (default book **2922** = 《多情河歌集》 (1957),
real article data from `sample-data/2922.json` + real page scans on the library
CDN; book **2048** 《花燈記》 also available via the switcher), and mounts a floating
dev switcher (swap BookNumber + force any of the four `bookOrientation` values). In
production you `init()` once and let the viewer read the page URL — no switcher.

**Backend asks (perf — the JS is cheap, images/data are not):** (1) provide
`thumbnailBaseUrl` (thumbnail tier); (2) include `pages[].width`/`height` (kills
layout shift); (3) decide whether `articles[].articleBody` ships in `book.json`
or is lazy-fetched per article — inlining all OCR can push `book.json` to MB-scale
and block first render, **but lazy-fetching breaks client-side OCR search** (see
Search note above) — pick one and own the tradeoff.

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

Most of these are decided by the `{ years, series }` you send; two are built into
`chart.js` and switch automatically on `data-view="book"` (points 4–5). The book
chart / **collection page** differs from the search-page article chart in these
ways:

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

4. **Static legend** — in book view the legend is DISPLAY-ONLY: items render as
   non-interactive `<div>`s (no `data-key`, no hover/cursor/tap) and fire **no**
   `filmtv:filter`. Publication filtering there is done by the page's own controls,
   not the legend. (Article view keeps interactive `<button>` legend items.)
5. **Bar-tooltip label** — book view's commit button reads **`查看此年刊物`**
   (article view: `查看此年結果 →`). A bar click still emits the same
   `filmtv:filter { year }` — only the label wording differs.

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

**Year panel ≤991px (July 2026):** the year panel is a `<dialog class="panel
cc-year">` (design-system MAST modal component, same pattern as `cooccur.js`'s
modal). On desktop it renders in-flow as a normal panel; ≤991px it's hidden and
a `.cc-year-trigger` button (hidden on desktop, sitting right after the dialog)
opens it as a real modal via `all.js`'s standard "dialog + button" wiring. The
trigger's label is just another `[data-count="year-label"]` element, so
whatever renderer fills that hook (today `collection.js`, in production the
backend's own renderer) keeps the button in sync for free. See
`collection.html` for the exact markup/CSS to replicate in Webflow.

**Known `all.js` bug + companion script (needed on the live site, not just
here):** the vendored `all.js` (`design-system/bundles/all.js`, MAST's
`modal.js`) opens a `dialog + button` trigger via `t.closest("dialog +
button")` but then reads `previousElementSibling` off the **raw click
target**, not off that matched button — so it only opens the dialog if the
click lands exactly on the `<button>` element itself, not a child. Our
trigger wraps its label in a div/span (for the `data-count="year-label"`
hook), so this needs `.collection-year-trigger * { pointer-events: none; }`
in the site's custom CSS, or the modal never opens on a real click. There's
also a real edge case with no CSS-only fix: opening the dialog at ≤991px then
widening the viewport past 991px without closing it first leaves the dialog
stuck in `:modal` state (small, fixed, centered) instead of reverting to the
inline panel, since crossing the breakpoint doesn't itself change the
dialog's open state. See the second `<script>` block at the bottom of
`collection.html` for both the close-button fallback and the
breakpoint-cross auto-close — that script (not just the CSS) needs to be
added to the live Webflow page too. **Delegate the close-button fallback on
`document`** (`document.addEventListener("click", …)`, checking
`e.target.closest(...)` inside), not an eager
`querySelectorAll(...).forEach(addEventListener)` at script-load time — the
eager form silently attaches to nothing if the script tag executes before
the dialog/button exist in the DOM yet (e.g. a site-wide "before `</head>`"
custom-code embed). This bit us once already: the breakpoint-cross fix
worked immediately because it's event-driven (only queries the DOM when the
user actually resizes, by which point the page is loaded); the close-button
fix silently failed until rewritten the same way.

**Stray duplicate `[data-tpl="year-button"]` (spotted July 2026):** if the
live year list ever shows an extra, wrongly-styled year pill that
`collection.js` didn't clone (no `data-clone`/`data-year` attributes) sitting
right after the real hidden template — that's a leftover duplicate template
`<li>` in the Webflow build (e.g. from copy/pasting while designing), not a
JS bug. `collection.js`'s `renderYears()` only ever looks at the **first**
`[data-tpl="year-button"]` match via `querySelector` and hides/clones from
that one; a second stray copy elsewhere in the same list is never touched.
Remove the duplicate `<li>` in the Designer.

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

`viewer.js` fires **no `filmtv:*` events either** — unlike the other components,
it doesn't hand search state to a backend listener. It self-fetches its own
`book.json` via `dataBaseUrl` and owns its state end-to-end (see its section).

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
- [ ] `book.js`: delete `book.mock.js`; fetch one book's family server-side per route and call `filmtvBook.render()` directly (no family switcher).
- [ ] `viewer.js`: delete `viewer.mock.js`; call `filmtvViewer.init({ root, dataBaseUrl })` once and let it read `?book=&page=&article=` from the URL (no dev switcher). Decide the `articleBody` inline-vs-lazy tradeoff (breaks client-side search if lazy — see the `viewer.js` section).
- [ ] Push to the repo — Vercel auto-deploys from `project-sandbox` (see "Deploy" above); no CDN purge or manual export step needed.
