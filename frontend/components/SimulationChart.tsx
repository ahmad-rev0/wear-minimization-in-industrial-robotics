"use client";

import { useState, useMemo } from "react";
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
  base: "#3b82f6",
  shoulder: "#8b5cf6",
  elbow: "#06b6d4",
  wrist_1: "#f97316",
  wrist_2: "#ec4899",
  wrist_3: "#ef4444",
};

const MATERIAL_COLORS = ["#22c55e", "#06b6d4", "#a855f7"];

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
        <h2 className="text-sm font-semibold text-zinc-200">
          Wear Projection
        </h2>
        <div className="flex gap-1 bg-zinc-800/80 rounded-lg p-0.5">
          <button
            onClick={() => setMode("joints")}
            className={`px-2.5 py-1 text-[10px] rounded-md transition-all ${
              mode === "joints"
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            By Joint
          </button>
          <button
            onClick={() => setMode("materials")}
            className={`px-2.5 py-1 text-[10px] rounded-md transition-all ${
              mode === "materials"
                ? "bg-zinc-700 text-zinc-100"
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
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e24" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "#71717a" }}
                tickLine={false}
                axisLine={{ stroke: "#27272a" }}
                label={{
                  value: "Time",
                  position: "insideBottomRight",
                  offset: -5,
                  style: { fontSize: 10, fill: "#71717a" },
                }}
              />
              <YAxis
                domain={[0, 1]}
                tick={{ fontSize: 10, fill: "#71717a" }}
                tickLine={false}
                axisLine={{ stroke: "#27272a" }}
                width={35}
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              />
              <Tooltip
                contentStyle={{
                  background: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: "8px",
                  fontSize: "11px",
                }}
                labelStyle={{ color: "#a1a1aa" }}
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
                stroke="#22c55e"
                strokeWidth={1}
                strokeDasharray="6 3"
                dot={false}
                legendType="none"
              />
              <Line
                type="monotone"
                dataKey={() => 0.7}
                stroke="#ef4444"
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
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e24" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "#71717a" }}
                tickLine={false}
                axisLine={{ stroke: "#27272a" }}
              />
              <YAxis
                domain={[0, 1]}
                tick={{ fontSize: 10, fill: "#71717a" }}
                tickLine={false}
                axisLine={{ stroke: "#27272a" }}
                width={35}
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              />
              <Tooltip
                contentStyle={{
                  background: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: "8px",
                  fontSize: "11px",
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
