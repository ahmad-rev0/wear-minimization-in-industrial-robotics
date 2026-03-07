"""
Anomaly detection using Isolation Forest on engineered features.

Flags sensor readings that deviate from normal joint behaviour.
The model is fit *per joint* so each joint's normal operating
envelope is learned independently.

Feature columns are auto-detected: any numeric column that isn't in
the reserved set (joint_id, timestamp, anomaly, anomaly_score) is
treated as a feature. This makes the module fully dataset-agnostic.
"""

import logging

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

log = logging.getLogger(__name__)

_RESERVED_COLS = {"joint_id", "timestamp", "anomaly", "anomaly_score"}

# Legacy feature names kept as preferred columns when available
_LEGACY_FEATURE_COLS = [
    "mag_mean",
    "mag_std",
    "rolling_std",
    "jerk",
    "spectral_energy",
    "dominant_frequency",
    "entropy",
    "energy",
]


def _detect_feature_columns(df: pd.DataFrame) -> list[str]:
    """Auto-detect numeric feature columns, excluding reserved metadata."""
    candidates = []
    for col in df.columns:
        if col in _RESERVED_COLS:
            continue
        if pd.api.types.is_numeric_dtype(df[col]):
            candidates.append(col)
    return candidates


def detect_anomalies(
    features_df: pd.DataFrame,
    contamination: float = 0.05,
    random_state: int = 42,
    feature_cols: list[str] | None = None,
) -> pd.DataFrame:
    """
    Run Isolation Forest on the feature matrix, fitted per joint.

    Adds two columns:
        anomaly : int   — 1 = normal, -1 = anomaly  (sklearn convention)
        anomaly_score : float — the raw decision score (lower = more anomalous)

    Parameters
    ----------
    features_df : DataFrame from the feature engineering step.
    contamination : expected fraction of anomalies.
    random_state : reproducibility seed.
    feature_cols : explicit list of columns to use. If None, auto-detected.

    Returns the enriched DataFrame (original columns preserved).
    """
    df = features_df.copy()
    df["anomaly"] = 1
    df["anomaly_score"] = 0.0

    if feature_cols is not None:
        available = [c for c in feature_cols if c in df.columns]
    else:
        # Try legacy columns first; fall back to full auto-detection
        available = [c for c in _LEGACY_FEATURE_COLS if c in df.columns]
        if not available:
            available = _detect_feature_columns(df)

    if not available:
        raise ValueError(
            "No numeric feature columns found for anomaly detection. "
            "Ensure the feature engineering step produced output."
        )

    log.info("Anomaly detection using %d feature columns", len(available))

    for joint_id, grp in df.groupby("joint_id"):
        idx = grp.index
        X = grp[available].values

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
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
