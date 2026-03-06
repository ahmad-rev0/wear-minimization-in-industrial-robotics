"use client";

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

export function SensorTimeline({ timeline, simulation }: Props) {
  // Downsample for rendering performance
  const step = Math.max(1, Math.floor(timeline.timestamps.length / 300));
  const data = timeline.timestamps
    .filter((_, i) => i % step === 0)
    .map((ts, i) => {
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
        <h2 className="text-sm font-semibold text-zinc-200">
          Sensor Timeline
        </h2>
        <div className="flex gap-3 text-[10px] text-zinc-400">
          <span className="flex items-center gap-1">
            <span className="w-3 h-[2px] bg-blue-500 inline-block" />{" "}
            Magnitude
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{" "}
            Anomaly
          </span>
        </div>
      </div>
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="magGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e24" />
            <XAxis
              dataKey="index"
              tick={{ fontSize: 10, fill: "#71717a" }}
              tickLine={false}
              axisLine={{ stroke: "#27272a" }}
              label={{
                value: "Sample",
                position: "insideBottomRight",
                offset: -5,
                style: { fontSize: 10, fill: "#71717a" },
              }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#71717a" }}
              tickLine={false}
              axisLine={{ stroke: "#27272a" }}
              width={50}
              label={{
                value: "Magnitude",
                angle: -90,
                position: "insideLeft",
                offset: 10,
                style: { fontSize: 10, fill: "#71717a" },
              }}
            />
            <Tooltip
              contentStyle={{
                background: "#18181b",
                border: "1px solid #27272a",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelStyle={{ color: "#a1a1aa" }}
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
              stroke="#3b82f6"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: "#3b82f6" }}
            />
            {anomalyPoints.map((pt) => (
              <ReferenceDot
                key={pt.index}
                x={pt.index}
                y={pt.magnitude}
                r={3}
                fill="#ef4444"
                stroke="#ef4444"
                strokeWidth={0}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
