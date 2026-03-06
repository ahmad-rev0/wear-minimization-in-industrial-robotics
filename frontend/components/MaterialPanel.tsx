"use client";

import { useState } from "react";
import { Award, ChevronDown, ChevronUp } from "lucide-react";
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
        <h2 className="text-sm font-semibold text-zinc-200">
          Material Recommendations
        </h2>
        <span className="text-[10px] text-zinc-500">
          {recommendations.length} candidates
        </span>
      </div>

      <div className="space-y-2">
        {visible.map((mat, i) => {
          const isTop = i === 0;
          return (
            <div
              key={mat.material_name}
              className={`p-3 rounded-lg border transition-all ${
                isTop
                  ? "border-blue-500/30 bg-blue-500/5"
                  : "border-[var(--color-border)] bg-[var(--color-bg-card-hover)]/50"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  {isTop && <Award className="w-3.5 h-3.5 text-blue-400" />}
                  <span
                    className={`text-sm font-medium ${
                      isTop ? "text-blue-300" : "text-zinc-300"
                    }`}
                  >
                    {mat.material_name}
                  </span>
                </div>
                <span className="text-xs font-mono text-green-400">
                  -{mat.wear_reduction_pct}%
                </span>
              </div>

              {/* Reduction bar */}
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-700"
                  style={{ width: `${mat.wear_reduction_pct}%` }}
                />
              </div>

              <div className="flex gap-4 text-[10px] text-zinc-500">
                <span>
                  Hardness:{" "}
                  <span className="text-zinc-300">{mat.hardness} HV</span>
                </span>
                <span>
                  Friction:{" "}
                  <span className="text-zinc-300">
                    {mat.friction_coefficient}
                  </span>
                </span>
                <span>
                  Wear coeff:{" "}
                  <span className="text-zinc-300 font-mono">
                    {mat.wear_coefficient.toExponential(1)}
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {recommendations.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 w-full flex items-center justify-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
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
