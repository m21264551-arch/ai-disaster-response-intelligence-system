import { Activity } from "lucide-react";
import type { ModelMetrics } from "../lib/types";
import { InfoTip } from "./InfoTip";

interface MetricsStripProps {
  metrics: ModelMetrics | null;
  sectionId?: string;
  active?: boolean;
}

export function MetricsStrip({ metrics, sectionId, active = false }: MetricsStripProps) {
  const visibleMetrics = (metrics?.metrics ?? []).filter((metric) => metric.name !== "PR Curve Points");

  return (
    <section
      id={sectionId}
      className={active ? "metrics-panel section-anchor active-section" : "metrics-panel section-anchor"}
      tabIndex={sectionId ? -1 : undefined}
    >
      <div className="metrics-heading">
        <Activity size={18} />
        <span>Model Evaluation</span>
        <InfoTip
          label="Model Evaluation"
          text="Training-time model metrics compared against a simpler baseline forecast."
        />
      </div>
      <div className="metric-grid">
        {visibleMetrics.map((metric) => (
          <article className="metric-card" key={metric.name}>
            <span className="label-with-help">
              {metric.name}
              <InfoTip label={metric.name} text={metricHelp(metric.name)} />
            </span>
            <strong>
              {metric.model_value}
              <small>{metric.unit}</small>
            </strong>
            <p>Baseline {metric.baseline_value}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function metricHelp(name: string): string {
  if (name === "PR-AUC") {
    return "Precision-recall area under curve; useful when future fire cells are rare compared with non-fire cells.";
  }
  if (name === "Recall@Top-10%") {
    return "Share of true future hotspots captured in the highest-risk decile of scored cells.";
  }
  if (name === "Brier Score") {
    return "Probability calibration error. Lower means the forecast probabilities better match observed outcomes.";
  }
  if (name === "Median Latency") {
    return "Median API response time measured for a replay-sized prediction request.";
  }
  return "Model metric compared with the baseline forecast.";
}
