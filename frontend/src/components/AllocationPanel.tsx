import { AlertTriangle, Crosshair, Loader2, Route } from "lucide-react";
import type { AllocateResponse, RiskCell } from "../lib/types";
import { InfoTip } from "./InfoTip";

interface AllocationPanelProps {
  allocation: AllocateResponse | null;
  selectedCell: RiskCell | null;
  loading?: boolean;
  error?: string | null;
}

export function AllocationPanel({ allocation, selectedCell, loading = false, error = null }: AllocationPanelProps) {
  const selectedAllocation = allocation?.allocations.find((item) => item.assigned_h3_id === selectedCell?.h3_id);
  const heading = loading ? "Optimizing" : `${allocation?.allocations.length ?? 0} assignments`;

  return (
    <section className="panel allocation-panel">
      <div className="panel-heading">
        <div>
          <span className="label-with-help">
            Resource Allocation
            <InfoTip
              label="Resource Allocation"
              text="Ranks crews and supplies by model risk, exposed population, infrastructure, and staging distance."
              placement="left"
            />
          </span>
          <h2>{heading}</h2>
        </div>
        {loading ? <Loader2 className="spin" size={22} /> : <Crosshair size={22} />}
      </div>

      {error && (
        <div className="allocation-state allocation-error">
          <AlertTriangle size={18} />
          <span>Allocation unavailable</span>
        </div>
      )}

      {loading && !error && (
        <div className="allocation-state">
          <Loader2 className="spin" size={18} />
          <span>Optimizing routes</span>
        </div>
      )}

      {selectedAllocation && (
        <div className="selected-assignment">
          <Route size={18} />
          <div>
            <strong>{selectedAllocation.resource_id}</strong>
            <span>{selectedAllocation.staging_point} · ETA {selectedAllocation.eta_minutes}m</span>
          </div>
        </div>
      )}

      <div className="allocation-list">
        {(allocation?.allocations ?? []).slice(0, 6).map((item) => (
          <article className="allocation-row" key={item.resource_id}>
            <div>
              <strong>{item.resource_id}</strong>
              <span>{item.staging_point}</span>
            </div>
            <p>{item.rationale}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
