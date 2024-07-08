#!/usr/bin/env python
from __future__ import annotations

import argparse
import os
from datetime import date, datetime, timedelta
from io import StringIO
from pathlib import Path

import httpx
import pandas as pd

FIRMS_AREA_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"


def main() -> None:
    parser = argparse.ArgumentParser(description="Download NASA FIRMS area API hotspots.")
    parser.add_argument("--map-key", default=os.getenv("FIRMS_MAP_KEY"), help="NASA FIRMS MAP_KEY")
    parser.add_argument("--source", default="VIIRS_SNPP_SP", help="FIRMS source, e.g. VIIRS_SNPP_SP")
    parser.add_argument("--bbox", required=True, help="west,south,east,north")
    parser.add_argument("--start", required=True, help="YYYY-MM-DD")
    parser.add_argument("--end", required=True, help="YYYY-MM-DD, exclusive")
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()

    if not args.map_key:
        raise SystemExit("FIRMS MAP_KEY required. Set FIRMS_MAP_KEY or pass --map-key.")

    frame = download_firms_area(
        map_key=args.map_key,
        source=args.source,
        bbox=args.bbox,
        start=date.fromisoformat(args.start),
        end=date.fromisoformat(args.end),
    )
    normalized = normalize_firms_frame(frame)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    normalized.to_csv(args.out, index=False)
    print(f"wrote {len(normalized):,} FIRMS hotspots to {args.out}")


def download_firms_area(*, map_key: str, source: str, bbox: str, start: date, end: date) -> pd.DataFrame:
    frames = []
    current = start
    with httpx.Client(timeout=60.0) as client:
        while current < end:
            day_range = min(5, (end - current).days)
            url = f"{FIRMS_AREA_URL}/{map_key}/{source}/{bbox}/{day_range}/{current.isoformat()}"
            response = client.get(url)
            response.raise_for_status()
            frames.append(pd.read_csv(StringIO(response.text)))
            current += timedelta(days=day_range)
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def normalize_firms_frame(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return pd.DataFrame(columns=["source", "observed_at", "lat", "lon", "confidence", "intensity"])

    times = frame["acq_time"].astype(str).str.zfill(4)
    observed_at = frame["acq_date"].astype(str) + "T" + times.str[:2] + ":" + times.str[2:] + ":00Z"
    confidence = frame["confidence"].replace({"l": 30, "n": 60, "h": 90, "low": 30, "nominal": 60, "high": 90})
    intensity = frame["frp"] if "frp" in frame else frame.get("brightness", pd.Series([1] * len(frame)))
    return pd.DataFrame(
        {
            "source": "nasa-firms-area-api",
            "observed_at": observed_at,
            "lat": frame["latitude"],
            "lon": frame["longitude"],
            "confidence": pd.to_numeric(confidence, errors="coerce").fillna(50),
            "intensity": pd.to_numeric(intensity, errors="coerce").fillna(1),
        }
    )


if __name__ == "__main__":
    main()

