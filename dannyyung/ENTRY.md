# Entry page (作品) — build notes and data contract

Webflow site `6a8fda591c4e266dbbb91533`, page `6a964dea5ea3a5fbb284aefb`,
slug `/entry`, Traditional Chinese. Made by duplicating the `Template` page, so
it inherits the site-wide `page-wrapper > page-main > section > container`
shell — the Figma frame does not have that structure, and it was not copied.

Built from Figma `EntryPage` (`394:1242`), its material component's four
variants (`394:1284`), and the tablet frame `EntryPage (Tablet)` (`405:2200`).

This is a **wireframe**, like the catalogue. Structure, semantics and tokens are
right; visual design is deliberately untouched.

## One page, 88 works

There is no CMS behind the 88 works, so there is one wireframe page that reads
`?id=` from the URL:

```
/entry?id=DYP-000012
```

The catalogue's `href` field now carries exactly that (`ENTRY_PATH` in
`build-catalogue-sample.py`). `catalogue.js` only ever copies `item.href` onto
the row link, so **when the backend has real routes, it changes that one field
and nothing else** — no markup edit on either page.

The local harness is the exception: `catalogue.html` rewrites `/entry?id=…` to
`./entry.html?id=…` on click, because the static server has no `/entry` route.
That rewrite lives in the harness's own demo script, not in `catalogue.js`.

## Page structure

```
.container
  div[data-entry][data-src]                        ← entry.js renders into this
    nav.entry-breadcrumb          目錄 / 類別 / 標題
    .entry-back > a[data-back]    ← 返回
    .entry-head                   grid: 1fr 28rem
      .entry-info
        span.result-tag           the category chip (reused from the catalogue)
        h1.entry-title
        dl.kv                     日期 / 場地 / 地點 / 導演
        details.accordion-component.cc-kv   備註 — see below
      .entry-hero[data-hero]      placeholder — no hero images exist yet
    nav.entry-nav                 ← 上一項  /  下一項 →
    section.materials-section
      h2.entry-section-head       館藏資料
      .materials                  grid: 20rem 1fr
        .material-groups[data-groups]
          .material-group[data-group-template]     ← cloned per content category
            .material-group-label                  label + count
            ul.thumb-grid[data-group-items]
              li.thumb-item[data-thumb-template]   ← cloned per material
                button.thumb > img.thumb-image + span
        .material-viewer
          .viewer-stage[data-viewer=image]  > img
          .viewer-stage[data-viewer=pdf]    > iframe
          .viewer-stage[data-viewer=video]  > video[controls]
          .viewer-stage.cc-empty[data-viewer=empty]
          .material-meta[data-material]
            div[data-material-template] > .result-tag + dl.kv
    HtmlEmbed                     "Page JS — entry.js (Vercel)"
```

`.result-tag` is reused verbatim from the catalogue rather than redrawn — it is
the same bordered token box, and it is used for both the work's category and
the material's content category.

## 返回 / 上一項 / 下一項

Added 2026-09-01 from Figma `394:1251`: 返回 sits above the head, the two
neighbour links below it.

### Previous and next follow the SORT, not the id

An id-ordered "next" would throw the reader from a 1981 theatre production into
an unrelated 1994 exhibition, because the ids are an accession order nobody is
browsing by. "Previous" only means something relative to a **result set** — the
one the user filtered and sorted on the catalogue — so that is what the arrows
walk. Filter to 視覺藝術 sorted by title, open the second of four, and the arrows
move within those four.

They also cross page boundaries: the catalogue hands over the **whole matching
list**, not just the twelve rows on screen, so item 12 → item 13 works without
going back to paginate.

**`entry.js` does not compute this.** It is handed a context and renders it:

```js
window.dyEntry.render(root, record, {
  backHref: "/catalogue?category=visual-arts",
  prev: { id, title, href } | null,
  next: { id, title, href } | null
});
```

Whoever owns the query owns the answer — the mock driver reads it from the
catalogue's handoff, the backend will answer it from the server. Same seam as
`dy:query`. A backend that paginates and never sees the full list can answer
"neighbours of X given query Q" instead; `entry.js` is unaffected.

At the first and last record the missing arrow is **hidden, not disabled** — a
dead control there is noise. `.entry-nav-link.cc-next` carries `margin-left:
auto` rather than the nav using `space-between`, so 下一項 stays hard right when
上一項 is gone.

### 返回 goes back to the catalogue you were browsing

Yes — and making that true needed the catalogue view to be **addressable**,
which it was not. `catalogue.js` now:

- writes its query to the URL (`/catalogue?category=visual-arts&sort=title`)
  with `replaceState` — not `pushState`, or typing in the search box would fill
  the Back history with one entry per keystroke;
- restores from that URL on load via the new `dyCatalogue.applyQuery(root, q)`,
  which sets the radios, the year inputs, the search box and all three dropdowns
  (options, trigger label **and** the hidden input `forms.js` reads — miss any
  one and the control lies about itself);
- stores that URL, plus the ordered id list, in `sessionStorage` under
  `dy:catalogue-context` on its way out.

`返回`'s href is that stored URL, so it returns to the exact filtered, sorted,
paginated view. Not `history.back()`: a real `href` also works from a cold
landing, survives a middle-click into a new tab, and is a real link for anything
crawling the page.

Restoration has to happen **after the facets are built**, because the location
and director options are generated from the data — a value cannot be selected in
a list that does not exist yet. That is why it runs inside the mock driver's
fetch callback rather than at page load.

`sessionStorage`, not `localStorage`: this is one session's browsing context and
must not leak into a tab opened days later.

**Fallbacks.** Landing on an entry URL cold — a bookmark, a search result, a
shared link — means no stored context. 返回 then goes to plain `/catalogue`, and
the arrows walk the full list in the catalogue's default sort (newest first).
The arrows still work; they just walk an unfiltered list. Hiding them would be
worse, and inventing a filter would be a lie.

**Side effect worth having:** catalogue views are now shareable. `/catalogue?location=台北&sort=title`
opens on those five results.

### The breadcrumb and 返回 are kept as a deliberate pair

They look redundant and are not:

| | Answers | Carries |
|---|---|---|
| 返回 | "take me back to what I was doing" | the user's whole query — filters, sort, page |
| 目錄 / 劇場 crumb | "where am I, and what is this a part of" | nothing, or just the category |

**返回 appears only when there is somewhere to go back to.** On a cold landing —
a bookmark, a shared link, a search result — there is no stored catalogue
context, and a "back" that leads somewhere the reader has never been is a lie.
The whole `[data-back-region]` wrapper is hidden, not just the anchor, or its
bottom margin would leave a gap. Nothing becomes unreachable: the breadcrumb
still offers 目錄 and the category.

### The category crumb goes to the filtered catalogue

`/catalogue?category=theatre-production` — "all 劇場 works". It deliberately
carries **only** the category, not the user's other filters or their page: it is
a position in the hierarchy, not a return to a session. 返回 is the control that
resumes a session.

The href comes from `context.categoryHref`, not from `entry.js` — routing is the
backend's, same as prev/next and for the same reason.

The **six records with no category** get no crumb at all. The anchor and the
separator after it both carry `data-field-group="category"`, so the existing
empty-field rule removes both and the breadcrumb reads 目錄 / 標題 with one
separator, not two.

## The material groups are accordions too

Each content category is the same design system accordion as 備註, with a
`cc-group` combo set instead of `cc-kv`: no card border, a bottom rule under the
header, the count beside the title and the icon pushed right with
`margin-left: auto`.

**Only the first group starts open**; the rest render collapsed. Collapsing
earns its place on the worst record: `DYP-000074` has **141 materials in three
groups**, and its left column measures **7,769px** — the accordion is the only
thing that makes that record reviewable. Opening the first group means the
reader still lands on visible material rather than a stack of closed bars.

`entry.js` sets this per clone, and the template in Webflow must carry neither
attribute. Both are needed on the open one, and neither can come from the
template:

- Webflow **drops a valueless `open` attribute when it publishes**, so a
  template marked open in the Designer arrives closed on the live site.
- `data-accordion-start-open="true"` only *protects* an existing `open` from
  being stripped by the design system. It never adds one.
- The closed groups must **not** carry `data-accordion-start-open`, or the
  design system skips collapsing them to `height: 0` and their first open
  animates from full height to full height — i.e. visibly not at all.

**Two global classes cannot share an element in Webflow**, so the old
`.material-group` and `.material-group-label` are gone; the accordion classes
plus `cc-group` carry the styling. Both dead classes were deleted.

**The cloned groups need `MastAccordion.init()` to animate.** The open/close
transition is a pair of listeners the design system attaches on
`DOMContentLoaded` — it is not CSS. `cloneNode()` copies attributes and children
but **not listeners**, so every group `entry.js` builds is an unbound copy and
falls back to the browser's instant native toggle. `buildGroups()` therefore
calls `window.MastAccordion.init()` after appending, which wires up anything new
and skips anything already bound.

Two rules follow for anyone touching this code:

- The call must come **after** the appends. `init()` reads the document, and it
  is what collapses the closed groups to `height: 0`.
- `template()` strips `data-accordion-bound` from the lifted template. The
  design system stamps that attribute on every accordion it wires up and skips
  anything carrying it; a clone inherits the stamp without the listeners, so an
  un-stripped clone is invisible to `init()` forever.

## 備註 is the design system's accordion

The notes field is long — up to 50 lines — so it collapses. It uses the design
system's accordion (`components/accordion`), which is a native
`<details>`/`<summary>`: the CSS rotates `.accordion-icon` 45° when open (a plus
becoming a cross) and the JS only adds the open/close height animation. The JS
skips any `<details>` without both a `<summary>` and a
`[data-accordion="content"]` child, so that hook is required, not decorative.

The classes shipped with the Mast starter but **had never been placed on this
site** — there was no instance anywhere to copy, so the markup was built from
the class names and the JS's own requirements.

**The design system's base classes were not touched.** Five `cc-kv` combos make
the accordion sit flush with the `dl` above it instead of reading as a bordered
card:

| Combo | What it changes |
|---|---|
| `.accordion-component.cc-kv` | drops the right/bottom/left borders and the radius, keeping only the top border so it continues the rows' rhythm |
| `.accordion-trigger.cc-kv` | zeroes the card padding; `align-items: flex-start` so the icon sits on the first line |
| `.accordion-title.cc-kv` | `width: 9.5rem` and the exact padding of `.kv-key`, so 備註 lands in the same column |
| `.accordion-icon.cc-kv` | 2em → 1rem, matching the dropdown chevrons |
| `.accordion-content.cc-kv` | `padding-left: 9.5rem`, so the note starts where every other value does |
| `.accordion-content_spacer.cc-kv` | the bottom padding and `white-space: pre-line` |

Measured in the harness: the title box is 152px wide starting at x=60, identical
to `.kv-key`; the open note starts at x=212, identical to `.kv-val`.

`white-space: pre-line` moved here from `.kv-val.cc-notes`, which no longer
exists — the notes row is not a `kv-row` any more.

## The key/value rows are a real `<dl>`

Every row on this page is a term and its value, so the info block and the
material metadata are both `dl > div.kv-row > dt.kv-key + dd.kv-val`. Wrapping
each pair in a `div` is valid HTML5 and is what lets the row be one flex line
and one `[data-field-group]` target.

**Discovery worth keeping:** `data_whtml_builder` passes `<dl>/<dt>/<dd>`
through untouched — they come back as real `DOM` elements with the right tags,
and a whole nested subtree lands in **one** action. The coercion problem is
limited to `form/input/select/ul/li/label`. That turned ~30 element-builder
calls into two WHTML calls.

The cost: **WHTML writes a literal `class` attribute on DOM-tagged elements**
alongside the Webflow style, so `<dt class="kv-key">` comes back with both, and
would publish as `class="kv-key kv-key"` — worse, the raw attribute survives a
rename in the Designer and would keep matching a stale selector. Every one was
removed after the build (`remove_attribute` on `class`); a final query for
`attribute_name: "class"` returns 0. **Do this cleanup after any WHTML batch.**

It only affects elements that come back as type `DOM` (`dl`, `dt`, `dd`, `svg`).
Elements Webflow maps to native types — `Block` from a `div` or `nav`, `Link`
from an `a`, `Span` from a `span` — come back clean, confirmed on the
back/prev/next batch.

## Designing this page in the canvas

Two things about the Designer are worth knowing before rearranging anything
here, because both have already caused a broken layout once.

**The canvas does not apply code embeds.** The
`[hidden] { display: none !important }` rule that makes exactly one viewer state
show lives in the project override block, so while designing it does not exist —
all four stages render at ~500px each, a 2000px column with nothing to lay out
against. That is fixed with `.viewer-stage.cc-hidden`, a **real Webflow class**
the canvas honours. `entry.js` toggles the class and the `hidden` attribute
together in `showViewer()`: the attribute carries the meaning (it hides the
state from assistive tech, which a class cannot), the class carries the pixels.
Change one without the other and the canvas and the live page disagree.

**The authored default state is `empty`, not `image`.** Every material resolves
to the placeholder today because `src` is blank on all 1,164, so the canvas now
shows what the page actually renders — and it is the only stage with text to
design against. The other three carry `hidden` + `cc-hidden`.

**`.materials` is a two-column grid and must keep exactly two children:**
`.material-groups` and `.material-viewer`. The group template belongs *inside*
`.material-groups`. Dragging it out gives the grid three children, and the
viewer wraps onto row 2, column 1 — which looks like "the viewer moved into the
left column". If that happens, put `[data-group-template]` back inside
`[data-groups]`; nothing else is wrong.

The Navigator names each stage (`Viewer: image`, `Viewer: PDF`, `Viewer: video`,
`Viewer: not uploaded (default)`) so the hidden ones can be selected and styled
without unhiding them.

## `hidden` needed a CSS rule to work at all

The four viewer states are toggled with the `hidden` attribute. But `hidden` is
only `display: none` in the **UA stylesheet**, so `.viewer-stage { display:
flex }` outranks it — all four rendered at once, with the placeholder stacked on
the image. Fixed with one rule in the project override block:

```css
[hidden] { display: none !important; }
```

It is **site-wide, not page-scoped**, because any component that toggles
`hidden` on a flex or grid element has the same latent bug.

That rule covers the published page. It does **not** cover the Designer canvas —
see **Designing this page in the canvas** above for why `.cc-hidden` exists
alongside it.

## The viewer picks its element from the file EXTENSION

Three viewers, one per kind:

| Files | Element | Count |
|---|---|---|
| `.jpg` `.jpeg` `.png` | `<img>` | 1,120 |
| `.pdf` | `<iframe>` | 24 |
| `.mp4` | `<video controls preload="none">` | 20 |

**`media_content_type_en` does not choose the viewer, and must not.** It says
"Digital Document" for scanned house-programme pages that are really `.jpg` —
**14 of its 37 "Digital Document" rows are images**. Trusting it would wrap a
PDF viewer around a photograph. The build script derives a `viewer` field from
the extension; `entry.js` switches on that and never reads `contentType`.
`contentType` is still emitted, but since the 類型 row was removed it is no
longer displayed anywhere — see **Rows removed by hand**.

The design system's `inline-video` component is deliberately **not** used — it
is for decorative autoplay/hover video, not an archival player with controls.

## No files exist yet

Every storage URL 404s (checked 2026-09-01 against
`https://storage.lib.hkbu.edu.hk/projects/dyp/…`), so `src` is empty on every
material and the page shows its placeholder — which names the kind and filename,
so a reviewer can tell an unbuilt PDF viewer from an unbuilt video player.

The three real elements are already in the markup and already chosen correctly
per material. **Filling `src` in the build script is the only step to going
live** — no markup change. The URL rule is

```
STORAGE_BASE + STORAGE_FOLDER[viewer] + quote(filename)
```

and it is deliberately *not* also emitted as a second field, because two fields
holding the same address drift apart.

Note the works sheet's `url_storage_path` is per-WORK and therefore wrong for
mixed works — `DYP-000012` is filed under `imgs/` but holds two PDFs. The folder
comes from the extension instead.

## Data contract

`sample-data/entry-sample.json`, generated, never hand-edited:

```
python3 sample-data/build-entry-sample.py
```

All 88 works are emitted, each with its media, so every catalogue link resolves.
522 KB — acceptable for mock data served from Vercel and deleted at integration.
The builder **imports** `build-catalogue-sample.py` for the sheet reader, the
`"NULL"` handling, the language fallback and the notes cleaning, so the two
builds cannot drift.

```jsonc
{ "items": [ {
  "id": "DYP-000012",
  "title": "大路",                 // resolved — language fallback, see CATALOGUE.md
  "titleEn": "The Road",
  "category": "劇場", "categoryKey": "theatre-production",
  "year": 1981,
  "date": "1981-11-11",            // language-NEUTRAL: 1981 | 1981-11 | 1981-11-11
  "location": "香港",
  "venue": "香港大會堂展覽廳",
  "directors": ["榮念曾"],
  "notes": "Date: …\nStage Manager: …",   // MULTI-LINE — see below
  "mediaCount": 14,
  "materialGroups": [ { "key": "performance-photo", "label": "演出照片",
                        "items": [ {
    "id": "10012", "order": 1,
    "groupKey": "performance-photo", "group": "演出照片",
    "contentType": "Photograph",   // still emitted; no longer shown (see below)
    "title": "", "author": "", "publisher": "",
    "publishedDate": "1981", "issue": "", "pageNumber": "",
    "filename": "The Road_001.jpg",
    "viewer": "image",             // derived from the EXTENSION
    "src": ""                      // empty until the library uploads
  } ] } ]
} ] }
```

`date` is language-neutral on purpose: `entry.js` formats it (`1981年11月11日` /
`November 11, 1981`) from the page's `lang`. Precision is preserved — a
year-only date renders as `1981年`, never `1981年1月`.

### `notes` needs `white-space: pre-line`

`.accordion-content_spacer.cc-kv` carries it. 58 of the 65 filled notes are
multi-line and the longest is 50 lines; without it the whole note collapses to
one paragraph. See CATALOGUE.md for why the field is displayed verbatim.

### Empty fields disappear

Same `[data-field-group]` convention as the catalogue: a row whose field is
empty is removed from the clone rather than printing an em dash. The material
metadata panel is **rebuilt from its own template on every selection** — without
that, one material with no author would remove the author row for every material
after it.

## Rows removed by hand

`materialType` and `materialFilename` were deleted from the material metadata
panel in the Designer on 2026-09-01. The material panel now shows: the content
category chip, 標題, 作者, 出版, 出版日期, 期數, 頁數.

`entry.js` still calls `setField` for both. That is deliberate — `setField` on a
missing sink is a no-op, so re-adding either row in Webflow makes it fill again
with no JS change, and the data still carries both fields. The filename is still
shown in the *placeholder* (`[data-field="viewerFilename"]`), which is a
different sink and still earns its place while no files exist.

## Responsive — planned for, not built

The user owns the responsive pass. Two things were shaped now so it stays cheap:

- **Desktop** (Figma `394:1285`): left column lists every content category with
  its thumbnails stacked underneath; right column holds the viewer.
- **Tablet** (Figma `405:2200`): the hero moves **above** the title, and the
  content categories become a **horizontal tab strip** with one panel of
  thumbnails, the viewer below.

The stacked-groups → tabs change is a behaviour change, not a CSS reflow, so it
cannot be done with breakpoints alone. The markup is already shaped for it: each
group is one block whose heading is a distinct element and whose grid is its
sibling, which is exactly what the design system's `tabs` component needs
(`[data-tabs-component]` / `[data-tabs-link]` / `[data-tabs-pane]`). Converting
means making the headings the links and the grids the panes.

`.entry-head` and `.materials` are both two-column grids with `min-width: 0` on
their children, so they collapse to one column with a single
`grid-template-columns` override per breakpoint.

## State

Built headlessly — **not visually verified in Webflow**, and nothing published.
The layout and every behaviour were verified in `entry.html` (see below), but
nobody has looked at the Webflow canvas, so the design system's type scale,
theme colours and breakpoints are unchecked on the real page.

### Verified in the harness

`python3 serve.py 8761` then `open http://127.0.0.1:8761/entry.html?id=DYP-000012`.

- `DYP-000012` 大路 / *The Road* — the record the Figma frame is drawn from —
  renders its 4 groups (演出照片 8, 場刊 4, 文章 1, 媒體文章 1) and 14 thumbnails.
- The info rows fill, and rows with no data vanish rather than showing dashes.
- Selecting a material swaps the viewer: with no `src` the placeholder names the
  kind and filename; with a `src` injected, the PDF `<iframe>` and the
  `<video controls>` both take over and the image `src` is cleared.
- The metadata panel rebuilds per material with empty rows dropped.
- Clicking a catalogue result opens the matching entry page.

## English page

`/en/entry` is a folder duplicate, per the `bilingual-build` skill: Webflow
Localization does not survive a code export, so the second language is ordinary
pages in a folder. **The component is shared** — `entry.js` is one file serving
both. Only four things differ:

| | Chinese (`/entry`) | English (`/en/entry`) |
|---|---|---|
| static text | authored Chinese | authored English (wording from Figma) |
| `lang` | `zh-Hant` on `.page-wrapper` | `en` |
| `data-src` | `entry-sample.json` | `entry-sample-en.json` |
| `data-catalogue-path` / `data-entry-path` | defaults (`/catalogue`, `/entry`) | `/en/catalogue`, `/en/entry` |

`lang` is the single switch. `entry.js` reads the nearest `[lang]` ancestor to
format dates (`1981年11月11日` vs `November 11, 1981`) and to pick its one
generated string (`Untitled`). Adding a third language means a branch there, not
a second copy of the component.

**The two path attributes exist because the same file serves both folders.**
`/catalogue` is right for the Chinese page and wrong for the English one, so the
mock driver reads them from the page rather than hardcoding. A backend that owns
routing passes real URLs in `context` and neither is used.

### Three things about building the folder headlessly

- **There is no folder-creation API.** `create_page` accepts `parentFolderId`
  but nothing creates the folder, and a slug containing a slash is *accepted*
  and then silently flattened — `slug: "en/catalogue"` came back with
  `publishedPath: "/catalogue"`, which would have collided with the live Chinese
  page. On the design site the folder already exists (`en`, page id
  `6a9a35a2fff31509fd87b258`, title "English Version"), made by hand in the
  Designer. **`list_pages` does not return folders**, so its absence from that
  list proves nothing — fetch the id with `get_page_metadata` before concluding
  there is no folder.
- **`set_text` fails on a `Block`** ("This element doesn't support text") even
  when the div holds a text node — but it **succeeds when aimed at the `String`
  child itself**, which `query_elements` returns with its own element id. That
  is the cheap route for block-level labels; the WHTML swap (append a `<span>`,
  remove the original String) is only needed when the element has to change.
- **A duplicated page keeps the original's literal `href` attribute**, which is
  separate from the Link *setting*. After repointing a link with `set_link` /
  `set_settings`, sweep `remove_attribute` for `href` or the two disagree. Hit
  on the language switcher and the footer logo.

Also: **`href` on a `Link` is a setting, not an attribute.** `set_attributes`
with `name: "href"` returns "internal error"; use `set_link` — and on
`NavbarLink` / `NavbarBrand` even `set_link` is refused ("only Link elements
do"), so write `key: "link"` through `data_element_settings_tool > set_settings`.

## The category chip had lost its data hook

Found while translating: the entry head's chip had been restructured by hand
into a bare `div.result-tag.cc-entry` holding the literal text 劇場 — the
`span[data-field="category"]` and the `data-field-group="category"` wrapper were
both gone. **Every work's entry page would have shown 劇場**, including the six
with no category at all, on a page whose whole purpose is checking the data.
Restored on both language pages.

Worth knowing for anyone restyling one of these: the `data-field` span is the
sink `entry.js` writes into and the `data-field-group` is what disappears when
the value is empty. Restyle the wrapper, keep the span.

## The English pages (site-wide, built 2026-09-11)

All five Chinese pages of the **Danny Yung Archive Design** site
(`6a9a35a2fff31509fd87b275`) were duplicated into the `en` folder. A duplicate
inherits every class and every element, which is the point: the two languages
stay layout-identical, so responsive work done later on a Chinese page only has
to be repeated, never re-derived.

| Page | Chinese | English | English page id | `data-src` |
|---|---|---|---|---|
| Home | `/` | `/en/home` | `6aa3a868f2217b655720e072` | `dataviz-sample-en.json` (overview chart) |
| Catalogue | `/catalogue` | `/en/catalogue` | `6aa3a8680690102570993ca2` | `catalogue-sample-en.json` |
| Work | `/entry` | `/en/entry` | `6aa3a8692f4f5523cddec85d` | `entry-sample-en.json` |
| Data Viz | `/dataviz` | `/en/dataviz` | `6aa3a86a5a7e019e2ebc0118` | `dataviz-sample-en.json` |
| Further Reading | `/supplementary-materials` | `/en/supplementary-materials` | `6aa3a86d21f62f433125916e` | `supplementary-sample-en.json` |

Per page, exactly four things differ from the Chinese original: the authored
text, `lang="en"` on `.page-wrapper`, `data-src` on the data root, and the
`Nav EN` / `Footer EN` instances in place of `Nav` / `Footer`. The entry page
adds its two path attributes (see the table above).

**`data-src` must be an absolute URL.** Every renderer does a bare
`fetch(root.getAttribute("data-src"))`, so a relative path resolves against the
*page*, and `./sample-data/…` on `/en/catalogue` would ask for
`/en/sample-data/…`. All five carry the full
`https://hkbuproject-sandbox.vercel.app/dannyyung/sample-data/…-en.json`.

### The home page is the one pair that is not 1:1

Webflow folders have **no index page**, so the English home cannot sit at
`/en/` — it is `/en/home`. Everything else keeps its Chinese slug, so the
switcher's strip-or-add-the-folder logic covers it.

The stand-in switcher therefore carries one constant, `EN_HOME = '/home'`, and
two lines that map `/` ↔ `/en/home` in both directions (the `.html` variants are
there for a static export served without directory indexes). If `/en` ever
becomes a real page — a Webflow redirect, or an `index.html` added after export
— delete the constant and those two lines.

Note that a Webflow **redirect would not survive the code export**: an exported
build that wants `/en/` to work needs a real `en/index.html`, made by hand.

### English typography: the `English Font Setting` embed

The Webflow `Typography` and `Components` collections hold **one** type scale and
it is the Chinese one — written from the Figma `ZH/*` text styles on 2026-09-01,
with a single Base mode and no ZH/EN split. English therefore has no variable
mode of its own.

The seam is a component called **`English Font Setting`**
(`26c2398e-498d-fa1a-02ff-98b0e5cf37c5`), whose root *is* an HTML embed. It
re-declares all 14 letter-spacing variables under `[lang="en"]`:

| Where | Variables |
|---|---|
| `Typography` | `h1`–`h6`, `eyebrow`, `paragraph-xl`, `-lg`, `-body`, `-sm` |
| `Components` | `button`, `input`, `input-label` |

**Every value in it is the Chinese value, copied verbatim**, so the block is
inert until someone changes a number. That is deliberate: it is a tuning
surface, and a diff against it shows exactly how far English has drifted from
Chinese.

Why it wins the cascade: Webflow declares these on `:root`, `[lang="en"]` has
the same specificity (0,1,0), and a `<style>` in the body is parsed after the
site stylesheet — so the later rule takes it. `lang="en"` sits on
`.page-wrapper`, so the values inherit to the whole page. Scoping to the
attribute rather than `:root` also means the block cannot leak onto a Chinese
page if the component is ever dropped on one.

Two things to know before editing it:

- **A typo in a variable name fails silently.** The declaration is dropped and
  the Chinese value simply stays. Change numbers, not names.
- **`--_typography---eyebrow--letter-spacing` is `1em`, and that is correct for
  Chinese** — the deliberate wide-spaced CJK label style, confirmed with the
  designer and not to be "fixed" back. It is also the one value most likely to
  be wrong for English: the Figma `EN/Eyebrow` style is 10% (`0.1em`).

**Not yet placed on the other four English pages.** The component is only
instanced on `/en/home`, so the overrides apply there alone. Nothing looks wrong
today because the values are identical to the Chinese ones — which is exactly
what makes this easy to miss later, when a tuned number moves the home page and
nothing else. Add an instance to the other four (as a sibling of the Custom Code
instance, before `Nav EN`) at the same time as the first real change.

### Still open

- There is no `About` / `項目介紹` page in either language; the nav and footer
  links for it are `#` on both sides.
- The repo harnesses in `en/` cover catalogue, entry and dataviz only — there is
  no `en/supplementary-materials` or English home harness. The Webflow pages
  exist; only the local behaviour harnesses are missing.
- The English wording is a first pass. Where an English string already existed
  (the `en/*.html` harnesses, the earlier mockup site) that wording was reused
  rather than re-invented; the rest is new and the `[placeholder]` markers on the
  home page are kept, because that copy is still placeholder in Chinese too.

## Bilingual chrome

`Nav` / `Footer` are Webflow components, so their text is shared by every page
that uses them. The English pages therefore use **duplicated definitions**:
`Nav EN` (`cca0570e-…`) and `Footer EN` (`2774b87d-…`), in the `Global` group.

Those two were re-cut on 2026-09-11 by duplicating the *current* Chinese Nav and
Footer, because the first pair had been built against an older nav design (a
single-embed logo, no Further Reading link) and had drifted. The originals are
still on the site, renamed `Nav EN (superseded)` / `Footer EN (superseded)` with
zero instances — delete them once the new pair has been eyeballed. **A duplicate
inherits the Chinese page links**, so every link in it has to be repointed at
the English page, not only the visible labels.

This is the `nav.html` / `navZH.html` split the `bilingual-build` skill
describes, expressed in Webflow. **They are separate definitions, not variants
— change one and you must change the other.** Both carry that warning in their
component description.

### The language switcher

A `.nav-link` with `data-lang-switch` — the design system's own contract, where
the attribute holds the language to switch **to**:

| In | Attribute | Label |
|---|---|---|
| `Nav` (Chinese) | `data-lang-switch="en"` | English |
| `Nav EN` | `data-lang-switch="zh-Hant"` | 中文 |

Each also carries `lang` and `hreflang` on the link itself, so the label is
announced in its own language rather than the page's.

**The design system's switcher cannot run in Webflow**, and this is worth
knowing before someone deletes the stand-in:

- `updateLanguageSwitcher()` in `addons/component-loader.js` is called *after*
  `if (!loadedHeader) return;` — so it only runs when the nav was injected as a
  runtime partial. In Webflow the Nav is a native component, so it never runs.
- `component-loader.js` is an addon and is **not in the bundle** this site
  loads, so the function is not even present.

So the Custom Code component's JS embed carries a ~12-line stand-in with the
same logic. It is **idempotent** — it strips the locale folder before deciding —
so clicking through repeatedly can never build `/en/en/`, and when the export
links `component-loader.js` the two agree rather than fighting.

Without it the switch would still work, but only as a static href to the other
language's *catalogue* — from an entry page you would lose your place. With it,
`/entry?id=X` ↔ `/en/entry?id=X`.

**The real fix is upstream**: move `updateLanguageSwitcher()` above that early
return, so it no longer depends on partial loading. That is a design system
change affecting every project, and has not been made.

`DS_CONFIG.bilingual` is now `true` and `localeFolder` stays `'en'`.

### What the switcher carries: the record id, and nothing else

```
/entry?id=DYP-000012                     <->  /en/entry?id=DYP-000012
/catalogue?category=visual-arts&page=2    ->  /en/catalogue
```

`id` carries because it is a real identifier — byte-identical in both sample
files — so switching language on a work keeps you on that work, which is the
whole point of switching there.

**The catalogue's filters deliberately do not carry.** `location` and `director`
are filtered by *display text* (台北 vs Taipei), so they would match nothing in
the other language. An earlier version carried the neutral parameters and
silently dropped those two; that was worse — a half-restored view is more
confusing than a clean one. The catalogue switch now lands on the plain
catalogue in the other language.

Whether the facets should gain stable keys, so filters *could* survive, is a
**data decision for the client, not a frontend one** — see the creator-identity
section in CATALOGUE.md, where standardising on English turned out to encode two
real data errors.

### 返回 after a language switch

The stored catalogue context belongs to whichever language the reader was
browsing. Arriving on an English entry page by switching from a Chinese one
means they have **never been on the English catalogue**, so that context does
not apply: 返回 would jump them back into Chinese, and the stored neighbour
titles are Chinese too.

So a locale mismatch drops the stored context entirely. The test is whether the
stored URL sits under this page's own catalogue path — `/en/catalogue…` does not
start with `/catalogue`, and `/catalogue…` does not start with `/en/catalogue`,
so it works in both directions without the component knowing which language it
is in.

The result, measured in the harness:

| | Same language | After a language switch |
|---|---|---|
| Back | shows the filtered catalogue | **hidden** |
| Previous / next | walk the filtered set | walk this language's default list, English titles |
| Breadcrumb category | `?category=…` | `?category=…` — unchanged |

Hiding Back is the same rule as a cold arrival: a back link to somewhere the
reader has never been is a lie. Nothing becomes unreachable — the breadcrumb
still offers Archive and the category, and the category crumb still lands on a
filtered catalogue in the right language.

### Why it is a link and not a button

It navigates to another document, so `<a href>` is the correct element and a
`<button>` would be a downgrade:

- middle-click, ⌘-click and "copy link address" stop working;
- search engines cannot follow it, which defeats the `hreflang` pairing the
  bilingual setup exists for;
- it stops working at all without JavaScript, where the anchor already has a
  real fallback href in the markup;
- assistive tech announces "button", implying an in-page action rather than a
  move to another page.

The design system's own function agrees — it does `switchButton.setAttribute("href", …)`,
which a `<button>` would ignore. Use a button for something that acts on this
page; use a link for something that takes you to another one.

### `<html lang>` is wrong site-wide, and it broke the Chinese page

Webflow sets `<html lang>` from the site's language setting, which on this site
is **English** — so every page shipped `<html lang="en">`, Chinese ones included.
That is the failure the `bilingual-build` skill warns about, inverted: here it is
the *root* pages that are mislabelled, not the locale folder.

It was not only an accessibility problem. `catalogue.js` and `entry.js` read the
nearest `[lang]` ancestor, so on the published Chinese catalogue the count line
rendered **"88 works — showing 1–12"** in English.

Fixed by setting `lang` explicitly on `.page-wrapper` on all four pages —
`zh-Hant` at the root, `en` in `/en/`. Explicit on both sides is the robust
answer: it survives someone changing the Webflow site language later, and it is
what `:lang()`-scoped CJK typography needs.
