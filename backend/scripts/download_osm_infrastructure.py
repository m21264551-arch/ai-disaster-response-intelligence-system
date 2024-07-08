#!/usr/bin/env python
from __future__ import annotations

import argparse
from pathlib import Path

import httpx
import pandas as pd

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def main() -> None:
    parser = argparse.ArgumentParser(description="Download OSM infrastructure signals for exposure overlays.")
    parser.add_argument("--bbox", required=True, help="west,south,east,north")
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--timeout", default=120, type=int)
    args = parser.parse_args()

    rows = download_osm_infrastructure(args.bbox, timeout_seconds=args.timeout)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(args.out, index=False)
    print(f"wrote {len(rows):,} OSM infrastructure rows to {args.out}")


def download_osm_infrastructure(bbox: str, timeout_seconds: int) -> list[dict[str, str | float]]:
    west, south, east, north = [float(part.strip()) for part in bbox.split(",")]
    overpass_bbox = f"{south},{west},{north},{east}"
    query = f"""
    [out:json][timeout:{timeout_seconds}];
    (
      nwr["amenity"="hospital"]({overpass_bbox});
      nwr["amenity"="school"]({overpass_bbox});
      nwr["amenity"="shelter"]({overpass_bbox});
      nwr["emergency"="assembly_point"]({overpass_bbox});
      way["highway"~"^(motorway|trunk|primary)$"]({overpass_bbox});
    );
    out center tags;
    """
    with httpx.Client(timeout=timeout_seconds + 15) as client:
        response = client.post(OVERPASS_URL, data={"data": query})
        response.raise_for_status()
        payload = response.json()

    rows = []
    for element in payload.get("elements", []):
        tags = element.get("tags", {})
        lat = element.get("lat") or element.get("center", {}).get("lat")
        lon = element.get("lon") or element.get("center", {}).get("lon")
        if lat is None or lon is None:
            continue
        rows.append(
            {
                "kind": classify_kind(tags),
                "osm_type": element.get("type", "unknown"),
                "osm_id": str(element.get("id", "")),
                "name": tags.get("name", ""),
                "lat": float(lat),
                "lon": float(lon),
            }
        )
    return [row for row in rows if row["kind"] != "unknown"]


def classify_kind(tags: dict[str, str]) -> str:
    if tags.get("amenity") == "hospital":
        return "hospital"
    if tags.get("amenity") == "school":
        return "school"
    if tags.get("amenity") == "shelter" or tags.get("emergency") == "assembly_point":
        return "shelter"
    if tags.get("highway") in {"motorway", "trunk", "primary"}:
        return "major_road"
    return "unknown"


if __name__ == "__main__":
    main()
