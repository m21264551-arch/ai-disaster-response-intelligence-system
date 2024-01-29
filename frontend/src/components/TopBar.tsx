import { CircleCheck, Clock3, Satellite, ServerCrash } from "lucide-react";
import type { ReplayEvent } from "../lib/types";
import { timeLabel } from "../lib/format";

interface TopBarProps {
  replay: ReplayEvent | null;
  status: "loading" | "ready" | "error";
  incidentCount: number;
  predictionRunId?: string;
}

export function TopBar({ replay, status, incidentCount, predictionRunId }: TopBarProps) {
  const statusIcon = status === "error" ? <ServerCrash size={16} /> : <CircleCheck size={16} />;

  return (
    <header className="top-bar">
      <div className="top-left">
        <Satellite size={18} />
        <span>{replay?.name ?? "NSW Bushfire Replay"}</span>
      </div>
      <div className="top-status-group">
        <div className={`status-pill ${status}`}>
          {statusIcon}
          {status}
        </div>
        <div className="top-stat">
          <Clock3 size={15} />
          {replay ? `${timeLabel(replay.start_time)} - ${timeLabel(replay.end_time)}` : "Replay loading"}
        </div>
        <div className="top-stat">{incidentCount} active incidents</div>
        <div className="run-id">{predictionRunId ?? "waiting for prediction"}</div>
      </div>
    </header>
  );
}

