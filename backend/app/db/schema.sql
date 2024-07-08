CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS hotspots (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,
    intensity DOUBLE PRECISION NOT NULL,
    geometry GEOMETRY(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS hotspots_observed_at_idx ON hotspots (observed_at);
CREATE INDEX IF NOT EXISTS hotspots_geom_idx ON hotspots USING GIST (geometry);

CREATE TABLE IF NOT EXISTS risk_cells (
    id BIGSERIAL PRIMARY KEY,
    prediction_run_id TEXT NOT NULL,
    h3_id TEXT NOT NULL,
    horizon_hours INTEGER NOT NULL,
    risk_score DOUBLE PRECISION NOT NULL,
    confidence_low DOUBLE PRECISION NOT NULL,
    confidence_high DOUBLE PRECISION NOT NULL,
    top_features JSONB NOT NULL,
    geometry GEOMETRY(Polygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS risk_cells_run_idx ON risk_cells (prediction_run_id);
CREATE INDEX IF NOT EXISTS risk_cells_geom_idx ON risk_cells USING GIST (geometry);

CREATE TABLE IF NOT EXISTS allocations (
    id BIGSERIAL PRIMARY KEY,
    prediction_run_id TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    assigned_h3_id TEXT NOT NULL,
    priority_score DOUBLE PRECISION NOT NULL,
    rationale TEXT NOT NULL
);

