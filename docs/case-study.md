# A historical forecast you can actually inspect

**Question.** At a known cutoff, which nearby cells does a fixed model rank highest, and what did satellites record afterward?

**Approach.** Replace hand-authored replay points with complete paginated DEA archive snapshots. Record a coverage receipt for every query. Use the same candidate construction for model fitting, scoring and UI frames. Purge all 72-hour training outcome windows that reach the reserved January 10 event boundary. Serialize the fitted model, reload it, and generate versioned frames with matching identities.

**Result.** At 24 hours, the model achieves 0.561 AP on the pooled candidate rows, compared with persistence 0.438 and the spread heuristic 0.596. Brier is 0.100 for the model versus 0.190 for the heuristic. The simpler heuristic ranks better; the learned model does not earn a blanket “best model” claim. The 48/72-hour results and full error counts are downloadable and visible.

**Failure analysis.** A fixed top-10% budget misses many observed cells, including detections beyond the candidate area. Extending a horizon beyond recorded coverage is unavailable, not a zero-hotspot result. Earlier corpus manifests named six-day windows while some underlying samples ended on day one; new acquisitions paginate the complete query and reject partial results. Weather and mixed-unit intensity needed separate scrutiny too.

**Engineering decision.** Serve precomputed frames through FastAPI. Browsing needs neither inference nor retraining. Model SHA256, dataset ID, candidate-set identity and evaluation policy connect the map to its benchmark. Abort/generation checks keep late responses from changing the selected horizon. A cell table makes every important result inspectable without relying on the map.

**Next limitation.** The model trains on only 4,527 rows from three dependent cutoffs. January 10–16 was used by an earlier benchmark and is not newly unseen evidence. More separately reserved seasons, calibrated data availability and sensor-aware coverage would be required before a broader forecasting claim.
