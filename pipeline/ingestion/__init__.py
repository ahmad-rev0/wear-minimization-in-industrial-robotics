"""
Dataset-agnostic ingestion layer for ROBOFIX.

Modules:
    schema_inference  — auto-detect column roles from CSV headers and data
    dataset_validator — produce a data quality report
    dataset_mapper    — map raw columns to canonical internal format
"""

from pipeline.ingestion.schema_inference import infer_schema, DatasetSchema, SensorGroup
from pipeline.ingestion.dataset_validator import validate_dataset, DataQualityReport
from pipeline.ingestion.dataset_mapper import map_dataset, CanonicalDataset

__all__ = [
    "infer_schema",
    "DatasetSchema",
    "SensorGroup",
    "validate_dataset",
    "DataQualityReport",
    "map_dataset",
    "CanonicalDataset",
]
