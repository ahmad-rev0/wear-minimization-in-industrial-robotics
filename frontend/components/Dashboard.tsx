"use client";

import { useState, useCallback } from "react";
import {
  Bot,
  Activity,
  FlaskConical,
  Upload,
  BarChart3,
  Wrench,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { UploadPanel } from "./UploadPanel";
import { RobotViewer } from "./RobotViewer";
import { SensorTimeline } from "./SensorTimeline";
import { SimulationChart } from "./SimulationChart";
import { MaterialPanel } from "./MaterialPanel";
import { WearStatsPanel } from "./WearStatsPanel";
import type { AnalysisResult, RobotModelData } from "@/lib/api";

const NAV_ITEMS = [
  { icon: Activity, label: "Dashboard", id: "dashboard" },
  { icon: Bot, label: "3D Viewer", id: "viewer" },
  { icon: BarChart3, label: "Sensors", id: "sensors" },
  { icon: FlaskConical, label: "Materials", id: "materials" },
  { icon: Upload, label: "Upload", id: "upload" },
] as const;

interface Props {
  results: AnalysisResult | null;
  robotModel: RobotModelData | null;
  onAnalysisComplete: (r: AnalysisResult, m: RobotModelData) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
}

export function Dashboard({
  results,
  robotModel,
  onAnalysisComplete,
  loading,
  setLoading,
}: Props) {
  const [activeNav, setActiveNav] = useState("dashboard");
  const [selectedJoint, setSelectedJoint] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<"sensor" | "simulation">(
    "sensor"
  );
  const [showUpload, setShowUpload] = useState(false);

  const handleJointClick = useCallback((jointId: string | null) => {
    setSelectedJoint((prev) =>
      jointId === null ? null : prev === jointId ? null : jointId
    );
  }, []);

  const handleReset = useCallback(() => {
    setShowUpload(true);
    setSelectedJoint(null);
  }, []);

  const handleAnalysis = useCallback(
    (r: AnalysisResult, m: RobotModelData) => {
      onAnalysisComplete(r, m);
      setShowUpload(false);
    },
    [onAnalysisComplete]
  );

  const showResults = results && !showUpload;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg-primary)]">
      {/* ── Sidebar ──────────────────────────────── */}
      <aside className="w-[60px] flex flex-col items-center py-5 gap-1.5 border-r border-[var(--color-border)] bg-[var(--color-bg-card)]">
        {/* Logo mark */}
        <div className="mb-5 w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <Wrench className="w-4.5 h-4.5 text-white" />
        </div>

        {NAV_ITEMS.map(({ icon: Icon, label, id }) => (
          <button
            key={id}
            onClick={() => {
              setActiveNav(id);
              if (id === "upload") setShowUpload(true);
              else if (results) setShowUpload(false);
            }}
            title={label}
            className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-200 ${
              activeNav === id
                ? "bg-indigo-500/15 text-indigo-400 shadow-sm shadow-indigo-500/10"
                : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/60"
            }`}
          >
            <Icon className="w-[18px] h-[18px]" />
          </button>
        ))}

        {/* Bottom spacer + version */}
        <div className="mt-auto">
          <span className="text-[8px] text-zinc-700 tracking-widest">v1.0</span>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-[52px] px-6 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-card)]/80 glass">
          <div className="flex items-center gap-3">
            <h1 className="text-[17px] font-bold tracking-tight">
              ROBO<span className="gradient-text">FIX</span>
            </h1>
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-px h-4 bg-zinc-800" />
              <span className="text-[11px] text-zinc-500 font-medium tracking-wide">
                Predictive Maintenance
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {results && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-all font-medium"
                title="New analysis"
              >
                <RotateCcw className="w-3 h-3" />
                New Analysis
              </button>
            )}
            {showResults && (
              <span className="flex items-center gap-1.5 text-[11px] px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                <span className="status-dot bg-emerald-400" />
                Analysis Ready
              </span>
            )}
            {loading && (
              <span className="flex items-center gap-1.5 text-[11px] px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium animate-pulse">
                <Sparkles className="w-3 h-3" />
                Processing...
              </span>
            )}
          </div>
        </header>

        {/* Content grid */}
        <main className="flex-1 overflow-auto p-3.5 gap-3.5 grid grid-cols-12 grid-rows-[1fr_auto]">
          {/* Left: 3D Viewer or Upload */}
          <section className="col-span-12 lg:col-span-8 card p-0 overflow-hidden min-h-[400px]">
            {!showResults ? (
              <UploadPanel
                onAnalysisComplete={handleAnalysis}
                loading={loading}
                setLoading={setLoading}
              />
            ) : (
              <RobotViewer
                model={robotModel}
                selectedJoint={selectedJoint}
                onJointClick={handleJointClick}
              />
            )}
          </section>

          {/* Right: Wear stats + materials */}
          <section className="col-span-12 lg:col-span-4 flex flex-col gap-3.5 overflow-auto max-h-[calc(100vh-7rem)]">
            {showResults ? (
              <>
                <WearStatsPanel
                  joints={results.joints}
                  selectedJoint={selectedJoint}
                  onJointClick={handleJointClick}
                />
                <MaterialPanel recommendations={results.recommendations} />
              </>
            ) : (
              <div className="card p-8 flex flex-col items-center justify-center text-center gap-4 min-h-[200px] animate-fade-in">
                <div className="w-14 h-14 rounded-2xl bg-zinc-800/60 flex items-center justify-center animate-float">
                  <Bot className="w-7 h-7 text-zinc-600" />
                </div>
                <div>
                  <p className="text-zinc-400 text-sm font-medium mb-1">
                    No analysis yet
                  </p>
                  <p className="text-zinc-600 text-xs">
                    Upload a sensor dataset to begin wear diagnostics
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Bottom: Tabbed panel */}
          {showResults && (
            <section className="col-span-12 card p-4 h-[240px]">
              <div className="absolute z-10 flex gap-0.5 bg-zinc-900/90 rounded-lg p-0.5 border border-zinc-800/60">
                <button
                  onClick={() => setBottomTab("sensor")}
                  className={`px-3 py-1 text-[10px] rounded-md transition-all font-medium ${
                    bottomTab === "sensor"
                      ? "bg-indigo-500/15 text-indigo-300"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Sensor Data
                </button>
                <button
                  onClick={() => setBottomTab("simulation")}
                  className={`px-3 py-1 text-[10px] rounded-md transition-all font-medium ${
                    bottomTab === "simulation"
                      ? "bg-indigo-500/15 text-indigo-300"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Wear Forecast
                </button>
              </div>

              <div className="h-full pt-7">
                {bottomTab === "sensor" ? (
                  <SensorTimeline
                    timeline={results.timeline}
                    simulation={results.simulation}
                  />
                ) : (
                  <SimulationChart
                    simulation={results.simulation}
                    materialScenarios={results.material_scenarios}
                    selectedJoint={selectedJoint}
                  />
                )}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
