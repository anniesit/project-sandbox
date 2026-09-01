#!/usr/bin/env python3
"""
build-catalogue-sample.py — client spreadsheets -> catalogue-sample.json

The filmtv build-*.js scripts are JavaScript because their sources are JSON/CSV.
This one is Python because the client delivers .xlsx, and openpyxl is the
shortest path that does not add a Node dependency to the sandbox.

Usage:  python3 sample-data/build-catalogue-sample.py
Reads:  data/DIR_current_data.xlsx                 (one row per WORK)
        data/input_by_dept_media_meta_data.xlsx    (one row per MEDIA ITEM)
Writes: sample-data/catalogue-sample.json

`DIR_current_data.xlsx` superseded `input_by_dept.xlsx` on 2026-09-01. The old
file is kept in data/ for comparison only — nothing reads it. Two differences
matter to any script that touches the new one:

  1. **Empty cells are the literal string "NULL"**, not blanks. Read every cell
     through text() below or the page prints "NULL" as content.
  2. Numbers arrive as ints (1974) rather than floats (1974.0), so the old
     float-stripping is no longer needed — but it is kept, harmlessly, in case
     the client re-exports from the source that produced the floats.

The output shape IS the integration contract — see CATALOGUE.md. Keep it keyed
and readable; catalogue.js is loaded from Vercel, not embedded, so there is no
size limit to golf against.
"""

import json
import os
import collections
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")

WORKS_XLSX = os.path.join(DATA, "DIR_current_data.xlsx")
MEDIA_XLSX = os.path.join(DATA, "input_by_dept_media_meta_data.xlsx")

CATEGORY_KEY = {
    "劇場": "theatre-production",
    "視覺藝術": "visual-arts",
    "活動": "event",
    "表演藝術": "performing-art",
}

# ---------------------------------------------------------------------------
# Column classification for DIR_current_data.xlsx (77 columns).
#
# This is the "which columns may be published" decision, written down so the
# backend developer inherits it rather than re-deriving it. The script asserts
# that every column in the sheet appears in exactly one bucket, so a re-export
# that adds or renames a column fails loudly instead of leaking it.
# ---------------------------------------------------------------------------

# Work-level and safe to publish on the catalogue or entry page.
PUBLIC_WORK = [
    "id",
    "title_en", "title_zh-Hant", "title_zh-Hans",
    "category_en", "category_zh-Hant", "category_zh-Hans",
    "date_yyyy", "date_mm", "date_dd",
    "venue_en", "venue_zh-Hant", "venue_zh-Hans",
    "director_en", "director_zh-Hant", "director_zh-Hans",
    "location_en", "location_zh-Hant", "location_zh-Hans",
    "abstract_en", "abstract_zh-Hant", "abstract_zh-Hans",
    "keywords_en", "keywords_zh-Hant", "keywords_zh-Hans",
    "notes",
    "language",
]

# Per-media-item facts that this sheet also carries, rolled up to the work.
# The media sheet is the authority (it disagrees with this roll-up on 6 works),
# and the entry page groups the material cards by the media-level value — so
# nothing here should be read from the works sheet. See CATALOGUE.md.
MEDIA_LEVEL = [
    "content_category_en", "content_category_zh-Hant", "content_category_zh-Hans",
    "contributor_en", "contributor_zh-Hant", "contributor_zh-Hans",
    "authors_en", "authors_zh-Hant", "authors_zh-Hans",
    "publisher_en", "publisher_zh-Hant", "publisher_zh-Hans",
    "published_in_en", "published_in_zh-Hant", "published_in_zh-Hans",
    "digital_object_type",
    "video_length",
    "issue",
    "format",
    "url_storage_path", "url_storage_filename", "url_permalink", "url_thumbnail",
]

# Ingest, provenance, rights administration and sort bookkeeping. Not for
# display. `isPost` is the publication gate — a production feed should filter
# on it even though all 88 rows are currently "Y".
INTERNAL = [
    "isPost", "owner", "department",
    "work_type",
    "dataset_name_en", "dataset_name_zh-Hant", "dataset_name_zh-Hans",
    "sort_group_en", "sort_en", "sort_group_zh", "sort_zh-Hant", "sort_zh-Hans",
    "date_certainty", "no_date",
    "ocr_text",
    "wikidata",
    "copyright_status", "copyright_notes", "copyright_end_date",
    "license", "license_notes_en", "license_notes_zh-Hant", "license_notes_zh-Hans",
    "license_end_date",
    "acknowledgement_en", "acknowledgement_zh-Hant", "acknowledgement_zh-Hans",
]


def sheet_rows(path, sheet=None):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet] if sheet else wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    header = [str(h).strip() if h is not None else "" for h in rows[0]]
    out = []
    for r in rows[1:]:
        if all(c is None or str(c).strip() == "" for c in r):
            continue
        out.append({header[i]: (r[i] if i < len(r) else None) for i in range(len(header))})
    return header, out


def text(v):
    """Empty is None, "", the word "none", or the client's literal "NULL"."""
    if v is None:
        return ""
    s = str(v).strip()
    if s.lower() in ("none", "null"):
        return ""
    # Excel hands integers back as floats on some exports (1974.0).
    if s.endswith(".0") and s[:-2].lstrip("-").isdigit():
        s = s[:-2]
    return s


def year(v):
    s = text(v)
    if not s:
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def multi(v):
    """Client convention: multi-value cells are semicolon separated."""
    s = text(v)
    return [x.strip() for x in s.split(";") if x.strip()] if s else []


def check_columns(header):
    """A re-export that adds or renames a column must fail here, not leak."""
    known = set(PUBLIC_WORK) | set(MEDIA_LEVEL) | set(INTERNAL)
    seen = [c for c in header if c]
    unclassified = [c for c in seen if c not in known]
    missing = [c for c in sorted(known) if c not in seen]
    overlap = [c for c in seen if sum(c in b for b in (PUBLIC_WORK, MEDIA_LEVEL, INTERNAL)) > 1]
    if unclassified or overlap:
        raise SystemExit(
            "Column classification is out of date.\n"
            "  unclassified: %s\n  in two buckets: %s\n"
            "Add each to PUBLIC_WORK, MEDIA_LEVEL or INTERNAL in this file."
            % (unclassified, overlap)
        )
    return missing


def main():
    header, works = sheet_rows(WORKS_XLSX, "DataTemplate")
    _, media = sheet_rows(MEDIA_XLSX)
    missing = check_columns(header)

    counts = collections.Counter(text(m.get("group_id")) for m in media)

    items = []
    for w in works:
        cat = text(w.get("category_zh-Hant"))
        items.append({
            "id": text(w.get("id")),
            "title": text(w.get("title_zh-Hant")),
            "titleEn": text(w.get("title_en")),
            "category": cat,
            "categoryKey": CATEGORY_KEY.get(cat, ""),
            "year": year(w.get("date_yyyy")),
            "location": text(w.get("location_zh-Hant")),
            "venue": text(w.get("venue_zh-Hant")),
            "directors": multi(w.get("director_zh-Hant")),
            "mediaCount": counts.get(text(w.get("id")), 0),
            "href": "#",
        })

    payload = {"items": items}
    out_path = os.path.join(HERE, "catalogue-sample.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    # ---- data quality report ------------------------------------------------
    print("source          :", os.path.basename(WORKS_XLSX))
    print("columns         :", len([c for c in header if c]),
          "(public %d / media-level %d / internal %d)"
          % (len(PUBLIC_WORK), len(MEDIA_LEVEL), len(INTERNAL)))
    if missing:
        print("  ! classified but absent from the sheet:", missing)
    print("works           :", len(items))
    print("media items     :", len(media))
    print("no category     :", sum(1 for i in items if not i["category"]))
    print("no zh title     :", sum(1 for i in items if not i["title"]))
    print("no en title     :", sum(1 for i in items if not i["titleEn"]))
    print("no director     :", sum(1 for i in items if not i["directors"]))
    print("no location     :", sum(1 for i in items if not i["location"]))
    print("no venue        :", sum(1 for i in items if not i["venue"]))
    yrs = [i["year"] for i in items if i["year"]]
    print("year range      :", min(yrs), "-", max(yrs))
    print("media per work  : min %d  max %d" % (min(counts.values()), max(counts.values())))
    print("orphan media    :",
          sum(v for k, v in counts.items() if k not in {i["id"] for i in items}))

    # `notes` is free text that carries structured data the entry page needs
    # (run dates, extra credits). Counted here so the size of that problem
    # stays visible. See CATALOGUE.md "What the new file changes".
    notes = [text(w.get("notes")) for w in works]
    print("notes filled    :", sum(1 for n in notes if n),
          "— of which carry 'Date:':", sum(1 for n in notes if "Date:" in n))
    print("date_mm filled  :", sum(1 for w in works if text(w.get("date_mm"))))
    print("date_dd filled  :", sum(1 for w in works if text(w.get("date_dd"))))
    print("wrote           :", out_path)


if __name__ == "__main__":
    main()
