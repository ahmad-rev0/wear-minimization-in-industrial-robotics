"""
ML model registry and anomaly detection backends for ROBOFIX.

Modules:
    model_registry  — registry of available algorithms + configuration
    anomaly_models  — unified interface for all anomaly detection models
"""

from pipeline.modeling.model_registry import (
    ModelConfig,
    AVAILABLE_MODELS,
    get_default_config,
    validate_model_config,
)
from pipeline.modeling.anomaly_models import create_detector, AnomalyDetector

__all__ = [
    "ModelConfig",
    "AVAILABLE_MODELS",
    "get_default_config",
    "validate_model_config",
    "create_detector",
    "AnomalyDetector",
]
