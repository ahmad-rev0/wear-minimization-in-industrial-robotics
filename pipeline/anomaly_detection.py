"""
Anomaly detection using Isolation Forest on engineered features.

Flags sensor readings that deviate from normal joint behaviour.
The model is fit *per joint* so each joint's normal operating
envelope is learned independently.
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

# Features fed into the anomaly detector
_FEATURE_COLS = [
    "mag_mean",
    "mag_std",
    "rolling_std",
    "jerk",
    "spectral_energy",
    "dominant_frequency",
    "entropy",
    "energy",
]


def detect_anomalies(
    features_df: pd.DataFrame,
    contamination: float = 0.05,
    random_state: int = 42,
) -> pd.DataFrame:
    """
    Run Isolation Forest on the feature matrix, fitted per joint.

    Adds two columns:
        anomaly : int   — 1 = normal, -1 = anomaly  (sklearn convention)
        anomaly_score : float — the raw decision score (lower = more anomalous)

    Returns the enriched DataFrame (original columns preserved).
    """
    df = features_df.copy()
    df["anomaly"] = 1
    df["anomaly_score"] = 0.0

    available = [c for c in _FEATURE_COLS if c in df.columns]
    if not available:
        raise ValueError(f"No feature columns found. Expected some of: {_FEATURE_COLS}")

    for joint_id, grp in df.groupby("joint_id"):
        idx = grp.index
        X = grp[available].values

        # Standardise so features with different scales are treated equally
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        # Replace any remaining NaN/Inf with 0 (edge rows from windowing)
        X_scaled = np.nan_to_num(X_scaled, nan=0.0, posinf=0.0, neginf=0.0)

        clf = IsolationForest(
            contamination=contamination,
            random_state=random_state,
            n_estimators=100,
            n_jobs=-1,
        )
        labels = clf.fit_predict(X_scaled)
        scores = clf.decision_function(X_scaled)

        df.loc[idx, "anomaly"] = labels
        df.loc[idx, "anomaly_score"] = scores

    return df


def anomaly_rate_per_joint(df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate anomaly counts per joint_id.

    Returns DataFrame with columns:
        joint_id      : str
        total_readings: int
        anomaly_count : int
        anomaly_rate  : float  (0-1, fraction of readings flagged anomalous)
    """
    if "anomaly" not in df.columns:
        raise ValueError("DataFrame must contain an 'anomaly' column — run detect_anomalies first")

    stats = (
        df.groupby("joint_id")
        .agg(
            total_readings=("anomaly", "count"),
            anomaly_count=("anomaly", lambda s: (s == -1).sum()),
        )
        .reset_index()
    )
    stats["anomaly_rate"] = stats["anomaly_count"] / stats["total_readings"]
    return stats
