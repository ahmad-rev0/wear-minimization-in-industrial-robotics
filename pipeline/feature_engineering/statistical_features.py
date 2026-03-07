"""
Universal statistical features applicable to any sensor signal.

Every function accepts a 1-D NumPy array (one signal channel for one
joint) and a window size, and returns a 1-D array of the same length.

All computations use vectorized pandas rolling or NumPy operations —
no Python-level per-window lambdas, which would be prohibitively slow
for multi-signal, multi-joint datasets.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


# ── Windowed helpers ─────────────────────────────────────────

def _rolling(arr: np.ndarray, window: int):
    """Wrap array in a Series for pandas rolling operations."""
    return pd.Series(arr).rolling(window, min_periods=1)


# ── Feature functions ────────────────────────────────────────

def compute_mean(arr: np.ndarray, window: int) -> np.ndarray:
    return _rolling(arr, window).mean().to_numpy()


def compute_std(arr: np.ndarray, window: int) -> np.ndarray:
    return _rolling(arr, window).std().fillna(0.0).to_numpy()


def compute_variance(arr: np.ndarray, window: int) -> np.ndarray:
    return _rolling(arr, window).var().fillna(0.0).to_numpy()


def compute_skewness(arr: np.ndarray, window: int) -> np.ndarray:
    """
    Rolling skewness using the moment-based formula built from
    vectorized rolling sums. Avoids per-window Python callbacks.

    skew = E[(X - mu)^3] / sigma^3
    """
    s = pd.Series(arr, dtype=np.float64)
    r = s.rolling(window, min_periods=3)
    mu = r.mean()
    sigma = r.std()
    sigma_safe = sigma.replace(0, np.nan)
    m3 = ((s - mu) ** 3).rolling(window, min_periods=3).mean()
    result = (m3 / (sigma_safe ** 3)).fillna(0.0)
    return result.to_numpy()


def compute_kurtosis(arr: np.ndarray, window: int) -> np.ndarray:
    """
    Rolling excess kurtosis using moment-based formula.

    kurt = E[(X - mu)^4] / sigma^4 - 3
    """
    s = pd.Series(arr, dtype=np.float64)
    r = s.rolling(window, min_periods=4)
    mu = r.mean()
    sigma = r.std()
    sigma_safe = sigma.replace(0, np.nan)
    m4 = ((s - mu) ** 4).rolling(window, min_periods=4).mean()
    result = (m4 / (sigma_safe ** 4) - 3.0).fillna(0.0)
    return result.to_numpy()


def compute_rms(arr: np.ndarray, window: int) -> np.ndarray:
    """Root mean square over a sliding window."""
    sq = pd.Series(arr ** 2).rolling(window, min_periods=1).mean()
    return np.sqrt(sq.to_numpy())


def compute_peak_to_peak(arr: np.ndarray, window: int) -> np.ndarray:
    r = _rolling(arr, window)
    return (r.max() - r.min()).fillna(0.0).to_numpy()


def compute_jerk(arr: np.ndarray) -> np.ndarray:
    """First derivative (absolute rate of change)."""
    return np.abs(pd.Series(arr).diff().fillna(0.0).to_numpy())


def compute_energy(arr: np.ndarray, window: int) -> np.ndarray:
    """Sum of squared values per sliding window."""
    return pd.Series(arr ** 2).rolling(window, min_periods=1).sum().to_numpy()


# ── Batch compute all statistical features for one signal ────

def compute_all_statistical(
    arr: np.ndarray,
    window: int,
    prefix: str,
) -> dict[str, np.ndarray]:
    """
    Compute the full statistical feature set for a single signal.

    Parameters
    ----------
    arr    : 1-D signal array (one channel, one joint)
    window : sliding window size
    prefix : feature name prefix (e.g. "magnetometer_x")

    Returns
    -------
    Dict mapping "{prefix}_{stat}" -> 1-D array of same length as arr.
    """
    return {
        f"{prefix}_mean": compute_mean(arr, window),
        f"{prefix}_std": compute_std(arr, window),
        f"{prefix}_variance": compute_variance(arr, window),
        f"{prefix}_skewness": compute_skewness(arr, window),
        f"{prefix}_kurtosis": compute_kurtosis(arr, window),
        f"{prefix}_rms": compute_rms(arr, window),
        f"{prefix}_peak_to_peak": compute_peak_to_peak(arr, window),
        f"{prefix}_jerk": compute_jerk(arr),
        f"{prefix}_energy": compute_energy(arr, window),
    }
