"""
Feature extraction from tri-axial magnetometer sensor data.

Input : DataFrame with columns [timestamp, joint_id, mx, my, mz]
Output: DataFrame enriched with sliding-window features per joint.

Source dataset (IMU_magnet.csv) columns mapped as:
    name → joint_id,  time → timestamp,  magX → mx,  magY → my,  magZ → mz

If the raw data contains only a single sensor, it is split into
synthetic joints (one per equal time segment) so the downstream
pipeline can demonstrate multi-joint analysis.
"""

import numpy as np
import pandas as pd
from scipy.stats import entropy as scipy_entropy

from utils.windowing import sliding_window

# Column mapping: raw name → canonical name
_COLUMN_MAP = {
    "name": "joint_id",
    "time": "timestamp",
    "magX": "mx",
    "magY": "my",
    "magZ": "mz",
}

_JOINT_LABELS = ["base", "shoulder", "elbow", "wrist_1", "wrist_2", "wrist_3"]


# ── Loading / normalisation ──────────────────────────────────

def load_and_normalise(path: str, target_joints: int = 6) -> pd.DataFrame:
    """
    Load a sensor CSV and map it to the canonical schema.

    If the dataset contains only one joint_id, the rows are split
    into `target_joints` equal-sized segments, each assigned a
    different joint label.  This lets us demonstrate multi-joint
    analysis on single-sensor datasets.
    """
    df = pd.read_csv(path)

    # Apply column mapping for known raw formats
    rename = {k: v for k, v in _COLUMN_MAP.items() if k in df.columns}
    df = df.rename(columns=rename)

    required = {"joint_id", "timestamp", "mx", "my", "mz"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Dataset missing required columns after mapping: {missing}")

    df = df.sort_values("timestamp").reset_index(drop=True)

    # Synthesise multiple joints from a single-sensor dataset
    unique_joints = df["joint_id"].nunique()
    if unique_joints == 1 and target_joints > 1:
        n = len(df)
        seg = n // target_joints
        labels = []
        for i in range(target_joints):
            label = _JOINT_LABELS[i] if i < len(_JOINT_LABELS) else f"joint_{i}"
            count = seg if i < target_joints - 1 else n - seg * (target_joints - 1)
            labels.extend([label] * count)
        df["joint_id"] = labels

    return df[["joint_id", "timestamp", "mx", "my", "mz"]]


# ── Individual feature functions ─────────────────────────────

def compute_magnitude(df: pd.DataFrame) -> pd.Series:
    """mag = sqrt(mx² + my² + mz²)"""
    return np.sqrt(df["mx"] ** 2 + df["my"] ** 2 + df["mz"] ** 2)


def compute_jerk(mag: pd.Series) -> pd.Series:
    """First derivative of magnitude (rate of change)."""
    return mag.diff().fillna(0.0).abs()


def compute_rolling_std(mag: pd.Series, window: int) -> pd.Series:
    """Rolling standard deviation over a sliding window."""
    return mag.rolling(window, min_periods=1).std().fillna(0.0)


def compute_fft_features(
    mag: pd.Series, window: int
) -> tuple[pd.Series, pd.Series]:
    """
    Spectral energy and dominant frequency via windowed FFT.

    Uses stride-trick windows for a single vectorized rfft call.
    Rows before the first full window are forward-filled from
    the first valid window.
    """
    arr = mag.values.astype(np.float64)
    n = len(arr)

    if n < window:
        return (
            pd.Series(np.zeros(n), index=mag.index),
            pd.Series(np.zeros(n), index=mag.index),
        )

    wins = sliding_window(arr, window)               # (n_win, window)
    fft_vals = np.fft.rfft(wins, axis=1)              # complex
    power = np.abs(fft_vals) ** 2

    spec_energy = power.sum(axis=1)
    # Skip the DC component (index 0) when finding the dominant bin
    dom_freq = np.argmax(power[:, 1:], axis=1) + 1

    # Map back: window i covers rows [i, i+window).  Assign to last row.
    se_full = np.empty(n)
    df_full = np.empty(n)
    se_full[:] = np.nan
    df_full[:] = np.nan
    se_full[window - 1:] = spec_energy
    df_full[window - 1:] = dom_freq

    # Forward-fill leading NaNs
    se_full = pd.Series(se_full).bfill().values
    df_full = pd.Series(df_full).bfill().values

    return (
        pd.Series(se_full, index=mag.index, name="spectral_energy"),
        pd.Series(df_full, index=mag.index, name="dominant_frequency"),
    )


def compute_entropy(mag: pd.Series, window: int, n_bins: int = 10) -> pd.Series:
    """
    Shannon entropy of the magnitude distribution per sliding window.

    A higher entropy indicates a more "spread-out" signal — typical
    of degraded or noisy joints.
    """
    arr = mag.values.astype(np.float64)
    n = len(arr)

    if n < window:
        return pd.Series(np.zeros(n), index=mag.index)

    wins = sliding_window(arr, window)

    # Compute histogram-based entropy for each window in a loop
    # (histograms aren't easily batch-vectorised, but 15K windows is fast)
    ent = np.empty(len(wins))
    for i, w in enumerate(wins):
        counts, _ = np.histogram(w, bins=n_bins)
        ent[i] = scipy_entropy(counts + 1e-12)  # +eps avoids log(0)

    ent_full = np.empty(n)
    ent_full[:] = np.nan
    ent_full[window - 1:] = ent
    ent_full = pd.Series(ent_full).bfill().values

    return pd.Series(ent_full, index=mag.index, name="entropy")


def compute_energy(mag: pd.Series, window: int) -> pd.Series:
    """Sum of squared magnitude values per sliding window."""
    return (mag ** 2).rolling(window, min_periods=1).sum()


# ── Master feature extractor ────────────────────────────────

def extract_features(df: pd.DataFrame, window_size: int = 50) -> pd.DataFrame:
    """
    Compute all features using sliding windows, grouped by joint.

    Returns DataFrame with columns:
        joint_id, timestamp, mag, mag_mean, mag_std, rolling_std,
        jerk, spectral_energy, dominant_frequency, entropy, energy
    """
    parts = []

    for joint_id, group in df.groupby("joint_id"):
        g = group.sort_values("timestamp").reset_index(drop=True)

        mag = compute_magnitude(g)

        feat = pd.DataFrame({
            "joint_id": g["joint_id"],
            "timestamp": g["timestamp"],
            "mag": mag,
            "mag_mean": mag.rolling(window_size, min_periods=1).mean(),
            "mag_std": mag.rolling(window_size, min_periods=1).std().fillna(0.0),
            "rolling_std": compute_rolling_std(mag, window_size),
            "jerk": compute_jerk(mag),
            "energy": compute_energy(mag, window_size),
        })

        se, df_freq = compute_fft_features(mag, window_size)
        feat["spectral_energy"] = se.values
        feat["dominant_frequency"] = df_freq.values
        feat["entropy"] = compute_entropy(mag, window_size).values

        parts.append(feat)

    result = pd.concat(parts, ignore_index=True)
    return result
