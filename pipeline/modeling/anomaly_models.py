"""
Unified anomaly detection interface.

Each detector wraps a specific sklearn (or custom) model behind a common
`AnomalyDetector` protocol:
    .fit_predict(X) -> (labels, scores)

The factory function `create_detector()` instantiates the right class
based on a ModelConfig.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any

import numpy as np

log = logging.getLogger(__name__)


class AnomalyDetector(ABC):
    """Common interface for all anomaly detection backends."""

    @abstractmethod
    def fit_predict(self, X: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """
        Fit on X and return (labels, scores).

        labels:  1 = normal, -1 = anomaly  (sklearn convention)
        scores:  continuous anomaly score (lower = more anomalous)
        """
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        ...


# ── Isolation Forest ─────────────────────────────────────────

class IsolationForestDetector(AnomalyDetector):
    def __init__(self, params: dict[str, Any], random_state: int = 42):
        from sklearn.ensemble import IsolationForest

        self._params = params
        max_samples = params.get("max_samples", "auto")
        if isinstance(max_samples, str) and max_samples != "auto":
            try:
                max_samples = int(max_samples)
            except ValueError:
                max_samples = "auto"

        self._model = IsolationForest(
            contamination=params.get("contamination", 0.05),
            n_estimators=params.get("n_estimators", 100),
            max_samples=max_samples,
            random_state=random_state,
            n_jobs=-1,
        )

    @property
    def name(self) -> str:
        return "IsolationForest"

    def fit_predict(self, X: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        labels = self._model.fit_predict(X)
        scores = self._model.decision_function(X)
        return labels, scores


# ── Local Outlier Factor ─────────────────────────────────────

class LOFDetector(AnomalyDetector):
    def __init__(self, params: dict[str, Any], random_state: int = 42):
        from sklearn.neighbors import LocalOutlierFactor

        self._model = LocalOutlierFactor(
            contamination=params.get("contamination", 0.05),
            n_neighbors=params.get("n_neighbors", 20),
            metric=params.get("metric", "minkowski"),
            n_jobs=-1,
            novelty=False,
        )

    @property
    def name(self) -> str:
        return "LocalOutlierFactor"

    def fit_predict(self, X: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        labels = self._model.fit_predict(X)
        scores = self._model.negative_outlier_factor_
        return labels, scores


# ── One-Class SVM ────────────────────────────────────────────

class OneClassSVMDetector(AnomalyDetector):
    def __init__(self, params: dict[str, Any], random_state: int = 42):
        from sklearn.svm import OneClassSVM

        gamma = params.get("gamma", "scale")
        if isinstance(gamma, str) and gamma not in ("scale", "auto"):
            try:
                gamma = float(gamma)
            except ValueError:
                gamma = "scale"

        self._model = OneClassSVM(
            kernel=params.get("kernel", "rbf"),
            nu=params.get("nu", 0.05),
            gamma=gamma,
        )

    @property
    def name(self) -> str:
        return "OneClassSVM"

    def fit_predict(self, X: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        labels = self._model.fit_predict(X)
        scores = self._model.decision_function(X)
        return labels, scores


# ── Autoencoder ──────────────────────────────────────────────

class AutoencoderDetector(AnomalyDetector):
    """
    Simple dense autoencoder for reconstruction-error-based anomaly detection.

    Uses PyTorch if available, otherwise falls back to a sklearn MLPRegressor
    approximation.
    """

    def __init__(self, params: dict[str, Any], random_state: int = 42):
        self._encoding_ratio = params.get("encoding_dim_ratio", 0.5)
        self._epochs = params.get("epochs", 50)
        self._contamination = params.get("contamination", 0.05)
        self._lr = params.get("learning_rate", 0.001)
        self._random_state = random_state

    @property
    def name(self) -> str:
        return "Autoencoder"

    def fit_predict(self, X: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        n_samples, n_features = X.shape
        encoding_dim = max(1, int(n_features * self._encoding_ratio))

        try:
            return self._fit_predict_torch(X, n_features, encoding_dim)
        except ImportError:
            log.info("PyTorch not available, using MLPRegressor fallback for autoencoder")
            return self._fit_predict_sklearn(X, n_features, encoding_dim)

    def _fit_predict_torch(
        self, X: np.ndarray, n_features: int, encoding_dim: int,
    ) -> tuple[np.ndarray, np.ndarray]:
        import torch
        import torch.nn as nn
        from torch.utils.data import DataLoader, TensorDataset

        torch.manual_seed(self._random_state)

        class AE(nn.Module):
            def __init__(self, inp, enc):
                super().__init__()
                mid = (inp + enc) // 2
                self.encoder = nn.Sequential(
                    nn.Linear(inp, mid), nn.ReLU(),
                    nn.Linear(mid, enc), nn.ReLU(),
                )
                self.decoder = nn.Sequential(
                    nn.Linear(enc, mid), nn.ReLU(),
                    nn.Linear(mid, inp),
                )

            def forward(self, x):
                return self.decoder(self.encoder(x))

        device = torch.device("cpu")
        model = AE(n_features, encoding_dim).to(device)
        optimizer = torch.optim.Adam(model.parameters(), lr=self._lr)
        criterion = nn.MSELoss(reduction="none")

        tensor_x = torch.FloatTensor(X).to(device)
        dataset = TensorDataset(tensor_x, tensor_x)
        loader = DataLoader(dataset, batch_size=min(256, len(X)), shuffle=True)

        model.train()
        for _ in range(self._epochs):
            for batch_x, _ in loader:
                recon = model(batch_x)
                loss = criterion(recon, batch_x).mean()
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

        model.eval()
        with torch.no_grad():
            recon = model(tensor_x)
            errors = criterion(recon, tensor_x).mean(dim=1).cpu().numpy()

        return self._errors_to_labels(errors)

    def _fit_predict_sklearn(
        self, X: np.ndarray, n_features: int, encoding_dim: int,
    ) -> tuple[np.ndarray, np.ndarray]:
        from sklearn.neural_network import MLPRegressor

        mid = (n_features + encoding_dim) // 2
        hidden = (mid, encoding_dim, mid)

        model = MLPRegressor(
            hidden_layer_sizes=hidden,
            activation="relu",
            max_iter=self._epochs,
            learning_rate_init=self._lr,
            random_state=self._random_state,
            early_stopping=True,
            validation_fraction=0.1,
        )
        model.fit(X, X)
        recon = model.predict(X)
        errors = np.mean((X - recon) ** 2, axis=1)
        return self._errors_to_labels(errors)

    def _errors_to_labels(
        self, errors: np.ndarray,
    ) -> tuple[np.ndarray, np.ndarray]:
        threshold = np.percentile(errors, 100 * (1 - self._contamination))
        labels = np.where(errors > threshold, -1, 1)
        scores = -errors  # lower score = more anomalous (convention)
        return labels, scores


# ── Factory ──────────────────────────────────────────────────

_DETECTOR_MAP: dict[str, type[AnomalyDetector]] = {
    "isolation_forest": IsolationForestDetector,
    "local_outlier_factor": LOFDetector,
    "one_class_svm": OneClassSVMDetector,
    "autoencoder": AutoencoderDetector,
}


def create_detector(model_id: str, params: dict[str, Any], random_state: int = 42) -> AnomalyDetector:
    """Instantiate an anomaly detector by model_id."""
    cls = _DETECTOR_MAP.get(model_id)
    if cls is None:
        raise ValueError(f"Unknown model: '{model_id}'. Available: {list(_DETECTOR_MAP.keys())}")
    return cls(params=params, random_state=random_state)
