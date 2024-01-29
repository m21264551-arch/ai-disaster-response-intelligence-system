import { Eye, EyeOff, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Horizon, RevealResponse, ReplayEvent } from "../lib/types";
import { percent, timeLabel } from "../lib/format";

interface ReplayTimelineProps {
  replay: ReplayEvent | null;
  replayTime: string;
  observedHotspots: number;
  horizon: Horizon;
  reveal: RevealResponse | null;
  revealVisible: boolean;
  revealLoading: boolean;
  onReplayTimeChange: (value: string) => void;
  onRevealToggle: () => void;
}

const STEPS = [
  "2020-01-04T00:00:00.000Z",
  "2020-01-04T12:00:00.000Z",
  "2020-01-05T00:00:00.000Z",
  "2020-01-05T12:00:00.000Z",
  "2020-01-06T00:00:00.000Z",
  "2020-01-06T12:00:00.000Z",
  "2020-01-07T00:00:00.000Z",
];

export function ReplayTimeline({
  replay,
  replayTime,
  observedHotspots,
  horizon,
  reveal,
  revealVisible,
  revealLoading,
  onReplayTimeChange,
  onRevealToggle,
}: ReplayTimelineProps) {
  const [playing, setPlaying] = useState(false);
  const activeIndex = Math.max(0, STEPS.findIndex((step) => step === replayTime));
  const progress = useMemo(() => (activeIndex / (STEPS.length - 1)) * 100, [activeIndex]);

  useEffect(() => {
    if (!playing) {
      return;
    }

    const timer = window.setInterval(() => {
      const nextIndex = activeIndex >= STEPS.length - 1 ? 0 : activeIndex + 1;
      onReplayTimeChange(STEPS[nextIndex]);
    }, 1600);

    return () => window.clearInterval(timer);
  }, [activeIndex, onReplayTimeChange, playing]);

  function stepForward() {
    const nextIndex = activeIndex >= STEPS.length - 1 ? 0 : activeIndex + 1;
    onReplayTimeChange(STEPS[nextIndex]);
  }

  return (
    <section className="timeline-panel">
      <div className="timeline-copy">
        <span>Replay Timeline</span>
        <strong>{replay ? replay.description : "Loading replay window"}</strong>
      </div>

      <div className="timeline-controls">
        <button type="button" className="icon-button" onClick={() => setPlaying((value) => !value)} aria-label="Toggle replay">
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button type="button" className="icon-button" onClick={stepForward} aria-label="Advance replay">
          <RotateCcw size={18} />
        </button>
        <div className="timeline-track" role="slider" aria-valuemin={0} aria-valuemax={STEPS.length - 1} aria-valuenow={activeIndex}>
          <div className="timeline-progress" style={{ width: `${progress}%` }} />
          {STEPS.map((step, index) => (
            <button
              type="button"
              key={step}
              className={index === activeIndex ? "timeline-dot active" : "timeline-dot"}
              style={{ left: `${(index / (STEPS.length - 1)) * 100}%` }}
              onClick={() => onReplayTimeChange(step)}
              aria-label={`Set replay to ${timeLabel(step)}`}
            />
          ))}
        </div>
        <div className="timeline-meta">
          <strong>{timeLabel(replayTime)}</strong>
          <span>{observedHotspots} observed hotspots visible</span>
        </div>
      </div>

      <div className={revealVisible && reveal ? "reveal-bar active" : "reveal-bar"}>
        <button
          type="button"
          className="reveal-button"
          onClick={onRevealToggle}
          aria-pressed={revealVisible}
          disabled={revealLoading}
        >
          {revealVisible ? <EyeOff size={17} /> : <Eye size={17} />}
          {revealLoading
            ? "Computing reveal"
            : revealVisible
              ? "Hide actual spread"
              : `Reveal actual ${horizon}h spread`}
        </button>

        {revealVisible && reveal ? (
          <div className="reveal-stats" aria-label="Prediction reveal results">
            <span>Hits <strong>{reveal.summary.hits}</strong></span>
            <span>Misses <strong>{reveal.summary.misses}</strong></span>
            <span>False alarms <strong>{reveal.summary.false_alarms}</strong></span>
            <span>Recall <strong>{percent(reveal.summary.recall)}</strong></span>
          </div>
        ) : (
          <p>Compare the forecast made at replay time against future hotspots in the selected horizon.</p>
        )}
      </div>
    </section>
  );
}
