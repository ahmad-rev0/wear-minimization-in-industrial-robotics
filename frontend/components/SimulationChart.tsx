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
  base: "#6366f1",
  shoulder: "#8b5cf6",
  elbow: "#06b6d4",
  wrist_1: "#f59e0b",
  wrist_2: "#ec4899",
  wrist_3: "#ef4444",
};

const MATERIAL_COLORS = ["#10b981", "#06b6d4", "#a855f7"];

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

  // ── Joint projection view ───────────────────────────────
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

  // ── Material comparison view (for selected joint) ───────
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

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
          <h2 className="text-[13px] font-semibold text-zinc-200 tracking-tight">
            Wear Projection
          </h2>
        </div>
        <div className="flex gap-0.5 bg-zinc-900/90 rounded-lg p-0.5 border border-zinc-800/60">
          <button
            onClick={() => setMode("joints")}
            className={`px-2.5 py-1 text-[10px] rounded-md transition-all font-medium ${
              mode === "joints"
                ? "bg-indigo-500/15 text-indigo-300"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            By Joint
          </button>
          <button
            onClick={() => setMode("materials")}
            className={`px-2.5 py-1 text-[10px] rounded-md transition-all font-medium ${
              mode === "materials"
                ? "bg-indigo-500/15 text-indigo-300"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Material Impact
          </button>
        </div>
      </div>

      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          {mode === "joints" ? (
            <LineChart
              data={jointData}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#18181f" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "#52525b" }}
                tickLine={false}
                axisLine={{ stroke: "#1e1e28" }}
                label={{
                  value: "Time",
                  position: "insideBottomRight",
                  offset: -5,
                  style: { fontSize: 10, fill: "#52525b" },
                }}
              />
              <YAxis
                domain={[0, 1]}
                tick={{ fontSize: 10, fill: "#52525b" }}
                tickLine={false}
                axisLine={{ stroke: "#1e1e28" }}
                width={35}
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
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
                wrapperStyle={{ fontSize: "10px" }}
                formatter={(v: string) => v.replace("_", " ")}
              />
              {activeJoints.map((s) => (
                <Line
                  key={s.joint_id}
                  type="monotone"
                  dataKey={s.joint_id}
                  stroke={JOINT_COLORS[s.joint_id] || "#71717a"}
                  strokeWidth={
                    selectedJoint === s.joint_id ? 2.5 : 1.5
                  }
                  dot={false}
                  strokeDasharray={
                    selectedJoint && selectedJoint !== s.joint_id
                      ? "4 4"
                      : undefined
                  }
                />
              ))}
              {/* Threshold lines */}
              <Line
                type="monotone"
                dataKey={() => 0.3}
                stroke="#10b98140"
                strokeWidth={1}
                strokeDasharray="6 3"
                dot={false}
                legendType="none"
              />
              <Line
                type="monotone"
                dataKey={() => 0.7}
                stroke="#ef444440"
                strokeWidth={1}
                strokeDasharray="6 3"
                dot={false}
                legendType="none"
              />
            </LineChart>
          ) : (
            <LineChart
              data={materialData.data}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#18181f" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "#52525b" }}
                tickLine={false}
                axisLine={{ stroke: "#1e1e28" }}
              />
              <YAxis
                domain={[0, 1]}
                tick={{ fontSize: 10, fill: "#52525b" }}
                tickLine={false}
                axisLine={{ stroke: "#1e1e28" }}
                width={35}
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
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
                  `${(Number(value) * 100).toFixed(1)}%`,
                  typeof name === "string" ? name : "",
                ]}
              />
              <Legend wrapperStyle={{ fontSize: "10px" }} />
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
