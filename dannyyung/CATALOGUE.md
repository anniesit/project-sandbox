# Catalogue page (目錄) — build notes and data contract

Webflow site `6a8fda591c4e266dbbb91533` (Danny Yung Archive, duplicated from Mast Fork).
Page `6a8fe9ff31603947cc29fa0f`, slug `/catalogue`, Traditional Chinese.

Built from the Figma wireframe `BrowseList` (file `PM7YYo9FuEQtVO82kvggvn`, node
`56:91`). This is a **wireframe in Webflow**, not a finished design — structure,
semantics and tokens are right; visual design is deliberately untouched.

## Page structure

Follows the site-wide convention, inherited by duplicating the `Template` page:

```
.page-wrapper.u-minh-100vh
  Custom Code Forked          (component)
  Nav Banner                  (component — Visibility set to false here)
  Nav                         (component)
  main.page-main#main
    section.section
      .container
        .catalogue-head       h1 目錄  +  Theme Toggle (component)
        .catalogue-layout[data-catalogue]   grid: 16rem sidebar + results
          aside.catalogue-facets
          .catalogue-results
        HtmlEmbed             "Page JS — catalogue.js (Vercel)"  (script tag only)
  Footer                      (component)
```

Any further page uses the same `page-wrapper > page-main > section > container`
chain. Vary it with a combo class (`.container.cc-narrow`), never by replacing
the chain.

## Design system parts reused verbatim

Markup was copied from the site's own Components page, not invented:

| Thing | Markup |
|---|---|
| Table | `.table-wrap` > `table.table` > `thead.table-head` > `tr.table-row.cc-head` > `th.table-cell[scope=col]`; `tbody.table-body` > `tr.table-row` > `td.table-cell` |
| Radio | `label.radio` > `input.radio-input[type=radio][name=category]` + `span.radio-control[aria-hidden]` + `span.radio-label`. The indicator is the stylesheet's `.radio-control::after`, not markup |
| Dropdown | `.dropdown[data-dropdown]` > `button.dropdown-trigger[data-dropdown-trigger]` (> `span.dropdown-trigger-label[data-dropdown-value]` + `svg.dropdown-trigger-icon`) + `ul.dropdown-list[role=listbox][data-dropdown-list]` > `li.dropdown-option[role=option][data-value][data-dropdown-option]` > `span.dropdown-option-label` |
| Text input | `.input-group` > `label.input-label[for]` + `input.input` |

No Webflow widget elements were used. Every input, button, list and table cell
is a `DOM` element with an explicit tag.

## New classes (all spacing and colour bound to variables by id)

Base: `catalogue-layout`, `catalogue-facets`, `catalogue-results`,
`catalogue-toolbar`, `catalogue-sort`, `facet`, `facet-options`,
`facet-date-range`, `pagination`, `pagination-btn`, `catalogue-empty`,
`catalogue-script`, `catalogue-head`.

Combos: `.pagination-btn.cc-current`, `.eyebrow.cc-facet`,
`.input-group.cc-search`, `.input.cc-year`, `.paragraph-sm.cc-count`.

Only longhand properties are written (`grid-column-gap`/`grid-row-gap`, the four
padding/margin/border-radius longhands, per-side border longhands) so the
Designer's own controls are never shadowed.

## The data seam

**Nothing is embedded in Webflow.** The page carries one script tag; the
component lives in this repo and is served from Vercel, exactly like the
film/TV archive components:

```
project-sandbox/dannyyung/catalogue.js
  -> https://hkbuproject-sandbox.vercel.app/dannyyung/catalogue.js
```

Pushing project-sandbox updates the live page — no export, no CDN purge, no
re-pasting code into an embed. The Webflow embed is named
**"Page JS — catalogue.js (Vercel)"** and contains only the `<script src>` plus
a comment saying where the real file lives.

`vercel.json` carries a `/dannyyung/(.*)` CORS block so the JSON fetch works
from the Webflow preview domain.

### Ownership split

Same as filmtv. `catalogue.js` owns the **visual**: rendering records into the
row template, generating the location and director dropdown options, painting
pagination, and firing an event when the user changes a control. The backend
owns the **state**: fetching, matching, sorting, paging.

```js
window.dyCatalogue.render(rootEl, { items, total, page, pages, facets });
window.dyCatalogue.getQuery(rootEl);
```

Every user action fires a bubbling `dy:query` event on `[data-catalogue]`:

```js
detail = { category, yearFrom, yearTo, location, director, q, sort, page }
```

`category` is a **single** value, not a list — the facet is a radio group.
`"all"` means no filter; `"other"` matches records whose `categoryKey` is empty.

The component filters nothing on its own.

### Replacing the mock driver

`catalogue.js` ends with a fenced block:

```
/* >>> MOCK DRIVER <<< — delete this whole block for production. */
...
/* >>> END MOCK DRIVER <<< */
```

It fetches `sample-data/catalogue-sample.json`, then does what the backend will
do — listens for `dy:query`, filters, sorts, pages, and calls `render()`. To go
live: delete that block, listen for `dy:query` yourself, and call
`dyCatalogue.render()` with live data. Nothing above the fence changes.

Also delete the `>>> MOCK DATA URL <<<` constant (`DATA_URL`) at the top.

A root may override the sample with `data-src="..."` for testing without
touching the file.

### Sample data

`sample-data/catalogue-sample.json` is generated, never hand-edited:

```
python3 sample-data/build-catalogue-sample.py
```

It reads both client spreadsheets from `data/` and prints a short data-quality
summary. **Its output shape is the contract** — keyed and readable:

```jsonc
{ "items": [ {
  "id": "DYP-000017",
  "title": "媒介事件一",           // zh-Hant; empty falls back to titleEn
  "titleEn": "Media Event 1",
  "category": "劇場",              // display label
  "categoryKey": "theatre-production",  // stable key, matches the checkboxes
  "year": 1982,
  "location": "香港",
  "venue": "香港藝術中心演奏廳",
  "directors": ["沈聖德", "榮念曾"],
  "materialTypes": ["演出照片", "場刊"],
  "mediaCount": 2,                 // joined from the media spreadsheet
  "href": "#"
} ] }
```

`categoryKey` exists so the Chinese labels can be retranslated without touching
the checkbox markup — the English page will reuse the same keys.

### Local preview

`catalogue.html` is a behaviour harness with the same `data-*` markup and
throwaway CSS, so the component can be exercised without Webflow:

```
python3 -m http.server 8761      # from project-sandbox/dannyyung/
open http://127.0.0.1:8761/catalogue.html
```

It is **not** a design reference — the real styling is the design system's.

### Verified

Exercised in that harness: 88 records load, 8 pages at 12 per page; the category
checkboxes, year range, search, sort and both dropdowns all filter; the director
facet matches inside the multi-valued array (selecting 胡恩威 returns the 5 works
where he is one of several directors); pagination repaints with the ellipsis
window; the template row is lifted out of the DOM at runtime.

## No `<p>` anywhere on this page

The design system gives `p` a `--bottom-margin` token (`1em` on body copy,
`0.2–0.6em` on headings). That margin fights every gap set on a flex or grid
parent, so the page carries **no paragraph elements at all** — text sits
directly inside a `span` or `div`, which is what the design system's own
dropdown and checkbox markup already does.

Getting there is not obvious, because three of the four routes fail:

| Route | Result |
|---|---|
| `data_element_builder` type `Paragraph` | renders `<p>` — the thing being avoided |
| `data_element_builder` type `TextBlock` + `set_text` | **silently no-ops.** Creates a `div` holding Webflow's placeholder "This is some text inside of a div block."; the element then reports as a plain `Block` and `data_element_tool > set_text` on it errors "This element doesn't support text" |
| `data_whtml_builder` with bare text, no tag | rejected: "No elements found in WHTML" |
| `data_whtml_builder` with a single root element | **works** — `<span class="checkbox-label">劇場</span>` becomes a real `Span` with a String child, keeping its classes and attributes |

So the recipe is: build the replacement with `data_whtml_builder`
(`creation_position: "before"`, anchored on the element being replaced), then
remove the old one. Two further constraints:

- **One root element per action.** Two siblings in one `html` string is rejected:
  "Expected single root element but found 2 elements."
- **`<label>` is coerced** into Webflow's Field Label widget and rejected with
  "Field Label can only be placed in a Form", which aborts the whole batch
  atomically. The two `input-label` elements were therefore left as
  `data_element_builder` `DOM` elements with `dom_tag: "label"` (which does not
  coerce), and only the paragraph inside each was swapped for a span.

Where the replacement went:

| Was | Now |
|---|---|
| `p.eyebrow.cc-facet` ×4 | `div.eyebrow.cc-facet` |
| `span.checkbox-label > p` ×4 | `span.checkbox-label` with direct text |
| `span.dropdown-trigger-label > p` ×3 | `span.dropdown-trigger-label` with direct text |
| `span.dropdown-option-label > p` ×5 | `span.dropdown-option-label` with direct text |
| `label.input-label > p` ×2 | `label.input-label > span` |
| `th.table-cell > p` ×5 | `th.table-cell > span` |
| `td.table-cell > p[data-field]` ×5 | `td.table-cell > span[data-field]` |
| `p.paragraph-sm.cc-count` | `div.paragraph-sm.cc-count` |
| `p.catalogue-empty` | `div.catalogue-empty` |

Verified: 31 paragraphs replaced, `[data-catalogue] p` now returns 0, and every
renderer hook (`data-field`, `data-count`, `data-empty`, `data-dropdown-value`,
`data-dropdown-option-label`) survived.

**If a text element is added to this page later, use the whtml route.** Adding a
Paragraph reintroduces the margin and quietly shifts the layout.

## Theme, and the category facet

### Theme toggle

The design system ships a theme system — `color-scheme: light dark`, a
`u-mode-light` / `u-mode-dark` class on `<html>`, and a Theme Toggle component.
Nothing was ever set to light-only; the toggle simply had not been placed on a
page. It now sits in `.catalogue-head`, next to the page title.

Two things had to be true for it to work, and one of them was not:

- The Theme Toggle component must be **on the page**. It is now.
- `DS_CONFIG.themeKey` must be unique per project. It was still the starter's
  placeholder `'CHANGEME-theme'`, now `'danny-yung-archive-theme'`. localStorage
  is shared per host, so two projects on one hostname that both keep the
  placeholder overwrite each other's theme choice.

`localeFolder` is now set to `'en'` in the same config, since this project is
zh-Hant first — Chinese at the root, English in `/en/`, the inverse of the
design system default.

The toggle stores the viewer's choice, so it is a genuine two-theme demo rather
than a preview trick. Its permanent home is probably the Nav (it would then
appear on every page); it is on the catalogue page for now because editing the
shared Nav component definition has site-wide blast radius.

### Why the checkbox ticks were invisible

Not a markup bug — the classes and structure matched the design system exactly.
Two design system rules combine badly:

```css
.checkbox-input:checked + .checkbox-control { background-color: var(--primary--accent-dark); }
```

and the tick path is drawn with `stroke="currentColor"`. `currentColor` inside
the control inherits from the label, which is `Primary/Text` — near-black in
light mode. So the tick is painted **near-black on `#9c331b` dark brick**: it is
there, but the contrast is so low it reads as no tick at all.

The fix belongs upstream in `design-system/components/forms/forms.css` — the
checked control needs `color: var(--primary--text-invert)` so the tick flips to
the light ink. **Not done here**, because that file is shared by every project
and changing it is its own deliberate task. It affects any project using the
design system's checkboxes.

### Category facet is now a radio group

Six single-select options, replacing four checkboxes:

| Label | `data-facet-value` | Matches |
|---|---|---|
| 全選 (default) | `all` | everything, 88 |
| 劇場 | `theatre-production` | 69 |
| 視覺藝術 | `visual-arts` | 4 |
| 活動 | `event` | 8 |
| 表演藝術 | `performing-art` | 1 |
| 其他 | `other` | 6 — records with **no** category in the client data |

Verified against the sample: the five real categories sum to 88.

`其他` is the honest home for discrepancy 2 below — the five `其他-YYYY` buckets
plus `創意中國－榮念曾與香港的藝術政治`. They are now reachable and visible rather
than sitting in the list with an em dash, but the underlying question (should
the `其他-` records be in a public catalogue at all?) is still open.

### Radios are square, site-wide

`.radio-control` had `border-radius: 50%`. It now uses `Border Radius/SM`, the
same token the checkbox control uses — which is `0rem`, so the radio is a true
square and the two controls match. The stylesheet also draws the inner
indicator as a circle (`.radio-control::after { border-radius: 50% }`), so that
is overridden to the same token; otherwise it would be a dot inside a box.

This is a change to a **design system class on this site**, not a combo — it was
asked for site-wide, and a combo would only square the radios that opted in.
It does not touch the Mast Fork starter, so other projects keep round radios.

## Discrepancies between the client data and the wireframe

Found while building. Each needs a decision.

1. **Categories don't match.** Wireframe: Theatre Production / Visual Arts /
   Events. Data: 劇場 (69), 活動 (8, singular "Event" in English), 視覺藝術 (4),
   and a fourth the wireframe has no box for — 表演藝術 "Performing Art" (1).
   All four are built. Decide whether 表演藝術 with a single record earns a
   facet, and whether it should be merged into 劇場.

2. **Six records have no category at all.** Five are `其他-YYYY`
   ("Non-project-based-1996/1998/2008/2011/2020") — these look like catch-all
   buckets rather than works. The sixth is `創意中國－榮念曾與香港的藝術政治`.
   They appear in the table with an em dash, and are now reachable through the
   其他 radio option. Still decide whether the `其他-` records belong in a
   public catalogue at all.

3. **Year range is 1974–2020, not 1974–2022.** The wireframe's slider is
   labelled 1974–2022. The inputs are set to the real range.

4. **The date range is not a slider.** The wireframe draws a dual-handle range
   slider; the design system has no such control. Built as two year inputs
   using `.input.cc-year`. A real slider is new component work.

5. **"Sort by: Latest Added" has no backing field.** There is no created or
   ingested date anywhere in the data. Sort options are 年份（新至舊）,
   年份（舊至新）, 標題, defaulting to newest year first. If "latest added" is
   wanted, the client has to supply an accession date.

6. **Director is multi-valued and sometimes enormous.** 44 distinct names;
   `DYP-000072` lists **18** and `DYP-000069` lists 14, including Latin names.
   The wireframe's Director column shows one short name. Rendered joined with
   `、`, which will wrap to several lines on those rows. Decide: truncate with
   "et al.", or move the full list to the entry page only.

7. **19 of 88 records have no director**, 16 have no location.

8. **"Creator" and "Director" are the same field.** The wireframe has a
   *Creator* facet and a *Director* column; the data has only
   `director_zh-Hant` (`authors_*` is filled on 2 records). Built as one facet
   labelled 導演, matching the column. Reversible in one edit if they are meant
   to be different things.

9. **Location mixes cities and countries** — 香港, 台北, 紐約, 深圳, 奧斯陸
   alongside 日本, 德國, 比利時, 新加坡. Nine values. As a facet this reads
   oddly; the client may need to normalise to one granularity, or the site
   needs two fields (city + country).

10. **Three records have no Chinese title** — `DYP-000001` (whose English title
    is the placeholder `ID123`), `DYP-000032`, `DYP-000104`. On a
    Chinese-first page these fall back to English. `DYP-000001` is junk data
    and should probably be withdrawn.

11. **Pagination maths.** The wireframe shows "1 2 3 … 12", implying 144
    records. There are 88, so 8 pages at 12 per page.

12. **Nothing links anywhere yet.** Rows carry `data-id` but no link — the
    entry page does not exist. When it does, wrap the title cell's contents in
    an `a` and add the `table-rowlink` add-on for whole-row clicks.

## Second dataset, not used here

`input_by_dept_media_meta_data.xlsx` holds 1,164 media items joined to works by
`group_id`. Every one of the 88 works has at least one; the largest,
`DYP-000074`, has **141**. That is entry-page material, and 141 thumbnails in
one column is a design problem worth knowing about before that page is drawn.

## State

Built headlessly — **not visually verified**. Nothing has been published. The
Designer will show the page with one template row; the script only runs on a
published or previewed page.
