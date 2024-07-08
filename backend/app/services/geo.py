from __future__ import annotations

import math
from functools import lru_cache

import h3


EARTH_RADIUS_KM = 6371.0088


def point_geometry(lat: float, lon: float) -> dict:
    return {"type": "Point", "coordinates": [lon, lat]}


def polygon_geometry_from_h3(h3_id: str) -> dict:
    boundary = h3.cell_to_boundary(h3_id)
    coordinates = [[lon, lat] for lat, lon in boundary]
    coordinates.append(coordinates[0])
    return {"type": "Polygon", "coordinates": [coordinates]}


def centroid_from_h3(h3_id: str) -> dict[str, float]:
    lat, lon = h3.cell_to_latlng(h3_id)
    return {"lat": lat, "lon": lon}


def cell_from_lat_lon(lat: float, lon: float, resolution: int = 5) -> str:
    return h3.latlng_to_cell(lat, lon, resolution)


def cells_around(lat: float, lon: float, resolution: int = 5, ring: int = 3) -> set[str]:
    return set(h3.grid_disk(cell_from_lat_lon(lat, lon, resolution), ring))


def in_bbox(lat: float, lon: float, bbox: list[float]) -> bool:
    west, south, east, north = bbox
    return west <= lon <= east and south <= lat <= north


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def bearing_degrees(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_lambda = math.radians(lon2 - lon1)
    x = math.sin(delta_lambda) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def angular_alignment(candidate_bearing: float, target_bearing: float) -> float:
    diff = abs((candidate_bearing - target_bearing + 180) % 360 - 180)
    return (math.cos(math.radians(diff)) + 1) / 2


@lru_cache(maxsize=4096)
def h3_area_km2(h3_id: str) -> float:
    return h3.cell_area(h3_id, unit="km^2")

