import { AlertTriangle, CheckCircle2, Crosshair, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { HeldoutCase, HeldoutEvaluation, Metric } from "../lib/types";
import { compactNumber, percent, timeLabel } from "../lib/format";
import { InfoTip } from "./InfoTip";

interface HeldoutPanelProps {
  evaluation: HeldoutEvaluation | null;
  sectionId?: string;
  active?: boolean;
}

export function HeldoutPanel({ evaluation, sectionId, active = false }: HeldoutPanelProps) {
  const metrics = evaluation?.metrics.metrics.filter((metric) => metric.name !== "PR Curve Points") ?? [];
  const sourceRows = numericWindowValue(evaluation, "source_rows");
  const scoredRows = evaluation?.metrics.evaluation_rows ?? numericWindowValue(evaluation, "scored_rows");
  const hotspotStart = stringWindowValue(evaluation, "hotspot_start");
  const hotspotEnd = stringWindowValue(evaluation, "hotspot_end");

  return (
    <section
      id={sectionId}
      className={active ? "heldout-panel section-anchor active-section" : "heldout-panel section-anchor"}
      tabIndex={sectionId ? -1 : undefined}
    >
      <div className="metrics-heading heldout-heading">
        <ShieldCheck size={18} />
        <span>Held-Out Event Test</span>
        <InfoTip
          label="Held-Out Event Test"
          text="Evaluation on a withheld NSW event window that was not used to train the model."
        />
      </div>

      <div className="heldout-summary">
        <div>
          <span className="label-with-help">
            Unseen DEA rows
            <InfoTip label="Unseen DEA rows" text="Digital Earth Australia hotspot rows reserved for validation." />
          </span>
          <strong>{sourceRows ? compactNumber(sourceRows) : "Pending"}</strong>
        </div>
        <div>
          <span className="label-with-help">
            Scored H3-time rows
            <InfoTip label="Scored H3-time rows" text="Each row is a grid cell at a replay time and forecast horizon." />
          </span>
          <strong>{scoredRows ? compactNumber(scoredRows) : "Pending"}</strong>
        </div>
        <div>
          <span className="label-with-help">
            Future-positive rate
            <InfoTip label="Future-positive rate" text="Fraction of scored cells that later contained a hotspot." placement="left" />
          </span>
          <strong>{evaluation?.metrics.positive_rate ? percent(evaluation.metrics.positive_rate) : "Pending"}</strong>
        </div>
      </div>

      <div className="heldout-window">
        <Crosshair size={15} />
        <span>
          {hotspotStart && hotspotEnd ? `${timeLabel(hotspotStart)} to ${timeLabel(hotspotEnd)}` : "Held-out window pending"}
        </span>
      </div>

      <div className="heldout-metrics">
        {metrics.map((metric) => (
          <article className="heldout-metric" key={metric.name}>
            <span className="label-with-help">
              {metric.name}
              <InfoTip label={metric.name} text={metricHelp(metric.name)} />
            </span>
            <strong>{formatMetric(metric)}</strong>
            <p className={metricDeltaClass(metric)}>{metricDeltaLabel(metric)}</p>
          </article>
        ))}
      </div>

      <div className="failure-grid">
        <CaseList
          title="Top Hits"
          icon={<CheckCircle2 size={15} />}
          cases={evaluation?.cases.hits ?? []}
          tone="hit"
        />
        <CaseList
          title="Worst Misses"
          icon={<AlertTriangle size={15} />}
          cases={evaluation?.cases.missed ?? []}
          tone="miss"
        />
        <CaseList
          title="False Alarms"
          icon={<AlertTriangle size={15} />}
          cases={evaluation?.cases.false_alarms ?? []}
          tone="false"
        />
      </div>
    </section>
  );
}

interface CaseListProps {
  title: string;
  icon: ReactNode;
  cases: HeldoutCase[];
  tone: "hit" | "miss" | "false";
}

function CaseList({ title, icon, cases, tone }: CaseListProps) {
  return (
    <div className={`failure-list ${tone}`}>
      <div className="failure-title">
        {icon}
        <span className="label-with-help">
          {title}
          <InfoTip label={title} text={caseHelp(title)} />
        </span>
      </div>
      {cases.slice(0, 3).map((item) => (
        <article className="failure-row" key={`${title}-${item.h3_id}-${item.prediction_time}-${item.horizon_hours}`}>
          <div>
            <strong>{percent(item.model_score)}</strong>
            <span>Baseline {percent(item.baseline_score)}</span>
          </div>
          <p>
            {item.h3_id.slice(0, 8)} · {item.horizon_hours}h · rank {item.rank}
          </p>
        </article>
      ))}
    </div>
  );
}

function metricHelp(name: string): string {
  if (name === "PR-AUC") {
    return "Held-out precision-recall performance against rare future-hotspot labels.";
  }
  if (name === "Recall@Top-10%") {
    return "Held-out hotspots captured in the model's highest-risk scored cells.";
  }
  if (name === "Brier Score") {
    return "Held-out probability calibration error; lower is better.";
  }
  return "Held-out metric compared with the baseline forecast.";
}

function caseHelp(title: string): string {
  if (title === "Top Hits") {
    return "High-risk predictions that later matched actual hotspot cells.";
  }
  if (title === "Worst Misses") {
    return "Actual hotspot cells the model ranked too low.";
  }
  return "High-risk predictions where no matching future hotspot appeared.";
}

function formatMetric(metric: Metric): string {
  if (metric.unit === "score" || metric.unit === "loss") {
    return metric.model_value.toFixed(3);
  }
  return compactNumber(metric.model_value);
}

function metricDeltaLabel(metric: Metric): string {
  const lowerIsBetter = metric.name === "Brier Score";
  const delta = lowerIsBetter ? metric.baseline_value - metric.model_value : metric.model_value - metric.baseline_value;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(3)} vs baseline`;
}

function metricDeltaClass(metric: Metric): string {
  const lowerIsBetter = metric.name === "Brier Score";
  const delta = lowerIsBetter ? metric.baseline_value - metric.model_value : metric.model_value - metric.baseline_value;
  return delta >= 0 ? "metric-delta good" : "metric-delta weak";
}

function numericWindowValue(evaluation: HeldoutEvaluation | null, key: string): number | null {
  const value = evaluation?.evaluation_window[key];
  return typeof value === "number" ? value : null;
}

function stringWindowValue(evaluation: HeldoutEvaluation | null, key: string): string | null {
  const value = evaluation?.evaluation_window[key];
  return typeof value === "string" ? value : null;
}
