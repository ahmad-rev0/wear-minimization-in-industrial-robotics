"""
ROBOFIX Backend — FastAPI application entry point.

Serves the REST API for dataset upload, analysis execution,
result retrieval, and 3D robot model data.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import router
from backend.services.state import UPLOAD_DIR

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    log.info("ROBOFIX backend starting — upload dir: %s", UPLOAD_DIR)
    yield
    log.info("ROBOFIX backend shutting down")


app = FastAPI(
    title="ROBOFIX",
    description="AI-powered predictive maintenance and wear optimization for industrial robots",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "robofix"}
