from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    app_name: str = "StormPulse"
    nws_user_agent: str = "NOAA_OD"
    noaa_api_key: str = ""
    ingest_interval_seconds: int = 300
    database_url: str = "sqlite+aiosqlite:///./stormpulse.db"
    cors_origins: List[str] = ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"]

    # ── V2 hardened API layer ────────────────────────────────────────────────
    # Client API keys as "key:client_name" pairs, comma-separated. The default
    # is a published demo credential for the public map frontend — override
    # API_KEYS in production to issue real per-client keys (see docs/DEPLOYMENT.md).
    api_keys: str = "stormpulse-demo-key:public-demo"
    # Per-client rate limit (slowapi format), applied to every route.
    rate_limit: str = "120/minute"
    # Data older than this (since last successful upstream ingestion) is
    # flagged stale: true and triggers the UI staleness banner.
    stale_threshold_seconds: int = 900
    # Disable to run the API without background ingestion (tests, docs builds).
    enable_scheduler: bool = True

    class Config:
        env_file = ".env"

    def api_key_map(self) -> dict[str, str]:
        """Parse api_keys into {key: client_name}. A bare key maps to itself."""
        mapping: dict[str, str] = {}
        for entry in self.api_keys.split(","):
            entry = entry.strip()
            if not entry:
                continue
            key, _, client = entry.partition(":")
            mapping[key.strip()] = (client.strip() or key.strip())
        return mapping

settings = Settings()
