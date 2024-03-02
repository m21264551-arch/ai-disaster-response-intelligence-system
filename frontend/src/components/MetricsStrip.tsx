import { Activity } from "lucide-react";
import type { ModelMetrics } from "../lib/types";

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
      </div>
      <div className="metric-grid">
        {visibleMetrics.map((metric) => (
          <article className="metric-card" key={metric.name}>
            <span>{metric.name}</span>
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
