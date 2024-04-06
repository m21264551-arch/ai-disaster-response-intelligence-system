import { CloudSun, Database, ShieldCheck, Target } from "lucide-react";
import type { ReactNode } from "react";
import type { HeldoutEvaluation, Horizon, ModelMetrics, PredictionResponse } from "../lib/types";
import { InfoTip } from "./InfoTip";

interface EvidenceStripProps {
  metrics: ModelMetrics | null;
  heldout: HeldoutEvaluation | null;
  prediction: PredictionResponse | null;
  horizon: Horizon;
}

export function EvidenceStrip({ metrics, heldout, prediction, horizon }: EvidenceStripProps) {
  const trainingPrAuc = metricValue(metrics, "PR-AUC");
  const heldoutPrAuc = metricValue(heldout?.metrics ?? null, "PR-AUC");

  return (
    <section className="evidence-strip" aria-label="Model and data evidence">
      <EvidenceItem
        icon={<Target size={16} />}
        label="Training PR-AUC"
        help="Precision-recall score from the model's training corpus. Higher is better for rare fire-hotspot events."
        value={trainingPrAuc ? trainingPrAuc.model : "Pending"}
        detail={trainingPrAuc ? `Baseline ${trainingPrAuc.baseline}` : "National corpus loading"}
      />
      <EvidenceItem
        icon={<ShieldCheck size={16} />}
        label="Held-out PR-AUC"
        help="Same metric, but measured on an unseen NSW event window to show generalization beyond training data."
        value={heldoutPrAuc ? heldoutPrAuc.model : "Pending"}
        detail={heldoutPrAuc ? `Baseline ${heldoutPrAuc.baseline}` : "Unseen NSW event"}
      />
      <EvidenceItem
        icon={<Database size={16} />}
        label="Source layers"
        help="Public data fused into features: hotspot detections, weather observations, and population exposure."
        value="DEA + BoM + ABS"
        detail="Hotspots, weather, exposure"
      />
      <EvidenceItem
        icon={<CloudSun size={16} />}
        label="Forecast mode"
        help="The model predicts future risk from only the information available at the replay cut-off time."
        value={`${horizon}h horizon`}
        detail={prediction ? "Future hidden until reveal" : "Waiting for prediction"}
      />
    </section>
  );
}

function EvidenceItem({
  icon,
  label,
  help,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  help: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="evidence-item">
      <div className="evidence-icon">{icon}</div>
      <div>
        <span className="label-with-help">
          {label}
          <InfoTip label={label} text={help} />
        </span>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}

function metricValue(metrics: ModelMetrics | null, name: string): { model: string; baseline: string } | null {
  const metric = metrics?.metrics.find((item) => item.name === name);
  if (!metric) {
    return null;
  }
  return {
    model: metric.model_value.toFixed(3),
    baseline: metric.baseline_value.toFixed(3),
  };
}
