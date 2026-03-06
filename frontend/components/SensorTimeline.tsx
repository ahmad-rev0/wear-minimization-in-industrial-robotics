"use client";

import { useState, useMemo } from "react";
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
  const [yZoom, setYZoom] = useState(100);
  const [xZoom, setXZoom] = useState(100);

  const step = Math.max(1, Math.floor(timeline.timestamps.length / 500));
  const data = useMemo(
    () =>
      timeline.timestamps
        .filter((_, i) => i % step === 0)
        .map((_, i) => {
          const idx = i * step;
          return {
            index: idx,
            magnitude: timeline.magnitude[idx],
            isAnomaly: timeline.anomaly[idx] === -1,
          };
        }),
    [timeline, step]
  );

  const anomalyPoints = data.filter((d) => d.isAnomaly);

  const magnitudes = data.map((d) => d.magnitude);
  const minMag = Math.min(...magnitudes);
  const maxMag = Math.max(...magnitudes);
  const yRange = maxMag - minMag;
  const yCenter = (minMag + maxMag) / 2;
  const yHalf = (yRange * (yZoom / 100)) / 2;
  const domainMinY = Math.max(0, yCenter - yHalf);
  const domainMaxY = yCenter + yHalf;

  const indices = data.map((d) => d.index);
  const idxMin = Math.min(...(indices.length ? indices : [0]));
  const idxMax = Math.max(...(indices.length ? indices : [1]));
  const xRange = idxMax - idxMin;
  const xCenter = (idxMin + idxMax) / 2;
  const xHalf = (xRange * (xZoom / 100)) / 2;
  const domainMinX = Math.max(0, xCenter - xHalf);
  const domainMaxX = xCenter + xHalf;

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-shrink-0 flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-lime-400" />
          <h2 className="text-[13px] font-semibold text-zinc-200 tracking-tight">
            Sensor Timeline
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-3 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-[2px] bg-lime-400 inline-block rounded-full" />
              Magnitude
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
              Anomaly
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-zinc-500 font-medium">X</span>
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
            <span className="text-[9px] text-lime-400 font-mono w-8 text-right">
              {xZoom}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-zinc-500 font-medium">Y</span>
            <input
              type="range"
              className="chart-zoom w-16"
              min={20}
              max={200}
              step={10}
              value={yZoom}
              onChange={(e) => setYZoom(Number(e.target.value))}
              title={`Y-axis zoom: ${yZoom}%`}
            />
            <span className="text-[9px] text-lime-400 font-mono w-8 text-right">
              {yZoom}%
            </span>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="magGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#84cc16" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#84cc16" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#18181f" />
            <XAxis
              dataKey="index"
              type="number"
              domain={[domainMinX, domainMaxX]}
              tick={{ fontSize: 10, fill: "#52525b" }}
              tickLine={false}
              axisLine={{ stroke: "#1e1e28" }}
              allowDataOverflow
            />
            <YAxis
              domain={[domainMinY, domainMaxY]}
              tick={{ fontSize: 10, fill: "#52525b" }}
              tickLine={false}
              axisLine={{ stroke: "#1e1e28" }}
              width={50}
              allowDataOverflow
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
              stroke="#84cc16"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: "#a3e635", stroke: "#84cc16" }}
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
