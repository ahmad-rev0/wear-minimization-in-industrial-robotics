"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ScanSearch,
  RotateCcw,
  Save,
  Info,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Move,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface JointPosition2D {
  joint_id: string;
  nx: number;
  ny: number;
}

interface Props {
  imageUrl: string | null;
  initialLayout: JointPosition2D[] | null;
  /** Actual joint IDs from the latest analysis (determines count) */
  jointIds: string[] | null;
  onLayoutSaved?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const JOINT_RADIUS = 12;
const JOINT_HIT_RADIUS = 20;
const LINE_COLOR = "rgba(163,230,53,0.45)";
const JOINT_COLOR = "#84cc16";
const JOINT_SELECTED = "#facc15";
const GRID_COLOR = "rgba(100,100,100,0.15)";
const AXIS_COLOR = "rgba(163,230,53,0.25)";
const LABEL_COLOR = "#e4e4e7";
const GHOST_COLOR = "rgba(255,255,255,0.10)";

const API_BASE = "/api";

const MARGIN = { left: 40, bottom: 28, top: 12, right: 12 };

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildLayout(ids: string[]): JointPosition2D[] {
  const n = ids.length;
  return ids.map((id, i) => ({
    joint_id: id,
    nx: 0.5,
    ny: n <= 1 ? 0.5 : i / (n - 1),
  }));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function JointEditor({
  imageUrl,
  initialLayout,
  jointIds,
  onLayoutSaved,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const effectiveIds = jointIds && jointIds.length > 0
    ? jointIds
    : ["joint_0", "joint_1", "joint_2", "joint_3", "joint_4", "joint_5"];

  const [joints, setJoints] = useState<JointPosition2D[]>(
    () => initialLayout && initialLayout.length > 0
      ? initialLayout
      : buildLayout(effectiveIds)
  );
  const [selectedJoint, setSelectedJoint] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOffsetStart = useRef({ x: 0, y: 0 });

  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });

  const plotW = canvasSize.w - MARGIN.left - MARGIN.right;
  const plotH = canvasSize.h - MARGIN.top - MARGIN.bottom;

  // Sync joints when analysis joint IDs change
  useEffect(() => {
    if (!jointIds || jointIds.length === 0) return;
    setJoints((prev) => {
      // Preserve existing positions for IDs that match, create new for others
      const lookup = new Map(prev.map((p) => [p.joint_id, p]));
      return jointIds.map((id, i) => {
        const existing = lookup.get(id);
        if (existing) return existing;
        return { joint_id: id, nx: 0.5, ny: jointIds.length <= 1 ? 0.5 : i / (jointIds.length - 1) };
      });
    });
  }, [jointIds]);

  // Load image
  useEffect(() => {
    if (!imageUrl) { setImg(null); return; }
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.src = imageUrl;
    el.onload = () => setImg(el);
    el.onerror = () => setImg(null);
  }, [imageUrl]);

  // Sync initial layout from server
  useEffect(() => {
    if (initialLayout && initialLayout.length > 0) {
      setJoints(initialLayout);
    }
  }, [initialLayout]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setCanvasSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── Coordinate helpers ────────────────────────────────── */

  const normToCanvas = useCallback(
    (nx: number, ny: number): [number, number] => {
      const x = MARGIN.left + (nx * plotW * zoom) + panOffset.x;
      const y = MARGIN.top + ((1 - ny) * plotH * zoom) + panOffset.y;
      return [x, y];
    },
    [plotW, plotH, zoom, panOffset]
  );

  const canvasToNorm = useCallback(
    (cx: number, cy: number): [number, number] => {
      const nx = (cx - MARGIN.left - panOffset.x) / (plotW * zoom);
      const ny = 1 - (cy - MARGIN.top - panOffset.y) / (plotH * zoom);
      return [
        Math.max(0, Math.min(1, nx)),
        Math.max(0, Math.min(1, ny)),
      ];
    },
    [plotW, plotH, zoom, panOffset]
  );

  /* ── Ghost joints (default layout for reference) ───────── */

  const ghostJoints = buildLayout(effectiveIds);

  /* ── Draw ──────────────────────────────────────────────── */

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    cvs.width = canvasSize.w;
    cvs.height = canvasSize.h;

    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, cvs.width, cvs.height);

    ctx.save();
    ctx.beginPath();
    ctx.rect(MARGIN.left, MARGIN.top, plotW, plotH);
    ctx.clip();

    if (img) {
      const iw = img.width;
      const ih = img.height;
      const scale = Math.min((plotW * zoom) / iw, (plotH * zoom) / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = MARGIN.left + (plotW * zoom - dw) / 2 + panOffset.x;
      const dy = MARGIN.top + (plotH * zoom - dh) / 2 + panOffset.y;
      ctx.globalAlpha = 0.75;
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      const step = 40 * zoom;
      const xStart = MARGIN.left + (panOffset.x % step);
      for (let x = xStart; x < MARGIN.left + plotW; x += step) {
        if (x < MARGIN.left) continue;
        ctx.beginPath(); ctx.moveTo(x, MARGIN.top); ctx.lineTo(x, MARGIN.top + plotH); ctx.stroke();
      }
      const yStart = MARGIN.top + (panOffset.y % step);
      for (let y = yStart; y < MARGIN.top + plotH; y += step) {
        if (y < MARGIN.top) continue;
        ctx.beginPath(); ctx.moveTo(MARGIN.left, y); ctx.lineTo(MARGIN.left + plotW, y); ctx.stroke();
      }
    }

    // Ghost joints
    for (let i = 0; i < ghostJoints.length; i++) {
      const g = ghostJoints[i];
      const [gx, gy] = normToCanvas(g.nx, g.ny);
      if (i > 0) {
        const [px, py] = normToCanvas(ghostJoints[i - 1].nx, ghostJoints[i - 1].ny);
        ctx.strokeStyle = GHOST_COLOR;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(gx, gy); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.beginPath(); ctx.arc(gx, gy, 5, 0, Math.PI * 2); ctx.fillStyle = GHOST_COLOR; ctx.fill();
    }

    // Link lines (order index in list = link chain)
    for (let i = 1; i < joints.length; i++) {
      const [x1, y1] = normToCanvas(joints[i - 1].nx, joints[i - 1].ny);
      const [x2, y2] = normToCanvas(joints[i].nx, joints[i].ny);
      ctx.strokeStyle = LINE_COLOR;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }

    // Joint markers
    for (let i = 0; i < joints.length; i++) {
      const j = joints[i];
      const [jx, jy] = normToCanvas(j.nx, j.ny);
      const isActive = dragging === i;
      const isSel = selectedJoint === i;

      // Glow
      ctx.beginPath();
      ctx.arc(jx, jy, JOINT_RADIUS + 5, 0, Math.PI * 2);
      ctx.fillStyle = isActive || isSel ? "rgba(250,204,21,0.20)" : "rgba(132,204,22,0.12)";
      ctx.fill();

      // Circle
      ctx.beginPath();
      ctx.arc(jx, jy, JOINT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isActive || isSel ? JOINT_SELECTED : JOINT_COLOR;
      ctx.fill();
      ctx.strokeStyle = "#27272a";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Order number inside circle
      ctx.fillStyle = "#18181b";
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), jx, jy);

      // Label above
      ctx.fillStyle = LABEL_COLOR;
      ctx.font = "bold 9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(j.joint_id, jx, jy - JOINT_RADIUS - 6);
    }

    ctx.restore();

    // ── Axes ──────────────────────────────────────────────
    ctx.strokeStyle = AXIS_COLOR;
    ctx.lineWidth = 1.5;

    ctx.beginPath(); ctx.moveTo(MARGIN.left, MARGIN.top); ctx.lineTo(MARGIN.left, MARGIN.top + plotH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(MARGIN.left, MARGIN.top + plotH); ctx.lineTo(MARGIN.left + plotW, MARGIN.top + plotH); ctx.stroke();

    ctx.fillStyle = "rgba(161,161,170,0.6)";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const val = i / yTicks;
      const py = MARGIN.top + (1 - val) * plotH;
      ctx.fillText(val.toFixed(1), MARGIN.left - 6, py);
      ctx.beginPath(); ctx.moveTo(MARGIN.left - 3, py); ctx.lineTo(MARGIN.left, py); ctx.stroke();
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const xTicks = 5;
    for (let i = 0; i <= xTicks; i++) {
      const val = i / xTicks;
      const px = MARGIN.left + val * plotW;
      ctx.fillText(val.toFixed(1), px, MARGIN.top + plotH + 4);
      ctx.beginPath(); ctx.moveTo(px, MARGIN.top + plotH); ctx.lineTo(px, MARGIN.top + plotH + 3); ctx.stroke();
    }

    ctx.fillStyle = "rgba(161,161,170,0.45)";
    ctx.font = "bold 9px ui-sans-serif, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("Depth (nx)", MARGIN.left + plotW / 2, canvasSize.h - 4);

    ctx.save();
    ctx.translate(10, MARGIN.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = "top";
    ctx.fillText("Height (ny)", 0, 0);
    ctx.restore();
  }, [joints, ghostJoints, img, canvasSize, zoom, panOffset, dragging, selectedJoint, normToCanvas, plotW, plotH]);

  /* ── Interaction handlers ──────────────────────────────── */

  const getCanvasXY = (e: ReactMouseEvent) => {
    const cvs = canvasRef.current;
    if (!cvs) return { cx: 0, cy: 0 };
    const rect = cvs.getBoundingClientRect();
    return { cx: e.clientX - rect.left, cy: e.clientY - rect.top };
  };

  const handleMouseDown = (e: ReactMouseEvent) => {
    const { cx, cy } = getCanvasXY(e);

    if (e.button === 0 && !e.shiftKey) {
      for (let i = joints.length - 1; i >= 0; i--) {
        const [jx, jy] = normToCanvas(joints[i].nx, joints[i].ny);
        if (Math.hypot(cx - jx, cy - jy) < JOINT_HIT_RADIUS) {
          setDragging(i);
          setSelectedJoint(i);
          return;
        }
      }
      setSelectedJoint(null);
    }

    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey)) {
      e.preventDefault();
      setPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY };
      panOffsetStart.current = { ...panOffset };
    }
  };

  const handleMouseMove = (e: ReactMouseEvent) => {
    if (panning) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPanOffset({ x: panOffsetStart.current.x + dx, y: panOffsetStart.current.y + dy });
      return;
    }
    if (dragging === null) return;
    const { cx, cy } = getCanvasXY(e);
    const [nx, ny] = canvasToNorm(cx, cy);
    setJoints((prev) => {
      const copy = [...prev];
      copy[dragging] = { ...copy[dragging], nx, ny };
      return copy;
    });
    setSaved(false);
  };

  const handleMouseUp = () => { setDragging(null); setPanning(false); };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.5, Math.min(4, z - e.deltaY * 0.001)));
  };

  const handleContextMenu = (e: React.MouseEvent) => e.preventDefault();

  /* ── Reorder ───────────────────────────────────────────── */

  const moveJoint = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= joints.length) return;
    setJoints((prev) => {
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
    setSelectedJoint(newIdx);
    setSaved(false);
  };

  /* ── Actions ───────────────────────────────────────────── */

  const animateToLayout = useCallback(
    (target: JointPosition2D[]) => {
      const start = [...joints];
      const steps = 20;
      let frame = 0;
      const tick = () => {
        frame++;
        const t = frame / steps;
        const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        setJoints(
          target.map((tgt, i) => {
            const src = start[i] ?? tgt;
            return {
              joint_id: tgt.joint_id,
              nx: src.nx + (tgt.nx - src.nx) * ease,
              ny: src.ny + (tgt.ny - src.ny) * ease,
            };
          })
        );
        if (frame < steps) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    [joints]
  );

  const handleAutoDetect = async () => {
    setDetecting(true);
    try {
      if (imageUrl) {
        const res = await fetch(
          `${API_BASE}/detect_joints?joint_count=${joints.length}`,
          { method: "POST" }
        );
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        // Preserve real joint IDs from analysis, use detected positions
        const detected: JointPosition2D[] = (data.joints as JointPosition2D[]).map(
          (d, i) => ({ ...d, joint_id: joints[i]?.joint_id ?? d.joint_id })
        );
        animateToLayout(detected);
      } else {
        const n = joints.length;
        const arc: JointPosition2D[] = [];
        for (let i = 0; i < n; i++) {
          const t = n <= 1 ? 0.5 : i / (n - 1);
          const angle = (t * Math.PI * 0.65) - Math.PI * 0.1;
          arc.push({
            joint_id: joints[i]?.joint_id ?? `joint_${i}`,
            nx: 0.5 + Math.sin(angle) * 0.3,
            ny: t,
          });
        }
        animateToLayout(arc);
      }
      setSaved(false);
    } catch (err) {
      console.error("Auto-detect failed:", err);
    } finally {
      setDetecting(false);
    }
  };

  const handleReset = () => {
    animateToLayout(buildLayout(joints.map((j) => j.joint_id)));
    setPanOffset({ x: 0, y: 0 });
    setZoom(1);
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/joint_layout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(joints),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
      onLayoutSaved?.();
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleZoomIn = () => setZoom((z) => Math.min(4, z + 0.25));
  const handleZoomOut = () => setZoom((z) => Math.max(0.5, z - 0.25));
  const handleResetView = () => { setPanOffset({ x: 0, y: 0 }); setZoom(1); };

  return (
    <div className="flex flex-col h-full gap-3 animate-fade-in">
      {/* Info banner */}
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-zinc-900/70 border border-zinc-800/60">
        <Info className="w-4 h-4 text-lime-400 mt-0.5 flex-shrink-0" />
        <p className="text-[12.5px] text-zinc-400 leading-relaxed">
          Drag markers to reposition joints. Use the{" "}
          <span className="text-zinc-200 font-medium">order panel</span> on the
          right to swap joint sequence.{" "}
          <span className="text-zinc-200 font-medium">Shift+drag</span> or{" "}
          <span className="text-zinc-200 font-medium">middle-click</span> to
          pan. Scroll to zoom. Click{" "}
          <span className="text-zinc-200 font-medium">Save Layout</span> to
          push changes to the 3D viewer.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleAutoDetect}
          disabled={detecting}
          className="text-[12px] px-3 py-1.5 rounded-lg flex items-center gap-1.5 bg-gradient-to-r from-lime-600 to-lime-400 text-zinc-900 font-semibold hover:from-lime-500 hover:to-lime-300 shadow-sm shadow-lime-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ScanSearch className={`w-3.5 h-3.5 ${detecting ? "animate-pulse" : ""}`} />
          {detecting ? "Detecting..." : imageUrl ? "Auto-Detect Joints" : "Auto-Arrange Arc"}
        </button>

        <button
          onClick={handleReset}
          className="text-[12px] px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-all flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          className="text-[12px] px-3 py-1.5 rounded-lg border border-lime-500/30 text-lime-400 hover:bg-lime-500/10 transition-all flex items-center gap-1.5 disabled:opacity-40"
        >
          <Save className={`w-3.5 h-3.5 ${saving ? "animate-pulse" : ""}`} />
          {saving ? "Saving..." : "Save Layout"}
        </button>

        {saved && (
          <span className="text-[11px] text-emerald-400 ml-1 animate-fade-in">
            Saved — 3D viewer updated
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={handleResetView} className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-all" title="Reset pan & zoom">
            <Move className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleZoomOut} className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-all">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] text-zinc-600 w-10 text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={handleZoomIn} className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-all">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main content: canvas + order panel */}
      <div className="flex-1 min-h-0 flex gap-3">
        {/* Canvas */}
        <div
          ref={containerRef}
          className="flex-1 min-w-0 rounded-xl overflow-hidden border border-zinc-800/60"
          style={{ cursor: panning ? "grabbing" : "crosshair" }}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full block"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onContextMenu={handleContextMenu}
          />
        </div>

        {/* Joint order panel */}
        <div className="w-[180px] flex-shrink-0 rounded-xl border border-zinc-800/60 bg-zinc-900/50 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-800/60">
            <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">
              Joint Order
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-0.5">
            {joints.map((j, i) => (
              <div
                key={j.joint_id}
                onClick={() => setSelectedJoint(i)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-[11px] ${
                  selectedJoint === i
                    ? "bg-lime-500/15 text-lime-300 border border-lime-500/20"
                    : "text-zinc-400 hover:bg-zinc-800/60 border border-transparent"
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-300 flex-shrink-0">
                  {i + 1}
                </span>
                <span className="flex-1 truncate font-mono">{j.joint_id}</span>
                <div className="flex flex-col gap-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); moveJoint(i, -1); }}
                    disabled={i === 0}
                    className="w-4 h-4 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    title="Move up (earlier in chain)"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); moveJoint(i, 1); }}
                    disabled={i === joints.length - 1}
                    className="w-4 h-4 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    title="Move down (later in chain)"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-zinc-800/60 text-[10px] text-zinc-600">
            {joints.length} joints &middot; drag or use arrows
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-4 text-[11px] text-zinc-600 px-1">
        <span className="flex items-center gap-1">
          <Crosshair className="w-3 h-3" />
          {joints.length} joints
        </span>
        <span>{imageUrl ? "Image loaded" : "No image — grid mode"}</span>
        <span className="text-zinc-700">Shift+drag to pan</span>
        <span className="ml-auto tabular-nums">{canvasSize.w}x{canvasSize.h}</span>
      </div>
    </div>
  );
}
