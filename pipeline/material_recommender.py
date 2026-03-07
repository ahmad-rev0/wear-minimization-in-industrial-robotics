"""
Material recommendation engine.

Ranks candidate materials by their ability to reduce joint wear:
    adjusted_wear_rate = wear_rate × material_wear_coefficient

Lower adjusted wear → better recommendation.

The baseline is the *worst* wear_coefficient in the materials catalogue
(i.e. the softest, least wear-resistant material).  Every other material
is scored by how much it improves over that baseline.
"""

import pandas as pd


def load_materials(path: str) -> pd.DataFrame:
    """Load materials.csv and validate required columns."""
    df = pd.read_csv(path)
    required = {"material_name", "hardness", "wear_coefficient", "density", "friction_coefficient"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Materials CSV missing columns: {missing}")
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

    The composite is penalised by relative density for the final
    practicality score.  Different datasets will thus produce different
    rankings among materials with similar wear coefficients.
    """
    worst = wear_data.sort_values("wear_index", ascending=False).iloc[0]
    baseline_rate = worst["wear_rate"]

    baseline_coeff = materials_df["wear_coefficient"].max()
    min_density = materials_df["density"].min()
    max_hardness = materials_df["hardness"].max()
    max_friction = materials_df["friction_coefficient"].max()

    friction_w, hardness_w = _dataset_condition_weights(wear_data)

    recommendations = []
    for _, mat in materials_df.iterrows():
        adjusted_rate = baseline_rate * (mat["wear_coefficient"] / baseline_coeff)
        reduction_pct = round((1.0 - adjusted_rate / baseline_rate) * 100, 2)
        reduction_pct = max(reduction_pct, 0.0)

        wear_norm = reduction_pct / 100.0  # 0–1, gating factor
        friction_norm = 1.0 - mat["friction_coefficient"] / max_friction if max_friction > 0 else 0.0
        hardness_norm = mat["hardness"] / max_hardness if max_hardness > 0 else 0.0

        # Wear reduction gates: materials with poor wear never score highly.
        # Friction and hardness give dataset-dependent differentiation.
        bonus = friction_w * friction_norm * 0.35 + hardness_w * hardness_norm * 0.35
        composite = wear_norm * (1.0 + bonus)

        density = float(mat["density"])
        relative_density = density / min_density if min_density > 0 else 1.0
        practicality_score = round(composite * 100.0 / relative_density, 2)

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
