const API_BASE = "/api";
const DIRECT_BACKEND = "";

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
  density: number;
  wear_reduction_pct: number;
  practicality_score: number;
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

  // Always upload directly to the backend to bypass the Next.js rewrite
  // proxy's 10 MB body-size limit which truncates large CSV files.
  const base = DIRECT_BACKEND || API_BASE;
  const url = base === API_BASE ? `${API_BASE}/upload_dataset` : `${base}/api/upload_dataset`;
  const res = await fetch(url, { method: "POST", body: form });

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

export async function getStatus(): Promise<{ status: string; message: string | null }> {
  const res = await fetch(`${API_BASE}/status`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function pollUntilDone(
  onStatus?: (msg: string) => void,
  intervalMs = 2000,
  maxWaitMs = 300000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const s = await getStatus();
    if (s.status === "done") return;
    if (s.status === "error") throw new Error(s.message ?? "Pipeline failed");
    onStatus?.(s.message ?? "Running...");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Pipeline timed out");
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

export interface ThresholdPoint {
  threshold: number;
  n_anomalies: number;
  anomaly_rate: number;
}

export interface ThresholdAnalysis {
  points: ThresholdPoint[];
  current_threshold: number;
  current_n_anomalies: number;
}

export interface DiagnosticsResult {
  model_id: string;
  model_display_name: string;
  n_features_used: number;
  feature_names: string[];
  unsupervised: UnsupervisedMetrics;
  supervised: SupervisedMetrics;
  feature_importance: FeatureImportance;
  threshold_analysis: ThresholdAnalysis | null;
}

export async function getDiagnostics(): Promise<DiagnosticsResult> {
  const res = await fetch(`${API_BASE}/diagnostics`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/* ── Model management ────────────────────────────────────── */

export interface AvailableModel {
  model_id: string;
  display_name: string;
  description: string;
  hyperparameters: Record<string, { type: string; default: unknown; description: string }>;
}

export async function getAvailableModels(): Promise<Record<string, AvailableModel>> {
  const res = await fetch(`${API_BASE}/available_models`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  // Backend returns { models: [...], active_model: "..." } — convert to dict
  const arr: AvailableModel[] = data.models ?? [];
  const dict: Record<string, AvailableModel> = {};
  for (const m of arr) {
    dict[m.model_id] = m;
  }
  return dict;
}

export async function setModelConfig(
  model: string,
  params: Record<string, unknown> = {},
): Promise<void> {
  const res = await fetch(`${API_BASE}/model_config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, params }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export interface ModelComparisonEntry {
  display_name: string;
  silhouette_score: number | null;
  anomaly_rate: number;
}

export async function getModelComparison(): Promise<Record<string, ModelComparisonEntry>> {
  const res = await fetch(`${API_BASE}/model_comparison`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/* ── Joint Mapping ──────────────────────────────────────── */

export interface JointPosition2D {
  joint_id: string;
  nx: number;
  ny: number;
}

export async function uploadRobotImage(file: File): Promise<{ filename: string; url: string }> {
  const form = new FormData();
  form.append("file", file);
  const base = DIRECT_BACKEND || API_BASE;
  const url = base === API_BASE ? `${API_BASE}/robot_image` : `${base}/api/robot_image`;
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getRobotImageUrl(): Promise<string | null> {
  const res = await fetch(`${API_BASE}/robot_image`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.url ?? null;
}

export async function detectJoints(jointCount?: number): Promise<JointPosition2D[]> {
  const qs = jointCount ? `?joint_count=${jointCount}` : "";
  const base = DIRECT_BACKEND || API_BASE;
  const url = base === API_BASE ? `${API_BASE}/detect_joints${qs}` : `${base}/api/detect_joints${qs}`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.joints;
}

export async function getJointLayout(): Promise<JointPosition2D[] | null> {
  const res = await fetch(`${API_BASE}/joint_layout`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.layout ?? null;
}

export async function saveJointLayout(layout: JointPosition2D[]): Promise<void> {
  const base = DIRECT_BACKEND || API_BASE;
  const url = base === API_BASE ? `${API_BASE}/joint_layout` : `${base}/api/joint_layout`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(layout),
  });
  if (!res.ok) throw new Error(await res.text());
}
