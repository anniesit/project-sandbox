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
