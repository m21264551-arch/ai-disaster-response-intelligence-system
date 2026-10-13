import type { Polygon } from "geojson";
export type Horizon = 24 | 48 | 72;
export type FrameKey = {
  id: string;
  cutoff: string;
  horizon: Horizon;
  available: boolean;
  reason?: string;
};
export type Scores = {
  precision: number | null;
  recall: number | null;
  averagePrecision: number | null;
  brier: number | null;
  hits: number;
  misses: number;
  falseAlarms: number;
  outsideCandidateMisses: number;
  selectedCount?: number;
  observedCells?: number;
  calibration: { meanScore: number; observedFraction: number; n: number }[];
};
export type Cell = {
  h3_id: string;
  horizon: Horizon;
  score: number;
  selected: boolean;
  lat: number;
  lon: number;
  geometry: Polygon;
  recentCount: number;
  nearestHotspotKm: number;
  weatherAvailableAt: string | null;
  weatherMissing: boolean;
};
export type Study = {
  schemaVersion: number;
  artifactId: string;
  modelArtifactId: string;
  datasetId: string;
  generatedAt: string;
  codeRevision: string;
  frames: FrameKey[];
  benchmarks: Record<string, Record<string, Scores>>;
  limitations: string[];
  training: { rows: number; cutoffs: string[]; lastOutcomeEnd: string };
  coverage: {
    training: { start: string; end: string; rows: number; sha256: string };
    evaluation: { start: string; end: string; rows: number; sha256: string };
  };
};
export type Frame = FrameKey & {
  modelArtifactId: string;
  datasetId: string;
  candidateSetId: string;
  cells: Cell[];
  selectedCells: string[];
};
export type Comparison = {
  h3_id: string;
  status: "hit" | "miss" | "false_alarm";
  geometry: Polygon;
};
export type Reveal = {
  frameId: string;
  modelArtifactId: string;
  datasetId: string;
  candidateSetId: string;
  horizon: Horizon;
  cutoff: string;
  summary: Scores;
  comparisonCells: Comparison[];
  toleranceRings: number;
};
const base = import.meta.env.VITE_API_BASE_URL || "/api";
export async function getStudy(signal: AbortSignal): Promise<Study> {
  const response = await fetch(`${base}/v2/study`, { signal });
  if (!response.ok)
    throw Error(
      "Historical model/data unavailable. Reload or see reproduction instructions.",
    );
  const result = await response.json();
  if (
    result.schemaVersion !== 2 ||
    !result.artifactId ||
    !result.frames?.length
  )
    throw Error("Unsupported or incomplete replay artifact.");
  return result;
}
export async function request<T>(
  route: string,
  study: Study,
  frame: FrameKey,
  signal: AbortSignal,
  tolerance = 0,
): Promise<T> {
  const response = await fetch(`${base}/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      frame_id: frame.id,
      artifact_id: study.artifactId,
      ...(route === "reveal" ? { tolerance_rings: tolerance } : {}),
    }),
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(data.detail || "Unable to load this historical frame");
  if (
    data.modelArtifactId !== study.modelArtifactId ||
    data.datasetId !== study.datasetId ||
    data.horizon !== frame.horizon ||
    data.cutoff !== frame.cutoff
  )
    throw Error("Artifact or horizon mismatch. Reload the study.");
  return data as T;
}
export const downloadURL = `${base}/v2/download`;
