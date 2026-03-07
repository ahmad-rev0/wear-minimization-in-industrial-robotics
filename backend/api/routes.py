"""
API route definitions for the ROBOFIX backend.

Endpoints:
    POST /upload_dataset     — upload a robot sensor CSV (auto-infers schema)
    POST /configure_schema   — manually override inferred column mappings
    GET  /dataset_info       — retrieve inferred schema + quality report
    GET  /available_features — list all features that can be generated
    POST /training_config    — select which features to use for ML training
    POST /joint_parameters   — set physical joint parameters
    GET  /joint_parameters   — retrieve current joint parameters
    GET  /available_models   — list available ML algorithms
    POST /model_config       — select ML model + hyperparameters
    GET  /model_config       — retrieve current model config
    POST /run_analysis       — trigger the full ML pipeline (async)
    GET  /status             — poll pipeline status
    GET  /results            — retrieve latest analysis results
    GET  /diagnostics        — ML diagnostics (metrics, importance, ROC)
    GET  /robot_model        — get 3D robot model joint data
"""

import logging
import shutil
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile, File, Query

from backend.models.schemas import (
    UploadResponse,
    InferredSchema,
    SensorGroupSchema,
    DataQualityReportSchema,
    ColumnStatsSchema,
    SchemaOverrideRequest,
    DatasetInfoResponse,
    FeatureMetadata,
    AvailableFeaturesResponse,
    TrainingConfigRequest,
    TrainingConfigResponse,
    JointParametersSchema,
    JointParametersRequest,
    JointParametersResponse,
    HyperparamInfo,
    ModelInfo,
    AvailableModelsResponse,
    ModelConfigRequest,
    ModelConfigResponse,
    DiagnosticsResponse,
    AnalysisResult,
    RobotModelData,
    StatusResponse,
)
from backend.services.state import get_state, UPLOAD_DIR, DEFAULT_SENSOR_CSV
from backend.services.pipeline_service import run_pipeline
from backend.services.visualization_service import build_robot_model

log = logging.getLogger(__name__)
router = APIRouter()


# ── Helpers: dataclass → Pydantic conversion ─────────────────

def _schema_to_pydantic(schema) -> InferredSchema:
    """Convert a DatasetSchema dataclass to a Pydantic InferredSchema."""
    sensor_groups = {}
    for key, sg in schema.sensor_groups.items():
        sensor_groups[key] = SensorGroupSchema(
            modality=sg.modality,
            columns=sg.columns,
            axes=sg.axes,
        )
    return InferredSchema(
        timestamp_column=schema.timestamp_column,
        joint_column=schema.joint_column,
        sensor_groups=sensor_groups,
        unmapped_columns=schema.unmapped_columns,
        inferred=schema.inferred,
        confidence=round(schema.confidence, 3),
    )


def _quality_to_pydantic(report) -> DataQualityReportSchema:
    """Convert a DataQualityReport dataclass to a Pydantic schema."""
    column_stats = [
        ColumnStatsSchema(
            column=cs.column,
            dtype=cs.dtype,
            missing_count=cs.missing_count,
            missing_pct=cs.missing_pct,
            unique_count=cs.unique_count,
            min_val=cs.min_val,
            max_val=cs.max_val,
            mean_val=cs.mean_val,
            std_val=cs.std_val,
            outlier_count=cs.outlier_count,
        )
        for cs in report.column_stats
    ]
    return DataQualityReportSchema(
        total_rows=report.total_rows,
        total_columns=report.total_columns,
        duplicate_rows=report.duplicate_rows,
        fully_null_columns=report.fully_null_columns,
        column_stats=column_stats,
        sampling_rate_hz=report.sampling_rate_hz,
        sampling_rate_std=report.sampling_rate_std,
        timestamp_gaps=report.timestamp_gaps,
        timestamp_non_monotonic=report.timestamp_non_monotonic,
        joint_names=report.joint_names,
        joint_count=report.joint_count,
        warnings=report.warnings,
        is_valid=report.is_valid,
    )


# ── POST /upload_dataset ─────────────────────────────────────

@router.post("/upload_dataset", response_model=UploadResponse)
async def upload_dataset(file: UploadFile = File(...)):
    """Accept a sensor CSV, auto-infer its schema, and validate quality."""
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are accepted")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dest = UPLOAD_DIR / file.filename
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        df = pd.read_csv(dest)
    except Exception as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {exc}")

    state = get_state()
    state.sensor_csv = dest
    state.status = "idle"
    state.results = None
    state.schema_overrides = None
    state.canonical_dataset = None
    state.model_comparison = {}

    # Run schema inference + validation
    schema_pydantic = None
    quality_pydantic = None
    try:
        from pipeline.ingestion.schema_inference import infer_schema
        from pipeline.ingestion.dataset_validator import validate_dataset
        from pipeline.ingestion.dataset_mapper import map_dataset

        inferred = infer_schema(df)
        state.inferred_schema = inferred

        quality = validate_dataset(df, inferred)
        state.quality_report = quality

        canonical = map_dataset(df, inferred)
        state.canonical_dataset = canonical

        schema_pydantic = _schema_to_pydantic(inferred)
        quality_pydantic = _quality_to_pydantic(quality)

        log.info(
            "Schema inferred: %d modalities, %d joints, confidence %.1f%%",
            inferred.n_modalities,
            quality.joint_count,
            inferred.confidence * 100,
        )
    except Exception as exc:
        log.warning("Schema inference failed (non-fatal): %s", exc)

    return UploadResponse(
        filename=file.filename,
        rows=len(df),
        columns=list(df.columns),
        message="Dataset uploaded and schema inferred. Call POST /api/run_analysis to process.",
        schema_info=schema_pydantic,
        quality_report=quality_pydantic,
    )


# ── POST /configure_schema ────────────────────────────────────

@router.post("/configure_schema", response_model=InferredSchema)
async def configure_schema(body: SchemaOverrideRequest):
    """Override the auto-inferred column mapping for the current dataset."""
    state = get_state()

    if state.inferred_schema is None:
        raise HTTPException(
            status_code=404,
            detail="No dataset uploaded yet. Upload a CSV first.",
        )

    from pipeline.ingestion.schema_inference import apply_user_overrides
    from pipeline.ingestion.dataset_validator import validate_dataset
    from pipeline.ingestion.dataset_mapper import map_dataset

    overrides = body.model_dump(exclude_none=True)
    state.schema_overrides = overrides

    updated_schema = apply_user_overrides(state.inferred_schema, overrides)
    state.inferred_schema = updated_schema

    # Re-validate and re-map with the updated schema
    if state.sensor_csv and state.sensor_csv.exists():
        df = pd.read_csv(state.sensor_csv)
        state.quality_report = validate_dataset(df, updated_schema)
        state.canonical_dataset = map_dataset(df, updated_schema)

    log.info("Schema overrides applied: %s", overrides)
    return _schema_to_pydantic(updated_schema)


# ── GET /dataset_info ────────────────────────────────────────

@router.get("/dataset_info", response_model=DatasetInfoResponse)
async def get_dataset_info():
    """Return the inferred schema and data quality report for the current dataset."""
    state = get_state()

    if state.inferred_schema is None and state.quality_report is None:
        raise HTTPException(
            status_code=404,
            detail="No dataset has been uploaded or analysed yet.",
        )

    return DatasetInfoResponse(
        filename=state.sensor_csv.name if state.sensor_csv else None,
        schema_info=_schema_to_pydantic(state.inferred_schema) if state.inferred_schema else None,
        quality_report=_quality_to_pydantic(state.quality_report) if state.quality_report else None,
    )


# ── Feature category classifier ──────────────────────────────

_CATEGORY_KEYWORDS = {
    "statistical": {"_mean", "_std", "_variance", "_skewness", "_kurtosis", "_rms", "_peak_to_peak", "_jerk", "_energy"},
    "spectral": {"_spectral_energy", "_dominant_frequency", "_spectral_entropy", "_spectral_centroid", "_band_energy", "_harmonic_ratio"},
    "vibration": {"_crest_factor", "_impulse_factor", "_clearance_factor", "_shape_factor"},
    "thermal": {"_thermal_drift", "_thermal_rate", "_thermal_acceleration"},
}


def _classify_feature(name: str) -> str:
    for category, suffixes in _CATEGORY_KEYWORDS.items():
        if any(name.endswith(s) for s in suffixes):
            return category
    return "other"


# ── GET /available_features ──────────────────────────────────

@router.get("/available_features", response_model=AvailableFeaturesResponse)
async def get_available_features():
    """
    List all features that can be generated for the current dataset.

    If features have already been computed (cached from a prior analysis),
    returns full statistics. Otherwise, computes on a small sample.
    """
    state = get_state()

    if state.canonical_dataset is None:
        raise HTTPException(
            status_code=404,
            detail="No dataset uploaded yet. Upload a CSV first.",
        )

    from pipeline.feature_engineering import (
        extract_features_from_canonical,
        discover_features,
    )
    from pipeline.ingestion.dataset_mapper import CanonicalDataset, JointData

    # Use cached features if available; otherwise compute on a sample
    if state.cached_features is not None and len(state.cached_features) > 0:
        feature_meta = discover_features(state.cached_features)
    else:
        canonical = state.canonical_dataset
        first_name, first_jd = next(iter(canonical.joints.items()))
        cap = min(500, first_jd.n_samples)
        sample_joints = {
            first_name: JointData(
                joint_name=first_name,
                time=first_jd.time[:cap],
                sensors={k: v[:cap] for k, v in first_jd.sensors.items()},
            )
        }
        sample_ds = CanonicalDataset(
            joints=sample_joints, schema=canonical.schema,
        )
        sample_features = extract_features_from_canonical(sample_ds, window_size=50)
        feature_meta = discover_features(sample_features)

    features = []
    categories: dict[str, int] = {}
    for fm in feature_meta:
        cat = _classify_feature(fm["name"])
        categories[cat] = categories.get(cat, 0) + 1
        features.append(FeatureMetadata(
            name=fm["name"],
            dtype=fm["dtype"],
            mean=fm.get("mean"),
            std=fm.get("std"),
            min=fm.get("min"),
            max=fm.get("max"),
            n_unique=fm.get("n_unique", 0),
            pct_zero=fm.get("pct_zero"),
            category=cat,
        ))

    return AvailableFeaturesResponse(
        total_features=len(features),
        features=features,
        categories=categories,
    )


# ── POST /training_config ───────────────────────────────────

@router.post("/training_config", response_model=TrainingConfigResponse)
async def set_training_config(body: TrainingConfigRequest):
    """
    Configure which features are used for ML training.

    - `selected_features`: whitelist (only these are used). Null = use all.
    - `exclude_features`: blacklist (removed from selection).
    - `min_variance_threshold`: drop features with variance below this value.

    The config is applied during the next `POST /run_analysis` call.
    """
    state = get_state()

    from pipeline.feature_engineering.feature_selector import FeatureSelectionConfig

    config = FeatureSelectionConfig(
        selected_features=body.selected_features,
        exclude_features=body.exclude_features or [],
        min_variance_threshold=body.min_variance_threshold,
    )
    state.feature_selection_config = config

    # Determine how many features are active
    total_available = 0
    active = 0
    if state.canonical_dataset is not None:
        from pipeline.feature_engineering import get_available_feature_names
        all_names = get_available_feature_names(state.canonical_dataset)
        total_available = len(all_names)

        if config.selected_features:
            active = len(set(config.selected_features) & set(all_names))
        else:
            active = total_available - len(set(config.exclude_features) & set(all_names))

    log.info(
        "Training config updated: %d/%d features active, variance_threshold=%.4f",
        active, total_available, config.min_variance_threshold,
    )

    return TrainingConfigResponse(
        active_features=active,
        total_available=total_available,
        selected_features=config.selected_features,
        excluded_features=config.exclude_features,
        min_variance_threshold=config.min_variance_threshold,
    )


# ── POST /joint_parameters ───────────────────────────────────

@router.post("/joint_parameters", response_model=JointParametersResponse)
async def set_joint_parameters(body: JointParametersRequest):
    """
    Provide physical joint parameters for the physics-based wear model.

    Each joint entry can specify: load_force, joint_radius, material,
    lubrication_coefficient, contact_area, hardness, sliding_velocity.
    Omitted fields keep their defaults.
    """
    state = get_state()

    from pipeline.physics.joint_parameters import (
        default_joint_params,
        merge_user_params,
    )

    # Determine joint names from the canonical dataset or user input
    joint_names = [j.joint_id for j in body.joints]
    if state.canonical_dataset is not None:
        joint_names = list(set(joint_names) | set(state.canonical_dataset.joint_names))

    defaults = default_joint_params(joint_names)
    user_dicts = [j.model_dump(exclude_none=True) for j in body.joints]
    merged = merge_user_params(defaults, user_dicts)
    state.joint_params = merged

    response_joints = [
        JointParametersSchema(**jp.to_dict()) for jp in merged.values()
    ]

    log.info("Joint parameters updated for %d joints", len(merged))
    return JointParametersResponse(
        joints=response_joints,
        source="user_override",
    )


# ── GET /joint_parameters ────────────────────────────────────

@router.get("/joint_parameters", response_model=JointParametersResponse)
async def get_joint_parameters():
    """Return the current joint parameters (defaults or user-overridden)."""
    state = get_state()

    from pipeline.physics.joint_parameters import default_joint_params

    if state.joint_params is not None:
        params = state.joint_params
        source = "user_override"
    elif state.canonical_dataset is not None:
        params = default_joint_params(state.canonical_dataset.joint_names)
        source = "default"
    else:
        raise HTTPException(
            status_code=404,
            detail="No dataset uploaded yet. Upload a CSV first.",
        )

    response_joints = [
        JointParametersSchema(**jp.to_dict()) for jp in params.values()
    ]
    return JointParametersResponse(joints=response_joints, source=source)


# ── GET /available_models ────────────────────────────────────

@router.get("/available_models", response_model=AvailableModelsResponse)
async def get_available_models():
    """List all available anomaly detection algorithms and their hyperparameters."""
    from pipeline.modeling.model_registry import AVAILABLE_MODELS, get_default_config

    state = get_state()
    active = state.model_config.model_id if state.model_config else get_default_config().model_id

    models = []
    for spec in AVAILABLE_MODELS.values():
        hps = [
            HyperparamInfo(
                name=hp.name,
                dtype=hp.dtype,
                default=hp.default,
                min_val=hp.min_val,
                max_val=hp.max_val,
                description=hp.description,
            )
            for hp in spec.hyperparams
        ]
        models.append(ModelInfo(
            model_id=spec.model_id,
            display_name=spec.display_name,
            description=spec.description,
            hyperparams=hps,
        ))

    return AvailableModelsResponse(models=models, active_model=active)


# ── POST /model_config ──────────────────────────────────────

@router.post("/model_config", response_model=ModelConfigResponse)
async def set_model_config(body: ModelConfigRequest):
    """
    Select which ML algorithm and hyperparameters to use for anomaly detection.

    The config is applied during the next `POST /run_analysis` call.
    """
    from pipeline.modeling.model_registry import (
        ModelConfig,
        AVAILABLE_MODELS,
        validate_model_config,
    )

    # Merge user params with defaults
    spec = AVAILABLE_MODELS.get(body.model)
    if spec is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model: '{body.model}'. Available: {list(AVAILABLE_MODELS.keys())}",
        )

    merged_params = spec.default_params()
    if body.params:
        merged_params.update(body.params)

    config = ModelConfig(
        model_id=body.model,
        params=merged_params,
        random_state=body.random_state,
    )

    valid, msg = validate_model_config(config)
    if not valid:
        raise HTTPException(status_code=400, detail=msg)

    state = get_state()
    state.model_config = config

    log.info("Model config updated: %s with params %s", config.model_id, config.params)

    return ModelConfigResponse(
        model_id=config.model_id,
        display_name=spec.display_name,
        params=config.params,
        random_state=config.random_state,
    )


# ── GET /model_config ───────────────────────────────────────

@router.get("/model_config", response_model=ModelConfigResponse)
async def get_model_config():
    """Return the currently active model configuration."""
    from pipeline.modeling.model_registry import AVAILABLE_MODELS, get_default_config

    state = get_state()
    config = state.model_config or get_default_config()
    spec = AVAILABLE_MODELS[config.model_id]

    return ModelConfigResponse(
        model_id=config.model_id,
        display_name=spec.display_name,
        params=config.params,
        random_state=config.random_state,
    )


# ── POST /run_analysis ───────────────────────────────────────

@router.post("/run_analysis", response_model=StatusResponse)
async def run_analysis(
    use_default: bool = Query(
        False, description="Use the bundled example dataset instead of an upload"
    ),
):
    """
    Kick off the ML pipeline in a background thread.

    Returns immediately with status="running". The frontend should poll
    GET /status until it transitions to "done" or "error".
    """
    import threading

    state = get_state()

    if state.status == "running":
        return StatusResponse(status="running", message="Analysis already in progress.")

    sensor_csv = state.sensor_csv
    if use_default or sensor_csv is None:
        sensor_csv = DEFAULT_SENSOR_CSV
        # Reset cached ingestion state so the demo dataset is re-ingested
        state.inferred_schema = None
        state.quality_report = None
        state.canonical_dataset = None
        state.cached_features = None
        state.diagnostics = None
        state.sensor_csv = None
        state.model_comparison = {}

    if not sensor_csv.exists():
        raise HTTPException(status_code=404, detail="No dataset found. Upload one first.")

    state.status = "running"
    state.error = None

    def _run():
        try:
            results = run_pipeline(sensor_csv, state.materials_csv)
            state.results = results
            state.status = "done"
            log.info("Pipeline completed successfully")
        except MemoryError:
            log.exception("Pipeline ran out of memory")
            state.status = "error"
            state.error = (
                "Out of memory. Try reducing the dataset size via the "
                "downsampling setting or uploading a smaller file."
            )
        except Exception as exc:
            log.exception("Pipeline failed")
            state.status = "error"
            state.error = str(exc)

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return StatusResponse(status="running", message="Pipeline started. Poll GET /status for progress.")


# ── GET /status ──────────────────────────────────────────────

@router.get("/status", response_model=StatusResponse)
async def get_status():
    """Poll pipeline status: idle | running | done | error."""
    state = get_state()
    msg = None
    if state.status == "error":
        msg = state.error
    elif state.status == "done":
        msg = "Analysis complete."
    elif state.status == "running":
        msg = state.progress or "Pipeline is running..."
    return StatusResponse(status=state.status, message=msg)


# ── GET /results ─────────────────────────────────────────────

@router.get("/results", response_model=AnalysisResult)
async def get_results():
    """Return the latest pipeline analysis results."""
    state = get_state()

    if state.status == "idle":
        raise HTTPException(status_code=404, detail="No analysis has been run yet.")
    if state.status == "running":
        raise HTTPException(status_code=202, detail="Analysis is still running.")
    if state.status == "error":
        raise HTTPException(status_code=500, detail=f"Last run failed: {state.error}")

    return state.results


# ── GET /diagnostics ─────────────────────────────────────────

@router.get("/diagnostics", response_model=DiagnosticsResponse)
async def get_diagnostics():
    """
    Return ML diagnostics from the last pipeline run.

    Includes:
        - Unsupervised metrics (silhouette score, anomaly score distributions)
        - Supervised metrics (confusion matrix, ROC, precision/recall — if labels exist)
        - Feature importance (top contributing features)
    """
    state = get_state()

    if state.diagnostics is None:
        if state.status == "idle":
            raise HTTPException(status_code=404, detail="No analysis has been run yet.")
        if state.status == "running":
            raise HTTPException(status_code=202, detail="Analysis is still running.")
        raise HTTPException(status_code=404, detail="Diagnostics not available.")

    return state.diagnostics.to_dict()


# ── GET /robot_model ─────────────────────────────────────────

@router.get("/robot_model", response_model=RobotModelData)
async def get_robot_model():
    """Return 3D joint positions and wear data for the viewer."""
    state = get_state()

    if state.results is None:
        raise HTTPException(
            status_code=404,
            detail="Run an analysis first (POST /api/run_analysis).",
        )

    return build_robot_model(state.results)


# ── GET /pipeline_config ─────────────────────────────────────

@router.get("/pipeline_config")
async def get_pipeline_config():
    """Return current pipeline configuration."""
    state = get_state()
    return {
        "max_rows": state.max_rows,
        "contamination": state.contamination,
        "deselected_features": state.deselected_features,
    }


# ── POST /pipeline_config ────────────────────────────────────

@router.post("/pipeline_config")
async def set_pipeline_config(body: dict):
    """Update pipeline configuration."""
    state = get_state()
    if "max_rows" in body:
        state.max_rows = max(500, min(100000, int(body["max_rows"])))
    if "contamination" in body:
        state.contamination = max(0.01, min(0.50, float(body["contamination"])))
    if "deselected_features" in body:
        state.deselected_features = list(body["deselected_features"])
    # Clear cached data so re-run uses new config
    state.canonical_dataset = None
    state.cached_features = None
    state.diagnostics = None
    state.model_comparison = {}
    log.info(
        "Pipeline config updated: max_rows=%d, contamination=%.2f, deselected=%d features",
        state.max_rows, state.contamination, len(state.deselected_features),
    )
    return {
        "max_rows": state.max_rows,
        "contamination": state.contamination,
        "deselected_features": state.deselected_features,
    }


# ── GET /model_comparison ────────────────────────────────────

@router.get("/model_comparison")
async def get_model_comparison():
    """Return silhouette scores for all models that have been run."""
    state = get_state()
    return state.model_comparison


# ── GET /health ─────────────────────────────────────────────

@router.get("/health")
async def api_health():
    """Health check reachable under /api/health (mirrors root /health)."""
    state = get_state()
    return {
        "status": "ok",
        "service": "robofix",
        "pipeline_status": state.status,
    }
