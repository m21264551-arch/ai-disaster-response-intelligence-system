from __future__ import annotations

import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.main import app as backend_app  # noqa: E402

app = FastAPI(title="AI Disaster-Response Intelligence System")
app.mount("/api", backend_app)

STATIC_DIR = Path(__file__).resolve().parents[1] / "dashboard-static"


@app.get("/{asset_path:path}", include_in_schema=False)
def serve_dashboard(asset_path: str = "") -> FileResponse:
    requested = (STATIC_DIR / asset_path).resolve()
    if requested.is_file() and requested.is_relative_to(STATIC_DIR):
        return FileResponse(requested)
    return FileResponse(STATIC_DIR / "index.html")
