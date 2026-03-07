"""
Feature importance estimation for anomaly detection models.

Primary method: Permutation Importance
    — shuffle each feature column and measure the change in anomaly scores.
    — works with any model (model-agnostic).

Optional: SHAP (if installed)
    — only for tree-based models (IsolationForest).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)

_RESERVED_COLS = {"joint_id", "timestamp", "anomaly", "anomaly_score"}


@dataclass
class FeatureImportanceEntry:
    """Importance score for a single feature."""
    feature: str
    importance: float
    std: float = 0.0
    rank: int = 0


@dataclass
class FeatureImportanceResult:
    """Full feature importance analysis."""
    method: str = "permutation"
    features: list[FeatureImportanceEntry] = field(default_factory=list)
    top_n: int = 0


def _get_feature_cols(df: pd.DataFrame) -> list[str]:
    return [
        c for c in df.columns
        if c not in _RESERVED_COLS and pd.api.types.is_numeric_dtype(df[c])
    ]


def compute_permutation_importance(
    features_df: pd.DataFrame,
    model_config=None,
    n_repeats: int = 5,
    top_n: int = 20,
    random_state: int = 42,
) -> FeatureImportanceResult:
    """
    Compute permutation importance by re-running the detector with shuffled features.

    For each feature column:
        1. Shuffle the column values
        2. Re-run anomaly detection
        3. Measure the change in mean anomaly score
        4. Repeat n_repeats times and average

    A large positive importance means the feature is critical for detection.
    """
    from pipeline.modeling.model_registry import get_default_config
    from pipeline.modeling.anomaly_models import create_detector
    from sklearn.preprocessing import StandardScaler

    if model_config is None:
        model_config = get_default_config()

    feat_cols = _get_feature_cols(features_df)
    if not feat_cols:
        return FeatureImportanceResult()

    X_full = features_df[feat_cols].values.copy()
    X_full = np.nan_to_num(X_full, nan=0.0, posinf=0.0, neginf=0.0)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_full)

    # Baseline score
    detector = create_detector(
        model_id=model_config.model_id,
        params=model_config.params,
        random_state=model_config.random_state,
    )
    _, baseline_scores = detector.fit_predict(X_scaled)
    baseline_mean = float(np.mean(baseline_scores))

    rng = np.random.default_rng(random_state)
    importances = []

    for i, col in enumerate(feat_cols):
        diffs = []
        for _ in range(n_repeats):
            X_perm = X_scaled.copy()
            X_perm[:, i] = rng.permutation(X_perm[:, i])

            det = create_detector(
                model_id=model_config.model_id,
                params=model_config.params,
                random_state=model_config.random_state,
            )
            _, perm_scores = det.fit_predict(X_perm)
            perm_mean = float(np.mean(perm_scores))
            diffs.append(abs(baseline_mean - perm_mean))

        mean_diff = float(np.mean(diffs))
        std_diff = float(np.std(diffs))
        importances.append((col, mean_diff, std_diff))

    # Sort by importance descending
    importances.sort(key=lambda x: x[1], reverse=True)

    # Normalize to [0, 1]
    max_imp = importances[0][1] if importances and importances[0][1] > 0 else 1.0

    entries = []
    for rank, (feat, imp, std) in enumerate(importances[:top_n], start=1):
        entries.append(FeatureImportanceEntry(
            feature=feat,
            importance=round(imp / max_imp, 4),
            std=round(std / max_imp, 4),
            rank=rank,
        ))

    return FeatureImportanceResult(
        method="permutation",
        features=entries,
        top_n=len(entries),
    )


def compute_feature_importance_fast(
    features_df: pd.DataFrame,
    top_n: int = 20,
) -> FeatureImportanceResult:
    """
    Fast approximation of feature importance using correlation with anomaly scores.

    For each feature, compute |correlation(feature, anomaly_score)|.
    This is much faster than permutation but less accurate.
    """
    feat_cols = _get_feature_cols(features_df)
    if not feat_cols or "anomaly_score" not in features_df.columns:
        return FeatureImportanceResult(method="correlation")

    scores = features_df["anomaly_score"].values
    importances = []

    for col in feat_cols:
        vals = features_df[col].values
        mask = np.isfinite(vals) & np.isfinite(scores)
        if mask.sum() < 10:
            importances.append((col, 0.0))
            continue
        corr = abs(float(np.corrcoef(vals[mask], scores[mask])[0, 1]))
        if np.isnan(corr):
            corr = 0.0
        importances.append((col, corr))

    importances.sort(key=lambda x: x[1], reverse=True)
    max_imp = importances[0][1] if importances and importances[0][1] > 0 else 1.0

    entries = []
    for rank, (feat, imp) in enumerate(importances[:top_n], start=1):
        entries.append(FeatureImportanceEntry(
            feature=feat,
            importance=round(imp / max_imp, 4),
            rank=rank,
        ))

    return FeatureImportanceResult(
        method="correlation",
        features=entries,
        top_n=len(entries),
    )
