#!/usr/bin/env python3
"""
build-dataviz-sample.py — catalogue-sample*.json -> dataviz-sample*.json

Usage:  python3 sample-data/build-dataviz-sample.py
Reads:  sample-data/catalogue-sample.json     (zh-Hant)
        sample-data/catalogue-sample-en.json  (en)
Writes: sample-data/dataviz-sample.json
        sample-data/dataviz-sample-en.json

WHY THIS READS THE CATALOGUE OUTPUT AND NOT THE SPREADSHEETS
------------------------------------------------------------
Every mark on the Data Viz page is a link into the catalogue, and every link
claims "there are N works behind this". If the two files parsed the spreadsheets
independently they would drift the first time a column is reclassified, and the
page would promise a count the catalogue does not deliver. So the viz is a pure
aggregation of the catalogue's own published records: same language fallback,
same category keys, same location strings, same director arrays.

Rebuild order is therefore fixed:

    python3 sample-data/build-catalogue-sample.py     # first
    python3 sample-data/build-dataviz-sample.py       # then this

The output shape IS the integration contract — see DATAVIZ.md.
"""

import collections
import json
import os
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))

# Chinese sits at the site ROOT, English in /en/ — same inversion as the
# catalogue builder, for the same zh-Hant-first reason.
LANGS = {
    "zh-Hant": {
        "src": "catalogue-sample.json",
        "out": "dataviz-sample.json",
        "catalogue": "/catalogue",
        "other_category": "其他",
        "no_location": "未註明",
        "other_location": "其他地點",
    },
    "en": {
        "src": "catalogue-sample-en.json",
        "out": "dataviz-sample-en.json",
        "catalogue": "/en/catalogue",
        "other_category": "Other",
        "no_location": "Unspecified",
        "other_location": "Elsewhere",
    },
}

# ---------------------------------------------------------------------------
# THE ARCHIVE SUBJECT IS NOT ONE OF HIS OWN COLLABORATORS.
#
# Danny Yung is credited as director on 65 of the 88 works. Leaving him in the
# collaborator treemap gives one box covering ~59% of the area and squeezes the
# 43 people the chart is actually about into the margin — it stops answering
# "who did he work with" and answers "is this the Danny Yung archive" instead.
#
# This is an editorial decision, not a data-quality fix: the credit is real and
# the catalogue still carries it. Delete the name from this set to put him back.
# ---------------------------------------------------------------------------
ARCHIVE_SUBJECT = {"榮念曾", "Danny Yung", "Danny Ning-Tsun Yung"}

# ---------------------------------------------------------------------------
# Location -> colour slot. Keyed on the PLACE, never on its rank, so re-running
# after a data update cannot repaint a location that did not change. Slots are
# indices into the palette declared in dataviz.js; slot 5 is the shared
# "somewhere else" bucket and -1 means "no location recorded" (drawn hollow).
#
# The five named slots are the five places with more than two works today. A new
# place is not silently given a colour — it lands in the "elsewhere" bucket
# until someone adds it here, which is the point.
# ---------------------------------------------------------------------------
LOCATION_SLOT = {
    "香港": 0, "Hong Kong": 0,
    "台北": 1, "Taipei": 1,
    "日本": 2, "Japan": 2,
    "德國": 3, "Germany": 3,
    "新加坡": 4, "Singapore": 4,
}
OTHER_SLOT = 5
NONE_SLOT = -1


def qs(pairs):
    """Build the catalogue query string. The param names, and the rule that a
    default value is omitted, are catalogue.js's URL_KEYS — keep them in step or
    a link lands on an unfiltered catalogue with no error to explain it."""
    p = [(k, str(v)) for k, v in pairs if v not in (None, "", "all")]
    return "?" + urllib.parse.urlencode(p) if p else ""


def build(lang, cfg):
    with open(os.path.join(HERE, cfg["src"]), encoding="utf-8") as f:
        items = json.load(f)["items"]

    # ---- categories: the y axis of the bubble chart -----------------------
    # Ordered by how many works they hold, so the busiest band is at the top and
    # the reader's eye starts where the data is. The empty key becomes the
    # catalogue's synthetic "other" radio, which is the value that filters it.
    cat_count = collections.Counter()
    cat_label = {}
    for it in items:
        key = it.get("categoryKey") or "other"
        cat_count[key] += 1
        cat_label.setdefault(key, it.get("category") or cfg["other_category"])
    categories = [
        {"key": k, "label": cat_label[k], "count": n}
        for k, n in cat_count.most_common()
    ]

    # ---- locations: the colour scale --------------------------------------
    loc_count = collections.Counter(it.get("location") or "" for it in items)

    def slot(loc):
        if not loc:
            return NONE_SLOT
        return LOCATION_SLOT.get(loc, OTHER_SLOT)

    named = {}      # slot -> {label, count}
    for loc, n in loc_count.items():
        s = slot(loc)
        label = (
            cfg["no_location"] if s == NONE_SLOT
            else cfg["other_location"] if s == OTHER_SLOT
            else loc
        )
        entry = named.setdefault(s, {"slot": s, "label": label, "count": 0,
                                     "places": []})
        entry["count"] += n
        if loc:
            entry["places"].append(loc)
    # Legend order: the five named slots in slot order, then "elsewhere", then
    # "unspecified" last — the two catch-alls read as the tail of the list.
    legend = [named[s] for s in sorted(k for k in named if k >= 0)]
    if NONE_SLOT in named:
        legend.append(named[NONE_SLOT])
    for e in legend:
        e["places"].sort()

    # ---- bubbles: one per (year x category x location) --------------------
    # NOT one per work. A mark that stands for a single record would have to
    # link to that record, and the page's job is to hand the reader a filtered
    # catalogue, not an entry. Grouping by the three encoded dimensions makes
    # every mark exactly reproducible as a catalogue query — which is what its
    # href is. Size then carries the group's count.
    groups = collections.Counter()
    undated = 0
    for it in items:
        year = it.get("year")
        if not year:
            undated += 1          # no x position exists for it; see DATAVIZ.md
            continue
        groups[(year, it.get("categoryKey") or "other", it.get("location") or "")] += 1

    bubbles = []
    for (year, cat, loc), n in sorted(groups.items()):
        # A blank location cannot be expressed as a catalogue filter — there is
        # no "location is empty" option — so those marks link on year+category
        # only and say so in their label. Better a link that narrows honestly
        # than one that silently returns other places too.
        bubbles.append({
            "year": year,
            "categoryKey": cat,
            "location": loc,
            "locationSlot": slot(loc),
            "count": n,
            "href": cfg["catalogue"] + qs([
                ("category", cat), ("from", year), ("to", year),
                ("location", loc),
            ]),
        })

    # ---- collaborators: the treemap ---------------------------------------
    credits = collections.Counter()
    for it in items:
        for name in it.get("directors") or []:
            if name and name not in ARCHIVE_SUBJECT:
                credits[name] += 1
    collaborators = [
        {
            "name": name,
            "count": n,
            "href": cfg["catalogue"] + qs([("director", name)]),
        }
        # Ties broken by name so the layout is stable between rebuilds; without
        # it Counter order shuffles and the treemap reshuffles for no reason.
        for name, n in sorted(credits.items(), key=lambda kv: (-kv[1], kv[0]))
    ]

    years = [it["year"] for it in items if it.get("year")]
    doc = {
        "lang": lang,
        "cataloguePath": cfg["catalogue"],
        "years": {"min": min(years), "max": max(years)},
        "totals": {
            "works": len(items),
            "dated": len(items) - undated,
            "undated": undated,
            "collaborators": len(collaborators),
        },
        "categories": categories,
        "locations": legend,
        "bubbles": bubbles,
        "collaborators": collaborators,
    }

    path = os.path.join(HERE, cfg["out"])
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
        f.write("\n")
    return doc, path


def main():
    for lang, cfg in LANGS.items():
        doc, path = build(lang, cfg)
        print("%-8s -> %s" % (lang, os.path.relpath(path, os.path.dirname(HERE))))
        print("   works %d (%d dated, %d undated)  years %d-%d"
              % (doc["totals"]["works"], doc["totals"]["dated"],
                 doc["totals"]["undated"],
                 doc["years"]["min"], doc["years"]["max"]))
        print("   %d bubbles over %d categories, largest %d works"
              % (len(doc["bubbles"]), len(doc["categories"]),
                 max(b["count"] for b in doc["bubbles"])))
        print("   %d collaborators, largest %d credits (%s excluded)"
              % (len(doc["collaborators"]),
                 doc["collaborators"][0]["count"],
                 "/".join(sorted(ARCHIVE_SUBJECT))))
        unknown = sorted({b["location"] for b in doc["bubbles"]
                          if b["locationSlot"] == OTHER_SLOT})
        if unknown:
            print("   in the 'elsewhere' bucket: %s" % ", ".join(unknown))


if __name__ == "__main__":
    main()
