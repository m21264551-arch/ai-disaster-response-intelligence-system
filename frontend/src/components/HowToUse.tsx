// Cell geometries and scores from replay-v2.json, frame 20200111T1200Z-24.
const examples = [
  {
    kind: "hit",
    id: "85be193bfffffff",
    score: 0.6630274013903338,
    points:
      "98.06,92.68 90.82,58.68 57.79,48.00 31.94,71.29 39.11,105.29 72.20,116.00 98.06,92.68",
  },
  {
    kind: "false_alarm",
    id: "85be0873fffffff",
    score: 0.29676191935574514,
    points:
      "227.89,92.91 220.88,58.92 188.02,48.00 162.11,71.05 169.05,105.06 201.97,116.00 227.89,92.91",
  },
  {
    kind: "miss",
    id: "85be0a63fffffff",
    score: 0.20752942139894986,
    points:
      "357.98,92.79 350.86,58.79 317.90,48.00 292.02,71.18 299.08,105.18 332.08,116.00 357.98,92.79",
  },
];
export default function HowToUse() {
  const labels: Record<string, string> = {
    hit: "Hit",
    false_alarm: "False alarm",
    miss: "Miss",
  };
  const colours: Record<string, string> = {
    hit: "#24634c",
    false_alarm: "#a65912",
    miss: "#96334f",
  };
  return (
    <section
      id="how-to-use"
      className="learning-guide"
      aria-labelledby="guide-title"
      tabIndex={-1}
    >
      <h2 id="guide-title">How to use NSW Hotspot Replay</h2>
      <div className="replay-guide">
        <figure>
          <svg
            viewBox="0 0 390 220"
            role="img"
            aria-label="Three actual cells from the first 24-hour replay: a hit was selected and observed, a false alarm was selected but not observed, and a miss was observed but not selected."
          >
            {examples.map((example, i) => (
              <g key={example.id}>
                <polygon
                  points={example.points}
                  fill={colours[example.kind]}
                  fillOpacity=".18"
                  stroke={colours[example.kind]}
                  strokeWidth="3"
                  strokeDasharray={
                    example.kind === "miss"
                      ? "7 4"
                      : example.kind === "false_alarm"
                        ? "2 4"
                        : undefined
                  }
                />
                <text
                  x={65 + i * 130}
                  y="26"
                  textAnchor="middle"
                  fontWeight="650"
                >
                  {labels[example.kind]}
                </text>
                <text x={65 + i * 130} y="151" textAnchor="middle">
                  {example.kind === "miss" ? "Not selected" : "Selected"}
                </text>
                <text x={65 + i * 130} y="175" textAnchor="middle">
                  {example.kind === "false_alarm" ? "Not observed" : "Observed"}
                </text>
                <text x={65 + i * 130} y="204" textAnchor="middle">
                  {example.score === null
                    ? "Not scored"
                    : `Score ${example.score.toFixed(3)}`}
                </text>
              </g>
            ))}
          </svg>
          <figcaption>
            Actual cells at the 11 January 2020, 12:00 UTC cutoff, +24h. The shapes are shown separately, not in their geographic positions.
          </figcaption>
        </figure>
        <div>
          <p>
            Each hexagon covers a patch of ground. The model ranks where
            satellites may detect a hotspot after a historical cutoff. A hotspot
            is a detection, not a fire perimeter.
          </p>
          <ol className="guide-steps">
            <li>
              <strong>Choose a cutoff and horizon.</strong> The map uses
              information available at that cutoff. A 24-hour horizon asks what
              happens during the following day.
            </li>
            <li>
              <strong>Show observations.</strong> The highest-scoring 10% of
              candidate cells were selected before seeing the outcomes. Hits were selected and observed. False alarms were selected without a detection. Misses were observed but not selected.
            </li>
            <li>
              <strong>Inspect a result.</strong> Filter to hits, misses or false
              alarms, then select a cell. The same filter applies to the Table
              view. Use Fit event to return to the full area.
            </li>
          </ol>
          <p>
            Scores rank cells. They are not calibrated probabilities. The counts
            use exact-cell matching and do not change when you filter. Satellite
            coverage and detections are imperfect, and one historical event
            cannot establish performance across seasons.
          </p>
          <a href="#tool">Back to tool ↑</a>
        </div>
      </div>
    </section>
  );
}
