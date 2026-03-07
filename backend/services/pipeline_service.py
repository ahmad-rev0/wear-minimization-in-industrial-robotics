"""
Orchestrates the full ML pipeline: ingestion → feature extraction →
anomaly detection → wear modelling → material recommendation →
wear simulation.

Both the ingestion layer and the feature engineering engine are now
fully dataset-agnostic. The pipeline auto-detects sensor modalities,
computes appropriate features, and adapts the anomaly detection to
whatever columns were produced.

The mock fallback is retained as a safety net.
"""

import logging
import re
from pathlib import Path

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)

_JOINT_LABELS = ["base", "shoulder", "elbow", "wrist_1", "wrist_2", "wrist_3"]


# ── Ingestion ────────────────────────────────────────────────

def _get_canonical(sensor_csv: Path):
    """
    Return a CanonicalDataset, synthesising extra joints when needed.

    If the dataset contains only one joint and >100 samples, split
    into 6 synthetic joints for multi-joint analysis demonstration.
    """
    from pipeline.ingestion import infer_schema, validate_dataset, map_dataset
    from pipeline.ingestion.dataset_mapper import CanonicalDataset, JointData
    from backend.services.state import get_state

    state = get_state()

    canonical = state.canonical_dataset
    if canonical is None:
        df_raw = pd.read_csv(sensor_csv)

        max_rows = getattr(state, "max_rows", 20000)
        if len(df_raw) > max_rows:
            log.warning(
                "Dataset has %d rows, downsampling to %d for performance",
                len(df_raw), max_rows,
            )
            df_raw = df_raw.sample(n=max_rows, random_state=42).sort_index().reset_index(drop=True)

        schema = state.inferred_schema
        if schema is None:
            schema = infer_schema(df_raw)
            state.inferred_schema = schema
        quality = validate_dataset(df_raw, schema)
        state.quality_report = quality
        log.info(
            "Ingestion: %d rows, %d cols, %d warnings, valid=%s",
            quality.total_rows, quality.total_columns,
            len(quality.warnings), quality.is_valid,
        )
        canonical = map_dataset(df_raw, schema)
        state.canonical_dataset = canonical

    log.info(
        "Canonical dataset: %d joints, modalities=%s",
        canonical.n_joints, sorted(canonical.all_modalities),
    )

    # Synthesise multiple joints from single-joint datasets
    if canonical.n_joints == 1:
        name, jd = next(iter(canonical.joints.items()))
        if jd.n_samples > 100:
            target = 6
            n = jd.n_samples
            seg = n // target
            new_joints: dict[str, JointData] = {}
            for i in range(target):
                label = _JOINT_LABELS[i] if i < len(_JOINT_LABELS) else f"joint_{i}"
                start = i * seg
                end = n if i == target - 1 else (i + 1) * seg
                sensors = {k: v[start:end].copy() for k, v in jd.sensors.items()}
                time_slice = jd.time[start:end].copy()
                new_joints[label] = JointData(
                    joint_name=label, time=time_slice, sensors=sensors,
                )
            canonical = CanonicalDataset(
                joints=new_joints,
                schema=canonical.schema,
                sampling_rate_hz=canonical.sampling_rate_hz,
                metadata=canonical.metadata,
            )
            state.canonical_dataset = canonical
            log.info("Synthesised %d joints from single-sensor dataset", target)

    return canonical


# ── Dynamic column helpers ───────────────────────────────────

def _find_energy_column(features: pd.DataFrame) -> str:
    """Find the best energy column for signal_energy aggregation."""
    # Prefer a magnitude energy column
    for col in features.columns:
        if "magnitude_energy" in col:
            return col
    for col in features.columns:
        if col.endswith("_energy") and "spectral" not in col and "band" not in col:
            return col
    # Absolute fallback
    if "energy" in features.columns:
        return "energy"
    numeric = features.select_dtypes(include=[np.number]).columns.tolist()
    rms_cols = [c for c in numeric if c.endswith("_rms")]
    if rms_cols:
        return rms_cols[0]
    return numeric[0] if numeric else "timestamp"


def _find_magnitude_column(features: pd.DataFrame) -> str:
    """Find a magnitude column for the sensor timeline chart."""
    for col in features.columns:
        if "magnitude_mean" in col:
            return col
    for col in features.columns:
        if "magnitude" in col and col not in {"joint_id", "timestamp"}:
            return col
    for col in features.columns:
        if col.endswith("_rms"):
            return col
    numeric = features.select_dtypes(include=[np.number]).columns.tolist()
    non_meta = [c for c in numeric if c not in {"timestamp", "anomaly", "anomaly_score"}]
    return non_meta[0] if non_meta else "timestamp"


# ── Real pipeline ────────────────────────────────────────────

def _run_real_pipeline(sensor_csv: Path, materials_csv: Path) -> dict:
    """Run the full pipeline with the new dataset-agnostic engine."""
    from pipeline.feature_engineering import (
        extract_features_from_canonical,
        apply_feature_selection,
    )
    from pipeline.anomaly_detection import detect_anomalies, anomaly_rate_per_joint
    from pipeline.wear_model import compute_wear_index
    from pipeline.material_recommender import load_materials, rank_materials
    from pipeline.wear_simulation import (
        simulate_future_wear,
        compare_material_scenarios,
    )
    from backend.services.state import get_state

    state = get_state()

    state.progress = "Ingesting dataset and inferring schema..."
    log.info("Ingesting dataset via schema-adaptive layer: %s", sensor_csv)
    canonical = _get_canonical(sensor_csv)

    state.progress = f"Extracting features from {canonical.n_joints} joints..."
    log.info(
        "Extracting features (%d joints, %s modalities)",
        canonical.n_joints, sorted(canonical.all_modalities),
    )
    features = extract_features_from_canonical(canonical)

    # Cache full feature matrix for /available_features endpoint
    state.cached_features = features

    # Apply feature selection if configured
    fs_config = state.feature_selection_config
    if fs_config is not None:
        pre_cols = len(features.columns) - 2
        features = apply_feature_selection(features, fs_config)
        post_cols = len(features.columns) - 2
        log.info(
            "Feature selection applied: %d -> %d features",
            pre_cols, post_cols,
        )

    # Apply feature deselection from pipeline config
    deselected = getattr(state, "deselected_features", [])
    if deselected:
        to_drop = [c for c in deselected if c in features.columns and c not in {"joint_id", "timestamp"}]
        if to_drop:
            features = features.drop(columns=to_drop)
            log.info("Deselected %d features per user config", len(to_drop))

    # Use configured model or default, inject contamination from pipeline config
    model_config = state.model_config
    contamination = getattr(state, "contamination", 0.1)
    if model_config is not None:
        if "contamination" in model_config.params or model_config.model_id in ("isolation_forest", "local_outlier_factor"):
            model_config.params["contamination"] = contamination
    else:
        from pipeline.modeling.model_registry import ModelConfig
        model_config = ModelConfig(params={"contamination": contamination})

    model_name = model_config.model_id if model_config else "isolation_forest"
    state.progress = f"Running anomaly detection ({model_name})..."
    log.info(
        "Running anomaly detection on %d feature columns (model=%s, contamination=%.2f)",
        len(features.columns) - 2,
        model_name,
        contamination,
    )
    features = detect_anomalies(features, model_config=model_config)
    anom_stats = anomaly_rate_per_joint(features)

    state.progress = "Generating ML diagnostics report..."
    log.info("Generating ML diagnostics report")
    from pipeline.evaluation import generate_diagnostics
    diagnostics = generate_diagnostics(
        features, model_config=model_config, compute_importance=True,
    )
    state.diagnostics = diagnostics

    # Store model comparison entry
    sil = diagnostics.unsupervised.silhouette_score if diagnostics.unsupervised else None
    state.model_comparison[diagnostics.model_id] = {
        "display_name": diagnostics.model_display_name,
        "silhouette_score": sil,
        "anomaly_rate": diagnostics.unsupervised.global_anomaly_rate if diagnostics.unsupervised else 0,
    }

    log.info(
        "Diagnostics: silhouette=%.4f, anomaly_rate=%.3f, top_feature=%s",
        diagnostics.unsupervised.silhouette_score or 0.0,
        diagnostics.unsupervised.global_anomaly_rate,
        diagnostics.feature_importance.features[0].feature
        if diagnostics.feature_importance and diagnostics.feature_importance.features
        else "N/A",
    )

    energy_col = _find_energy_column(features)
    log.info("Using '%s' as signal energy metric", energy_col)
    energy_stats = (
        features.groupby("joint_id")[energy_col]
        .mean()
        .reset_index()
        .rename(columns={energy_col: "signal_energy"})
    )

    # Resolve joint parameters (user-provided or defaults)
    from pipeline.physics.joint_parameters import default_joint_params
    jp = state.joint_params
    if jp is None:
        jp = default_joint_params(canonical.joint_names)

    state.progress = "Computing wear index (Archard's law)..."
    log.info("Computing wear index (Archard's law, %d joints with physics params)", len(jp))
    wear = compute_wear_index(
        anom_stats,
        energy_stats,
        features=features,
        joint_params=jp,
        materials_df=load_materials(str(materials_csv)),
        sampling_rate_hz=canonical.sampling_rate_hz,
    )

    state.progress = "Ranking materials and simulating wear scenarios..."
    log.info("Ranking materials")
    materials = load_materials(str(materials_csv))
    recs = rank_materials(wear, materials)

    log.info("Simulating future wear (baseline + top-3 material scenarios)")
    sim = simulate_future_wear(wear)
    top_material_names = [r["material_name"] for r in recs[:3]]
    material_scenarios = compare_material_scenarios(
        wear, materials, top_n=3, ranked_names=top_material_names,
    )

    state.progress = "Building sensor timeline..."
    timeline = _build_timeline(features)

    state.progress = "Finalizing results..."
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
    """Extract time-series data for the sensor chart.

    Tries to use raw sensor data from the canonical dataset first,
    falling back to engineered features.  Returns empty lists when no
    meaningful numeric data is available.
    """
    from backend.services.state import get_state

    state = get_state()
    canonical = state.canonical_dataset

    # Try raw sensor data from the canonical dataset
    if canonical is not None:
        first_joint_name = next(iter(canonical.joints), None)
        if first_joint_name:
            jd = canonical.joints[first_joint_name]
            if jd.sensors:
                raw_key = next(iter(jd.sensors))
                raw_vals = jd.sensors[raw_key]
                n = min(len(raw_vals), 1000)
                ts = list(range(n))
                mag = [round(float(v), 4) for v in raw_vals[:n]]
                anomaly_col = features.get("anomaly", pd.Series(dtype=int))
                anom = anomaly_col.head(n).tolist() if len(anomaly_col) >= n else [0] * n
                if any(v != 0 for v in mag):
                    return {"timestamps": ts, "magnitude": mag, "anomaly": anom}

    # Fallback to engineered features
    mag_col = _find_magnitude_column(features)
    sample = features.head(1000)
    mag_values = sample[mag_col].round(4).tolist()
    if all(v == 0 for v in mag_values):
        return {"timestamps": [], "magnitude": [], "anomaly": []}

    return {
        "timestamps": sample["timestamp"].tolist(),
        "magnitude": mag_values,
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

    Propagates all exceptions so the caller can report them properly.
    """
    return _run_real_pipeline(sensor_csv, materials_csv)
