"""
Wear estimation inspired by Archard's wear law (simplified).

    wear_rate  ≈ anomaly_rate × signal_energy
    wear_index = normalised wear_rate between 0 and 1

Wear status thresholds:
    [0.0, 0.3)  → healthy
    [0.3, 0.7)  → moderate
    [0.7, 1.0]  → severe
"""

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
) -> pd.DataFrame:
    """
    Combine anomaly rate and signal energy into a per-joint wear index.

    Parameters
    ----------
    anomaly_stats : DataFrame with columns [joint_id, anomaly_rate]
        Output of anomaly_rate_per_joint().
    feature_stats : DataFrame with columns [joint_id, signal_energy]
        Mean energy per joint (aggregated from the feature matrix).

    Returns
    -------
    DataFrame with columns:
        joint_id, anomaly_rate, signal_energy, wear_rate, wear_index, wear_status
    """
    merged = anomaly_stats[["joint_id", "anomaly_rate"]].merge(
        feature_stats[["joint_id", "signal_energy"]],
        on="joint_id",
        how="inner",
    )

    # Archard-inspired: raw wear rate is the product of anomaly rate and energy
    merged["wear_rate"] = merged["anomaly_rate"] * merged["signal_energy"]

    # Normalise to [0, 1] via min-max scaling
    wr = merged["wear_rate"]
    wr_min, wr_max = wr.min(), wr.max()

    if wr_max - wr_min < 1e-12:
        # All joints have identical wear rate — assign a uniform mid-value
        merged["wear_index"] = 0.5
    else:
        merged["wear_index"] = ((wr - wr_min) / (wr_max - wr_min)).round(4)

    merged["wear_status"] = merged["wear_index"].apply(_classify_wear)

    return merged
