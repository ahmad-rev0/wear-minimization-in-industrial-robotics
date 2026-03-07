"""
Physics-based wear estimation using Archard's wear law.

    V = (k × F × s) / H

Where:
    V  = wear volume [m³]
    k  = dimensionless wear coefficient (derived from anomaly intensity)
    F  = normal force (load) at the joint [N]
    s  = sliding distance [m]  (estimated from motion signals)
    H  = material hardness [HV]

The wear volume is normalised into a severity index [0, 1] and
classified into status categories (healthy / moderate / severe).

Sliding distance is estimated from the RMS of motion signals
(accelerometer, gyroscope, or any velocity-like channel) integrated
over the measurement window, scaled by the joint radius.
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import pandas as pd

from pipeline.physics.joint_parameters import JointParameters

log = logging.getLogger(__name__)

# Default hardness when material lookup fails [HV]
_DEFAULT_HARDNESS = 600.0

# Base wear coefficient before anomaly adjustment
_BASE_K = 1e-4

# How much anomaly rate amplifies the wear coefficient
_ANOMALY_AMPLIFICATION = 10.0


# ── Sliding distance estimation ──────────────────────────────

def estimate_sliding_distance(
    features: pd.DataFrame,
    joint_id: str,
    joint_params: JointParameters,
    sampling_rate_hz: Optional[float] = None,
) -> float:
    """
    Estimate the cumulative sliding distance for a joint from sensor features.

    Strategy:
        1. If the user provided an explicit sliding_velocity, use it.
        2. Otherwise, find an RMS feature for motion signals (accel, gyro)
           and integrate: s ≈ RMS_velocity × dt × n_samples × radius.
        3. Fallback: use signal energy as a proxy.

    Returns sliding distance in metres.
    """
    if joint_params.sliding_velocity is not None:
        dt = 1.0 / (sampling_rate_hz or 10.0)
        joint_rows = features[features["joint_id"] == joint_id]
        n = len(joint_rows)
        return joint_params.sliding_velocity * dt * n

    joint_rows = features[features["joint_id"] == joint_id]
    if joint_rows.empty:
        return 0.0

    radius = joint_params.joint_radius

    # Look for gyroscope magnitude RMS → angular velocity → linear velocity
    gyro_rms_cols = [c for c in joint_rows.columns if "gyroscope" in c and c.endswith("_rms")]
    if gyro_rms_cols:
        mean_angular_rms = joint_rows[gyro_rms_cols].mean(axis=1).mean()
        dt = 1.0 / (sampling_rate_hz or 10.0)
        n = len(joint_rows)
        return float(mean_angular_rms * radius * dt * n)

    # Fallback: accelerometer RMS → approximate velocity via integration
    accel_rms_cols = [c for c in joint_rows.columns if "accelerometer" in c and c.endswith("_rms")]
    if accel_rms_cols:
        mean_accel_rms = joint_rows[accel_rms_cols].mean(axis=1).mean()
        dt = 1.0 / (sampling_rate_hz or 10.0)
        n = len(joint_rows)
        return float(mean_accel_rms * dt * dt * n * radius)

    # Last resort: use any energy column as a proxy
    energy_cols = [c for c in joint_rows.columns if c.endswith("_energy") and "spectral" not in c and "band" not in c]
    if energy_cols:
        mean_energy = joint_rows[energy_cols].mean(axis=1).mean()
        return float(np.sqrt(mean_energy) * radius * 0.01)

    return 1.0  # safe non-zero default


# ── Archard's wear law ───────────────────────────────────────

def _effective_k(anomaly_rate: float, lubrication: float) -> float:
    """
    Compute the effective dimensionless wear coefficient.

    k = k_base × (1 + amp × anomaly_rate) × (1 - 0.5 × lubrication)

    Higher anomaly rates → more abnormal operation → higher k.
    Better lubrication → lower k.
    """
    anomaly_factor = 1.0 + _ANOMALY_AMPLIFICATION * anomaly_rate
    lubrication_factor = 1.0 - 0.5 * min(max(lubrication, 0.0), 1.0)
    return _BASE_K * anomaly_factor * lubrication_factor


def _resolve_hardness(
    joint_params: JointParameters,
    materials_df: Optional[pd.DataFrame] = None,
) -> float:
    """Resolve material hardness: user override > materials DB > default."""
    if joint_params.hardness is not None:
        return joint_params.hardness
    if materials_df is not None:
        match = materials_df[
            materials_df["material_name"].str.contains(
                joint_params.material, case=False, na=False
            )
        ]
        if not match.empty:
            return float(match.iloc[0]["hardness"])
    return _DEFAULT_HARDNESS


def compute_archard_wear(
    load: float,
    sliding_distance: float,
    hardness: float,
    k: float,
) -> float:
    """
    Archard's wear law:  V = (k × F × s) / H

    Returns wear volume in m³.
    """
    if hardness < 1e-6:
        hardness = _DEFAULT_HARDNESS
    return (k * load * sliding_distance) / hardness


# ── Public API: full physics wear computation ────────────────

def compute_physics_wear(
    anomaly_stats: pd.DataFrame,
    feature_stats: pd.DataFrame,
    features: pd.DataFrame,
    joint_params: dict[str, JointParameters],
    materials_df: Optional[pd.DataFrame] = None,
    sampling_rate_hz: Optional[float] = None,
) -> pd.DataFrame:
    """
    Compute per-joint wear using Archard's law with physics parameters.

    Parameters
    ----------
    anomaly_stats  : DataFrame with [joint_id, anomaly_rate]
    feature_stats  : DataFrame with [joint_id, signal_energy]
    features       : full feature matrix (for sliding distance estimation)
    joint_params   : dict of joint_id -> JointParameters
    materials_df   : materials catalogue (for hardness lookup)
    sampling_rate_hz : dataset sampling rate

    Returns
    -------
    DataFrame with columns:
        joint_id, anomaly_rate, signal_energy, load_force, sliding_distance,
        hardness, k_eff, wear_volume, wear_index, wear_status
    """
    merged = anomaly_stats[["joint_id", "anomaly_rate"]].merge(
        feature_stats[["joint_id", "signal_energy"]],
        on="joint_id",
        how="inner",
    )

    results: list[dict] = []
    for _, row in merged.iterrows():
        jid = row["joint_id"]
        anom_rate = float(row["anomaly_rate"])
        sig_energy = float(row["signal_energy"])

        jp = joint_params.get(jid, JointParameters(joint_id=jid))

        k = _effective_k(anom_rate, jp.lubrication_coefficient)
        hardness = _resolve_hardness(jp, materials_df)
        sliding_dist = estimate_sliding_distance(
            features, jid, jp, sampling_rate_hz,
        )

        wear_vol = compute_archard_wear(jp.load_force, sliding_dist, hardness, k)

        results.append({
            "joint_id": jid,
            "anomaly_rate": anom_rate,
            "signal_energy": sig_energy,
            "load_force": jp.load_force,
            "sliding_distance": round(sliding_dist, 6),
            "hardness": hardness,
            "k_eff": round(k, 8),
            "wear_volume": wear_vol,
        })

    df = pd.DataFrame(results)

    if df.empty:
        df["wear_index"] = []
        df["wear_status"] = []
        df["wear_rate"] = []
        return df

    # Normalise wear volume to [0, 1] severity index
    wv = df["wear_volume"]
    wv_min, wv_max = wv.min(), wv.max()
    if wv_max - wv_min < 1e-18:
        df["wear_index"] = 0.5
    else:
        df["wear_index"] = ((wv - wv_min) / (wv_max - wv_min)).round(4)

    df["wear_status"] = df["wear_index"].apply(_classify_wear)

    # Keep wear_rate for backward compat with simulation module
    df["wear_rate"] = df["wear_volume"]

    log.info(
        "Physics wear computed: %d joints, k_range=[%.2e, %.2e], "
        "volume_range=[%.2e, %.2e]",
        len(df),
        df["k_eff"].min(), df["k_eff"].max(),
        wv_min, wv_max,
    )

    return df


def _classify_wear(index: float) -> str:
    if index < 0.3:
        return "healthy"
    if index < 0.7:
        return "moderate"
    return "severe"
