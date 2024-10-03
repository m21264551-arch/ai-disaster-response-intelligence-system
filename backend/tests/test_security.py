from datetime import UTC, datetime

from fastapi.testclient import TestClient

from api.index import app as edge_app
from app import security
from app.main import app as backend_app


def test_api_responses_include_security_headers():
    client = TestClient(backend_app, base_url="https://testserver")

    response = client.get("/health")

    assert response.status_code == 200
    assert response.headers["content-security-policy"].startswith("default-src 'self'")
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    assert response.headers["cross-origin-opener-policy"] == "same-origin"
    assert response.headers["permissions-policy"] == "camera=(), geolocation=(), microphone=()"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert response.headers["strict-transport-security"] == security.STRICT_TRANSPORT_SECURITY
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"


def test_static_dashboard_shell_includes_security_headers():
    client = TestClient(edge_app, base_url="https://testserver")

    response = client.get("/")

    assert response.status_code == 200
    assert response.headers["content-security-policy"].startswith("default-src 'self'")
    assert "connect-src 'self'" in response.headers["content-security-policy"]
    assert "https://*.cartocdn.com" in response.headers["content-security-policy"]
    assert response.headers["strict-transport-security"] == security.STRICT_TRANSPORT_SECURITY
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"


def test_expensive_endpoints_are_rate_limited(monkeypatch):
    limiter = security.InMemoryRateLimiter(security.RateLimitConfig(limit=1, window_seconds=60))
    monkeypatch.setattr(security, "expensive_endpoint_rate_limiter", limiter)
    client = TestClient(backend_app)
    body = {
        "bbox": [148.7, -37.4, 153.8, -31.1],
        "start_time": datetime(2020, 1, 5, tzinfo=UTC).isoformat(),
        "horizons": [24],
    }

    first = client.post("/predict", json=body)
    second = client.post("/predict", json=body)

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["detail"] == "Rate limit exceeded. Try again shortly."
    assert int(second.headers["retry-after"]) >= 1
    assert second.headers["x-ratelimit-limit"] == "1"
    assert second.headers["x-ratelimit-window"] == "60"
