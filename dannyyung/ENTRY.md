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
    .entry-head                   grid: 1fr 28rem
      .entry-info
        span.result-tag           the category chip (reused from the catalogue)
        h1.entry-title
        dl.kv                     日期 / 場地 / 地點 / 導演 / 備註
      .entry-hero[data-hero]      placeholder — no hero images exist yet
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

The cost: **WHTML also writes a literal `class` attribute** alongside the
Webflow style, so `<dt class="kv-key">` comes back with both, and would publish
as `class="kv-key kv-key"` — worse, the raw attribute survives a rename in the
Designer and would keep matching a stale selector. Every one was removed after
the build (`remove_attribute` on `class`); a final query for
`attribute_name: "class"` returns 0. **Do this cleanup after any WHTML batch.**

## `hidden` needed a CSS rule to work at all

The four viewer states are toggled with the `hidden` attribute. But `hidden` is
only `display: none` in the **UA stylesheet**, so `.viewer-stage { display:
flex }` outranks it — all four rendered at once, with the placeholder stacked on
the image. Fixed with one rule in the project override block:

```css
[hidden] { display: none !important; }
```

It is **site-wide, not page-scoped**, because any component that toggles
`hidden` on a flex or grid element has the same latent bug. Toggling a class
instead would have hidden the state from CSS but not from assistive tech, which
`hidden` does correctly.

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
the extension; `entry.js` switches on that and never reads `contentType`. The
content type is still shown, because it is what the page displays.

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
    "contentType": "Photograph",   // DISPLAYED. Does not pick the viewer.
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

`.kv-val.cc-notes` carries it. 58 of the 65 filled notes are multi-line and the
longest is 50 lines; without it the whole note collapses to one paragraph. See
CATALOGUE.md for why the field is displayed verbatim.

### Empty fields disappear

Same `[data-field-group]` convention as the catalogue: a row whose field is
empty is removed from the clone rather than printing an em dash. The material
metadata panel is **rebuilt from its own template on every selection** — without
that, one material with no author would remove the author row for every material
after it.

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
