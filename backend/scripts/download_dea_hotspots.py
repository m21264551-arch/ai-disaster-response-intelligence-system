#!/usr/bin/env python
from __future__ import annotations

import argparse
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlencode

import httpx
import pandas as pd

DEA_WFS_URL = "https://hotspots.dea.ga.gov.au/geoserver/wfs"


def main() -> None:
    parser = argparse.ArgumentParser(description="Download historical Digital Earth Australia hotspot data.")
    parser.add_argument("--start", required=True, help="Inclusive UTC start, e.g. 2020-01-04T00:00:00Z")
    parser.add_argument("--end", required=True, help="Exclusive UTC end, e.g. 2020-01-08T00:00:00Z")
    parser.add_argument("--state", default="NSW", help="Australian state filter, default NSW")
    parser.add_argument("--bbox", help="Optional west,south,east,north bbox filter")
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--page-size", default=5000, type=int)
    parser.add_argument("--max-records", default=40000, type=int)
    parser.add_argument("--chunk-hours", default=6, type=int)
    args = parser.parse_args()

    rows = download_dea_hotspots(
        start=args.start,
        end=args.end,
        state=args.state,
        bbox=args.bbox,
        page_size=args.page_size,
        max_records=args.max_records,
        chunk_hours=args.chunk_hours,
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(args.out, index=False)
    print(f"wrote {len(rows):,} DEA hotspots to {args.out}")


def download_dea_hotspots(
    *,
    start: str,
    end: str,
    state: str,
    bbox: str | None,
    page_size: int,
    max_records: int,
    chunk_hours: int,
) -> list[dict]:
    rows: list[dict] = []
    chunk_start = _parse_utc(start)
    end_dt = _parse_utc(end)

    with httpx.Client(timeout=60.0) as client:
        while chunk_start < end_dt and len(rows) < max_records:
            chunk_end = min(end_dt, chunk_start + timedelta(hours=chunk_hours))
            filters = [
                f"australian_state='{state}'",
                f"datetime AFTER {_format_utc(chunk_start)}",
                f"datetime BEFORE {_format_utc(chunk_end)}",
            ]
            if bbox:
                west, south, east, north = bbox.split(",")
                filters.append(f"BBOX(location,{west},{south},{east},{north},'EPSG:4326')")
            cql_filter = " AND ".join(filters)
            params = {
                "service": "WFS",
                "version": "2.0.0",
                "request": "GetFeature",
                "typeNames": "public:hotspots",
                "outputFormat": "application/json",
                "count": str(min(page_size, max_records - len(rows))),
                "CQL_FILTER": cql_filter,
            }
            response = client.get(DEA_WFS_URL, params=params)
            response.raise_for_status()
            payload = response.json()
            features = payload.get("features", [])
            for feature in features:
                props = feature.get("properties", {})
                rows.append(
                    {
                        "source": "dea-hotspots-wfs",
                        "observed_at": props.get("datetime") or props.get("start_dt"),
                        "lat": props.get("latitude"),
                        "lon": props.get("longitude"),
                        "confidence": props.get("confidence", 50),
                        "intensity": props.get("power") if props.get("power", -1) not in (-1, None) else props.get("temp_kelvin", 0),
                        "satellite": props.get("satellite"),
                        "sensor": props.get("sensor"),
                        "state": props.get("australian_state"),
                    }
                )
            print(
                f"downloaded {len(rows):,} records through {_format_utc(chunk_end)}; "
                f"query: {DEA_WFS_URL}?{urlencode(params)[:120]}..."
            )
            if len(features) >= page_size:
                print(f"warning: chunk reached page-size limit ({page_size}); reduce --chunk-hours for fuller coverage")
            chunk_start = chunk_end

    return rows


def _parse_utc(value: str):
    return pd.Timestamp(value).to_pydatetime()


def _format_utc(value) -> str:
    return pd.Timestamp(value).strftime("%Y-%m-%dT%H:%M:%SZ")


if __name__ == "__main__":
    main()
