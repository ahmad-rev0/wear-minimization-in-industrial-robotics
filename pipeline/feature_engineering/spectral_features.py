"""
Spectral (FFT-based) features for motion and vibration signals.

Applicable to: accelerometer, gyroscope, magnetometer, vibration,
and any oscillatory sensor channel. Features are computed over
sliding windows using vectorized NumPy FFT.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import entropy as scipy_entropy

from utils.windowing import sliding_window


# ── Helpers ──────────────────────────────────────────────────

def _bfill_leading(arr_full: np.ndarray, window: int, values: np.ndarray) -> np.ndarray:
    """Place windowed values at tail positions and back-fill the leading edge."""
    n = len(arr_full)
    arr_full[:] = np.nan
    arr_full[window - 1:window - 1 + len(values)] = values
    return pd.Series(arr_full).bfill().fillna(0.0).to_numpy()


# ── Individual spectral features ─────────────────────────────

def _windowed_fft(arr: np.ndarray, window: int):
    """Compute power spectrum over sliding windows. Returns (power, n)."""
    n = len(arr)
    if n < window:
        return None, n
    wins = sliding_window(arr, window)
    fft_vals = np.fft.rfft(wins, axis=1)
    power = np.abs(fft_vals) ** 2
    return power, n


def compute_spectral_energy(arr: np.ndarray, window: int) -> np.ndarray:
    """Total spectral energy (sum of power spectrum) per window."""
    power, n = _windowed_fft(arr, window)
    if power is None:
        return np.zeros(n)
    values = power.sum(axis=1)
    return _bfill_leading(np.empty(n), window, values)


def compute_dominant_frequency(arr: np.ndarray, window: int) -> np.ndarray:
    """Bin index of the dominant frequency (excluding DC component)."""
    power, n = _windowed_fft(arr, window)
    if power is None:
        return np.zeros(n)
    values = np.argmax(power[:, 1:], axis=1) + 1
    return _bfill_leading(np.empty(n, dtype=np.float64), window, values.astype(np.float64))


def compute_spectral_entropy(arr: np.ndarray, window: int, n_bins: int = 10) -> np.ndarray:
    """Shannon entropy of the amplitude distribution per window."""
    n = len(arr)
    if n < window:
        return np.zeros(n)
    wins = sliding_window(arr, window)
    ent = np.empty(len(wins))
    for i, w in enumerate(wins):
        counts, _ = np.histogram(w, bins=n_bins)
        ent[i] = scipy_entropy(counts + 1e-12)
    return _bfill_leading(np.empty(n), window, ent)


def compute_spectral_centroid(arr: np.ndarray, window: int) -> np.ndarray:
    """
    Weighted mean of frequencies (spectral centroid).

    centroid = sum(f_i * P_i) / sum(P_i)
    where f_i are frequency bin indices and P_i are power values.
    """
    power, n = _windowed_fft(arr, window)
    if power is None:
        return np.zeros(n)
    freqs = np.arange(power.shape[1], dtype=np.float64)
    total_power = power.sum(axis=1)
    total_power[total_power < 1e-12] = 1e-12
    values = (power * freqs[np.newaxis, :]).sum(axis=1) / total_power
    return _bfill_leading(np.empty(n), window, values)


def compute_band_energy(arr: np.ndarray, window: int) -> np.ndarray:
    """
    Energy in the lower-half frequency band (low-frequency content).

    Useful for separating structural vibrations from high-frequency noise.
    """
    power, n = _windowed_fft(arr, window)
    if power is None:
        return np.zeros(n)
    half = power.shape[1] // 2
    values = power[:, :half].sum(axis=1)
    return _bfill_leading(np.empty(n), window, values)


def compute_harmonic_ratio(arr: np.ndarray, window: int) -> np.ndarray:
    """
    Ratio of harmonic (even-bin) to inharmonic (odd-bin) spectral energy.

    A high ratio indicates a periodic signal; low ratio suggests noise.
    """
    power, n = _windowed_fft(arr, window)
    if power is None:
        return np.zeros(n)
    harmonic = power[:, ::2].sum(axis=1)
    inharmonic = power[:, 1::2].sum(axis=1)
    inharmonic[inharmonic < 1e-12] = 1e-12
    values = harmonic / inharmonic
    return _bfill_leading(np.empty(n), window, values)


# ── Batch compute all spectral features for one signal ───────

def compute_all_spectral(
    arr: np.ndarray,
    window: int,
    prefix: str,
) -> dict[str, np.ndarray]:
    """
    Compute the full spectral feature set for a single signal.

    Parameters
    ----------
    arr    : 1-D signal array
    window : sliding window size
    prefix : feature name prefix (e.g. "accelerometer_magnitude")

    Returns
    -------
    Dict mapping "{prefix}_{spectral_feature}" -> 1-D array.
    """
    return {
        f"{prefix}_spectral_energy": compute_spectral_energy(arr, window),
        f"{prefix}_dominant_frequency": compute_dominant_frequency(arr, window),
        f"{prefix}_spectral_entropy": compute_spectral_entropy(arr, window),
        f"{prefix}_spectral_centroid": compute_spectral_centroid(arr, window),
        f"{prefix}_band_energy": compute_band_energy(arr, window),
        f"{prefix}_harmonic_ratio": compute_harmonic_ratio(arr, window),
    }
