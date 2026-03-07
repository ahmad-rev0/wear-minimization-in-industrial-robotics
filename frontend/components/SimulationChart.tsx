"use client";

import { useState, useMemo } from "react";
import { TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import type { JointSimulation, MaterialScenario } from "@/lib/api";

const JOINT_COLORS: Record<string, string> = {
  base: "#84cc16",
  shoulder: "#a3e635",
  elbow: "#65a30d",
  wrist_1: "#bef264",
  wrist_2: "#4d7c0f",
  wrist_3: "#d9f99d",
};

const MATERIAL_COLORS = ["#10b981", "#06b6d4", "#a3e635"];

interface Props {
  simulation: JointSimulation[];
  materialScenarios: MaterialScenario[];
  selectedJoint: string | null;
}

export function SimulationChart({
  simulation,
  materialScenarios,
  selectedJoint,
}: Props) {
  const [mode, setMode] = useState<"joints" | "materials">("joints");
  const [yMax, setYMax] = useState(100);
  const [xZoom, setXZoom] = useState(100);

  const jointData = useMemo(() => {
    if (!simulation.length) return [];
    const timeSteps = simulation[0].trajectory.map((p) => p.time);
    return timeSteps.map((t, i) => {
      const row: Record<string, number> = { time: t };
      for (const s of simulation) {
        row[s.joint_id] = s.trajectory[i]?.projected_wear ?? 0;
      }
      return row;
    });
  }, [simulation]);

  const materialData = useMemo(() => {
    const jid = selectedJoint || simulation[0]?.joint_id;
    if (!jid) return { data: [], materials: [] };

    const scenarios = materialScenarios.filter((ms) => ms.joint_id === jid);
    if (!scenarios.length) return { data: [], materials: [] };

    const materials = [...new Set(scenarios.map((s) => s.material_name))];
    const timeSteps = scenarios[0].trajectory.map((p) => p.time);
    const data = timeSteps.map((t, i) => {
      const row: Record<string, number> = { time: t };
      for (const s of scenarios) {
        row[s.material_name] = s.trajectory[i]?.projected_wear ?? 0;
      }
      return row;
    });

    return { data, materials };
  }, [materialScenarios, selectedJoint, simulation]);

  const activeJoints = selectedJoint
    ? simulation.filter((s) => s.joint_id === selectedJoint)
    : simulation;

  // For material mode, auto-scale Y to the actual data range for clarity
  const materialYDomain: [number, number] = useMemo(() => {
    if (mode !== "materials" || !materialData.data.length) return [0, yMax / 100];
    let minV = Infinity;
    let maxV = -Infinity;
    for (const row of materialData.data) {
      for (const mat of materialData.materials) {
        const v = row[mat];
        if (v !== undefined) {
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
      }
    }
    if (!isFinite(minV)) return [0, yMax / 100];
    const pad = (maxV - minV) * 0.15 || 0.01;
    return [Math.max(0, minV - pad), maxV + pad];
  }, [materialData, mode, yMax]);

  const yDomain: [number, number] = mode === "materials" ? materialYDomain : [0, yMax / 100];

  const currentData = mode === "joints" ? jointData : materialData.data;
  const times = currentData.map((d) => d.time);
  const tMin = Math.min(...(times.length ? times : [0]));
  const tMax = Math.max(...(times.length ? times : [1]));
  const tRange = tMax - tMin;
  const tCenter = (tMin + tMax) / 2;
  const tHalf = (tRange * (xZoom / 100)) / 2;
  const xDomain: [number, number] = [Math.max(0, tCenter - tHalf), tCenter + tHalf];

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-shrink-0 flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-lime-400" />
          <h2 className="text-[14px] font-semibold text-zinc-200 tracking-tight">
            Wear Projection
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] text-zinc-500 font-medium">X</span>
            <input
              type="range"
              className="chart-zoom w-16"
              min={20}
              max={500}
              step={10}
              value={xZoom}
              onChange={(e) => setXZoom(Number(e.target.value))}
              title={`X-axis zoom: ${xZoom}%`}
            />
            <span className="text-[10.5px] text-lime-400 font-mono w-9 text-right">
              {xZoom}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] text-zinc-500 font-medium">Y</span>
            <input
              type="range"
              className="chart-zoom w-16"
              min={10}
              max={100}
              step={5}
              value={yMax}
              onChange={(e) => setYMax(Number(e.target.value))}
              title={`Y-axis max: ${yMax}%`}
            />
            <span className="text-[10.5px] text-lime-400 font-mono w-9 text-right">
              {yMax}%
            </span>
          </div>
          <div className="flex gap-0.5 bg-zinc-900/90 rounded-lg p-0.5 border border-zinc-800/60">
            <button
              onClick={() => setMode("joints")}
              className={`px-3 py-1 text-[11.5px] rounded-md transition-all font-medium ${
                mode === "joints"
                  ? "bg-lime-500/15 text-lime-300"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              By Joint
            </button>
            <button
              onClick={() => setMode("materials")}
              className={`px-3 py-1 text-[11.5px] rounded-md transition-all font-medium ${
                mode === "materials"
                  ? "bg-lime-500/15 text-lime-300"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Material Impact
            </button>
          </div>
        </div>
      </div>

      {mode === "materials" && (
        <p className="text-[10.5px] text-zinc-600 mb-1 flex-shrink-0">
          Baseline assumes the worst-case material from the catalogue. Top materials ranked by practicality (wear reduction / density).
        </p>
      )}

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          {mode === "joints" ? (
            <LineChart
              data={jointData}
              margin={{ top: 24, right: 8, bottom: 28, left: 6 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#18181f" />
              <XAxis
                dataKey="time"
                type="number"
                domain={xDomain}
                tick={{ fontSize: 10, fill: "#52525b" }}
                tickLine={false}
                axisLine={{ stroke: "#1e1e28" }}
                allowDataOverflow
                label={{ value: "Time (months)", position: "insideBottom", offset: -8, fontSize: 10, fill: "#71717a" }}
                tickCount={8}
              />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 10, fill: "#52525b" }}
                tickLine={false}
                axisLine={{ stroke: "#1e1e28" }}
                width={44}
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                allowDataOverflow
                label={{ value: "Wear Index", angle: -90, position: "insideLeft", offset: 8, fontSize: 10, fill: "#71717a" }}
              />
              <Tooltip
                contentStyle={{
                  background: "#0e0e14",
                  border: "1px solid #1e1e28",
                  borderRadius: "10px",
                  fontSize: "11px",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                }}
                labelStyle={{ color: "#71717a", fontSize: "10px" }}
                formatter={(value: number, name: unknown) => [
                  `${(Number(value) * 100).toFixed(1)}%`,
                  typeof name === "string" ? name.replace("_", " ") : "",
                ]}
              />
              <Legend
                verticalAlign="top"
                height={20}
                wrapperStyle={{ fontSize: "10px", top: 0 }}
                formatter={(v: string) => v.replace("_", " ")}
              />
              {activeJoints.map((s) => (
                <Line
                  key={s.joint_id}
                  type="monotone"
                  dataKey={s.joint_id}
                  stroke={JOINT_COLORS[s.joint_id] || "#71717a"}
                  strokeWidth={selectedJoint === s.joint_id ? 2.5 : 1.5}
                  dot={false}
                  strokeDasharray={
                    selectedJoint && selectedJoint !== s.joint_id
                      ? "4 4"
                      : undefined
                  }
                />
              ))}
              {yMax >= 30 && (
                <Line
                  type="monotone"
                  dataKey={() => 0.3}
                  stroke="#10b98140"
                  strokeWidth={1}
                  strokeDasharray="6 3"
                  dot={false}
                  legendType="none"
                />
              )}
              {yMax >= 70 && (
                <Line
                  type="monotone"
                  dataKey={() => 0.7}
                  stroke="#ef444440"
                  strokeWidth={1}
                  strokeDasharray="6 3"
                  dot={false}
                  legendType="none"
                />
              )}
            </LineChart>
          ) : (
            <LineChart
              data={materialData.data}
              margin={{ top: 24, right: 8, bottom: 28, left: 6 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#18181f" />
              <XAxis
                dataKey="time"
                type="number"
                domain={xDomain}
                tick={{ fontSize: 10, fill: "#52525b" }}
                tickLine={false}
                axisLine={{ stroke: "#1e1e28" }}
                allowDataOverflow
                label={{ value: "Time (months)", position: "insideBottom", offset: -8, fontSize: 10, fill: "#71717a" }}
                tickCount={8}
              />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 10, fill: "#52525b" }}
                tickLine={false}
                axisLine={{ stroke: "#1e1e28" }}
                width={55}
                tickFormatter={(v: number) => `${(v * 100).toFixed(2)}%`}
                allowDataOverflow
                label={{ value: "Wear Index", angle: -90, position: "insideLeft", offset: 8, fontSize: 10, fill: "#71717a" }}
                tickCount={6}
              />
              <Tooltip
                contentStyle={{
                  background: "#0e0e14",
                  border: "1px solid #1e1e28",
                  borderRadius: "10px",
                  fontSize: "11px",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                }}
                formatter={(value: number, name: unknown) => [
                  `${(Number(value) * 100).toFixed(3)}%`,
                  typeof name === "string" ? name : "",
                ]}
              />
              <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: "10px", top: 0 }} />
              {materialData.materials.map((mat, i) => (
                <Line
                  key={mat}
                  type="monotone"
                  dataKey={mat}
                  stroke={
                    mat === "Current Material"
                      ? "#ef4444"
                      : MATERIAL_COLORS[i % MATERIAL_COLORS.length]
                  }
                  strokeWidth={mat === "Current Material" ? 2 : 1.5}
                  strokeDasharray={
                    mat === "Current Material" ? "6 3" : undefined
                  }
                  dot={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
