# Catalogue page (目錄) — build notes and data contract

Webflow site `6a8fda591c4e266dbbb91533` (Danny Yung Archive, duplicated from Mast Fork).
Page `6a8fe9ff31603947cc29fa0f`, slug `/catalogue`, Traditional Chinese.

Built from the Figma frame `BrowseList` (file `PM7YYo9FuEQtVO82kvggvn`, node
`394:1977`; the result item is `394:2173`). Everything except the result list is
still a **wireframe in Webflow** — structure, semantics and tokens are right;
visual design is deliberately untouched. The result list follows the designed
layout.

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
| Text input + clear | `.input-group` > `label.input-label` + `.input-clear-wrapper` > `input.input` + `button.input-clear-btn[data-input-clear]` > `svg.input-clear-icon` (design system component #10) |
| Radio | `label.radio` > `input.radio-input[type=radio][name=category]` + `span.radio-control[aria-hidden]` + `span.radio-label`. The indicator is the stylesheet's `.radio-control::after`, not markup |
| Dropdown | `.dropdown[data-dropdown]` > `button.dropdown-trigger[data-dropdown-trigger]` (> `span.dropdown-trigger-label[data-dropdown-value]` + `svg.dropdown-trigger-icon`) + `ul.dropdown-list[role=listbox][data-dropdown-list]` > `li.dropdown-option[role=option][data-value][data-dropdown-option]` > `span.dropdown-option-label` |
| Text input | `.input-group` > `label.input-label[for]` + `input.input` |

The table markup was used until the result layout was redesigned — see
**The result list** below.

No Webflow widget elements were used. Every input, button and list element
is a `DOM` element with an explicit tag.

## New classes (all spacing and colour bound to variables by id)

Base: `catalogue-layout`, `catalogue-facets`, `catalogue-results`,
`catalogue-toolbar`, `catalogue-sort`, `facet`, `facet-options`,
`facet-date-range`, `pagination`, `pagination-btn`, `catalogue-empty`,
`catalogue-script`, `catalogue-head`, `result-list`, `result-item`,
`result-title`, `result-title-link`, `result-meta`, `result-tag`, `result-sep`.

Combos: `.pagination-btn.cc-current`, `.eyebrow.cc-facet`,
`.input-group.cc-search`, `.input.cc-year`, `.paragraph-sm.cc-count`,
`.paragraph-xl.cc-result-facts`, `.paragraph-xl.cc-result-credit`,
`.paragraph-lg.cc-result-credit-label`, `.u-link-cover.cc-result-cover`.

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

### The catalogue view is addressable

`catalogue.js` reflects its query in the URL and restores from it:

```
/catalogue?category=visual-arts&sort=title&page=2
```

Only non-default values are written, so a plain `/catalogue` stays clean, and
`replaceState` is used rather than `pushState` — otherwise typing in the search
box would fill the Back history with one entry per keystroke.

Restoring is `dyCatalogue.applyQuery(root, query)`, the inverse of `getQuery`.
It sets the radios, the year inputs, the search box, and all three dropdowns —
options' `aria-selected`, the trigger's visible label, **and** the hidden input
`forms.js` reads. Setting fewer than all three leaves the control lying about
itself. It fires no `dy:query`: the caller already has the query it passed in,
and emitting would loop.

**It must run after the facets are filled.** The location and director options
are generated from the data, and a value cannot be selected in a list that does
not exist yet.

The mock driver also stores the whole matching, sorted id list plus this URL in
`sessionStorage` under `dy:catalogue-context`. That is what the entry page's
返回 / 上一項 / 下一項 read — see ENTRY.md. In production the backend owns that
handoff and can keep this shape or answer neighbour queries server-side.

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

`sample-data/catalogue-sample.json` is generated from
`data/DIR_current_data.xlsx` + `data/input_by_dept_media_meta_data.xlsx`, never
hand-edited:

```
python3 sample-data/build-catalogue-sample.py
```

It prints a short data-quality summary, and refuses to run if the works sheet
grows a column that is not classified as public / media-level / internal — see
**The source spreadsheet changed** above. **Its output shape is the contract** — keyed and readable:

```jsonc
{ "items": [ {
  "id": "DYP-000017",
  "title": "媒介事件一",           // resolved — see Language fallback below
  "titleEn": "Media Event 1",
  "category": "劇場",              // display label
  "categoryKey": "theatre-production",  // stable key, matches the radios
  "year": 1982,
  "location": "香港",
  "venue": "香港藝術中心演奏廳",
  "directors": ["沈聖德", "榮念曾"],
  "mediaCount": 2,                 // joined from the media spreadsheet
  "href": "#"
} ] }
```

`categoryKey` exists so the Chinese labels can be retranslated without touching
the radio markup — the English page will reuse the same keys.

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
radios, year range, search, sort and both dropdowns all filter; the director
facet matches inside the multi-valued array (selecting 胡恩威 returns the 5 works
where he is one of several directors); pagination repaints with the ellipsis
window; the template item is lifted out of the DOM at runtime.

Re-verified after the list rewrite: 12 `<li>` render, the empty-value groups
drop (records with no location show no `/`, records with no director show no
導演： block, the six with no category show no chip), the title is a real
`h2 > a`, and typing in the search shows the × button, filters to 2 records,
then clearing it restores all 88.

## The result list

The results were a `<table>` until the Figma result layout changed
(node `394:2173`). They are now a `<ul>`. The reason is that the design stopped
being tabular:

- The old design was a five-column grid — title, category, year, location,
  director — where reading *down* a column compared works on one axis. That is
  what a table is for.
- The new design is a stacked record: a 56px title, then one wrapping metadata
  line. Nothing aligns column-to-column between two results, and the director
  list runs to fourteen names on one record and is absent on nineteen others.
- A single-column table with a hidden header lies to a screen reader: it
  announces "row 3, column 2: 台北" for a value that has no column. A list
  announces "list, 12 items" and reads each record as a unit, which is what it
  is. Heading-level navigation then jumps between works, which a table does not
  offer.

The `<ul>` carries `role="list"`, because the design system removes the bullets
and Safari stops announcing an unstyled `ul` as a list (the reason is written
into `global/normalized.css` upstream).

Markup:

```
ul.result-list[role=list][data-rows]
  li.result-item[data-row-template]                                position:relative
    a.u-link-cover.cc-result-cover[data-field-link][href]          the row link
      span.u-sr-only[data-field=title]                             its accessible name
    h2.result-title
      span[data-field=title]
    div.result-meta
      div.paragraph-xl.cc-result-facts
        span.result-tag[data-field-group=category] > span[data-field=category]
        span[data-field=year]
        span.result-sep[aria-hidden][data-field-group=location]        "/"
        span[data-field=location][data-field-group=location]
      div.paragraph-xl.cc-result-credit[data-field-group=director]
        span.paragraph-lg.cc-result-credit-label                       "導演："
        span[data-field=director]
```

Notes on the build:

- **The whole item is the link, not the title.** An `a.u-link-cover` is
  stretched over the `<li>` (which is why `.result-item` is
  `position: relative`). Its `href` is the record's destination and the *only*
  one on the item — nothing else carries a URL or a click handler, per the
  design system's handoff rule about single sources of truth. The title is
  plain text again.

  The cover would otherwise be a link with no text, so it holds a
  `span.u-sr-only[data-field="title"]`. `catalogue.js` needs no special case:
  `setField` already writes every `[data-field="title"]` in the clone, and there
  are now two — the visible one in the `h2` and the hidden one in the link.
  The cost is that a screen reader hears the title twice (once as the link, once
  as the heading); that is the normal trade for a whole-row click target.

  **The `table-rowlink` add-on is not needed and must not be added.** Its
  `pointer-events: none` rule exists only because a stretched link blocks
  sideways scrolling of a `<table>` on iPadOS, and it is scoped to
  `.table-cell`. There is no table and no horizontal scroll here, so the cover
  works natively — including Tab + Enter.

  Keyboard focus is visible through `.u-link-cover.cc-result-cover:focus-visible`
  (a 2px `Primary/Accent` outline, inset). The design system's own focus rule is
  `.card:has(> .u-link-cover:focus-visible)`, which does not reach a
  `.result-item`; putting the outline on the cover itself avoids needing `:has()`,
  which the Designer cannot author.
- **The title is an `h2`, and its `--bottom-margin` is killed on
  `.result-title`.** A class beats the design system's `h2` tag rule regardless
  of stylesheet order, so this is safe — unlike a competing tag-level rule. The
  heading itself carries no class of the design system's; the `h2` tag style
  supplies the type.
- **`data-field-group` is new.** A missing value used to render an em dash,
  which was right in a table cell and wrong here — "2004 / —" and a bare
  "導演：" both read as broken data. `catalogue.js` now removes any element
  marked `[data-field-group="<name>"]` from the row clone when that field is
  empty. The `/` separator carries the *location* group, so it leaves with the
  location. Title and year have no group and still fall back to an em dash.
- **No dividers, and no border around the list.** The Figma frame has a 1px
  `#cccccc` stroke with a 4px radius around the whole list, but it renders
  invisible, and both values are off-token (the site's radius tokens are all
  `0rem`, and the border colour token is `#cccabf`). It was read as a leftover
  wireframe frame and not built. If a container border is wanted, it belongs on
  `.result-list` bound to `Primary/Border` + `Border Radius/SM`.
- **The category chip is `.result-tag`**, a bordered span using
  `Grid/Gap Button` for its side padding and `Primary/Border` +
  `Border Width/SM` + `Border Radius/SM` for the box — the same tokens the
  Figma chip uses.
- Typography comes from the design system utilities, layered as combos
  (`.paragraph-xl.cc-result-facts`) because two unrelated global classes cannot
  share an element in Webflow. Each combo re-zeroes `margin-bottom`, which the
  `.paragraph-*` classes set from a token.
- Every text node was inserted with `data_whtml_builder` as a single root span,
  for the no-`<p>` reason below. The `ul`, `li` and the tag span are
  `data_element_builder` `DOM` elements; `BY_CUSTOM_TAG` would have coerced
  them into Webflow's List widget.
- One trap: `data_element_builder` gives a `Heading` a placeholder String child
  ("Heading") *in addition to* the children you ask for. It has to be removed
  explicitly, or the title renders as "Heading標題".

## Keyword search

The search field is the design system's **input clear** component (#10), pasted
from the Components page and repointed at the catalogue search:

| Attribute | Value |
|---|---|
| `label.input-label` `for` | `catalogue-search` (text 搜尋) |
| `input.input` `id` | `catalogue-search` |
| `input.input` `name` | `q` |
| `input.input` `placeholder` | 搜尋作品、導演、地點… |
| `input.input` `data-search` | present — this is the hook `catalogue.js` reads |
| `button.input-clear-btn` `aria-label` | 清除搜尋 |

The plain input that had no clear button was deleted. The clear button's
behaviour comes from the design system's `forms.js` (`[data-input-clear]`),
not from `catalogue.js` — clearing dispatches a bubbling `input` event, which
is exactly what `catalogue.js` already listens for, so the results repaint with
no extra wiring. The harness reimplements those few lines locally, since it
does not load the bundle.

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
| `th.table-cell > p` ×5 | `th.table-cell > span` (table since removed) |
| `td.table-cell > p[data-field]` ×5 | `td.table-cell > span[data-field]` (table since removed) |
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

## Two bugs that stopped the theme toggle working

Worth reading before touching the Custom Code component or the dropdowns.

### 1. The design system never reached the published site

The `Custom Code Forked` component carries the DS `<link>` and `<script>` plus
`DS_CONFIG`. Its **root block had element visibility = false**. The class
`.custom-code-component` already sets `display: none`, so the flag was redundant
for hiding — but in Webflow, visibility = false **strips the element from
published output entirely**. The bundle therefore never shipped: the published
HTML contained zero occurrences of `design-system.css`, `design-system.js` and
`DS_CONFIG`.

`mast-fork.webflow.io` publishes the same way, so **this is inherited from the
starter** and every site duplicated from it has it. Fixed here by making the
component root visible. Worth fixing in the starter.

### 2. `forms.js` throws on a dropdown with no hidden input, and takes the
### theme toggle down with it

The design system's dropdown markup starts with `<input type="hidden">`.
`forms.js` reads it once at init and assigns to it with no null guard:

```js
const hiddenInput = dropdown.querySelector('input[type="hidden"]');
...
hiddenInput.value = initiallySelected.dataset.value;   // TypeError if absent
```

The dropdowns here were built without it, so init threw
`Uncaught TypeError: Cannot set properties of null (setting 'value')`.

The bundle is one concatenated file: `forms.js` sits at line 164 and
`theme-toggle.js` at line 1461. An uncaught throw in the first aborts everything
after it — **the theme toggle never initialised, which is why it did nothing.**
The symptom (a dead toggle) was three components away from the cause (a missing
input in a dropdown).

Fixed by adding the hidden input to all three dropdowns. It is inert for the
preview — `catalogue.js` reads the selected option's `aria-selected`, not the
input — but `forms.js` requires it, so **do not remove it**. The harness carries
it too, for fidelity.

`forms.js` would be more robust with a null guard; that is an upstream change.

### 3. `theme-toggle.css` cannot switch anything (design system bug)

Even with the bundle loading and no throw, the toggle still would not change
colours. `theme-toggle.css` declares the Lightning CSS polyfill variables
**directly inside `@media` blocks with no selector**:

```css
@media (prefers-color-scheme: dark) {
  --lightningcss-light: ;        /* invalid — declarations need a rule */
  --lightningcss-dark: initial;
}
```

Browsers drop those, so both variables stay empty. Webflow compiles
`light-dark(a, b)` to `var(--lightningcss-light, a) var(--lightningcss-dark, b)`,
so with both empty every token resolves to **both values at once** — measured on
the live page, `--primary--background` computed to the nonsense `white #1d1c1a`.
That is why the page ignored the design system's colours and fell back to the
browser's own dark canvas.

The file also never defines what `.u-mode-light` / `.u-mode-dark` should do
beyond recolouring a `<select>` arrow, so the class the toggle script sets on
`<html>` has nothing to act on.

Patched in the project override block (wrap the declarations in `:root`, and add
real `html.u-mode-light` / `html.u-mode-dark` rules that set `color-scheme` and
flip the polyfill variables). **The real fix belongs in
`design-system/components/theme-toggle/theme-toggle.css`** — it affects every
project on the system. Delete the patch from the override block once it lands.

### Where site-wide overrides go

The design system stylesheet is linked from the **body**, so it loads after
Webflow's head stylesheet and beats any equal-specificity rule set in the
Designer. A Designer rule that competes with the design system will save
correctly and silently do nothing — this is how the square radio indicator was
lost the first time.

Anything that must beat the design system goes in the `<style>` block inside the
Custom Code component's stylesheet embed, immediately after the `<link>`.

## The source spreadsheet changed (2026-09-01)

`data/DIR_current_data.xlsx` replaces `data/input_by_dept.xlsx` as the works
file. The old one is kept in `data/` for comparison only — nothing reads it.

**The catalogue's data did not change.** Rebuilding from the new file produces a
`catalogue-sample.json` that is field-for-field identical to the old one across
all 88 records; the only difference is that `materialTypes` is gone (see below).
Same 88 ids, same 1974–2020 range, same 6 with no category, 19 with no director,
16 with no location. That was verified by diffing the two builds, not assumed.

### What actually differs in the sheet

| Change | Size | Verdict |
|---|---|---|
| Empty cells are the literal string `"NULL"` | everywhere | **The one thing that will bite.** Any reader that does not treat `"NULL"` as empty prints it on the page. `text()` in the build script handles it |
| Numbers are ints, not floats (`1974`, not `1974.0`) | all dates | Harmless; the float-stripping is kept anyway |
| 32 new columns: every `_zh-Hans` twin, plus admin/rights fields | — | See the classification below |
| `keywords` for `DYP-000058` and `DYP-000083` moved from `keywords_en` to `keywords_zh-Hant` | 2 rows | A **correction** — the values are Chinese and were in the English column |
| `publisher_en` / `publisher_zh-Hant` emptied | 9 cells across 5 works | **Intentional** — confirmed 2026-09-01; the values moved to the media sheet. Was: `DYP-000027` 自立早報, `DYP-000066` and `DYP-000083` 明報 / Ming Pao Daily News, `DYP-000097` 信報 / HK Economic Journal, `DYP-000099` 進念．二十面體 E+E, `DYP-000104` Palgrave Macmillan Cham. |
| `url_storage_filename` emptied | 84 works | **Intentional** — confirmed 2026-09-01; superseded by the media sheet's `media_filename`, filled for all 1,164 items |
| `department`, `copyright_status`, `license` filled in | 88 / 28 / 29 | Constants, internal |

No other value changed anywhere. The 131 apparent differences in `date_mm` /
`date_dd` are all `11.0` → `11`.

### Which columns may be published

The 77 columns are classified in `sample-data/build-catalogue-sample.py`
(`PUBLIC_WORK`, `SEARCH_ONLY`, `MEDIA_LEVEL`, `INTERNAL`). The script **fails
loudly** if a re-export adds or renames a column, so a new column cannot leak by
default.

- **Public, work-level (20)** — id, the English and Traditional Chinese title,
  category, date parts, venue, director, location, abstract, keywords, `notes`,
  `language`.
- **Search-only (7)** — every `_zh-Hans` column. Indexed, never displayed.
- **Media-level (23)** — carried on the works sheet but belonging to the media
  sheet: `content_category_*`, `contributor_*`, `authors_*`, `publisher_*`,
  `published_in_*`, `digital_object_type`, `video_length`, `issue`, `format`,
  and the four `url_*` columns.
- **Internal (27)** — `isPost`, `owner`, `department`, `work_type`,
  `dataset_name_*`, the five `sort_*` columns, `date_certainty`, `no_date`,
  `ocr_text`, `wikidata`, all `copyright_*` / `license*`, `acknowledgement_*`.

`isPost` is the publication gate. It is `Y` on all 88 today, but a production
feed should still filter on it rather than assume.

### `materialTypes` is gone from the contract

It was built from the works sheet's `content_category_zh-Hant`. That column is a
semicolon roll-up of the work's media items, and it is **stale** — it disagrees
with the media sheet on 6 of 88 works:

| Work | Works sheet says | Media items actually are |
|---|---|---|
| `DYP-000006` | 手稿 | 手稿, 繪圖 |
| `DYP-000012` | 媒體文章, 文章, 演出照片 | + 場刊 |
| `DYP-000106/107/108` | (empty) | 文章 |

The media sheet is the authority, and the entry page groups its material cards
*by* the media-level value (Performance photo / House programme / Media
write-up), so the roll-up has no consumer. Nothing on the catalogue page
displayed it. Same story for `contributor_*`: 7 works carry one, while the media
sheet has `media_author_zht` on 20 items — different granularity, different
meaning. Read both from the media sheet on the entry page.

### Language fallback

**Preferred language, else the other language, else empty.** Many columns are
filled in one language only, and hiding the value loses real information — a
Chinese page showing "Haus der Kulturen der Welt" beats one showing nothing.
`pick()` / `pick_multi()` in the build script apply this to title, category,
location, venue and director, and the build prints every fallback it used.

On the current data it fires 5 times: 3 titles and 2 venues. Category, location
and director never fall back, because where the Chinese is missing the English
is missing too. So this is a rule for the entry page and the English site more
than a change to the catalogue.

Two consequences to keep in mind:

- **A value on a Chinese page may be English, and nothing marks which.** If the
  entry page later needs a `lang` attribute on those runs (for font or for a
  screen reader's pronunciation), `pick()` is the function that knows, and it
  would have to start returning the language alongside the value.
- **The facets inherit it.** A location or director dropdown built from these
  values could show a mix of scripts. It does not today, because neither field
  ever falls back.

**The fallback belongs to the data layer, not to `catalogue.js`.** The component
renders the string it is handed and never chooses a language. Implementing it in
both places is how the two drift apart.

### `notes` — shown verbatim, so it has to survive intact

The client will display `notes` on the entry page as-is, so they can see what
the field actually contains. Three things follow:

1. **Line breaks are content, and HTML will eat them.** 58 of the 65 filled
   notes are multi-line; the longest is 50 lines. Excel stores Alt+Enter as a
   plain `\n`, openpyxl returns it and JSON preserves it — but HTML collapses
   whitespace, so **the element that renders `notes` needs
   `white-space: pre-line`**, or a 50-line note becomes one run-on paragraph.
   In Webflow that is a Custom property on the class; no code embed needed.
2. **The malformed date dash is corrected at build time.** `DYP-000022` reads
   `1985-12–20` (en dash where a hyphen belongs). `BAD_DATE_DASH` in the build
   script rewrites a non-ASCII dash **only when it sits between two digits**,
   and the build prints every work it touched (`date dash fixed : ['DYP-000022']`).
   The narrowness matters: the sheet holds 39 fullwidth hyphens inside Chinese
   titles (`中國旅程之一－意圖`) and 6 legitimate en dashes inside English
   subtitles (`Huayi – Chinese Festival of Arts 2004`), and none of them are
   touched. If that count ever rises above one, it shows up in the build output
   instead of quietly rewriting content.
3. **The colons are mixed** — some notes label fields with `Date:` and some with
   `Date：` (fullwidth). Left exactly as the client wrote them.

Nothing parses `notes`. The run dates and the extra credits that live inside it
are read by a human, not extracted.

### Simplified Chinese is search fodder

Every translated column has a `_zh-Hans` twin. They are **not a third locale and
never displayed** — they exist so a visitor typing 剧场 finds 劇場. They sit in
their own `SEARCH_ONLY` bucket in the build script rather than in `INTERNAL`,
because the intent is different: internal means "do not ship", this means "ship
to the search index, not to the page". The sample JSON carries none of them; the
backend's index should.

### Still open with the client

1. **26 columns are empty in every row**, including all three `abstract_*` and
   all three `acknowledgement_*`. The entry page has a *Description* block
   (hidden in the Figma frame) with nowhere to read from. Confirm whether
   abstracts are coming.
2. **Ten columns hold one constant across all 88 rows** — `isPost=Y`,
   `owner=DIR`, `department`, `work_type`, `dataset_name_*`, `ocr_text=N`,
   `copyright_status=copyrighted`, `license=open access`. Fine as provenance,
   useless as facets.
3. **Titles still have gaps.** No Chinese title on `DYP-000001`, `DYP-000032`,
   `DYP-000104` (all three now fall back to English); no English title on
   `DYP-000099`, `DYP-000102`. `DYP-000001` is still the junk record whose
   English title is the placeholder `ID123`.
4. **`DYP-000022`'s `1985-12–20` typo** is patched at build time but not in the
   source. Flagged to the client.

### Settled

- **Publisher loss and the emptied `url_storage_filename` are intentional.**
  Confirmed 2026-09-01. Publisher moved to the media sheet's
  `Publisher/Publishing Venue`; per-work filenames are superseded by the media
  sheet's `media_filename`.
- **The `sort_*` columns are not wanted.** "Sort by latest added" is dropped as
  a requirement, so nothing needs to interpret them. They stay in `INTERNAL`.

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
   They appear in the list with no category chip, and are reachable through the
   其他 radio option. Still decide whether the `其他-` records belong in a
   public catalogue at all.

3. **Year range is 1974–2020, not 1974–2022.** The wireframe's slider is
   labelled 1974–2022. The inputs are set to the real range.

4. **The date range is not a slider.** The wireframe draws a dual-handle range
   slider; the design system has no such control. Built as two year inputs
   using `.input.cc-year`. A real slider is new component work.

5. **"Sort by: Latest Added" is dropped** (decided 2026-09-01). Sort options are
   年份（新至舊）, 年份（舊至新）, 標題, defaulting to newest year first. The
   new file's `sort_*` columns are not it and are not interpreted.

6. **Director is multi-valued and sometimes enormous.** 44 distinct names;
   `DYP-000072` lists **18** and `DYP-000069` lists 14, including Latin names.
   Rendered joined with `、`. The new design accepts this — the Figma result
   item is drawn with a 14-name list wrapping to three lines — so it is no
   longer a column-width problem. Still decide whether an 18-name list belongs
   in a result summary or only on the entry page.

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
    is the placeholder `ID123`), `DYP-000032`, `DYP-000104`. They fall back to
    English at build time, which is now the general rule for every field — see
    **Language fallback** above. `DYP-000001` is junk data and should probably
    be withdrawn.

11. **Pagination maths.** The design shows "1 2 3 … 12", implying 144
    records. There are 88, so 8 pages at 12 per page.

12. **Resolved 2026-09-01 — results link to the entry page.** `href` is now
    `/entry?id=<id>` (`ENTRY_PATH` in the build script), carried onto the row's
    `a.u-link-cover` by `catalogue.js`. There is no CMS, so one wireframe page
    reads `?id=`; the backend swaps that one field for its real route and no
    markup changes. See ENTRY.md.

## Second dataset, not used here

`input_by_dept_media_meta_data.xlsx` holds 1,164 media items joined to works by
`group_id`. Every one of the 88 works has at least one; the largest,
`DYP-000074`, has **141**. That is entry-page material, and 141 thumbnails in
one column is a design problem worth knowing about before that page is drawn.

## State

Built headlessly — **not visually verified in Webflow**. The layout and the
behaviour were verified in the local harness (see above), but nobody has looked
at the Webflow canvas or a published page, so the design system's own type
scale, theme colours and breakpoints are unchecked on the real page. Nothing has
been published. The
Designer will show the page with one template row; the script only runs on a
published or previewed page.
