"""
Physics-based wear modelling for ROBOFIX.

Modules:
    joint_parameters    — mechanical parameter definitions + defaults
    wear_physics_model  — Archard's wear law with sliding distance estimation
"""

from pipeline.physics.joint_parameters import JointParameters, default_joint_params
from pipeline.physics.wear_physics_model import (
    compute_physics_wear,
    estimate_sliding_distance,
)

__all__ = [
    "JointParameters",
    "default_joint_params",
    "compute_physics_wear",
    "estimate_sliding_distance",
]
