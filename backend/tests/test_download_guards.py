import zipfile

import pytest

from scripts.download_abs_population_grid import ABS_POPULATION_GEOTIFF_URL, extract_geotiff, validate_abs_download_url
from scripts.download_bom_weather import parse_station_specs, validate_bom_download_url


def test_abs_download_url_guard_allows_expected_public_zip():
    assert validate_abs_download_url(ABS_POPULATION_GEOTIFF_URL) == ABS_POPULATION_GEOTIFF_URL


def test_abs_download_url_guard_rejects_unexpected_scheme_and_host():
    with pytest.raises(ValueError):
        validate_abs_download_url("file:///tmp/population.zip")

    with pytest.raises(ValueError):
        validate_abs_download_url("https://example.com/statistics/people/population/regional-population/file.zip")


def test_abs_geotiff_extraction_rejects_zip_slip_members(tmp_path):
    zip_path = tmp_path / "population.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr("../evil.tif", b"not a real geotiff")

    with pytest.raises(ValueError, match="unsafe"):
        extract_geotiff(zip_path, tmp_path / "extract")


def test_bom_download_url_guard_allows_expected_public_ftp_path():
    url = "ftp://ftp.bom.gov.au/anon/gen/clim_data/IDCKWCDEA0/tables/nsw/bega/bega-202001.csv"
    assert validate_bom_download_url(url) == url


def test_bom_download_url_guard_rejects_unexpected_paths():
    with pytest.raises(ValueError):
        validate_bom_download_url("file:///tmp/bega.csv")

    with pytest.raises(ValueError):
        validate_bom_download_url("ftp://ftp.bom.gov.au/anon/other/bega.csv")


def test_bom_station_specs_reject_path_segments():
    assert parse_station_specs(["vic:east_sale_airport"]) == [("vic", "east_sale_airport")]

    with pytest.raises(ValueError):
        parse_station_specs(["nsw:../bega"])
