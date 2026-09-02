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
        "axis_category": "類別",
        "axis_location": "地點",
        "other_category": "其他",
        "no_location": "未註明",
    },
    "en": {
        "src": "catalogue-sample-en.json",
        "out": "dataviz-sample-en.json",
        "catalogue": "/en/catalogue",
        "axis_category": "Category",
        "axis_location": "Location",
        "other_category": "Other",
        "no_location": "Unspecified",
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


def qs(pairs):
    """Build the catalogue query string. The param names, and the rule that a
    default value is omitted, are catalogue.js's URL_KEYS — keep them in step or
    a link lands on an unfiltered catalogue with no error to explain it."""
    p = [(k, str(v)) for k, v in pairs if v not in (None, "", "all")]
    return "?" + urllib.parse.urlencode(p) if p else ""


def axis(items, cfg, dim):
    """One switchable y axis of the bubble chart.

    A row is one value of `dim`; a point is one (year x row) cell, and its count
    is how many works are in it. That is coarser than the chart's first draft,
    which split a cell three ways by location as well and drew a scatter of
    near-identical dots. One bubble per year per row is what a reader can
    actually compare along a row, and it is the finest grain that still maps
    one-to-one onto a catalogue query — which is what the mark's href is.
    """
    is_cat = dim == "category"
    unfilterable = 0

    def value(it):
        if is_cat:
            # The catalogue's category facet has a synthetic "other" radio for
            # records with no category, so an empty key is still filterable.
            return it.get("categoryKey") or "other", it.get("category") or cfg["other_category"]
        # There is no "location is empty" option in the catalogue's location
        # dropdown, so an empty location is NOT filterable — see below.
        loc = it.get("location") or ""
        return loc, loc or cfg["no_location"]

    counts = collections.Counter()
    labels = {}
    cells = collections.Counter()
    for it in items:
        key, label = value(it)
        counts[key] += 1
        labels[key] = label
        if it.get("year"):
            cells[(it["year"], key)] += 1

    # Busiest row first, so the reader's eye starts where the data is. Ties
    # broken by label to keep the order stable between rebuilds.
    order = sorted(counts.items(), key=lambda kv: (-kv[1], labels[kv[0]]))
    rows = [{"key": k, "label": labels[k], "count": n} for k, n in order]
    index = {r["key"]: i for i, r in enumerate(rows)}

    points = []
    for (year, key), n in sorted(cells.items(), key=lambda kv: (index[kv[0][1]], kv[0][0])):
        param = ("category", key) if is_cat else ("location", key)
        # A blank location cannot be expressed as a catalogue filter. Rather
        # than link it to a query that would also return every other place, the
        # mark carries no href at all and is drawn hollow; the chart's note says
        # how many works that is. Hiding the row instead would drop 16 of 88
        # works off the chart with nothing to show for it.
        href = None
        if key:
            href = cfg["catalogue"] + qs([param, ("from", year), ("to", year)])
        else:
            unfilterable += n
        points.append({"year": year, "row": key, "count": n, "href": href})

    return {
        "key": dim,
        "label": cfg["axis_category"] if is_cat else cfg["axis_location"],
        "rows": rows,
        "points": points,
        "unfilterable": unfilterable,
    }


def build(lang, cfg):
    with open(os.path.join(HERE, cfg["src"]), encoding="utf-8") as f:
        items = json.load(f)["items"]

    undated = sum(1 for it in items if not it.get("year"))

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
        # Ties broken by name so the treemap is stable between rebuilds;
        # without it Counter order shuffles and the layout reshuffles for
        # no reason.
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
        # The bubble chart's y axis is switchable. Both axes ship in the same
        # payload rather than being re-fetched on toggle: they are two views of
        # 88 records, the whole thing is a few kilobytes, and a fetch per click
        # would make an instant control feel like a page load.
        "axes": [axis(items, cfg, "category"), axis(items, cfg, "location")],
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
        for ax in doc["axes"]:
            print("   axis %-9s %2d rows, %2d bubbles, largest %d works%s"
                  % (ax["key"], len(ax["rows"]), len(ax["points"]),
                     max(p["count"] for p in ax["points"]),
                     ", %d works in unfilterable marks" % ax["unfilterable"]
                     if ax["unfilterable"] else ""))
        print("   %d collaborators, largest %d credits (%s excluded)"
              % (len(doc["collaborators"]),
                 doc["collaborators"][0]["count"],
                 "/".join(sorted(ARCHIVE_SUBJECT))))


if __name__ == "__main__":
    main()
