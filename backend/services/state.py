"""
In-memory application state shared across requests.

Stores the path to the last uploaded dataset, the latest
analysis results, and the inferred schema / quality report.
Sufficient for a single-user prototype; swap for Redis / DB
in production.
"""

from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, Any

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
MATERIALS_CSV = DATA_DIR / "materials.csv"
DEFAULT_SENSOR_CSV = DATA_DIR / "robot_sensor_data.csv"


@dataclass
class AppState:
    sensor_csv: Optional[Path] = None
    materials_csv: Path = MATERIALS_CSV
    status: str = "idle"  # idle | running | done | error
    error: Optional[str] = None
    progress: str = ""  # human-readable pipeline stage description
    results: Optional[dict] = None
    # Schema inference + data quality (set during upload)
    inferred_schema: Optional[Any] = None   # DatasetSchema dataclass
    quality_report: Optional[Any] = None    # DataQualityReport dataclass
    schema_overrides: Optional[dict] = None # user-provided overrides
    canonical_dataset: Optional[Any] = None # CanonicalDataset dataclass
    # Feature selection (set via /training_config)
    feature_selection_config: Optional[Any] = None  # FeatureSelectionConfig
    cached_features: Optional[Any] = None           # full feature DataFrame
    # Joint parameters (set via /joint_parameters)
    joint_params: Optional[dict] = None             # dict[str, JointParameters]
    # ML model config (set via /model_config)
    model_config: Optional[Any] = None              # ModelConfig dataclass
    # ML diagnostics (set after pipeline run)
    diagnostics: Optional[Any] = None               # DiagnosticsReport dataclass
    # Model comparison: model_id → {silhouette, display_name}
    model_comparison: dict = field(default_factory=dict)
    # Pipeline config
    max_rows: int = 20000                            # auto-downsample limit
    contamination: float = 0.1                       # anomaly fraction for detection
    deselected_features: list = field(default_factory=list)  # features to exclude
    # Joint mapping
    robot_image_path: Optional[Path] = None          # uploaded robot side-profile image
    custom_joint_layout: Optional[list] = None       # [{joint_id, nx, ny}, ...] normalised 2D


_state = AppState()


def get_state() -> AppState:
    return _state


def reset_state() -> None:
    global _state
    _state = AppState()
