"""
Wear simulation over a future time horizon.

Base formula (linear):
    future_wear = current_wear + wear_rate × Δt

Non-linear degradation model (more realistic):
    wear(t+dt) = wear(t) + rate × (1 + α × wear(t)) × dt

The α term captures the positive feedback loop where degraded
joints accumulate wear faster (rougher surfaces, micro-pitting, etc.).

Material upgrades modify the effective rate:
    adjusted_rate = base_rate × (material_coeff / baseline_coeff)
"""

import numpy as np
import pandas as pd

# Degradation acceleration factor — higher = more aggressive feedback loop
_ALPHA = 1.5


def _project_trajectory(
    current_wear: float,
    wear_rate: float,
    time_horizon: int,
    time_step: int,
    alpha: float = _ALPHA,
) -> list[dict]:
    """
    Step through time with non-linear degradation.

    Returns list of {time, projected_wear} dicts.
    """
    # Normalise the rate so that at wear_index=0 the derivative is `wear_rate`
    # and at wear_index=1 the derivative is `wear_rate * (1 + alpha)`.
    rate = wear_rate / time_horizon  # scale rate to the time horizon

    trajectory = [{"time": 0, "projected_wear": round(current_wear, 4)}]
    w = current_wear

    for t in range(time_step, time_horizon + 1, time_step):
        dw = rate * (1.0 + alpha * w) * time_step
        w = min(w + dw, 1.0)
        trajectory.append({"time": t, "projected_wear": round(w, 4)})

    return trajectory


def simulate_future_wear(
    wear_data: pd.DataFrame,
    time_horizon: int = 100,
    time_step: int = 5,
) -> pd.DataFrame:
    """
    Project wear forward in time for each joint using non-linear degradation.

    Parameters
    ----------
    wear_data : DataFrame from compute_wear_index()
        Must contain [joint_id, wear_index, wear_rate].
    time_horizon : number of time units to project forward.
    time_step : granularity of the projection.

    Returns
    -------
    DataFrame with columns: joint_id, time, projected_wear
    """
    rows = []
    wr_max = wear_data["wear_rate"].max()
    if wr_max < 1e-12:
        wr_max = 1.0

    for _, joint in wear_data.iterrows():
        # Normalise wear_rate to [0,1]-ish scale for the simulation
        norm_rate = joint["wear_rate"] / wr_max
        traj = _project_trajectory(
            current_wear=joint["wear_index"],
            wear_rate=norm_rate,
            time_horizon=time_horizon,
            time_step=time_step,
        )
        for pt in traj:
            rows.append({
                "joint_id": joint["joint_id"],
                "time": pt["time"],
                "projected_wear": pt["projected_wear"],
            })

    return pd.DataFrame(rows)


def simulate_material_improvement(
    wear_data: pd.DataFrame,
    material: dict,
    baseline_coeff: float,
    time_horizon: int = 100,
    time_step: int = 5,
) -> pd.DataFrame:
    """
    Simulate how a material upgrade changes the wear trajectory.

    Parameters
    ----------
    wear_data : DataFrame from compute_wear_index().
    material : dict with at least 'material_name' and 'wear_coefficient'.
    baseline_coeff : the current (worst-case) material wear coefficient.
    time_horizon, time_step : as in simulate_future_wear.

    Returns
    -------
    DataFrame with columns: joint_id, time, projected_wear, material_name
    """
    coeff_ratio = material["wear_coefficient"] / baseline_coeff
    wr_max = wear_data["wear_rate"].max()
    if wr_max < 1e-12:
        wr_max = 1.0

    rows = []
    for _, joint in wear_data.iterrows():
        norm_rate = (joint["wear_rate"] / wr_max) * coeff_ratio
        traj = _project_trajectory(
            current_wear=joint["wear_index"],
            wear_rate=norm_rate,
            time_horizon=time_horizon,
            time_step=time_step,
        )
        for pt in traj:
            rows.append({
                "joint_id": joint["joint_id"],
                "time": pt["time"],
                "projected_wear": pt["projected_wear"],
                "material_name": material["material_name"],
            })

    return pd.DataFrame(rows)


def compare_material_scenarios(
    wear_data: pd.DataFrame,
    materials_df: pd.DataFrame,
    top_n: int = 3,
    time_horizon: int = 100,
    time_step: int = 5,
    ranked_names: list[str] | None = None,
) -> pd.DataFrame:
    """
    Simulate the top-N best materials against the current baseline.

    Parameters
    ----------
    ranked_names : if provided, use these material names (in order) instead
                   of computing a static ranking.  Allows the chart to
                   reflect the same dataset-aware ranking as the panel.

    Returns a DataFrame with columns:
        joint_id, time, projected_wear, material_name

    The first scenario is "Current Material" (no improvement).
    """
    baseline_coeff = materials_df["wear_coefficient"].max()

    current = simulate_future_wear(wear_data, time_horizon, time_step)
    current["material_name"] = "Current Material (assumed worst-case)"

    if ranked_names:
        names = ranked_names[:top_n]
        best_materials = materials_df[materials_df["material_name"].isin(names)]
    else:
        best_materials = materials_df.nsmallest(top_n, "wear_coefficient")
    improved = []
    for _, mat in best_materials.iterrows():
        sim = simulate_material_improvement(
            wear_data,
            mat.to_dict(),
            baseline_coeff,
            time_horizon,
            time_step,
        )
        improved.append(sim)

    return pd.concat([current] + improved, ignore_index=True)
