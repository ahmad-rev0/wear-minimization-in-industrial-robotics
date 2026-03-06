"""
API route definitions for the ROBOTWIN backend.

Endpoints:
    POST /upload_dataset   — upload a robot sensor CSV
    POST /run_analysis     — trigger the full ML pipeline
    GET  /results          — retrieve latest analysis results
    GET  /robot_model      — get 3D robot model joint data
"""

import logging
import shutil
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile, File, Query

from backend.models.schemas import (
    UploadResponse,
    AnalysisResult,
    RobotModelData,
    StatusResponse,
)
from backend.services.state import get_state, UPLOAD_DIR, DEFAULT_SENSOR_CSV
from backend.services.pipeline_service import run_pipeline
from backend.services.visualization_service import build_robot_model

log = logging.getLogger(__name__)
router = APIRouter()


# ── POST /upload_dataset ─────────────────────────────────────

@router.post("/upload_dataset", response_model=UploadResponse)
async def upload_dataset(file: UploadFile = File(...)):
    """Accept a sensor CSV and store it for analysis."""
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are accepted")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dest = UPLOAD_DIR / file.filename
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        df = pd.read_csv(dest, nrows=5)
    except Exception as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {exc}")

    row_count = sum(1 for _ in open(dest, encoding="utf-8")) - 1  # minus header

    state = get_state()
    state.sensor_csv = dest
    state.status = "idle"
    state.results = None

    return UploadResponse(
        filename=file.filename,
        rows=row_count,
        columns=list(df.columns),
        message="Dataset uploaded successfully. Call POST /api/run_analysis to process.",
    )


# ── POST /run_analysis ───────────────────────────────────────

@router.post("/run_analysis", response_model=StatusResponse)
async def run_analysis(
    use_default: bool = Query(
        False, description="Use the bundled example dataset instead of an upload"
    ),
):
    """Run the full wear-analysis pipeline on the uploaded (or default) dataset."""
    state = get_state()

    sensor_csv = state.sensor_csv
    if use_default or sensor_csv is None:
        sensor_csv = DEFAULT_SENSOR_CSV

    if not sensor_csv.exists():
        raise HTTPException(status_code=404, detail="No dataset found. Upload one first.")

    state.status = "running"
    state.error = None

    try:
        results = run_pipeline(sensor_csv, state.materials_csv)
        state.results = results
        state.status = "done"
        return StatusResponse(status="done", message="Analysis complete.")
    except Exception as exc:
        log.exception("Pipeline failed")
        state.status = "error"
        state.error = str(exc)
        raise HTTPException(status_code=500, detail=f"Pipeline error: {exc}")


# ── GET /results ─────────────────────────────────────────────

@router.get("/results", response_model=AnalysisResult)
async def get_results():
    """Return the latest pipeline analysis results."""
    state = get_state()

    if state.status == "idle":
        raise HTTPException(status_code=404, detail="No analysis has been run yet.")
    if state.status == "running":
        raise HTTPException(status_code=202, detail="Analysis is still running.")
    if state.status == "error":
        raise HTTPException(status_code=500, detail=f"Last run failed: {state.error}")

    return state.results


# ── GET /robot_model ─────────────────────────────────────────

@router.get("/robot_model", response_model=RobotModelData)
async def get_robot_model():
    """Return 3D joint positions and wear data for the viewer."""
    state = get_state()

    if state.results is None:
        raise HTTPException(
            status_code=404,
            detail="Run an analysis first (POST /api/run_analysis).",
        )

    return build_robot_model(state.results)


# ── GET /health ─────────────────────────────────────────────

@router.get("/health")
async def api_health():
    """Health check reachable under /api/health (mirrors root /health)."""
    state = get_state()
    return {
        "status": "ok",
        "service": "robotwin",
        "pipeline_status": state.status,
    }
