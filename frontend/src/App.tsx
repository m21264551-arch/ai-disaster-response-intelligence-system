import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BarChart3, Eye, EyeOff, Flame, Loader2, RadioTower } from "lucide-react";
import { api } from "./lib/api";
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
} from "./lib/types";
import { AllocationPanel } from "./components/AllocationPanel";
import { AppSidebar, type AppSectionId } from "./components/AppSidebar";
import { EvidenceStrip } from "./components/EvidenceStrip";
import { HeldoutPanel } from "./components/HeldoutPanel";
import { HorizonControl } from "./components/HorizonControl";
import { InfoTip } from "./components/InfoTip";
import { IncidentPanel } from "./components/IncidentPanel";
import { MetricsStrip } from "./components/MetricsStrip";
import { REPLAY_STEPS, ReplayTimeline } from "./components/ReplayTimeline";
import { TopBar } from "./components/TopBar";
import { timeLabel } from "./lib/format";

const MapPanel = lazy(() => import("./components/MapPanel").then((module) => ({ default: module.MapPanel })));

const EVENT_ID = "nsw-black-summer-south-coast";
const DEFAULT_START = "2020-01-05T00:00:00.000Z";
const HOTSPOT_LOOKBACK_START = "2020-01-04T00:00:00.000Z";
const METRICS_RUN_ID = "demo-black-summer-v0";
const DEFAULT_BBOX = [148.7, -37.4, 153.8, -31.1];
const HORIZONS: Horizon[] = [24, 48, 72];
let dashboardBootstrapPromise: Promise<DashboardBootstrapResponse> | null = null;

function normalizeReplayTime(value: string) {
  return new Date(value).toISOString();
}

function allocationCacheKey(startTime: string, horizon: Horizon) {
  return `${normalizeReplayTime(startTime)}:${horizon}`;
}

function orderedReplaySteps(anchorTime: string) {
  const activeIndex = Math.max(0, REPLAY_STEPS.findIndex((step) => normalizeReplayTime(step) === normalizeReplayTime(anchorTime)));
  return Array.from({ length: REPLAY_STEPS.length - 1 }, (_value, index) => {
    const nextIndex = (activeIndex + index + 1) % REPLAY_STEPS.length;
    return normalizeReplayTime(REPLAY_STEPS[nextIndex]);
  });
}

function fetchDashboardBootstrap() {
  dashboardBootstrapPromise ??= api
    .bootstrap(DEFAULT_BBOX, DEFAULT_START, HORIZONS, EVENT_ID, HOTSPOT_LOOKBACK_START, METRICS_RUN_ID)
    .catch((loadError) => {
      dashboardBootstrapPromise = null;
      throw loadError;
    });
  return dashboardBootstrapPromise;
}

export default function App() {
  const [horizon, setHorizon] = useState<Horizon>(24);
  const [activeSection, setActiveSection] = useState<AppSectionId>("operations");
  const [selectedH3Id, setSelectedH3Id] = useState<string | null>(null);
  const [replayTime, setReplayTime] = useState(DEFAULT_START);
  const [replay, setReplay] = useState<ReplayEvent | null>(null);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [frameLoading, setFrameLoading] = useState(false);
  const [readyFrameKeys, setReadyFrameKeys] = useState<Set<string>>(() => new Set());
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
  const frameCacheRef = useRef(new Map<string, DashboardFrameResponse>());
  const frameRequestsRef = useRef(new Map<string, Promise<DashboardFrameResponse>>());
  const frameRequestIdRef = useRef(0);
  const allocationCacheRef = useRef(new Map<string, AllocateResponse>());
  const allocationRequestsRef = useRef(new Map<string, Promise<AllocateResponse>>());
  const horizonRef = useRef<Horizon>(horizon);

  useEffect(() => {
    horizonRef.current = horizon;
  }, [horizon]);

  const markFrameReady = useCallback((startTime: string) => {
    const key = normalizeReplayTime(startTime);
    setReadyFrameKeys((current) => {
      if (current.has(key)) {
        return current;
      }
      const next = new Set(current);
      next.add(key);
      return next;
    });
  }, []);

  const cacheReplayFrame = useCallback(
    (startTime: string, frame: DashboardFrameResponse) => {
      const key = normalizeReplayTime(startTime);
      frameCacheRef.current.set(key, frame);
      markFrameReady(key);
    },
    [markFrameReady],
  );

  const fetchReplayFrame = useCallback(
    (startTime: string) => {
      const key = normalizeReplayTime(startTime);
      const cached = frameCacheRef.current.get(key);
      if (cached) {
        return Promise.resolve(cached);
      }

      const existingRequest = frameRequestsRef.current.get(key);
      if (existingRequest) {
        return existingRequest;
      }

      const request = api
        .frame(DEFAULT_BBOX, key, HORIZONS, HOTSPOT_LOOKBACK_START)
        .then((frameData) => {
          cacheReplayFrame(key, frameData);
          return frameData;
        })
        .finally(() => {
          frameRequestsRef.current.delete(key);
        });

      frameRequestsRef.current.set(key, request);
      return request;
    },
    [cacheReplayFrame],
  );

  const fetchAllocation = useCallback((startTime: string, allocationHorizon: Horizon, predictionRunId: string) => {
    const key = allocationCacheKey(startTime, allocationHorizon);
    const cached = allocationCacheRef.current.get(key);
    if (cached) {
      return Promise.resolve(cached);
    }

    const existingRequest = allocationRequestsRef.current.get(key);
    if (existingRequest) {
      return existingRequest;
    }

    const request = api
      .allocate(DEFAULT_BBOX, normalizeReplayTime(startTime), allocationHorizon, predictionRunId)
      .then((allocationData) => {
        allocationCacheRef.current.set(key, allocationData);
        return allocationData;
      })
      .finally(() => {
        allocationRequestsRef.current.delete(key);
      });

    allocationRequestsRef.current.set(key, request);
    return request;
  }, []);

  const prefetchReplayStep = useCallback(
    (startTime: string) => {
      const key = normalizeReplayTime(startTime);
      void fetchReplayFrame(key)
        .then((frameData) => fetchAllocation(key, horizonRef.current, frameData.prediction.prediction_run_id))
        .catch(() => undefined);
    },
    [fetchAllocation, fetchReplayFrame],
  );

  const warmReplayFrames = useCallback(
    async (anchorTime: string) => {
      for (const step of orderedReplaySteps(anchorTime)) {
        try {
          const frameData = await fetchReplayFrame(step);
          void fetchAllocation(step, horizonRef.current, frameData.prediction.prediction_run_id).catch(() => undefined);
        } catch {
          return;
        }
      }
    },
    [fetchAllocation, fetchReplayFrame],
  );

  const applyReplayFrame = useCallback(
    (startTime: string, frame: DashboardFrameResponse) => {
      const key = normalizeReplayTime(startTime);
      const cachedAllocation = allocationCacheRef.current.get(allocationCacheKey(key, horizonRef.current)) ?? null;

      cacheReplayFrame(key, frame);
      setReplayTime(key);
      setPrediction(frame.prediction);
      setHotspots(frame.hotspots);
      setSelectedH3Id((current) => {
        const availableCells = new Set(frame.prediction.risk_cells.map((cell) => cell.h3_id));
        return current && availableCells.has(current) ? current : frame.prediction.risk_cells[0]?.h3_id ?? null;
      });
      setAllocation(cachedAllocation);
      setAllocationError(null);
      setAllocationLoading(!cachedAllocation);
      setReveal(null);
      setRevealVisible(false);
      setRevealLoading(false);
      setFrameLoading(false);
      setStatus("ready");
    },
    [cacheReplayFrame],
  );

  const requestReplayFrame = useCallback(
    (startTime: string) => {
      const key = normalizeReplayTime(startTime);
      frameRequestIdRef.current += 1;
      const requestId = frameRequestIdRef.current;
      const cached = frameCacheRef.current.get(key);

      setReplayTime(key);
      setError(null);

      if (cached) {
        applyReplayFrame(key, cached);
        return;
      }

      setFrameLoading(true);
      setReveal(null);
      setRevealVisible(false);
      setRevealLoading(false);

      fetchReplayFrame(key)
        .then((frameData) => {
          if (frameRequestIdRef.current === requestId) {
            applyReplayFrame(key, frameData);
          }
        })
        .catch((loadError) => {
          if (frameRequestIdRef.current === requestId) {
            setError(loadError instanceof Error ? loadError.message : "Unable to load replay frame");
            setFrameLoading(false);
            setStatus("error");
          }
        });
    },
    [applyReplayFrame, fetchReplayFrame],
  );

  const handleReplayTimeChange = useCallback(
    (startTime: string) => {
      const key = normalizeReplayTime(startTime);
      requestReplayFrame(key);
      void warmReplayFrames(key);
    },
    [requestReplayFrame, warmReplayFrames],
  );

  useEffect(() => {
    let isActive = true;

    async function loadDashboard() {
      setStatus("loading");
      setFrameLoading(false);
      setError(null);
      setPrediction(null);
      setReveal(null);
      setRevealVisible(false);
      setAllocation(null);
      setAllocationError(null);
      setAllocationLoading(false);

      try {
        const bootstrapData = await fetchDashboardBootstrap();

        if (!isActive) {
          return;
        }

        const initialFrame = {
          prediction: bootstrapData.prediction,
          hotspots: bootstrapData.hotspots,
        };
        const initialTime = normalizeReplayTime(bootstrapData.prediction.start_time);

        setReplay(bootstrapData.replay);
        setIncidents(bootstrapData.incidents);
        setMetrics(bootstrapData.metrics);
        setHeldout(bootstrapData.heldout);
        applyReplayFrame(initialTime, initialFrame);
        void warmReplayFrames(initialTime);
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
  }, [applyReplayFrame, warmReplayFrames]);

  useEffect(() => {
    if (!prediction || normalizeReplayTime(prediction.start_time) !== normalizeReplayTime(replayTime)) {
      return;
    }

    let isActive = true;
    const key = allocationCacheKey(replayTime, horizon);
    const cached = allocationCacheRef.current.get(key);
    if (cached) {
      setAllocation(cached);
      setAllocationError(null);
      setAllocationLoading(false);
      return;
    }

    setAllocationError(null);
    setAllocation(null);
    setAllocationLoading(true);
    setReveal(null);
    setRevealVisible(false);

    fetchAllocation(replayTime, horizon, prediction.prediction_run_id)
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
  }, [fetchAllocation, horizon, prediction, replayTime]);

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
            <InfoTip
              label="Reveal spread"
              text="Unhides the future hotspots for this replay and compares them with the forecast."
              placement="left"
            />
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
              {(status === "loading" || frameLoading) && (
                <div className="loading-overlay">
                  <Loader2 className="spin" size={22} />
                  {status === "loading" ? "Loading replay intelligence" : "Loading replay frame"}
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
            onReplayTimeChange={handleReplayTimeChange}
            onPrefetchStep={prefetchReplayStep}
            readySteps={readyFrameKeys}
            frameLoading={frameLoading}
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
