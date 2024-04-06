import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Eye, EyeOff, Flame, Loader2, RadioTower } from "lucide-react";
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
import { AppSidebar, type AppSectionId } from "./components/AppSidebar";
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
const HOTSPOT_LOOKBACK_START = "2020-01-04T00:00:00.000Z";
const METRICS_RUN_ID = "demo-black-summer-v0";
const DEFAULT_BBOX = [148.7, -37.4, 153.8, -31.1];
const HORIZONS: Horizon[] = [24, 48, 72];

export default function App() {
  const [horizon, setHorizon] = useState<Horizon>(24);
  const [activeSection, setActiveSection] = useState<AppSectionId>("operations");
  const [selectedH3Id, setSelectedH3Id] = useState<string | null>(null);
  const [replayTime, setReplayTime] = useState(DEFAULT_START);
  const [replay, setReplay] = useState<ReplayEvent | null>(null);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [allocation, setAllocation] = useState<AllocateResponse | null>(null);
  const [allocationLoading, setAllocationLoading] = useState(false);
  const [allocationError, setAllocationError] = useState<string | null>(null);
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
      setPrediction(null);
      setReveal(null);
      setRevealVisible(false);
      setAllocation(null);
      setAllocationError(null);
      setAllocationLoading(false);

      try {
        const bootstrapData = await api.bootstrap(
          DEFAULT_BBOX,
          replayTime,
          HORIZONS,
          EVENT_ID,
          HOTSPOT_LOOKBACK_START,
          METRICS_RUN_ID,
        );

        if (!isActive) {
          return;
        }

        setReplay(bootstrapData.replay);
        setIncidents(bootstrapData.incidents);
        setPrediction(bootstrapData.prediction);
        setHotspots(bootstrapData.hotspots);
        setMetrics(bootstrapData.metrics);
        setHeldout(bootstrapData.heldout);
        setSelectedH3Id((current) => current ?? bootstrapData.prediction.risk_cells[0]?.h3_id ?? null);
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
  }, [replayTime]);

  useEffect(() => {
    if (!prediction || new Date(prediction.start_time).getTime() !== new Date(replayTime).getTime()) {
      return;
    }

    let isActive = true;
    setAllocation(null);
    setAllocationError(null);
    setAllocationLoading(true);
    setReveal(null);
    setRevealVisible(false);

    api
      .allocate(DEFAULT_BBOX, replayTime, horizon, prediction.prediction_run_id)
      .then((allocationData) => {
        if (isActive) {
          setAllocation(allocationData);
        }
      })
      .catch((loadError) => {
        if (isActive) {
          setAllocationError(loadError instanceof Error ? loadError.message : "Unable to compute allocation");
        }
      })
      .finally(() => {
        if (isActive) {
          setAllocationLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [horizon, prediction, replayTime]);

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

  function handleSectionSelect(section: AppSectionId) {
    setActiveSection(section);
    window.history.replaceState(null, "", `#section-${section}`);
    window.setTimeout(() => scrollSectionIntoView(section), 0);
  }

  function scrollSectionIntoView(section: AppSectionId) {
    const target = document.getElementById(`section-${section}`);
    if (!target) {
      return;
    }
    const top = target.getBoundingClientRect().top + window.scrollY - 18;
    window.scrollTo({ top, behavior: "smooth" });
    const scrollTop = Math.max(0, top);
    if (document.scrollingElement) {
      document.scrollingElement.scrollTop = scrollTop;
    }
    document.documentElement.scrollTop = scrollTop;
    document.body.scrollTop = scrollTop;
  }

  return (
    <div className="app-shell">
      <AppSidebar activeSection={activeSection} onSectionSelect={handleSectionSelect} />
      <main className="workspace">
        <TopBar
          replay={replay}
          status={status}
          incidentCount={incidents.length}
          predictionRunId={prediction?.prediction_run_id}
        />

        <section
          id="section-operations"
          className={
            activeSection === "operations" ? "command-row section-anchor active-section" : "command-row section-anchor"
          }
          aria-label="Prediction controls"
          tabIndex={-1}
        >
          <div className="command-copy">
            <div className="system-mark">
              <RadioTower size={18} />
              AI Disaster-Response Intelligence
            </div>
            <h1>NSW Bushfire Operations Console</h1>
            <p>{timeLabel(replayTime)} prediction cut-off · {horizon}h forecast · future hotspots withheld</p>
          </div>
          <div className="control-cluster">
            <HorizonControl horizon={horizon} horizons={HORIZONS} onChange={setHorizon} />
            <button
              type="button"
              className={revealVisible && reveal ? "reveal-command active" : "reveal-command"}
              onClick={handleRevealToggle}
              aria-pressed={revealVisible}
              aria-label={
                revealLoading
                  ? "Computing reveal"
                  : revealVisible
                    ? "Hide actual spread"
                    : `Reveal actual ${horizon}h spread`
              }
              disabled={revealLoading}
              data-testid="reveal-toggle-primary"
            >
              {revealLoading ? (
                <Loader2 className="spin" size={17} />
              ) : revealVisible ? (
                <EyeOff size={17} />
              ) : (
                <Eye size={17} />
              )}
              {revealLoading ? "Computing" : revealVisible ? "Hide spread" : `Reveal ${horizon}h`}
            </button>
          </div>
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
          <section
            id="section-risk"
            className={activeSection === "risk" ? "dashboard-grid section-anchor active-section" : "dashboard-grid section-anchor"}
            tabIndex={-1}
          >
            <div className="map-region">
              {status === "loading" && (
                <div className="loading-overlay">
                  <Loader2 className="spin" size={22} />
                  Loading replay intelligence
                </div>
              )}
              {prediction ? (
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
              ) : (
                <div className="map-panel map-placeholder" aria-label="Bushfire risk forecast map loading">
                  <Loader2 className="spin" size={24} />
                </div>
              )}
            </div>

            <aside
              id="section-exposure"
              className={activeSection === "exposure" ? "right-rail section-anchor active-section" : "right-rail section-anchor"}
              aria-label="Incident and forecast detail"
              tabIndex={-1}
            >
              <IncidentPanel
                incident={primaryIncident}
                selectedCell={selectedCell ?? null}
                selectedExposure={selectedExposure}
                horizon={horizon}
              />
              <AllocationPanel
                allocation={allocation}
                selectedCell={selectedCell ?? null}
                loading={allocationLoading}
                error={allocationError}
              />
            </aside>
          </section>
        )}

        <section className="bottom-grid">
          <ReplayTimeline
            sectionId="section-pipelines"
            active={activeSection === "pipelines"}
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
          <MetricsStrip sectionId="section-evaluation" active={activeSection === "evaluation"} metrics={metrics} />
          <HeldoutPanel sectionId="section-lineage" active={activeSection === "lineage"} evaluation={heldout} />
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
