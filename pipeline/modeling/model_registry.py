"""
Model registry — defines available anomaly detection algorithms and
their configurable hyperparameters.

Each model entry specifies:
    - A human-readable name
    - The set of tuneable hyperparameters with types and defaults
    - Whether the model natively produces anomaly scores
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class HyperparamSpec:
    """Specification for a single hyperparameter."""
    name: str
    dtype: str          # "float" | "int" | "str" | "bool"
    default: Any
    min_val: Any = None
    max_val: Any = None
    description: str = ""


@dataclass
class ModelSpec:
    """Registry entry for an anomaly detection algorithm."""
    model_id: str
    display_name: str
    description: str
    hyperparams: list[HyperparamSpec] = field(default_factory=list)
    supports_scores: bool = True

    def default_params(self) -> dict[str, Any]:
        return {hp.name: hp.default for hp in self.hyperparams}


@dataclass
class ModelConfig:
    """User-selected model and its hyperparameters."""
    model_id: str = "isolation_forest"
    params: dict[str, Any] = field(default_factory=dict)
    random_state: int = 42

    def to_dict(self) -> dict:
        return {
            "model_id": self.model_id,
            "params": self.params,
            "random_state": self.random_state,
        }


# ── Model definitions ────────────────────────────────────────

AVAILABLE_MODELS: dict[str, ModelSpec] = {
    "isolation_forest": ModelSpec(
        model_id="isolation_forest",
        display_name="Isolation Forest",
        description=(
            "Tree-based ensemble that isolates anomalies by random partitioning. "
            "Fast, scalable, and effective for high-dimensional data."
        ),
        hyperparams=[
            HyperparamSpec("contamination", "float", 0.05, 0.001, 0.5,
                           "Expected fraction of anomalies in the dataset"),
            HyperparamSpec("n_estimators", "int", 100, 10, 500,
                           "Number of trees in the ensemble"),
            HyperparamSpec("max_samples", "str", "auto", description="Samples per tree ('auto' or int)"),
        ],
        supports_scores=True,
    ),
    "local_outlier_factor": ModelSpec(
        model_id="local_outlier_factor",
        display_name="Local Outlier Factor",
        description=(
            "Density-based method that detects anomalies by comparing local "
            "density of a point to its neighbours. Good at finding local anomalies."
        ),
        hyperparams=[
            HyperparamSpec("contamination", "float", 0.05, 0.001, 0.5,
                           "Expected fraction of anomalies"),
            HyperparamSpec("n_neighbors", "int", 20, 2, 100,
                           "Number of neighbours for density estimation"),
            HyperparamSpec("metric", "str", "minkowski",
                           description="Distance metric (minkowski, euclidean, manhattan, etc.)"),
        ],
        supports_scores=True,
    ),
    "one_class_svm": ModelSpec(
        model_id="one_class_svm",
        display_name="One-Class SVM",
        description=(
            "Support vector method that learns a boundary around normal data. "
            "Effective for well-separated anomaly clusters but slower on large datasets."
        ),
        hyperparams=[
            HyperparamSpec("kernel", "str", "rbf",
                           description="Kernel function (rbf, linear, poly, sigmoid)"),
            HyperparamSpec("nu", "float", 0.05, 0.001, 0.5,
                           "Upper bound on fraction of outliers / lower bound on support vectors"),
            HyperparamSpec("gamma", "str", "scale",
                           description="Kernel coefficient ('scale', 'auto', or float)"),
        ],
        supports_scores=True,
    ),
    "autoencoder": ModelSpec(
        model_id="autoencoder",
        display_name="Autoencoder (Neural Network)",
        description=(
            "Neural network trained to reconstruct normal data. Anomalies have "
            "high reconstruction error. Best for complex, non-linear patterns."
        ),
        hyperparams=[
            HyperparamSpec("encoding_dim_ratio", "float", 0.5, 0.1, 0.9,
                           "Bottleneck size as fraction of input dimensions"),
            HyperparamSpec("epochs", "int", 50, 10, 200,
                           "Training epochs"),
            HyperparamSpec("contamination", "float", 0.05, 0.001, 0.5,
                           "Percentile threshold for anomaly classification"),
            HyperparamSpec("learning_rate", "float", 0.001, 0.0001, 0.1,
                           "Optimizer learning rate"),
        ],
        supports_scores=True,
    ),
}


def get_default_config() -> ModelConfig:
    return ModelConfig(
        model_id="isolation_forest",
        params=AVAILABLE_MODELS["isolation_forest"].default_params(),
    )


def validate_model_config(config: ModelConfig) -> tuple[bool, str]:
    """Validate that a model config references a known model with valid params."""
    if config.model_id not in AVAILABLE_MODELS:
        return False, f"Unknown model: '{config.model_id}'. Available: {list(AVAILABLE_MODELS.keys())}"

    spec = AVAILABLE_MODELS[config.model_id]
    valid_names = {hp.name for hp in spec.hyperparams}
    unknown = set(config.params.keys()) - valid_names
    if unknown:
        return False, f"Unknown hyperparameters for {config.model_id}: {unknown}"

    for hp in spec.hyperparams:
        if hp.name in config.params:
            val = config.params[hp.name]
            if hp.min_val is not None and isinstance(val, (int, float)) and val < hp.min_val:
                return False, f"{hp.name} = {val} is below minimum {hp.min_val}"
            if hp.max_val is not None and isinstance(val, (int, float)) and val > hp.max_val:
                return False, f"{hp.name} = {val} is above maximum {hp.max_val}"

    return True, "OK"
