"""
Configuration management using Pydantic Settings.
Validates all environment variables at startup with strong typing.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # ─── Application ──────────────────────────────────
    app_name: str = "ai-service"
    debug: bool = False
    environment: str = "development"
    log_level: str = "INFO"
    port: int = 3005

    # ─── CORS ─────────────────────────────────────────
    cors_origins: list[str] = ["http://localhost:3000"]

    # ─── Redis ────────────────────────────────────────
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_password: str = ""

    # ─── MongoDB ──────────────────────────────────────
    mongo_uri: str = "mongodb://localhost:27017/ai_career_os"

    # ─── AI / LLM ────────────────────────────────────
    openai_api_key: str = ""
    openai_model: str = "gpt-4"
    openai_max_tokens: int = 4096

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }


@lru_cache
def get_settings() -> Settings:
    """Get cached application settings (singleton)."""
    return Settings()
