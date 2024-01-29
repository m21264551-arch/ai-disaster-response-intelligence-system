#!/usr/bin/env python
from __future__ import annotations

import argparse
import csv
from datetime import date
from io import StringIO
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

import pandas as pd

BOM_FTP_ROOT = "ftp://ftp.bom.gov.au/anon/gen/clim_data/IDCKWCDEA0/tables"
DEFAULT_STATIONS = (
    "nsw:nowra_ran_air_station",
    "nsw:moruya_airport",
    "nsw:bega",
    "nsw:canberra_airport",
    "nsw:wagga_wagga_amo",
    "nsw:albury_airport",
    "vic:east_sale_airport",
    "vic:bairnsdale_airport",
    "vic:orbost",
    "vic:melbourne_airport",
    "qld:brisbane_aero",
    "qld:rockhampton_aero",
    "qld:emerald_airport",
    "sa:adelaide_airport",
    "sa:mount_gambier_aero",
    "wa:perth_airport",
    "wa:albany_airport",
    "wa:esperance_aero",
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download BoM daily evapotranspiration/weather station tables and normalize them for H3 joins."
    )
    parser.add_argument("--start-month", default="2020-01", help="Inclusive YYYY-MM start month")
    parser.add_argument("--end-month", default="2020-01", help="Inclusive YYYY-MM end month")
    parser.add_argument(
        "--station",
        action="append",
        help="Station slug, optionally prefixed with state, e.g. nsw:nowra_ran_air_station. Repeatable.",
    )
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()

    station_specs = args.station or list(DEFAULT_STATIONS)
    station_metadata = download_station_metadata()
    rows: list[dict[str, object]] = []
    for state, station_slug in parse_station_specs(station_specs):
        for month in month_range(args.start_month, args.end_month):
            url = f"{BOM_FTP_ROOT}/{state}/{station_slug}/{station_slug}-{month}.csv"
            try:
                text = download_text(url)
            except URLError as exc:
                print(f"skipping missing/unavailable BoM file: {url} ({exc})")
                continue

            parsed = parse_bom_daily_csv(text, state=state, station_slug=station_slug, station_metadata=station_metadata)
            rows.extend(parsed)
            print(f"downloaded {len(parsed):3d} daily weather rows from {state}/{station_slug}/{month}")

    if not rows:
        raise SystemExit("No BoM weather rows were downloaded; check station slugs and month range.")

    frame = pd.DataFrame(rows).sort_values(["date", "state", "station_name"]).drop_duplicates()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(args.out, index=False)
    print(f"wrote {len(frame):,} BoM daily weather rows to {args.out}")


def parse_station_specs(specs: list[str]) -> list[tuple[str, str]]:
    parsed = []
    for spec in specs:
        if ":" in spec:
            state, station_slug = spec.split(":", 1)
        else:
            state, station_slug = "nsw", spec
        parsed.append((state.lower(), station_slug.strip("/").lower()))
    return parsed


def month_range(start_month: str, end_month: str) -> list[str]:
    start = pd.Period(start_month, freq="M")
    end = pd.Period(end_month, freq="M")
    if start > end:
        raise ValueError("--start-month must be before or equal to --end-month")
    return [period.strftime("%Y%m") for period in pd.period_range(start, end, freq="M")]


def download_text(url: str) -> str:
    with urlopen(url, timeout=60) as response:
        return response.read().decode("latin-1", errors="replace")


def download_station_metadata() -> dict[str, dict[str, object]]:
    text = download_text(f"{BOM_FTP_ROOT}/stations_db.txt")
    metadata: dict[str, dict[str, object]] = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) < 7:
            continue
        station_id = parts[0]
        state = parts[1].lower()
        period = parts[-3]
        lat = float(parts[-2])
        lon = float(parts[-1])
        name = " ".join(parts[3:-3])
        record = {
            "station_id": station_id,
            "state": state,
            "station_name": name,
            "lat": lat,
            "lon": lon,
            "period": period,
        }
        metadata[normalize_name(name)] = record
    return metadata


def parse_bom_daily_csv(
    text: str,
    *,
    state: str,
    station_slug: str,
    station_metadata: dict[str, dict[str, object]],
) -> list[dict[str, object]]:
    rows = list(csv.reader(StringIO(text)))
    header_index = next(
        (index for index, row in enumerate(rows) if len(row) >= 2 and row[0] == "Station Name" and row[1] == "Date"),
        None,
    )
    if header_index is None:
        return []

    records = []
    for row in rows[header_index + 2 :]:
        if len(row) < 11 or not row[0].strip() or not row[1].strip():
            continue
        station_name = row[0].strip()
        metadata = resolve_station_metadata(station_name, station_slug, station_metadata)
        observed_date = pd.to_datetime(row[1], dayfirst=True, errors="coerce")
        if pd.isna(observed_date):
            continue
        wind_mps = parse_float(row[9])
        records.append(
            {
                "source": "bom-idckwcdea0-ftp",
                "state": state.upper(),
                "station_slug": station_slug,
                "station_id": metadata.get("station_id"),
                "station_name": station_name,
                "date": observed_date.date().isoformat(),
                "lat": metadata.get("lat"),
                "lon": metadata.get("lon"),
                "evapotranspiration_mm": parse_float(row[2]),
                "rainfall_mm": parse_float(row[3]),
                "pan_evaporation_mm": parse_float(row[4]),
                "max_temp_c": parse_float(row[5]),
                "min_temp_c": parse_float(row[6]),
                "max_relative_humidity_pct": parse_float(row[7]),
                "min_relative_humidity_pct": parse_float(row[8]),
                "avg_10m_wind_speed_mps": wind_mps,
                "avg_10m_wind_speed_kmh": None if wind_mps is None else round(wind_mps * 3.6, 3),
                "solar_radiation_mj_m2": parse_float(row[10]),
            }
        )
    return [record for record in records if record["lat"] is not None and record["lon"] is not None]


def resolve_station_metadata(
    station_name: str,
    station_slug: str,
    station_metadata: dict[str, dict[str, object]],
) -> dict[str, object]:
    station_key = normalize_name(station_name)
    if station_key in station_metadata:
        return station_metadata[station_key]

    slug_key = normalize_name(station_slug.replace("_", " "))
    for metadata_key, record in station_metadata.items():
        if metadata_key.startswith(station_key) or metadata_key.startswith(slug_key):
            return record
    return {}


def normalize_name(value: str) -> str:
    return " ".join(value.lower().replace("-", " ").replace("_", " ").split())


def parse_float(value: object) -> float | None:
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


if __name__ == "__main__":
    main()
