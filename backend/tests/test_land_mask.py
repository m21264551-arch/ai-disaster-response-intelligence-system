from datetime import UTC, datetime

from app.data.fixtures import NSW_BBOX, replay_hotspots
from app.services.geo import cell_from_lat_lon
from app.services.land_mask import h3_cell_inside_land, point_inside_land
from app.services.reveal import reveal_prediction_vs_actual
from app.services.risk import predict_risk_cells


def test_demo_replay_hotspots_stay_on_land():
    for hotspot in replay_hotspots():
        assert point_inside_land(hotspot.lat, hotspot.lon, NSW_BBOX)
        assert h3_cell_inside_land(cell_from_lat_lon(hotspot.lat, hotspot.lon, resolution=5), NSW_BBOX)


def test_predict_cells_do_not_render_over_water():
    risk_cells, _ = predict_risk_cells(datetime(2020, 1, 5, tzinfo=UTC), NSW_BBOX, [24, 48, 72])

    assert risk_cells
    for cell in risk_cells:
        assert h3_cell_inside_land(cell.h3_id, NSW_BBOX)
        assert _geometry_vertices_inside_land(cell.geometry)


def test_reveal_cells_do_not_render_over_water():
    reveal = reveal_prediction_vs_actual(
        start_time=datetime(2020, 1, 5, tzinfo=UTC),
        bbox=NSW_BBOX,
        horizon_hours=72,
        prediction_budget=36,
        spatial_tolerance_rings=1,
        reveal_run_id="test-reveal",
        generated_at=datetime(2020, 1, 5, tzinfo=UTC),
    )

    assert reveal.comparison_cells
    for cell in reveal.comparison_cells:
        assert h3_cell_inside_land(cell.h3_id, NSW_BBOX)
        assert _geometry_vertices_inside_land(cell.geometry)


def _geometry_vertices_inside_land(geometry: dict) -> bool:
    return all(
        point_inside_land(lat, lon, NSW_BBOX)
        for lon, lat in geometry["coordinates"][0][:-1]
    )
