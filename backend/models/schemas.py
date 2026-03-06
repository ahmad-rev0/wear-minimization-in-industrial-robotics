"""
Pydantic schemas for API request/response validation.
"""

from __future__ import annotations

from pydantic import BaseModel


# ── Sensor data ──────────────────────────────────────────────

class SensorRow(BaseModel):
    """Single row of tri-axial magnetometer sensor data."""
    timestamp: float
    joint_id: str
    mx: float
    my: float
    mz: float


# ── Upload ───────────────────────────────────────────────────

class UploadResponse(BaseModel):
    filename: str
    rows: int
    columns: list[str]
    message: str


# ── Analysis ─────────────────────────────────────────────────

class JointWear(BaseModel):
    """Wear analysis result for a single joint."""
    joint_id: str
    anomaly_rate: float
    signal_energy: float
    wear_index: float
    wear_status: str  # "healthy" | "moderate" | "severe"


class MaterialRecommendation(BaseModel):
    """A single material recommendation entry."""
    material_name: str
    wear_coefficient: float
    hardness: float
    friction_coefficient: float
    wear_reduction_pct: float


class WearSimulationPoint(BaseModel):
    """Single point in a wear projection time-series."""
    time: int
    projected_wear: float


class JointSimulation(BaseModel):
    joint_id: str
    trajectory: list[WearSimulationPoint]


class MaterialScenario(BaseModel):
    """Wear trajectory for a specific joint under a specific material."""
    joint_id: str
    material_name: str
    trajectory: list[WearSimulationPoint]


class AnalysisResult(BaseModel):
    """Full pipeline output returned by GET /results."""
    joints: list[JointWear]
    recommendations: list[MaterialRecommendation]
    simulation: list[JointSimulation]
    material_scenarios: list[MaterialScenario]
    timeline: dict  # raw time-series for the sensor chart


# ── 3D Viewer ────────────────────────────────────────────────

class JointModel(BaseModel):
    """One joint in the 3D robot viewer."""
    joint_id: str
    x: float
    y: float
    z: float
    wear_index: float
    color: str  # hex colour


class RobotModelData(BaseModel):
    """Joint positions and wear colours for the 3D viewer."""
    joints: list[JointModel]


# ── Generic ──────────────────────────────────────────────────

class StatusResponse(BaseModel):
    status: str
    message: str | None = None
