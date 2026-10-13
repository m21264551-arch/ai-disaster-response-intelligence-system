# Release verification

Run the commands in the README and inspect their actual results before release. This file records requirements, not pre-checked claims.

- Backend tests, browser regressions, frontend build and dependency/security audits pass.
- Publish `model.joblib` and `replay-v2.json` together. Check `/api/health`, study identity, a forecast and reveal on the preview.
- Verify missing coverage and stale artifact errors; never substitute fixtures.
- Inspect desktop/mobile map and table; confirm that a horizon change clears revealed outcomes.
- Preserve source receipts, source attribution, cutoffs, model parameters and code revision.
- Promote the verified preview; smoke-test the custom domain and retain the previous deployment for rollback.

See [data sources](data-sources-and-licenses.md), [model card](model-card.md) and [training](training.md).
