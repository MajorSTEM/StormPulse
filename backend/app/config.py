from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    app_name: str = "StormPulse"
    nws_user_agent: str = "NOAA_OD"
    noaa_api_key: str = ""
    ingest_interval_seconds: int = 300
    database_url: str = "sqlite+aiosqlite:///./stormpulse.db"
    cors_origins: List[str] = ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"]

    class Config:
        env_file = ".env"

settings = Settings()
