#!/usr/bin/env python3
"""
build-supplementary-sample.py -- catalogue + entry samples -> supplementary-sample.json

The Supplementary Materials page holds records that are not a production or
event: books and commentary about Danny Yung's work, written by him or other
authors. They live in the SAME client spreadsheets as the catalogue, so this
script does not touch data/*.xlsx directly -- it reads the two samples that
build-catalogue-sample.py and build-entry-sample.py already produced, exactly
like build-dataviz-sample.py does, so there is only ever one parse of the
source workbooks. Rebuild order is therefore fixed: catalogue and entry first,
then this.

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

The one field this page renders differently is the credit line: catalogue.js
prints "導演：" (director) from the works sheet's director_* columns, which are
blank for every record here. This script instead reads each record's already-
built entry (sample-data/entry-sample*.json) and rolls up the AUTHOR field from
its media items -- the same authors_* column entry.js already surfaces per
material, just collected onto the work. A record with several media items and
several distinct authors joins them, same convention as directors ("、").

Usage:  python3 sample-data/build-supplementary-sample.py
Reads:  sample-data/catalogue-sample.json, catalogue-sample-en.json
        sample-data/entry-sample.json, entry-sample-en.json
Writes: sample-data/supplementary-sample.json, supplementary-sample-en.json
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

SUPPLEMENTARY_IDS = {
    "DYP-000099", "DYP-000102", "DYP-000104", "DYP-000105",
    "DYP-000106", "DYP-000107", "DYP-000108", "DYP-000109",
}

LANGS = {
    "zh-Hant": {
        "catalogue": "catalogue-sample.json",
        "entry": "entry-sample.json",
        "out": "supplementary-sample.json",
    },
    "en": {
        "catalogue": "catalogue-sample-en.json",
        "entry": "entry-sample-en.json",
        "out": "supplementary-sample-en.json",
    },
}


def load(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return json.load(f)


def uniq(seq):
    seen = []
    for x in seq:
        if x and x not in seen:
            seen.append(x)
    return seen


def build(lang, cfg):
    catalogue = load(cfg["catalogue"])
    entry = load(cfg["entry"])
    entry_by_id = {it["id"]: it for it in entry["items"]}

    out_items = []
    for it in catalogue["items"]:
        if it["id"] not in SUPPLEMENTARY_IDS:
            continue
        e = entry_by_id.get(it["id"], {})
        authors = uniq(
            m.get("author", "")
            for g in e.get("materialGroups", [])
            for m in g.get("items", [])
        )
        out_items.append(
            {
                "id": it["id"],
                "title": it["title"],
                "titleEn": it["titleEn"],
                "year": it["year"],
                "location": it["location"],
                "authors": authors,
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
    for lang, cfg in LANGS.items():
        build(lang, cfg)
