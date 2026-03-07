"use client";

import { Shield, AlertTriangle, XCircle, TrendingUp } from "lucide-react";
import type { JointWear } from "@/lib/api";
import { statusColor } from "@/lib/utils";

const STATUS_ICON = {
  healthy: Shield,
  moderate: AlertTriangle,
  severe: XCircle,
} as const;

const STATUS_BAR_COLOR: Record<string, string> = {
  healthy: "#10b981",
  moderate: "#f59e0b",
  severe: "#ef4444",
};

interface Props {
  joints: JointWear[];
  selectedJoint: string | null;
  onJointClick: (id: string) => void;
}

export function WearStatsPanel({ joints, selectedJoint, onJointClick }: Props) {
  const sorted = [...joints].sort((a, b) => b.wear_index - a.wear_index);
  const severeCount = joints.filter((j) => j.wear_status === "severe").length;
  const avgWear = joints.reduce((s, j) => s + j.wear_index, 0) / joints.length;

  return (
    <div className="card p-4 animate-fade-in flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-lime-400" />
          <h2 className="text-[14px] font-semibold text-zinc-200 tracking-tight">
            Joint Wear Analysis
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {severeCount > 0 && (
            <span className="text-[11.5px] px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/15 font-medium">
              {severeCount} Critical
            </span>
          )}
          <span className="text-[11.5px] text-zinc-500 font-mono">
            Avg {(avgWear * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Joint cards — scrollable */}
      <div className="space-y-1.5 overflow-y-auto min-h-0 flex-1 pr-1">
        {sorted.map((joint, i) => {
          const Icon = STATUS_ICON[joint.wear_status as keyof typeof STATUS_ICON] || Shield;
          const isSelected = selectedJoint === joint.joint_id;
          return (
            <button
              key={joint.joint_id}
              onClick={() => onJointClick(joint.joint_id)}
              className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                isSelected
                  ? "border-lime-500/40 bg-lime-500/5 shadow-sm shadow-lime-500/5"
                  : "border-transparent bg-zinc-900/40 hover:bg-zinc-800/40"
              }`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon className={`w-3.5 h-3.5 ${statusColor(joint.wear_status)}`} />
                  <span className="text-[13px] font-medium text-zinc-200 capitalize tracking-tight">
                    {joint.joint_id.replace("_", " ")}
                  </span>
                </div>
                <span className={`text-[12px] font-mono font-medium ${statusColor(joint.wear_status)}`}>
                  {(joint.wear_index * 100).toFixed(1)}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-[5px] bg-zinc-800/80 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${joint.wear_index * 100}%`,
                    background: `linear-gradient(90deg, ${STATUS_BAR_COLOR[joint.wear_status]}88, ${STATUS_BAR_COLOR[joint.wear_status]})`,
                  }}
                />
              </div>

              {/* Expanded details */}
              {isSelected && (
                <div className="mt-2.5 pt-2.5 border-t border-zinc-800/60 grid grid-cols-2 gap-2 text-[12px]">
                  <div className="text-zinc-500">
                    Anomaly Rate{" "}
                    <span className="text-zinc-200 font-mono font-medium">
                      {(joint.anomaly_rate * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-zinc-500">
                    Signal Energy{" "}
                    <span className="text-zinc-200 font-mono font-medium">
                      {joint.signal_energy.toFixed(0)}
                    </span>
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
