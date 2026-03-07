"""
Modular, dataset-agnostic feature engineering for ROBOFIX.

New API (preferred):
    from pipeline.feature_engineering import extract_features_from_canonical
    features_df = extract_features_from_canonical(canonical_dataset)

Legacy API (backward-compatible, delegates to old module):
    from pipeline.feature_engineering import extract_features
    features_df = extract_features(df)  # df must have joint_id, timestamp, mx, my, mz

Sub-modules:
    statistical_features — mean, std, var, skew, kurtosis, RMS, peak-to-peak, jerk, energy
    spectral_features    — FFT energy, dominant freq, spectral entropy, centroid, band energy, harmonic ratio
    vibration_features   — crest/impulse/clearance/shape factor, thermal drift/rate/acceleration
    feature_selector     — user-configurable feature filtering
    engine               — master orchestrator that dispatches by sensor modality
"""

from pipeline.feature_engineering.engine import (
    extract_features_from_canonical,
    get_available_feature_names,
)
from pipeline.feature_engineering.feature_selector import (
    FeatureSelectionConfig,
    apply_feature_selection,
    discover_features,
)


def extract_features(df, window_size: int = 50):
    """
    Legacy interface — delegates to the original magnetometer-based extractor.

    Kept for backward compatibility with the existing pipeline.
    Accepts a DataFrame with columns: joint_id, timestamp, mx, my, mz.
    """
    from pipeline._legacy_feature_engineering import extract_features as _legacy
    return _legacy(df, window_size=window_size)


def load_and_normalise(path: str, target_joints: int = 6):
    """Legacy interface — delegates to original loader."""
    from pipeline._legacy_feature_engineering import load_and_normalise as _legacy
    return _legacy(path, target_joints=target_joints)


__all__ = [
    "extract_features_from_canonical",
    "get_available_feature_names",
    "FeatureSelectionConfig",
    "apply_feature_selection",
    "discover_features",
    "extract_features",
    "load_and_normalise",
]
