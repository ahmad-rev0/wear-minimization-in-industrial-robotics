"""
Dataset quality validation for ROBOFIX.

Inspects a raw DataFrame and produces a structured `DataQualityReport`
covering missing data, duplicates, sampling-rate consistency, and
out-of-range values. The report drives UI warnings and decides whether
the dataset can be safely processed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd

from pipeline.ingestion.schema_inference import DatasetSchema


@dataclass
class ColumnStats:
    """Per-column statistical summary for the quality report."""

    column: str
    dtype: str
    missing_count: int
    missing_pct: float
    unique_count: int
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    mean_val: Optional[float] = None
    std_val: Optional[float] = None
    q1: Optional[float] = None
    q3: Optional[float] = None
    outlier_count: int = 0

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if v is not None}


@dataclass
class DataQualityReport:
    """Complete data quality assessment for a dataset."""

    total_rows: int = 0
    total_columns: int = 0
    duplicate_rows: int = 0
    fully_null_columns: list[str] = field(default_factory=list)
    column_stats: list[ColumnStats] = field(default_factory=list)
    sampling_rate_hz: Optional[float] = None
    sampling_rate_std: Optional[float] = None
    timestamp_gaps: int = 0
    timestamp_non_monotonic: bool = False
    joint_names: list[str] = field(default_factory=list)
    joint_count: int = 0
    warnings: list[str] = field(default_factory=list)
    is_valid: bool = True

    def to_dict(self) -> dict:
        return {
            "total_rows": self.total_rows,
            "total_columns": self.total_columns,
            "duplicate_rows": self.duplicate_rows,
            "fully_null_columns": self.fully_null_columns,
            "column_stats": [cs.to_dict() for cs in self.column_stats],
            "sampling_rate_hz": self.sampling_rate_hz,
            "sampling_rate_std": self.sampling_rate_std,
            "timestamp_gaps": self.timestamp_gaps,
            "timestamp_non_monotonic": self.timestamp_non_monotonic,
            "joint_names": self.joint_names,
            "joint_count": self.joint_count,
            "warnings": self.warnings,
            "is_valid": self.is_valid,
        }


# ── IQR-based outlier detection ──────────────────────────────

_IQR_FACTOR = 3.0  # generous for sensor data


def _count_outliers(series: pd.Series) -> int:
    clean = series.dropna()
    if len(clean) < 20:
        return 0
    q1 = clean.quantile(0.25)
    q3 = clean.quantile(0.75)
    iqr = q3 - q1
    if iqr < 1e-12:
        return 0
    lower = q1 - _IQR_FACTOR * iqr
    upper = q3 + _IQR_FACTOR * iqr
    return int(((clean < lower) | (clean > upper)).sum())


# ── Core validator ───────────────────────────────────────────

def validate_dataset(
    df: pd.DataFrame,
    schema: DatasetSchema,
    *,
    max_missing_pct: float = 50.0,
    max_duplicate_pct: float = 30.0,
) -> DataQualityReport:
    """
    Run all quality checks on a dataset given its inferred schema.

    Parameters
    ----------
    df : raw DataFrame
    schema : inferred or user-provided DatasetSchema
    max_missing_pct : threshold above which a column triggers a warning
    max_duplicate_pct : threshold for duplicate-row warning

    Returns
    -------
    DataQualityReport
    """
    report = DataQualityReport(
        total_rows=len(df),
        total_columns=len(df.columns),
    )

    if len(df) == 0:
        report.is_valid = False
        report.warnings.append("Dataset is empty (0 rows).")
        return report

    # ── Duplicates ──
    report.duplicate_rows = int(df.duplicated().sum())
    dup_pct = (report.duplicate_rows / len(df)) * 100
    if dup_pct > max_duplicate_pct:
        report.warnings.append(
            f"High duplicate rate: {dup_pct:.1f}% of rows are duplicates."
        )

    # ── Per-column stats ──
    for col in df.columns:
        series = df[col]
        missing = int(series.isna().sum())
        missing_pct = (missing / len(df)) * 100

        cs = ColumnStats(
            column=col,
            dtype=str(series.dtype),
            missing_count=missing,
            missing_pct=round(missing_pct, 2),
            unique_count=int(series.nunique()),
        )

        if np.issubdtype(series.dtype, np.number):
            clean = series.dropna()
            if len(clean) > 0:
                cs.min_val = float(clean.min())
                cs.max_val = float(clean.max())
                cs.mean_val = float(clean.mean())
                cs.std_val = float(clean.std())
                cs.q1 = float(clean.quantile(0.25))
                cs.q3 = float(clean.quantile(0.75))
                cs.outlier_count = _count_outliers(clean)

        report.column_stats.append(cs)

        if missing == len(df):
            report.fully_null_columns.append(col)
        elif missing_pct > max_missing_pct:
            report.warnings.append(
                f"Column '{col}' has {missing_pct:.1f}% missing values."
            )

    # ── Timestamp analysis ──
    if schema.timestamp_column and schema.timestamp_column in df.columns:
        ts = df[schema.timestamp_column].dropna()
        if np.issubdtype(ts.dtype, np.number) and len(ts) > 1:
            diffs = ts.diff().dropna()
            if len(diffs) > 0:
                # Monotonicity
                non_mono = int((diffs < 0).sum())
                if non_mono > 0:
                    report.timestamp_non_monotonic = True
                    report.warnings.append(
                        f"Timestamps are not monotonically increasing "
                        f"({non_mono} reversals)."
                    )

                # Sampling rate (normalise epoch units to seconds)
                median_dt = float(diffs.median())
                if median_dt > 0:
                    ref = abs(float(ts.iloc[0]))
                    if ref > 1e17:
                        divisor = 1e9
                    elif ref > 1e14:
                        divisor = 1e6
                    elif ref > 1e11:
                        divisor = 1e3
                    else:
                        divisor = 1.0
                    dt_sec = median_dt / divisor
                    report.sampling_rate_hz = round(1.0 / dt_sec, 2)
                    report.sampling_rate_std = round(float(diffs.std()), 6)

                # Gaps (steps > 3x median)
                if median_dt > 0:
                    gap_threshold = median_dt * 3
                    report.timestamp_gaps = int((diffs > gap_threshold).sum())
                    if report.timestamp_gaps > 0:
                        report.warnings.append(
                            f"Found {report.timestamp_gaps} timestamp gap(s) "
                            f"(>{gap_threshold:.4f}s between samples)."
                        )

    # ── Joint/sensor identifier analysis ──
    if schema.joint_column and schema.joint_column in df.columns:
        joints = df[schema.joint_column].dropna().unique()
        report.joint_names = sorted([str(j) for j in joints])
        report.joint_count = len(report.joint_names)
    else:
        report.joint_count = 1
        report.joint_names = ["default"]

    # ── Validity verdict ──
    if report.fully_null_columns:
        report.warnings.append(
            f"Entirely null columns: {report.fully_null_columns}"
        )
    if len(report.warnings) > 5:
        report.is_valid = False
    if len(df) < 10:
        report.is_valid = False
        report.warnings.append("Dataset has fewer than 10 rows.")

    return report
