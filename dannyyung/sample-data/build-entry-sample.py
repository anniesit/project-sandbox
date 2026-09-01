#!/usr/bin/env python3
"""
build-entry-sample.py — client spreadsheets -> entry-sample.json

The ENTRY page's sample data: one record per work, each carrying its media
items. The catalogue's own sample (build-catalogue-sample.py) stays work-level
only; this file is where the media sheet is joined in.

Usage:  python3 sample-data/build-entry-sample.py
Reads:  data/DIR_current_data.xlsx                 (one row per WORK)
        data/input_by_dept_media_meta_data.xlsx    (one row per MEDIA ITEM)
Writes: sample-data/entry-sample.json

All 88 works are emitted, not just the demo one, so every catalogue link
resolves to a real entry page.

Column classification (public / search-only / media-level / internal) lives in
build-catalogue-sample.py and is imported, so the two builds cannot drift.

The output shape IS the integration contract — see ENTRY.md.
"""

import json
import os
import re
import collections
import importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")

# Reuse the works-sheet reader, the "NULL" handling, the language fallback and
# the notes cleaning rather than reimplementing them.
_spec = importlib.util.spec_from_file_location(
    "cat", os.path.join(HERE, "build-catalogue-sample.py"))
cat = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cat)

sheet_rows, text, year, pick, pick_multi, notes_text = (
    cat.sheet_rows, cat.text, cat.year, cat.pick, cat.pick_multi, cat.notes_text)

WORKS_XLSX = cat.WORKS_XLSX
MEDIA_XLSX = cat.MEDIA_XLSX

# ---------------------------------------------------------------------------
# Which viewer a material opens in.
#
# Driven by the FILE EXTENSION, never by `media_content_type_en`. That column
# says "Digital Document" for scanned house-programme pages that are really
# .jpg files — 14 of its 37 "Digital Document" rows are images. Trusting it
# would put a PDF viewer around a photograph. The content type is still
# emitted, because it is what the page DISPLAYS; it just does not choose the
# element.
# ---------------------------------------------------------------------------
VIEWER = {
    ".jpg": "image", ".jpeg": "image", ".png": "image",
    ".pdf": "pdf",
    ".mp4": "video",
}

# Where each kind of file lives on the library's storage. The works sheet's
# `url_storage_path` is per-WORK and therefore wrong for mixed works —
# DYP-000012 is filed under imgs/ but holds two PDFs — so the folder is
# derived from the extension instead.
STORAGE_BASE = "https://storage.lib.hkbu.edu.hk/projects/dyp/"
STORAGE_FOLDER = {"image": "imgs/", "pdf": "docs/", "video": "videos/"}


def slug(s):
    """content_category_en -> a stable key the English page can reuse."""
    s = text(s).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def date_string(y, m, d):
    """Language-neutral: 1981 / 1981-11 / 1981-11-11. entry.js formats it."""
    y, m, d = text(y), text(m), text(d)
    if not y:
        return ""
    if not m:
        return y
    if not d:
        return "%s-%02d" % (y, int(float(m)))
    return "%s-%02d-%02d" % (y, int(float(m)), int(float(d)))


def material(m, seen_ids):
    fn = text(m.get("media_filename"))
    ext = os.path.splitext(fn)[1].lower()
    viewer = VIEWER.get(ext, "")
    group = pick(m, "content_category", want="zht", other="en")
    mid = text(m.get("id"))
    seen_ids[mid] += 1
    return {
        "id": mid,
        "order": year(m.get("order_num")) or 0,
        # The left column groups on this. Key is stable, label is displayed.
        "groupKey": slug(m.get("content_category_en")),
        "group": group,
        # Displayed as "Content Type". Does NOT choose the viewer — see VIEWER.
        "contentType": text(m.get("media_content_type_en")),
        "title": pick(m, "media_title", want="zht", other="en"),
        "author": pick(m, "media_author", want="zht", other="en"),
        "publisher": text(m.get("Publisher/Publishing Venue")),
        "publishedDate": date_string(m.get("media_published_yyyy"),
                                     m.get("media_published_mm"),
                                     m.get("media_published_dd")),
        "issue": text(m.get(" Issue")),
        "pageNumber": text(m.get("Page Number")),
        "filename": fn,
        "viewer": viewer,
        # Empty on purpose: every storage URL 404s today (checked 2026-09-01),
        # so the page renders its placeholder. `src` is the ONE field the
        # viewer reads — when the library uploads the files, fill it here with
        #     STORAGE_BASE + STORAGE_FOLDER[viewer] + quote(filename)
        # and every viewer goes live with no markup change. That URL is
        # deliberately NOT also emitted as a second field: two fields holding
        # the same address drift apart.
        "src": "",
    }


def main():
    header, works = sheet_rows(WORKS_XLSX, "DataTemplate")
    _, media = sheet_rows(MEDIA_XLSX)
    cat.check_columns(header)

    by_work = collections.defaultdict(list)
    for m in media:
        by_work[text(m.get("group_id"))].append(m)

    seen_ids = collections.Counter()
    items = []
    for w in works:
        wid = text(w.get("id"))
        mats = [material(m, seen_ids) for m in by_work.get(wid, [])]
        mats.sort(key=lambda x: x["order"])

        # Group in first-appearance order, which is the client's own ordering.
        groups, index = [], {}
        for m in mats:
            k = m["groupKey"]
            if k not in index:
                index[k] = {"key": k, "label": m["group"], "items": []}
                groups.append(index[k])
            index[k]["items"].append(m)

        c = pick(w, "category")
        items.append({
            "id": wid,
            "title": pick(w, "title"),
            "titleEn": text(w.get("title_en")),
            "category": c,
            "categoryKey": cat.CATEGORY_KEY.get(c, ""),
            "year": year(w.get("date_yyyy")),
            "date": date_string(w.get("date_yyyy"), w.get("date_mm"), w.get("date_dd")),
            "location": pick(w, "location"),
            "venue": pick(w, "venue"),
            "directors": pick_multi(w, "director"),
            "notes": notes_text(w.get("notes"), wid),
            "materialGroups": groups,
            "mediaCount": len(mats),
        })

    out_path = os.path.join(HERE, "entry-sample.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"items": items}, f, ensure_ascii=False, indent=1)

    # ---- report -------------------------------------------------------------
    all_mats = [m for i in items for g in i["materialGroups"] for m in g["items"]]
    print("works           :", len(items))
    print("materials       :", len(all_mats))
    print("viewer split    :", dict(collections.Counter(m["viewer"] for m in all_mats)))
    print("content types   :", dict(collections.Counter(m["contentType"] for m in all_mats)))
    mismatch = [m for m in all_mats
                if m["contentType"] == "Digital Document" and m["viewer"] == "image"]
    print("  ! 'Digital Document' rows that are really images:", len(mismatch),
          "— this is why the viewer is chosen by extension, not content type")
    print("unknown viewer  :", [m["filename"] for m in all_mats if not m["viewer"]] or "none")
    print("duplicate media ids:", [k for k, v in seen_ids.items() if v > 1] or "none")
    print("groups per work : min %d  max %d" %
          (min(len(i["materialGroups"]) for i in items),
           max(len(i["materialGroups"]) for i in items)))
    print("group labels    :", sorted({g["label"] for i in items for g in i["materialGroups"]}))
    print("size            : %.0f KB" % (os.path.getsize(out_path) / 1024))
    print("wrote           :", out_path)


if __name__ == "__main__":
    main()
