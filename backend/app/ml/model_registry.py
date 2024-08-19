from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.ml.features import FEATURE_COLUMNS

ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts"
MODEL_PATH = ARTIFACT_DIR / "bushfire_risk_model.joblib"
METRICS_PATH = ARTIFACT_DIR / "metrics.json"
HELDOUT_METRICS_PATH = ARTIFACT_DIR / "heldout_metrics.json"
HELDOUT_FAILURE_ANALYSIS_PATH = ARTIFACT_DIR / "heldout_failure_analysis.json"
FEATURE_SCHEMA_PATH = ARTIFACT_DIR / "feature_schema.json"


class TrainedRiskModel:
    def __init__(self, payload: dict[str, Any]):
        self.model = payload["model"]
        self.feature_columns = payload.get("feature_columns", FEATURE_COLUMNS)
        self.model_version = payload.get("model_version", "trained-risk-model")
        self.trained_at = payload.get("trained_at")

    def predict_proba(self, rows: list[dict[str, float]]) -> list[float]:
        import pandas as pd

        frame = pd.DataFrame(rows, columns=self.feature_columns).fillna(0.0)
        probabilities = self.model.predict_proba(frame)[:, 1]
        return [float(value) for value in probabilities]


@lru_cache(maxsize=1)
def get_trained_model() -> TrainedRiskModel | None:
    if not get_settings().load_trained_model:
        return None
    if not MODEL_PATH.exists():
        return None
    import joblib

    return TrainedRiskModel(joblib.load(MODEL_PATH))


@lru_cache(maxsize=4)
def load_metrics_payload(model_run_id: str | None = None) -> dict[str, Any] | None:
    path = HELDOUT_METRICS_PATH if model_run_id == "heldout-nsw-bushfire-v1" else METRICS_PATH
    if not path.exists():
        return None
    return json.loads(path.read_text())


@lru_cache(maxsize=1)
def load_heldout_failure_payload() -> dict[str, Any] | None:
    if not HELDOUT_FAILURE_ANALYSIS_PATH.exists():
        return None
    return json.loads(HELDOUT_FAILURE_ANALYSIS_PATH.read_text())
