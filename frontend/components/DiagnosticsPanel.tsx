"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  Cell,
  LabelList,
} from "recharts";
import {
  Brain,
  Target,
  TrendingUp,
  Layers,
  BarChart3,
  Info,
  RefreshCw,
  Trophy,
} from "lucide-react";
import type { DiagnosticsResult, AvailableModel, ModelComparisonEntry } from "@/lib/api";
import {
  getAvailableModels,
  setModelConfig,
  runAnalysis,
  pollUntilDone,
  getDiagnostics,
  getModelComparison,
} from "@/lib/api";

interface Props {
  diagnostics: DiagnosticsResult;
  onDiagnosticsUpdate?: (d: DiagnosticsResult) => void;
}

const LIME = "#84cc16";
const LIME_LIGHT = "#a3e635";
const EMERALD = "#10b981";
const AMBER = "#f59e0b";
const RED = "#ef4444";
const CYAN = "#22d3ee";
const ZINC_600 = "#52525b";
const ZINC_700 = "#3f3f46";
const ZINC_800 = "#27272a";

type Tab = "overview" | "scores" | "importance" | "threshold";

export function DiagnosticsPanel({ diagnostics, onDiagnosticsUpdate }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [models, setModels] = useState<Record<string, AvailableModel>>({});
  const [selectedModel, setSelectedModel] = useState(diagnostics.model_id);
  const [comparison, setComparison] = useState<Record<string, ModelComparisonEntry>>({});
  const [rerunning, setRerunning] = useState(false);
  const [rerunMsg, setRerunMsg] = useState<string | null>(null);

  useEffect(() => {
    getAvailableModels().then(setModels).catch(() => {});
    getModelComparison().then(setComparison).catch(() => {});
  }, []);

  useEffect(() => {
    setSelectedModel(diagnostics.model_id);
  }, [diagnostics.model_id]);

  const handleRerun = useCallback(async () => {
    if (rerunning) return;
    setRerunning(true);
    setRerunMsg("Setting model...");
    try {
      await setModelConfig(selectedModel);
      setRerunMsg("Running pipeline...");
      await runAnalysis(false);
      await pollUntilDone((msg) => setRerunMsg(msg));
      setRerunMsg("Fetching results...");
      const newDiag = await getDiagnostics();
      onDiagnosticsUpdate?.(newDiag);
      const comp = await getModelComparison();
      setComparison(comp);
      setRerunMsg(null);
    } catch (e: unknown) {
      setRerunMsg(`Error: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setRerunning(false);
    }
  }, [selectedModel, rerunning, onDiagnosticsUpdate]);

  // Find the best model
  const bestModel = Object.entries(comparison).reduce<{ id: string; score: number } | null>(
    (best, [id, entry]) => {
      const score = entry.silhouette_score ?? -2;
      if (!best || score > best.score) return { id, score };
      return best;
    },
    null,
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "scores", label: "Score Distribution" },
    { id: "importance", label: "Feature Importance" },
    { id: "threshold", label: "Threshold Analysis" },
  ];

  return (
    <div className="flex flex-col gap-3.5 animate-fade-in">
      {/* Model selector row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-lime-400" />
          <span className="text-[12px] text-zinc-400 font-medium">Model:</span>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={rerunning}
            className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-[12px] rounded-lg px-3 py-1.5 
              focus:border-lime-500/50 focus:outline-none disabled:opacity-50"
          >
            {Object.entries(models).map(([id, m]) => (
              <option key={id} value={id}>
                {m.display_name}
              </option>
            ))}
          </select>
          <button
            onClick={handleRerun}
            disabled={rerunning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-medium
              bg-lime-500/10 hover:bg-lime-500/20 text-lime-300 border border-lime-500/20
              disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rerunning ? "animate-spin" : ""}`} />
            {rerunning ? "Running..." : "Re-run Analysis"}
          </button>
        </div>

        {rerunMsg && (
          <span className="text-[11px] text-zinc-500 font-mono">{rerunMsg}</span>
        )}

        {bestModel && Object.keys(comparison).length > 1 && (
          <div className="flex items-center gap-1.5 ml-auto px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Trophy className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] text-emerald-300 font-medium">
              Best: {comparison[bestModel.id]?.display_name}
              {bestModel.score > -2 && ` (Silhouette: ${bestModel.score.toFixed(4)})`}
            </span>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-0.5 bg-zinc-900/90 rounded-lg p-0.5 border border-zinc-800/60 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-1.5 text-[11.5px] rounded-md transition-all font-medium ${
              tab === t.id
                ? "bg-lime-500/15 text-lime-300"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab diagnostics={diagnostics} comparison={comparison} />}
      {tab === "scores" && <ScoreDistributionTab diagnostics={diagnostics} />}
      {tab === "importance" && <FeatureImportanceTab diagnostics={diagnostics} />}
      {tab === "threshold" && <ThresholdTab diagnostics={diagnostics} />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* OVERVIEW TAB                                                */
/* ─────────────────────────────────────────────────────────── */

function OverviewTab({ diagnostics, comparison }: { diagnostics: DiagnosticsResult; comparison: Record<string, ModelComparisonEntry> }) {
  const unsup = diagnostics.unsupervised;
  const fi = diagnostics.feature_importance;
  const hasSup = diagnostics.supervised?.has_labels ?? false;
  const cm = diagnostics.supervised?.confusion_matrix;

  const cards = [
    {
      label: "Model",
      value: diagnostics.model_display_name,
      icon: Brain,
      accent: LIME,
    },
    {
      label: "Features Used",
      value: diagnostics.n_features_used.toString(),
      icon: Layers,
      accent: CYAN,
    },
    {
      label: "Total Samples",
      value: unsup.n_total.toLocaleString(),
      icon: BarChart3,
      accent: LIME_LIGHT,
    },
    {
      label: "Anomalies Detected",
      value: `${unsup.n_anomalies.toLocaleString()} (${(unsup.global_anomaly_rate * 100).toFixed(1)}%)`,
      icon: Target,
      accent: unsup.global_anomaly_rate > 0.15 ? RED : unsup.global_anomaly_rate > 0.08 ? AMBER : EMERALD,
    },
  ];

  const qualityCards = [
    {
      label: "Silhouette Score",
      value: unsup.silhouette_score != null ? unsup.silhouette_score.toFixed(4) : "N/A",
      desc: "Cluster separation quality (-1 to 1, higher is better)",
      good: unsup.silhouette_score != null && unsup.silhouette_score > 0.5,
    },
    {
      label: "Calinski-Harabasz",
      value: unsup.calinski_harabasz_score != null ? unsup.calinski_harabasz_score.toFixed(2) : "N/A",
      desc: "Cluster density ratio (higher is better)",
      good: unsup.calinski_harabasz_score != null && unsup.calinski_harabasz_score > 10,
    },
  ];

  // Per-joint anomaly rate for the mini bar chart
  const jointData = unsup.score_distributions.map((d) => ({
    name: d.joint_id,
    rate: +(d.anomaly_rate * 100).toFixed(1),
    count: d.n_anomalies,
  }));

  return (
    <div className="flex flex-col gap-3.5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <c.icon className="w-4 h-4" style={{ color: c.accent }} />
              <span className="text-[11.5px] text-zinc-500 font-medium">{c.label}</span>
            </div>
            <p className="text-[16px] font-semibold text-zinc-100 tracking-tight">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {/* Cluster quality */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-3.5 h-3.5 text-lime-400" />
            <h3 className="text-[13px] font-semibold text-zinc-200">Cluster Quality Metrics</h3>
          </div>
          <div className="flex flex-col gap-3">
            {qualityCards.map((q) => (
              <div key={q.label} className="flex items-center justify-between">
                <div>
                  <p className="text-[12.5px] text-zinc-300 font-medium">{q.label}</p>
                  <p className="text-[11px] text-zinc-600">{q.desc}</p>
                </div>
                <span className={`text-[15px] font-mono font-semibold ${q.good ? "text-emerald-400" : "text-zinc-400"}`}>
                  {q.value}
                </span>
              </div>
            ))}
            {hasSup && cm && (
              <>
                <div className="h-px bg-zinc-800 my-1" />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[12.5px] text-zinc-300 font-medium">F1 Score</p>
                    <p className="text-[11px] text-zinc-600">Harmonic mean of precision & recall</p>
                  </div>
                  <span className={`text-[15px] font-mono font-semibold ${cm.f1_score > 0.7 ? "text-emerald-400" : cm.f1_score > 0.4 ? "text-amber-400" : "text-red-400"}`}>
                    {cm.f1_score.toFixed(4)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Per-joint anomaly rate mini chart */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-3.5 h-3.5 text-lime-400" />
            <h3 className="text-[13px] font-semibold text-zinc-200">Anomaly Rate by Joint</h3>
          </div>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={jointData} layout="vertical" margin={{ left: 10, right: 50, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ZINC_800} horizontal={false} />
                <XAxis type="number" tick={{ fill: ZINC_600, fontSize: 10 }} domain={[0, "dataMax"]} unit="%" tickCount={5} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 11 }} width={70} />
                <Tooltip
                  contentStyle={{ background: "#0e0e14", border: "1px solid #1e1e28", borderRadius: 10, fontSize: 12 }}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, "Anomaly Rate"]}
                  labelFormatter={(label: string) => `Joint: ${label}`}
                />
                <Bar dataKey="rate" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  {jointData.map((d, i) => (
                    <Cell key={i} fill={d.rate > 15 ? RED : d.rate > 8 ? AMBER : LIME} fillOpacity={0.85} />
                  ))}
                  <LabelList
                    dataKey="rate"
                    position="right"
                    formatter={(v: number) => `${v.toFixed(1)}%`}
                    style={{ fill: "#a1a1aa", fontSize: 10, fontFamily: "monospace" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Model comparison */}
      {Object.keys(comparison).length > 1 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-3.5 h-3.5 text-emerald-400" />
            <h3 className="text-[13px] font-semibold text-zinc-200">Model Comparison (Silhouette Score)</h3>
          </div>
          <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={Object.entries(comparison).map(([id, e]) => ({
                  name: e.display_name,
                  silhouette: e.silhouette_score ?? 0,
                  isCurrent: id === diagnostics.model_id,
                }))}
                layout="vertical"
                margin={{ left: 10, right: 55, top: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={ZINC_800} horizontal={false} />
                <XAxis type="number" tick={{ fill: ZINC_600, fontSize: 10 }} domain={[0, 1]} tickCount={6} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 11 }} width={140} />
                <Tooltip
                  contentStyle={{ background: "#0e0e14", border: "1px solid #1e1e28", borderRadius: 10, fontSize: 12 }}
                  formatter={(v: number) => [v.toFixed(4), "Silhouette Score"]}
                />
                <Bar dataKey="silhouette" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  <LabelList
                    dataKey="silhouette"
                    position="right"
                    formatter={(v: number) => v.toFixed(4)}
                    style={{ fill: "#a1a1aa", fontSize: 10, fontFamily: "monospace" }}
                  />
                  {Object.entries(comparison).map(([id], i) => (
                    <Cell
                      key={i}
                      fill={id === diagnostics.model_id ? LIME : ZINC_600}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top features quick glance */}
      {fi && fi.features.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-3.5 h-3.5 text-lime-400" />
            <h3 className="text-[13px] font-semibold text-zinc-200">Top Contributing Features</h3>
            <span className="text-[10.5px] text-zinc-600 ml-auto">method: {fi.method}</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            {fi.features.slice(0, 10).map((f, i) => (
              <div key={f.feature} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900/60 border border-zinc-800/50">
                <span className="text-[10px] font-mono text-zinc-600 w-4">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-zinc-300 font-medium truncate">{f.feature}</p>
                  <div className="mt-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${f.importance * 100}%`,
                        background: `linear-gradient(90deg, ${LIME}, ${LIME_LIGHT})`,
                      }}
                    />
                  </div>
                </div>
                <span className="text-[10.5px] font-mono text-zinc-500">{(f.importance * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* SCORE DISTRIBUTION TAB                                      */
/* ─────────────────────────────────────────────────────────── */

function ScoreDistributionTab({ diagnostics }: { diagnostics: DiagnosticsResult }) {
  const unsup = diagnostics.unsupervised;
  const [selectedJoint, setSelectedJoint] = useState<string>("all_joints");

  const dist =
    selectedJoint === "all_joints"
      ? unsup.overall_distribution
      : unsup.score_distributions.find((d) => d.joint_id === selectedJoint);

  const histogramData = dist
    ? dist.histogram_bins.slice(0, -1).map((bin, i) => ({
        bin: +bin.toFixed(3),
        count: dist.histogram_counts[i],
      }))
    : [];

  const options = [
    { id: "all_joints", label: "All Joints" },
    ...unsup.score_distributions.map((d) => ({ id: d.joint_id, label: d.joint_id })),
  ];

  return (
    <div className="flex flex-col gap-3.5">
      {/* Joint selector */}
      <div className="flex items-center gap-3">
        <span className="text-[12px] text-zinc-500 font-medium">Joint:</span>
        <div className="flex gap-1 flex-wrap">
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => setSelectedJoint(o.id)}
              className={`px-3 py-1 text-[11px] rounded-md transition-all font-medium ${
                selectedJoint === o.id
                  ? "bg-lime-500/15 text-lime-300 border border-lime-500/20"
                  : "text-zinc-500 hover:text-zinc-300 border border-zinc-800/50 hover:border-zinc-700"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
        {/* Histogram */}
        <div className="card p-4 lg:col-span-2">
          <h3 className="text-[13px] font-semibold text-zinc-200 mb-3">Anomaly Score Histogram</h3>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogramData} margin={{ left: 5, right: 15, top: 5, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ZINC_800} />
                <XAxis dataKey="bin" tick={{ fill: ZINC_600, fontSize: 9 }} interval="preserveStartEnd" label={{ value: "Anomaly Score", position: "insideBottom", offset: -6, fill: ZINC_600, fontSize: 10 }} />
                <YAxis tick={{ fill: ZINC_600, fontSize: 10 }} label={{ value: "Count", angle: -90, position: "insideLeft", offset: 8, fill: ZINC_600, fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: "#0e0e14", border: "1px solid #1e1e28", borderRadius: 10, fontSize: 12 }}
                  formatter={(v: number) => [v, "Samples"]}
                  labelFormatter={(l: number) => `Score: ${l}`}
                />
                <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={24}>
                  {histogramData.map((d, i) => (
                    <Cell key={i} fill={d.bin < 0 ? RED : LIME} fillOpacity={0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stats summary */}
        {dist && (
          <div className="card p-4">
            <h3 className="text-[13px] font-semibold text-zinc-200 mb-3">Distribution Stats</h3>
            <div className="flex flex-col gap-2.5">
              {[
                { label: "Samples", value: dist.n_total.toLocaleString() },
                { label: "Anomalies", value: `${dist.n_anomalies} (${(dist.anomaly_rate * 100).toFixed(1)}%)` },
                { label: "Mean Score", value: dist.mean.toFixed(4) },
                { label: "Std Dev", value: dist.std.toFixed(4) },
                { label: "Median", value: dist.median.toFixed(4) },
                { label: "Q25 / Q75", value: `${dist.q25.toFixed(3)} / ${dist.q75.toFixed(3)}` },
                { label: "Min / Max", value: `${dist.min.toFixed(3)} / ${dist.max.toFixed(3)}` },
              ].map((s) => (
                <div key={s.label} className="flex justify-between items-center">
                  <span className="text-[11.5px] text-zinc-500">{s.label}</span>
                  <span className="text-[12px] font-mono text-zinc-300">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* FEATURE IMPORTANCE TAB                                      */
/* ─────────────────────────────────────────────────────────── */

function FeatureImportanceTab({ diagnostics }: { diagnostics: DiagnosticsResult }) {
  const fi = diagnostics.feature_importance;
  if (!fi || fi.features.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-zinc-500 text-[13px]">No feature importance data available.</p>
      </div>
    );
  }

  const chartData = fi.features.slice(0, 20).map((f) => ({
    name: f.feature.length > 25 ? f.feature.slice(0, 22) + "..." : f.feature,
    fullName: f.feature,
    importance: +(f.importance * 100).toFixed(1),
    rank: f.rank,
  }));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2">
        <Info className="w-3.5 h-3.5 text-zinc-600" />
        <span className="text-[11.5px] text-zinc-500">
          Feature importance computed via <span className="text-zinc-400 font-medium">{fi.method}</span> method — shows which features most influence anomaly detection
        </span>
      </div>

      <div className="card p-4">
        <h3 className="text-[13px] font-semibold text-zinc-200 mb-3">Top {fi.top_n} Features</h3>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 30, top: 5, bottom: 18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={ZINC_800} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: ZINC_600, fontSize: 10 }}
                domain={[0, 100]}
                unit="%"
                label={{ value: "Relative Importance", position: "insideBottom", offset: -6, fill: ZINC_600, fontSize: 10 }}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: "#a1a1aa", fontSize: 9 }}
                width={150}
              />
              <Tooltip
                contentStyle={{ background: "#0e0e14", border: "1px solid #1e1e28", borderRadius: 10, fontSize: 12 }}
                formatter={(v: number, _: string, p: { payload?: { fullName?: string } }) => [`${v}%`, p?.payload?.fullName ?? ""]}
              />
              <Bar dataKey="importance" radius={[0, 4, 4, 0]} maxBarSize={16}>
                {chartData.map((d, i) => {
                  const pct = d.importance / 100;
                  const r = Math.round(132 + (239 - 132) * (1 - pct));
                  const g = Math.round(204 + (68 - 204) * (1 - pct));
                  const b = Math.round(22 + (68 - 22) * (1 - pct));
                  return <Cell key={i} fill={`rgb(${r},${g},${b})`} fillOpacity={0.85} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* THRESHOLD ANALYSIS TAB (always accessible)                  */
/* ─────────────────────────────────────────────────────────── */

function ThresholdTab({ diagnostics }: { diagnostics: DiagnosticsResult }) {
  const ta = diagnostics.threshold_analysis;
  const sup = diagnostics.supervised;
  const hasSup = sup?.has_labels && sup?.confusion_matrix;

  const chartData = ta?.points?.map((p) => ({
    threshold: +p.threshold.toFixed(4),
    anomalies: p.n_anomalies,
    rate: +(p.anomaly_rate * 100).toFixed(2),
  })) ?? [];

  return (
    <div className="flex flex-col gap-3.5">
      {/* Explainer */}
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-zinc-900/60 border border-zinc-800/50">
        <Info className="w-4 h-4 text-zinc-500 mt-0.5 flex-shrink-0" />
        <div className="text-[11.5px] text-zinc-500 leading-relaxed">
          <span className="text-zinc-300 font-medium">Threshold Analysis</span> shows how the
          anomaly detection model&apos;s decision boundary affects results. The <span className="text-zinc-300">score threshold</span> is
          the anomaly score cutoff — samples scoring above the threshold are flagged as anomalies.
          Lower thresholds flag more anomalies (higher sensitivity), while higher thresholds flag
          fewer (higher specificity). Use this to evaluate model behaviour and choose an operating point.
        </div>
      </div>

      {/* Threshold sweep chart */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-semibold text-zinc-200">
            Anomaly Count vs. Decision Threshold
          </h3>
          {ta && (
            <span className="text-[11px] text-zinc-500 font-mono">
              Current threshold: {ta.current_threshold.toFixed(4)} → {ta.current_n_anomalies} anomalies
            </span>
          )}
        </div>
        {chartData.length > 0 ? (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ left: 10, right: 20, top: 5, bottom: 22 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ZINC_800} />
                <XAxis
                  dataKey="threshold"
                  tick={{ fill: ZINC_600, fontSize: 9 }}
                  tickCount={8}
                  label={{ value: "Score Threshold", position: "insideBottom", offset: -8, fill: ZINC_600, fontSize: 10 }}
                />
                <YAxis
                  tick={{ fill: ZINC_600, fontSize: 10 }}
                  tickCount={6}
                  label={{ value: "Anomaly Count", angle: -90, position: "insideLeft", offset: 8, fill: ZINC_600, fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{ background: "#0e0e14", border: "1px solid #1e1e28", borderRadius: 10, fontSize: 12 }}
                  formatter={(v: number, name: string) => [
                    name === "anomalies" ? v.toLocaleString() : `${v}%`,
                    name === "anomalies" ? "Anomaly Count" : "Anomaly Rate",
                  ]}
                  labelFormatter={(l: number) => `Threshold: ${l}`}
                />
                <Area
                  dataKey="anomalies"
                  stroke={LIME}
                  strokeWidth={2}
                  fill={LIME}
                  fillOpacity={0.12}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-zinc-500 text-[13px] text-center py-8">
            No threshold analysis data available for this run.
          </p>
        )}
      </div>

      {/* Anomaly rate sweep */}
      {chartData.length > 0 && (
        <div className="card p-4">
          <h3 className="text-[13px] font-semibold text-zinc-200 mb-1">
            Anomaly Rate (%) vs. Threshold
          </h3>
          <p className="text-[11px] text-zinc-600 mb-3">
            Percentage of samples classified as anomalous at each score threshold
          </p>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 10, right: 20, top: 5, bottom: 22 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ZINC_800} />
                <XAxis
                  dataKey="threshold"
                  tick={{ fill: ZINC_600, fontSize: 9 }}
                  tickCount={8}
                  label={{ value: "Score Threshold", position: "insideBottom", offset: -8, fill: ZINC_600, fontSize: 10 }}
                />
                <YAxis
                  tick={{ fill: ZINC_600, fontSize: 10 }}
                  unit="%"
                  tickCount={6}
                  label={{ value: "Anomaly Rate (%)", angle: -90, position: "insideLeft", offset: 8, fill: ZINC_600, fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{ background: "#0e0e14", border: "1px solid #1e1e28", borderRadius: 10, fontSize: 12 }}
                  formatter={(v: number) => [`${v}%`, "Anomaly Rate"]}
                  labelFormatter={(l: number) => `Threshold: ${l}`}
                />
                <Line
                  dataKey="rate"
                  stroke={CYAN}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Supervised section (shown when labels exist) */}
      {hasSup && sup?.confusion_matrix && <SupervisedSection sup={sup} />}
    </div>
  );
}

function SupervisedSection({ sup }: { sup: NonNullable<DiagnosticsResult["supervised"]> }) {
  const cm = sup.confusion_matrix!;
  const roc = sup.roc_curve;

  const cmData = [
    { label: "True Negative", value: cm.tn, row: 0, col: 0 },
    { label: "False Positive", value: cm.fp, row: 0, col: 1 },
    { label: "False Negative", value: cm.fn, row: 1, col: 0 },
    { label: "True Positive", value: cm.tp, row: 1, col: 1 },
  ];

  const maxVal = Math.max(cm.tp, cm.fp, cm.tn, cm.fn, 1);

  const rocData = roc
    ? roc.fpr.map((f, i) => ({ fpr: f, tpr: roc.tpr[i] }))
    : [];

  const metricCards = [
    { label: "Precision", value: cm.precision, desc: "TP / (TP + FP)" },
    { label: "Recall", value: cm.recall, desc: "TP / (TP + FN)" },
    { label: "F1 Score", value: cm.f1_score, desc: "Harmonic mean" },
    { label: "Accuracy", value: cm.accuracy, desc: "(TP + TN) / Total" },
  ];

  return (
    <>
      <div className="flex items-center gap-2 mt-2">
        <div className="h-px flex-1 bg-zinc-800" />
        <span className="text-[11.5px] text-zinc-500 font-medium px-2">
          Ground-Truth Classification Metrics
        </span>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metricCards.map((m) => (
          <div key={m.label} className="card p-4">
            <p className="text-[11.5px] text-zinc-500 font-medium mb-1">{m.label}</p>
            <p
              className={`text-[20px] font-bold font-mono tracking-tight ${
                m.value > 0.7 ? "text-emerald-400" : m.value > 0.4 ? "text-amber-400" : "text-red-400"
              }`}
            >
              {(m.value * 100).toFixed(1)}%
            </p>
            <p className="text-[10px] text-zinc-600 mt-0.5">{m.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        <div className="card p-4">
          <h3 className="text-[13px] font-semibold text-zinc-200 mb-4">Confusion Matrix</h3>
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1">
              <div className="w-[80px]" />
              <div className="w-[100px] text-center text-[11px] text-zinc-500 font-medium">Pred Normal</div>
              <div className="w-[100px] text-center text-[11px] text-zinc-500 font-medium">Pred Anomaly</div>
            </div>
            {[0, 1].map((row) => (
              <div key={row} className="flex items-center gap-1">
                <div className="w-[80px] text-right text-[11px] text-zinc-500 font-medium pr-2">
                  {row === 0 ? "True Normal" : "True Anomaly"}
                </div>
                {[0, 1].map((col) => {
                  const cell = cmData.find((c) => c.row === row && c.col === col)!;
                  const isDiag = row === col;
                  const intensity = cell.value / maxVal;
                  const bgColor = isDiag
                    ? `rgba(16, 185, 129, ${0.1 + intensity * 0.3})`
                    : `rgba(239, 68, 68, ${0.1 + intensity * 0.3})`;
                  return (
                    <div
                      key={col}
                      className="w-[100px] h-[70px] rounded-lg flex flex-col items-center justify-center border border-zinc-800/60"
                      style={{ background: bgColor }}
                    >
                      <span className="text-[18px] font-bold font-mono text-zinc-100">{cell.value}</span>
                      <span className="text-[9px] text-zinc-500 mt-0.5">{cell.label}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {roc && roc.fpr.length > 0 && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-semibold text-zinc-200">ROC Curve</h3>
              <span className="text-[11.5px] font-mono text-lime-400">AUC = {roc.auc.toFixed(4)}</span>
            </div>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={rocData} margin={{ left: 10, right: 15, top: 5, bottom: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={ZINC_800} />
                  <XAxis
                    dataKey="fpr"
                    tick={{ fill: ZINC_600, fontSize: 10 }}
                    label={{ value: "False Positive Rate", position: "insideBottom", offset: -4, fill: ZINC_600, fontSize: 11 }}
                  />
                  <YAxis
                    tick={{ fill: ZINC_600, fontSize: 10 }}
                    label={{ value: "True Positive Rate", angle: -90, position: "insideLeft", offset: 10, fill: ZINC_600, fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{ background: "#0e0e14", border: "1px solid #1e1e28", borderRadius: 10, fontSize: 12 }}
                    formatter={(v: number) => [v.toFixed(4)]}
                  />
                  <Line
                    data={[{ fpr: 0, tpr: 0 }, { fpr: 1, tpr: 1 }]}
                    dataKey="tpr"
                    stroke={ZINC_700}
                    strokeDasharray="5 5"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Area
                    dataKey="tpr"
                    stroke={LIME}
                    strokeWidth={2}
                    fill={LIME}
                    fillOpacity={0.1}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
