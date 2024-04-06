from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


BBox = list[float]


class Hotspot(BaseModel):
    source: str
    observed_at: datetime
    lat: float
    lon: float
    confidence: float = Field(ge=0, le=1)
    intensity: float = Field(ge=0)
    geometry: dict[str, Any]


class Incident(BaseModel):
    id: str
    name: str
    status: str
    alert_level: str
    started_at: datetime
    updated_at: datetime
    lat: float
    lon: float
    size_hectares: float
    source: str


class FeatureContribution(BaseModel):
    name: str
    contribution: float


class RiskCell(BaseModel):
    h3_id: str
    horizon_hours: Literal[24, 48, 72]
    risk_score: float = Field(ge=0, le=1)
    confidence_low: float = Field(ge=0, le=1)
    confidence_high: float = Field(ge=0, le=1)
    top_features: list[FeatureContribution]
    geometry: dict[str, Any]
    centroid: dict[str, float]


class Exposure(BaseModel):
    h3_id: str
    population: int
    hospitals: int
    schools: int
    major_roads: int
    shelters: int


class Allocation(BaseModel):
    resource_id: str
    assigned_h3_id: str
    priority_score: float
    rationale: str
    staging_point: str
    eta_minutes: int


class ReplayEvent(BaseModel):
    event_id: str
    name: str
    start_time: datetime
    end_time: datetime
    region_bbox: BBox
    description: str


class PredictRequest(BaseModel):
    bbox: BBox = Field(min_length=4, max_length=4)
    start_time: datetime
    horizons: list[Literal[24, 48, 72]] = Field(default_factory=lambda: [24, 48, 72], min_length=1, max_length=3)

    @field_validator("bbox")
    @classmethod
    def validate_bbox(cls, bbox: BBox) -> BBox:
        west, south, east, north = bbox
        if west >= east or south >= north:
            raise ValueError("bbox must be [west, south, east, north]")
        if not (-180 <= west <= 180 and -180 <= east <= 180):
            raise ValueError("bbox longitude values must be valid")
        if not (-90 <= south <= 90 and -90 <= north <= 90):
            raise ValueError("bbox latitude values must be valid")
        return bbox

    @field_validator("horizons")
    @classmethod
    def validate_horizons(cls, horizons: list[Literal[24, 48, 72]]) -> list[Literal[24, 48, 72]]:
        unique_horizons = list(dict.fromkeys(horizons))
        if len(unique_horizons) != len(horizons):
            raise ValueError("horizons must not contain duplicates")
        return unique_horizons


class PredictResponse(BaseModel):
    prediction_run_id: str
    generated_at: datetime
    start_time: datetime
    bbox: BBox
    risk_cells: list[RiskCell]
    exposures: list[Exposure]
    model_version: str
    baseline_version: str


class DashboardBootstrapRequest(BaseModel):
    bbox: BBox = Field(min_length=4, max_length=4)
    start_time: datetime
    horizons: list[Literal[24, 48, 72]] = Field(default_factory=lambda: [24, 48, 72], min_length=1, max_length=3)
    event_id: str = "nsw-black-summer-south-coast"
    hotspot_start: datetime | None = None
    metrics_model_run_id: str = "demo-black-summer-v0"

    @field_validator("bbox")
    @classmethod
    def validate_bbox(cls, bbox: BBox) -> BBox:
        return PredictRequest.validate_bbox(bbox)

    @field_validator("horizons")
    @classmethod
    def validate_horizons(cls, horizons: list[Literal[24, 48, 72]]) -> list[Literal[24, 48, 72]]:
        return PredictRequest.validate_horizons(horizons)


class DashboardBootstrapResponse(BaseModel):
    replay: ReplayEvent
    incidents: list[Incident]
    prediction: PredictResponse
    hotspots: list[Hotspot]
    metrics: ModelMetrics
    heldout: HeldoutEvaluation


class RevealRequest(BaseModel):
    bbox: BBox = Field(min_length=4, max_length=4)
    start_time: datetime
    horizon_hours: Literal[24, 48, 72] = 72
    prediction_budget: int | None = Field(default=None, ge=1, le=120)
    spatial_tolerance_rings: int = Field(default=1, ge=0, le=2)

    @field_validator("bbox")
    @classmethod
    def validate_bbox(cls, bbox: BBox) -> BBox:
        return PredictRequest.validate_bbox(bbox)


class RevealCell(BaseModel):
    h3_id: str
    status: Literal["hit", "miss", "false_alarm"]
    risk_score: float = Field(ge=0, le=1)
    geometry: dict[str, Any]
    centroid: dict[str, float]


class RevealSummary(BaseModel):
    horizon_hours: Literal[24, 48, 72]
    spatial_tolerance_rings: int
    predicted_cells: int
    actual_cells: int
    hits: int
    misses: int
    false_alarms: int
    precision: float = Field(ge=0, le=1)
    recall: float = Field(ge=0, le=1)
    actual_hotspots: int


class RevealResponse(BaseModel):
    reveal_run_id: str
    generated_at: datetime
    start_time: datetime
    horizon_end: datetime
    bbox: BBox
    summary: RevealSummary
    comparison_cells: list[RevealCell]
    actual_hotspots: list[Hotspot]


class AllocateRequest(BaseModel):
    prediction_run_id: str | None = None
    bbox: BBox | None = None
    start_time: datetime | None = None
    horizon_hours: Literal[24, 48, 72] = 24
    crews: int = Field(ge=0, le=50)
    supplies: int = Field(ge=0, le=200)
    max_distance_km: float = Field(default=180, gt=0)

    @field_validator("bbox")
    @classmethod
    def validate_bbox(cls, bbox: BBox | None) -> BBox | None:
        if bbox is None:
            return None
        return PredictRequest.validate_bbox(bbox)


class AllocateResponse(BaseModel):
    prediction_run_id: str
    allocations: list[Allocation]
    total_priority_score: float
    optimizer: str


class Metric(BaseModel):
    name: str
    model_value: float
    baseline_value: float
    unit: str
    interpretation: str


class ModelMetrics(BaseModel):
    model_run_id: str
    generated_at: datetime
    dataset_name: str | None = None
    evaluation_window: dict[str, Any] | None = None
    evaluation_rows: int | None = None
    positive_rate: float | None = None
    metrics: list[Metric]
    confusion_summary: dict[str, int]
    calibration_bins: list[dict[str, float]]


class HeldoutCase(BaseModel):
    h3_id: str
    prediction_time: datetime
    horizon_hours: Literal[24, 48, 72]
    model_score: float = Field(ge=0, le=1)
    baseline_score: float = Field(ge=0, le=1)
    rank: int
    centroid: dict[str, float]


class HeldoutCaseGroups(BaseModel):
    missed: list[HeldoutCase]
    false_alarms: list[HeldoutCase]
    hits: list[HeldoutCase]


class HeldoutEvaluation(BaseModel):
    model_run_id: str
    generated_at: datetime
    metrics: ModelMetrics
    evaluation_window: dict[str, Any]
    case_counts: dict[str, int]
    cases: HeldoutCaseGroups
