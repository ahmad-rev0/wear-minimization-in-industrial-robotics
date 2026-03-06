"""
In-memory application state shared across requests.

Stores the path to the last uploaded dataset and the latest
analysis results.  Sufficient for a single-user prototype;
swap for Redis / DB in production.
"""

from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

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
    results: Optional[dict] = None


_state = AppState()


def get_state() -> AppState:
    return _state


def reset_state() -> None:
    global _state
    _state = AppState()
