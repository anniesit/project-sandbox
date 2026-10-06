# Home page — 精選檔案 / Highlights (build notes and data contract)

> **Two Webflow sites exist. Build on the right one.** See `CATALOGUE.md` for
> the table. All work here is on **Danny Yung Archive Design**
> (`6a9a35a2fff31509fd87b275`). Home 首頁 `…b246` (slug `/`),
> Home (EN) `6aa3a868f2217b655720e072` (slug `/en/home` — Webflow folders have
> no index page, so the English home is the one pair that is not 1:1; see
> `ENTRY.md`).

The rest of the home page — the hero, the parallax, the overview chart — is
covered by the two embeds already on the page (`dy-home-css`, `dy-home-js`).
This file covers only the **精選檔案 / Highlights** section.

## What it does

`.home-highlight` shows three works. They are **drawn at random on every page
load** from a hand-curated shortlist of entry ids, and a button draws another
three without a reload.

The shortlist is **editorial**, so it lives in the script, not in the data
layer. Everything else about each work — title, category, year, location,
director, and the link to its record — comes from the catalogue feed, so a
highlighted work is never re-typed by hand and cannot drift from its record.

## Where to edit the shortlist

`home.js`, the `CONFIG` block at the top of the file:

```js
var HIGHLIGHT_IDS = [
  "DYP-000024", // 錄影窗 / Video Window (1987)
  "DYP-000027", // 拾日譚 / Decameron (1988, 台北)
  "DYP-000087", // 佛洛伊德尋找中國情與事 (東京) (2003)
];
```

Those three are the works that were placed statically in Webflow, looked up in
`sample-data/catalogue-full.json`. Add as many ids as you like — `PICK` of them
are drawn per load. **An id that is not in the feed is skipped and logged to
the console**, so a typo costs one card, not the page.

Below it in the same block: `PICK` (how many cards, the grid is built for 3),
`IMG_BASE` and `IMG_EXT`.

## Thumbnails

One file per entry id, named after the id: `images/home-highlights/DYP-000024.webp`.

`IMG_BASE` resolves against **the script's own URL**, not the page's, so the
same value serves the Webflow site, the Vercel sandbox and the local harness —
the script and the images travel together.

**At code export** the images go to `/images/home-highlights/` at the site root
and `IMG_BASE` becomes `"/images/home-highlights/"`. One line. A page that
needs a different folder can override it with `data-img-base` in Webflow
instead, which wins over the constant.

A missing file is not an error: the `<img>` is removed and the
`.u-img-cover.cc-background` placeholder already behind it shows through, so
the card still renders with its title and credits. That is also the state
before any thumbnails exist.

## Page structure

```
.home-highlight[data-reveal-group="scroll"]
  .home-block-title.cc-full[data-reveal="1"]     h2 精選檔案 + .home-rule
  .home-highlight-content
    .paragraph-wrap.cc-narrow[data-reveal="2"]   intro copy
    div[data-home-random]                        > Button (component)
  .home-card-wrap[data-reveal="3"][data-home-highlights][data-src]
    .home-card                                   ← no-JS fallback
    .home-card[data-card-template]               ← cloned per work
    .home-card                                   ← no-JS fallback
  HtmlEmbed #dy-home-highlights-js               script tag only
```

The reveal animation is untouched by any of this: the cards sit *inside*
`[data-reveal="3"]`, and the script replaces that element's children, never the
element. A re-render after the reveal has fired inherits the revealed state, so
the new cards appear immediately rather than fading in a second time.

## data-* contract

Authored in Webflow. **Changing these breaks the section**; the full list, with
the reasoning, is the header comment of `home.js`.

| Attribute | On | Why |
|---|---|---|
| `data-home-highlights` | `.home-card-wrap` | the root; everything is queried inside it |
| `data-src` | same element | **ABSOLUTE** URL of the catalogue JSON. A relative path would resolve against the *page*, and `/en/home` would ask for `/en/sample-data/…`. Same rule as every other page |
| `data-img-base` | same element | OPTIONAL, overrides `IMG_BASE` |
| `data-card-template` | the middle `.home-card` | the card that is cloned. Authored and styled in Webflow, stays visible on the canvas, lifted out of the DOM on first render |
| `data-field=title\|category\|year\|location\|director` | spans / the h3 | text sinks |
| `data-field-group=category\|location\|director` | the chip, the `/` + location, the 導演： line | the fragment removed when that field is empty — an em dash in a card reads as a data error |
| `data-field-img` | the `<img>` | gets `src` + `alt` |
| `data-field-link` | `a.u-link-cover` | THE card's destination and the only one |
| `data-home-random` | the div wrapping the Button | the shuffle control. Optional — without it the section still randomises on load, it just cannot be reshuffled |

### Why the template card is the MIDDLE one

Card 1 (錄影窗) has no location, so its markup has no `/` separator and no
location span. A template must carry **every** fragment the script might need
to fill or drop. Card 2 (拾日譚, 1988 / 台北) is the only one of the three with
the full set, so it is the template.

### Why `data-home-random` is on a wrapper div, not on the Button

The `Button` component (`2802151f-…`) has **Attribute Name** / **Attribute
Value** props that look like the right hook. They do not render — setting them
produced no attribute in the published markup (checked 2026-09-17). The
wrapper div is the same pattern the overview-chart button already uses
(`<div data-home-btn="dataviz">`).

Two other things about that component, learned the same way:

- The visible label is the **`Text`** prop, not the `Button Text` prop. Setting
  `Button Text` alone published a button reading "Link".
- The two pages render it differently: `/en/home` produces a real
  `<button type="button">`, `/` produces `<div class="button">` wrapping
  `<a href="#">`. The script calls `preventDefault()`, so the Chinese one does
  not jump to `#` — but the two are not the same control, and the Chinese one
  is a link pretending to be a button. Worth straightening out in Webflow.

## Data source

Both pages point at the **full** catalogue feed, not the paged sample:

| Page | `data-src` |
|---|---|
| `/` | `https://hkbuproject-sandbox.vercel.app/dannyyung/sample-data/catalogue-full.json` |
| `/en/home` | `…/sample-data/catalogue-full-en.json` |

It has to be the full file — a highlighted id can be anywhere in the 88
records, and the sample files are subsets.

Language is read from the nearest `[lang]` ancestor, the same switch
`catalogue.js` and `entry.js` use, so the one file serves both pages. It only
affects the separator between director names (`、` vs `, `) and the
"Untitled" fallback; every other string comes from the language-specific feed.

## Local harness

`home.html` + `python3 serve.py 8761`. It mirrors the Webflow subtree and the
data-* contract, and loads `./home.js` and `./sample-data/catalogue-full.json`
directly. Demo chrome only — it is a behaviour harness, not a design
reference.

## Still open

- **`home.js` is not on Vercel yet.** The Webflow embed points at
  `https://hkbuproject-sandbox.vercel.app/dannyyung/home.js`, which 404s until
  this repo is pushed. Until then the published pages show the three static
  fallback cards, which is the intended no-JS state.
- Thumbnails exist for the three seeded ids only. Every id added to the
  shortlist needs its own `DYP-000000.webp` in `images/home-highlights/`.
- The intro copy is still `[placeholder]` in both languages, as it was before.

## Hero — responsive, and the new site name (2026-10-06)

The hero was built desktop-only from Figma `446:883`. It now has three layouts,
and carries the new site name from Figma `573:1489` (中文) and `574:1708` (EN).
All layout is Webflow classes; the only embed CSS is the mouse parallax.

### The title is two positioned groups

Each corner of the photo holds a **`.title-group`** (absolute, flex column,
`Spacing/MD` gap). The `.title-block`s inside it are in normal flow, so a title
and its subtitle stack and can never drift into each other as the type scales.

| | top-left `.title-group.cc-top` | bottom-right `.title-group.cc-bottom` |
|---|---|---|
| 中文 | 榮念曾 (H1) + 與進念・二十面體 (`.cc-sub`) | 合作作品典藏 (H1) |
| EN | A Digital Archive of (`.cc-sub`) | Danny Yung’s Work (H1) + with Zuni Icosahedron (`.cc-sub`) |

- `.title-block.cc-sub` is the Figma H4 subtitle: the H4 font variables (the same
  ones `.tag-line` uses), `0` vertical / `Spacing/SM` side padding.
- `.cc-bottom` is `align-items: flex-end`, so its blocks line up on the right.
- The `h1` carries an `aria-label` with the full name in reading order
  (榮念曾與進念・二十面體合作作品典藏 / "A Digital Archive of Danny Yung’s Work with
  Zuni Icosahedron"). The blocks are flex items, which screen readers may run
  together without spaces.
- The mouse parallax (`#dy-home-css` embed) moves the two **groups**, not single
  blocks, so a subtitle travels with its title. The old per-block classes
  `.title-block.cc-title-1/2` were deleted.

### The title and tagline follow the photo

`.hero-screen-wrap` carries the screen's size (`width`, `min-width`,
`margin-top`), and `.hero-screen` is `width: 100%` inside it. The title groups
and `.tag-line-wrap` are absolutely positioned in the wrap, so their percentages
are percentages of the photo — at desktop and tablet.

**Phone is the exception, on purpose.** At ≤767 the wrap is a padded flex box
with a `min-height` (29rem, 26rem at ≤479) and the photo centred in it. The title
groups sit at the wrap's top and bottom edges, i.e. just above and below the
photo. Percentages there are of the padded box, not the photo.

### Per breakpoint

| | Desktop (base) | Tablet (≤991) | Phone (≤767) |
|---|---|---|---|
| `.home-hero` | `aspect-ratio 1440/1000`, `min-height 64rem` | `aspect-ratio auto`, `min-height 0` | — |
| `.home-hero.cc-tall` (EN only) | `min-height 84rem` | `min-height 0` | — |
| `.hero-screen-wrap` | `61.39%`, `min-width 45rem`, top `5rem` | `80%`, top `3rem` | `100%`, padded, min-height — see above |
| `.hero-screen` | 16:9 | **4:3** | — |
| `.title-group.cc-top` | left `-11.15%`, top `5%` | — | left `0`, top `0` |
| `.title-group.cc-bottom` | right `-14%`, bottom `5%` | right `-11%` | right `0`, bottom `0`, text right-aligned |
| `.title-block` | `white-space: nowrap` | — | `normal` (EN title wraps) |
| `.tag-line-wrap` (中文) | top `43%` | — | top `25%` |
| `.tag-line-wrap.cc-en` | top `80%` (below-left of the photo) | — | top `25%` |
| `.stage` | `height 25.59%` of the hero | `aspect-ratio 5/1.2` | `height 24svw`, min `8.2rem` |
| `.hero-text-wrap` | absolute, bottom padding `max(14%, 12rem)` | in flow below the stage | — |

Why the non-obvious values:

- **`.cc-tall` exists because the English intro is longer.** Its three
  paragraphs are about 400px tall at desktop against about 260px for Chinese.
  The text is pinned to the hero's bottom, so it rose over the photo and hid the
  tagline. Figma's EN frame is likewise taller (1359px against 1219px).
- **`.title-block` wraps on phones only.** "Danny Yung’s Work" at H1 size is wider
  than a phone screen. Everywhere else it stays on one line, because a block
  positioned near the wrap's edge has little room and would otherwise wrap.
- **`min-width 45rem` on the wrap.** The titles overhang the photo; at 992px a
  wider minimum left them no room and pushed them off the page.
- **The stage needs a real height at every width.** The stage-collapse script
  measures `.stage`'s CSS height. A percentage of an auto-height hero resolves
  to nothing, so tablet and phone use `aspect-ratio` / `svw`.
- **The 14 hero images' `sizes`** is
  `(max-width: 767px) 92vw, (max-width: 991px) 80vw, 61vw` on both pages.

Verified by rebuilding the same markup and rules on the published page at 1440,
992, 800 and 390, on both `/` and `/en/home`: no horizontal scroll, no title or
tagline overlap, and the 1440 layouts match the Figma frames.
