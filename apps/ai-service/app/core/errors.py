"""
Standardized error handling for AI service.
Consistent with the Node.js error envelope format.
"""

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from datetime import datetime, timezone
import uuid


class AppError(HTTPException):
    """Base application error."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: list[dict] | None = None,
    ):
        self.code = code
        self.error_message = message
        self.details = details
        super().__init__(status_code=status_code, detail=message)


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Handle AppError exceptions with standard envelope."""
    request_id = request.headers.get("x-request-id", str(uuid.uuid4()))

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": exc.code,
                "message": exc.error_message,
                "requestId": request_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "details": exc.details,
            },
        },
    )


async def generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle uncaught exceptions."""
    request_id = request.headers.get("x-request-id", str(uuid.uuid4()))

    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected error occurred",
                "requestId": request_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        },
    )
