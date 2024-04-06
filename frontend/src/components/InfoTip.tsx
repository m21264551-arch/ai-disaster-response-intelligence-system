import { Info } from "lucide-react";

interface InfoTipProps {
  label: string;
  text: string;
  placement?: "top" | "left";
}

export function InfoTip({ label, text, placement = "top" }: InfoTipProps) {
  return (
    <button
      type="button"
      className={`info-tip ${placement === "left" ? "left" : ""}`}
      aria-label={`${label}: ${text}`}
      data-tooltip={text}
    >
      <Info size={13} />
    </button>
  );
}
