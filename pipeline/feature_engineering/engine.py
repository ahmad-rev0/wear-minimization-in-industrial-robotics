"""
Master feature extraction engine — dataset-agnostic.

Accepts a CanonicalDataset (from the ingestion layer) and dynamically
computes features based on which sensor modalities are present.

Feature dispatch rules:
    ALL signals        → statistical features (mean, std, var, skew, kurtosis, RMS, p2p, jerk, energy)
    Motion signals     → + spectral features  (FFT energy, dominant freq, entropy, centroid, band energy, harmonic ratio)
    Vibration signals  → + spectral + vibration features  (crest/impulse/clearance/shape factor)
    Temperature        → + thermal features   (drift, rate, acceleration)

The engine also computes magnitude (L2 norm) for tri-axial sensor groups
(accelerometer, gyroscope, magnetometer) and treats the magnitude as an
additional virtual signal.
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import pandas as pd

from pipeline.ingestion.dataset_mapper import CanonicalDataset, JointData
from pipeline.feature_engineering.statistical_features import compute_all_statistical
from pipeline.feature_engineering.spectral_features import compute_all_spectral
from pipeline.feature_engineering.vibration_features import (
    compute_all_vibration,
    compute_all_thermal,
)

log = logging.getLogger(__name__)

# Modalities that should also get spectral features
_SPECTRAL_MODALITIES = {
    "accelerometer",
    "gyroscope",
    "magnetometer",
    "vibration",
    "force",
    "velocity",
    "motor_current",
}

# Modalities that should also get vibration-specific features
_VIBRATION_MODALITIES = {
    "accelerometer",
    "vibration",
}

# Modalities that should get thermal features
_THERMAL_MODALITIES = {
    "temperature",
}

# Tri-axial modalities where we compute a magnitude (L2 norm)
_TRIAXIAL_MODALITIES = {
    "accelerometer",
    "gyroscope",
    "magnetometer",
    "force",
}

_AXIS_LABELS = {"x", "y", "z"}


# ── Magnitude computation ────────────────────────────────────

def _compute_magnitudes(
    jd: JointData,
) -> dict[str, np.ndarray]:
    """
    For tri-axial sensor groups, compute magnitude = sqrt(x^2 + y^2 + z^2).
    Returns dict like {"magnetometer_magnitude": array, ...}.
    """
    magnitudes: dict[str, np.ndarray] = {}
    modality_axes: dict[str, dict[str, np.ndarray]] = {}

    for key, arr in jd.sensors.items():
        parts = key.rsplit("_", 1)
        if len(parts) == 2 and parts[1] in _AXIS_LABELS:
            modality_axes.setdefault(parts[0], {})[parts[1]] = arr

    for modality, axes in modality_axes.items():
        base_mod = modality.split("_")[0] if "_" in modality else modality
        if base_mod in _TRIAXIAL_MODALITIES and len(axes) >= 2:
            sq_sum = np.zeros(jd.n_samples, dtype=np.float64)
            for ax_arr in axes.values():
                sq_sum += ax_arr ** 2
            magnitudes[f"{modality}_magnitude"] = np.sqrt(sq_sum)

    return magnitudes


# ── Per-joint feature extraction ─────────────────────────────

def _extract_joint_features(
    jd: JointData,
    window: int,
    selected_features: Optional[set[str]] = None,
) -> dict[str, np.ndarray]:
    """
    Compute all applicable features for a single joint.

    Returns a flat dict: feature_name -> 1-D array (length = jd.n_samples).
    """
    all_features: dict[str, np.ndarray] = {}

    # Compute magnitudes for tri-axial groups
    magnitudes = _compute_magnitudes(jd)

    # Merge individual channels + magnitude signals
    all_signals: dict[str, tuple[str, np.ndarray]] = {}
    for key, arr in jd.sensors.items():
        modality = key.rsplit("_", 1)[0] if "_" in key else key
        all_signals[key] = (modality, arr)
    for key, arr in magnitudes.items():
        modality = key.replace("_magnitude", "")
        all_signals[key] = (modality, arr)

    for signal_key, (modality, arr) in all_signals.items():
        arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)

        # 1. Statistical features — always computed
        stat_feats = compute_all_statistical(arr, window, signal_key)
        all_features.update(stat_feats)

        # 2. Spectral features — for motion/vibration modalities
        if modality in _SPECTRAL_MODALITIES:
            spec_feats = compute_all_spectral(arr, window, signal_key)
            all_features.update(spec_feats)

        # 3. Vibration features — for vibration/accel modalities
        if modality in _VIBRATION_MODALITIES:
            vib_feats = compute_all_vibration(arr, window, signal_key)
            all_features.update(vib_feats)

        # 4. Thermal features — for temperature modalities
        if modality in _THERMAL_MODALITIES:
            therm_feats = compute_all_thermal(arr, window, signal_key)
            all_features.update(therm_feats)

    # Apply feature selection filter if specified
    if selected_features:
        all_features = {
            k: v for k, v in all_features.items()
            if k in selected_features
        }

    return all_features


# ── Public API ───────────────────────────────────────────────

def extract_features_from_canonical(
    dataset: CanonicalDataset,
    window_size: int = 50,
    selected_features: Optional[set[str]] = None,
) -> pd.DataFrame:
    """
    Extract features from a CanonicalDataset.

    Parameters
    ----------
    dataset : output of the ingestion layer
    window_size : sliding window size for all windowed features
    selected_features : optional set of feature names to keep
                        (None = keep all)

    Returns
    -------
    DataFrame with columns:
        joint_id, timestamp, <all computed features...>
    """
    parts: list[pd.DataFrame] = []

    for joint_name, jd in dataset.joints.items():
        log.debug(
            "Extracting features for joint '%s': %d samples, %d sensors",
            joint_name, jd.n_samples, len(jd.sensors),
        )

        features = _extract_joint_features(jd, window_size, selected_features)

        df = pd.DataFrame(features)
        df.insert(0, "timestamp", jd.time)
        df.insert(0, "joint_id", joint_name)

        parts.append(df)

    if not parts:
        return pd.DataFrame(columns=["joint_id", "timestamp"])

    result = pd.concat(parts, ignore_index=True)

    log.info(
        "Feature extraction complete: %d rows, %d features, %d joints",
        len(result), len(result.columns) - 2, dataset.n_joints,
    )

    return result


def get_available_feature_names(
    dataset: CanonicalDataset,
    window_size: int = 50,
) -> list[str]:
    """
    Discover which features WOULD be generated for this dataset
    without actually computing them.

    Useful for the feature selection UI.
    """
    if not dataset.joints:
        return []
    jd = next(iter(dataset.joints.values()))
    features = _extract_joint_features(jd, window_size)
    return sorted(features.keys())
