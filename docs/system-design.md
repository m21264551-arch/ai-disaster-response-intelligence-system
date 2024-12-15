# System Design

## Components

- FastAPI backend serving incidents, hotspots, prediction, allocation, replay, and metrics contracts.
- H3-based feature layer for grid-cell prediction and geometry rendering.
- Deterministic NSW bushfire replay for offline demo reliability.
- Leaflet React dashboard for risk, hotspots, resource allocations, timeline replay, and model evaluation.
- PostGIS schema and Docker Compose service for production-style geospatial persistence.

## Data Flow

1. Data adapters normalize public fire, weather, incident, population, and infrastructure signals.
2. Hotspots are joined to H3 cells and filtered by prediction time to avoid temporal leakage.
3. Risk scoring generates per-horizon `RiskCell` outputs with geometry and feature explanations.
4. Exposure scoring estimates population and infrastructure at risk.
5. Allocation ranks cells by risk, exposure, and infrastructure weight, then assigns limited resources.
6. Reveal mode compares top predicted cells with future replay hotspots to classify hits, misses, and false alarms.
7. The frontend renders all outputs as typed dashboard layers and panels.

## Next Production Step

Expand evaluation from the included multi-state training corpus and single held-out NSW window to multiple held-out fire seasons, regions, and weather regimes. Keep the current API contracts unchanged so the dashboard, reveal workflow, and allocation layer do not need rewrites.
