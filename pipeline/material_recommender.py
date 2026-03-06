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


def rank_materials(
    wear_data: pd.DataFrame,
    materials_df: pd.DataFrame,
) -> list[dict]:
    """
    Rank materials by how much they reduce wear for the worst joint.

    Parameters
    ----------
    wear_data : DataFrame from compute_wear_index()
        Must contain columns [joint_id, wear_rate, wear_index].
    materials_df : DataFrame from load_materials().

    Returns
    -------
    List of dicts sorted by wear_reduction_pct (descending), each with:
        material_name, wear_coefficient, hardness,
        friction_coefficient, wear_reduction_pct
    """
    # Identify the worst-worn joint as the reference point
    worst = wear_data.sort_values("wear_index", ascending=False).iloc[0]
    baseline_rate = worst["wear_rate"]

    # The baseline material is the one with the highest (worst) wear_coefficient
    baseline_coeff = materials_df["wear_coefficient"].max()

    recommendations = []
    for _, mat in materials_df.iterrows():
        # Project what the wear rate would be with this material
        adjusted_rate = baseline_rate * (mat["wear_coefficient"] / baseline_coeff)
        reduction_pct = round((1.0 - adjusted_rate / baseline_rate) * 100, 2)

        recommendations.append({
            "material_name": mat["material_name"],
            "wear_coefficient": float(mat["wear_coefficient"]),
            "hardness": float(mat["hardness"]),
            "friction_coefficient": float(mat["friction_coefficient"]),
            "wear_reduction_pct": max(reduction_pct, 0.0),
        })

    recommendations.sort(key=lambda r: r["wear_reduction_pct"], reverse=True)
    return recommendations
