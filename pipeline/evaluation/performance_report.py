"""
Aggregate diagnostics report — combines all evaluation modules into
a single JSON-serializable structure for the API and frontend.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field, asdict
from typing import Any, Optional

import pandas as pd

from pipeline.evaluation.metrics import (
    UnsupervisedMetrics,
    ThresholdAnalysis,
    compute_unsupervised_metrics,
    compute_threshold_analysis,
)
from pipeline.evaluation.confusion_matrix import (
    SupervisedMetrics,
    compute_supervised_metrics,
)
from pipeline.evaluation.feature_importance import (
    FeatureImportanceResult,
    compute_feature_importance_fast,
)

log = logging.getLogger(__name__)


@dataclass
class DiagnosticsReport:
    """Complete ML diagnostics output."""
    model_id: str = "unknown"
    model_display_name: str = "Unknown"
    n_features_used: int = 0
    feature_names: list[str] = field(default_factory=list)
    unsupervised: Optional[UnsupervisedMetrics] = None
    supervised: Optional[SupervisedMetrics] = None
    feature_importance: Optional[FeatureImportanceResult] = None
    threshold_analysis: Optional[ThresholdAnalysis] = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to a JSON-safe dictionary."""
        return _clean_dict(asdict(self))


def _clean_dict(obj: Any) -> Any:
    """Recursively clean a dict for JSON serialization (remove None, convert numpy)."""
    import numpy as np

    if isinstance(obj, dict):
        return {k: _clean_dict(v) for k, v in obj.items() if v is not None}
    if isinstance(obj, list):
        return [_clean_dict(item) for item in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj


_RESERVED = {"joint_id", "timestamp", "anomaly", "anomaly_score"}


def generate_diagnostics(
    features_df: pd.DataFrame,
    model_config=None,
    ground_truth_col: Optional[str] = None,
    compute_importance: bool = True,
) -> DiagnosticsReport:
    """
    Run the full evaluation suite on the anomaly-enriched feature DataFrame.

    Parameters
    ----------
    features_df       : DataFrame with anomaly detection results
    model_config      : ModelConfig used for anomaly detection
    ground_truth_col  : explicit label column name (auto-detected if None)
    compute_importance: whether to run feature importance analysis

    Returns a DiagnosticsReport with all metrics.
    """
    from pipeline.modeling.model_registry import get_default_config, AVAILABLE_MODELS

    if model_config is None:
        model_config = get_default_config()

    spec = AVAILABLE_MODELS.get(model_config.model_id)
    display_name = spec.display_name if spec else model_config.model_id

    feat_cols = [
        c for c in features_df.columns
        if c not in _RESERVED and pd.api.types.is_numeric_dtype(features_df[c])
    ]

    report = DiagnosticsReport(
        model_id=model_config.model_id,
        model_display_name=display_name,
        n_features_used=len(feat_cols),
        feature_names=feat_cols,
    )

    # Unsupervised metrics (always available)
    log.info("Computing unsupervised metrics (silhouette, score distributions)")
    report.unsupervised = compute_unsupervised_metrics(features_df)

    # Supervised metrics (only if labels exist)
    log.info("Checking for ground-truth labels")
    report.supervised = compute_supervised_metrics(features_df, ground_truth_col)
    if report.supervised and report.supervised.has_labels:
        cm = report.supervised.confusion_matrix
        log.info(
            "Supervised metrics: precision=%.3f recall=%.3f F1=%.3f",
            cm.precision, cm.recall, cm.f1_score,
        )
    else:
        log.info("No ground-truth labels found — supervised metrics skipped")

    # Threshold analysis (always available for unsupervised)
    log.info("Computing threshold analysis")
    report.threshold_analysis = compute_threshold_analysis(features_df)

    # Feature importance (fast correlation-based by default)
    if compute_importance and len(feat_cols) > 0:
        log.info("Computing feature importance (correlation method, %d features)", len(feat_cols))
        report.feature_importance = compute_feature_importance_fast(
            features_df, top_n=min(20, len(feat_cols)),
        )
        if report.feature_importance.features:
            top3 = [(f.feature, f.importance) for f in report.feature_importance.features[:3]]
            log.info("Top-3 features: %s", top3)

    return report
