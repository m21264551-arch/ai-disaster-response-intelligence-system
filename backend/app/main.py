from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.data.fixtures import NSW_BBOX, demo_incidents, replay_event, replay_hotspots
from app.schemas import (
    AllocateRequest,
    AllocateResponse,
    DashboardBootstrapRequest,
    DashboardBootstrapResponse,
    DashboardFrameRequest,
    DashboardFrameResponse,
    HeldoutEvaluation,
    Hotspot,
    ModelMetrics,
    PredictRequest,
    PredictResponse,
    RevealRequest,
    RevealResponse,
    ReplayEvent,
)
from app.services.allocation import allocate_resources
from app.services.land_mask import point_inside_land
from app.services.live_feeds import fetch_nsw_rfs_incidents
from app.services.metrics import demo_metrics, heldout_failure_analysis
from app.services.reveal import reveal_prediction_vs_actual
from app.services.risk import BASELINE_VERSION, active_model_version, predict_risk_cells

PREDICTION_HORIZONS = [24, 48, 72]

app = FastAPI(
    title="AI Disaster-Response Intelligence System",
    version="0.1.0",
    description="Australian bushfire replay, risk forecasting, exposure scoring, and resource allocation API.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": get_settings().mode}


@app.get("/incidents/current")
async def current_incidents():
    settings = get_settings()
    if settings.mode == "demo":
        return demo_incidents()
    return await fetch_nsw_rfs_incidents(settings)


@app.get("/hotspots", response_model=list[Hotspot])
def hotspots(
    bbox: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
) -> list[Hotspot]:
    parsed_bbox = _parse_bbox(bbox) if bbox else NSW_BBOX
    items = replay_hotspots()
    if start:
        items = [item for item in items if item.observed_at >= start]
    if end:
        items = [item for item in items if item.observed_at <= end]
    west, south, east, north = parsed_bbox
    return [
        item
        for item in items
        if (
            west <= item.lon <= east
            and south <= item.lat <= north
            and point_inside_land(item.lat, item.lon, parsed_bbox)
        )
    ]


@app.post("/predict", response_model=PredictResponse)
def predict(payload: PredictRequest) -> PredictResponse:
    return _build_prediction(payload.start_time, payload.bbox, list(payload.horizons))


@app.post("/dashboard/bootstrap", response_model=DashboardBootstrapResponse)
async def dashboard_bootstrap(payload: DashboardBootstrapRequest) -> DashboardBootstrapResponse:
    event = replay_event()
    if payload.event_id != event.event_id:
        raise HTTPException(status_code=404, detail="Replay event not found")

    prediction = _build_prediction(payload.start_time, payload.bbox, list(payload.horizons))
    hotspot_start = payload.hotspot_start or event.start_time
    settings = get_settings()
    incidents = demo_incidents() if settings.mode == "demo" else await fetch_nsw_rfs_incidents(settings)

    return DashboardBootstrapResponse(
        replay=event,
        incidents=incidents,
        prediction=prediction,
        hotspots=hotspots(
            bbox=",".join(str(value) for value in payload.bbox),
            start=hotspot_start,
            end=payload.start_time,
        ),
        metrics=demo_metrics(payload.metrics_model_run_id),
        heldout=heldout_failure_analysis(),
    )


@app.post("/dashboard/frame", response_model=DashboardFrameResponse)
def dashboard_frame(payload: DashboardFrameRequest) -> DashboardFrameResponse:
    prediction = _build_prediction(payload.start_time, payload.bbox, list(payload.horizons))
    event = replay_event()
    hotspot_start = payload.hotspot_start or event.start_time

    return DashboardFrameResponse(
        prediction=prediction,
        hotspots=hotspots(
            bbox=",".join(str(value) for value in payload.bbox),
            start=hotspot_start,
            end=payload.start_time,
        ),
    )


@app.post("/reveal", response_model=RevealResponse)
def reveal(payload: RevealRequest) -> RevealResponse:
    return reveal_prediction_vs_actual(
        start_time=payload.start_time,
        bbox=payload.bbox,
        horizon_hours=payload.horizon_hours,
        prediction_budget=payload.prediction_budget,
        spatial_tolerance_rings=payload.spatial_tolerance_rings,
        reveal_run_id=f"reveal-{uuid4().hex[:12]}",
        generated_at=datetime.now(UTC),
    )


@app.post("/allocate", response_model=AllocateResponse)
def allocate(payload: AllocateRequest) -> AllocateResponse:
    start_time = payload.start_time or replay_event().start_time
    bbox = payload.bbox or NSW_BBOX
    risk_cells, exposures = predict_risk_cells(start_time, bbox, PREDICTION_HORIZONS)
    allocations, optimizer = allocate_resources(
        risk_cells=risk_cells,
        exposures=exposures,
        horizon_hours=payload.horizon_hours,
        crews=payload.crews,
        supplies=payload.supplies,
        max_distance_km=payload.max_distance_km,
    )
    return AllocateResponse(
        prediction_run_id=payload.prediction_run_id or f"alloc-{uuid4().hex[:12]}",
        allocations=allocations,
        total_priority_score=round(sum(item.priority_score for item in allocations), 4),
        optimizer=optimizer,
    )


@app.get("/replays/{event_id}", response_model=ReplayEvent)
def replay(event_id: str) -> ReplayEvent:
    event = replay_event()
    if event_id != event.event_id:
        raise HTTPException(status_code=404, detail="Replay event not found")
    return event


@app.get("/metrics/{model_run_id}", response_model=ModelMetrics)
def metrics(model_run_id: str) -> ModelMetrics:
    return demo_metrics(model_run_id)


@app.get("/heldout/failure-analysis", response_model=HeldoutEvaluation)
def heldout_failures() -> HeldoutEvaluation:
    return heldout_failure_analysis()


def _parse_bbox(bbox: str) -> list[float]:
    try:
        values = [float(part.strip()) for part in bbox.split(",")]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="bbox must be comma-separated floats") from exc
    if len(values) != 4:
        raise HTTPException(status_code=400, detail="bbox must be west,south,east,north")
    west, south, east, north = values
    if west >= east or south >= north:
        raise HTTPException(status_code=400, detail="bbox must be west,south,east,north")
    return values


def _build_prediction(start_time: datetime, bbox: list[float], horizons: list[int]) -> PredictResponse:
    risk_cells, exposures = predict_risk_cells(start_time, bbox, horizons)
    return PredictResponse(
        prediction_run_id=f"pred-{uuid4().hex[:12]}",
        generated_at=datetime.now(UTC),
        start_time=start_time,
        bbox=bbox,
        risk_cells=risk_cells,
        exposures=exposures,
        model_version=active_model_version(),
        baseline_version=BASELINE_VERSION,
    )
