"use client";

import { Radio } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceDot,
} from "recharts";
import type { JointSimulation } from "@/lib/api";

interface TimelineData {
  timestamps: number[];
  magnitude: number[];
  anomaly: number[];
}

interface Props {
  timeline: TimelineData;
  simulation: JointSimulation[];
}

export function SensorTimeline({ timeline }: Props) {
  const step = Math.max(1, Math.floor(timeline.timestamps.length / 300));
  const data = timeline.timestamps
    .filter((_, i) => i % step === 0)
    .map((_, i) => {
      const idx = i * step;
      return {
        index: idx,
        magnitude: timeline.magnitude[idx],
        isAnomaly: timeline.anomaly[idx] === -1,
      };
    });

  const anomalyPoints = data.filter((d) => d.isAnomaly);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-indigo-400" />
          <h2 className="text-[13px] font-semibold text-zinc-200 tracking-tight">
            Sensor Timeline
          </h2>
        </div>
        <div className="flex gap-3 text-[10px] text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-[2px] bg-indigo-400 inline-block rounded-full" />
            Magnitude
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
            Anomaly
          </span>
        </div>
      </div>
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="magGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#18181f" />
            <XAxis
              dataKey="index"
              tick={{ fontSize: 10, fill: "#52525b" }}
              tickLine={false}
              axisLine={{ stroke: "#1e1e28" }}
              label={{
                value: "Sample",
                position: "insideBottomRight",
                offset: -5,
                style: { fontSize: 10, fill: "#52525b" },
              }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#52525b" }}
              tickLine={false}
              axisLine={{ stroke: "#1e1e28" }}
              width={50}
              label={{
                value: "Magnitude",
                angle: -90,
                position: "insideLeft",
                offset: 10,
                style: { fontSize: 10, fill: "#52525b" },
              }}
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
              formatter={(value: number) => [value.toFixed(2), "Mag"]}
            />
            <Area
              type="monotone"
              dataKey="magnitude"
              stroke="none"
              fill="url(#magGradient)"
            />
            <Line
              type="monotone"
              dataKey="magnitude"
              stroke="#6366f1"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: "#818cf8", stroke: "#6366f1" }}
            />
            {anomalyPoints.map((pt) => (
              <ReferenceDot
                key={pt.index}
                x={pt.index}
                y={pt.magnitude}
                r={3}
                fill="#ef4444"
                stroke="#ef444480"
                strokeWidth={3}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
