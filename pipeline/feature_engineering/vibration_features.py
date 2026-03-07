"""
Vibration-specific and thermal features.

Vibration features apply to accelerometer, vibration, and similar
oscillatory signals. Thermal features apply to temperature channels.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


# ── Vibration features ───────────────────────────────────────

def compute_crest_factor(arr: np.ndarray, window: int) -> np.ndarray:
    """
    Crest factor = peak / RMS over a sliding window.

    High crest factors indicate impulsive events (bearing faults, impacts).
    """
    s = pd.Series(arr)
    rms = np.sqrt((s ** 2).rolling(window, min_periods=1).mean())
    peak = s.abs().rolling(window, min_periods=1).max()
    rms_safe = rms.replace(0, np.nan)
    return (peak / rms_safe).fillna(0.0).to_numpy()


def compute_impulse_factor(arr: np.ndarray, window: int) -> np.ndarray:
    """
    Impulse factor = peak / mean(|signal|) over a sliding window.

    Sensitive to localised spikes in the signal.
    """
    s = pd.Series(arr)
    peak = s.abs().rolling(window, min_periods=1).max()
    mean_abs = s.abs().rolling(window, min_periods=1).mean()
    mean_safe = mean_abs.replace(0, np.nan)
    return (peak / mean_safe).fillna(0.0).to_numpy()


def compute_clearance_factor(arr: np.ndarray, window: int) -> np.ndarray:
    """
    Clearance factor = peak / mean(sqrt(|signal|))^2.

    Related to bearing damage severity.
    """
    s = pd.Series(arr)
    peak = s.abs().rolling(window, min_periods=1).max()
    root_mean = np.sqrt(s.abs()).rolling(window, min_periods=1).mean()
    root_sq = root_mean ** 2
    root_sq_safe = root_sq.replace(0, np.nan)
    return (peak / root_sq_safe).fillna(0.0).to_numpy()


def compute_shape_factor(arr: np.ndarray, window: int) -> np.ndarray:
    """
    Shape factor = RMS / mean(|signal|).

    Captures the waveform shape; changes indicate degradation.
    """
    s = pd.Series(arr)
    rms = np.sqrt((s ** 2).rolling(window, min_periods=1).mean())
    mean_abs = s.abs().rolling(window, min_periods=1).mean()
    mean_safe = mean_abs.replace(0, np.nan)
    return (rms / mean_safe).fillna(0.0).to_numpy()


def compute_all_vibration(
    arr: np.ndarray,
    window: int,
    prefix: str,
) -> dict[str, np.ndarray]:
    """Compute all vibration-specific features for one signal."""
    return {
        f"{prefix}_crest_factor": compute_crest_factor(arr, window),
        f"{prefix}_impulse_factor": compute_impulse_factor(arr, window),
        f"{prefix}_clearance_factor": compute_clearance_factor(arr, window),
        f"{prefix}_shape_factor": compute_shape_factor(arr, window),
    }


# ── Thermal features ────────────────────────────────────────

def compute_thermal_drift(arr: np.ndarray, window: int) -> np.ndarray:
    """
    Drift = difference between current value and rolling mean.

    Captures slow temperature rises indicating friction/wear heating.
    """
    s = pd.Series(arr)
    rmean = s.rolling(window, min_periods=1).mean()
    return (s - rmean).fillna(0.0).to_numpy()


def compute_thermal_rate(arr: np.ndarray) -> np.ndarray:
    """Rate of temperature change (first derivative)."""
    return pd.Series(arr).diff().fillna(0.0).to_numpy()


def compute_thermal_acceleration(arr: np.ndarray) -> np.ndarray:
    """Second derivative of temperature (acceleration of heating)."""
    first = pd.Series(arr).diff().fillna(0.0)
    return first.diff().fillna(0.0).to_numpy()


def compute_all_thermal(
    arr: np.ndarray,
    window: int,
    prefix: str,
) -> dict[str, np.ndarray]:
    """Compute all thermal features for one temperature signal."""
    return {
        f"{prefix}_thermal_drift": compute_thermal_drift(arr, window),
        f"{prefix}_thermal_rate": compute_thermal_rate(arr),
        f"{prefix}_thermal_acceleration": compute_thermal_acceleration(arr),
    }
