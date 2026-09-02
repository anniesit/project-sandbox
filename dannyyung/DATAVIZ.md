# Data Viz page (資料視覺化) — build notes and data contract

Webflow site `6a8fda591c4e266dbbb91533` (Danny Yung Archive).
Chinese page slug `/dataviz`, English `/en/dataviz`.

Built from the Figma frame `DataViz` (file `PM7YYo9FuEQtVO82kvggvn`, node
`56:215`). The Figma frame is an **English wireframe with invented data** —
"Edward Lam 32", a 1974–2022 axis, six neat location swatches. The real archive
is 88 works, 1974–2020, five categories and ten places, so the numbers below
never match the frame. The frame was read for **structure and encoding**, not for
values.

## What the page is for

Two charts, and every mark on both of them is a link into the catalogue. There
are **no controls on this page** — no search box, no facets, no sort. Filtering
belongs to `/catalogue`, and duplicating it here would give the reader two
half-working search UIs that disagree. The viz is a way *in*.

| Chart | Encoding | A click lands on |
|---|---|---|
| 作品年份與類別 (bubble) | x = year · y = category band · colour = location · **area** = number of works | `/catalogue?category=…&from=Y&to=Y&location=…` |
| 合作導演與創作者 (treemap) | area = number of credits · shade = the same count | `/catalogue?director=…` |

## Why a bubble is a group, not a work

The Figma frame draws one dot per entry. This build draws one bubble per
**(year × category × location)** group and sizes it by the count — 63 bubbles for
88 works, 46 of which are still single works and look exactly like the frame's
dots.

The reason is the href. A mark's link has to be a catalogue *query*, and a
catalogue query is exactly those three dimensions. A per-work dot could only link
to that work's entry page, which is not what the design asks for. Grouping makes
every mark reproducible: the bubble at 1982 · 劇場 · 香港 is sized 4 and its link
returns those same 4 works. That equality is the page's one correctness
property — see **Verified** below.

Bubbles that share a year and a category are **dodged** vertically around the
band centre, ordered by colour slot. The order is deterministic on purpose: a
random jitter would reshuffle every resize and read as the data changing.

## Why Danny Yung is not in the treemap

He is credited as director on 65 of the 88 works. Including him gives one box
covering about 59% of the area and squeezes the 43 people the chart is *about*
into slivers — it stops answering "who did he work with".

This is an **editorial** decision, not a data fix. The credit is real and the
catalogue still carries it. It lives in one named constant, `ARCHIVE_SUBJECT` in
`sample-data/build-dataviz-sample.py`; empty the set to put him back. The chart's
own note says so on the page, in both languages, so a reader is not left to
wonder where he went.

## Colour

Location is the only categorical encoding on the page, and it needed a real
palette — the site's own tokens are one accent plus warm neutrals, which cannot
tell six places apart.

Six hues were **validated, not chosen by eye**, in both light and dark:

```
light  #c0442a  #1268a8  #b98600  #7b4fb5  #3f8a3a  #a8447e   (surface #fcfcfb)
dark   #d8563c  #3e90cc  #b08514  #9878d4  #4da648  #c95a96   (surface #1d1c1a)
```

Both sets pass the OKLCH lightness band, the chroma floor, colour-vision-
deficiency separation (worst adjacent pair ΔE 10.1 deutan / 9.7 tritan), the
normal-vision floor and ≥ 3:1 contrast against their surface. **Do not edit a hex
without re-running that check** — the failure mode is invisible to the author and
total for the reader.

Three rules the build keeps:

- **Colour is never the only encoding.** Location is in every tooltip, every
  accessible name, the legend (with its count) and every row of the fallback
  table.
- **"No location recorded" is not a seventh hue.** It is a hollow ring. 16 of the
  88 works have no location, so this is a large group, and giving absence a
  colour would let it read as a place.
- **A hue is bound to a place, not to a rank.** `LOCATION_SLOT` in the builder
  keys on the place name, so a data update cannot repaint a location that did not
  change. A new place lands in the shared "其他地點" bucket until someone adds it
  to that map — deliberately, so nothing is silently given a colour.

The treemap uses a five-step sequential ramp of the site's own warm neutral →
brick, plus a matching ink step per shade so labels stay legible on every one.

### Dark is keyed on `html.u-mode-dark`, not on `prefers-color-scheme`

The design system's `theme-toggle.js` owns that class: it seeds it from the OS
preference once, then lets a saved choice or the toggle override it. An earlier
draft asked the media query directly and painted dark marks on a page the toggle
had just switched to light. If the theme script is absent the class is absent and
the charts render light, which is the right way to fail against a white page.

Nothing re-renders when the toggle flips — these are CSS custom properties.

## Colour lives in CSS, geometry lives in JS

`dataviz.js` writes inline `x`/`y`/`width`/`height` because those are computed per
viewport and cannot be classes. Every **colour**, by contrast, is a
`--dyviz-*` custom property. The defaults are injected once under
`:where([data-dataviz])` — **zero specificity** — so any rule authored in the
Webflow Designer overrides them with no `!important` and no edit to this file.
Retheme by re-declaring `--dyviz-*` on `.section`, on `[data-dataviz]`, or in the
project override block.

The injected stylesheet carries **structure only** (positioning, overflow,
focus ring). Anything that is a design decision — type, spacing, the card border —
belongs to the Webflow classes.

## The data seam

Same pipeline as the catalogue and entry pages. Nothing is embedded in Webflow;
the page carries one script tag:

```
project-sandbox/dannyyung/dataviz.js
  -> https://hkbuproject-sandbox.vercel.app/dannyyung/dataviz.js
```

### Sample data

`sample-data/dataviz-sample.json` is generated, never hand-edited:

```
python3 sample-data/build-catalogue-sample.py     # first — the source of truth
python3 sample-data/build-dataviz-sample.py       # then this
```

**The viz builder reads the catalogue's OUTPUT, not the spreadsheets.** Every
mark claims "there are N works behind this link". If the two scripts parsed the
xlsx independently they would drift the first time a column was reclassified, and
the page would promise a count the catalogue does not deliver. So the viz is a
pure aggregation of the catalogue's own published records — same language
fallback, same category keys, same location strings, same director arrays. That
rebuild order is not optional.

Output shape (this IS the contract):

```jsonc
{
  "lang": "zh-Hant",
  "cataloguePath": "/catalogue",
  "years":  { "min": 1974, "max": 2020 },
  "totals": { "works": 88, "dated": 88, "undated": 0, "collaborators": 43 },
  "categories": [ { "key": "theatre-production", "label": "劇場", "count": 69 } ],
  "locations":  [ { "slot": 0, "label": "香港", "count": 51, "places": ["香港"] } ],
  "bubbles": [ {
      "year": 1982, "categoryKey": "theatre-production",
      "location": "香港", "locationSlot": 0, "count": 4,
      "href": "/catalogue?category=theatre-production&from=1982&to=1982&location=%E9%A6%99%E6%B8%AF"
  } ],
  "collaborators": [ { "name": "胡恩威", "count": 5,
                       "href": "/catalogue?director=%E8%83%A1%E6%81%A9%E5%A8%81" } ]
}
```

`slot` is an index into the palette, `-1` meaning "no location recorded" (drawn
hollow) and `5` the shared "elsewhere" bucket. `places` lists what a catch-all
bucket actually covers, so 其他地點 is not a dead end — it becomes the legend
item's `title`.

**The `href`s are built by the builder, not by the component.** The param names
and the omit-a-default rule are `catalogue.js`'s `URL_KEYS`; they live in one
place so a rename there is a one-file change, and `qs()` in the builder carries a
comment saying so.

### Replacing the mock driver

`dataviz.js` ends with a fenced block:

```
/* >>> MOCK DRIVER <<< — delete this whole block for production. */
...
/* >>> END MOCK DRIVER <<< */
```

It fetches the sample and calls `render()`. That is all a backend replaces: fetch
your own aggregate, call `window.dyDataviz.render(root, payload)`. Nothing above
the fence changes. Also delete the `>>> MOCK DATA URL <<<` constant at the top.
A root may override the sample with `data-src="…"` for testing.

### One thing the aggregate cannot express

A work with **no location** has no catalogue filter — there is no "location is
empty" option in the facet. Those bubbles therefore link on year + category only,
and their accessible name says exactly what the link does rather than claiming a
place. A link that narrows honestly beats one that silently returns other places
too. Same for a work with **no year**: it has no x position, so it is left off the
chart and counted in the note under it ("88 項作品，88 項有年份可繪於圖上"). Today
that number is zero, and the note is written so it stays true when it is not.

## data-* contract (authored in Webflow; changing these breaks the page)

```
[data-dataviz]                    the root; everything is queried inside it
  [data-chart="temporal"]         the bubble chart card
  [data-chart="collaborators"]    the treemap card
    [data-legend]                 legend items are generated into it
    [data-plot]                   the chart is generated into it — it is EMPTIED
                                  on every render, so author nothing inside it
    [data-note]                   one line about what is and is not on the chart
    [data-table]                  the fallback <table> is generated into it
```

`[data-table]` is not a courtesy. It is the route to the same numbers without
colour, without hover and without a pointer — and the only one that survives
printing. Its cells carry the same links the marks do. It sits inside a
`<details>` so it costs nothing until asked for.

## Local preview

```
python3 serve.py 8761
open http://127.0.0.1:8761/dataviz.html        # zh-Hant
open http://127.0.0.1:8761/en/dataviz.html     # en
```

`dataviz.html` is a behaviour harness with the same `data-*` markup and throwaway
CSS. It is **not** a design reference. Note that its own stylesheet deliberately
targets nothing under `.dyviz-*`: the component's rules are zero-specificity, so
a stray harness rule would silently win and hide a real bug.

## Verified

In that harness, at 800px and 1400px wide, light and dark:

- 63 bubbles over 5 category bands; 15 drawn hollow for "no location"; 43
  treemap cells filling the box exactly (rightmost edge 760.0 of 762, bottom
  548.0 of 550), smallest cell 66 × 62px — still a real click target.
- **Every link returns what its mark claims.** Spot-checked against the
  catalogue harness: the 1982 · 劇場 · 香港 bubble is sized 4 and its href
  returns "共 4 項"; the 1993 · 視覺藝術 bubble is sized 1 and returns "共 1 項";
  the 胡恩威 box says 5 credits and its href returns "共 5 項" with the director
  dropdown restored to 胡恩威.
- Tooltips fire on hover **and on focus**, so a keyboard reader gets the same
  reading a mouse does; both charts share one tooltip node, moved rather than
  rebuilt.
- The English page reads its own aggregate and links to `/en/catalogue`.
  It reports 45 collaborators against Chinese's 43 — the two languages resolve a
  few names to different strings, which is a data-layer question, not a chart one.
- Resizing re-lays-out both charts (debounced, and ignored when the width has not
  actually changed — a phone's URL bar collapsing is not a resize).

## Still open

- **The Figma frame is English-only.** The Chinese page's chart titles, axis
  titles and card copy were written for this build; they have not been through
  the client. The type on both cards is the design system's, not the frame's
  11px Inter.
- The frame's 1px `#ccc` / 4px-radius card stroke is off-token, same as on the
  catalogue page. The card border is bound to `Primary/Border` +
  `Border Radius/SM` instead.
- The "1,xxx views" counter in the frame's footer is not built — there is no
  view-count source.
