"""
Anomaly detection — dataset-agnostic, model-agnostic.

Supports multiple algorithms via the model registry:
    - Isolation Forest  (default)
    - Local Outlier Factor
    - One-Class SVM
    - Autoencoder

The model is fit *per joint* so each joint's normal operating envelope
is learned independently. Feature columns are auto-detected from the
DataFrame (any numeric column not in the reserved set).
"""

import logging
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

from pipeline.modeling.model_registry import ModelConfig, get_default_config
from pipeline.modeling.anomaly_models import create_detector

log = logging.getLogger(__name__)

_RESERVED_COLS = {"joint_id", "timestamp", "anomaly", "anomaly_score"}


def _detect_feature_columns(df: pd.DataFrame) -> list[str]:
    """Auto-detect numeric feature columns, excluding reserved metadata."""
    return [
        col for col in df.columns
        if col not in _RESERVED_COLS and pd.api.types.is_numeric_dtype(df[col])
    ]


def detect_anomalies(
    features_df: pd.DataFrame,
    model_config: Optional[ModelConfig] = None,
    feature_cols: Optional[list[str]] = None,
) -> pd.DataFrame:
    """
    Run anomaly detection on the feature matrix, fitted per joint.

    Adds two columns:
        anomaly       : int   — 1 = normal, -1 = anomaly
        anomaly_score : float — continuous score (lower = more anomalous)

    Parameters
    ----------
    features_df  : DataFrame from the feature engineering step.
    model_config : which algorithm + hyperparameters to use.
                   Defaults to IsolationForest with contamination=0.05.
    feature_cols : explicit list of columns. If None, auto-detected.

    Returns the enriched DataFrame (original columns preserved).
    """
    if model_config is None:
        model_config = get_default_config()

    df = features_df
    df["anomaly"] = 1
    df["anomaly_score"] = 0.0

    available = feature_cols if feature_cols else _detect_feature_columns(df)
    if not available:
        raise ValueError(
            "No numeric feature columns found for anomaly detection. "
            "Ensure the feature engineering step produced output."
        )

    log.info(
        "Anomaly detection: model=%s, features=%d, params=%s",
        model_config.model_id, len(available), model_config.params,
    )

    for joint_id, grp in df.groupby("joint_id"):
        idx = grp.index
        X = grp[available].values

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        X_scaled = np.nan_to_num(X_scaled, nan=0.0, posinf=0.0, neginf=0.0)

        detector = create_detector(
            model_id=model_config.model_id,
            params=model_config.params,
            random_state=model_config.random_state,
        )
        labels, scores = detector.fit_predict(X_scaled)

        df.loc[idx, "anomaly"] = labels
        df.loc[idx, "anomaly_score"] = scores

    n_anomalies = int((df["anomaly"] == -1).sum())
    log.info(
        "Anomaly detection complete: %d anomalies / %d total (%.1f%%)",
        n_anomalies, len(df), 100 * n_anomalies / max(len(df), 1),
    )

    return df


def anomaly_rate_per_joint(df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate anomaly counts per joint_id.

    Returns DataFrame with columns:
        joint_id, total_readings, anomaly_count, anomaly_rate
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
