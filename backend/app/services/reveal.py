from __future__ import annotations

from datetime import UTC, datetime, timedelta

import h3

from app.data.fixtures import replay_hotspots
from app.schemas import Hotspot, RevealCell, RevealResponse, RevealSummary
from app.services.geo import cell_from_lat_lon, centroid_from_h3, in_bbox, polygon_geometry_from_h3
from app.services.risk import predict_risk_cells


def reveal_prediction_vs_actual(
    *,
    start_time: datetime,
    bbox: list[float],
    horizon_hours: int,
    prediction_budget: int | None = None,
    spatial_tolerance_rings: int = 1,
    reveal_run_id: str,
    generated_at: datetime,
) -> RevealResponse:
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=UTC)
    horizon_end = start_time + timedelta(hours=horizon_hours)

    actual_hotspots = future_hotspots(start_time=start_time, horizon_end=horizon_end, bbox=bbox)
    actual_cell_ids = {
        cell_from_lat_lon(hotspot.lat, hotspot.lon, resolution=5)
        for hotspot in actual_hotspots
    }

    risk_cells, _ = predict_risk_cells(start_time, bbox, [horizon_hours])
    default_budget = max(24, min(45, len(actual_cell_ids) * 6 or 24))
    budget = prediction_budget or default_budget
    predicted = sorted(risk_cells, key=lambda cell: cell.risk_score, reverse=True)[:budget]
    predicted_score_by_id = {cell.h3_id: cell.risk_score for cell in predicted}
    predicted_cell_ids = set(predicted_score_by_id)

    actual_buffer_ids = set(actual_cell_ids)
    for actual_cell_id in actual_cell_ids:
        actual_buffer_ids |= set(h3.grid_disk(actual_cell_id, spatial_tolerance_rings))

    predicted_hit_ids = predicted_cell_ids & actual_buffer_ids
    covered_actual_ids = {
        actual_cell_id
        for actual_cell_id in actual_cell_ids
        if predicted_cell_ids & set(h3.grid_disk(actual_cell_id, spatial_tolerance_rings))
    }
    missed_ids = actual_cell_ids - covered_actual_ids
    false_alarm_ids = predicted_cell_ids - actual_buffer_ids

    comparison_cells = [
        *_cells_for_status(predicted_hit_ids, "hit", predicted_score_by_id),
        *_cells_for_status(missed_ids, "miss", predicted_score_by_id),
        *_cells_for_status(false_alarm_ids, "false_alarm", predicted_score_by_id),
    ]
    comparison_cells = sorted(
        comparison_cells,
        key=lambda cell: ({"hit": 0, "miss": 1, "false_alarm": 2}[cell.status], -cell.risk_score, cell.h3_id),
    )

    precision = len(predicted_hit_ids) / len(predicted_cell_ids) if predicted_cell_ids else 0
    recall = len(covered_actual_ids) / len(actual_cell_ids) if actual_cell_ids else 0
    return RevealResponse(
        reveal_run_id=reveal_run_id,
        generated_at=generated_at,
        start_time=start_time,
        horizon_end=horizon_end,
        bbox=bbox,
        summary=RevealSummary(
            horizon_hours=horizon_hours,
            spatial_tolerance_rings=spatial_tolerance_rings,
            predicted_cells=len(predicted_cell_ids),
            actual_cells=len(actual_cell_ids),
            hits=len(covered_actual_ids),
            misses=len(missed_ids),
            false_alarms=len(false_alarm_ids),
            precision=round(precision, 4),
            recall=round(recall, 4),
            actual_hotspots=len(actual_hotspots),
        ),
        comparison_cells=comparison_cells,
        actual_hotspots=actual_hotspots,
    )


def future_hotspots(*, start_time: datetime, horizon_end: datetime, bbox: list[float]) -> list[Hotspot]:
    return [
        hotspot
        for hotspot in replay_hotspots()
        if start_time < hotspot.observed_at <= horizon_end and in_bbox(hotspot.lat, hotspot.lon, bbox)
    ]


def _cells_for_status(
    cell_ids: set[str],
    status: str,
    predicted_score_by_id: dict[str, float],
) -> list[RevealCell]:
    return [
        RevealCell(
            h3_id=cell_id,
            status=status,
            risk_score=round(predicted_score_by_id.get(cell_id, 0.0), 4),
            geometry=polygon_geometry_from_h3(cell_id),
            centroid=centroid_from_h3(cell_id),
        )
        for cell_id in cell_ids
    ]
