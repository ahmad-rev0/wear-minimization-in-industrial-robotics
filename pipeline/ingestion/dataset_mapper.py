"""
Dataset mapper — transforms a raw DataFrame into a canonical internal
representation that downstream pipeline stages can consume uniformly,
regardless of the original column names or schema.

The mapper operates on a validated DatasetSchema and produces a
CanonicalDataset that exposes:
    - A normalised time series per joint
    - Sensor arrays keyed by modality
    - Metadata (joint names, sampling rate, etc.)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd

from pipeline.ingestion.schema_inference import DatasetSchema


@dataclass
class JointData:
    """All sensor data for a single joint after mapping."""

    joint_name: str
    time: np.ndarray                              # normalised timestamps
    sensors: dict[str, np.ndarray] = field(default_factory=dict)
    # e.g. {"accelerometer_x": array, "magnetometer_z": array, "temperature": array}

    @property
    def n_samples(self) -> int:
        return len(self.time)

    @property
    def sensor_names(self) -> list[str]:
        return list(self.sensors.keys())


@dataclass
class CanonicalDataset:
    """
    The pipeline-internal representation of any ingested dataset.

    Downstream modules (feature engineering, anomaly detection, etc.)
    program against this interface — never against raw column names.
    """

    joints: dict[str, JointData] = field(default_factory=dict)
    schema: Optional[DatasetSchema] = None
    sampling_rate_hz: Optional[float] = None
    metadata: dict = field(default_factory=dict)

    @property
    def joint_names(self) -> list[str]:
        return sorted(self.joints.keys())

    @property
    def n_joints(self) -> int:
        return len(self.joints)

    @property
    def all_modalities(self) -> set[str]:
        mods: set[str] = set()
        for jd in self.joints.values():
            for key in jd.sensors:
                mod = key.rsplit("_", 1)[0] if "_" in key else key
                mods.add(mod)
        return mods

    def to_summary(self) -> dict:
        return {
            "n_joints": self.n_joints,
            "joint_names": self.joint_names,
            "modalities": sorted(self.all_modalities),
            "sampling_rate_hz": self.sampling_rate_hz,
            "samples_per_joint": {
                name: jd.n_samples for name, jd in self.joints.items()
            },
        }


# ── Canonical key builders ───────────────────────────────────

def _canonical_sensor_key(modality: str, axis: str) -> str:
    """Build a consistent key like 'magnetometer_x' or 'temperature'."""
    if axis and axis != modality:
        return f"{modality}_{axis}"
    return modality


# ── Normalise timestamps ────────────────────────────────────

def _epoch_divisor(values: np.ndarray) -> float:
    """Guess the time unit from the absolute magnitude of epoch values."""
    ref = abs(float(values[0]))
    if ref > 1e17:
        return 1e9    # nanoseconds
    if ref > 1e14:
        return 1e6    # microseconds
    if ref > 1e11:
        return 1e3    # milliseconds
    return 1.0        # already seconds or arbitrary


def _normalise_time(series: pd.Series) -> np.ndarray:
    """Convert timestamp column to seconds starting from 0."""
    arr = series.to_numpy(dtype=np.float64, na_value=np.nan)
    valid = arr[~np.isnan(arr)]
    if len(valid) == 0:
        return np.arange(len(arr), dtype=np.float64)
    divisor = _epoch_divisor(valid)
    arr = (arr - valid[0]) / divisor
    return arr


# ── Core mapper ──────────────────────────────────────────────

def map_dataset(
    df: pd.DataFrame,
    schema: DatasetSchema,
    *,
    sort_by_time: bool = True,
) -> CanonicalDataset:
    """
    Transform a raw DataFrame into a CanonicalDataset.

    The function splits data by joint (if a joint column exists),
    maps sensor columns to canonical keys, and normalises time.

    Parameters
    ----------
    df : raw input DataFrame
    schema : inferred or user-overridden DatasetSchema
    sort_by_time : sort rows chronologically per joint
    """
    dataset = CanonicalDataset(schema=schema)

    # ── Build sensor column mapping: original_col -> canonical_key ──
    col_to_key: dict[str, str] = {}
    for sg in schema.sensor_groups.values():
        for col, axis in zip(sg.columns, sg.axes):
            key = _canonical_sensor_key(sg.modality, axis)
            col_to_key[col] = key

    # ── Estimate sampling rate ──
    if schema.timestamp_column and schema.timestamp_column in df.columns:
        ts = df[schema.timestamp_column].dropna()
        if np.issubdtype(ts.dtype, np.number) and len(ts) > 1:
            diffs = ts.diff().dropna()
            median_dt = float(diffs.median())
            if median_dt > 0:
                divisor = _epoch_divisor(ts.to_numpy())
                dt_sec = median_dt / divisor
                dataset.sampling_rate_hz = round(1.0 / dt_sec, 2)

    # ── Split by joint ──
    if schema.joint_column and schema.joint_column in df.columns:
        grouped = df.groupby(schema.joint_column, sort=False)
    else:
        grouped = [("default", df)]

    for joint_name, group_df in grouped:
        joint_name = str(joint_name)
        group_df = group_df.copy()

        if sort_by_time and schema.timestamp_column and schema.timestamp_column in group_df.columns:
            group_df = group_df.sort_values(schema.timestamp_column).reset_index(drop=True)

        # Time array
        if schema.timestamp_column and schema.timestamp_column in group_df.columns:
            time_arr = _normalise_time(group_df[schema.timestamp_column])
        else:
            time_arr = np.arange(len(group_df), dtype=np.float64)

        # Sensor arrays
        sensors: dict[str, np.ndarray] = {}
        for orig_col, canon_key in col_to_key.items():
            if orig_col in group_df.columns:
                arr = group_df[orig_col].to_numpy(dtype=np.float64, na_value=np.nan)
                sensors[canon_key] = arr

        dataset.joints[joint_name] = JointData(
            joint_name=joint_name,
            time=time_arr,
            sensors=sensors,
        )

    # ── Metadata ──
    dataset.metadata = {
        "original_columns": list(df.columns),
        "original_rows": len(df),
        "mapped_sensor_keys": list(col_to_key.values()),
    }

    return dataset
