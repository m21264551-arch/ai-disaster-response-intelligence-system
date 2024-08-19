from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from math import ceil
from threading import Lock
from time import monotonic

from fastapi import HTTPException, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response as StarletteResponse


CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "base-uri 'self'; "
    "object-src 'none'; "
    "frame-ancestors 'none'; "
    "form-action 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; "
    "connect-src 'self' http://localhost:8000 http://127.0.0.1:8000; "
    "font-src 'self' data:; "
    "worker-src 'self' blob:"
)

SECURITY_HEADERS = {
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
}
STRICT_TRANSPORT_SECURITY = "max-age=31536000"


def apply_security_headers(response: StarletteResponse, request: Request | None = None) -> None:
    for name, value in SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)

    if request and _is_https_request(request):
        response.headers.setdefault("Strict-Transport-Security", STRICT_TRANSPORT_SECURITY)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> StarletteResponse:
        response = await call_next(request)
        apply_security_headers(response, request)
        return response


@dataclass(frozen=True)
class RateLimitConfig:
    limit: int = 30
    window_seconds: float = 60.0


class InMemoryRateLimiter:
    def __init__(self, config: RateLimitConfig | None = None) -> None:
        self.config = config or RateLimitConfig()
        self._buckets: dict[str, deque[float]] = {}
        self._lock = Lock()

    def check(self, key: str, now: float | None = None) -> tuple[bool, int]:
        checked_at = monotonic() if now is None else now
        cutoff = checked_at - self.config.window_seconds

        with self._lock:
            bucket = self._buckets.setdefault(key, deque())
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()

            if len(bucket) >= self.config.limit:
                retry_after = ceil(bucket[0] + self.config.window_seconds - checked_at)
                return False, max(1, retry_after)

            bucket.append(checked_at)
            return True, 0

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()


expensive_endpoint_rate_limiter = InMemoryRateLimiter()


def rate_limit_expensive_endpoint(request: Request, response: Response) -> None:
    limit = expensive_endpoint_rate_limiter.config.limit
    window = int(expensive_endpoint_rate_limiter.config.window_seconds)
    response.headers["X-RateLimit-Limit"] = str(limit)
    response.headers["X-RateLimit-Window"] = str(window)

    allowed, retry_after = expensive_endpoint_rate_limiter.check(_rate_limit_key(request))
    if allowed:
        return

    raise HTTPException(
        status_code=429,
        detail="Rate limit exceeded. Try again shortly.",
        headers={
            "Retry-After": str(retry_after),
            "X-RateLimit-Limit": str(limit),
            "X-RateLimit-Window": str(window),
        },
    )


def _rate_limit_key(request: Request) -> str:
    client_host = request.client.host if request.client else "unknown"
    return f"{client_host}:{request.url.path}"


def _is_https_request(request: Request) -> bool:
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",", maxsplit=1)[0].strip()
    return request.url.scheme == "https" or forwarded_proto == "https"
