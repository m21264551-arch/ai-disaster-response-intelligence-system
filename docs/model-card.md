# Model Card

## Model

`hist-gradient-bushfire-risk-v1`

This trained model forecasts Australian bushfire risk on H3 cells for 24, 48, and 72-hour horizons. It combines a wind-aligned spread baseline with engineered exposure, infrastructure, hotspot recency, neighborhood activity, real BoM station-weather, and ABS population-grid features.

The repository ships both a trained scikit-learn `HistGradientBoostingClassifier` artifact and a deterministic fallback. The training script also supports optional XGBoost experiments when `backend/requirements-optional.txt` is installed. The FastAPI prediction path automatically uses the trained artifact when `backend/app/ml/artifacts/bushfire_risk_model.joblib` exists.

## Intended Use

- Portfolio demonstration of ML Engineering, geospatial feature engineering, evaluation, and operational dashboard design.
- Historical replay and scenario exploration.
- Not intended for emergency operations, public warning, dispatch, evacuation, or official risk communication.

## Inputs

- Active and historical hotspot observations.
- H3 cell centroid and polygon geometry.
- Recent hotspot intensity and recency.
- Wind-aligned spread assumptions.
- ABS population grid values aggregated to H3 cells, with deterministic fallback for uncovered cells.
- Bureau of Meteorology daily station observations joined by nearest station and last completed observation day.
- Estimated infrastructure counts.
- Optional OpenStreetMap infrastructure overlay when `backend/app/data/osm_infrastructure_sample.csv` exists.
- Forecast horizon: 24, 48, or 72 hours.

## Outputs

- Per-cell risk score from 0 to 1.
- Confidence interval proxy.
- Top feature contributions.
- Exposure overlays and resource-allocation recommendations.

## Training Data

- Source: Digital Earth Australia Hotspots WFS.
- Default compact path: South Coast NSW bbox `149.4,-36.8,151.8,-33.8`, January 4-10, 2020 UTC.
- National-ready path: bounded windows across NSW, VIC, QLD, SA, and WA, spanning November 2019 through January 2020.
- Weather overlay: selected BoM station daily observations from November 2019 through January 2020.
- Exposure overlay: ABS Australian Population Grid aggregated to H3 resolution 5.
- Split: time-ordered train/test split to reduce temporal leakage.

## Evaluation

The API exposes model metrics through `/metrics/{model_run_id}`:

- PR-AUC
- Recall@top-k
- Brier score
- Calibration bins

Current benchmark:

| Metric | Trained model | Wind-aligned baseline |
| --- | ---: | ---: |
| PR-AUC | 0.6849 | 0.0462 |
| Recall@Top-10% | 0.7362 | 0.1166 |
| Brier Score | 0.0246 | 0.4924 |

Held-out benchmark:

- Source: Digital Earth Australia Hotspots WFS.
- Region: wider NSW bbox `148.7,-37.4,153.8,-31.1`.
- Window: January 10-16, 2020 UTC.
- Raw hotspot rows: `25,800`.
- Temporal H3 examples: `5,697`.
- Procedure: freeze `hist-gradient-bushfire-risk-v1`, rebuild features from the held-out window, score without retraining, and compare to the wind-aligned baseline.

| Metric | Frozen model | Wind-aligned baseline |
| --- | ---: | ---: |
| PR-AUC | 0.5017 | 0.3453 |
| Recall@Top-10% | 0.3879 | 0.3005 |
| Brier Score | 0.1163 | 0.4044 |

The held-out failure artifact stores representative top-decile hits, missed future hotspot cells, and false alarms with H3 IDs, scores, ranks, horizons, and centroids. The dashboard exposes those cases through `/heldout/failure-analysis`.

For a production version, the benchmark should be regenerated across many fire seasons and withheld geography/time windows.

## Limitations

- Replay data is deterministic and public-data-style, not an authoritative incident record.
- The included national-ready corpus is bounded and sampled for reproducibility, not a complete census of all Australian fire seasons.
- The held-out benchmark is a single later NSW event window, so it is evidence of generalization, not proof of operational robustness.
- Weather uses historical daily BoM station observations, not live BoM fire-weather forecasts or gridded NWP data.
- Population exposure uses an H3 aggregation of the ABS population grid, with fallback estimates outside the committed sample.
- The allocation optimizer uses deterministic greedy assignment by default and switches to OR-Tools CP-SAT when optional dependencies are installed.
- PostGIS schema is included, but the default demo serves from local fixtures and model artifacts rather than a fully database-backed ingestion pipeline.
- The dashboard is for explaining the system, not for operational emergency use.
