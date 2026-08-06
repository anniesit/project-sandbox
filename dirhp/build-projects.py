#!/usr/bin/env python3
"""
Regenerate dsg-projects.json from dsg-projects.csv.

The CSV is the thing humans edit — open it in Excel or Numbers, change
rows, save as CSV. The JSON is what the page fetches. Run this after
every CSV edit:

    python3 build-projects.py

Columns (header row required, order does not matter):
    track          "grant" or "non-grant"
    year           "2025/26"
    code           "DSG/2526/106"
    title          project title
    pi             principal investigator, as displayed
    department     department or academy, as displayed
    status         "Active", "Completed" or "Terminated"
    project_url    link to the live project site, or blank
    interview_url  link to the PI interview, or blank
"""

import csv
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
CSV_PATH = HERE / "dsg-projects.csv"
JSON_PATH = HERE / "dsg-projects.json"

FIELDS = ["track", "year", "code", "title", "pi",
          "department", "status", "project_url", "interview_url"]
TRACKS = {"grant", "non-grant"}
STATUSES = {"Active", "Completed", "Terminated"}


def main() -> int:
    if not CSV_PATH.exists():
        print(f"error: {CSV_PATH.name} not found", file=sys.stderr)
        return 1

    # utf-8-sig strips the BOM Excel writes, which would otherwise end up
    # inside the first column name and break every lookup.
    with CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    missing = [c for c in FIELDS if rows and c not in rows[0]]
    if missing:
        print(f"error: CSV is missing column(s): {', '.join(missing)}", file=sys.stderr)
        return 1

    out, warnings = [], []
    for i, row in enumerate(rows, start=2):  # start=2: row 1 is the header
        rec = {c: (row.get(c) or "").strip() for c in FIELDS}
        if not rec["title"]:
            continue  # skip blank padding rows
        if rec["track"] not in TRACKS:
            warnings.append(f"row {i}: track {rec['track']!r} is not one of {sorted(TRACKS)}")
        if rec["status"] not in STATUSES:
            warnings.append(f"row {i}: status {rec['status']!r} is not one of {sorted(STATUSES)}")
        for key in ("project_url", "interview_url"):
            if rec[key] and not rec[key].startswith(("http://", "https://", "/")):
                warnings.append(f"row {i}: {key} {rec[key]!r} does not look like a URL")
        out.append(rec)

    seen = {}
    for rec in out:
        seen.setdefault(rec["code"], 0)
        seen[rec["code"]] += 1
    for code, n in seen.items():
        if n > 1:
            warnings.append(f"code {code!r} appears {n} times")

    JSON_PATH.write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    grant = sum(1 for r in out if r["track"] == "grant")
    print(f"wrote {JSON_PATH.name}: {len(out)} projects "
          f"({grant} grant, {len(out) - grant} non-grant)")
    print(f"  with project_url:   {sum(1 for r in out if r['project_url'])}")
    print(f"  with interview_url: {sum(1 for r in out if r['interview_url'])}")
    for w in warnings:
        print(f"  warning: {w}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
