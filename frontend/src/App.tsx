import HowToUse from "./components/HowToUse";
import { useEffect, useRef, useState } from "react";
import { ForecastMap } from "./components/ForecastMap";
import {
  getStudy,
  request,
  downloadURL,
  type Frame,
  type Study,
  type Reveal,
  type Horizon,
  type Scores,
} from "./lib/replay";

const timestamp = (s: string) =>
  new Date(s).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }) + " UTC";
const percent = (v: number | null | undefined) =>
  v == null ? "Undefined" : `${(v * 100).toFixed(1)}%`;
const fixed = (v: number | null) => (v == null ? "Undefined" : v.toFixed(3));
const names: Record<string, string> = {
  model: "Frozen gradient boosting",
  persistence: "Recent-cell persistence",
  prevalence: "Training prevalence",
  spread: "Fixed-bearing spread heuristic",
};

function ScoreTable({ scores }: { scores: Record<string, Scores> }) {
  return (
    <div
      className="table-wrap"
      role="region"
      aria-label="Model and baseline metrics"
      tabIndex={0}
    >
      <table>
        <thead>
          <tr>
            {[
              "Method",
              "Precision ↑",
              "Recall ↑",
              "AP ↑",
              "Brier ↓",
              "False alarms",
              "Misses",
            ].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(scores).map(([key, s]) => (
            <tr key={key}>
              <th scope="row">{names[key]}</th>
              <td>{percent(s.precision)}</td>
              <td>{percent(s.recall)}</td>
              <td>{fixed(s.averagePrecision)}</td>
              <td>{fixed(s.brier)}</td>
              <td>{s.falseAlarms}</td>
              <td>{s.misses}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const [study, setStudy] = useState<Study | null>(null),
    [loadError, setLoadError] = useState(""),
    [reload, setReload] = useState(0);
  const [timeIndex, setTimeIndex] = useState(0),
    [horizon, setHorizon] = useState<Horizon>(24),
    [frame, setFrame] = useState<Frame | null>(null),
    [frameError, setFrameError] = useState("");
  const [revealed, setRevealed] = useState<Reveal | null>(null),
    [revealError, setRevealError] = useState(""),
    [revealing, setRevealing] = useState(false),
    [tolerance, setTolerance] = useState<0 | 1>(0);
  const [selected, setSelected] = useState<string | null>(null),
    [filter, setFilter] = useState("all"),
    [view, setView] = useState("replay"),
    [surface, setSurface] = useState("map");
  const revealSequence = useRef(0);
  const generation = useRef(0),
    revealController = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoadError("");
    getStudy(controller.signal)
      .then(setStudy)
      .catch((e) => {
        if (e.name !== "AbortError") setLoadError(e.message);
      });
    return () => controller.abort();
  }, [reload]);
  const times = [...new Set(study?.frames.map((f) => f.cutoff) || [])];
  const key = study?.frames.find(
    (f) => f.cutoff === times[timeIndex] && f.horizon === horizon,
  );
  useEffect(() => {
    const token = ++generation.current,
      controller = new AbortController();
    revealController.current?.abort();
    setRevealed(null);
    setRevealError("");
    setRevealing(false);
    setFrame(null);
    setFrameError("");
    setSelected(null);
    setTolerance(0);
    setFilter("all");
    if (study && key?.available)
      request<Frame>("dashboard/frame", study, key, controller.signal)
        .then((data) => {
          if (token === generation.current) {
            setFrame(data);
            setSelected(data.selectedCells[0] || null);
          }
        })
        .catch((e) => {
          if (e.name !== "AbortError" && token === generation.current)
            setFrameError(e.message);
        });
    return () => {
      controller.abort();
      revealController.current?.abort();
    };
  }, [study, key?.id]);
  const currentFrame = frame?.id === key?.id ? frame : null;
  const currentReveal = revealed?.frameId === key?.id ? revealed : null;
  async function revealOutcomes(rings: 0 | 1 = tolerance) {
    if (!study || !key || !currentFrame) return;
    revealController.current?.abort();
    const controller = new AbortController();
    revealController.current = controller;
    const token = generation.current,
      requestNumber = ++revealSequence.current;
    setRevealing(true);
    setRevealError("");
    try {
      const data = await request<Reveal>(
        "reveal",
        study,
        key,
        controller.signal,
        rings,
      );
      if (
        token === generation.current &&
        requestNumber === revealSequence.current &&
        !controller.signal.aborted
      ) {
        setRevealed(data);
        if (!currentReveal) setFilter("all");
        setTolerance(rings);
      }
    } catch (e) {
      if (
        e instanceof Error &&
        e.name !== "AbortError" &&
        token === generation.current &&
        requestNumber === revealSequence.current
      )
        setRevealError(e.message);
    } finally {
      if (
        token === generation.current &&
        requestNumber === revealSequence.current
      )
        setRevealing(false);
    }
  }
  const cell = currentFrame?.cells.find(
    (c) => `${c.h3_id}:${c.horizon}` === `${selected}:${horizon}`,
  );
  const statuses = new Map(
    currentReveal?.comparisonCells.map((c) => [c.h3_id, c.status]) || [],
  );
  const allIds = [
    ...new Set([
      ...(currentFrame?.cells.map((c) => c.h3_id) || []),
      ...(currentReveal?.comparisonCells.map((c) => c.h3_id) || []),
    ]),
  ];
  const listed = allIds
    .filter((id) =>
      filter === "all"
        ? !currentReveal || statuses.has(id)
        : filter === "selected"
          ? currentFrame?.selectedCells.includes(id)
          : statuses.get(id) === filter,
    )
    .sort(
      (a, b) =>
        (currentFrame?.cells.find((c) => c.h3_id === b)?.score || 0) -
        (currentFrame?.cells.find((c) => c.h3_id === a)?.score || 0),
    );
  const outcomeNames: Record<string, string> = {
    hit: "Hit",
    miss: "Miss",
    false_alarm: "False alarm",
  };
  const outcomeCounts = { hit: 0, miss: 0, false_alarm: 0 };
  currentReveal?.comparisonCells.forEach((c) => {
    outcomeCounts[c.status]++;
  });
  const changeFilter = (value: string) => {
    setFilter(value);
    if (
      selected &&
      value !== "all" &&
      (value === "selected"
        ? !currentFrame?.selectedCells.includes(selected)
        : statuses.get(selected) !== value)
    )
      setSelected(null);
  };
  return (
    <>
      <header>
        <a href="/" className="brand">
          NSW Hotspot Replay
        </a>
        <span className="mode">Historical replay · uncalibrated scores</span>
        <nav aria-label="Project links">
          <a href="#how-to-use">How to use</a>
          <a href="https://github.com/m21264551-arch/ai-disaster-response-intelligence-system">
            Code ↗
          </a>
          <a href="https://m21264551.com">Portfolio ↗</a>
        </nav>
      </header>
      <main id="tool" tabIndex={-1}>
        <h1>
          Compare hotspot forecasts with satellite observations from January
          2020.
        </h1>
        {loadError ? (
          <section role="alert">
            <h2>Replay unavailable</h2>
            <p>{loadError}</p>
            <button onClick={() => setReload((v) => v + 1)}>
              Reload study
            </button>
          </section>
        ) : !study ? (
          <p role="status">Loading replay…</p>
        ) : (
          <>
            <nav className="views" aria-label="Study views">
              <button
                aria-pressed={view === "replay"}
                onClick={() => setView("replay")}
              >
                Replay
              </button>
              <button
                aria-pressed={view === "evaluation"}
                onClick={() => setView("evaluation")}
              >
                Results
              </button>
              <button
                aria-pressed={view === "method"}
                onClick={() => setView("method")}
              >
                Data and method
              </button>
            </nav>
            {view === "replay" && (
              <>
                <div className="timeline">
                  <label>
                    Historical cutoff
                    <select
                      value={timeIndex}
                      onChange={(e) => setTimeIndex(+e.target.value)}
                    >
                      {times.map((time, i) => (
                        <option value={i} key={time}>
                          {timestamp(time)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="timeline-range">
                    Move through the event
                    <input
                      type="range"
                      min="0"
                      max={Math.max(0, times.length - 1)}
                      value={timeIndex}
                      onChange={(e) => setTimeIndex(+e.target.value)}
                    />
                  </label>
                  <label>
                    Forecast horizon
                    <select
                      value={horizon}
                      onChange={(e) => setHorizon(+e.target.value as Horizon)}
                    >
                      {[24, 48, 72].map((h) => (
                        <option key={h} value={h}>
                          {h} hours
                        </option>
                      ))}
                    </select>
                  </label>
                  {currentFrame && (
                    <div className="reveal-action">
                      <span>
                        Top 10% selected · {currentFrame.selectedCells.length}{" "}
                        cells
                      </span>
                      <button
                        className="primary"
                        onClick={() => {
                          if (currentReveal) {
                            setRevealed(null);
                            setSelected(currentFrame.selectedCells[0] || null);
                            setFilter("all");
                            setTolerance(0);
                          } else revealOutcomes();
                        }}
                        disabled={revealing}
                      >
                        {revealing
                          ? "Loading outcomes…"
                          : currentReveal
                            ? "Hide observations"
                            : "Show observations"}
                      </button>
                    </div>
                  )}
                </div>
                {!key?.available ? (
                  <section className="unavailable" role="status">
                    <h2>Observation coverage unavailable</h2>
                    <p>
                      {key?.reason || "This cutoff/horizon is unavailable."}
                    </p>
                    <button
                      onClick={() => {
                        setTimeIndex(0);
                        setHorizon(24);
                      }}
                    >
                      Return to first available forecast
                    </button>
                  </section>
                ) : frameError ? (
                  <section role="alert">
                    <h2>Frame unavailable</h2>
                    <p>{frameError}</p>
                    <button onClick={() => setReload((v) => v + 1)}>
                      Reload study
                    </button>
                  </section>
                ) : !currentFrame ? (
                  <p role="status">Loading historical forecast…</p>
                ) : (
                  <>
                    <div className="replay-layout">
                      {currentReveal && (
                        <section
                          className="outcome-summary"
                          aria-label="Exact-cell outcomes"
                          aria-live="polite"
                        >
                          {(["hit", "false_alarm", "miss"] as const).map(
                            (status) => (
                              <div key={status} className={status}>
                                <strong>{outcomeCounts[status]}</strong>
                                <span>
                                  {status === "hit"
                                    ? "Hits"
                                    : status === "miss"
                                      ? "Misses"
                                      : "False alarms"}
                                </span>
                              </div>
                            ),
                          )}
                          <p>
                            Exact cells · all outcomes
                            <br />
                            Filters change the view only.
                          </p>
                        </section>
                      )}
                      <section className="map-section">
                        <div className="map-heading">
                          <h2>
                            {currentReveal
                              ? "Forecast versus observed"
                              : "Forecast at the cutoff"}
                          </h2>
                          <span>
                            +{horizon}h · {currentFrame.cells.length} candidate
                            cells
                          </span>
                        </div>
                        <div className="result-controls">
                          <div
                            className="surface-switch"
                            role="group"
                            aria-label="Result view"
                          >
                            <button
                              aria-pressed={surface === "map"}
                              onClick={() => setSurface("map")}
                            >
                              Map
                            </button>
                            <button
                              aria-pressed={surface === "table"}
                              onClick={() => setSurface("table")}
                            >
                              Table
                            </button>
                          </div>
                          <label>
                            Show cells
                            <select
                              value={filter}
                              onChange={(e) => changeFilter(e.target.value)}
                            >
                              <option value="all">
                                {currentReveal
                                  ? "All outcomes"
                                  : "All candidates"}
                              </option>
                              {currentReveal ? (
                                <>
                                  <option value="hit">Hits</option>
                                  <option value="miss">Misses</option>
                                  <option value="false_alarm">
                                    False alarms
                                  </option>
                                </>
                              ) : (
                                <option value="selected">
                                  Selected predictions
                                </option>
                              )}
                            </select>
                          </label>
                        </div>
                        <div hidden={surface !== "map"}>
                          <ForecastMap
                            frame={currentFrame}
                            reveal={currentReveal}
                            selected={selected}
                            visibleIds={listed}
                            onSelect={setSelected}
                          />
                          <div className="legend">
                            {currentReveal ? (
                              <>
                                <span>● Hit</span>
                                <span>┄ Miss: dashed outline</span>
                                <span>⋯ False alarm: dotted outline</span>
                              </>
                            ) : (
                              <>
                                <span>Light → dark: higher score</span>
                                <span>Heavy border: selected top 10%</span>
                                <span>
                                  Maximum score{" "}
                                  {fixed(
                                    Math.max(
                                      ...currentFrame.cells.map((c) => c.score),
                                    ),
                                  )}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {surface === "table" && (
                          <section className="cells-table">
                            <div className="section-heading">
                              <h2>Cell results</h2>
                            </div>
                            <p className="small">
                              {listed.length} rows. Filters do not change
                              evaluation.
                            </p>
                            <div
                              className="table-wrap cell-scroll"
                              tabIndex={0}
                              role="region"
                              aria-label="Inspectable cell results"
                            >
                              <table>
                                <thead>
                                  <tr>
                                    <th>H3 cell</th>
                                    <th>Score at +{horizon}h</th>
                                    <th>Selected?</th>
                                    <th>Observed comparison</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {listed.map((id) => {
                                    const c = currentFrame.cells.find(
                                      (v) => v.h3_id === id,
                                    );
                                    return (
                                      <tr
                                        key={`${id}:${horizon}`}
                                        aria-selected={selected === id}
                                      >
                                        <th scope="row">
                                          <button
                                            onClick={() => setSelected(id)}
                                            aria-label={`Inspect cell ${id}`}
                                          >
                                            {id}
                                          </button>
                                        </th>
                                        <td>
                                          {c
                                            ? `Score ${fixed(c.score)}`
                                            : "Not scored"}
                                        </td>
                                        <td>{c?.selected ? "Yes" : "No"}</td>
                                        <td>
                                          {currentReveal
                                            ? statuses
                                                .get(id)
                                                ?.replace("_", " ") ||
                                              "No detection / not selected"
                                            : "Not revealed"}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </section>
                        )}
                      </section>
                      <aside>
                        {revealError && <p role="alert">{revealError}</p>}
                        <section className="cell-details" aria-live="polite">
                          <h3>Selected cell</h3>
                          {!selected ? (
                            <p>Select a cell on the map or in the table.</p>
                          ) : (
                            <>
                              <p className="cell-outcome">
                                {currentReveal
                                  ? outcomeNames[
                                      statuses.get(selected) || ""
                                    ] || "No observed detection"
                                  : cell?.selected
                                    ? "Top 10% selected"
                                    : "Outside top 10%"}
                              </p>
                              <p className="cell-score">
                                {cell
                                  ? `Score ${fixed(cell.score)}`
                                  : "Not scored"}
                              </p>
                              <p className="small">
                                Uncalibrated score · +{horizon}h
                              </p>
                              {currentReveal && cell && (
                                <p>
                                  {cell.selected
                                    ? "Selected at the cutoff."
                                    : "Not selected at the cutoff."}
                                </p>
                              )}
                              {!cell && (
                                <p>
                                  This observed cell is outside the candidate
                                  set. It counts as a miss and has no model
                                  score.
                                </p>
                              )}
                              <details>
                                <summary>Cell details</summary>
                                <code>{selected}</code>
                                {cell && (
                                  <>
                                    <dl>
                                      <dt>Recent detections</dt>
                                      <dd>{cell.recentCount}</dd>
                                      <dt>Nearest observed hotspot</dt>
                                      <dd>
                                        {cell.nearestHotspotKm.toFixed(1)} km
                                      </dd>
                                    </dl>
                                    <p className="small">
                                      {cell.weatherMissing
                                        ? "Weather has missing features; no synthetic values were inserted."
                                        : `Weather available under the study's lag rule: ${cell.weatherAvailableAt ? timestamp(cell.weatherAvailableAt) : "unavailable"}.`}
                                    </p>
                                  </>
                                )}
                              </details>
                            </>
                          )}
                        </section>
                        {currentReveal && (
                          <details className="advanced-comparison">
                            <summary>Advanced comparison</summary>
                            <label className="tolerance">
                              Metric matching
                              <select
                                value={tolerance}
                                disabled={revealing}
                                onChange={(e) =>
                                  revealOutcomes(+e.target.value as 0 | 1)
                                }
                              >
                                <option value="0">Exact cell (primary)</option>
                                <option value="1">
                                  Within one ring (secondary)
                                </option>
                              </select>
                            </label>
                            <dl>
                              <dt>Precision</dt>
                              <dd>
                                {percent(currentReveal.summary.precision)}
                              </dd>
                              <dt>Recall</dt>
                              <dd>{percent(currentReveal.summary.recall)}</dd>
                            </dl>
                            <p className="small">
                              The map, table and counts above always use exact
                              cells. One-ring matching can reuse observations;
                              its precision and recall are a secondary
                              comparison.
                            </p>
                          </details>
                        )}
                      </aside>
                    </div>
                  </>
                )}
              </>
            )}
            {view === "evaluation" && (
              <>
                <h2>Evaluation results</h2>
                <p>
                  January 10–16 was already used by an earlier benchmark. This
                  is a corrected reconstruction, not newly unseen evidence.
                  Metrics below pool all covered cutoffs separately by horizon,
                  keeping every candidate.
                </p>
                <label className="evaluation-horizon">
                  Evaluation horizon
                  <select
                    value={horizon}
                    onChange={(e) => setHorizon(+e.target.value as Horizon)}
                  >
                    {[24, 48, 72].map((h) => (
                      <option key={h} value={h}>
                        {h} hours
                      </option>
                    ))}
                  </select>
                </label>
                <ScoreTable scores={study.benchmarks[horizon]} />
                <p className="small">
                  AP and Brier use all candidate cells. Recall includes observed
                  cells outside the candidate set. Precision/recall use a
                  separate top-10% selection for each method at each cutoff.
                  Overlapping horizons repeat observations and are not
                  independent trials. Persistence is 1 for a cell with a recent
                  detection; prevalence is learned only from eligible training
                  labels.
                </p>
                <div className="calibration-section">
                  <section>
                    <h3>Calibration of the frozen model · +{horizon}h</h3>
                    <svg
                      viewBox="0 0 430 330"
                      role="img"
                      aria-label="Calibration: mean model score versus observed fraction, dashed diagonal shows agreement"
                    >
                      <line
                        x1="50"
                        y1="280"
                        x2="380"
                        y2="25"
                        stroke="#889095"
                        strokeDasharray="5 5"
                      />
                      <line x1="50" y1="25" x2="50" y2="280" stroke="#52626c" />
                      <line
                        x1="50"
                        y1="280"
                        x2="380"
                        y2="280"
                        stroke="#52626c"
                      />
                      {[0, 0.5, 1].map((n) => (
                        <g key={n}>
                          <text x={50 + 330 * n} y="302" textAnchor="middle">
                            {n}
                          </text>
                          <text x="36" y={285 - 255 * n} textAnchor="end">
                            {n}
                          </text>
                        </g>
                      ))}
                      {study.benchmarks[horizon].model.calibration.map(
                        (p, i) => (
                          <circle
                            key={i}
                            cx={50 + 330 * p.meanScore}
                            cy={280 - 255 * p.observedFraction}
                            r={5 + Math.sqrt(p.n) / 8}
                            fill="#964c29"
                          >
                            <title>
                              {p.n} rows: score {fixed(p.meanScore)}, observed{" "}
                              {percent(p.observedFraction)}
                            </title>
                          </circle>
                        ),
                      )}
                      <text x="210" y="327" textAnchor="middle">
                        Mean model score
                      </text>
                      <text
                        transform="translate(14 150) rotate(-90)"
                        textAnchor="middle"
                      >
                        Observed fraction
                      </text>
                    </svg>
                  </section>
                  <section>
                    <h3>Missed hotspots</h3>
                    <p>
                      The model misses {study.benchmarks[horizon].model.misses}{" "}
                      observed cell/window occurrences at this budget, including{" "}
                      {study.benchmarks[horizon].model.outsideCandidateMisses}{" "}
                      outside its candidate area.
                    </p>
                    <p>
                      Scores have not been calibrated into reliable event
                      probabilities. The plot measures agreement on the reserved
                      event; it does not apply a correction learned from those
                      outcomes.
                    </p>
                    <p>
                      The baseline comparisons are useful even when the trained
                      model loses. One week of training and one adjacent event
                      window cannot establish performance across seasons or
                      regions.
                    </p>
                  </section>
                </div>
              </>
            )}
            {view === "method" && (
              <section className="method">
                <h2>Data and method</h2>
                <div className="identity">
                  <span>
                    Model <strong>{study.modelArtifactId}</strong>
                  </span>
                  <span>Dataset {study.datasetId}</span>
                  <span>Historical replay · uncalibrated scores</span>
                </div>
                <p className="identity">
                  {study.artifactId} · code {study.codeRevision.slice(0, 8)}
                </p>
                <h3>Data and target</h3>
                <p>
                  The target is a satellite hotspot recorded in an H3
                  resolution-5 cell during (cutoff, cutoff + horizon]. It is not
                  a fire perimeter, physical spread simulation, evacuation
                  recommendation or operational incident feed.
                </p>
                <p>
                  <a href="https://hotspots.dea.ga.gov.au/">
                    Digital Earth Australia Hotspots
                  </a>{" "}
                  supplies the archived detections. Complete paginated responses
                  contain {study.coverage.training.rows.toLocaleString()}{" "}
                  training-window and{" "}
                  {study.coverage.evaluation.rows.toLocaleString()}{" "}
                  evaluation-window records. Query receipts record source,
                  bounding box, timestamps, matched counts and checksums.
                  Satellite observation limitations remain.
                </p>
                <h3>Temporal boundary</h3>
                <p>
                  The frozen model trains on{" "}
                  {study.training.rows.toLocaleString()} cell/horizon rows
                  across {study.training.cutoffs.length} complete cutoff groups.
                  Every cutoff plus the maximum 72-hour horizon ends before the
                  reserved January 10 event boundary. Latest eligible training
                  outcome: {timestamp(study.training.lastOutcomeEnd)}. No
                  timestamp is divided between train and evaluation.
                </p>
                <h3>Features and fixed model</h3>
                <p>
                  Features use detections in the preceding 36 hours: cell and
                  neighbour counts, distance, time since local detection,
                  horizon and the fixed-bearing spread heuristic. Four real
                  daily BoM weather fields plus station distance and age use a
                  two-day availability lag. Missing weather remains NaN for the
                  model. Population, invented infrastructure counts, mixed-unit
                  intensity and future outcomes are excluded.
                </p>
                <p>
                  Histogram gradient boosting: 150 iterations, learning rate
                  0.055, 15 leaf nodes, L2=0.1, seed 42, no random
                  early-stopping validation. These fixed settings are not tuned
                  on the reserved event.
                </p>
                <h3>Selection and evaluation</h3>
                <p>
                  A single candidate definition is used during training, scoring
                  and replay: ring 3 around recent hotspot cells, clipped by the
                  fixed NSW bounds and land mask. All candidates are scored. The
                  highest-ranked 10% (rounded up) are selected before outcomes
                  are consulted. Ties resolve by H3 ID. Exact matching is
                  primary; neighbouring-cell tolerance is a separately labelled
                  secondary comparison.
                </p>
                <h3>Reproduce</h3>
                <pre>
                  make install{"\n"}make replay{"\n"}make test{"\n"}make build
                </pre>
                <p>
                  Acquisition is a separate optional command. The public API
                  reads saved frames and verifies model/data identity; it never
                  trains, performs expensive inference or substitutes a demo
                  scorer.
                </p>
                <h3>Limitations</h3>
                <ul>
                  {study.limitations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p>
                  Evaluation SHA256:{" "}
                  <code>{study.coverage.evaluation.sha256}</code>
                </p>
              </section>
            )}
            <footer>
              <a href={downloadURL} download="nsw-replay-v2.json">
                Download data ↓
              </a>
              <span>
                Historical research replay · generated{" "}
                {study.generatedAt.slice(0, 10)}
              </span>
            </footer>
          </>
        )}
        <HowToUse />
      </main>
    </>
  );
}
