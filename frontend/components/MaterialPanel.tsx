"use client";

import { Award, Layers } from "lucide-react";
import type { MaterialRecommendation } from "@/lib/api";

interface Props {
  recommendations: MaterialRecommendation[];
}

export function MaterialPanel({ recommendations }: Props) {
  return (
    <div className="card p-4 animate-fade-in flex flex-col flex-1 min-h-0">
      <div className="flex-shrink-0 flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-lime-400" />
          <h2 className="text-[14px] font-semibold text-zinc-200 tracking-tight">
            Material Recommendations
          </h2>
        </div>
        <span className="text-[11.5px] text-zinc-500 font-mono">
          {recommendations.length} Candidates
        </span>
      </div>

      <div className="space-y-1.5 overflow-y-auto min-h-0 flex-1 pr-1">
        {recommendations.map((mat, i) => {
          const isTop = i === 0;
          return (
            <div
              key={mat.material_name}
              className={`p-3 rounded-xl border transition-all duration-200 ${
                isTop
                  ? "border-lime-500/25 bg-lime-500/5"
                  : "border-transparent bg-zinc-900/40"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {isTop && (
                    <div className="w-5 h-5 rounded-md bg-lime-500/15 flex items-center justify-center">
                      <Award className="w-3 h-3 text-lime-400" />
                    </div>
                  )}
                  <span
                    className={`text-[13px] font-medium tracking-tight ${
                      isTop ? "text-lime-300" : "text-zinc-300"
                    }`}
                  >
                    {mat.material_name}
                  </span>
                </div>
                <span className="text-[12px] font-mono font-medium text-emerald-400">
                  -{mat.wear_reduction_pct}%
                </span>
              </div>

              <div className="h-[4px] bg-zinc-800/80 rounded-full overflow-hidden mb-2.5">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${mat.wear_reduction_pct}%`,
                    background: isTop
                      ? "linear-gradient(90deg, #65a30d, #a3e635)"
                      : "linear-gradient(90deg, #3f3f46, #52525b)",
                  }}
                />
              </div>

              <div className="flex gap-4 text-[11px] text-zinc-500">
                <span>
                  Hardness <span className="text-zinc-400 font-mono">{mat.hardness} HV</span>
                </span>
                <span>
                  Friction Coeff <span className="text-zinc-400 font-mono">{mat.friction_coefficient}</span>
                </span>
                <span>
                  Wear Coeff <span className="text-zinc-400 font-mono">{mat.wear_coefficient.toExponential(1)}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
