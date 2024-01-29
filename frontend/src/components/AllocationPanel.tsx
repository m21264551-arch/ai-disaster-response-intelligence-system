import { Crosshair, Route } from "lucide-react";
import type { AllocateResponse, RiskCell } from "../lib/types";

interface AllocationPanelProps {
  allocation: AllocateResponse | null;
  selectedCell: RiskCell | null;
}

export function AllocationPanel({ allocation, selectedCell }: AllocationPanelProps) {
  const selectedAllocation = allocation?.allocations.find((item) => item.assigned_h3_id === selectedCell?.h3_id);

  return (
    <section className="panel allocation-panel">
      <div className="panel-heading">
        <div>
          <span>Resource Allocation</span>
          <h2>{allocation?.allocations.length ?? 0} assignments</h2>
        </div>
        <Crosshair size={22} />
      </div>

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

