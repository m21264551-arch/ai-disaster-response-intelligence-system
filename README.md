# AI Disaster Response Intelligence System

This project is a bushfire risk demo for Australia. It combines geospatial features, temporal labels, a trained model, and a React map dashboard so a user can compare predicted hotspot risk with a held-out fire window.

It is a portfolio project only. It is not an official emergency tool and should not be used for operational decisions.

![Dashboard replay with held-out benchmark](docs/dashboard-heldout.jpg)

## What it does

- Builds H3 cell features from hotspot, weather, and exposure data
- Trains 24, 48, and 72 hour hotspot risk models
- Scores a held-out NSW fire window from January 10 to January 16, 2020
- Shows predicted risk, exposed assets, and revealed actual spread in a dashboard
- Ranks response areas with a simple resource allocation layer

## Results

| Evaluation | Model PR-AUC | Baseline PR-AUC | Model Recall at Top 10 percent | Baseline Recall at Top 10 percent |
| --- | ---: | ---: | ---: | ---: |
| Multi-state temporal split | 0.2625 | 0.0493 | 0.5829 | 0.2193 |
| Held-out NSW window | 0.5229 | 0.3580 | 0.4402 | 0.3035 |

The baseline is a wind-aligned spread rule. The model artifact in the repo uses scikit-learn `HistGradientBoostingClassifier`.

## Run locally

```bash
make demo
```

Open `http://127.0.0.1:5173` if the browser does not open automatically.

## Deploy a demo

The repository includes a Vercel path for a read-only demo:

- `frontend/` builds the static dashboard
- `api/index.py` serves the FastAPI app under `/api`
- `VITE_API_BASE_URL=/api` keeps the frontend and API on one origin

```bash
vercel login
vercel --prod
```

Keep `DISASTER_INTEL_MODE=demo` for public deployments.

## Repository map

```text
backend/app/data/          Sample data and held-out artifacts
backend/app/ml/            Feature building, training, metrics, and model artifact
backend/app/services/      Risk, exposure, and allocation services
api/index.py               Vercel FastAPI entrypoint
frontend/                  React and MapLibre dashboard
docs/                      Model card, data notes, system design, and training notes
docker-compose.yml         Optional PostGIS setup
```

## Data scope

The committed data is a bounded sample designed for reproducible review. It includes Digital Earth Australia hotspot rows, Bureau of Meteorology daily station observations, ABS population-grid features, and derived training artifacts. Source and license notes are in `docs/data-sources-and-licenses.md`.

## Useful commands

```bash
make test
make train
make demo
```

Optional heavier paths, including XGBoost, OR-Tools, OSM overlays, and PostGIS, are documented in `docs/training.md`.
