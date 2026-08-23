"""
StormPulse V2 — API security layer.

Token-based authentication, per-client rate-limit keying, and security
response headers. See docs/OWASP_API_CHECKLIST.md for the control walkthrough
and docs/NIST-800-53-MAPPING.md for the control mapping (IA-2, AC-3, SC-5,
SC-8 adjuncts).
"""
import logging
import secrets as _secrets

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
    client = lookup_client(presented)
    if not client:
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid API key.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    request.state.client_id = client
    return client


def _visitor_ip(request: Request) -> str:
    """Best-available client IP for rate-limit bucketing.

    Proxies APPEND to X-Forwarded-For, so with exactly one trusted proxy in
    front of us (Render), the LAST entry is the address the proxy actually
    saw. Earlier entries are client-supplied and trivially spoofable - using
    the first entry would let an attacker mint a fresh rate-limit bucket per
    request just by rotating a fake header.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return get_remote_address(request)


def lookup_client(presented: str | None) -> str | None:
    """Map an API key to its client name in constant time.

    Compares against every configured key with secrets.compare_digest and
    never exits early, so response timing reveals nothing about how close a
    guessed key was to a real one.
    """
    if not presented:
        return None
    match: str | None = None
    for key, client in settings.api_key_map().items():
        if _secrets.compare_digest(presented.encode(), key.encode()):
            match = client
    return match


def rate_limit_key(request: Request) -> str:
    """
    Per-client rate-limit bucket: authenticated requests are keyed by client
    name (one bucket per issued key, however many IPs they call from);
    unauthenticated requests fall back to source IP. The published demo
    credential is shared by every public map visitor, so it buckets per IP —
    one busy visitor must never exhaust the map for a whole community.
    """
    auth = request.headers.get("authorization", "")
    presented = auth[7:].strip() if auth.lower().startswith("bearer ") else \
        request.headers.get("x-api-key", "")
    client = lookup_client(presented)
    if client and client != "public-demo":
        return f"client:{client}"
    return f"ip:{_visitor_ip(request)}"


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
