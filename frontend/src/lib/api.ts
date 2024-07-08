import type {
  AllocateResponse,
  DashboardBootstrapResponse,
  DashboardFrameResponse,
  HeldoutEvaluation,
  Horizon,
  Hotspot,
  Incident,
  ModelMetrics,
  PredictionResponse,
  RevealResponse,
  ReplayEvent,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  bootstrap: (
    bbox: number[],
    startTime: string,
    horizons: Horizon[],
    eventId: string,
    hotspotStart: string,
    metricsModelRunId: string,
  ) =>
    request<DashboardBootstrapResponse>("/dashboard/bootstrap", {
      method: "POST",
      body: JSON.stringify({
        bbox,
        start_time: startTime,
        horizons,
        event_id: eventId,
        hotspot_start: hotspotStart,
        metrics_model_run_id: metricsModelRunId,
      }),
    }),
  frame: (bbox: number[], startTime: string, horizons: Horizon[], hotspotStart: string) =>
    request<DashboardFrameResponse>("/dashboard/frame", {
      method: "POST",
      body: JSON.stringify({
        bbox,
        start_time: startTime,
        horizons,
        hotspot_start: hotspotStart,
      }),
    }),
  incidents: () => request<Incident[]>("/incidents/current"),
  replay: (eventId: string) => request<ReplayEvent>(`/replays/${eventId}`),
  metrics: (modelRunId: string) => request<ModelMetrics>(`/metrics/${modelRunId}`),
  heldout: () => request<HeldoutEvaluation>("/heldout/failure-analysis"),
  hotspots: (bbox: number[], start: string, end: string) =>
    request<Hotspot[]>(
      `/hotspots?bbox=${bbox.join(",")}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    ),
  predict: (bbox: number[], startTime: string, horizons: Horizon[]) =>
    request<PredictionResponse>("/predict", {
      method: "POST",
      body: JSON.stringify({ bbox, start_time: startTime, horizons }),
    }),
  reveal: (bbox: number[], startTime: string, horizon: Horizon, predictionBudget = 36) =>
    request<RevealResponse>("/reveal", {
      method: "POST",
      body: JSON.stringify({
        bbox,
        start_time: startTime,
        horizon_hours: horizon,
        prediction_budget: predictionBudget,
        spatial_tolerance_rings: 1,
      }),
    }),
  allocate: (
    bbox: number[],
    startTime: string,
    horizon: Horizon,
    predictionRunId: string,
    crews = 5,
    supplies = 3,
  ) =>
    request<AllocateResponse>("/allocate", {
      method: "POST",
      body: JSON.stringify({
        prediction_run_id: predictionRunId,
        bbox,
        start_time: startTime,
        horizon_hours: horizon,
        crews,
        supplies,
        max_distance_km: 220,
      }),
    }),
};
