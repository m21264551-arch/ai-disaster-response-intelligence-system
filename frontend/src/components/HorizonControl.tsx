import type { Horizon } from "../lib/types";
import { InfoTip } from "./InfoTip";

interface HorizonControlProps {
  horizon: Horizon;
  horizons: Horizon[];
  onChange: (horizon: Horizon) => void;
}

export function HorizonControl({ horizon, horizons, onChange }: HorizonControlProps) {
  return (
    <div className="horizon-control-wrap">
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
      <InfoTip
        label="Forecast horizon"
        text="Choose how far ahead the model predicts from the current replay cut-off."
        placement="left"
      />
    </div>
  );
}
