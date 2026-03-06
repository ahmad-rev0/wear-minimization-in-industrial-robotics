"use client";

import { useState } from "react";
import { Award, ChevronDown, ChevronUp, Layers } from "lucide-react";
import type { MaterialRecommendation } from "@/lib/api";

interface Props {
  recommendations: MaterialRecommendation[];
}

export function MaterialPanel({ recommendations }: Props) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? recommendations : recommendations.slice(0, 5);

  return (
    <div className="card p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-indigo-400" />
          <h2 className="text-[13px] font-semibold text-zinc-200 tracking-tight">
            Material Recommendations
          </h2>
        </div>
        <span className="text-[10px] text-zinc-600 font-mono">
          {recommendations.length} candidates
        </span>
      </div>

      <div className="space-y-1.5">
        {visible.map((mat, i) => {
          const isTop = i === 0;
          return (
            <div
              key={mat.material_name}
              className={`p-3 rounded-xl border transition-all duration-200 ${
                isTop
                  ? "border-indigo-500/25 bg-indigo-500/5"
                  : "border-transparent bg-zinc-900/40"
              }`}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {isTop && (
                    <div className="w-5 h-5 rounded-md bg-indigo-500/15 flex items-center justify-center">
                      <Award className="w-3 h-3 text-indigo-400" />
                    </div>
                  )}
                  <span
                    className={`text-[13px] font-medium tracking-tight ${
                      isTop ? "text-indigo-300" : "text-zinc-300"
                    }`}
                  >
                    {mat.material_name}
                  </span>
                </div>
                <span className="text-[11px] font-mono font-medium text-emerald-400">
                  -{mat.wear_reduction_pct}%
                </span>
              </div>

              {/* Reduction bar */}
              <div className="h-[4px] bg-zinc-800/80 rounded-full overflow-hidden mb-2.5">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${mat.wear_reduction_pct}%`,
                    background: isTop
                      ? "linear-gradient(90deg, #6366f1, #818cf8)"
                      : "linear-gradient(90deg, #3f3f46, #52525b)",
                  }}
                />
              </div>

              <div className="flex gap-4 text-[10px] text-zinc-500">
                <span>
                  Hardness <span className="text-zinc-400 font-mono">{mat.hardness} HV</span>
                </span>
                <span>
                  Friction <span className="text-zinc-400 font-mono">{mat.friction_coefficient}</span>
                </span>
                <span>
                  Wear coeff <span className="text-zinc-400 font-mono">{mat.wear_coefficient.toExponential(1)}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {recommendations.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors font-medium"
        >
          {expanded ? (
            <>
              Show less <ChevronUp className="w-3 h-3" />
            </>
          ) : (
            <>
              Show all {recommendations.length} <ChevronDown className="w-3 h-3" />
            </>
          )}
        </button>
      )}
    </div>
  );
}
