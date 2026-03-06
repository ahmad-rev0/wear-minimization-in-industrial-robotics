"use client";

import { useState, useCallback } from "react";
import { FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import type { AnalysisResult } from "@/lib/api";

interface Props {
  results: AnalysisResult;
}

function ts() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const COLORS = {
  bg: "#ffffff",
  headerBg: "#111118",
  accent: "#4d7c0f",
  accentLight: "#84cc16",
  text: "#1a1a1a",
  textMuted: "#555555",
  textLight: "#888888",
  border: "#d4d4d8",
  borderLight: "#e8e8ec",
  rowAlt: "#f7f7f9",
  healthy: "#0d9465",
  moderate: "#b27300",
  severe: "#c03030",
  chartLines: [
    "#2563eb", "#dc2626", "#0d9465", "#b27300", "#7c3aed", "#0891b2",
  ],
};

export function ExportPanel({ results }: Props) {
  const [exporting, setExporting] = useState<"pdf" | "csv" | null>(null);

  const exportCSV = useCallback(() => {
    setExporting("csv");
    try {
      const lines: string[] = [];
      lines.push("ROBOFIX - Wear Analysis Export");
      lines.push(`Generated: ${new Date().toLocaleString()}`);
      lines.push("");
      lines.push("=== Joint Wear Analysis ===");
      lines.push("Joint,Wear Index (%),Status,Anomaly Rate (%),Signal Energy");
      for (const j of results.joints)
        lines.push([j.joint_id, (j.wear_index * 100).toFixed(2), j.wear_status, (j.anomaly_rate * 100).toFixed(2), j.signal_energy.toFixed(2)].join(","));
      lines.push("");
      lines.push("=== Material Recommendations ===");
      lines.push("Material,Wear Reduction (%),Hardness (HV),Friction Coefficient,Wear Coefficient");
      for (const m of results.recommendations)
        lines.push([m.material_name, m.wear_reduction_pct.toFixed(2), m.hardness.toFixed(1), m.friction_coefficient, m.wear_coefficient.toExponential(3)].join(","));
      lines.push("");
      lines.push("=== Wear Simulation Trajectories ===");
      if (results.simulation.length > 0) {
        const times = results.simulation[0].trajectory.map((p) => p.time);
        const ids = results.simulation.map((s) => s.joint_id);
        lines.push(["Time", ...ids].join(","));
        times.forEach((t, i) => lines.push([t, ...results.simulation.map((s) => (s.trajectory[i]?.projected_wear ?? 0).toFixed(4))].join(",")));
      }
      downloadBlob(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" }), `robofix_analysis_${ts()}.csv`);
    } finally {
      setExporting(null);
    }
  }, [results]);

  const exportPDF = useCallback(async () => {
    setExporting("pdf");
    try {
      const { default: jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const M = 14;
      const W = pageW - M * 2;
      let y = M;

      const newPageIfNeeded = (need: number) => {
        if (y + need > pageH - 18) { pdf.addPage(); y = M; }
      };

      const drawLine = (x1: number, y1: number, x2: number, y2: number, color: string, w = 0.3) => {
        const [r, g, b] = hexToRgb(color);
        pdf.setDrawColor(r, g, b);
        pdf.setLineWidth(w);
        pdf.line(x1, y1, x2, y2);
      };

      // ── Header ──
      const [hr, hg, hb] = hexToRgb(COLORS.headerBg);
      pdf.setFillColor(hr, hg, hb);
      pdf.rect(0, 0, pageW, 32, "F");
      const [ar, ag, ab] = hexToRgb(COLORS.accent);
      pdf.setFillColor(ar, ag, ab);
      pdf.rect(0, 31, pageW, 1.5, "F");

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(20);
      pdf.setTextColor(255, 255, 255);
      pdf.text("ROBOFIX", M, 15);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(180, 180, 190);
      pdf.text("Predictive Maintenance & Wear Analysis Report", M, 23);
      pdf.setFontSize(8);
      pdf.text(`Generated: ${new Date().toLocaleString()}`, pageW - M, 23, { align: "right" });

      y = 40;

      // ── Summary cards ──
      const severeN = results.joints.filter((j) => j.wear_status === "severe").length;
      const avgWear = results.joints.reduce((s, j) => s + j.wear_index, 0) / results.joints.length;
      const stats = [
        { label: "Total Joints", value: String(results.joints.length), color: COLORS.text },
        { label: "Average Wear", value: `${(avgWear * 100).toFixed(1)}%`, color: COLORS.text },
        { label: "Critical Joints", value: String(severeN), color: severeN > 0 ? COLORS.severe : COLORS.healthy },
        { label: "Materials Evaluated", value: String(results.recommendations.length), color: COLORS.text },
      ];

      const cardW = (W - 6) / 4;
      stats.forEach((s, i) => {
        const cx = M + i * (cardW + 2);
        pdf.setFillColor(...hexToRgb(COLORS.rowAlt));
        pdf.roundedRect(cx, y, cardW, 18, 2, 2, "F");
        pdf.setDrawColor(...hexToRgb(COLORS.border));
        pdf.setLineWidth(0.2);
        pdf.roundedRect(cx, y, cardW, 18, 2, 2, "S");
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.5);
        pdf.setTextColor(...hexToRgb(COLORS.textMuted));
        pdf.text(s.label, cx + 4, y + 7);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.setTextColor(...hexToRgb(s.color));
        pdf.text(s.value, cx + 4, y + 14.5);
      });
      y += 26;

      // ── Joint Wear Table ──
      sectionTitle(pdf, "Joint Wear Analysis", M, y);
      y += 7;

      const jHeaders = ["Joint", "Wear Index", "Status", "Anomaly Rate", "Signal Energy"];
      const jW = [W * 0.22, W * 0.19, W * 0.19, W * 0.2, W * 0.2];
      drawTableHeader(pdf, jHeaders, jW, M, y, W);
      y += 7;

      const sorted = [...results.joints].sort((a, b) => b.wear_index - a.wear_index);
      sorted.forEach((j, idx) => {
        newPageIfNeeded(7);
        if (idx % 2 === 0) {
          pdf.setFillColor(...hexToRgb(COLORS.rowAlt));
          pdf.rect(M, y - 1, W, 6.5, "F");
        }
        const sc: Record<string, string> = { healthy: COLORS.healthy, moderate: COLORS.moderate, severe: COLORS.severe };
        let cx = M + 2;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8.5);
        pdf.setTextColor(...hexToRgb(COLORS.text));
        pdf.text(j.joint_id.replace("_", " "), cx, y + 4); cx += jW[0];
        pdf.setFont("helvetica", "bold");
        pdf.text(`${(j.wear_index * 100).toFixed(1)}%`, cx, y + 4); cx += jW[1];
        pdf.setTextColor(...hexToRgb(sc[j.wear_status] || COLORS.text));
        pdf.setFont("helvetica", "bold");
        pdf.text(j.wear_status.toUpperCase(), cx, y + 4); cx += jW[2];
        pdf.setTextColor(...hexToRgb(COLORS.text));
        pdf.setFont("helvetica", "normal");
        pdf.text(`${(j.anomaly_rate * 100).toFixed(1)}%`, cx, y + 4); cx += jW[3];
        pdf.text(j.signal_energy.toFixed(1), cx, y + 4);
        y += 6.5;
      });
      drawLine(M, y, M + W, y, COLORS.border, 0.2);
      y += 10;

      // ── Material Recommendations Table ──
      newPageIfNeeded(40);
      sectionTitle(pdf, "Material Recommendations", M, y);
      y += 7;

      const mHeaders = ["Material", "Wear Reduction", "Hardness", "Friction", "Wear Coeff"];
      const mW = [W * 0.26, W * 0.19, W * 0.18, W * 0.18, W * 0.19];
      drawTableHeader(pdf, mHeaders, mW, M, y, W);
      y += 7;

      results.recommendations.forEach((m, idx) => {
        newPageIfNeeded(7);
        if (idx % 2 === 0) {
          pdf.setFillColor(...hexToRgb(COLORS.rowAlt));
          pdf.rect(M, y - 1, W, 6.5, "F");
        }
        let cx = M + 2;
        pdf.setFont("helvetica", idx === 0 ? "bold" : "normal");
        pdf.setFontSize(8.5);
        pdf.setTextColor(...hexToRgb(idx === 0 ? COLORS.accent : COLORS.text));
        pdf.text(m.material_name, cx, y + 4); cx += mW[0];
        pdf.setTextColor(...hexToRgb(COLORS.healthy));
        pdf.setFont("helvetica", "bold");
        pdf.text(`-${m.wear_reduction_pct.toFixed(1)}%`, cx, y + 4); cx += mW[1];
        pdf.setTextColor(...hexToRgb(COLORS.text));
        pdf.setFont("helvetica", "normal");
        pdf.text(`${m.hardness} HV`, cx, y + 4); cx += mW[2];
        pdf.text(String(m.friction_coefficient), cx, y + 4); cx += mW[3];
        pdf.text(m.wear_coefficient.toExponential(2), cx, y + 4);
        y += 6.5;
      });
      drawLine(M, y, M + W, y, COLORS.border, 0.2);
      y += 10;

      // ── Chart 1: Sensor Timeline ──
      newPageIfNeeded(90);
      sectionTitle(pdf, "Chart — Sensor Magnetometer Timeline", M, y);
      y += 4;

      if (results.timeline.magnitude.length > 0) {
        const step = Math.max(1, Math.floor(results.timeline.magnitude.length / 300));
        const magData = results.timeline.magnitude.filter((_, i) => i % step === 0);
        const anomData = results.timeline.anomaly.filter((_, i) => i % step === 0);
        const minV = Math.min(...magData);
        const maxV = Math.max(...magData);

        y = drawChart(pdf, {
          data: [{ values: magData, color: COLORS.chartLines[0], label: "Magnitude" }],
          anomalies: anomData.map((a, i) => (a === -1 ? i : -1)).filter((i) => i >= 0),
          xLabel: "Sample Index",
          yLabel: "Magnitude",
          yMin: minV - (maxV - minV) * 0.1,
          yMax: maxV + (maxV - minV) * 0.1,
          x: M,
          y,
          w: W,
          h: 65,
        });
        y += 8;
      }

      // ── Chart 2: Wear Projection (all joints) ──
      newPageIfNeeded(90);
      sectionTitle(pdf, "Chart — Wear Projection by Joint", M, y);
      y += 4;

      if (results.simulation.length > 0) {
        const times = results.simulation[0].trajectory.map((p) => p.time);
        const series = results.simulation.map((s, i) => ({
          values: s.trajectory.map((p) => p.projected_wear),
          color: COLORS.chartLines[i % COLORS.chartLines.length],
          label: s.joint_id.replace("_", " "),
        }));
        const allVals = series.flatMap((s) => s.values);

        y = drawChart(pdf, {
          data: series,
          xLabel: "Time",
          yLabel: "Wear (%)",
          yMin: 0,
          yMax: Math.max(...allVals, 0.5) * 1.1,
          yPct: true,
          x: M,
          y,
          w: W,
          h: 65,
          xValues: times,
        });
        y += 8;
      }

      // ── Chart 3: Material Comparison ──
      if (results.material_scenarios.length > 0) {
        newPageIfNeeded(90);
        const jid = results.simulation[0]?.joint_id || "";
        sectionTitle(pdf, `Chart — Material Wear Comparison (${jid.replace("_", " ")})`, M, y);
        y += 4;

        const scenarios = results.material_scenarios.filter((ms) => ms.joint_id === jid);
        if (scenarios.length > 0) {
          const times = scenarios[0].trajectory.map((p) => p.time);
          const series = scenarios.map((s, i) => ({
            values: s.trajectory.map((p) => p.projected_wear),
            color: s.material_name === "Current Material" ? COLORS.severe : COLORS.chartLines[(i + 2) % COLORS.chartLines.length],
            label: s.material_name,
          }));
          const allVals = series.flatMap((s) => s.values);

          y = drawChart(pdf, {
            data: series,
            xLabel: "Time",
            yLabel: "Wear (%)",
            yMin: 0,
            yMax: Math.max(...allVals, 0.5) * 1.1,
            yPct: true,
            x: M,
            y,
            w: W,
            h: 65,
            xValues: times,
          });
        }
      }

      // ── Footer on all pages ──
      const n = pdf.getNumberOfPages();
      for (let i = 1; i <= n; i++) {
        pdf.setPage(i);
        drawLine(M, pageH - 14, M + W, pageH - 14, COLORS.borderLight, 0.2);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
        pdf.setTextColor(...hexToRgb(COLORS.textLight));
        pdf.text("ROBOFIX — AI-Powered Predictive Maintenance", M, pageH - 9);
        pdf.text(`Page ${i} of ${n}`, pageW - M, pageH - 9, { align: "right" });
      }

      pdf.save(`robofix_report_${ts()}.pdf`);
    } finally {
      setExporting(null);
    }
  }, [results]);

  return (
    <section className="col-span-12 card p-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[14px] font-semibold text-zinc-200 tracking-tight mb-1">
            Export Analysis
          </h2>
          <p className="text-[12px] text-zinc-500">
            Download a PDF report with tables and chart snapshots, or export raw data as CSV
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportCSV}
            disabled={!!exporting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12.5px] font-medium border border-zinc-700/60 bg-zinc-900/60 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 hover:bg-zinc-800/60 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {exporting === "csv" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            Export CSV
          </button>
          <button
            onClick={exportPDF}
            disabled={!!exporting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12.5px] font-medium bg-gradient-to-r from-lime-600 to-lime-500 text-zinc-950 hover:from-lime-500 hover:to-lime-400 transition-all shadow-lg shadow-lime-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {exporting === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            Export PDF Report
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Helpers ──

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sectionTitle(pdf: any, text: string, x: number, y: number) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(...hexToRgb(COLORS.text));
  pdf.text(text, x, y);
  pdf.setDrawColor(...hexToRgb(COLORS.accent));
  pdf.setLineWidth(0.6);
  pdf.line(x, y + 1.5, x + pdf.getTextWidth(text), y + 1.5);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawTableHeader(pdf: any, headers: string[], widths: number[], x: number, y: number, totalW: number) {
  pdf.setFillColor(...hexToRgb(COLORS.accent));
  pdf.roundedRect(x, y, totalW, 6.5, 1, 1, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(255, 255, 255);
  let cx = x + 2;
  headers.forEach((h, i) => { pdf.text(h, cx, y + 4.5); cx += widths[i]; });
}

interface ChartOpts {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: { values: number[]; color: string; label: string }[];
  anomalies?: number[];
  xLabel: string;
  yLabel: string;
  yMin: number;
  yMax: number;
  yPct?: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  xValues?: number[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawChart(pdf: any, o: ChartOpts): number {
  const pad = { l: 14, r: 4, t: 4, b: 14 };
  const cX = o.x + pad.l;
  const cY = o.y + pad.t;
  const cW = o.w - pad.l - pad.r;
  const cH = o.h - pad.t - pad.b;

  // Background
  pdf.setFillColor(253, 253, 255);
  pdf.roundedRect(o.x, o.y, o.w, o.h, 2, 2, "F");
  pdf.setDrawColor(...hexToRgb(COLORS.border));
  pdf.setLineWidth(0.15);
  pdf.roundedRect(o.x, o.y, o.w, o.h, 2, 2, "S");

  // Grid lines
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const gy = cY + cH - (i / yTicks) * cH;
    pdf.setDrawColor(...hexToRgb("#e0e0e4"));
    pdf.setLineWidth(0.1);
    pdf.line(cX, gy, cX + cW, gy);

    const val = o.yMin + (i / yTicks) * (o.yMax - o.yMin);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(...hexToRgb(COLORS.textMuted));
    const label = o.yPct ? `${(val * 100).toFixed(0)}%` : val.toFixed(1);
    pdf.text(label, cX - 2, gy + 1.5, { align: "right" });
  }

  // X-axis ticks
  const n = o.data[0].values.length;
  const xTicks = Math.min(8, n - 1);
  for (let i = 0; i <= xTicks; i++) {
    const idx = Math.round((i / xTicks) * (n - 1));
    const gx = cX + (idx / (n - 1)) * cW;
    pdf.setDrawColor(...hexToRgb("#e0e0e4"));
    pdf.setLineWidth(0.1);
    pdf.line(gx, cY, gx, cY + cH);

    const xVal = o.xValues ? o.xValues[idx]?.toFixed(1) : String(idx);
    pdf.setFontSize(7);
    pdf.setTextColor(...hexToRgb(COLORS.textMuted));
    pdf.text(xVal ?? "", gx, cY + cH + 4, { align: "center" });
  }

  // Axis borders
  pdf.setDrawColor(...hexToRgb(COLORS.textLight));
  pdf.setLineWidth(0.3);
  pdf.line(cX, cY, cX, cY + cH);
  pdf.line(cX, cY + cH, cX + cW, cY + cH);

  // Axis labels
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...hexToRgb(COLORS.textMuted));
  pdf.text(o.xLabel, cX + cW / 2, cY + cH + 10, { align: "center" });

  pdf.text(o.yLabel, o.x + 2, cY + cH / 2, { angle: 90 });

  // Plot each series
  for (const series of o.data) {
    const [r, g, b] = hexToRgb(series.color);
    pdf.setDrawColor(r, g, b);
    pdf.setLineWidth(0.5);
    for (let i = 1; i < series.values.length; i++) {
      const x1 = cX + ((i - 1) / (n - 1)) * cW;
      const x2 = cX + (i / (n - 1)) * cW;
      const yNorm1 = (series.values[i - 1] - o.yMin) / (o.yMax - o.yMin);
      const yNorm2 = (series.values[i] - o.yMin) / (o.yMax - o.yMin);
      const y1 = cY + cH - Math.max(0, Math.min(1, yNorm1)) * cH;
      const y2 = cY + cH - Math.max(0, Math.min(1, yNorm2)) * cH;
      pdf.line(x1, y1, x2, y2);
    }
  }

  // Anomaly markers
  if (o.anomalies && o.anomalies.length > 0) {
    pdf.setFillColor(...hexToRgb(COLORS.severe));
    for (const idx of o.anomalies) {
      if (idx >= n) continue;
      const ax = cX + (idx / (n - 1)) * cW;
      const val = o.data[0].values[idx];
      if (val === undefined) continue;
      const ayNorm = (val - o.yMin) / (o.yMax - o.yMin);
      const ay = cY + cH - Math.max(0, Math.min(1, ayNorm)) * cH;
      pdf.circle(ax, ay, 0.8, "F");
    }
  }

  // Legend
  const legendY = o.y + o.h + 3;
  let lx = cX;
  pdf.setFontSize(7);
  for (const series of o.data) {
    pdf.setFillColor(...hexToRgb(series.color));
    pdf.rect(lx, legendY - 1.5, 4, 2, "F");
    lx += 5;
    pdf.setTextColor(...hexToRgb(COLORS.text));
    pdf.text(series.label, lx, legendY);
    lx += pdf.getTextWidth(series.label) + 5;
  }
  if (o.anomalies && o.anomalies.length > 0) {
    pdf.setFillColor(...hexToRgb(COLORS.severe));
    pdf.circle(lx + 1, legendY - 0.5, 1, "F");
    lx += 4;
    pdf.setTextColor(...hexToRgb(COLORS.text));
    pdf.text("Anomaly", lx, legendY);
  }

  return legendY + 4;
}
