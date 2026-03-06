"""
Sliding window utilities for time-series feature extraction.

Uses NumPy stride tricks for zero-copy, vectorized windowing
that feeds directly into batch FFT / entropy / energy computations.
"""

import numpy as np


def sliding_window(data: np.ndarray, window_size: int, step_size: int = 1) -> np.ndarray:
    """
    Generate sliding windows over a 1-D array.

    Parameters
    ----------
    data : 1-D array of length N
    window_size : number of elements per window
    step_size : stride between consecutive window starts

    Returns
    -------
    2-D array of shape (n_windows, window_size) where
    n_windows = (N - window_size) // step_size + 1

    The returned array is a *view* (no copy) when step_size == 1.
    """
    data = np.asarray(data)
    if data.ndim != 1:
        raise ValueError("sliding_window expects a 1-D array")
    if window_size > len(data):
        raise ValueError(
            f"window_size ({window_size}) > data length ({len(data)})"
        )

    n_windows = (len(data) - window_size) // step_size + 1
    shape = (n_windows, window_size)
    strides = (data.strides[0] * step_size, data.strides[0])
    return np.lib.stride_tricks.as_strided(data, shape=shape, strides=strides)
