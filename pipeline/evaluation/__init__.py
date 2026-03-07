"""
ML evaluation & diagnostics for ROBOFIX.

Modules:
    metrics             — unsupervised metrics (silhouette, score distribution)
    confusion_matrix    — supervised metrics when labels exist
    feature_importance  — permutation importance + optional SHAP
    performance_report  — aggregate all diagnostics into one report
"""

from pipeline.evaluation.performance_report import (
    generate_diagnostics,
    DiagnosticsReport,
)

__all__ = [
    "generate_diagnostics",
    "DiagnosticsReport",
]
