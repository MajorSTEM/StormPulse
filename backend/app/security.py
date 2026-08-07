"""
StormPulse V2 — API security layer.

Token-based authentication, per-client rate-limit keying, and security
response headers. See docs/OWASP_API_CHECKLIST.md for the control walkthrough
and docs/NIST-800-53-MAPPING.md for the control mapping (IA-2, AC-3, SC-5,
SC-8 adjuncts).
"""
import logging

from fastapi import HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

logger = logging.getLogger(__name__)

# Shown in /docs as the padlock scheme on protected routes.
bearer_scheme = HTTPBearer(
    auto_error=False,
    scheme_name="ClientAPIKey",
    description="Client API key issued by StormPulse (Authorization: Bearer <key>).",
)


async def require_api_key(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Security(bearer_scheme),
) -> str:
    """
    Authenticate a request with a client API key.

    Accepts `Authorization: Bearer <key>` (canonical) or `X-API-Key: <key>`
    (convenience). Returns the client name; 401 with WWW-Authenticate on
    missing or invalid credentials. Never echoes the presented key back.
    """
    presented = credentials.credentials if credentials else request.headers.get("x-api-key")
    client = settings.api_key_map().get(presented or "")
    if not client:
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid API key.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    request.state.client_id = client
    return client


def rate_limit_key(request: Request) -> str:
    """
    Per-client rate-limit bucket: authenticated requests are keyed by client
    name (one bucket per issued key, however many IPs they call from);
    unauthenticated requests fall back to source IP.
    """
    auth = request.headers.get("authorization", "")
    presented = auth[7:].strip() if auth.lower().startswith("bearer ") else \
        request.headers.get("x-api-key", "")
    client = settings.api_key_map().get(presented)
    if client:
        return f"client:{client}"
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=rate_limit_key, default_limits=[settings.rate_limit])


async def security_headers_middleware(request: Request, call_next):
    """Attach security headers to every response (OWASP API8 hardening)."""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault(
        "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
    )
    # The interactive docs page needs its own scripts; every other route is
    # a JSON API and gets a deny-all CSP.
    if request.url.path not in ("/docs", "/redoc") :
        response.headers.setdefault(
            "Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'"
        )
    return response
