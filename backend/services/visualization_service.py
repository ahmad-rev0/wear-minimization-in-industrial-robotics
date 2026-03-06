"""
Prepares 3D visualization data for the frontend robot viewer.

Maps wear_index values to joint positions and colours.
Includes per-joint metadata (wear_status, anomaly_rate, signal_energy)
so the 3D viewer can render richer tooltips and overlays.
"""


# Default 6-DOF arm layout — positions along a vertical articulated arm
_DEFAULT_JOINT_POSITIONS: dict[str, tuple[float, float, float]] = {
    "base":     (0.0,  0.0,  0.0),
    "shoulder": (0.0,  0.5,  0.0),
    "elbow":    (0.0,  1.0,  0.3),
    "wrist_1":  (0.0,  1.5,  0.5),
    "wrist_2":  (0.0,  1.8,  0.6),
    "wrist_3":  (0.0,  2.0,  0.65),
}

# Links define which joints are connected by arm segments
_LINK_ORDER = ["base", "shoulder", "elbow", "wrist_1", "wrist_2", "wrist_3"]


def _wear_to_hex(wear_index: float) -> str:
    """
    Map wear_index in [0,1] to a hex colour on the green-yellow-red scale.

    0.0 -> #22c55e (green)
    0.5 -> #eab308 (yellow)
    1.0 -> #ef4444 (red)
    """
    w = max(0.0, min(1.0, wear_index))

    if w < 0.5:
        t = w / 0.5
        r = int(0x22 + (0xEA - 0x22) * t)
        g = int(0xC5 + (0xB3 - 0xC5) * t)
        b = int(0x5E + (0x08 - 0x5E) * t)
    else:
        t = (w - 0.5) / 0.5
        r = int(0xEA + (0xEF - 0xEA) * t)
        g = int(0xB3 + (0x44 - 0xB3) * t)
        b = int(0x08 + (0x44 - 0x08) * t)

    return f"#{r:02x}{g:02x}{b:02x}"


def build_robot_model(analysis_results: dict) -> dict:
    """
    Convert pipeline results into 3D-ready joint data.

    Each joint includes: position, wear metrics, colour, and status.
    """
    joint_lookup = {j["joint_id"]: j for j in analysis_results.get("joints", [])}

    joints_out = []

    ordered_ids = [jid for jid in _LINK_ORDER if jid in joint_lookup]
    extra_ids = [jid for jid in joint_lookup if jid not in ordered_ids]
    all_ids = ordered_ids + extra_ids

    for i, jid in enumerate(all_ids):
        jw = joint_lookup[jid]
        pos = _DEFAULT_JOINT_POSITIONS.get(jid)
        if pos is None:
            pos = (0.0, 0.4 * i, 0.0)

        wear = jw.get("wear_index", 0.0)
        joints_out.append({
            "joint_id": jid,
            "x": pos[0],
            "y": pos[1],
            "z": pos[2],
            "wear_index": wear,
            "color": _wear_to_hex(wear),
            "wear_status": jw.get("wear_status", "healthy"),
            "anomaly_rate": jw.get("anomaly_rate", 0.0),
            "signal_energy": jw.get("signal_energy", 0.0),
        })

    return {"joints": joints_out}
