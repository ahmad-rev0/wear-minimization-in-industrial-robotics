"""
Wear estimation — unified interface.

Provides `compute_wear_index()` which now delegates to the physics-based
Archard's wear law model when joint parameters and features are available,
and falls back to the simplified anomaly×energy formula otherwise.

This ensures backward compatibility with existing pipeline callers.
"""

from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd


def _classify_wear(index: float) -> str:
    if index < 0.3:
        return "healthy"
    if index < 0.7:
        return "moderate"
    return "severe"


def compute_wear_index(
    anomaly_stats: pd.DataFrame,
    feature_stats: pd.DataFrame,
    *,
    features: Optional[pd.DataFrame] = None,
    joint_params: Optional[dict] = None,
    materials_df: Optional[pd.DataFrame] = None,
    sampling_rate_hz: Optional[float] = None,
) -> pd.DataFrame:
    """
    Compute per-joint wear index.

    If `features` and `joint_params` are provided, uses the physics-based
    Archard's wear law. Otherwise falls back to the simplified formula:
        wear_rate = anomaly_rate × signal_energy

    Parameters
    ----------
    anomaly_stats    : [joint_id, anomaly_rate]
    feature_stats    : [joint_id, signal_energy]
    features         : full feature matrix (optional, for physics model)
    joint_params     : dict of joint_id -> JointParameters (optional)
    materials_df     : materials catalogue DataFrame (optional)
    sampling_rate_hz : dataset sampling rate (optional)

    Returns
    -------
    DataFrame with columns including:
        joint_id, anomaly_rate, signal_energy, wear_index, wear_status, wear_rate
    """
    # Physics path
    if features is not None and joint_params is not None:
        from pipeline.physics.wear_physics_model import compute_physics_wear
        return compute_physics_wear(
            anomaly_stats=anomaly_stats,
            feature_stats=feature_stats,
            features=features,
            joint_params=joint_params,
            materials_df=materials_df,
            sampling_rate_hz=sampling_rate_hz,
        )

    # Simplified fallback
    merged = anomaly_stats[["joint_id", "anomaly_rate"]].merge(
        feature_stats[["joint_id", "signal_energy"]],
        on="joint_id",
        how="inner",
    )

    merged["wear_rate"] = merged["anomaly_rate"] * merged["signal_energy"]

    wr = merged["wear_rate"]
    wr_min, wr_max = wr.min(), wr.max()

    if wr_max - wr_min < 1e-12:
        merged["wear_index"] = 0.5
    else:
        merged["wear_index"] = ((wr - wr_min) / (wr_max - wr_min)).round(4)

    merged["wear_status"] = merged["wear_index"].apply(_classify_wear)

    return merged
