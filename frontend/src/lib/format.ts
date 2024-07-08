export function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function timeLabel(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

