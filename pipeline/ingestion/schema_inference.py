"""
Automatic schema inference for arbitrary robotics sensor datasets.

Classifies each CSV column into a semantic role (timestamp, joint identifier,
sensor modality) using a two-pass strategy:
    1. **Name-based**: regex patterns against column headers
    2. **Data-based**: statistical heuristics on sample rows

The output `DatasetSchema` feeds into the dataset mapper and validator.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd


# ── Data structures ──────────────────────────────────────────

SENSOR_MODALITIES = [
    "accelerometer",
    "gyroscope",
    "magnetometer",
    "vibration",
    "temperature",
    "torque",
    "motor_current",
    "strain",
    "force",
    "position",
    "velocity",
]


@dataclass
class SensorGroup:
    """A group of columns belonging to a single sensor modality."""

    modality: str
    columns: list[str]
    axes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "modality": self.modality,
            "columns": self.columns,
            "axes": self.axes,
        }


@dataclass
class DatasetSchema:
    """Inferred (or user-overridden) schema for a dataset."""

    timestamp_column: Optional[str] = None
    joint_column: Optional[str] = None
    sensor_groups: dict[str, SensorGroup] = field(default_factory=dict)
    unmapped_columns: list[str] = field(default_factory=list)
    inferred: bool = True
    confidence: float = 0.0

    def to_dict(self) -> dict:
        return {
            "timestamp_column": self.timestamp_column,
            "joint_column": self.joint_column,
            "sensor_groups": {
                k: v.to_dict() for k, v in self.sensor_groups.items()
            },
            "unmapped_columns": self.unmapped_columns,
            "inferred": self.inferred,
            "confidence": round(self.confidence, 3),
        }

    @property
    def all_sensor_columns(self) -> list[str]:
        cols: list[str] = []
        for sg in self.sensor_groups.values():
            cols.extend(sg.columns)
        return cols

    @property
    def n_modalities(self) -> int:
        return len(self.sensor_groups)


# ── Pattern tables ───────────────────────────────────────────

# Each entry: (compiled_regex, modality, axis_hint)
# axis_hint is used to assign x/y/z labels within a group.

_TIMESTAMP_PATTERNS = [
    re.compile(r"^timestamp$", re.I),
    re.compile(r"^time(?:_?(?:s|ms|sec|stamp))?$", re.I),
    re.compile(r"^t$", re.I),
    re.compile(r"^ts$", re.I),
    re.compile(r"^epoch", re.I),
    re.compile(r"^date", re.I),
    re.compile(r"^sample_?(?:time|idx|index|num(?:ber)?)$", re.I),
]

_JOINT_PATTERNS = [
    re.compile(r"^joint(?:_?id)?$", re.I),
    re.compile(r"^name$", re.I),
    re.compile(r"^sensor(?:_?(?:id|name))?$", re.I),
    re.compile(r"^link(?:_?(?:id|name))?$", re.I),
    re.compile(r"^axis_?id$", re.I),
    re.compile(r"^id$", re.I),
    re.compile(r"^component$", re.I),
    re.compile(r"^segment$", re.I),
    re.compile(r"^robot_?(?:part|joint|link)$", re.I),
]

# (pattern, modality, axis_hint)
_SENSOR_PATTERNS: list[tuple[re.Pattern, str, str]] = [
    # Accelerometer
    (re.compile(r"^acc(?:el(?:eration)?)?[_\-]?x$", re.I), "accelerometer", "x"),
    (re.compile(r"^acc(?:el(?:eration)?)?[_\-]?y$", re.I), "accelerometer", "y"),
    (re.compile(r"^acc(?:el(?:eration)?)?[_\-]?z$", re.I), "accelerometer", "z"),
    (re.compile(r"^a[_\-]?x$", re.I), "accelerometer", "x"),
    (re.compile(r"^a[_\-]?y$", re.I), "accelerometer", "y"),
    (re.compile(r"^a[_\-]?z$", re.I), "accelerometer", "z"),
    (re.compile(r"^accel", re.I), "accelerometer", ""),
    (re.compile(r"^acc[XYZ0-9]", re.I), "accelerometer", ""),
    (re.compile(r"^linear_?acc", re.I), "accelerometer", ""),
    # Gyroscope
    (re.compile(r"^gyro(?:scope)?[_\-]?x$", re.I), "gyroscope", "x"),
    (re.compile(r"^gyro(?:scope)?[_\-]?y$", re.I), "gyroscope", "y"),
    (re.compile(r"^gyro(?:scope)?[_\-]?z$", re.I), "gyroscope", "z"),
    (re.compile(r"^g[_\-]?x$", re.I), "gyroscope", "x"),
    (re.compile(r"^g[_\-]?y$", re.I), "gyroscope", "y"),
    (re.compile(r"^g[_\-]?z$", re.I), "gyroscope", "z"),
    (re.compile(r"^gyro", re.I), "gyroscope", ""),
    (re.compile(r"^angular", re.I), "gyroscope", ""),
    # Magnetometer
    (re.compile(r"^mag(?:net(?:ometer)?)?[_\-]?x$", re.I), "magnetometer", "x"),
    (re.compile(r"^mag(?:net(?:ometer)?)?[_\-]?y$", re.I), "magnetometer", "y"),
    (re.compile(r"^mag(?:net(?:ometer)?)?[_\-]?z$", re.I), "magnetometer", "z"),
    (re.compile(r"^m[_\-]?x$", re.I), "magnetometer", "x"),
    (re.compile(r"^m[_\-]?y$", re.I), "magnetometer", "y"),
    (re.compile(r"^m[_\-]?z$", re.I), "magnetometer", "z"),
    (re.compile(r"^mag[XYZ0-9]", re.I), "magnetometer", ""),
    # Vibration
    (re.compile(r"^vib(?:ration)?", re.I), "vibration", ""),
    # Temperature
    (re.compile(r"^temp(?:erature)?", re.I), "temperature", ""),
    (re.compile(r"^thermal", re.I), "temperature", ""),
    # Torque
    (re.compile(r"^torque", re.I), "torque", ""),
    (re.compile(r"^tau", re.I), "torque", ""),
    # Motor current
    (re.compile(r"^(?:motor_?)?current", re.I), "motor_current", ""),
    (re.compile(r"^i[_\-]", re.I), "motor_current", ""),
    # Strain
    (re.compile(r"^strain", re.I), "strain", ""),
    (re.compile(r"^stress", re.I), "strain", ""),
    # Force
    (re.compile(r"^force", re.I), "force", ""),
    (re.compile(r"^load", re.I), "force", ""),
    (re.compile(r"^f[_\-]?[xyz]$", re.I), "force", ""),
    # Position
    (re.compile(r"^pos(?:ition)?", re.I), "position", ""),
    (re.compile(r"^angle", re.I), "position", ""),
    (re.compile(r"^theta", re.I), "position", ""),
    (re.compile(r"^q[_\-]?\d", re.I), "position", ""),
    # Velocity
    (re.compile(r"^vel(?:ocity)?", re.I), "velocity", ""),
    (re.compile(r"^speed", re.I), "velocity", ""),
    (re.compile(r"^omega", re.I), "velocity", ""),
]


# ── Name-based classification ────────────────────────────────

def _match_timestamp(col: str) -> bool:
    return any(p.match(col) for p in _TIMESTAMP_PATTERNS)


def _match_joint(col: str) -> bool:
    return any(p.match(col) for p in _JOINT_PATTERNS)


def _match_sensor(col: str) -> Optional[tuple[str, str]]:
    """Return (modality, axis_hint) if matched, else None."""
    for pattern, modality, axis in _SENSOR_PATTERNS:
        if pattern.match(col):
            if not axis:
                axis = _guess_axis_from_name(col)
            return (modality, axis)
    return None


def _guess_axis_from_name(col: str) -> str:
    """Try to extract an axis suffix like X/Y/Z or a trailing digit."""
    low = col.lower().rstrip()
    if low.endswith("x") or low.endswith("_x"):
        return "x"
    if low.endswith("y") or low.endswith("_y"):
        return "y"
    if low.endswith("z") or low.endswith("_z"):
        return "z"
    m = re.search(r"(\d+)$", col)
    if m:
        return f"ch{m.group(1)}"
    return col


# ── Data-based heuristics ────────────────────────────────────

def _heuristic_timestamp(series: pd.Series) -> float:
    """Score 0-1 for how likely a numeric column is a timestamp."""
    if not np.issubdtype(series.dtype, np.number):
        return 0.0
    score = 0.0
    clean = series.dropna()
    if len(clean) < 2:
        return 0.0
    diffs = clean.diff().dropna()
    if len(diffs) == 0:
        return 0.0
    # Monotonically increasing → strong timestamp signal
    if (diffs >= 0).mean() > 0.98:
        score += 0.5
    # Low relative variance in step sizes → regular sampling
    if diffs.std() / (diffs.mean() + 1e-12) < 0.1:
        score += 0.3
    # Values tend to be large (epoch) or start near 0 (relative)
    if clean.iloc[0] >= 0:
        score += 0.1
    return min(score, 1.0)


def _heuristic_joint(series: pd.Series) -> float:
    """Score 0-1 for how likely a column is a joint/sensor identifier."""
    if np.issubdtype(series.dtype, np.number):
        nunique = series.nunique()
        if 1 <= nunique <= 30 and nunique < len(series) * 0.01:
            return 0.5
        return 0.0
    # String column
    nunique = series.nunique()
    if nunique < 1:
        return 0.0
    ratio = nunique / len(series)
    if 1 <= nunique <= 50 and ratio < 0.05:
        return 0.8
    if nunique == 1:
        return 0.6
    return 0.0


def _heuristic_sensor(series: pd.Series) -> float:
    """Score 0-1 for how likely a numeric column is a sensor signal."""
    if not np.issubdtype(series.dtype, np.number):
        return 0.0
    clean = series.dropna()
    if len(clean) < 10:
        return 0.0
    score = 0.0
    # Non-monotonic (unlike timestamps)
    diffs = clean.diff().dropna()
    if (diffs >= 0).mean() < 0.9:
        score += 0.3
    # Has reasonable variance (not constant)
    if clean.std() > 1e-8:
        score += 0.3
    # Continuous values (not just integers 1-10)
    if clean.dtype == np.float64 or clean.nunique() > 20:
        score += 0.2
    return min(score, 1.0)


# ── Main inference ───────────────────────────────────────────

def infer_schema(
    df: pd.DataFrame,
    max_sample_rows: int = 2000,
) -> DatasetSchema:
    """
    Infer the semantic schema of a robotics sensor dataset.

    Pass 1: Pattern-match column names against known sensor naming conventions.
    Pass 2: For unresolved columns, apply statistical heuristics on data samples.

    Parameters
    ----------
    df : DataFrame to analyze (or a sample of it).
    max_sample_rows : cap on rows used for heuristic analysis.

    Returns
    -------
    DatasetSchema with classified columns and a confidence score.
    """
    sample = df.head(max_sample_rows)
    columns = list(df.columns)

    timestamp_col: Optional[str] = None
    joint_col: Optional[str] = None
    sensor_hits: dict[str, list[tuple[str, str]]] = {}
    unmatched: list[str] = []
    matched_count = 0

    # ── Pass 1: name-based matching ──
    for col in columns:
        if timestamp_col is None and _match_timestamp(col):
            timestamp_col = col
            matched_count += 1
            continue

        if joint_col is None and _match_joint(col):
            joint_col = col
            matched_count += 1
            continue

        sensor_match = _match_sensor(col)
        if sensor_match:
            modality, axis = sensor_match
            sensor_hits.setdefault(modality, []).append((col, axis))
            matched_count += 1
            continue

        unmatched.append(col)

    # ── Pass 2: heuristic fallback for unmatched columns ──
    still_unmatched: list[str] = []

    for col in unmatched:
        series = sample[col]

        # Try timestamp
        if timestamp_col is None and _heuristic_timestamp(series) > 0.6:
            timestamp_col = col
            matched_count += 1
            continue

        # Try joint identifier
        if joint_col is None and _heuristic_joint(series) > 0.5:
            joint_col = col
            matched_count += 1
            continue

        # Try sensor signal
        if _heuristic_sensor(series) > 0.5:
            sensor_hits.setdefault("unknown_signal", []).append((col, col))
            matched_count += 1
            continue

        still_unmatched.append(col)

    # ── Build SensorGroups ──
    sensor_groups: dict[str, SensorGroup] = {}
    for modality, col_axis_pairs in sensor_hits.items():
        cols = [c for c, _ in col_axis_pairs]
        axes = [a for _, a in col_axis_pairs]
        sensor_groups[modality] = SensorGroup(
            modality=modality, columns=cols, axes=axes
        )

    # ── Confidence score ──
    total = len(columns)
    confidence = matched_count / total if total > 0 else 0.0
    if timestamp_col:
        confidence = min(confidence + 0.1, 1.0)
    if sensor_groups:
        confidence = min(confidence + 0.1, 1.0)

    return DatasetSchema(
        timestamp_column=timestamp_col,
        joint_column=joint_col,
        sensor_groups=sensor_groups,
        unmapped_columns=still_unmatched,
        inferred=True,
        confidence=confidence,
    )


def apply_user_overrides(
    schema: DatasetSchema,
    overrides: dict,
) -> DatasetSchema:
    """
    Merge user-provided column mappings into an inferred schema.

    Override format:
    {
        "timestamp": "my_time_col",
        "joint": "my_joint_col",
        "sensors": {
            "vibration": ["vib1", "vib2"],
            "temperature": ["temp_c"],
        }
    }
    """
    if "timestamp" in overrides and overrides["timestamp"]:
        schema.timestamp_column = overrides["timestamp"]
    if "joint" in overrides and overrides["joint"]:
        schema.joint_column = overrides["joint"]

    if "sensors" in overrides and isinstance(overrides["sensors"], dict):
        for modality, cols in overrides["sensors"].items():
            if not isinstance(cols, list):
                cols = [cols]
            axes = [_guess_axis_from_name(c) for c in cols]
            schema.sensor_groups[modality] = SensorGroup(
                modality=modality, columns=cols, axes=axes
            )
            # Remove these from unmapped
            for c in cols:
                if c in schema.unmapped_columns:
                    schema.unmapped_columns.remove(c)

    schema.inferred = False
    return schema
