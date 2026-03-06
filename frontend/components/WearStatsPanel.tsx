"use client";

import { Shield, AlertTriangle, XCircle } from "lucide-react";
import type { JointWear } from "@/lib/api";
import { statusColor, statusBg } from "@/lib/utils";

const STATUS_ICON = {
  healthy: Shield,
  moderate: AlertTriangle,
  severe: XCircle,
} as const;

interface Props {
  joints: JointWear[];
  selectedJoint: string | null;
  onJointClick: (id: string) => void;
}

export function WearStatsPanel({ joints, selectedJoint, onJointClick }: Props) {
  const sorted = [...joints].sort((a, b) => b.wear_index - a.wear_index);
  const severeCount = joints.filter((j) => j.wear_status === "severe").length;

  return (
    <div className="card p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-zinc-200">Joint Wear Analysis</h2>
        {severeCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
            {severeCount} critical
          </span>
        )}
      </div>
      <div className="space-y-2">
        {sorted.map((joint) => {
          const Icon = STATUS_ICON[joint.wear_status as keyof typeof STATUS_ICON] || Shield;
          const isSelected = selectedJoint === joint.joint_id;
          return (
            <button
              key={joint.joint_id}
              onClick={() => onJointClick(joint.joint_id)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                isSelected
                  ? "border-blue-500/50 bg-blue-500/5"
                  : `${statusBg(joint.wear_status)} hover:bg-zinc-800/50`
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <Icon className={`w-3.5 h-3.5 ${statusColor(joint.wear_status)}`} />
                  <span className="text-sm font-medium text-zinc-200 capitalize">
                    {joint.joint_id.replace("_", " ")}
                  </span>
                </div>
                <span className={`text-xs font-mono ${statusColor(joint.wear_status)}`}>
                  {(joint.wear_index * 100).toFixed(1)}%
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${joint.wear_index * 100}%`,
                    background:
                      joint.wear_status === "severe"
                        ? "#ef4444"
                        : joint.wear_status === "moderate"
                        ? "#eab308"
                        : "#22c55e",
                  }}
                />
              </div>
              {isSelected && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-400">
                  <div>
                    Anomaly rate:{" "}
                    <span className="text-zinc-200">{(joint.anomaly_rate * 100).toFixed(1)}%</span>
                  </div>
                  <div>
                    Energy:{" "}
                    <span className="text-zinc-200">{joint.signal_energy.toFixed(0)}</span>
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
