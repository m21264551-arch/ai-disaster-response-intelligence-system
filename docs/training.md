# Training Workflow

## Data Sources

The default historical training path uses Digital Earth Australia Hotspots WFS because it exposes historical Australian hotspot records without requiring a secret key.

The enriched training path also uses:

- Bureau of Meteorology daily station weather tables for temperature, rainfall, humidity, wind speed, and solar radiation.
- ABS Australian Population Grid GeoTIFF aggregated to H3 cells for exposure features.
- A bounded multi-state DEA corpus across NSW, VIC, QLD, SA, and WA for national-ready model training.

NASA FIRMS is also supported through `backend/scripts/download_firms_hotspots.py`, but the FIRMS Area API requires a free MAP_KEY for generated CSV requests.

## Download DEA Hotspots

```bash
PYTHONPATH=backend .venv/bin/python backend/scripts/download_dea_hotspots.py \
  --start 2020-01-04T00:00:00Z \
  --end 2020-01-10T00:00:00Z \
  --state NSW \
  --bbox 149.4,-36.8,151.8,-33.8 \
  --out backend/app/data/historical_hotspots_sample.csv \
  --page-size 2000 \
  --max-records 20000 \
  --chunk-hours 6
```

The downloader uses six-hour chunks because the DEA WFS endpoint is more reliable for bounded time windows than offset pagination.

## Train

```bash
PYTHONPATH=backend .venv/bin/python backend/scripts/train_bushfire_model.py \
  --input backend/app/data/historical_hotspots_sample.csv \
  --output-dir backend/app/ml/artifacts \
  --dataset-out backend/app/ml/artifacts/training_dataset.csv
```

Outputs:

- `bushfire_risk_model.joblib`
- `feature_schema.json`
- `metrics.json`
- `training_dataset.csv`

Optional XGBoost experiment:

```bash
make install-optional
make train-xgboost
```

This writes the same artifact paths with `model_version` set to `xgboost-bushfire-risk-v1`. The default committed artifact remains the lighter scikit-learn HistGradient model so CI and first-run setup stay fast.

## Real Weather And Population Overlays

Download real BoM station observations:

```bash
make download-bom
```

This writes `backend/app/data/bom_weather_observations_sample.csv` from public BoM daily station tables. Feature generation joins the nearest station observation from the last completed day before the prediction timestamp, which prevents temporal leakage.

Aggregate the ABS population grid to H3:

```bash
make download-abs-population
```

This downloads the ABS Australian Population Grid GeoTIFF and writes `backend/app/data/abs_population_h3_sample.csv`. The exposure service uses these H3 population values when present and falls back to deterministic demo estimates for cells outside the sample.

## Multi-Season National Corpus

Build the bounded multi-state DEA corpus:

```bash
make build-multiseason-corpus
```

Outputs:

- `backend/app/data/multiseason_national_hotspots_sample.csv`
- `backend/app/data/multiseason_national_manifest.json`

The default manifest covers selected fire windows in NSW, VIC, QLD, SA, and WA. Each window is capped and sampled so the corpus is reproducible and laptop-friendly while still proving the data model is national-ready.

Train on the multi-state/multi-season corpus:

```bash
make train-national
```

## Optional OSM Exposure Overlay

The default exposure service uses deterministic geographic heuristics so the demo works offline. To enrich exposure counts with OpenStreetMap hospitals, schools, shelters, and major roads:

```bash
make download-osm
```

This creates `backend/app/data/osm_infrastructure_sample.csv`. When present, the exposure service counts nearby OSM infrastructure within each H3 cell's neighborhood and uses those values to override lower heuristic counts.

## Feature And Label Definition

- Prediction unit: H3 cell and prediction timestamp.
- Horizons: 24, 48, and 72 hours.
- Positive label: the H3 cell receives a hotspot within the forecast horizon.
- Negatives: nearby candidate cells around active fires that do not receive a future hotspot.
- Key features: recent hotspot count, unique active cells, max intensity, mean confidence, hours since last hotspot, nearest fire distance, wind alignment, neighboring activity, baseline risk, ABS/H3 exposure, infrastructure, BoM weather observations, station distance, observation age, month, and hour.

## Current Benchmark

| Metric | Trained model | Wind-aligned baseline |
| --- | ---: | ---: |
| PR-AUC | 0.2625 | 0.0493 |
| Recall@Top-10% | 0.5829 | 0.2193 |
| Brier Score | 0.0240 | 0.4872 |

## Held-Out Evaluation

The held-out benchmark freezes `hist-gradient-bushfire-risk-v1`, downloads a later NSW DEA hotspot window, rebuilds leakage-safe H3-time features, and scores without retraining.

```bash
PYTHONPATH=backend .venv/bin/python backend/scripts/download_dea_hotspots.py \
  --start 2020-01-10T00:00:00Z \
  --end 2020-01-16T00:00:00Z \
  --state NSW \
  --bbox 148.7,-37.4,153.8,-31.1 \
  --out backend/app/data/heldout_hotspots_sample.csv \
  --page-size 5000 \
  --max-records 60000 \
  --chunk-hours 6

PYTHONPATH=backend .venv/bin/python backend/scripts/evaluate_heldout_model.py \
  --input backend/app/data/heldout_hotspots_sample.csv \
  --lookback-hours 36 \
  --step-hours 12 \
  --candidate-ring 3
```

Outputs:

- `heldout_dataset.csv`
- `heldout_predictions.csv`
- `heldout_metrics.json`
- `heldout_failure_analysis.json`

Held-out metrics:

| Metric | Frozen model | Wind-aligned baseline |
| --- | ---: | ---: |
| PR-AUC | 0.5229 | 0.3580 |
| Recall@Top-10% | 0.4402 | 0.3035 |
| Brier Score | 0.1116 | 0.4028 |

The dashboard reads `heldout_failure_analysis.json` through `/heldout/failure-analysis` and shows top hits, worst misses, and false alarms.

## Replay Reveal Evaluation

The dashboard includes a reveal mode for portfolio demos:

1. Pick a replay timestamp and horizon.
2. Generate the model forecast from information available at that time.
3. Click `Reveal actual {horizon}h spread`.
4. The backend compares top predicted H3 cells with actual future hotspot cells using a one-ring H3 spatial tolerance.
5. The map classifies cells as hits, misses, or false alarms.

This turns the benchmark into an inspectable failure-analysis workflow rather than a static metric table.
