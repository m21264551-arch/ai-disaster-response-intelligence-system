import { Eye, EyeOff, Pause, Play, SkipForward } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Horizon, RevealResponse, ReplayEvent } from "../lib/types";
import { percent, timeLabel } from "../lib/format";
import { InfoTip } from "./InfoTip";

interface ReplayTimelineProps {
  replay: ReplayEvent | null;
  replayTime: string;
  observedHotspots: number;
  horizon: Horizon;
  reveal: RevealResponse | null;
  revealVisible: boolean;
  revealLoading: boolean;
  frameLoading?: boolean;
  readySteps?: Set<string>;
  sectionId?: string;
  active?: boolean;
  onReplayTimeChange: (value: string) => void;
  onPrefetchStep?: (value: string) => void;
  onRevealToggle: () => void;
}

export const REPLAY_STEPS = [
  "2020-01-04T00:00:00.000Z",
  "2020-01-04T12:00:00.000Z",
  "2020-01-05T00:00:00.000Z",
  "2020-01-05T12:00:00.000Z",
  "2020-01-06T00:00:00.000Z",
  "2020-01-06T12:00:00.000Z",
  "2020-01-07T00:00:00.000Z",
];

function normalizeReplayTime(value: string) {
  return new Date(value).toISOString();
}

export function ReplayTimeline({
  replay,
  replayTime,
  observedHotspots,
  horizon,
  reveal,
  revealVisible,
  revealLoading,
  frameLoading = false,
  readySteps,
  sectionId,
  active = false,
  onReplayTimeChange,
  onPrefetchStep,
  onRevealToggle,
}: ReplayTimelineProps) {
  const [playing, setPlaying] = useState(false);
  const activeIndex = Math.max(0, REPLAY_STEPS.findIndex((step) => normalizeReplayTime(step) === normalizeReplayTime(replayTime)));
  const nextIndex = activeIndex >= REPLAY_STEPS.length - 1 ? 0 : activeIndex + 1;
  const nextStep = REPLAY_STEPS[nextIndex];
  const nextStepReady = readySteps?.has(normalizeReplayTime(nextStep)) ?? false;
  const progress = useMemo(() => (activeIndex / (REPLAY_STEPS.length - 1)) * 100, [activeIndex]);
  const timelineStatus = frameLoading
    ? "Loading selected replay frame"
    : playing && !nextStepReady
      ? "Warming next replay frame"
      : `${observedHotspots} observed hotspots visible`;

  useEffect(() => {
    if (!playing) {
      return;
    }

    if (!nextStepReady) {
      onPrefetchStep?.(nextStep);
    }

    const timer = window.setTimeout(() => {
      if (nextStepReady) {
        onReplayTimeChange(nextStep);
        return;
      }
      onPrefetchStep?.(nextStep);
    }, nextStepReady ? 1200 : 300);

    return () => window.clearTimeout(timer);
  }, [nextStep, nextStepReady, onPrefetchStep, onReplayTimeChange, playing]);

  function prefetchStep(step: string) {
    onPrefetchStep?.(step);
  }

  function stepForward() {
    onReplayTimeChange(nextStep);
  }

  return (
    <section
      id={sectionId}
      className={active ? "timeline-panel section-anchor active-section" : "timeline-panel section-anchor"}
      tabIndex={sectionId ? -1 : undefined}
    >
      <div className="timeline-copy">
        <span className="label-with-help">
          Replay Timeline
          <InfoTip
            label="Replay Timeline"
            text="Move the cut-off time. The model can only use hotspots observed up to that point."
          />
        </span>
        <strong>{replay ? replay.description : "Loading replay window"}</strong>
      </div>

      <div className="timeline-controls">
        <button
          type="button"
          className={playing ? "icon-button active" : "icon-button"}
          onClick={() => setPlaying((value) => !value)}
          onFocus={() => prefetchStep(nextStep)}
          onPointerEnter={() => prefetchStep(nextStep)}
          aria-label={playing ? "Pause replay" : "Play replay"}
          aria-pressed={playing}
          data-testid="replay-toggle"
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={stepForward}
          onFocus={() => prefetchStep(nextStep)}
          onPointerEnter={() => prefetchStep(nextStep)}
          aria-label="Advance replay"
          data-testid="replay-advance"
        >
          <SkipForward size={18} />
        </button>
        <div className="timeline-track" role="group" aria-label="Replay steps" aria-busy={frameLoading}>
          <div className="timeline-progress" style={{ width: `${progress}%` }} />
          {REPLAY_STEPS.map((step, index) => {
            const stepReady = readySteps?.has(normalizeReplayTime(step)) ?? false;
            const isActive = index === activeIndex;
            const className = [
              "timeline-dot",
              stepReady ? "ready" : "warming",
              isActive ? "active" : "",
              isActive && frameLoading ? "loading" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                type="button"
                key={step}
                className={className}
                style={{ left: `${(index / (REPLAY_STEPS.length - 1)) * 100}%` }}
                onClick={() => onReplayTimeChange(step)}
                onFocus={() => prefetchStep(step)}
                onPointerEnter={() => prefetchStep(step)}
                aria-label={`Set replay to ${timeLabel(step)}`}
                aria-current={isActive ? "step" : undefined}
                aria-pressed={isActive}
                data-testid={`replay-step-${index}`}
              />
            );
          })}
        </div>
        <div className="timeline-meta">
          <strong>{timeLabel(replayTime)}</strong>
          <span aria-live="polite">{timelineStatus}</span>
        </div>
      </div>

      <div className={revealVisible && reveal ? "reveal-bar active" : "reveal-bar"}>
        <button
          type="button"
          className="reveal-button"
          onClick={onRevealToggle}
          aria-pressed={revealVisible}
          aria-label={
            revealLoading
              ? "Computing reveal"
              : revealVisible
                ? "Hide actual spread"
                : `Reveal actual ${horizon}h spread`
          }
          disabled={revealLoading}
          data-testid="reveal-toggle"
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
            <span>
              <span className="label-with-help">
                Hits
                <InfoTip label="Hits" text="Predicted risk cells that matched actual future hotspot cells." />
              </span>
              <strong>{reveal.summary.hits}</strong>
            </span>
            <span>
              <span className="label-with-help">
                Misses
                <InfoTip label="Misses" text="Actual future hotspot cells not covered by the selected predictions." />
              </span>
              <strong>{reveal.summary.misses}</strong>
            </span>
            <span>
              <span className="label-with-help">
                False alarms
                <InfoTip label="False alarms" text="Predicted risk cells where no matching future hotspot appeared." />
              </span>
              <strong>{reveal.summary.false_alarms}</strong>
            </span>
            <span>
              <span className="label-with-help">
                Recall
                <InfoTip label="Recall" text="Share of actual future hotspot cells captured by the forecast." placement="left" />
              </span>
              <strong>{percent(reveal.summary.recall)}</strong>
            </span>
          </div>
        ) : (
          <p>Compare the forecast made at replay time against future hotspots in the selected horizon.</p>
        )}
      </div>
    </section>
  );
}
