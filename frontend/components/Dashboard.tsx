"use client";

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Bot,
  Activity,
  FlaskConical,
  Upload,
  BarChart3,
  Wrench,
  RotateCcw,
  Sparkles,
  Microscope,
  Crosshair,
} from "lucide-react";
import { UploadPanel } from "./UploadPanel";
import { SensorTimeline } from "./SensorTimeline";
import { SimulationChart } from "./SimulationChart";
import { MaterialPanel } from "./MaterialPanel";
import { WearStatsPanel } from "./WearStatsPanel";
import { ExportPanel } from "./ExportPanel";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { ConfigPanel } from "./ConfigPanel";
import { JointEditor } from "./JointEditor";
import { useAnalysis } from "../hooks/useAnalysis";
import type { AnalysisResult, RobotModelData } from "@/lib/api";
import { getRobotImageUrl, getJointLayout } from "@/lib/api";
import type { JointPosition2D } from "@/lib/api";

const RobotViewer = dynamic(
  () => import("./RobotViewer").then((m) => m.RobotViewer),
  { ssr: false, loading: () => <div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm">Loading 3D viewer...</div> }
);

type View = "dashboard" | "viewer" | "sensors" | "materials" | "diagnostics" | "joint_editor" | "upload";

const NAV_ITEMS: {
  icon: typeof Activity;
  label: string;
  id: View;
  desc: string;
}[] = [
  {
    icon: Activity,
    label: "Dashboard",
    id: "dashboard",
    desc: "Complete system overview — 3D model, wear statistics, and sensor charts",
  },
  {
    icon: Bot,
    label: "3D Viewer",
    id: "viewer",
    desc: "Interactive 3D robot visualization with color-coded wear indicators",
  },
  {
    icon: BarChart3,
    label: "Sensors",
    id: "sensors",
    desc: "Sensor signal analysis and projected wear degradation curves",
  },
  {
    icon: FlaskConical,
    label: "Materials",
    id: "materials",
    desc: "Per-joint wear diagnostics and ranked material upgrade candidates",
  },
  {
    icon: Microscope,
    label: "ML Diagnostics",
    id: "diagnostics",
    desc: "Model performance metrics, feature importance, score distributions, and classification analysis",
  },
  {
    icon: Crosshair,
    label: "Joint Layout",
    id: "joint_editor",
    desc: "Map joint positions onto a robot photo — auto-detect or manually drag to customise the 3D layout",
  },
  {
    icon: Upload,
    label: "Upload",
    id: "upload",
    desc: "Import sensor data from CSV or run analysis on the bundled demo dataset",
  },
];

const VIEW_HEADINGS: Record<View, { title: string; subtitle: string }> = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Unified system overview combining 3D visualization, wear analytics, and real-time sensor data",
  },
  viewer: {
    title: "3D Robot Viewer",
    subtitle: "Select any joint to inspect detailed wear metrics — orbit, pan, and zoom to explore the model",
  },
  sensors: {
    title: "Sensor Analytics",
    subtitle: "Sensor signal timeline with anomaly detection and projected wear degradation forecasts",
  },
  materials: {
    title: "Materials & Diagnostics",
    subtitle: "Comprehensive per-joint wear breakdown with ranked material upgrade recommendations",
  },
  diagnostics: {
    title: "ML Diagnostics",
    subtitle: "Model performance evaluation — anomaly score distributions, feature importance, and classification metrics",
  },
  joint_editor: {
    title: "Joint Layout Editor",
    subtitle: "Position joint markers on a robot side-profile photo to create a custom 3D geometry for the viewer",
  },
  upload: {
    title: "Upload Dataset",
    subtitle: "Import a sensor CSV file for analysis or run diagnostics on the bundled demonstration dataset",
  },
};

export function Dashboard() {
  const {
    results,
    robotModel,
    diagnostics,
    loading,
    currentStep,
    refreshDiagnostics,
    refreshModel,
    checkAndRunAnalysis,
    loadFromUpload,
  } = useAnalysis();

  const [activeView, setActiveView] = useState<View>("dashboard");
  const [selectedJoint, setSelectedJoint] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<"sensor" | "simulation">(
    "sensor"
  );
  const [hoveredNav, setHoveredNav] = useState<View | null>(null);
  const [robotImageUrl, setRobotImageUrl] = useState<string | null>(null);
  const [jointLayout, setJointLayout] = useState<JointPosition2D[] | null>(null);

  // Check if analysis needs to be run when dashboard loads
  useEffect(() => {
    if (activeView === "dashboard" && !results && !loading) {
      checkAndRunAnalysis();
    }
  }, [activeView, results, loading, checkAndRunAnalysis]);

  const handleJointClick = useCallback((jointId: string | null) => {
    setSelectedJoint((prev) =>
      jointId === null ? null : prev === jointId ? null : jointId
    );
  }, []);

  const handleNavClick = useCallback((id: View) => {
    setActiveView(id);
    if (id === "joint_editor") {
      getRobotImageUrl().then(setRobotImageUrl).catch(() => {});
      getJointLayout().then(setJointLayout).catch(() => {});
    }
  }, []);

  const handleLayoutSaved = useCallback(async () => {
    if (!results) return;
    await refreshModel();
  }, [results, refreshModel]);

  const handleAnalysis = useCallback(
    (r: AnalysisResult, m: RobotModelData) => {
      loadFromUpload(r, m);
      setActiveView("dashboard");
    },
    [loadFromUpload]
  );

  const needsResults = activeView !== "upload" && activeView !== "dashboard" && activeView !== "joint_editor";
  const showUpload =
    activeView === "upload" || (!results && activeView === "dashboard");

  const heading = VIEW_HEADINGS[activeView];

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg-primary)]">
      {/* ── Sidebar ──────────────────────────────── */}
      <aside className="w-[60px] flex flex-col items-center py-5 gap-1.5 border-r border-[var(--color-border)] bg-[var(--color-bg-card)] relative">
        <div className="mb-5 w-9 h-9 rounded-xl bg-gradient-to-br from-lime-600 to-lime-400 flex items-center justify-center shadow-lg shadow-lime-500/20">
          <Wrench className="w-4.5 h-4.5 text-white" />
        </div>

        {NAV_ITEMS.map(({ icon: Icon, label, id, desc }) => {
          const disabled =
            needsResults && !results && id !== "upload" && id !== "dashboard";
          return (
            <div key={id} className="relative">
              <button
                onClick={() => handleNavClick(id)}
                disabled={disabled}
                onMouseEnter={() => setHoveredNav(id)}
                onMouseLeave={() => setHoveredNav(null)}
                className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-200 ${
                  disabled
                    ? "text-zinc-800 cursor-not-allowed"
                    : activeView === id
                    ? "bg-lime-500/15 text-lime-400 shadow-sm shadow-lime-500/10"
                    : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/60"
                }`}
              >
                <Icon className="w-[18px] h-[18px]" />
              </button>

              {/* Hover tooltip */}
              {hoveredNav === id && (
                <div className="absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 z-50 pointer-events-none animate-fade-in">
                  <div className="glass border border-zinc-800/60 rounded-xl px-3.5 py-2.5 shadow-2xl min-w-[200px]">
                    <p className="text-[13px] font-semibold text-zinc-100 mb-0.5">
                      {label}
                    </p>
                    <p className="text-[11.5px] text-zinc-400 leading-relaxed">
                      {desc}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div className="mt-auto">
          <span className="text-[8px] text-zinc-700 tracking-widest">
            v1.0
          </span>
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
            {results && activeView !== "upload" && (
              <button
                onClick={() => setActiveView("upload")}
                className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-all font-medium"
                title="New analysis"
              >
                <RotateCcw className="w-3 h-3" />
                New Analysis
              </button>
            )}
            {results && activeView !== "upload" && (
              <span className="flex items-center gap-1.5 text-[12px] px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                <span className="status-dot bg-emerald-400" />
                Analysis Complete
              </span>
            )}
            {loading && (
              <span className="flex items-center gap-1.5 text-[12px] px-3 py-1 rounded-full bg-lime-500/10 text-lime-400 border border-lime-500/20 font-medium">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
                {currentStep || "Processing..."}
              </span>
            )}
          </div>
        </header>

        {/* View heading bar */}
        <div className="px-6 py-3 border-b border-[var(--color-border)]/50">
          <h2 className="text-[14px] font-semibold text-zinc-100 tracking-tight">
            {heading.title}
          </h2>
          <p className="text-[12.5px] text-zinc-500 mt-0.5 leading-relaxed">
            {heading.subtitle}
          </p>
        </div>

        {/* ── View content ────────────────────────── */}
        <main className="flex-1 overflow-auto p-3.5">
          {showUpload && (
            <div className="flex flex-col gap-3.5 h-full">
              <div className="flex-1 card p-0 overflow-hidden min-h-0">
                <UploadPanel
                  onAnalysisComplete={handleAnalysis}
                  loading={loading}
                  setLoading={() => {}} // This is handled by the hook, but UploadPanel expects it
                />
              </div>
              <ConfigPanel featureNames={diagnostics?.feature_names ?? []} />
            </div>
          )}

          {activeView === "dashboard" && results && (
            <div className="gap-3.5 grid grid-cols-12 pb-4">
              <section className="col-span-12 lg:col-span-7 card p-0 overflow-hidden h-[400px]">
                <RobotViewer
                  model={robotModel}
                  selectedJoint={selectedJoint}
                  onJointClick={handleJointClick}
                />
              </section>

              <section className="col-span-12 lg:col-span-5 flex flex-col gap-3.5 overflow-auto h-[400px]">
                <WearStatsPanel
                  joints={results.joints}
                  selectedJoint={selectedJoint}
                  onJointClick={handleJointClick}
                />
                <MaterialPanel recommendations={results.recommendations} />
              </section>

              <section className="col-span-12 card p-4 h-[380px]">
                <BottomTabs
                  bottomTab={bottomTab}
                  setBottomTab={setBottomTab}
                  results={results}
                  selectedJoint={selectedJoint}
                />
              </section>

              <ExportPanel results={results} />
            </div>
          )}

          {activeView === "viewer" && results && (
            <div className="h-full card p-0 overflow-hidden">
              <RobotViewer
                model={robotModel}
                selectedJoint={selectedJoint}
                onJointClick={handleJointClick}
              />
            </div>
          )}

          {activeView === "sensors" && results && (
            <div className="flex flex-col gap-3.5 h-full">
              <section className="card p-4 flex-1 min-h-[280px]">
                <SensorTimeline
                  timeline={results.timeline}
                  simulation={results.simulation}
                />
              </section>
              <section className="card p-4 flex-1 min-h-[280px]">
                <SimulationChart
                  simulation={results.simulation}
                  materialScenarios={results.material_scenarios}
                  selectedJoint={selectedJoint}
                />
              </section>
            </div>
          )}

          {activeView === "materials" && results && (
            <div className="grid grid-cols-12 gap-3.5">
              <section className="col-span-12 lg:col-span-6">
                <WearStatsPanel
                  joints={results.joints}
                  selectedJoint={selectedJoint}
                  onJointClick={handleJointClick}
                />
              </section>
              <section className="col-span-12 lg:col-span-6">
                <MaterialPanel recommendations={results.recommendations} />
              </section>
            </div>
          )}

          {activeView === "diagnostics" && diagnostics && (
            <DiagnosticsPanel diagnostics={diagnostics} onDiagnosticsUpdate={refreshDiagnostics} />
          )}

          {activeView === "diagnostics" && !diagnostics && results && (
            <div className="h-full card p-8 flex flex-col items-center justify-center text-center gap-4 animate-fade-in">
              <div className="w-14 h-14 rounded-2xl bg-zinc-800/60 flex items-center justify-center animate-float">
                <Microscope className="w-7 h-7 text-zinc-600" />
              </div>
              <div>
                <p className="text-zinc-400 text-[15px] font-medium mb-1">
                  Diagnostics Loading
                </p>
                <p className="text-zinc-500 text-[13px]">
                  ML diagnostics data is still being prepared
                </p>
              </div>
            </div>
          )}

          {activeView === "joint_editor" && (
            <div className="h-full">
              <JointEditor
                imageUrl={robotImageUrl}
                initialLayout={jointLayout}
                jointIds={results?.joints?.map((j) => j.joint_id) ?? null}
                onLayoutSaved={handleLayoutSaved}
              />
            </div>
          )}

          {!results && !showUpload && activeView !== "joint_editor" && (
            <div className="h-full card p-8 flex flex-col items-center justify-center text-center gap-4 animate-fade-in">
              <div className="w-14 h-14 rounded-2xl bg-zinc-800/60 flex items-center justify-center animate-float">
                <Bot className="w-7 h-7 text-zinc-600" />
              </div>
              <div>
                <p className="text-zinc-400 text-[15px] font-medium mb-1">
                  No Analysis Available
                </p>
                <p className="text-zinc-500 text-[13px]">
                  Upload a sensor dataset to begin predictive wear diagnostics
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function BottomTabs({
  bottomTab,
  setBottomTab,
  results,
  selectedJoint,
}: {
  bottomTab: "sensor" | "simulation";
  setBottomTab: (v: "sensor" | "simulation") => void;
  results: AnalysisResult;
  selectedJoint: string | null;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 mb-2 flex gap-0.5 bg-zinc-900/90 rounded-lg p-0.5 border border-zinc-800/60 w-fit">
        <button
          onClick={() => setBottomTab("sensor")}
          className={`px-3.5 py-1 text-[11.5px] rounded-md transition-all font-medium ${
            bottomTab === "sensor"
              ? "bg-lime-500/15 text-lime-300"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Sensor Data
        </button>
        <button
          onClick={() => setBottomTab("simulation")}
          className={`px-3.5 py-1 text-[11.5px] rounded-md transition-all font-medium ${
            bottomTab === "simulation"
              ? "bg-lime-500/15 text-lime-300"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Wear Forecast
        </button>
      </div>
      <div className="flex-1 min-h-0">
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
    </div>
  );
}