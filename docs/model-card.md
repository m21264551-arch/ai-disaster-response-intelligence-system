# Frozen hotspot model card

This card describes the public schema-v2 replay. Earlier artifacts under `app/ml/artifacts` are retained only for legacy regression tests and are not served.

## Data and target

The new public replay uses complete paginated [Digital Earth Australia Hotspots](https://hotspots.dea.ga.gov.au/) archive queries for a fixed NSW bounding box `[148.7, -37.4, 153.8, -31.1]`:

- Training archive: January 4–10, 2020 (exclusive end), **58,007 detections**.
- Reserved event archive: January 10–16, 2020 (exclusive end), **26,129 detections**.

Each CSV has a receipt recording retrieval time, source, query interval, bounding box, matched/downloaded counts for every six-hour chunk, and SHA256. Pagination or checksum failures prevent publication. This replaces the earlier truncated “multi-season” samples, some of which contained less than one day of data despite six-day window labels. January 10–16 remains an **existing benchmark**, not newly unseen evidence; the complete re-acquisition also includes records missing from the earlier download.

The real BoM daily weather snapshot is retained. Raw intensity is excluded because the earlier downloader mixed radiative power and temperature. No population, fabricated infrastructure, allocation, confidence offsets or incident statuses enter the public model or interface.

## Protocol

1. Define candidates identically for training and replay: H3 resolution 5, ring 3 around detections from the preceding 36 hours, with centres inside the fixed NSW bounds and land mask.
2. Build features only after filtering observations to the cutoff. Use local/neighbour counts, distance, local recency, horizon, the spread heuristic and four actual BoM weather fields plus station distance/age.
3. Treat daily weather as available at 00:00 UTC two days after its date. This conservative lag is an explicit assumption; historical publication timestamps are unavailable. Missing weather remains NaN for the model. Finite features are rounded to six decimal places before fitting and scoring (1 mm for distances), preventing CPU-level geometric roundoff from crossing tree thresholds.
4. Keep complete cutoff groups together and purge training cutoffs whose maximum 72-hour outcome window reaches the January 10 evaluation boundary. The model trains on **4,527 cell/horizon rows from three complete cutoffs**; its latest training outcome ends January 9 at 12:00 UTC.
5. Fit histogram gradient boosting with fixed settings: 150 iterations, learning rate 0.055, 15 leaves, L2=0.1, seed 42, no random early-stopping validation or event-based tuning.
6. Reload that serialized model and generate every public frame from it. Every frame carries matching dataset/model/candidate identities.
7. Score all candidates. Select `ceil(0.10 × candidate count)` in descending score order, resolving ties by H3 ID **before** reading outcomes. Display filters never affect metrics.
8. Reveal exact-cell outcomes by default. One-ring matching is a separately labelled secondary metric; the map's statuses stay exact.

Recall includes observed cells outside the candidate area. AP and Brier evaluate all candidates. Metrics pool covered cutoff rows per horizon; overlapping windows reuse observations and are not independent events. Scores are uncalibrated. Calibration is measured, not fitted, on this event.

## Results

| Horizon | Model AP | Persistence AP | Spread heuristic AP | Model Brier | Spread Brier |
|---|---:|---:|---:|---:|---:|
| 24h | 0.562 | 0.438 | 0.596 | 0.099 | 0.190 |
| 48h | 0.556 | 0.481 | 0.626 | 0.144 | 0.303 |
| 72h | 0.547 | 0.507 | 0.649 | 0.180 | 0.385 |

The heuristic ranks better on this event. The model's score magnitudes have better Brier loss than that heuristic, while persistence has better Brier at 48 and 72 hours. At a fixed 10% budget the model still misses many observed cells. These results are shown without claiming an operationally useful forecaster.

## Limitations


One training week and one adjacent event are insufficient for geographic or seasonal generalization. Three training cutoffs are strongly dependent. Archive completeness means complete responses to those queries, not complete physical fire observation: sensors, cloud cover and catalogue revisions affect detections. Zero recorded hotspots is not proof of no fire. The fixed-bearing spread baseline is not a wind forecast. Historical weather release timing is approximated. This is a reproducible inspection tool with explicit failure analysis, not an operations console.
