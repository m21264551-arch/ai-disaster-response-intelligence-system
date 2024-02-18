# Demo Video Script

Use this for a 60-90 second portfolio recording.

## Setup

```bash
make demo
```

Open `http://127.0.0.1:5173` if the browser does not open automatically.

## Voiceover

**0-10s**

"This is an AI disaster-response intelligence system for Australian bushfire replay. It forecasts 24, 48, and 72-hour hotspot risk on H3 grid cells before future hotspots are revealed."

**10-25s**

"The model is trained on a five-state Digital Earth Australia hotspot corpus, enriched with Bureau of Meteorology station weather observations and ABS population-grid exposure features."

**25-40s**

"Here I can switch forecast horizons and inspect high-risk cells, exposed population, hospitals, schools, major roads, and model confidence."

**40-60s**

"Now I reveal the actual future spread. The dashboard classifies forecasted cells as hits, misses, or false alarms, so the demo is not just a heatmap. It shows model behavior against hidden future observations."

**60-75s**

"The allocation layer ranks cells by risk, exposed population, infrastructure weight, and distance constraints, then recommends where limited crews and supplies should go."

**75-90s**

"The backend exposes FastAPI contracts for incidents, hotspots, prediction, allocation, replay, metrics, and held-out failure analysis. The whole project is reproducible locally with public data and includes tests, model artifacts, and documented limitations."

## Visual Beats

1. Start on the full dashboard with the map visible.
2. Click `48h`, then `72h`.
3. Click a high-risk cell on the map.
4. Show the incident/exposure panel.
5. Click `Reveal actual 72h spread`.
6. Pause on hits, misses, and false alarms.
7. Show the held-out event panel.
8. Show the allocation recommendations.
9. End on the README metrics table or GitHub repo page.

## CV Line

Built an AI disaster-response intelligence system for Australian bushfires using FastAPI, H3, scikit-learn, BoM weather observations, ABS population-grid exposure overlays, and React/MapLibre; trained 24/48/72-hour geospatial risk models on a five-state public hotspot corpus and improved held-out PR-AUC from `0.3580` to `0.5229` over a wind-aligned baseline.
