# Supplementary Materials page — build notes

Companion page to `目錄` (the catalogue). Holds records that are not a
production or event — books and commentary about Danny Yung's work, written
by him or other authors. Built 2026-09-02 by duplicating the Chinese
Catalogue page in Webflow. See `CATALOGUE.md` for the catalogue's own
contract; this file only covers what differs.

## What the client asked for

The client flagged that some rows in the source spreadsheet are not artworks
or participated events: `DYP-000099`, `DYP-000102`–`DYP-000109`, "and there
are more to come, including interviews and documentaries." They duplicated
the Chinese Catalogue page into a new page (`其他資料`, slug
`/supplementary-materials`) to hold them, and asked for the credit line
swapped from director to author, since these records have no director.

## Selection rule: an explicit ID list, because this is a mockup

This page exists to let the client see the *concept* of the split before any
data decision is finalised, so the build uses exactly the 8 IDs the client
named — `DYP-000099`, `102`, `104`–`109` (`DYP-000103` does not exist in the
current spreadsheet, which is why "102-109" is 7 IDs, not 8, and the named
set totals 8 with 099 added).

This is **not** the same set as "categoryKey is empty" — CATALOGUE.md's "six
records with no category" (discrepancy #2) is `102, 105-109` only.
`DYP-000099` and `DYP-000104` are tagged `劇場` (theatre-production) in the
spreadsheet, not blank, so including them here means the page is currently
showing two records whose own category field disagrees with where they sit.
That's fine for a concept mockup; it stops being fine the moment this becomes
the real page.

**Before this ships:** decide with the client whether 099 and 104 get
re-tagged in `data/DIR_current_data.xlsx` (then a category-based filter would
pick up the whole set on its own, and `SUPPLEMENTARY_IDS` in the build script
could be deleted) or whether the split is genuinely ID-based going forward
(then `SUPPLEMENTARY_IDS` is the real mechanism, and new interviews/
documentaries get added to it by hand as they arrive).

## Data pipeline

`sample-data/build-supplementary-sample.py` does **not** read the client's
`.xlsx` files. It reads `catalogue-sample*.json` and `entry-sample*.json` —
both already built from the spreadsheets — so there is only ever one parse of
the source workbooks (same rule the Data Viz page follows; see
`dannyyung-archive-project` memory). Rebuild order is fixed:

```
python3 sample-data/build-catalogue-sample.py
python3 sample-data/build-entry-sample.py
python3 sample-data/build-supplementary-sample.py
```

Output shape (`supplementary-sample.json` / `-en.json`):

```json
{
  "id": "DYP-000105",
  "title": "其他-1996",
  "titleEn": "Non-project-based-1996",
  "year": 1996,
  "location": "",
  "authors": ["榮念曾"],
  "notes": "",
  "mediaCount": 1,
  "href": "/entry?id=DYP-000105"
}
```

No `category` / `categoryKey` field is carried into the output — `099` and
`104` do have a real category (`劇場`) today (see above, this is deliberate
for the mockup), so `supplementary.js` hardcodes the category chip to empty
rather than rendering whatever the source category happens to be, keeping
every row on this page visually consistent. `authors` is the one field this
page adds: it is **not** on the
works sheet (there is no `author_*` column there). It is rolled up from
`authors_zh-Hant` / `authors_en` on the MEDIA sheet, which `entry.js` already
surfaces per material — this script just collects each record's media-item
authors onto the work, deduplicated, in source order. Every record here
happens to have exactly one media item today, so this is a 1:1 copy; a future
record with several authored items would join them (same "、" convention as
`directors`).

## Rendering: `supplementary.js`

A sibling of `catalogue.js`, not a shared file — see the header comment in
`supplementary.js` for why they stay separate (disjoint record sets, an event
name of its own, a credit field that means something different). It reuses
the exact `data-field` / `data-field-group` contract CATALOGUE.md documents,
with `director` renamed to `author` throughout, and drops:

- the category facet (radios) — every record shares one categoryKey, so a
  radio group would have one live option;
- the location and director/author facet dropdowns — the sample data does
  not have enough variety yet to make filtering by either worth the UI.

If the set grows past a handful of authors, add an author facet the way
`catalogue.js` adds one for director, rather than teaching this file
categories or facets it does not have.

## Webflow page changes made 2026-09-02

The duplicate already had `catalogue-layout` → `supp-layout` and
`catalogue-results` → `supp-results` renamed (done by hand before this pass),
plus `cc-supp` combo classes seeded on the year facet, the count line, and
the result-item template. On top of that:

- `[data-catalogue]` → `[data-supplementary]` on the layout root, so
  `supplementary.js` and `catalogue.js` cannot both bind to the same
  element if they ever end up on the same page.
- The credit block: `data-field-group="director"` → `"author"`,
  `data-field="director"` → `"author"`, label text `導演：` → `作者：`.
- Search input placeholder: `搜尋作品、導演、地點…` → `搜尋標題、作者…` (this
  page has no venue/location worth prompting for, and no director).
- `<h1>` set to a placeholder `其他資料`, matching the current page title —
  update it in the same edit once the title question below is settled.

**Not done, and outside what the Data API can reach:** the page's script
embed (`.catalogue-script` `HtmlEmbed`) is empty — its `<script src>` has to
be set in the Designer by hand, the same way the catalogue and dataviz pages
were wired (see `dannyyung-archive-project` memory on the
Data-API-headless-vs-Designer-live-session split). Point it at
`supplementary.js` on Vercel once the repo is pushed, not at `catalogue.js`.

## Open: the page title

The client thinks `其他資料` ("other materials") reads as too dismissive for
a public-facing archive section. Alternatives proposed in conversation
2026-09-02 — not yet chosen or applied. Whichever is picked needs three
edits: the Nav link (if one exists yet — none does today, same gap DATAVIZ.md
notes for its own page), the page's SEO title, and the `<h1>`.
