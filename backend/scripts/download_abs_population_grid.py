#!/usr/bin/env python
from __future__ import annotations

import argparse
import tempfile
import zipfile
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen

import h3
import numpy as np
import pandas as pd
from PIL import Image
from pyproj import Transformer

from app.services.geo import centroid_from_h3

ABS_POPULATION_GEOTIFF_URL = (
    "https://www.abs.gov.au/statistics/people/population/regional-population/2024-25/GEOTIFF.zip"
)
ABS_DOWNLOAD_HOST = "www.abs.gov.au"
ABS_DOWNLOAD_PATH_PREFIX = "/statistics/people/population/regional-population/"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download the ABS Australian population grid GeoTIFF and aggregate population to H3 cells."
    )
    parser.add_argument("--url", default=ABS_POPULATION_GEOTIFF_URL)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--resolution", default=5, type=int)
    parser.add_argument("--source-year", default=2025, type=int)
    parser.add_argument("--bbox", help="Optional west,south,east,north bbox filter")
    parser.add_argument("--min-population", default=0.01, type=float)
    args = parser.parse_args()

    bbox = parse_bbox(args.bbox)
    with tempfile.TemporaryDirectory() as tmpdir:
        zip_path = Path(tmpdir) / "population-grid.zip"
        download_file(args.url, zip_path)
        tif_path = extract_geotiff(zip_path, Path(tmpdir))
        frame = aggregate_population_grid(
            tif_path,
            resolution=args.resolution,
            source_year=args.source_year,
            bbox=bbox,
            min_population=args.min_population,
        )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(args.out, index=False)
    print(f"wrote {len(frame):,} H3 population cells to {args.out}")


def download_file(url: str, path: Path) -> None:
    validated_url = validate_abs_download_url(url)
    with urlopen(validated_url, timeout=120) as response:  # nosec B310
        path.write_bytes(response.read())


def validate_abs_download_url(url: str) -> str:
    parsed = urlparse(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname != ABS_DOWNLOAD_HOST
        or not parsed.path.startswith(ABS_DOWNLOAD_PATH_PREFIX)
        or not parsed.path.lower().endswith(".zip")
    ):
        raise ValueError("ABS population grid URL must be an HTTPS zip download from www.abs.gov.au")
    return url


def extract_geotiff(zip_path: Path, output_dir: Path) -> Path:
    with zipfile.ZipFile(zip_path) as archive:
        names = [name for name in archive.namelist() if name.lower().endswith((".tif", ".tiff"))]
        if not names:
            raise ValueError("ABS population grid zip did not contain a GeoTIFF")
        member = names[0]
        target = (output_dir / member).resolve()
        if not target.is_relative_to(output_dir.resolve()):
            raise ValueError("ABS population grid zip contains an unsafe GeoTIFF path")
        archive.extract(member, output_dir)
        return target


def aggregate_population_grid(
    tif_path: Path,
    *,
    resolution: int,
    source_year: int,
    bbox: tuple[float, float, float, float] | None,
    min_population: float,
) -> pd.DataFrame:
    image = Image.open(tif_path)
    array = np.asarray(image)
    rows, columns = np.where(array > min_population)
    values = array[rows, columns]
    lons, lats = pixel_centers_to_lonlat(image, rows, columns)

    population_by_h3: dict[str, float] = defaultdict(float)
    pixel_count_by_h3: dict[str, int] = defaultdict(int)
    west, south, east, north = bbox if bbox else (-180.0, -90.0, 180.0, 90.0)

    for lat, lon, population in zip(lats, lons, values, strict=True):
        if not (south <= lat <= north and west <= lon <= east):
            continue
        h3_id = h3.latlng_to_cell(float(lat), float(lon), resolution)
        population_by_h3[h3_id] += float(population)
        pixel_count_by_h3[h3_id] += 1

    records = []
    for h3_id, population in sorted(population_by_h3.items()):
        centroid = centroid_from_h3(h3_id)
        records.append(
            {
                "h3_id": h3_id,
                "population": round(population, 3),
                "pixel_count": pixel_count_by_h3[h3_id],
                "source_year": source_year,
                "source": "abs-australian-population-grid-geotiff",
                "centroid_lat": centroid["lat"],
                "centroid_lon": centroid["lon"],
            }
        )
    return pd.DataFrame(records)


def pixel_centers_to_lonlat(image: Image.Image, rows: np.ndarray, columns: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    pixel_scale = image.tag_v2.get(33550)
    tiepoint = image.tag_v2.get(33922)
    if not pixel_scale or not tiepoint:
        raise ValueError("GeoTIFF is missing ModelPixelScaleTag or ModelTiepointTag")

    scale_x, scale_y = float(pixel_scale[0]), float(pixel_scale[1])
    tie_i, tie_j, tie_x, tie_y = float(tiepoint[0]), float(tiepoint[1]), float(tiepoint[3]), float(tiepoint[4])
    xs = tie_x + (columns + 0.5 - tie_i) * scale_x
    ys = tie_y - (rows + 0.5 - tie_j) * scale_y

    transformer = Transformer.from_crs("EPSG:3577", "EPSG:4326", always_xy=True)
    lons, lats = transformer.transform(xs, ys)
    return np.asarray(lons), np.asarray(lats)


def parse_bbox(value: str | None) -> tuple[float, float, float, float] | None:
    if not value:
        return None
    parts = [float(part) for part in value.split(",")]
    if len(parts) != 4:
        raise ValueError("--bbox must be west,south,east,north")
    west, south, east, north = parts
    if not (west < east and south < north):
        raise ValueError("--bbox must be west,south,east,north")
    return west, south, east, north


if __name__ == "__main__":
    main()
