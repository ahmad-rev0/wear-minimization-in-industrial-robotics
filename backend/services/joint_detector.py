"""
Auto-detect joint positions from a robot side-profile image.

Strategy:
1. Threshold the image to isolate the robot silhouette
2. Find the largest contour (robot body)
3. Skeletonize the silhouette to find the medial axis
4. Walk the skeleton from bottom to top, placing joints at
   equal arc-length intervals
5. Fall back to bounding-box midline distribution if skeletonization
   produces too few points
"""

from __future__ import annotations

import logging
from pathlib import Path

import cv2
import numpy as np

log = logging.getLogger(__name__)


def _largest_contour(mask: np.ndarray) -> np.ndarray | None:
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    return max(contours, key=cv2.contourArea)


def _skeleton_points(mask: np.ndarray) -> np.ndarray:
    """Thin the binary mask to a 1-pixel-wide skeleton using Zhang-Suen."""
    from skimage.morphology import skeletonize

    skeleton = skeletonize(mask > 0)
    ys, xs = np.where(skeleton)
    if len(ys) == 0:
        return np.empty((0, 2), dtype=np.float64)
    # Sort bottom-to-top (highest y first) then left-to-right
    order = np.lexsort((xs, -ys))
    return np.column_stack((xs[order], ys[order])).astype(np.float64)


def _order_skeleton_by_arc(pts: np.ndarray) -> np.ndarray:
    """Reorder skeleton points into a continuous path via nearest-neighbour."""
    if len(pts) <= 2:
        return pts
    visited = np.zeros(len(pts), dtype=bool)
    order = [0]
    visited[0] = True
    for _ in range(len(pts) - 1):
        last = order[-1]
        dists = np.sum((pts - pts[last]) ** 2, axis=1)
        dists[visited] = np.inf
        nxt = int(np.argmin(dists))
        order.append(nxt)
        visited[nxt] = True
    ordered = pts[order]
    # Ensure path goes bottom-to-top (start with largest y)
    if ordered[0, 1] < ordered[-1, 1]:
        ordered = ordered[::-1]
    return ordered


def _sample_arc_length(pts: np.ndarray, n: int) -> np.ndarray:
    """Pick n equally-spaced points along a polyline defined by pts."""
    diffs = np.diff(pts, axis=0)
    seg_lengths = np.sqrt((diffs ** 2).sum(axis=1))
    cum = np.concatenate(([0.0], np.cumsum(seg_lengths)))
    total = cum[-1]
    if total < 1e-6:
        return pts[:n] if len(pts) >= n else pts

    targets = np.linspace(0, total, n)
    sampled = []
    for t in targets:
        idx = np.searchsorted(cum, t, side="right") - 1
        idx = np.clip(idx, 0, len(pts) - 2)
        frac = (t - cum[idx]) / max(seg_lengths[idx], 1e-9)
        pt = pts[idx] + frac * (pts[idx + 1] - pts[idx])
        sampled.append(pt)
    return np.array(sampled)


def _fallback_midline(contour: np.ndarray, n: int, h: int, w: int) -> np.ndarray:
    """Distribute joints evenly along the vertical midline of the bounding rect."""
    x, y, bw, bh = cv2.boundingRect(contour)
    cx = x + bw / 2
    ys = np.linspace(y + bh * 0.95, y + bh * 0.05, n)
    return np.column_stack((np.full(n, cx), ys))


def detect_joints(image_path: str | Path, joint_count: int = 6) -> list[dict]:
    """
    Detect joint positions from a robot side-profile image.

    Returns a list of ``{joint_id, nx, ny}`` with normalised coordinates
    in [0, 1] range. Origin is bottom-left: nx goes right, ny goes up.
    """
    path = Path(image_path)
    if not path.exists():
        raise FileNotFoundError(f"Image not found: {path}")

    img = cv2.imread(str(path))
    if img is None:
        raise ValueError(f"Cannot read image: {path}")

    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (7, 7), 0)

    # Adaptive threshold for silhouette
    binary = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 21, 5,
    )
    # Close small gaps
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=2)

    contour = _largest_contour(binary)
    if contour is None:
        log.warning("No contours found — falling back to uniform distribution")
        pts_px = _fallback_midline(np.array([[0, 0], [w, h]]), joint_count, h, w)
    else:
        # Create a filled mask of the largest contour
        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.drawContours(mask, [contour], -1, 255, cv2.FILLED)

        skel_pts = _skeleton_points(mask)
        if len(skel_pts) < joint_count * 2:
            log.info("Skeleton too sparse (%d pts) — using bounding-box midline", len(skel_pts))
            pts_px = _fallback_midline(contour, joint_count, h, w)
        else:
            ordered = _order_skeleton_by_arc(skel_pts)
            pts_px = _sample_arc_length(ordered, joint_count)

    # Normalise: nx ∈ [0,1] left-to-right, ny ∈ [0,1] bottom-to-top
    result = []
    for i, (px, py) in enumerate(pts_px):
        nx = float(np.clip(px / w, 0, 1))
        ny = float(np.clip(1.0 - py / h, 0, 1))  # flip Y
        result.append({"joint_id": f"joint_{i}", "nx": round(nx, 4), "ny": round(ny, 4)})

    log.info("Detected %d joints from image %s", len(result), path.name)
    return result
