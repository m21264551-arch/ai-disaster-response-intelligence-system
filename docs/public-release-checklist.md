# Public Release Checklist

Use this before making the GitHub repository public.

## Current Status

- [x] No real API keys committed.
- [x] `.env`, `.env.*`, virtualenvs, build outputs, dependency folders, caches, logs, and OS metadata are ignored.
- [x] `.env.example` contains placeholders only.
- [x] No committed file is larger than 10 MB.
- [x] Public data provenance is documented in `docs/data-sources-and-licenses.md`.
- [x] Operational safety disclaimer appears in the README, dashboard, and model card.
- [x] Project code has a root `LICENSE`.
- [x] `make check` passes.
- [x] `make audit` passes.

## Manual Checks Before Publishing

Run:

```bash
git status --short
rg -n --hidden --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!.venv/**' --glob '!.git/**' \
  "(api[_-]?key|secret|token|password|authorization|bearer|private[_-]?key|BEGIN (RSA|OPENSSH|PRIVATE)|AKIA|AIza|\\bsk-[A-Za-z0-9])" .
find . -path './.git' -prune -o -path './.venv' -prune -o -path './frontend/node_modules' -prune -o -path './frontend/dist' -prune -o -type f -size +10M -print
make check
make audit
```

Expected:

- Secret scan should only show placeholders or false positives such as package names.
- Large-file check should print nothing.
- `make check` should pass backend tests and frontend build.
- `make audit` should report no dependency advisories, no Bandit findings, no broken Python requirements, and no npm production vulnerabilities.

## Keep Private

Do not publish:

- Real `.env` files.
- NASA FIRMS `MAP_KEY` values.
- Cloud/database credentials.
- Private incident notes, non-public emergency-service data, or exact personal addresses.
- New third-party datasets without checking redistribution terms first.

## Good To Publish

These files are intended to be public:

- Source code under `backend/` and `frontend/src/`.
- Small demo CSVs under `backend/app/data/`.
- Derived model/evaluation artifacts under `backend/app/ml/artifacts/`.
- Documentation under `docs/`.
- `.env.example`.
- `LICENSE`.
