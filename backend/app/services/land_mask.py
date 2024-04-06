from __future__ import annotations

import h3


# Lightweight coastline mask for the committed NSW South Coast replay extent.
# Points are ordered north-to-south as (latitude, longitude). The mask treats
# land as west of the interpolated coastline, with a small inland buffer so full
# H3 polygons do not render over open water at resolution 5.
NSW_REPLAY_BBOX = (148.7, -37.4, 153.8, -31.1)
NSW_COASTLINE: tuple[tuple[float, float], ...] = (
    (-31.10, 153.45),
    (-31.45, 153.15),
    (-31.80, 152.78),
    (-32.15, 152.45),
    (-32.50, 152.10),
    (-32.85, 151.86),
    (-33.20, 151.56),
    (-33.55, 151.34),
    (-33.90, 151.25),
    (-34.25, 151.10),
    (-34.60, 150.92),
    (-34.95, 150.78),
    (-35.30, 150.58),
    (-35.65, 150.36),
    (-36.00, 150.18),
    (-36.35, 150.08),
    (-36.75, 150.08),
    (-37.10, 149.96),
    (-37.40, 149.86),
)
COAST_INLAND_BUFFER_DEGREES = 0.035


def bbox_uses_nsw_land_mask(bbox: list[float] | tuple[float, float, float, float]) -> bool:
    west, south, east, north = bbox
    mask_west, mask_south, mask_east, mask_north = NSW_REPLAY_BBOX
    return west < mask_east and east > mask_west and south < mask_north and north > mask_south


def point_inside_land(lat: float, lon: float, bbox: list[float] | tuple[float, float, float, float]) -> bool:
    if not bbox_uses_nsw_land_mask(bbox):
        return True
    if not NSW_REPLAY_BBOX[1] <= lat <= NSW_REPLAY_BBOX[3]:
        return True
    return lon <= _coast_lon_at_lat(lat) - COAST_INLAND_BUFFER_DEGREES


def h3_cell_inside_land(h3_id: str, bbox: list[float] | tuple[float, float, float, float]) -> bool:
    if not bbox_uses_nsw_land_mask(bbox):
        return True
    return all(point_inside_land(lat, lon, bbox) for lat, lon in h3.cell_to_boundary(h3_id))


def _coast_lon_at_lat(lat: float) -> float:
    if lat >= NSW_COASTLINE[0][0]:
        return NSW_COASTLINE[0][1]
    if lat <= NSW_COASTLINE[-1][0]:
        return NSW_COASTLINE[-1][1]

    for (north_lat, north_lon), (south_lat, south_lon) in zip(NSW_COASTLINE, NSW_COASTLINE[1:], strict=True):
        if north_lat >= lat >= south_lat:
            ratio = (lat - north_lat) / (south_lat - north_lat)
            return north_lon + ratio * (south_lon - north_lon)

    return NSW_COASTLINE[-1][1]
