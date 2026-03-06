"use client";

import { useState, useCallback } from "react";
import {
  Bot,
  Activity,
  FlaskConical,
  Upload,
  BarChart3,
  Cpu,
  RotateCcw,
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

  const handleJointClick = useCallback((jointId: string) => {
    setSelectedJoint((prev) => (prev === jointId ? null : jointId));
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
    <div className="flex h-screen overflow-hidden">
      {/* ── Sidebar ──────────────────────────────── */}
      <aside className="w-16 flex flex-col items-center py-4 gap-1 border-r border-[var(--color-border)] bg-[var(--color-bg-card)]">
        <div className="mb-4 p-2">
          <Cpu className="w-7 h-7 text-blue-500" />
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
            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all ${
              activeNav === id
                ? "bg-blue-500/15 text-blue-400"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            <Icon className="w-5 h-5" />
          </button>
        ))}
      </aside>

      {/* ── Main area ────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 px-6 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-card)]">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">
              ROBOT<span className="text-blue-500">WIN</span>
            </h1>
            <span className="text-xs text-zinc-500 hidden sm:inline">
              Predictive Maintenance &amp; Wear Optimization
            </span>
          </div>
          <div className="flex items-center gap-3">
            {results && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
                title="New analysis"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                New Analysis
              </button>
            )}
            {showResults && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                Analysis Ready
              </span>
            )}
            {loading && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse">
                Processing...
              </span>
            )}
          </div>
        </header>

        {/* Content grid */}
        <main className="flex-1 overflow-auto p-4 gap-4 grid grid-cols-12 grid-rows-[1fr_auto]">
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
          <section className="col-span-12 lg:col-span-4 flex flex-col gap-4 overflow-auto max-h-[calc(100vh-8rem)]">
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
              <div className="card p-6 flex flex-col items-center justify-center text-center gap-3 min-h-[200px]">
                <Bot className="w-12 h-12 text-zinc-600" />
                <p className="text-zinc-500 text-sm">
                  Upload a dataset and run analysis to see wear diagnostics
                </p>
              </div>
            )}
          </section>

          {/* Bottom: Tabbed panel (Sensor timeline / Simulation chart) */}
          {showResults && (
            <section className="col-span-12 card p-4 h-[240px]">
              {/* Tab switcher */}
              <div className="absolute z-10 flex gap-1 bg-zinc-800/80 rounded-lg p-0.5 mb-2">
                <button
                  onClick={() => setBottomTab("sensor")}
                  className={`px-3 py-1 text-[10px] rounded-md transition-all ${
                    bottomTab === "sensor"
                      ? "bg-zinc-700 text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Sensor Data
                </button>
                <button
                  onClick={() => setBottomTab("simulation")}
                  className={`px-3 py-1 text-[10px] rounded-md transition-all ${
                    bottomTab === "simulation"
                      ? "bg-zinc-700 text-zinc-100"
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
