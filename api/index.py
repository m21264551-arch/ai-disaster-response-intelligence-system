from __future__ import annotations

import hashlib
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.main import app as backend_app  # noqa: E402
from app.security import SecurityHeadersMiddleware  # noqa: E402

app = FastAPI(title="NSW Bushfire Forecast Replay")
app.mount("/api", backend_app)
app.add_middleware(SecurityHeadersMiddleware)

STATIC_DIR = Path(__file__).resolve().parents[1] / "dashboard-static"


@app.get("/{asset_path:path}", include_in_schema=False)
def serve_dashboard(asset_path: str = "") -> FileResponse:
    requested = (STATIC_DIR / asset_path).resolve()
    target = requested if requested.is_file() and requested.is_relative_to(STATIC_DIR) else STATIC_DIR / "index.html"
    response = FileResponse(target)
    if target.suffix == ".html":
        # Deployment file mtimes can be normalized and HTML lengths can repeat.
        # Validate the actual entrypoint on both direct and SPA fallback routes.
        response.headers["ETag"] = f'"{hashlib.sha256(target.read_bytes()).hexdigest()}"'
        response.headers["Cache-Control"] = "no-cache"
    elif target.parts[-2:-1] == ("assets",):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response
