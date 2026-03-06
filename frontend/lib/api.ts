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
