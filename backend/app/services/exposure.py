from __future__ import annotations

import hashlib
import math
from functools import lru_cache
from pathlib import Path

from app.schemas import Exposure
from app.services.geo import centroid_from_h3, haversine_km

OSM_INFRASTRUCTURE_PATH = Path(__file__).resolve().parents[1] / "data" / "osm_infrastructure_sample.csv"
ABS_POPULATION_H3_PATH = Path(__file__).resolve().parents[1] / "data" / "abs_population_h3_sample.csv"

POPULATION_CENTRES = [
    ("Sydney", -33.8688, 151.2093, 5_300_000),
    ("Wollongong", -34.4278, 150.8931, 305_000),
    ("Canberra", -35.2809, 149.1300, 472_000),
    ("Newcastle", -32.9283, 151.7817, 348_000),
    ("Batemans Bay", -35.7082, 150.1744, 17_000),
    ("Nowra", -34.8739, 150.6001, 37_000),
]


def stable_unit_interval(key: str) -> float:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) / 0xFFFFFFFF


@lru_cache(maxsize=65536)
def estimate_exposure(h3_id: str) -> Exposure:
    center = centroid_from_h3(h3_id)
    abs_population = load_abs_population().get(h3_id)
    population = 0.0

    if abs_population is not None:
        population = int(round(abs_population))
    else:
        for _, lat, lon, centre_pop in POPULATION_CENTRES:
            distance = haversine_km(center["lat"], center["lon"], lat, lon)
            population += centre_pop * math.exp(-(distance / 34) ** 2)

        jitter = 0.72 + stable_unit_interval(f"pop-{h3_id}") * 0.62
        population = int(max(4, population * 0.0038 * jitter))

    urban_factor = min(1.0, population / 900)
    hospitals = int(stable_unit_interval(f"hospitals-{h3_id}") + urban_factor * 1.7)
    schools = int(stable_unit_interval(f"schools-{h3_id}") * 3 + urban_factor * 5)
    major_roads = int(stable_unit_interval(f"roads-{h3_id}") * 4 + urban_factor * 3)
    shelters = int(stable_unit_interval(f"shelters-{h3_id}") * 2 + urban_factor * 2)

    osm_counts = nearby_osm_counts(center["lat"], center["lon"])
    hospitals = max(hospitals, osm_counts["hospital"])
    schools = max(schools, osm_counts["school"])
    major_roads = max(major_roads, osm_counts["major_road"])
    shelters = max(shelters, osm_counts["shelter"])

    return Exposure(
        h3_id=h3_id,
        population=population,
        hospitals=hospitals,
        schools=schools,
        major_roads=major_roads,
        shelters=shelters,
    )


def infrastructure_weight(exposure: Exposure) -> float:
    return 1 + min(2.2, exposure.hospitals * 0.5 + exposure.schools * 0.12 + exposure.major_roads * 0.08)


def nearby_osm_counts(lat: float, lon: float, radius_km: float = 15.0) -> dict[str, int]:
    counts = {"hospital": 0, "school": 0, "major_road": 0, "shelter": 0}
    for item in load_osm_infrastructure():
        distance = haversine_km(lat, lon, float(item["lat"]), float(item["lon"]))
        if distance <= radius_km:
            kind = str(item["kind"])
            if kind in counts:
                counts[kind] += 1
    return counts


@lru_cache(maxsize=1)
def load_osm_infrastructure() -> tuple[dict[str, float | str], ...]:
    if not OSM_INFRASTRUCTURE_PATH.exists():
        return ()

    import pandas as pd

    frame = pd.read_csv(OSM_INFRASTRUCTURE_PATH)
    required = {"kind", "lat", "lon"}
    if not required.issubset(frame.columns):
        return ()

    records = []
    for row in frame.to_dict("records"):
        kind = str(row["kind"])
        if kind not in {"hospital", "school", "major_road", "shelter"}:
            continue
        records.append({"kind": kind, "lat": float(row["lat"]), "lon": float(row["lon"])})
    return tuple(records)


@lru_cache(maxsize=1)
def load_abs_population() -> dict[str, float]:
    if not ABS_POPULATION_H3_PATH.exists():
        return {}

    import pandas as pd

    frame = pd.read_csv(ABS_POPULATION_H3_PATH)
    if not {"h3_id", "population"}.issubset(frame.columns):
        return {}

    return {
        str(row["h3_id"]): max(0.0, float(row["population"]))
        for row in frame[["h3_id", "population"]].dropna().to_dict("records")
    }
