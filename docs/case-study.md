# NSW Hotspot Replay

[Demo](https://disaster.m21264551.com/) · [Code](https://github.com/m21264551-arch/ai-disaster-response-intelligence-system)

The spread heuristic ranked future hotspot cells better than the learned model at 24 hours: average precision was 0.596 versus 0.562. The learned model had a lower Brier score, 0.099 versus 0.190. Ranking quality and score accuracy tell different stories.

## Reveal the errors

Choose a historical cutoff and forecast horizon, then show the satellite observations. The map marks hits, misses and false alarms. The Table view exposes individual cells. Predictions select the highest-ranked 10% of candidates before any future detections are consulted.

## Keep the map and benchmark together

The API serves saved predictions from one trained model and a recorded DEA dataset. The same candidate cells and artifact identities connect the map, cell details and evaluation tables. Training uses complete cutoff groups with a 72-hour exclusion window. Changing the horizon cancels earlier requests so a late response cannot replace the current selection.

## One event is a narrow test

Training contains 4,527 rows from three dependent cutoffs. The January 10–16 evaluation window was used in an earlier benchmark, so it is not new unseen evidence. Satellite hotspots are not fire perimeters, and the scores are uncalibrated. Separate seasons would be needed to assess broader forecasting performance.
