import { Activity } from "lucide-react";
import type { ModelMetrics } from "../lib/types";

interface MetricsStripProps {
  metrics: ModelMetrics | null;
}

export function MetricsStrip({ metrics }: MetricsStripProps) {
  return (
    <section className="metrics-panel">
      <div className="metrics-heading">
        <Activity size={18} />
        <span>Model Evaluation</span>
      </div>
      <div className="metric-grid">
        {(metrics?.metrics ?? []).map((metric) => (
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

