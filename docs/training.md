# Reproduce the public replay

The supported public pipeline is `app.replay.pipeline`, invoked by `make replay`. Older training/download commands are legacy experiments; their outputs do not drive the website.

Python 3.11 and Node 20:

```sh
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
npm --prefix frontend ci
make replay                 # regenerate from committed snapshots, no network needed
make test
make build
cd frontend
npx playwright install chromium
PYTHON=../.venv/bin/python npm run test:browser
```

For local browsing, run `PYTHONPATH=.:backend .venv/bin/python -m uvicorn api.index:app --port 8008`, then `npm --prefix frontend run dev`. Vite proxies `/api` to that server.

Optional explicit archive refresh:

```sh
PYTHONPATH=backend .venv/bin/python backend/scripts/download_replay_corpus.py \
  --start 2020-01-04T00:00:00Z --end 2020-01-10T00:00:00Z \
  --out backend/app/data/replay_training_dea.csv
PYTHONPATH=backend .venv/bin/python backend/scripts/download_replay_corpus.py \
  --start 2020-01-10T00:00:00Z --end 2020-01-16T00:00:00Z \
  --out backend/app/data/replay_evaluation_dea.csv
make replay
```

Deploy code and matching frozen artifacts together. Prior Git revisions retain the old code/data/model for rollback. Existing Vercel/custom-domain hosting remains.

Tests cover timestamp-group isolation and embargo, future-observation independence, weather cutoff rules, outcome-independent budgets, serialized-model score reproduction, artifact mismatch rejection, coverage states, public route retirement, horizon selection and stale-response rejection. Existing download, land-mask and security tests remain. The previous backend collection failure is fixed by invoking `PYTHONPATH=.:backend python -m pytest`, which makes `api.index` importable without weakening assertions.

## Training and evaluation boundary

1. Define candidates identically for training and replay: H3 resolution 5, ring 3 around detections from the preceding 36 hours, with centres inside the fixed NSW bounds and land mask.
2. Build features only after filtering observations to the cutoff. Use local/neighbour counts, distance, local recency, horizon, the spread heuristic and four actual BoM weather fields plus station distance/age.
3. Treat daily weather as available at 00:00 UTC two days after its date. This conservative lag is an explicit assumption; historical publication timestamps are unavailable. Missing weather remains NaN for the model. Finite features are rounded to six decimal places before fitting and scoring (1 mm for distances), preventing CPU-level geometric roundoff from crossing tree thresholds.
4. Keep complete cutoff groups together and purge training cutoffs whose maximum 72-hour outcome window reaches the January 10 evaluation boundary. The model trains on **4,527 cell/horizon rows from three complete cutoffs**; its latest training outcome ends January 9 at 12:00 UTC.
5. Fit histogram gradient boosting with fixed settings: 150 iterations, learning rate 0.055, 15 leaves, L2=0.1, seed 42, no random early-stopping validation or event-based tuning.
6. Reload that serialized model and generate every public frame from it. Every frame carries matching dataset/model/candidate identities.
7. Score all candidates. Select `ceil(0.10 × candidate count)` in descending score order, resolving ties by H3 ID **before** reading outcomes. Display filters never affect metrics.
8. Reveal exact-cell outcomes by default. One-ring matching is a separately labelled secondary metric; the map's statuses stay exact.

Recall includes observed cells outside the candidate area. AP and Brier evaluate all candidates. Metrics pool covered cutoff rows per horizon; overlapping windows reuse observations and are not independent events. Scores are uncalibrated. Calibration is measured, not fitted, on this event.
