"""Validated frozen run serving. No model loading, inference, fixtures or fallback."""

import hashlib
import json
import math
from functools import lru_cache
from pathlib import Path
from fastapi import HTTPException

DIRECTORY = Path(__file__).resolve().parent / "artifacts"


@lru_cache(maxsize=2)
def _read(path, modified, model_modified):
    del modified, model_modified
    directory = Path(path)
    data = json.loads((directory / "replay-v2.json").read_text())
    if data.get("schemaVersion") != 2 or not data.get("frames"):
        raise ValueError("Unsupported or empty replay artifact")
    if (
        hashlib.sha256((directory / "model.joblib").read_bytes()).hexdigest()
        != data["modelSha256"]
    ):
        raise ValueError("Model file and replay do not match")
    for frame in data["frames"]:
        if (
            frame["modelArtifactId"] != data["modelArtifactId"]
            or frame["datasetId"] != data["datasetId"]
        ):
            raise ValueError("Frame identity mismatch")
        if frame["available"]:
            if any(c["horizon"] != frame["horizon"] for c in frame["cells"]):
                raise ValueError("Mixed forecast horizons")
            expected = [
                c["h3_id"]
                for c in sorted(
                    frame["cells"], key=lambda c: (-c["score"], c["h3_id"])
                )[: math.ceil(len(frame["cells"]) * 0.1)]
            ]
            if expected != frame["selectedCells"]:
                raise ValueError("Selection does not follow declared policy")
    return data


def bundle():
    try:
        return _read(
            str(DIRECTORY),
            (DIRECTORY / "replay-v2.json").stat().st_mtime_ns,
            (DIRECTORY / "model.joblib").stat().st_mtime_ns,
        )
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(
            503,
            "Frozen replay unavailable or mismatched. Regenerate code, model and replay together.",
        ) from exc


def metadata():
    data = bundle()
    return {
        **{k: v for k, v in data.items() if k != "frames"},
        "frames": [
            {
                k: v
                for k, v in f.items()
                if k in ["id", "cutoff", "horizon", "available", "reason"]
            }
            for f in data["frames"]
        ],
    }


def find_frame(frame_id=None, cutoff=None, horizon=None):
    from datetime import datetime

    for frame in bundle()["frames"]:
        match = (
            frame["id"] == frame_id
            if frame_id
            else datetime.fromisoformat(frame["cutoff"]) == cutoff
            and frame["horizon"] == horizon
        )
        if match:
            if not frame["available"]:
                raise HTTPException(409, frame["reason"])
            return frame
    raise HTTPException(
        404,
        "Cutoff/horizon not present in the frozen replay. Select an available frame.",
    )


def forecast(frame):
    return {
        k: v
        for k, v in frame.items()
        if k
        not in ["actualCells", "actualGeometry", "benchmarks", "toleranceComparison"]
    }


def reveal(frame, tolerance=0):
    actual = set(frame["actualCells"])
    selected = set(frame["selectedCells"])
    comparisons = []
    # Map statuses always use exact matches; tolerance is a secondary metric, not a relabelling.
    for cell in sorted(actual | selected):
        status = (
            "hit"
            if cell in actual & selected
            else "miss" if cell in actual else "false_alarm"
        )
        geometry = frame["actualGeometry"].get(cell) or next(
            c["geometry"] for c in frame["cells"] if c["h3_id"] == cell
        )
        comparisons.append({"h3_id": cell, "status": status, "geometry": geometry})
    return {
        "frameId": frame["id"],
        "cutoff": frame["cutoff"],
        "horizon": frame["horizon"],
        "datasetId": frame["datasetId"],
        "modelArtifactId": frame["modelArtifactId"],
        "candidateSetId": frame["candidateSetId"],
        "evaluationPolicy": frame["evaluationPolicy"],
        "summary": (
            frame["toleranceComparison"] if tolerance else frame["benchmarks"]["model"]
        ),
        "benchmarks": frame["benchmarks"],
        "comparisonCells": comparisons,
        "mapMatching": "exact",
        "toleranceRings": tolerance,
    }
