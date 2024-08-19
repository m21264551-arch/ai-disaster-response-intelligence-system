from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AI Disaster-Response Intelligence System"
    mode: str = "demo"
    load_trained_model: bool = False
    database_url: str = "postgresql://disaster:local-demo-password@localhost:5432/disaster_intel"
    firms_map_key: str | None = None
    nsw_rfs_incidents_url: str = "https://www.rfs.nsw.gov.au/feeds/majorIncidents.json"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="DISASTER_INTEL_",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
