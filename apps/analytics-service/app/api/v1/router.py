"""Analytics Service API v1 router."""

import time
from datetime import datetime, timezone
from fastapi import APIRouter, Request

api_router = APIRouter()


@api_router.get("/health", tags=["health"])
async def health_check(request: Request) -> dict:
    start_time = getattr(request.app.state, "start_time", time.time())
    uptime = int(time.time() - start_time)
    return {
        "status": "healthy",
        "service": "analytics-service",
        "version": "0.1.0",
        "uptime": uptime,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {"server": {"status": "healthy"}},
    }


@api_router.get("/health/ready", tags=["health"])
async def readiness_check() -> dict:
    return {"status": "ready"}
