"""
Material recommendation engine.

Ranks candidate materials by their ability to reduce joint wear:
    adjusted_wear_rate = wear_rate × material_wear_coefficient

Lower adjusted wear → better recommendation.

The baseline is the *worst* wear_coefficient in the materials catalogue
(i.e. the softest, least wear-resistant material).  Every other material
is scored by how much it improves over that baseline.

The practicality score additionally accounts for density and cost, so
expensive coatings like DLC are penalised even when they have superior
wear properties.
"""

import pandas as pd


def load_materials(path: str) -> pd.DataFrame:
    """Load materials.csv and validate required columns."""
    df = pd.read_csv(path)
    required = {"material_name", "hardness", "wear_coefficient", "density", "friction_coefficient"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Materials CSV missing columns: {missing}")
    # cost_factor is optional — default to 3 (mid-range) if absent
    if "cost_factor" not in df.columns:
        df["cost_factor"] = 3
    return df


def _dataset_condition_weights(wear_data: pd.DataFrame) -> tuple[float, float]:
    """Derive friction and hardness bonus weights from dataset characteristics.

    Returns (friction_bonus, hardness_bonus) each in [0, 1].
    High signal energy → friction matters more (aggressive motion / heat).
    High anomaly rate → hardness matters more (surface degradation).
    """
    anomaly_rate = float(wear_data["anomaly_rate"].mean()) if "anomaly_rate" in wear_data.columns else 0.1
    energy_vals = wear_data["signal_energy"] if "signal_energy" in wear_data.columns else None
    if energy_vals is not None and len(energy_vals) > 0:
        energy_mean = float(energy_vals.mean())
        energy_max = float(energy_vals.max())
        energy_norm = energy_mean / max(energy_max, 1e-9)
    else:
        energy_norm = 0.3

    anomaly_norm = min(anomaly_rate / 0.3, 1.0)
    return min(energy_norm, 1.0), min(anomaly_norm, 1.0)


def rank_materials(
    wear_data: pd.DataFrame,
    materials_df: pd.DataFrame,
) -> list[dict]:
    """
    Rank materials using a dataset-adaptive composite score.

    Wear reduction is always the primary factor (gating multiplier).
    Friction and hardness provide secondary differentiation whose
    influence scales with the dataset's operating severity:
      - High signal energy → low-friction materials get a bigger boost
      - High anomaly rate → hard materials get a bigger boost

    The composite is penalised by both relative density AND cost_factor
    so that expensive coatings (e.g. DLC) don't dominate the ranking
    even when their wear properties are superior.
    """
    worst = wear_data.sort_values("wear_index", ascending=False).iloc[0]
    baseline_rate = worst["wear_rate"]

    baseline_coeff = materials_df["wear_coefficient"].max()
    min_density = materials_df["density"].min()
    max_hardness = materials_df["hardness"].max()
    max_friction = materials_df["friction_coefficient"].max()
    min_cost = float(materials_df["cost_factor"].min()) if "cost_factor" in materials_df.columns else 1.0

    friction_w, hardness_w = _dataset_condition_weights(wear_data)

    recommendations = []
    for _, mat in materials_df.iterrows():
        adjusted_rate = baseline_rate * (mat["wear_coefficient"] / baseline_coeff)
        reduction_pct = round((1.0 - adjusted_rate / baseline_rate) * 100, 2)
        reduction_pct = max(reduction_pct, 0.0)

        wear_norm = reduction_pct / 100.0
        friction_norm = 1.0 - mat["friction_coefficient"] / max_friction if max_friction > 0 else 0.0
        hardness_norm = mat["hardness"] / max_hardness if max_hardness > 0 else 0.0

        bonus = friction_w * friction_norm * 0.35 + hardness_w * hardness_norm * 0.35
        # wear_norm^1.5 strongly penalises materials with poor wear reduction
        # so low-density/low-cost materials can't game the ranking
        composite = (wear_norm ** 1.5) * (1.0 + bonus)

        density = float(mat["density"])
        relative_density = density / min_density if min_density > 0 else 1.0

        cost = float(mat.get("cost_factor", 3))
        relative_cost = cost / min_cost if min_cost > 0 else 1.0

        # Penalise by sqrt(cost) so expensive materials are disadvantaged
        # but not completely eliminated (a cost=9 material gets ~3x penalty)
        practicality_score = round(composite * 100.0 / (relative_density * relative_cost ** 0.5), 2)

        recommendations.append({
            "material_name": mat["material_name"],
            "wear_coefficient": float(mat["wear_coefficient"]),
            "hardness": float(mat["hardness"]),
            "friction_coefficient": float(mat["friction_coefficient"]),
            "density": density,
            "wear_reduction_pct": reduction_pct,
            "practicality_score": practicality_score,
        })

    recommendations.sort(key=lambda r: r["practicality_score"], reverse=True)
    return recommendations
