import { AlertOctagon, Building2, Flame, Hospital, Route, School } from "lucide-react";
import type { ReactNode } from "react";
import type { Exposure, Horizon, Incident, RiskCell } from "../lib/types";
import { compactNumber, percent, timeLabel } from "../lib/format";

interface IncidentPanelProps {
  incident: Incident | null;
  selectedCell: RiskCell | null;
  selectedExposure: Exposure | null;
  horizon: Horizon;
}

export function IncidentPanel({ incident, selectedCell, selectedExposure, horizon }: IncidentPanelProps) {
  return (
    <section className="panel incident-panel">
      <div className="panel-heading">
        <div>
          <span>Incident Detail</span>
          <h2>{incident?.name ?? "No incident selected"}</h2>
        </div>
        <AlertOctagon size={22} />
      </div>

      <div className="incident-status">
        <span className="alert-level">{incident?.alert_level ?? "Pending"}</span>
        <span>{incident?.status ?? "Waiting for incident feed"}</span>
      </div>

      <dl className="detail-grid">
        <div>
          <dt>Area</dt>
          <dd>{compactNumber(incident?.size_hectares ?? 0)} ha</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{incident ? timeLabel(incident.updated_at) : "--"}</dd>
        </div>
      </dl>

      <div className="risk-card">
        <div className="risk-main">
          <Flame size={24} />
          <div>
            <span>Selected H3 Cell</span>
            <strong>{selectedCell ? percent(selectedCell.risk_score) : "--"}</strong>
          </div>
        </div>
        <p>
          {selectedCell
            ? `${horizon}h forecast interval ${percent(selectedCell.confidence_low)}-${percent(selectedCell.confidence_high)}.`
            : "Select a risk cell on the map to inspect model confidence."}
        </p>
      </div>

      <div className="feature-list">
        {(selectedCell?.top_features ?? []).map((feature) => (
          <div className="feature-row" key={feature.name}>
            <span>{feature.name}</span>
            <meter min={0} max={1} value={feature.contribution} />
          </div>
        ))}
      </div>

      <div className="exposure-grid">
        <ExposureItem icon={<Building2 size={17} />} label="Population" value={compactNumber(selectedExposure?.population ?? 0)} />
        <ExposureItem icon={<Hospital size={17} />} label="Hospitals" value={String(selectedExposure?.hospitals ?? 0)} />
        <ExposureItem icon={<School size={17} />} label="Schools" value={String(selectedExposure?.schools ?? 0)} />
        <ExposureItem icon={<Route size={17} />} label="Roads" value={String(selectedExposure?.major_roads ?? 0)} />
      </div>
    </section>
  );
}

function ExposureItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="exposure-item">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
