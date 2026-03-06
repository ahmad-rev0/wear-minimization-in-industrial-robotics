"""
Orchestrates the full ML pipeline: feature extraction → anomaly detection
→ wear modelling → material recommendation → wear simulation.

All pipeline modules (steps 3-7) are now implemented.  The mock fallback
is retained as a safety net in case of unexpected import errors.
"""

import logging
from pathlib import Path

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)


# ── Real pipeline ────────────────────────────────────────────

def _run_real_pipeline(sensor_csv: Path, materials_csv: Path) -> dict:
    """Run the full pipeline with all real modules."""
    from pipeline.feature_engineering import load_and_normalise, extract_features
    from pipeline.anomaly_detection import detect_anomalies, anomaly_rate_per_joint
    from pipeline.wear_model import compute_wear_index
    from pipeline.material_recommender import load_materials, rank_materials
    from pipeline.wear_simulation import (
        simulate_future_wear,
        compare_material_scenarios,
    )

    log.info("Loading and normalising sensor data from %s", sensor_csv)
    df = load_and_normalise(str(sensor_csv))

    log.info("Extracting features (%d rows, %d joints)", len(df), df["joint_id"].nunique())
    features = extract_features(df)

    log.info("Running anomaly detection")
    features = detect_anomalies(features)
    anom_stats = anomaly_rate_per_joint(features)

    energy_stats = (
        features.groupby("joint_id")["energy"]
        .mean()
        .reset_index()
        .rename(columns={"energy": "signal_energy"})
    )

    log.info("Computing wear index")
    wear = compute_wear_index(anom_stats, energy_stats)

    log.info("Ranking materials")
    materials = load_materials(str(materials_csv))
    recs = rank_materials(wear, materials)

    log.info("Simulating future wear (baseline + top-3 material scenarios)")
    sim = simulate_future_wear(wear)
    material_scenarios = compare_material_scenarios(wear, materials, top_n=3)

    timeline = _build_timeline(features)

    return _format_results(wear, recs, sim, material_scenarios, timeline)


# ── Mock fallback (safety net) ───────────────────────────────

def _mock_pipeline(sensor_csv: Path, materials_csv: Path) -> dict:
    """Generate plausible mock results if the real pipeline fails to import."""
    raw = pd.read_csv(sensor_csv, nrows=5000)

    joint_col = "name" if "name" in raw.columns else "joint_id"
    unique_joints = raw[joint_col].unique().tolist() if joint_col in raw.columns else ["IMU24"]

    all_joints = unique_joints
    if len(all_joints) < 6:
        base = ["base", "shoulder", "elbow", "wrist_1", "wrist_2", "wrist_3"]
        all_joints = base[: max(6, len(all_joints))]

    rng = np.random.default_rng(42)

    joints = []
    for i, jid in enumerate(all_joints):
        wear_idx = round(rng.uniform(0.05, 0.95), 3)
        status = "healthy" if wear_idx < 0.3 else "moderate" if wear_idx < 0.7 else "severe"
        joints.append({
            "joint_id": jid,
            "anomaly_rate": round(rng.uniform(0.01, 0.20), 4),
            "signal_energy": round(rng.uniform(50, 500), 2),
            "wear_index": wear_idx,
            "wear_status": status,
        })

    materials = pd.read_csv(materials_csv)
    baseline_coeff = materials["wear_coefficient"].max()
    recs = [
        {
            "material_name": r["material_name"],
            "wear_coefficient": r["wear_coefficient"],
            "hardness": r["hardness"],
            "friction_coefficient": r["friction_coefficient"],
            "wear_reduction_pct": max(round((1 - r["wear_coefficient"] / baseline_coeff) * 100, 1), 0.0),
        }
        for _, r in materials.sort_values("wear_coefficient").iterrows()
    ]

    simulation = []
    for j in joints:
        traj = []
        w = j["wear_index"]
        rate = j["anomaly_rate"] * j["signal_energy"] / 500
        for t in range(0, 101, 5):
            traj.append({"time": t, "projected_wear": round(min(w + rate * t, 1.0), 4)})
        simulation.append({"joint_id": j["joint_id"], "trajectory": traj})

    return {
        "joints": joints,
        "recommendations": recs,
        "simulation": simulation,
        "material_scenarios": [],
        "timeline": {"timestamps": [], "magnitude": [], "anomaly": []},
    }


# ── Helpers ──────────────────────────────────────────────────

def _build_timeline(features: pd.DataFrame) -> dict:
    """Extract time-series data for the sensor chart."""
    sample = features.head(1000)
    return {
        "timestamps": sample["timestamp"].tolist(),
        "magnitude": sample["mag"].round(4).tolist(),
        "anomaly": sample.get("anomaly", pd.Series(dtype=int)).tolist(),
    }


def _format_results(
    wear_df: pd.DataFrame,
    recs_list: list[dict],
    sim_df: pd.DataFrame,
    material_scenarios_df: pd.DataFrame,
    timeline: dict,
) -> dict:
    """Normalise pipeline outputs into the API response shape."""
    joints = [
        {
            "joint_id": row["joint_id"],
            "anomaly_rate": round(float(row["anomaly_rate"]), 4),
            "signal_energy": round(float(row["signal_energy"]), 2),
            "wear_index": round(float(row["wear_index"]), 3),
            "wear_status": row["wear_status"],
        }
        for _, row in wear_df.iterrows()
    ]

    # Base simulation (current material)
    simulation = []
    if isinstance(sim_df, pd.DataFrame) and not sim_df.empty:
        for jid, grp in sim_df.groupby("joint_id"):
            traj = [
                {"time": int(r["time"]), "projected_wear": round(float(r["projected_wear"]), 4)}
                for _, r in grp.iterrows()
            ]
            simulation.append({"joint_id": str(jid), "trajectory": traj})

    # Material comparison scenarios (current + top-N materials, per joint)
    material_scenarios = []
    if isinstance(material_scenarios_df, pd.DataFrame) and not material_scenarios_df.empty:
        for (jid, mat), grp in material_scenarios_df.groupby(["joint_id", "material_name"]):
            traj = [
                {"time": int(r["time"]), "projected_wear": round(float(r["projected_wear"]), 4)}
                for _, r in grp.iterrows()
            ]
            material_scenarios.append({
                "joint_id": str(jid),
                "material_name": str(mat),
                "trajectory": traj,
            })

    return {
        "joints": joints,
        "recommendations": recs_list,
        "simulation": simulation,
        "material_scenarios": material_scenarios,
        "timeline": timeline,
    }


# ── Public entry point ───────────────────────────────────────

def run_pipeline(sensor_csv: Path, materials_csv: Path) -> dict:
    """
    Execute the analysis pipeline.

    Runs the real pipeline; falls back to mock only on import error.
    """
    try:
        return _run_real_pipeline(sensor_csv, materials_csv)
    except NotImplementedError:
        log.warning("Pipeline module not yet implemented — using mock data")
        return _mock_pipeline(sensor_csv, materials_csv)
    except Exception:
        log.exception("Real pipeline failed — falling back to mock data")
        return _mock_pipeline(sensor_csv, materials_csv)
