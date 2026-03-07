"""
User-configurable feature selection.

Allows users to choose which computed features are used for ML training
via the API. The selector works as a filter applied after feature extraction.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import pandas as pd


@dataclass
class FeatureSelectionConfig:
    """
    Configuration for which features to include in the ML pipeline.

    If `selected_features` is None or empty, ALL features are used.
    If `exclude_features` is set, those are removed from the selection.
    """
    selected_features: Optional[list[str]] = None
    exclude_features: list[str] = field(default_factory=list)
    min_variance_threshold: float = 0.0

    def to_dict(self) -> dict:
        return {
            "selected_features": self.selected_features,
            "exclude_features": self.exclude_features,
            "min_variance_threshold": self.min_variance_threshold,
        }


# Reserved columns that are never filtered out
_META_COLS = {"joint_id", "timestamp"}


def apply_feature_selection(
    features_df: pd.DataFrame,
    config: FeatureSelectionConfig,
) -> pd.DataFrame:
    """
    Filter the feature DataFrame according to the selection config.

    Parameters
    ----------
    features_df : full feature matrix from the engine
    config : user-provided selection criteria

    Returns
    -------
    Filtered DataFrame with only the selected feature columns
    (plus joint_id and timestamp which are always preserved).
    """
    all_cols = set(features_df.columns)
    feature_cols = all_cols - _META_COLS

    # Positive selection: keep only these
    if config.selected_features:
        keep = set(config.selected_features) & feature_cols
    else:
        keep = feature_cols

    # Negative selection: remove these
    if config.exclude_features:
        keep -= set(config.exclude_features)

    # Variance filter: drop near-constant features
    if config.min_variance_threshold > 0:
        low_var = set()
        for col in keep:
            if features_df[col].var() < config.min_variance_threshold:
                low_var.add(col)
        keep -= low_var

    final_cols = sorted(_META_COLS & all_cols) + sorted(keep)
    return features_df[final_cols]


def discover_features(features_df: pd.DataFrame) -> list[dict]:
    """
    Return metadata about each feature column for the selection UI.

    Returns a list of dicts with keys:
        name, dtype, mean, std, min, max, n_unique, pct_zero
    """
    meta_list: list[dict] = []
    for col in sorted(features_df.columns):
        if col in _META_COLS:
            continue
        s = features_df[col]
        meta_list.append({
            "name": col,
            "dtype": str(s.dtype),
            "mean": round(float(s.mean()), 4) if s.dtype.kind in "fi" else None,
            "std": round(float(s.std()), 4) if s.dtype.kind in "fi" else None,
            "min": round(float(s.min()), 4) if s.dtype.kind in "fi" else None,
            "max": round(float(s.max()), 4) if s.dtype.kind in "fi" else None,
            "n_unique": int(s.nunique()),
            "pct_zero": round(float((s == 0).mean() * 100), 2) if s.dtype.kind in "fi" else None,
        })
    return meta_list
