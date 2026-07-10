"""
AI Career OS — AI Service
FastAPI application for AI-powered career intelligence features.
"""

import time
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.logging import setup_logging
from app.api.v1.router import api_router


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager — startup and shutdown hooks."""
    logger = setup_logging("ai-service")
    logger.info("AI Service starting up")
    application.state.start_time = time.time()
    yield
    logger.info("AI Service shutting down")


def create_app() -> FastAPI:
    """FastAPI application factory."""
    settings = get_settings()

    application = FastAPI(
        title="AI Career OS — AI Service",
        description="AI-powered career intelligence service",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # ─── CORS Middleware ──────────────────────────────
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ─── Routes ───────────────────────────────────────
    application.include_router(api_router, prefix="/api/v1")

    return application


app = create_app()
