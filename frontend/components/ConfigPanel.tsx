"use client";

import { useState, useEffect, useCallback } from "react";
import { Settings, SlidersHorizontal, Layers, ChevronDown, ChevronUp } from "lucide-react";

const API_BASE = "/api";

interface PipelineConfig {
  max_rows: number;
  contamination: number;
  deselected_features: string[];
}

interface Props {
  featureNames: string[];
}

export function ConfigPanel({ featureNames }: Props) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<PipelineConfig>({
    max_rows: 20000,
    contamination: 0.1,
    deselected_features: [],
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/pipeline_config`)
      .then((r) => {
        if (!r.ok) throw new Error("not ok");
        return r.json();
      })
      .then((data) =>
        setConfig((prev) => ({
          max_rows: data.max_rows ?? prev.max_rows,
          contamination: data.contamination ?? prev.contamination,
          deselected_features: data.deselected_features ?? prev.deselected_features,
        })),
      )
      .catch(() => {});
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/pipeline_config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }, [config]);

  const toggleFeature = (feat: string) => {
    setConfig((prev) => {
      const desel = new Set(prev.deselected_features ?? []);
      if (desel.has(feat)) desel.delete(feat);
      else desel.add(feat);
      return { ...prev, deselected_features: [...desel] };
    });
  };

  const deselected = config.deselected_features ?? [];
  const selectedCount = featureNames.length - deselected.length;

  return (
    <div className="card border border-zinc-800/60 animate-fade-in">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-zinc-900/40 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-lime-400" />
          <span className="text-[13px] font-semibold text-zinc-200">Pipeline Configuration</span>
          <span className="text-[11px] text-zinc-600 ml-2">
            {(config.max_rows ?? 20000).toLocaleString()} rows · {((config.contamination ?? 0.1) * 100).toFixed(0)}% contamination · {selectedCount}/{featureNames.length} features
          </span>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-zinc-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-zinc-500" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-4">
          {/* Downsampling */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-[12px] text-zinc-400 font-medium">
                Max Rows (Downsampling)
              </span>
              <span className="text-[11px] text-lime-400 font-mono ml-auto">
                {config.max_rows.toLocaleString()}
              </span>
            </div>
            <input
              type="range"
              min={500}
              max={100000}
              step={500}
              value={config.max_rows}
              onChange={(e) => setConfig((p) => ({ ...p, max_rows: Number(e.target.value) }))}
              className="chart-zoom w-full"
            />
            <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
              <span>500</span>
              <span>100,000</span>
            </div>
          </div>

          {/* Contamination */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-[12px] text-zinc-400 font-medium">
                Contamination (Anomaly Fraction)
              </span>
              <span className="text-[11px] text-lime-400 font-mono ml-auto">
                {(config.contamination * 100).toFixed(1)}%
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              step={1}
              value={Math.round(config.contamination * 100)}
              onChange={(e) =>
                setConfig((p) => ({ ...p, contamination: Number(e.target.value) / 100 }))
              }
              className="chart-zoom w-full"
            />
            <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
              <span>1%</span>
              <span>50%</span>
            </div>
          </div>

          {/* Feature selection */}
          {featureNames.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Layers className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[12px] text-zinc-400 font-medium">
                  Feature Selection
                </span>
                <span className="text-[11px] text-zinc-600 ml-auto">
                  {selectedCount} of {featureNames.length} selected
                </span>
              </div>
              <div className="max-h-[200px] overflow-y-auto rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-2 grid grid-cols-2 lg:grid-cols-3 gap-1">
                {featureNames.map((feat) => {
                  const isDeselected = deselected.includes(feat);
                  return (
                    <label
                      key={feat}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] cursor-pointer transition-colors ${
                        isDeselected
                          ? "text-zinc-600 bg-zinc-900/60"
                          : "text-zinc-300 hover:bg-zinc-800/60"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={!isDeselected}
                        onChange={() => toggleFeature(feat)}
                        className="rounded border-zinc-700 bg-zinc-800 text-lime-500 focus:ring-lime-500/30 w-3.5 h-3.5"
                      />
                      <span className="truncate font-mono">{feat}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Save button */}
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-[12px] font-medium bg-lime-500/15 hover:bg-lime-500/25 
                text-lime-300 border border-lime-500/20 transition-all disabled:opacity-50"
            >
              {saving ? "Saving..." : "Apply Configuration"}
            </button>
            {saved && (
              <span className="text-[11px] text-emerald-400 font-medium animate-fade-in">
                Saved! Re-run analysis to apply changes.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
