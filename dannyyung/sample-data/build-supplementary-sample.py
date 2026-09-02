#!/usr/bin/env python3
"""
build-supplementary-sample.py -- catalogue sample + works sheet -> supplementary-sample.json

The Supplementary Materials page holds records that are not a production or
event: books and commentary about Danny Yung's work, written by him or other
authors. It reads sample-data/catalogue-sample*.json for id/title/year/
location/href/category (already resolved by build-catalogue-sample.py's
language pick() logic), plus data/DIR_current_data.xlsx directly for the one
field the catalogue does not carry: authors_en / authors_zh-Hant. Rebuild
order is fixed: catalogue first, then this.

Selection rule -- an explicit ID allowlist, not a category filter. This page
is a MOCKUP for the client to see the concept of the split, so it uses
exactly the 8 records the client named (DYP-000099, 102-109; DYP-000103 does
not exist in the current spreadsheet, leaving 8): 099, 102, 104-109.

Two of those -- 000099 and 000104 -- are tagged "劇場" (theatre-production) in
the spreadsheet, not blank, so this is NOT the same set as "categoryKey is
empty" (CATALOGUE.md's "six records with no category", discrepancy #2, is a
narrower list). Once the client confirms the split, the real rule should
probably become a spreadsheet fix (re-tag these rows so a category-based
filter picks them up on its own) rather than a hardcoded ID list living here
permanently -- flagged, not resolved.

Category is shown AS IS, not suppressed. 000099 and 000104 keep their real
劇場 chip -- confirmed with the client 2026-09-03: the mismatch (a "theatre
production" tag on a supplementary-materials page) is expected to be visible
right now, not hidden, because hiding it would misrepresent what the source
data actually says.

Author, singular concept but from TWO client columns: authors_en and
authors_zh-Hant on the WORKS sheet (DIR_current_data.xlsx) -- confirmed with
the client 2026-09-03 to use these, not the per-media-item authors_* on the
MEDIA sheet that entry.js surfaces. The two disagree in scale: the works
sheet has zero or one name per record, the media sheet can have several (one
per material) and produced more names than the client expected to see on a
list page. Same pick()/multi() convention as director: semicolon-separated,
preferred language falling back to the other.

Usage:  python3 sample-data/build-supplementary-sample.py
Reads:  sample-data/catalogue-sample.json, catalogue-sample-en.json
        data/DIR_current_data.xlsx
Writes: sample-data/supplementary-sample.json, supplementary-sample-en.json
"""

import json
import os
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WORKS_XLSX = os.path.join(ROOT, "data", "DIR_current_data.xlsx")

SUPPLEMENTARY_IDS = {
    "DYP-000099", "DYP-000102", "DYP-000104", "DYP-000105",
    "DYP-000106", "DYP-000107", "DYP-000108", "DYP-000109",
}

LANGS = {
    "zh-Hant": {
        "catalogue": "catalogue-sample.json",
        "want": "zh-Hant", "other": "en",
        "out": "supplementary-sample.json",
    },
    "en": {
        "catalogue": "catalogue-sample-en.json",
        "want": "en", "other": "zh-Hant",
        "out": "supplementary-sample-en.json",
    },
}


def load_json(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return json.load(f)


def text(v):
    """Empty is None, "", the word "none", or the client's literal "NULL"."""
    if v is None:
        return ""
    s = str(v).strip()
    if s.lower() in ("none", "null"):
        return ""
    if s.endswith(".0") and s[:-2].lstrip("-").isdigit():
        s = s[:-2]
    return s


def pick_multi(row, base, want, other):
    """authors_<want>, else authors_<other>, semicolon-split -- same rule
    build-catalogue-sample.py applies to director."""
    v = text(row.get("%s_%s" % (base, want)))
    if not v:
        v = text(row.get("%s_%s" % (base, other)))
    return [x.strip() for x in v.split(";") if x.strip()] if v else []


def load_authors_by_id():
    wb = openpyxl.load_workbook(WORKS_XLSX, read_only=True, data_only=True)
    ws = wb["DataTemplate"]
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    header = [str(h).strip() if h is not None else "" for h in rows[0]]
    out = {}
    for r in rows[1:]:
        row = {header[i]: (r[i] if i < len(r) else None) for i in range(len(header))}
        rid = text(row.get("id"))
        if rid:
            out[rid] = row
    return out


def build(lang, cfg, works_by_id):
    catalogue = load_json(cfg["catalogue"])
    want, other = cfg["want"], cfg["other"]

    out_items = []
    for it in catalogue["items"]:
        if it["id"] not in SUPPLEMENTARY_IDS:
            continue
        w = works_by_id.get(it["id"], {})
        out_items.append(
            {
                "id": it["id"],
                "title": it["title"],
                "titleEn": it["titleEn"],
                "category": it["category"],  # as is -- not suppressed
                "year": it["year"],
                "location": it["location"],
                "authors": pick_multi(w, "authors", want, other),
                "notes": it["notes"],
                "mediaCount": it["mediaCount"],
                "href": it["href"],
            }
        )

    out_items.sort(key=lambda x: (x["year"] or 0, x["id"]))
    payload = {"lang": lang, "items": out_items}
    with open(os.path.join(HERE, cfg["out"]), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("%s: %d records -> %s" % (lang, len(out_items), cfg["out"]))


if __name__ == "__main__":
    works_by_id = load_authors_by_id()
    for lang, cfg in LANGS.items():
        build(lang, cfg, works_by_id)
