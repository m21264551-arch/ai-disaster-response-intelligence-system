#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import pandas as pd

from download_dea_hotspots import download_dea_hotspots

DEFAULT_WINDOWS = [
    {
        "name": "nsw-black-summer-south-coast",
        "state": "NSW",
        "start": "2020-01-04T00:00:00Z",
        "end": "2020-01-10T00:00:00Z",
        "bbox": "149.4,-36.8,151.8,-33.8",
    },
    {
        "name": "vic-black-summer-east-gippsland",
        "state": "VIC",
        "start": "2020-01-04T00:00:00Z",
        "end": "2020-01-10T00:00:00Z",
        "bbox": "146.0,-38.5,150.2,-35.8",
    },
    {
        "name": "qld-spring-fire-window",
        "state": "QLD",
        "start": "2019-11-08T00:00:00Z",
        "end": "2019-11-14T00:00:00Z",
        "bbox": "149.0,-28.8,153.8,-23.0",
    },
    {
        "name": "sa-summer-fire-window",
        "state": "SA",
        "start": "2019-12-20T00:00:00Z",
        "end": "2019-12-26T00:00:00Z",
        "bbox": "136.0,-36.5,140.8,-32.0",
    },
    {
        "name": "wa-summer-fire-window",
        "state": "WA",
        "start": "2020-01-04T00:00:00Z",
        "end": "2020-01-10T00:00:00Z",
        "bbox": "114.0,-34.9,119.8,-29.0",
    },
]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build a bounded multi-season, multi-state DEA hotspot corpus for national-ready training."
    )
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument(
        "--manifest-out",
        default=Path("backend/app/data/multiseason_national_manifest.json"),
        type=Path,
    )
    parser.add_argument("--windows", type=Path, help="Optional JSON list of {name,state,start,end,bbox} windows")
    parser.add_argument("--page-size", default=2500, type=int)
    parser.add_argument("--max-records-per-window", default=6000, type=int)
    parser.add_argument("--sample-per-window", default=3500, type=int)
    parser.add_argument("--chunk-hours", default=6, type=int)
    parser.add_argument("--random-state", default=42, type=int)
    args = parser.parse_args()

    windows = load_windows(args.windows)
    frames = []
    manifest: dict[str, Any] = {
        "source": "Digital Earth Australia Hotspots WFS",
        "purpose": "bounded multi-season national-ready training sample",
        "windows": [],
    }

    for window in windows:
        rows = download_dea_hotspots(
            start=window["start"],
            end=window["end"],
            state=window["state"],
            bbox=window.get("bbox"),
            page_size=args.page_size,
            max_records=args.max_records_per_window,
            chunk_hours=args.chunk_hours,
        )
        frame = pd.DataFrame(rows)
        if frame.empty:
            manifest["windows"].append({**window, "downloaded_rows": 0, "kept_rows": 0})
            continue

        frame["corpus_window"] = window["name"]
        if args.sample_per_window and len(frame) > args.sample_per_window:
            frame = frame.sample(n=args.sample_per_window, random_state=args.random_state).sort_values("observed_at")
        frames.append(frame)
        manifest["windows"].append(
            {
                **window,
                "downloaded_rows": len(rows),
                "kept_rows": int(len(frame)),
            }
        )
        print(f"{window['name']}: downloaded {len(rows):,}, kept {len(frame):,}")

    if not frames:
        raise SystemExit("No hotspot rows were downloaded for the configured windows.")

    corpus = pd.concat(frames, ignore_index=True).sort_values(["observed_at", "state", "corpus_window"])
    if "state" in corpus.columns:
        corpus["state"] = corpus["state"].astype(str).str.strip()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.manifest_out.parent.mkdir(parents=True, exist_ok=True)
    corpus.to_csv(args.out, index=False)
    manifest["total_rows"] = int(len(corpus))
    manifest["states"] = sorted(corpus["state"].dropna().unique().tolist())
    manifest["start"] = str(corpus["observed_at"].min())
    manifest["end"] = str(corpus["observed_at"].max())
    args.manifest_out.write_text(json.dumps(manifest, indent=2))
    print(f"wrote {len(corpus):,} rows to {args.out}")
    print(f"wrote manifest to {args.manifest_out}")


def load_windows(path: Path | None) -> list[dict[str, str]]:
    if not path:
        return DEFAULT_WINDOWS
    payload = json.loads(path.read_text())
    if not isinstance(payload, list):
        raise ValueError("windows JSON must be a list")
    required = {"name", "state", "start", "end"}
    for item in payload:
        if not required.issubset(item):
            raise ValueError(f"window is missing required keys: {required - set(item)}")
    return payload


if __name__ == "__main__":
    main()
