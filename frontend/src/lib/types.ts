export type Horizon = 24 | 48 | 72;

export interface Hotspot {
  source: string;
  observed_at: string;
  lat: number;
  lon: number;
  confidence: number;
  intensity: number;
  geometry: GeoJSON.Geometry;
}

export interface Incident {
  id: string;
  name: string;
  status: string;
  alert_level: string;
  started_at: string;
  updated_at: string;
  lat: number;
  lon: number;
  size_hectares: number;
  source: string;
}

export interface FeatureContribution {
  name: string;
  contribution: number;
}

export interface RiskCell {
  h3_id: string;
  horizon_hours: Horizon;
  risk_score: number;
  confidence_low: number;
  confidence_high: number;
  top_features: FeatureContribution[];
  geometry: GeoJSON.Geometry;
  centroid: { lat: number; lon: number };
}

export interface Exposure {
  h3_id: string;
  population: number;
  hospitals: number;
  schools: number;
  major_roads: number;
  shelters: number;
}

export interface PredictionResponse {
  prediction_run_id: string;
  generated_at: string;
  start_time: string;
  bbox: number[];
  risk_cells: RiskCell[];
  exposures: Exposure[];
  model_version: string;
  baseline_version: string;
}

export interface DashboardBootstrapResponse {
  replay: ReplayEvent;
  incidents: Incident[];
  prediction: PredictionResponse;
  hotspots: Hotspot[];
  metrics: ModelMetrics;
  heldout: HeldoutEvaluation;
}

export type RevealStatus = "hit" | "miss" | "false_alarm";

export interface RevealCell {
  h3_id: string;
  status: RevealStatus;
  risk_score: number;
  geometry: GeoJSON.Geometry;
  centroid: { lat: number; lon: number };
}

export interface RevealSummary {
  horizon_hours: Horizon;
  spatial_tolerance_rings: number;
  predicted_cells: number;
  actual_cells: number;
  hits: number;
  misses: number;
  false_alarms: number;
  precision: number;
  recall: number;
  actual_hotspots: number;
}

export interface RevealResponse {
  reveal_run_id: string;
  generated_at: string;
  start_time: string;
  horizon_end: string;
  bbox: number[];
  summary: RevealSummary;
  comparison_cells: RevealCell[];
  actual_hotspots: Hotspot[];
}

export interface Allocation {
  resource_id: string;
  assigned_h3_id: string;
  priority_score: number;
  rationale: string;
  staging_point: string;
  eta_minutes: number;
}

export interface AllocateResponse {
  prediction_run_id: string;
  allocations: Allocation[];
  total_priority_score: number;
  optimizer: string;
}

export interface ReplayEvent {
  event_id: string;
  name: string;
  start_time: string;
  end_time: string;
  region_bbox: number[];
  description: string;
}

export interface Metric {
  name: string;
  model_value: number;
  baseline_value: number;
  unit: string;
  interpretation: string;
}

export interface ModelMetrics {
  model_run_id: string;
  generated_at: string;
  dataset_name?: string | null;
  evaluation_window?: Record<string, unknown> | null;
  evaluation_rows?: number | null;
  positive_rate?: number | null;
  metrics: Metric[];
  confusion_summary: Record<string, number>;
  calibration_bins: Array<{ bin: number; predicted: number; observed: number }>;
}

export interface HeldoutCase {
  h3_id: string;
  prediction_time: string;
  horizon_hours: Horizon;
  model_score: number;
  baseline_score: number;
  rank: number;
  centroid: { lat: number; lon: number };
}

export interface HeldoutEvaluation {
  model_run_id: string;
  generated_at: string;
  metrics: ModelMetrics;
  evaluation_window: Record<string, unknown>;
  case_counts: Record<string, number>;
  cases: {
    missed: HeldoutCase[];
    false_alarms: HeldoutCase[];
    hits: HeldoutCase[];
  };
}
