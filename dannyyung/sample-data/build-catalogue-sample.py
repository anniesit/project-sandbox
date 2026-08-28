#!/usr/bin/env python3
"""
build-catalogue-sample.py — client spreadsheets -> catalogue-sample.json

The filmtv build-*.js scripts are JavaScript because their sources are JSON/CSV.
This one is Python because the client delivers .xlsx, and openpyxl is the
shortest path that does not add a Node dependency to the sandbox.

Usage:  python3 sample-data/build-catalogue-sample.py
Reads:  data/input_by_dept.xlsx                    (one row per work)
        data/input_by_dept_media_meta_data.xlsx    (one row per media item)
Writes: sample-data/catalogue-sample.json

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

CATEGORY_KEY = {
    "劇場": "theatre-production",
    "視覺藝術": "visual-arts",
    "活動": "event",
    "表演藝術": "performing-art",
}


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
    return out


def text(v):
    if v is None:
        return ""
    s = str(v).strip()
    return "" if s.lower() == "none" else s


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


def main():
    works = sheet_rows(os.path.join(DATA, "input_by_dept.xlsx"), "DataTemplate")
    media = sheet_rows(os.path.join(DATA, "input_by_dept_media_meta_data.xlsx"))

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
            "materialTypes": multi(w.get("content_category_zh-Hant")),
            "mediaCount": counts.get(text(w.get("id")), 0),
            "href": "#",
        })

    payload = {"items": items}
    out_path = os.path.join(HERE, "catalogue-sample.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    print("works           :", len(items))
    print("media items     :", len(media))
    print("no category     :", sum(1 for i in items if not i["category"]))
    print("no zh title     :", sum(1 for i in items if not i["title"]))
    print("no director     :", sum(1 for i in items if not i["directors"]))
    print("no location     :", sum(1 for i in items if not i["location"]))
    yrs = [i["year"] for i in items if i["year"]]
    print("year range      :", min(yrs), "-", max(yrs))
    print("wrote           :", out_path)


if __name__ == "__main__":
    main()
