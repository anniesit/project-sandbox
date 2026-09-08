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
| 作品年份與類別 (bubble) | x = year · y = **category or location, switchable** · **area** = number of works | `/catalogue?category=…&from=Y&to=Y` or `/catalogue?location=…&from=Y&to=Y` |
| 合作導演與創作者 (treemap) | area = number of credits · shade = the same count | `/catalogue?director=…` |

The axis switch is the only control on the page, and it changes nothing but
which view you are looking at — it fires no event and filters nothing.

## Why a bubble is a group, and why the axis switches

The Figma frame draws one dot per entry, with y = category and colour =
location. This build draws **one bubble per (year × row)** — every work sharing
a year and a category, or a year and a location — and lets the reader switch
which of the two the y axis carries.

The grouping is chosen by the href, not by taste. A mark's link has to be a
catalogue *query*, so a mark has to be exactly what a query selects. Clicking
1982 · 劇場 lands on `?category=theatre-production&from=1982&to=1982` and gets
the same 5 works the bubble is sized for. That equality is the page's one
correctness property — see **Verified** below.

An earlier draft grouped by (year × category × location) all at once, which drew
63 near-identical dots that had to be dodged apart inside each band and could
not be compared along a row. Splitting that third dimension out into a switch
is what made the chart readable: 47 bubbles over 5 category rows, or 57 over 10
location rows, one per year per row, nothing overlapping.

Both axes ship in one payload rather than being re-fetched on toggle. They are
two views of 88 records, the whole file is a few kilobytes, and a request per
click would make an instant control feel like a page load.

### Rows with nothing to filter on

A work with **no location** cannot be expressed as a catalogue filter — there is
no "location is empty" option in the facet. Those marks are drawn **hollow and
carry no link at all**. Linking them to the year alone would quietly return
every other place too, and a mark that lies about where it goes is worse than
one that does not go anywhere. The chart's note says how many works that is
(16 of 88 today).

Dropping the row instead would hide nearly a fifth of the archive with nothing
to show for it. The category axis has no equivalent problem: the catalogue's
category facet has a synthetic "other" radio, so a record with no category is
still filterable.

A work with **no year** has no x position at all, so it is left off the chart
and counted in the note ("88 項作品，88 項有年份可繪於圖上"). Today that number is
zero, and the note is written so it stays true when it is not.

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

**The bubble chart has one mark colour, not a palette.** The y axis carries the
category or the location, so colour could only repeat what position already
says. A six-hue categorical scale on a site whose own palette is warm neutrals
plus one brick accent reads as decoration, not as information.

An earlier draft *did* encode location as colour, with a validated six-hue
palette, back when a bubble was split three ways inside a category band. The
switchable axis replaced that dimension, and the palette went with it. What
survives is the rule the palette work was there to satisfy: **nothing is
identified by colour alone.** Every mark's value is in its row label, its
tooltip, its accessible name, and the table under the chart. The one distinction
colour still draws — filled versus hollow — is a real difference in what the
mark does, not a category.

The mark defaults to the design system's own accent token
(`var(--primary--accent, #c0442a)`), so it follows the site's colour and its
light/dark modes with nothing to keep in step. The literal is only a fallback
for a page that does not load the system — the local harness, mainly.

The **treemap** keeps a five-step sequential ramp of the site's warm neutral →
brick, plus a matching ink step per shade so labels stay legible on every one.
There, colour restates size, which is legitimate redundancy on rectangles whose
areas are hard to compare across a long tail.

### Dark is keyed on `html.u-mode-dark`, not on `prefers-color-scheme`

The design system's `theme-toggle.js` owns that class: it seeds it from the OS
preference once, then lets a saved choice or the toggle override it. An earlier
draft asked the media query directly and painted dark marks on a page the toggle
had just switched to light. If the theme script is absent the class is absent and
the charts render light, which is the right way to fail against a white page.

Nothing re-renders when the toggle flips — these are CSS custom properties.

## The look lives in `dataviz.css`

`dataviz.js` writes inline `x`/`y`/`width`/`height` because those are computed
per viewport and cannot be classes. Everything else — colour, type, spacing,
bubble size — lives in **`dataviz.css`**, laid out like `filmtv/cooccur.css`:

* **PART 1 — colour, type and spacing.** Every token, plus the rules that apply
  them. This is the only part you edit to change how the chart looks.
* **PART 2 — structure.** No colour below that line.

Tokens are declared on `:where([data-dataviz])` — **zero specificity** — so
re-declaring any of them on a Webflow class that wraps the chart wins with no
`!important` and no edit to either file:

```css
.viz-card.cc-home { --dyviz-rowname-size: 15px; }
.viz-plot { height: 60svh; --dyviz-bubble-growth: 1; }
```

### ⚠️ The stylesheet is linked by the script, not by the page

**There is no `<link>` in Webflow, and nothing to find in the Designer.**
`dataviz.js` resolves `dataviz.css` from its own `src` — the two files sit side
by side on the seam — and injects the `<link>` into `<head>` itself. This is the
same trick the file uses to locate its sample data.

The reason is that four pages load this chart (homepage, `/dataviz`,
`/en/dataviz`, the local harness) and a fifth will be added eventually. One
forgotten `<link>` fails as "the chart looks wrong on the new page" with no
visible cause; self-linking cannot be forgotten.

The cost is that **the dependency is invisible on the page**, which is why it is
written down here. If you ever move or rename either file, move both — they must
remain siblings. An explicit `<link>` is honoured and not duplicated (the check
compares resolved hrefs), so adding one by hand is safe if you would rather
declare it.

`dataviz.js` still injects a **minimal structural floor**: only the handful of
rules without which the layout collapses rather than merely looking plain
(absolutely-positioned treemap cells, tooltip positioning, mark fill). A missing
`dataviz.css` therefore degrades to a readable unstyled chart, not a broken page.

### Two token groups that behave differently

| | Consumed as | Units |
|---|---|---|
| colour, font size/weight, opacity | real CSS | **take units** — `15px`, `1rem`, `var(--_typography---paragraph-sm--font-size)` |
| spacing and bubble size | read by JS via `parseFloat` | **unitless only** — `12`, not `12px` |

The second group (`--dyviz-pad-*`, `--dyviz-rowname-x`/`-y`, `--dyviz-tick-gap`,
`--dyviz-axis-*`, `--dyviz-band-*`, `--dyviz-bubble-*`) is read back out of CSS
by `cssNum()`. An unregistered custom property is never resolved to pixels, so
`12px` reads as `12` and `1rem` reads as `1`. They are viewBox units, which equal
CSS pixels because the chart re-renders at its measured width.

`--dyviz-rowname-y` is a text **baseline** offset, not a top edge: raise it when
you raise `--dyviz-rowname-size`, or the label crowds the hairline above it.

### Bubble size

`r = --dyviz-bubble-base × count ^ --dyviz-bubble-growth`, capped at half the
band. `0.5` is **area-true** — four works draw four times the ink. `1` makes the
radius proportional instead, so four works draw *sixteen* times the ink; it reads
as more dramatic and overstates the big years. Both are legitimate editorial
choices, but the cap bites sooner at higher growth: at `growth: 1, base: 4.5` a
count of 8 wants r=36, which fits the homepage's tall plot (rMax ≈ 46) but clamps
on `/dataviz`'s 10-row location axis (rMax ≈ 19), where every count above 4 draws
the same size. Lower `--dyviz-bubble-base` there if that matters.

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

  // One entry per switchable y axis. The first is the default view.
  "axes": [ {
      "key": "category",
      "label": "類別",
      "rows":   [ { "key": "theatre-production", "label": "劇場", "count": 69 } ],
      "points": [ { "year": 1982, "row": "theatre-production", "count": 5,
                    "href": "/catalogue?category=theatre-production&from=1982&to=1982" } ],
      "unfilterable": 0
  } ],

  "collaborators": [ { "name": "胡恩威", "count": 5,
                       "href": "/catalogue?director=%E8%83%A1%E6%81%A9%E5%A8%81" } ]
}
```

`rows` are ordered busiest first, so the reader's eye starts where the data is;
ties break on the label so the order is stable between rebuilds. `points` carry
`"href": null` when the row's value cannot be filtered for, and `unfilterable`
counts the works behind those marks so the chart's note can say so.

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

## data-* contract (authored in Webflow; changing these breaks the page)

```
[data-dataviz]                    the root; everything is queried inside it
  [data-chart="temporal"]         the bubble chart card
  [data-chart="collaborators"]    the treemap card
    [data-legend]                 the card's control / key strip. On the bubble
                                chart it holds the Y-AXIS SWITCH; on the treemap
                                it holds the shade key. Both are generated
    [data-plot]                   the chart is generated into it — it is EMPTIED
                                  on every render, so author nothing inside it
    [data-note]                   one line about what is and is not on the chart
    [data-table]                  the fallback <table> is generated into it
```

`[data-table]` is not a courtesy. It is the route to the same numbers without
hover and without a pointer — and the only one that survives printing. Its cells
carry the same links the marks do, and on the bubble chart it follows the axis
switch, because it is that chart's other view rather than a separate dataset. It
sits inside a `<details>` so it costs nothing until asked for.

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

In that harness, at 800px and 1000px wide, light and dark, both languages:

- **Category axis:** 5 rows, 47 bubbles, all linked. **Location axis:** 10 rows,
  57 bubbles, 44 linked and 13 hollow (the 16 works with no location recorded).
  The switch redraws only the bubble chart, rewrites the note and the table
  header, and leaves focus on the button just pressed.
- 43 treemap cells filling their box exactly (rightmost edge 760.0 of 762,
  bottom 548.0 of 550), smallest cell 66 × 62px — still a real click target.
- **Every link returns what its mark claims.** Spot-checked against the
  catalogue harness: 香港 · 2000 is sized 6 and its href returns "共 6 項";
  劇場 · 1982 is sized 5 and returns "共 5 項"; 德國 · 2000 is sized 3 and
  returns "共 3 項"; the 胡恩威 treemap box says 5 credits and returns "共 5 項"
  with the director dropdown restored to 胡恩威.
- Tooltips fire on hover **and on focus**, so a keyboard reader gets the same
  reading a mouse does; both charts share one tooltip node, moved rather than
  rebuilt.
- The English page reads its own aggregate and links to `/en/catalogue`.
  It reports 45 collaborators against Chinese's 43 — the two languages resolve a
  few names to different strings, which is a data-layer question, not a chart
  one.
- Resizing re-lays-out both charts (debounced, and ignored when the width has
  not actually changed — a phone's URL bar collapsing is not a resize). The band
  height shrinks as rows are added, so switching from 5 categories to 10
  locations grows the chart by 110px, not by double.

## Still open

- **The Figma frame is English-only, and it has no axis switch.** The frame
  fixes y = category and colour = location; the switch, the single mark colour
  and the Chinese chart titles, axis labels and card copy were all written for
  this build and have not been through the client. The type on both cards is the
  design system's, not the frame's 11px Inter.
- The frame's 1px `#ccc` / 4px-radius card stroke is off-token, same as on the
  catalogue page. The card border is bound to `Primary/Border` +
  `Border Radius/SM` instead.
- The "1,xxx views" counter in the frame's footer is not built — there is no
  view-count source.
