# Replay architecture

Offline: paginated DEA observations + saved BoM daily weather → timestamp-based features and purged training cutoffs → frozen model → all candidate scores and observed evaluation → schema-v2 JSON.

Online: FastAPI validates the JSON and model-file checksum → React requests an identified frame → Leaflet and the accessible table display the same cell/horizon scores → reveal retrieves matching observed outcomes. The API performs no fitting or inference.

`backend/app/replay/pipeline.py` owns candidate construction, cutoffs, features, fitting, scoring and export. `artifacts/model.joblib` is the frozen trained model; `replay-v2.json` is its complete saved output. The API does not deserialize the model or perform inference; it checks its SHA256 against the bundle and verifies frame identities and the selection policy. Missing or mismatched artifacts return 503. Stale client artifact requests return 409.

Public schema v2:

- `GET /api/v2/study`: provenance, coverage, frame availability and shared benchmarks.
- `POST /api/dashboard/frame` or `/api/predict`: `{frame_id, artifact_id}`; returns all scores without future outcomes.
- `POST /api/reveal`: same fields plus optional `tolerance_rings` (0 or 1).
- `GET /api/metrics/{artifact_id}`: matching benchmark results.
- `GET /api/v2/download`: complete frozen experiment.
- `GET /api/health`: model/data readiness and identities.

Allocation and current-incident routes are retired from the public contract. `app/legacy_demo.py` and older services remain an **unserved regression harness** for existing fixtures; the production entrypoint never imports or mounts them. React uses AbortController and generation checks to reject late frame/reveal responses. Cell selection is keyed by H3 ID and horizon.

Vercel detects root `index.py`, which exports the app from `api/index.py`, as the FastAPI entrypoint. Preserve request paths: do not rewrite every URL to the Python filename. The build generates `dashboard-static/` from `frontend/`; compiled assets are not checked into Git. Serving requires only FastAPI, Pydantic and Uvicorn. Python 3.12 serves the saved JSON; offline scientific reproduction uses Python 3.11 and the pinned backend requirements.
