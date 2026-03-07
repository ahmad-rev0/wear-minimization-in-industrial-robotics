const API_BASE = "/api";

export interface JointWear {
  joint_id: string;
  anomaly_rate: number;
  signal_energy: number;
  wear_index: number;
  wear_status: "healthy" | "moderate" | "severe";
}

export interface MaterialRecommendation {
  material_name: string;
  wear_coefficient: number;
  hardness: number;
  friction_coefficient: number;
  wear_reduction_pct: number;
}

export interface SimulationPoint {
  time: number;
  projected_wear: number;
}

export interface JointSimulation {
  joint_id: string;
  trajectory: SimulationPoint[];
}

export interface MaterialScenario {
  joint_id: string;
  material_name: string;
  trajectory: SimulationPoint[];
}

export interface AnalysisResult {
  joints: JointWear[];
  recommendations: MaterialRecommendation[];
  simulation: JointSimulation[];
  material_scenarios: MaterialScenario[];
  timeline: {
    timestamps: number[];
    magnitude: number[];
    anomaly: number[];
  };
}

export interface JointModel {
  joint_id: string;
  x: number;
  y: number;
  z: number;
  wear_index: number;
  color: string;
  wear_status: "healthy" | "moderate" | "severe";
  anomaly_rate: number;
  signal_energy: number;
}

export interface RobotModelData {
  joints: JointModel[];
}

export interface UploadResponse {
  filename: string;
  rows: number;
  columns: string[];
  message: string;
}

export async function uploadDataset(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/upload_dataset`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function runAnalysis(
  useDefault = false
): Promise<{ status: string; message: string }> {
  const res = await fetch(
    `${API_BASE}/run_analysis?use_default=${useDefault}`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getResults(): Promise<AnalysisResult> {
  const res = await fetch(`${API_BASE}/results`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getRobotModel(): Promise<RobotModelData> {
  const res = await fetch(`${API_BASE}/robot_model`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/* ── ML Diagnostics ──────────────────────────────────────── */

export interface ScoreDistribution {
  joint_id: string;
  mean: number;
  std: number;
  min: number;
  max: number;
  median: number;
  q25: number;
  q75: number;
  n_total: number;
  n_anomalies: number;
  anomaly_rate: number;
  histogram_bins: number[];
  histogram_counts: number[];
}

export interface UnsupervisedMetrics {
  silhouette_score: number | null;
  calinski_harabasz_score: number | null;
  global_anomaly_rate: number;
  n_total: number;
  n_anomalies: number;
  score_distributions: ScoreDistribution[];
  overall_distribution: ScoreDistribution | null;
}

export interface ConfusionMatrix {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number;
  recall: number;
  f1_score: number;
  accuracy: number;
  support_normal: number;
  support_anomaly: number;
  matrix: number[][];
  labels: string[];
}

export interface ROCCurve {
  fpr: number[];
  tpr: number[];
  thresholds: number[];
  auc: number;
}

export interface SupervisedMetrics {
  has_labels: boolean;
  confusion_matrix: ConfusionMatrix | null;
  roc_curve: ROCCurve | null;
  per_joint: Record<string, ConfusionMatrix> | null;
}

export interface FeatureImportanceEntry {
  feature: string;
  importance: number;
  std: number;
  rank: number;
}

export interface FeatureImportance {
  method: string;
  features: FeatureImportanceEntry[];
  top_n: number;
}

export interface DiagnosticsResult {
  model_id: string;
  model_display_name: string;
  n_features_used: number;
  feature_names: string[];
  unsupervised: UnsupervisedMetrics;
  supervised: SupervisedMetrics;
  feature_importance: FeatureImportance;
}

export async function getDiagnostics(): Promise<DiagnosticsResult> {
  const res = await fetch(`${API_BASE}/diagnostics`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
