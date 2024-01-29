import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Flame, Loader2, RadioTower } from "lucide-react";
import { api } from "./lib/api";
import type {
  AllocateResponse,
  Exposure,
  HeldoutEvaluation,
  Horizon,
  Hotspot,
  Incident,
  ModelMetrics,
  PredictionResponse,
  RevealResponse,
  ReplayEvent,
  RiskCell,
} from "./lib/types";
import { AllocationPanel } from "./components/AllocationPanel";
import { AppSidebar } from "./components/AppSidebar";
import { EvidenceStrip } from "./components/EvidenceStrip";
import { HeldoutPanel } from "./components/HeldoutPanel";
import { HorizonControl } from "./components/HorizonControl";
import { IncidentPanel } from "./components/IncidentPanel";
import { MetricsStrip } from "./components/MetricsStrip";
import { ReplayTimeline } from "./components/ReplayTimeline";
import { TopBar } from "./components/TopBar";
import { timeLabel } from "./lib/format";

const MapPanel = lazy(() => import("./components/MapPanel").then((module) => ({ default: module.MapPanel })));

const EVENT_ID = "nsw-black-summer-south-coast";
const DEFAULT_START = "2020-01-05T00:00:00.000Z";
const DEFAULT_BBOX = [148.7, -37.4, 153.8, -31.1];
const HORIZONS: Horizon[] = [24, 48, 72];

export default function App() {
  const [horizon, setHorizon] = useState<Horizon>(24);
  const [selectedH3Id, setSelectedH3Id] = useState<string | null>(null);
  const [replayTime, setReplayTime] = useState(DEFAULT_START);
  const [replay, setReplay] = useState<ReplayEvent | null>(null);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [allocation, setAllocation] = useState<AllocateResponse | null>(null);
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [heldout, setHeldout] = useState<HeldoutEvaluation | null>(null);
  const [reveal, setReveal] = useState<RevealResponse | null>(null);
  const [revealVisible, setRevealVisible] = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadDashboard() {
      setStatus("loading");
      setError(null);
      setReveal(null);
      setRevealVisible(false);

      try {
        const [replayData, incidentData, predictionData, hotspotData, metricsData, heldoutData] = await Promise.all([
          api.replay(EVENT_ID),
          api.incidents(),
          api.predict(DEFAULT_BBOX, replayTime, HORIZONS),
          api.hotspots(DEFAULT_BBOX, "2020-01-04T00:00:00.000Z", replayTime),
          api.metrics("demo-black-summer-v0"),
          api.heldout(),
        ]);

        const allocationData = await api.allocate(
          DEFAULT_BBOX,
          replayTime,
          horizon,
          predictionData.prediction_run_id,
        );

        if (!isActive) {
          return;
        }

        setReplay(replayData);
        setIncidents(incidentData);
        setPrediction(predictionData);
        setHotspots(hotspotData);
        setMetrics(metricsData);
        setHeldout(heldoutData);
        setAllocation(allocationData);
        setSelectedH3Id((current) => current ?? predictionData.risk_cells[0]?.h3_id ?? null);
        setStatus("ready");
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard data");
        setStatus("error");
      }
    }

    loadDashboard();

    return () => {
      isActive = false;
    };
  }, [horizon, replayTime]);

  async function handleRevealToggle() {
    if (revealVisible) {
      setRevealVisible(false);
      return;
    }

    if (reveal) {
      setRevealVisible(true);
      return;
    }

    setRevealLoading(true);
    try {
      const revealData = await api.reveal(DEFAULT_BBOX, replayTime, horizon, 36);
      setReveal(revealData);
      setRevealVisible(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to compute reveal mode");
      setStatus("error");
    } finally {
      setRevealLoading(false);
    }
  }

  const riskCells = prediction?.risk_cells ?? [];
  const exposures = prediction?.exposures ?? [];
  const riskCellsForHorizon = useMemo(
    () => riskCells.filter((cell) => cell.horizon_hours === horizon),
    [horizon, riskCells],
  );
  const cellsById = useMemo(() => new Map(riskCells.map((cell) => [cell.h3_id, cell])), [riskCells]);
  const exposureById = useMemo(() => new Map(exposures.map((exposure) => [exposure.h3_id, exposure])), [exposures]);
  const selectedCell = selectedH3Id ? cellsById.get(selectedH3Id) ?? riskCellsForHorizon[0] : riskCellsForHorizon[0];
  const selectedExposure = selectedCell ? exposureById.get(selectedCell.h3_id) ?? null : null;
  const primaryIncident = incidents[0] ?? null;

  return (
    <div className="app-shell">
      <AppSidebar />
      <main className="workspace">
        <TopBar
          replay={replay}
          status={status}
          incidentCount={incidents.length}
          predictionRunId={prediction?.prediction_run_id}
        />

        <section className="command-row" aria-label="Prediction controls">
          <div className="command-copy">
            <div className="system-mark">
              <RadioTower size={18} />
              AI Disaster-Response Intelligence
            </div>
            <h1>NSW Bushfire Operations Console</h1>
            <p>{timeLabel(replayTime)} prediction cut-off · {horizon}h forecast · future hotspots withheld</p>
          </div>
          <HorizonControl horizon={horizon} horizons={HORIZONS} onChange={setHorizon} />
        </section>

        <EvidenceStrip metrics={metrics} heldout={heldout} prediction={prediction} horizon={horizon} />

        {status === "error" ? (
          <div className="error-state" role="alert">
            <AlertTriangle size={28} />
            <div>
              <strong>Backend connection failed</strong>
              <span>{error}</span>
            </div>
          </div>
        ) : (
          <section className="dashboard-grid">
            <div className="map-region">
              {status === "loading" && (
                <div className="loading-overlay">
                  <Loader2 className="spin" size={22} />
                  Loading replay intelligence
                </div>
              )}
              <Suspense
                fallback={
                  <div className="loading-overlay">
                    <Loader2 className="spin" size={22} />
                    Loading map engine
                  </div>
                }
              >
                <MapPanel
                  bbox={replay?.region_bbox ?? DEFAULT_BBOX}
                  horizon={horizon}
                  hotspots={hotspots}
                  riskCells={riskCellsForHorizon}
                  allocations={allocation?.allocations ?? []}
                  reveal={reveal}
                  revealVisible={revealVisible}
                  selectedH3Id={selectedCell?.h3_id ?? null}
                  onSelectCell={setSelectedH3Id}
                />
              </Suspense>
            </div>

            <aside className="right-rail" aria-label="Incident and forecast detail">
              <IncidentPanel
                incident={primaryIncident}
                selectedCell={selectedCell ?? null}
                selectedExposure={selectedExposure}
                horizon={horizon}
              />
              <AllocationPanel allocation={allocation} selectedCell={selectedCell ?? null} />
            </aside>
          </section>
        )}

        <section className="bottom-grid">
          <ReplayTimeline
            replay={replay}
            replayTime={replayTime}
            onReplayTimeChange={setReplayTime}
            observedHotspots={hotspots.length}
            horizon={horizon}
            reveal={reveal}
            revealVisible={revealVisible}
            revealLoading={revealLoading}
            onRevealToggle={handleRevealToggle}
          />
          <MetricsStrip metrics={metrics} />
          <HeldoutPanel evaluation={heldout} />
        </section>

        <footer className="disclaimer">
          <Flame size={16} />
          Not an official emergency tool. Portfolio simulation using public replay data and derived model artifacts.
          <span>
            <BarChart3 size={16} />
            {prediction ? `${prediction.model_version} vs ${prediction.baseline_version}` : "Model benchmark pending"}
          </span>
        </footer>
      </main>
    </div>
  );
}
