"""One candidate/feature/evaluation protocol for training and frozen public replay."""

from __future__ import annotations
import hashlib
import json
import math
import subprocess
from datetime import datetime, timezone
from pathlib import Path
import h3
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import average_precision_score, brier_score_loss
from app.services.geo import polygon_geometry_from_h3
from app.services.land_mask import point_inside_land

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app/data"
OUTPUT = ROOT / "app/replay/artifacts"
BBOX = [148.7, -37.4, 153.8, -31.1]
HORIZONS = (24, 48, 72)
RESOLUTION = 5
RING = 3
LOOKBACK = 36
FEATURES = [
    "horizon",
    "local_count",
    "neighbor_count",
    "nearest_km",
    "age_hours",
    "spread_heuristic",
    "max_temp_c",
    "rainfall_mm",
    "min_relative_humidity_pct",
    "avg_10m_wind_speed_kmh",
    "weather_distance_km",
    "weather_age_hours",
]
WEATHER = [
    "max_temp_c",
    "rainfall_mm",
    "min_relative_humidity_pct",
    "avg_10m_wind_speed_kmh",
]
POLICY = {
    "fraction": 0.1,
    "selection": "ceil(10% of all candidates), descending score then H3 ID",
    "matching": "exact H3 cell by default; optional one-ring tolerance",
    "candidateDefinition": "H3 resolution 5, ring 3 around detections in the preceding 36 hours; centres inside fixed NSW bbox and land mask",
    "lookbackHours": LOOKBACK,
    "maxHorizonHours": 72,
    "stepHours": 12,
    "scoreMeaning": "Uncalibrated model score for satellite hotspot occurrence, not a perimeter or physical spread probability",
    "weatherAvailability": "Daily observations treated as available at 00:00 UTC two days after their date; historical publication timestamps are unavailable.",
}


def digest(value):
    return hashlib.sha256(
        value
        if isinstance(value, bytes)
        else json.dumps(
            value, sort_keys=True, separators=(",", ":"), allow_nan=False
        ).encode()
    ).hexdigest()


def read_snapshot(path):
    meta = json.loads(path.with_suffix(".manifest.json").read_text())
    if (
        not meta["completePagination"]
        or digest(path.read_bytes()) != meta["sha256"]
        or any(c["matched"] != c["downloaded"] for c in meta["chunks"])
    ):
        raise ValueError("Missing, truncated or mismatched observation coverage")
    df = pd.read_csv(path)
    df["time"] = pd.to_datetime(df.observed_at, utc=True)
    df["cell"] = [h3.latlng_to_cell(a, b, RESOLUTION) for a, b in zip(df.lat, df.lon)]
    if not (
        (df.time >= pd.Timestamp(meta["start"])) & (df.time < pd.Timestamp(meta["end"]))
    ).all():
        raise ValueError("Observation outside declared window")
    return df.sort_values(["time", "id"]), meta


def weather_at(weather, cutoff, lat, lon):
    # No fixed meteorological defaults. Missing weather remains NaN for HGB.
    usable = weather.loc[weather.available_at <= cutoff]
    if usable.empty:
        return {
            **{k: np.nan for k in WEATHER},
            "weather_distance_km": np.nan,
            "weather_age_hours": np.nan,
        }, None
    latest = usable.available_at.max()
    usable = usable.loc[usable.available_at == latest]
    if cutoff - latest > pd.Timedelta(days=3):
        return {
            **{k: np.nan for k in WEATHER},
            "weather_distance_km": np.nan,
            "weather_age_hours": np.nan,
        }, None
    distances = distance_km(lat, lon, usable.lat.to_numpy(), usable.lon.to_numpy())
    i = int(np.argmin(distances))
    row = usable.iloc[i]
    return {
        **{k: float(row[k]) for k in WEATHER},
        "weather_distance_km": float(distances[i]),
        "weather_age_hours": float((cutoff - row.date).total_seconds() / 3600),
    }, row.available_at.isoformat()


def distance_km(lat, lon, other_lat, other_lon):
    p1, p2 = np.radians(lat), np.radians(other_lat)
    dp = np.radians(other_lat - lat)
    dl = np.radians(other_lon - lon)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return (
        6371.0088
        * 2
        * np.arctan2(np.sqrt(np.clip(a, 0, 1)), np.sqrt(np.clip(1 - a, 0, 1)))
    )


def forecast_features(observations, weather, cutoff):
    """This function cannot inspect a future label: filter before deriving candidates."""
    recent = observations.loc[
        (observations.time > cutoff - pd.Timedelta(hours=LOOKBACK))
        & (observations.time <= cutoff)
    ]
    if recent.empty:
        return []
    counts = recent.cell.value_counts().to_dict()
    candidates = sorted(
        {candidate for cell in counts for candidate in h3.grid_disk(cell, RING)}
    )
    candidates = [c for c in candidates if in_region(c)]
    latitudes = recent.lat.to_numpy()
    longitudes = recent.lon.to_numpy()
    rows = []
    for cell in candidates:
        lat, lon = h3.cell_to_latlng(cell)
        distances = distance_km(lat, lon, latitudes, longitudes)
        nearest = float(distances.min())
        local = recent.loc[recent.cell == cell]
        age = (
            float((cutoff - local.time.max()).total_seconds() / 3600)
            if len(local)
            else float(LOOKBACK)
        )
        met, available = weather_at(weather, cutoff, lat, lon)
        # Fixed-bearing spread heuristic retained as a baseline, explicitly not a wind forecast.
        p1, p2 = np.radians(latitudes), np.radians(lat)
        dl = np.radians(lon - longitudes)
        bearing = (
            np.degrees(
                np.arctan2(
                    np.sin(dl) * np.cos(p2),
                    np.cos(p1) * np.sin(p2) - np.sin(p1) * np.cos(p2) * np.cos(dl),
                )
            )
            + 360
        ) % 360
        alignment = float(((np.cos(np.radians(bearing - 128)) + 1) / 2).max())
        for horizon in HORIZONS:
            spread = float(
                np.clip(
                    math.exp(-((nearest / (18 + horizon * 0.95)) ** 2))
                    * (0.48 + 0.34 * alignment)
                    * {24: 0.82, 48: 0.92, 72: 1}[horizon],
                    0.01,
                    0.93,
                )
            )
            rows.append(
                {
                    "cutoff": cutoff.isoformat(),
                    "h3_id": cell,
                    "horizon": horizon,
                    "local_count": float(counts.get(cell, 0)),
                    "neighbor_count": float(
                        sum(counts.get(c, 0) for c in h3.grid_disk(cell, 1))
                    ),
                    "nearest_km": nearest,
                    "age_hours": age,
                    "spread_heuristic": spread,
                    **met,
                    "weatherAvailableAt": available,
                }
            )
    return rows


def in_region(cell):
    lat, lon = h3.cell_to_latlng(cell)
    return (
        BBOX[0] <= lon <= BBOX[2]
        and BBOX[1] <= lat <= BBOX[3]
        and point_inside_land(lat, lon, BBOX)
    )


def coverage_available(cutoff, horizon, manifest):
    # Downloaded half-open [start,end), labels are (cutoff,cutoff+horizon].
    return cutoff - pd.Timedelta(hours=LOOKBACK) >= pd.Timestamp(
        manifest["start"]
    ) and cutoff + pd.Timedelta(hours=horizon) < pd.Timestamp(manifest["end"])


def eligible_training(frame, evaluation_start):
    cutoff = pd.to_datetime(frame.cutoff, utc=True)
    # A uniform 72-hour purge keeps complete cutoff groups together across horizons.
    return frame.loc[
        cutoff + pd.Timedelta(hours=max(HORIZONS)) < evaluation_start
    ].copy()


def select_top(rows, score="score"):
    budget = math.ceil(len(rows) * POLICY["fraction"])
    return [
        r["h3_id"] for r in sorted(rows, key=lambda r: (-r[score], r["h3_id"]))[:budget]
    ]


def evaluate(rows, actual, selection, tolerance=0):
    actual = set(actual)
    pred = set(selection)
    if tolerance:
        pred_hits = {p for p in pred if set(h3.grid_disk(p, tolerance)) & actual}
        covered = {a for a in actual if set(h3.grid_disk(a, tolerance)) & pred}
    else:
        pred_hits = covered = pred & actual
    labels = [int(r["h3_id"] in actual) for r in rows]
    scores = [r["score"] for r in rows]
    calibration = []
    for lo in np.arange(0, 1, 0.1):
        idx = [
            i
            for i, s in enumerate(scores)
            if lo <= s and (s < lo + 0.1 if lo < 0.89 else s <= 1)
        ]
        if idx:
            calibration.append(
                {
                    "meanScore": float(np.mean([scores[i] for i in idx])),
                    "observedFraction": float(np.mean([labels[i] for i in idx])),
                    "n": len(idx),
                }
            )
    return {
        "candidateCount": len(rows),
        "selectedCount": len(pred),
        "observedCells": len(actual),
        "hits": len(pred_hits),
        "coveredObservedCells": len(covered),
        "falseAlarms": len(pred - pred_hits),
        "misses": len(actual - covered),
        "outsideCandidateMisses": len(actual - {r["h3_id"] for r in rows}),
        "precision": len(pred_hits) / len(pred) if pred else None,
        "recall": len(covered) / len(actual) if actual else None,
        "averagePrecision": (
            float(average_precision_score(labels, scores))
            if len(set(labels)) == 2
            else None
        ),
        "brier": float(brier_score_loss(labels, scores)) if labels else None,
        "calibration": calibration,
        "toleranceRings": tolerance,
        "rankingScope": "All candidates; recall also counts observed cells outside the candidate set",
    }


def read_weather():
    w = pd.read_csv(DATA / "bom_weather_observations_sample.csv")
    w["date"] = pd.to_datetime(w.date, utc=True)
    w["available_at"] = w.date + pd.Timedelta(days=2)
    return w


def build_rows(obs, meta, weather):
    first = (pd.Timestamp(meta["start"]) + pd.Timedelta(hours=LOOKBACK)).ceil("12h")
    frames = []
    training = []
    for cutoff in pd.date_range(
        first, pd.Timestamp(meta["end"]), freq="12h", inclusive="left"
    ):
        features = forecast_features(obs, weather, cutoff)
        frames.append((cutoff, features))
        for horizon in HORIZONS:
            if not coverage_available(cutoff, horizon, meta):
                continue
            actual = set(
                obs.loc[
                    (obs.time > cutoff)
                    & (obs.time <= cutoff + pd.Timedelta(hours=horizon)),
                    "cell",
                ]
            )
            for row in features:
                if row["horizon"] == horizon:
                    training.append({**row, "label": int(row["h3_id"] in actual)})
        print(f"features {cutoff}: {len(features)} rows", flush=True)
    return frames, pd.DataFrame(training)


def generate():
    train_obs, train_meta = read_snapshot(DATA / "replay_training_dea.csv")
    eval_obs, eval_meta = read_snapshot(DATA / "replay_evaluation_dea.csv")
    weather = read_weather()
    _, all_train = build_rows(train_obs, train_meta, weather)
    train = eligible_training(all_train, pd.Timestamp(eval_meta["start"]))
    if train.label.nunique() != 2:
        raise ValueError("Training requires both classes")
    model = HistGradientBoostingClassifier(
        learning_rate=0.055,
        max_iter=150,
        max_leaf_nodes=15,
        l2_regularization=0.1,
        early_stopping=False,
        random_state=42,
    )
    model.fit(train[FEATURES], train.label)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    revision = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT.parent, text=True
    ).strip()
    source = digest(Path(__file__).read_bytes())
    identity = {
        "trainingSnapshot": train_meta["sha256"],
        "weatherSnapshot": digest(
            (DATA / "bom_weather_observations_sample.csv").read_bytes()
        ),
        "sourceChecksum": source,
        "features": FEATURES,
        "settings": model.get_params(),
        "seed": 42,
        "codeRevision": revision,
    }
    model_id = "nsw-hgb-v2-" + digest(identity)[:16]
    joblib.dump(
        {"model": model, "modelArtifactId": model_id, "identity": identity},
        OUTPUT / "model.joblib",
        compress=3,
    )
    model_sha = digest((OUTPUT / "model.joblib").read_bytes())
    # Verify the actual frozen artifact used for every public frame.
    frozen = joblib.load(OUTPUT / "model.joblib")
    if frozen["modelArtifactId"] != model_id:
        raise ValueError("Model identity mismatch")
    eval_frames, _ = build_rows(eval_obs, eval_meta, weather)
    prevalence = train.groupby("horizon").label.mean().to_dict()
    dataset_id = (
        "dea-nsw-"
        + digest({"training": train_meta["sha256"], "evaluation": eval_meta["sha256"]})[
            :16
        ]
    )
    frames = []
    pooled = {
        h: {name: [] for name in ["model", "persistence", "prevalence", "spread"]}
        for h in HORIZONS
    }
    counts = {
        h: {
            name: {
                "hits": 0,
                "selected": 0,
                "observed": 0,
                "covered": 0,
                "misses": 0,
                "falseAlarms": 0,
                "outsideCandidateMisses": 0,
            }
            for name in pooled[h]
        }
        for h in HORIZONS
    }
    for cutoff, features in eval_frames:
        for horizon in HORIZONS:
            key = f'{cutoff.strftime("%Y%m%dT%H%MZ")}-{horizon}'
            head = {
                "id": key,
                "datasetId": dataset_id,
                "modelArtifactId": model_id,
                "cutoff": cutoff.isoformat(),
                "horizon": horizon,
                "evaluationPolicy": POLICY,
            }
            if not coverage_available(cutoff, horizon, eval_meta):
                frames.append(
                    {
                        **head,
                        "available": False,
                        "reason": "Incomplete future observation coverage; this horizon extends beyond the frozen archive window.",
                    }
                )
                continue
            features_h = [r for r in features if r["horizon"] == horizon]
            if not features_h:
                frames.append(
                    {
                        **head,
                        "available": False,
                        "reason": "No recent observed hotspots to define a candidate set.",
                    }
                )
                continue
            probabilities = frozen["model"].predict_proba(
                pd.DataFrame(features_h)[FEATURES]
            )[:, 1]
            actual = sorted(
                set(
                    eval_obs.loc[
                        (eval_obs.time > cutoff)
                        & (eval_obs.time <= cutoff + pd.Timedelta(hours=horizon)),
                        "cell",
                    ]
                )
            )
            cells = []
            for row, score in zip(features_h, probabilities):
                cell = row["h3_id"]
                lat, lon = h3.cell_to_latlng(cell)
                cells.append(
                    {
                        "h3_id": cell,
                        "horizon": horizon,
                        "score": float(score),
                        "lat": lat,
                        "lon": lon,
                        "geometry": polygon_geometry_from_h3(cell),
                        "recentCount": int(row["local_count"]),
                        "nearestHotspotKm": row["nearest_km"],
                        "weatherAvailableAt": row["weatherAvailableAt"],
                        "weatherMissing": any(not np.isfinite(row[k]) for k in WEATHER),
                        "baselineScores": {
                            "persistence": float(row["local_count"] > 0),
                            "prevalence": float(prevalence[horizon]),
                            "spread": row["spread_heuristic"],
                        },
                    }
                )
            selected = select_top(cells)
            for cell in cells:
                cell["selected"] = cell["h3_id"] in selected
            benchmarks = {}
            for name in pooled[horizon]:
                scored = (
                    cells
                    if name == "model"
                    else [{**c, "score": c["baselineScores"][name]} for c in cells]
                )
                chosen = select_top(scored)
                result = evaluate(scored, actual, chosen)
                benchmarks[name] = result
                pooled[horizon][name].extend(
                    [
                        {
                            "h3_id": c["h3_id"],
                            "score": c["score"],
                            "label": int(c["h3_id"] in actual),
                        }
                        for c in scored
                    ]
                )
                c = counts[horizon][name]
                for dst, src in [
                    ("hits", "hits"),
                    ("selected", "selectedCount"),
                    ("observed", "observedCells"),
                    ("covered", "coveredObservedCells"),
                    ("misses", "misses"),
                    ("falseAlarms", "falseAlarms"),
                    ("outsideCandidateMisses", "outsideCandidateMisses"),
                ]:
                    c[dst] += result[src]
            frames.append(
                {
                    **head,
                    "available": True,
                    "candidateSetId": "h3-"
                    + digest(sorted(c["h3_id"] for c in cells))[:16],
                    "cells": cells,
                    "selectedCells": selected,
                    "actualCells": actual,
                    "actualGeometry": {c: polygon_geometry_from_h3(c) for c in actual},
                    "benchmarks": benchmarks,
                    "toleranceComparison": evaluate(cells, actual, selected, 1),
                }
            )
    aggregate = {}
    for horizon, models in pooled.items():
        aggregate[str(horizon)] = {}
        for name, rows in models.items():
            labels = [r["label"] for r in rows]
            scores = [r["score"] for r in rows]
            count = counts[horizon][name]
            calibration = []
            for lo in np.arange(0, 1, 0.1):
                idx = [
                    i
                    for i, s in enumerate(scores)
                    if lo <= s and (s < lo + 0.1 if lo < 0.89 else s <= 1)
                ]
                if idx:
                    calibration.append(
                        {
                            "meanScore": float(np.mean([scores[i] for i in idx])),
                            "observedFraction": float(
                                np.mean([labels[i] for i in idx])
                            ),
                            "n": len(idx),
                        }
                    )
            aggregate[str(horizon)][name] = {
                **count,
                "n": len(rows),
                "precision": (
                    count["hits"] / count["selected"] if count["selected"] else None
                ),
                "recall": (
                    count["covered"] / count["observed"] if count["observed"] else None
                ),
                "averagePrecision": (
                    float(average_precision_score(labels, scores))
                    if len(set(labels)) == 2
                    else None
                ),
                "brier": float(brier_score_loss(labels, scores)) if rows else None,
                "calibration": calibration,
            }
    payload = {
        "schemaVersion": 2,
        "artifactId": "replay-"
        + digest({"model": model_id, "data": dataset_id, "policy": POLICY})[:16],
        "modelArtifactId": model_id,
        "modelSha256": model_sha,
        "datasetId": dataset_id,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "codeRevision": revision,
        "sourceChecksum": source,
        "model": identity,
        "evaluationPolicy": POLICY,
        "bbox": BBOX,
        "coverage": {"training": train_meta, "evaluation": eval_meta},
        "training": {
            "rows": len(train),
            "cutoffs": sorted(train.cutoff.unique()),
            "lastOutcomeEnd": (
                pd.to_datetime(train.cutoff, utc=True)
                + pd.to_timedelta(train.horizon, unit="h")
            )
            .max()
            .isoformat(),
            "eventEvaluationStart": eval_meta["start"],
            "prevalence": {str(k): float(v) for k, v in prevalence.items()},
        },
        "benchmarks": aggregate,
        "frames": frames,
        "limitations": [
            "January 10–16 is an existing benchmark, not newly unseen evidence. Archive queries were re-acquired completely; this version supersedes the truncated earlier samples.",
            "Only one preceding NSW week trains this small model. Geographic and seasonal generalization are untested.",
            "Satellite hotspot occurrence is affected by sensor sampling, cloud cover and catalogue revisions; no observed hotspot is not proof of no fire.",
            "Weather uses a conservative two-day availability assumption, not verified historical publication timestamps. Missing weather remains missing; no fabricated defaults.",
            "Overlapping forecast windows reuse observations; frame counts are not independent event counts.",
            "Scores are uncalibrated. Calibration is measured on the reserved event; no recalibration or tuning uses that event.",
            "The spread heuristic uses a fixed 128-degree bearing, not a historical wind forecast. Raw intensity was excluded because the legacy download mixed power and temperature units.",
        ],
    }
    (OUTPUT / "replay-v2.json").write_text(
        json.dumps(payload, separators=(",", ":"), allow_nan=False) + "\n"
    )
    train.to_csv(OUTPUT / "training-features.csv", index=False)
    print(
        json.dumps(
            {
                "model": model_id,
                "trainingRows": len(train),
                "availableFrames": sum(f["available"] for f in frames),
                "benchmarks": aggregate,
            },
            indent=2,
        )
    )
    return payload


if __name__ == "__main__":
    generate()
