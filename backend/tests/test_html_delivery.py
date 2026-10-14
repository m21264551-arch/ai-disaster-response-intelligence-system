"""Entrypoint validation must follow content, even with normalized file mtimes."""
import hashlib
import importlib
import os

import pytest


@pytest.mark.parametrize("route", ["", "index.html", "replay/bookmark"])
def test_html_etag_tracks_equal_size_updates(tmp_path, monkeypatch, route):
    server = importlib.import_module("api.index")
    monkeypatch.setattr(server, "STATIC_DIR", tmp_path)
    index = tmp_path / "index.html"
    index.write_text("<p>first</p>")
    os.utime(index, (1500000000, 1500000000))
    old = server.serve_dashboard(route)
    index.write_text("<p>later</p>")
    os.utime(index, (1500000000, 1500000000))
    current = server.serve_dashboard(route)
    assert old.headers["etag"] != current.headers["etag"]
    assert current.headers["etag"] == f'"{hashlib.sha256(index.read_bytes()).hexdigest()}"'
    assert current.headers["cache-control"] == "no-cache"


def test_versioned_asset_cache_is_preserved(tmp_path, monkeypatch):
    server = importlib.import_module("api.index")
    monkeypatch.setattr(server, "STATIC_DIR", tmp_path)
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "index-abc123.js").write_text("export {}")
    response = server.serve_dashboard("assets/index-abc123.js")
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"
