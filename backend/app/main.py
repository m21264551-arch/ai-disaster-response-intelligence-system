"""Public contract: frozen NSW historical forecasts, never operational fallback data."""

from datetime import datetime
from typing import Literal
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from app.security import SecurityHeadersMiddleware, rate_limit_expensive_endpoint
from app.replay.store import (
    bundle,
    metadata,
    find_frame,
    forecast,
    reveal as reveal_frame,
)

app = FastAPI(
    title="NSW Bushfire Forecast Replay",
    version="2.0.0",
    description="Historical satellite hotspot occurrence, frozen trained model and observed outcomes.",
)
app.add_middleware(GZipMiddleware, minimum_size=512)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5181",
        "http://localhost:5181",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class FrameRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    frame_id: str
    artifact_id: str


class RevealRequest(FrameRequest):
    tolerance_rings: Literal[0, 1] = 0


def checked(request):
    data = bundle()
    if request.artifact_id != data["artifactId"]:
        raise HTTPException(
            409, "Artifact changed; reload the study before selecting a frame."
        )
    return find_frame(frame_id=request.frame_id)


@app.get("/health")
def health():
    data = bundle()
    return {
        "status": "ready",
        "mode": "frozen_historical_model_output",
        "dataReady": True,
        "modelReady": True,
        "artifactId": data["artifactId"],
        "modelArtifactId": data["modelArtifactId"],
        "datasetId": data["datasetId"],
    }


@app.get("/v2/study")
@app.get("/dashboard/bootstrap")
def study():
    return metadata()


@app.post("/predict", dependencies=[Depends(rate_limit_expensive_endpoint)])
@app.post("/dashboard/frame")
def frame(request: FrameRequest):
    return forecast(checked(request))


@app.post("/reveal", dependencies=[Depends(rate_limit_expensive_endpoint)])
def reveal(request: RevealRequest):
    return reveal_frame(checked(request), request.tolerance_rings)


@app.get("/v2/download")
def download():
    return bundle()


@app.get("/metrics/{artifact_id}")
def metrics(artifact_id: str):
    data = bundle()
    if artifact_id != data["artifactId"]:
        raise HTTPException(404, "Unknown artifact")
    return {
        "artifactId": data["artifactId"],
        "datasetId": data["datasetId"],
        "modelArtifactId": data["modelArtifactId"],
        "evaluationPolicy": data["evaluationPolicy"],
        "benchmarks": data["benchmarks"],
    }
