"""Configuration for Analytics Service."""

from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "analytics-service"
    debug: bool = False
    environment: str = "development"
    log_level: str = "INFO"
    port: int = 3010
    cors_origins: list[str] = ["http://localhost:3000"]
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_password: str = ""
    mongo_uri: str = "mongodb://localhost:27017/ai_career_os"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "ai_career_os"
    postgres_password: str = "changeme_postgres"
    postgres_db: str = "ai_career_os"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()
