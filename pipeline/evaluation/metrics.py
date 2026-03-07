"""
Core unsupervised evaluation metrics for anomaly detection.

Since anomaly detection is typically unsupervised, we focus on:
    - Silhouette score (cluster separation quality)
    - Anomaly score distribution statistics
    - Per-joint anomaly rate statistics
    - Calinski-Harabasz index (cluster density)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)


@dataclass
class ScoreDistribution:
    """Anomaly score distribution for a single joint or the whole dataset."""
    joint_id: str
    mean: float
    std: float
    min: float
    max: float
    median: float
    q25: float
    q75: float
    n_total: int
    n_anomalies: int
    anomaly_rate: float
    histogram_bins: list[float] = field(default_factory=list)
    histogram_counts: list[int] = field(default_factory=list)


@dataclass
class UnsupervisedMetrics:
    """Aggregate unsupervised metrics for the full dataset."""
    silhouette_score: Optional[float] = None
    calinski_harabasz_score: Optional[float] = None
    global_anomaly_rate: float = 0.0
    n_total: int = 0
    n_anomalies: int = 0
    score_distributions: list[ScoreDistribution] = field(default_factory=list)
    overall_distribution: Optional[ScoreDistribution] = None


_RESERVED_COLS = {"joint_id", "timestamp", "anomaly", "anomaly_score"}


def _get_feature_matrix(df: pd.DataFrame) -> np.ndarray:
    """Extract numeric feature columns from the dataframe."""
    cols = [
        c for c in df.columns
        if c not in _RESERVED_COLS and pd.api.types.is_numeric_dtype(df[c])
    ]
    return df[cols].values


def _build_distribution(
    joint_id: str, scores: np.ndarray, labels: np.ndarray, n_bins: int = 30,
) -> ScoreDistribution:
    """Build score distribution summary for one group."""
    n_anom = int((labels == -1).sum())
    n_total = len(labels)

    scores_clean = scores[np.isfinite(scores)]
    if len(scores_clean) == 0:
        scores_clean = np.array([0.0])

    counts, edges = np.histogram(scores_clean, bins=n_bins)

    return ScoreDistribution(
        joint_id=joint_id,
        mean=float(np.mean(scores_clean)),
        std=float(np.std(scores_clean)),
        min=float(np.min(scores_clean)),
        max=float(np.max(scores_clean)),
        median=float(np.median(scores_clean)),
        q25=float(np.percentile(scores_clean, 25)),
        q75=float(np.percentile(scores_clean, 75)),
        n_total=n_total,
        n_anomalies=n_anom,
        anomaly_rate=n_anom / max(n_total, 1),
        histogram_bins=[round(float(e), 6) for e in edges],
        histogram_counts=[int(c) for c in counts],
    )


def compute_unsupervised_metrics(features_df: pd.DataFrame) -> UnsupervisedMetrics:
    """
    Compute unsupervised evaluation metrics from the anomaly-enriched features.

    Expects columns: joint_id, anomaly, anomaly_score, plus numeric features.
    """
    if "anomaly" not in features_df.columns or "anomaly_score" not in features_df.columns:
        log.warning("Missing anomaly columns — returning empty metrics")
        return UnsupervisedMetrics()

    labels = features_df["anomaly"].values
    scores = features_df["anomaly_score"].values
    n_total = len(labels)
    n_anomalies = int((labels == -1).sum())

    result = UnsupervisedMetrics(
        global_anomaly_rate=n_anomalies / max(n_total, 1),
        n_total=n_total,
        n_anomalies=n_anomalies,
    )

    # Silhouette and Calinski-Harabasz (need at least 2 clusters)
    X = _get_feature_matrix(features_df)
    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
    unique_labels = np.unique(labels)

    if len(unique_labels) >= 2 and len(X) > len(unique_labels):
        try:
            from sklearn.metrics import silhouette_score, calinski_harabasz_score

            sample_size = min(2000, len(X))
            if sample_size < len(X):
                rng = np.random.default_rng(42)
                idx = rng.choice(len(X), sample_size, replace=False)
                X_sample, labels_sample = X[idx], labels[idx]
            else:
                X_sample, labels_sample = X, labels

            if len(np.unique(labels_sample)) >= 2:
                result.silhouette_score = round(
                    float(silhouette_score(X_sample, labels_sample)), 4,
                )
                result.calinski_harabasz_score = round(
                    float(calinski_harabasz_score(X_sample, labels_sample)), 4,
                )
        except Exception as e:
            log.warning("Cluster metrics failed: %s", e)

    # Per-joint distributions
    for joint_id, grp in features_df.groupby("joint_id"):
        dist = _build_distribution(
            str(joint_id), grp["anomaly_score"].values, grp["anomaly"].values,
        )
        result.score_distributions.append(dist)

    # Overall distribution
    result.overall_distribution = _build_distribution(
        "all_joints", scores, labels,
    )

    return result


# ── Threshold analysis ─────────────────────────────────────────

@dataclass
class ThresholdPoint:
    """One point on the threshold-vs-anomaly-count curve."""
    threshold: float
    n_anomalies: int
    anomaly_rate: float


@dataclass
class ThresholdAnalysis:
    """How anomaly counts vary across decision thresholds."""
    points: list[ThresholdPoint] = field(default_factory=list)
    current_threshold: float = 0.0
    current_n_anomalies: int = 0


def compute_threshold_analysis(
    features_df: pd.DataFrame, n_points: int = 50,
) -> ThresholdAnalysis:
    """Sweep across score percentiles and report anomaly counts."""
    if "anomaly_score" not in features_df.columns:
        return ThresholdAnalysis()

    scores = features_df["anomaly_score"].values
    scores = scores[np.isfinite(scores)]
    if len(scores) == 0:
        return ThresholdAnalysis()

    labels = features_df.get("anomaly", pd.Series(dtype=int)).values
    current_n = int((labels == -1).sum()) if len(labels) == len(features_df) else 0

    # Use the score that separates normal from anomalous as "current threshold"
    normal_scores = scores[labels == 1] if len(labels) == len(scores) else scores
    current_thr = float(np.max(normal_scores)) if len(normal_scores) > 0 else float(np.median(scores))

    percentiles = np.linspace(0, 100, n_points)
    thresholds = np.percentile(scores, percentiles)

    points: list[ThresholdPoint] = []
    n_total = len(scores)
    for thr in thresholds:
        n_anom = int((scores > thr).sum())
        points.append(ThresholdPoint(
            threshold=round(float(thr), 6),
            n_anomalies=n_anom,
            anomaly_rate=round(n_anom / max(n_total, 1), 4),
        ))

    return ThresholdAnalysis(
        points=points,
        current_threshold=round(current_thr, 6),
        current_n_anomalies=current_n,
    )
