"""
Pydantic schemas for API request/response validation.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


# ── Sensor data ──────────────────────────────────────────────

class SensorRow(BaseModel):
    """Single row of tri-axial magnetometer sensor data."""
    timestamp: float
    joint_id: str
    mx: float
    my: float
    mz: float


# ── Schema inference ─────────────────────────────────────────

class SensorGroupSchema(BaseModel):
    modality: str
    columns: list[str]
    axes: list[str]


class InferredSchema(BaseModel):
    timestamp_column: Optional[str] = None
    joint_column: Optional[str] = None
    sensor_groups: dict[str, SensorGroupSchema] = {}
    unmapped_columns: list[str] = []
    inferred: bool = True
    confidence: float = 0.0


class SchemaOverrideRequest(BaseModel):
    """User-provided column mapping overrides."""
    timestamp: Optional[str] = None
    joint: Optional[str] = None
    sensors: Optional[dict[str, list[str]]] = None


class ColumnStatsSchema(BaseModel):
    column: str
    dtype: str
    missing_count: int
    missing_pct: float
    unique_count: int
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    mean_val: Optional[float] = None
    std_val: Optional[float] = None
    outlier_count: int = 0


class DataQualityReportSchema(BaseModel):
    total_rows: int = 0
    total_columns: int = 0
    duplicate_rows: int = 0
    fully_null_columns: list[str] = []
    column_stats: list[ColumnStatsSchema] = []
    sampling_rate_hz: Optional[float] = None
    sampling_rate_std: Optional[float] = None
    timestamp_gaps: int = 0
    timestamp_non_monotonic: bool = False
    joint_names: list[str] = []
    joint_count: int = 0
    warnings: list[str] = []
    is_valid: bool = True


class DatasetInfoResponse(BaseModel):
    """Combined schema + quality report for the current dataset."""
    filename: Optional[str] = None
    schema_info: Optional[InferredSchema] = None
    quality_report: Optional[DataQualityReportSchema] = None


# ── Feature selection ────────────────────────────────────────

class FeatureMetadata(BaseModel):
    """Stats for a single computed feature (for the selection UI)."""
    name: str
    dtype: str
    mean: Optional[float] = None
    std: Optional[float] = None
    min: Optional[float] = None
    max: Optional[float] = None
    n_unique: int = 0
    pct_zero: Optional[float] = None
    category: str = "other"  # statistical | spectral | vibration | thermal | other


class AvailableFeaturesResponse(BaseModel):
    """All features that can be generated for the current dataset."""
    total_features: int = 0
    features: list[FeatureMetadata] = []
    categories: dict[str, int] = {}


class TrainingConfigRequest(BaseModel):
    """User-provided feature selection for ML training."""
    selected_features: Optional[list[str]] = None
    exclude_features: Optional[list[str]] = None
    min_variance_threshold: float = 0.0


class TrainingConfigResponse(BaseModel):
    """Confirmation of the active feature selection."""
    active_features: int
    total_available: int
    selected_features: Optional[list[str]] = None
    excluded_features: list[str] = []
    min_variance_threshold: float = 0.0


# ── Joint parameters (physics model) ─────────────────────────

class JointParametersSchema(BaseModel):
    """Physical parameters for a single robot joint."""
    joint_id: str
    load_force: Optional[float] = None          # [N]
    joint_radius: Optional[float] = None        # [m]
    material: Optional[str] = None
    lubrication_coefficient: Optional[float] = None  # 0-1
    contact_area: Optional[float] = None        # [m²]
    hardness: Optional[float] = None            # [HV]
    sliding_velocity: Optional[float] = None    # [m/s]


class JointParametersRequest(BaseModel):
    """User-provided joint mechanical parameters."""
    joints: list[JointParametersSchema]


class JointParametersResponse(BaseModel):
    """Current joint parameters (merged defaults + overrides)."""
    joints: list[JointParametersSchema]
    source: str = "default"  # "default" | "user_override"


# ── Model configuration ─────────────────────────────────────

class HyperparamInfo(BaseModel):
    """Metadata for a single hyperparameter."""
    name: str
    dtype: str
    default: Optional[float | int | str | bool] = None
    min_val: Optional[float | int] = None
    max_val: Optional[float | int] = None
    description: str = ""


class ModelInfo(BaseModel):
    """Registry entry for one available model."""
    model_id: str
    display_name: str
    description: str
    hyperparams: list[HyperparamInfo] = []


class AvailableModelsResponse(BaseModel):
    """All available anomaly detection algorithms."""
    models: list[ModelInfo]
    active_model: str


class ModelConfigRequest(BaseModel):
    """User-selected model and hyperparameters."""
    model: str                           # model_id
    params: Optional[dict] = None        # hyperparameter overrides
    random_state: int = 42


class ModelConfigResponse(BaseModel):
    """Confirmation of active model configuration."""
    model_id: str
    display_name: str
    params: dict
    random_state: int


# ── Upload ───────────────────────────────────────────────────

class UploadResponse(BaseModel):
    filename: str
    rows: int
    columns: list[str]
    message: str
    schema_info: Optional[InferredSchema] = None
    quality_report: Optional[DataQualityReportSchema] = None


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


# ── ML Diagnostics ───────────────────────────────────────────

class ScoreDistributionSchema(BaseModel):
    joint_id: str
    mean: float
    std: float
    min: float
    max: float
    median: float
    q25: float
    q75: float
    n_total: int
    n_anomalies: int
    anomaly_rate: float
    histogram_bins: list[float] = []
    histogram_counts: list[int] = []


class UnsupervisedMetricsSchema(BaseModel):
    silhouette_score: Optional[float] = None
    calinski_harabasz_score: Optional[float] = None
    global_anomaly_rate: float = 0.0
    n_total: int = 0
    n_anomalies: int = 0
    score_distributions: list[ScoreDistributionSchema] = []
    overall_distribution: Optional[ScoreDistributionSchema] = None


class ConfusionMatrixSchema(BaseModel):
    tp: int = 0
    fp: int = 0
    tn: int = 0
    fn: int = 0
    precision: float = 0.0
    recall: float = 0.0
    f1_score: float = 0.0
    accuracy: float = 0.0
    support_normal: int = 0
    support_anomaly: int = 0
    matrix: list[list[int]] = [[0, 0], [0, 0]]
    labels: list[str] = ["Normal", "Anomaly"]


class ROCCurveSchema(BaseModel):
    fpr: list[float] = []
    tpr: list[float] = []
    thresholds: list[float] = []
    auc: float = 0.0


class SupervisedMetricsSchema(BaseModel):
    has_labels: bool = False
    confusion_matrix: Optional[ConfusionMatrixSchema] = None
    roc_curve: Optional[ROCCurveSchema] = None
    per_joint: Optional[dict[str, ConfusionMatrixSchema]] = None


class FeatureImportanceEntrySchema(BaseModel):
    feature: str
    importance: float
    std: float = 0.0
    rank: int = 0


class FeatureImportanceSchema(BaseModel):
    method: str = "correlation"
    features: list[FeatureImportanceEntrySchema] = []
    top_n: int = 0


class DiagnosticsResponse(BaseModel):
    """Full ML diagnostics returned by GET /diagnostics."""
    model_id: str
    model_display_name: str
    n_features_used: int = 0
    feature_names: list[str] = []
    unsupervised: Optional[UnsupervisedMetricsSchema] = None
    supervised: Optional[SupervisedMetricsSchema] = None
    feature_importance: Optional[FeatureImportanceSchema] = None


# ── 3D Viewer ────────────────────────────────────────────────

class JointModel(BaseModel):
    """One joint in the 3D robot viewer."""
    joint_id: str
    x: float
    y: float
    z: float
    wear_index: float
    color: str  # hex colour
    wear_status: str = "healthy"
    anomaly_rate: float = 0.0
    signal_energy: float = 0.0


class RobotModelData(BaseModel):
    """Joint positions and wear colours for the 3D viewer."""
    joints: list[JointModel]


# ── Generic ──────────────────────────────────────────────────

class StatusResponse(BaseModel):
    status: str
    message: str | None = None
