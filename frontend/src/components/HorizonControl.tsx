import type { Horizon } from "../lib/types";

interface HorizonControlProps {
  horizon: Horizon;
  horizons: Horizon[];
  onChange: (horizon: Horizon) => void;
}

export function HorizonControl({ horizon, horizons, onChange }: HorizonControlProps) {
  return (
    <div className="horizon-control" role="radiogroup" aria-label="Forecast horizon">
      {horizons.map((value) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === horizon}
          className={value === horizon ? "horizon active" : "horizon"}
          key={value}
          onClick={() => onChange(value)}
          data-testid={`horizon-${value}`}
        >
          {value}h
        </button>
      ))}
    </div>
  );
}
