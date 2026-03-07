"""
Supervised evaluation metrics — used when the dataset has ground-truth labels.

If labels exist:
    - Confusion matrix (TP, FP, TN, FN)
    - Precision, Recall, F1-score
    - ROC curve data (FPR, TPR, thresholds)
    - AUC score

If no labels: all functions return None gracefully.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)


@dataclass
class ConfusionMatrixData:
    """Confusion matrix and derived classification metrics."""
    tp: int = 0
    fp: int = 0
    tn: int = 0
    fn: int = 0
    precision: float = 0.0
    recall: float = 0.0
    f1_score: float = 0.0
    accuracy: float = 0.0
    support_normal: int = 0
    support_anomaly: int = 0
    matrix: list[list[int]] = field(default_factory=lambda: [[0, 0], [0, 0]])
    labels: list[str] = field(default_factory=lambda: ["Normal", "Anomaly"])


@dataclass
class ROCCurveData:
    """ROC curve data points for frontend visualization."""
    fpr: list[float] = field(default_factory=list)
    tpr: list[float] = field(default_factory=list)
    thresholds: list[float] = field(default_factory=list)
    auc: float = 0.0


@dataclass
class SupervisedMetrics:
    """All supervised metrics (when ground truth is available)."""
    has_labels: bool = False
    confusion_matrix: Optional[ConfusionMatrixData] = None
    roc_curve: Optional[ROCCurveData] = None
    per_joint: dict[str, ConfusionMatrixData] = field(default_factory=dict)


def _detect_ground_truth(df: pd.DataFrame) -> Optional[str]:
    """
    Detect if the dataframe contains ground-truth anomaly labels.

    Looks for columns like 'label', 'ground_truth', 'true_anomaly',
    'is_anomaly', 'fault', 'failure' that are binary/categorical.
    """
    candidates = [
        "label", "labels", "ground_truth", "true_label", "true_anomaly",
        "is_anomaly", "fault", "failure", "class", "target", "defect",
        "anomaly_label", "gt_anomaly",
    ]
    for col in df.columns:
        if col.lower().strip() in candidates:
            nunique = df[col].nunique()
            if 2 <= nunique <= 5:
                return col
    return None


def _to_binary(series: pd.Series) -> np.ndarray:
    """
    Convert a label column to binary: 0 = normal, 1 = anomaly.

    Handles common conventions:
        - Numeric: 0/1, 1/-1
        - String: 'normal'/'anomaly', 'ok'/'fault', etc.
    """
    values = series.values
    if pd.api.types.is_numeric_dtype(series):
        if set(np.unique(values)) <= {-1, 1}:
            return (values == -1).astype(int)
        return (values != 0).astype(int)

    str_vals = series.astype(str).str.lower().str.strip()
    normal_words = {"normal", "ok", "good", "healthy", "0", "no", "false"}
    return np.array([0 if v in normal_words else 1 for v in str_vals])


def compute_supervised_metrics(
    features_df: pd.DataFrame,
    ground_truth_col: Optional[str] = None,
) -> SupervisedMetrics:
    """
    Compute supervised metrics if ground-truth labels are available.

    Parameters
    ----------
    features_df    : DataFrame with 'anomaly', 'anomaly_score', and optionally
                     a ground-truth column.
    ground_truth_col : explicit name of the label column. If None, auto-detected.
    """
    if ground_truth_col is None:
        ground_truth_col = _detect_ground_truth(features_df)

    if ground_truth_col is None or ground_truth_col not in features_df.columns:
        return SupervisedMetrics(has_labels=False)

    log.info("Ground-truth labels found in column '%s'", ground_truth_col)

    y_true = _to_binary(features_df[ground_truth_col])
    # Convert sklearn convention (1=normal, -1=anomaly) to binary (0=normal, 1=anomaly)
    y_pred = (features_df["anomaly"].values == -1).astype(int)
    scores = features_df["anomaly_score"].values

    result = SupervisedMetrics(has_labels=True)

    # Global confusion matrix
    result.confusion_matrix = _compute_cm(y_true, y_pred)

    # ROC curve
    result.roc_curve = _compute_roc(y_true, scores)

    # Per-joint
    for joint_id, grp in features_df.groupby("joint_id"):
        yt = _to_binary(grp[ground_truth_col])
        yp = (grp["anomaly"].values == -1).astype(int)
        result.per_joint[str(joint_id)] = _compute_cm(yt, yp)

    return result


def _compute_cm(y_true: np.ndarray, y_pred: np.ndarray) -> ConfusionMatrixData:
    """Build a confusion matrix from binary arrays."""
    tp = int(((y_true == 1) & (y_pred == 1)).sum())
    fp = int(((y_true == 0) & (y_pred == 1)).sum())
    tn = int(((y_true == 0) & (y_pred == 0)).sum())
    fn = int(((y_true == 1) & (y_pred == 0)).sum())

    precision = tp / max(tp + fp, 1)
    recall = tp / max(tp + fn, 1)
    f1 = 2 * precision * recall / max(precision + recall, 1e-9)
    accuracy = (tp + tn) / max(tp + fp + tn + fn, 1)

    return ConfusionMatrixData(
        tp=tp, fp=fp, tn=tn, fn=fn,
        precision=round(precision, 4),
        recall=round(recall, 4),
        f1_score=round(f1, 4),
        accuracy=round(accuracy, 4),
        support_normal=int((y_true == 0).sum()),
        support_anomaly=int((y_true == 1).sum()),
        matrix=[[tn, fp], [fn, tp]],
    )


def _compute_roc(y_true: np.ndarray, scores: np.ndarray) -> ROCCurveData:
    """Compute ROC curve data points and AUC."""
    try:
        from sklearn.metrics import roc_curve, auc

        # Lower anomaly score = more anomalous, so negate for ROC
        fpr, tpr, thresholds = roc_curve(y_true, -scores)
        roc_auc = float(auc(fpr, tpr))

        # Subsample for frontend (max 200 points)
        n = len(fpr)
        if n > 200:
            idx = np.linspace(0, n - 1, 200, dtype=int)
            fpr, tpr, thresholds = fpr[idx], tpr[idx], thresholds[min(idx, len(thresholds) - 1)]

        return ROCCurveData(
            fpr=[round(float(x), 4) for x in fpr],
            tpr=[round(float(x), 4) for x in tpr],
            thresholds=[round(float(x), 6) for x in thresholds[:len(fpr)]],
            auc=round(roc_auc, 4),
        )
    except Exception as e:
        log.warning("ROC curve computation failed: %s", e)
        return ROCCurveData()
