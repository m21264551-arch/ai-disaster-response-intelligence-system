export default function HowToUse() { return (
<section id="how-to-use" className="learning-guide" aria-labelledby="guide-title" tabIndex={-1}>
<h2 id="guide-title">How to use NSW Hotspot Replay</h2>
<p>The map compares saved hotspot forecasts with satellite observations from January 2020. Each hexagon is a geographic cell. A forecast ranks cells where a satellite hotspot may be recorded after a historical cutoff. It does not describe a fire perimeter or simulate physical fire spread.</p>
<ol className="guide-steps">
<li><h3>Choose a cutoff and horizon</h3><p>Use Historical cutoff or the timeline, then select 24, 48, or 72 hours. The map shows scores based on observations available under the study's cutoff rules. Darker cells have higher scores; outlined cells are in the selected top 10%.</p></li>
<li><h3>Show the observations</h3><p>Press Show observations to reveal what was recorded during that future window. The selection budget is fixed before these outcomes are consulted. Changing the cutoff or horizon clears the previous comparison.</p></li>
<li><h3>Inspect an error</h3><p>Select a cell to read its score and outcome. A hit is selected and observed; a false alarm is selected but unobserved; a miss is observed but unselected. Use Table for individual cell results without navigating the map.</p></li>
</ol>
<p><strong>Reading the results:</strong> precision measures how many selected cells had observations; recall measures how many observed cells were selected. Results compares the trained model with simple baselines. Exact-cell matching is the default.</p>
<p>Scores are uncalibrated rankings, not reliable event probabilities. This replay covers one historical event, and satellite detection coverage limits what can be observed.</p>
<a href="#tool">Back to tool ↑</a></section>
); }
