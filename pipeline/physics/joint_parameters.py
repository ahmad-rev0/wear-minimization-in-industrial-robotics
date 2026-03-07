"""
Mechanical joint parameters for physics-based wear modelling.

Users can supply custom parameters per joint via the API. When not
provided, sensible defaults for a typical 6-DOF industrial robot arm
are used. The defaults are calibrated for a UR5-class manipulator.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class JointParameters:
    """Physical parameters for a single robot joint."""

    joint_id: str
    load_force: float = 50.0           # Normal force at the joint [N]
    joint_radius: float = 0.04         # Effective contact radius [m]
    material: str = "Hardened Steel"    # Current material name
    lubrication_coefficient: float = 0.5  # 0=dry, 1=fully lubricated
    contact_area: float = 1e-4         # Effective contact area [m²]
    hardness: Optional[float] = None   # Material hardness [HV]. Auto-resolved from materials DB if None.
    sliding_velocity: Optional[float] = None  # Override estimated sliding velocity [m/s]

    def to_dict(self) -> dict:
        return {
            "joint_id": self.joint_id,
            "load_force": self.load_force,
            "joint_radius": self.joint_radius,
            "material": self.material,
            "lubrication_coefficient": self.lubrication_coefficient,
            "contact_area": self.contact_area,
            "hardness": self.hardness,
            "sliding_velocity": self.sliding_velocity,
        }


# ── Default parameter sets ───────────────────────────────────

# Typical parameters for a 6-DOF arm where base joints bear more load
_DEFAULTS: dict[str, dict] = {
    "base":     {"load_force": 120.0, "joint_radius": 0.06, "contact_area": 2.0e-4},
    "shoulder": {"load_force": 100.0, "joint_radius": 0.055, "contact_area": 1.8e-4},
    "elbow":    {"load_force": 70.0,  "joint_radius": 0.045, "contact_area": 1.2e-4},
    "wrist_1":  {"load_force": 40.0,  "joint_radius": 0.035, "contact_area": 8.0e-5},
    "wrist_2":  {"load_force": 30.0,  "joint_radius": 0.030, "contact_area": 6.0e-5},
    "wrist_3":  {"load_force": 20.0,  "joint_radius": 0.025, "contact_area": 4.0e-5},
}


def default_joint_params(joint_names: list[str]) -> dict[str, JointParameters]:
    """
    Generate default JointParameters for a list of joint names.

    Known joint names (base, shoulder, elbow, wrist_*) get tuned defaults.
    Unknown names receive generic mid-range parameters.
    """
    params: dict[str, JointParameters] = {}
    for name in joint_names:
        overrides = _DEFAULTS.get(name, {})
        params[name] = JointParameters(joint_id=name, **overrides)
    return params


def merge_user_params(
    defaults: dict[str, JointParameters],
    user_input: list[dict],
) -> dict[str, JointParameters]:
    """
    Merge user-provided parameter overrides into the defaults.

    user_input is a list of dicts, each with at least 'joint_id'
    plus any subset of JointParameters fields to override.
    """
    for entry in user_input:
        jid = entry.get("joint_id")
        if not jid:
            continue
        if jid in defaults:
            jp = defaults[jid]
        else:
            jp = JointParameters(joint_id=jid)
        for field_name in [
            "load_force", "joint_radius", "material",
            "lubrication_coefficient", "contact_area",
            "hardness", "sliding_velocity",
        ]:
            if field_name in entry and entry[field_name] is not None:
                setattr(jp, field_name, entry[field_name])
        defaults[jid] = jp
    return defaults
