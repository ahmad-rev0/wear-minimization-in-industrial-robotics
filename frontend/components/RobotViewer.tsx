"use client";

import React, { useRef, useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  Grid,
  Html,
} from "@react-three/drei";
import * as THREE from "three";
import type { RobotModelData, JointModel } from "@/lib/api";

// ── Joint sphere (clickable, wear-coded, pulses if severe) ──

function JointSphere({
  joint,
  isSelected,
  onClick,
}: {
  joint: JointModel;
  isSelected: boolean;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);

  const isSevere = joint.wear_status === "severe";
  const radius = joint.joint_id === "base" ? 0.12 : 0.09;

  useFrame(({ clock }) => {
    if (!meshRef.current) return;

    // Scale on hover / selection
    const target = isSelected || hovered ? 1.35 : 1.0;
    meshRef.current.scale.lerp(
      new THREE.Vector3(target, target, target),
      0.1
    );

    // Pulse glow for severe joints
    if (glowRef.current && isSevere) {
      const pulse = 0.3 + Math.sin(clock.elapsedTime * 3) * 0.2;
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = pulse;
    }
  });

  const hitRadius = radius * 1.8;

  return (
    <group position={[joint.x, joint.y, joint.z]}>
      {/* Invisible hit zone — much larger than the visible sphere */}
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[hitRadius, 16, 16]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* Outer pulse glow for severe joints */}
      {isSevere && (
        <mesh ref={glowRef}>
          <sphereGeometry args={[radius + 0.04, 16, 16]} />
          <meshBasicMaterial
            color="#ef4444"
            transparent
            opacity={0.3}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Visible joint sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={joint.color}
          emissive={joint.color}
          emissiveIntensity={isSelected ? 0.6 : hovered ? 0.35 : 0.15}
          roughness={0.3}
          metalness={0.7}
        />
      </mesh>

      {/* Selection ring */}
      {isSelected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius + 0.04, radius + 0.07, 32]} />
          <meshBasicMaterial
            color={joint.color}
            transparent
            opacity={0.5}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Tooltip — shown on click only to avoid hover flicker */}
      {isSelected && (
        <Html distanceFactor={4} position={[0, radius + 0.2, 0]} center>
          <div
            className="rounded-xl border backdrop-blur-md shadow-2xl pointer-events-none select-none"
            style={{
              background: "rgba(10, 10, 16, 0.92)",
              borderColor: `${joint.color}30`,
              minWidth: "160px",
              padding: "12px 14px",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-zinc-800/60">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    background: joint.color,
                    boxShadow: `0 0 8px ${joint.color}60, 0 0 0 2px ${joint.color}40`,
                  }}
                />
                <span className="text-[13px] font-semibold capitalize text-zinc-100 tracking-tight">
                  {joint.joint_id.replace("_", " ")}
                </span>
              </div>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                  joint.wear_status === "severe"
                    ? "bg-red-500/15 text-red-400"
                    : joint.wear_status === "moderate"
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-emerald-500/15 text-emerald-400"
                }`}
              >
                {joint.wear_status}
              </span>
            </div>

            {/* Wear bar */}
            <div className="mb-3">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[11px] text-zinc-400 font-medium">Wear Index</span>
                <span className="text-[14px] font-bold font-mono" style={{ color: joint.color }}>
                  {(joint.wear_index * 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-[4px] bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${joint.wear_index * 100}%`,
                    background: `linear-gradient(90deg, ${joint.color}88, ${joint.color})`,
                  }}
                />
              </div>
            </div>

            {/* Stats */}
            <div className="flex gap-4">
              <div>
                <div className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mb-0.5">Anomaly Rate</div>
                <div className="text-[12px] text-zinc-200 font-mono font-medium">
                  {(joint.anomaly_rate * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mb-0.5">Signal Energy</div>
                <div className="text-[12px] text-zinc-200 font-mono font-medium">
                  {joint.signal_energy >= 1000
                    ? `${(joint.signal_energy / 1000).toFixed(1)}k`
                    : joint.signal_energy.toFixed(0)}
                </div>
              </div>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Link between joints (subtle color gradient) ─────────────

function Link({
  from,
  to,
  fromColor,
  toColor,
}: {
  from: [number, number, number];
  to: [number, number, number];
  fromColor: string;
  toColor: string;
}) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const mid = start.clone().add(end).multiplyScalar(0.5);
  const dir = end.clone().sub(start);
  const length = dir.length();

  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );

  // Blend the two joint colors for the link
  const c1 = new THREE.Color(fromColor);
  const c2 = new THREE.Color(toColor);
  const blended = c1.lerp(c2, 0.5);
  blended.lerp(new THREE.Color("#3f3f46"), 0.6);

  return (
    <mesh position={mid} quaternion={quaternion}>
      <cylinderGeometry args={[0.028, 0.028, length, 12]} />
      <meshStandardMaterial
        color={blended}
        roughness={0.5}
        metalness={0.8}
      />
    </mesh>
  );
}

// ── End-effector (small gripper at the tip) ─────────────────

function EndEffector({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Gripper fingers */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * 0.04, 0.08, 0]}
          rotation={[0, 0, side * 0.2]}
        >
          <boxGeometry args={[0.015, 0.1, 0.015]} />
          <meshStandardMaterial color="#52525b" metalness={0.9} roughness={0.2} />
        </mesh>
      ))}
      {/* Gripper mount */}
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 0.03, 12]} />
        <meshStandardMaterial color="#3f3f46" metalness={0.9} roughness={0.2} />
      </mesh>
    </group>
  );
}

// ── Robot arm assembly ──────────────────────────────────────

function RobotArm({
  model,
  selectedJoint,
  onJointClick,
}: {
  model: RobotModelData;
  selectedJoint: string | null;
  onJointClick: (id: string) => void;
}) {
  const joints = model.joints;
  const lastJoint = joints[joints.length - 1];

  return (
    <group>
        {/* Links between consecutive joints */}
        {joints.slice(0, -1).map((j, i) => (
          <Link
            key={`link-${i}`}
            from={[j.x, j.y, j.z]}
            to={[joints[i + 1].x, joints[i + 1].y, joints[i + 1].z]}
            fromColor={j.color}
            toColor={joints[i + 1].color}
          />
        ))}

        {/* Joint spheres */}
        {joints.map((joint) => (
          <JointSphere
            key={joint.joint_id}
            joint={joint}
            isSelected={selectedJoint === joint.joint_id}
            onClick={() => onJointClick(joint.joint_id)}
          />
        ))}

        {/* End effector at the tip */}
        {lastJoint && (
          <EndEffector
            position={[lastJoint.x, lastJoint.y, lastJoint.z]}
          />
        )}

        {/* Base platform */}
        <mesh position={[0, -0.06, 0]}>
          <cylinderGeometry args={[0.22, 0.25, 0.06, 32]} />
          <meshStandardMaterial
            color="#1c1c22"
            metalness={0.95}
            roughness={0.15}
          />
        </mesh>
        {/* Platform rim accent */}
        <mesh position={[0, -0.035, 0]}>
          <torusGeometry args={[0.23, 0.005, 8, 64]} />
          <meshStandardMaterial
            color="#84cc16"
            emissive="#84cc16"
            emissiveIntensity={0.35}
          />
        </mesh>
    </group>
  );
}

// ── Error boundary to recover from Canvas init failures ─────

class ViewerErrorBoundary extends React.Component<
  { children: React.ReactNode; onRetry: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err: Error) {
    console.warn("[RobotViewer] Canvas error caught — will retry:", err.message);
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-zinc-500 text-sm">
          <p>3D renderer failed to initialize</p>
          <button
            onClick={() => {
              this.reset();
              this.props.onRetry();
            }}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors text-[12px] font-medium"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Main viewer component ───────────────────────────────────

interface Props {
  model: RobotModelData | null;
  selectedJoint: string | null;
  onJointClick: (id: string | null) => void;
  onJointOrderChange?: (order: string[]) => void;
}

export function RobotViewer({ model, selectedJoint, onJointClick, onJointOrderChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const [showOrder, setShowOrder] = useState(false);
  const [localOrder, setLocalOrder] = useState<string[]>([]);
  const dragSrcRef = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (model) setLocalOrder(model.joints.map((j) => j.joint_id));
  }, [model]);

  const handleOrderDrop = useCallback(
    (targetIdx: number) => {
      const srcIdx = dragSrcRef.current;
      if (srcIdx === null || srcIdx === targetIdx) {
        setDragOverIdx(null);
        return;
      }
      setLocalOrder((prev) => {
        const copy = [...prev];
        const [moved] = copy.splice(srcIdx, 1);
        copy.splice(targetIdx, 0, moved);
        onJointOrderChange?.(copy);
        return copy;
      });
      setDragOverIdx(null);
      dragSrcRef.current = null;
    },
    [onJointOrderChange],
  );

  const { centroid, camPos } = useMemo(() => {
    if (!model || model.joints.length === 0)
      return { centroid: [0, 0.9, 0.25] as [number, number, number], camPos: [2.2, 1.8, 3.0] as [number, number, number] };
    const js = model.joints;
    const cx = js.reduce((s, j) => s + j.x, 0) / js.length;
    const cy = js.reduce((s, j) => s + j.y, 0) / js.length;
    const cz = js.reduce((s, j) => s + j.z, 0) / js.length;
    const maxY = Math.max(...js.map((j) => j.y));
    const spread = Math.max(maxY, 2.0);
    return {
      centroid: [cx, cy, cz] as [number, number, number],
      camPos: [cx + spread * 0.9, cy + spread * 0.4, cz + spread * 1.2] as [number, number, number],
    };
  }, [model]);

  // Defer Canvas mount until the container has non-zero dimensions.
  // This avoids WebGL context failures when layout hasn't settled yet.
  useEffect(() => {
    if (!model) return;
    const el = containerRef.current;
    if (!el) return;

    const check = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setReady(true);
      }
    };

    // Check on next frame (layout has committed by then)
    const raf = requestAnimationFrame(() => {
      check();
      // Fallback: if still not ready, use ResizeObserver
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      if (width > 0 && height > 0) return;
      const ro = new ResizeObserver(() => {
        check();
        ro.disconnect();
      });
      ro.observe(containerRef.current);
    });

    return () => cancelAnimationFrame(raf);
  }, [model, retryKey]);

  const handleRetry = useCallback(() => {
    setReady(false);
    setRetryKey((k) => k + 1);
  }, []);

  if (!model) {
    return (
      <div className="w-full h-full flex items-center justify-center text-zinc-600">
        No model data
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {/* Legend overlay */}
      <div className="absolute top-3 left-3 z-10 flex gap-4 text-[12px] text-zinc-400 glass px-4 py-2 rounded-lg border border-zinc-800/40">
        <span className="flex items-center gap-2 font-medium">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Healthy
        </span>
        <span className="flex items-center gap-2 font-medium">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Moderate
        </span>
        <span className="flex items-center gap-2 font-medium">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" /> Severe
        </span>
      </div>

      {/* Hint */}
      <div className="absolute bottom-3 left-3 z-10 text-[11.5px] text-zinc-500 font-medium tracking-wide">
        Select joint to inspect &middot; Drag to orbit &middot; Right-click to pan
      </div>

      {/* Joint order toggle */}
      <button
        onClick={() => setShowOrder((v) => !v)}
        className="absolute top-3 right-3 z-10 px-2.5 py-1.5 rounded-lg text-[11px] font-medium glass border border-zinc-800/40 text-zinc-400 hover:text-zinc-200 transition-all"
      >
        {showOrder ? "Hide Order" : "Reorder"}
      </button>

      {/* Collapsible joint order overlay */}
      {showOrder && localOrder.length > 0 && (
        <div className="absolute top-12 right-3 z-10 w-[130px] rounded-xl border border-zinc-800/60 glass p-2 flex flex-col gap-1 max-h-[280px] overflow-y-auto">
          <span className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider px-1 mb-0.5">
            Link Order
          </span>
          {localOrder.map((jid, i) => (
            <div
              key={jid}
              draggable
              onDragStart={() => { dragSrcRef.current = i; }}
              onDragOver={(e) => { e.preventDefault(); setDragOverIdx(i); }}
              onDrop={() => handleOrderDrop(i)}
              onDragEnd={() => setDragOverIdx(null)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono cursor-grab active:cursor-grabbing transition-all select-none ${
                dragOverIdx === i
                  ? "bg-lime-500/15 border border-lime-500/30"
                  : "bg-zinc-800/60 border border-transparent hover:bg-zinc-700/60"
              }`}
            >
              <span className="text-zinc-600 text-[9px] w-3">{i + 1}</span>
              <span className="text-zinc-300 truncate">{jid}</span>
            </div>
          ))}
        </div>
      )}

      {!ready ? (
        <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">
          Initializing 3D renderer...
        </div>
      ) : (
        <ViewerErrorBoundary onRetry={handleRetry} key={retryKey}>
          <Canvas
            camera={{ position: camPos, fov: 38 }}
            gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
            onPointerMissed={() => onJointClick(null)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          >
            <color attach="background" args={["#08080c"]} />
            <fog attach="fog" args={["#08080c", 6, 16]} />

            <ambientLight intensity={0.25} />
            <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
            <pointLight position={[-3, 2, -3]} intensity={0.5} color="#84cc16" />
            <pointLight position={[3, 0.5, 2]} intensity={0.2} color="#a3e635" />

            <RobotArm
              model={model}
              selectedJoint={selectedJoint}
              onJointClick={onJointClick}
            />

            <Grid
              args={[10, 10]}
              position={[0, -0.09, 0]}
              cellSize={0.3}
              cellColor="#141418"
              sectionColor="#1e1e24"
              fadeDistance={8}
              infiniteGrid
            />

            <OrbitControls
              enablePan
              enableDamping
              dampingFactor={0.25}
              target={centroid}
              minDistance={1.2}
              maxDistance={12}
              minPolarAngle={0.1}
              maxPolarAngle={Math.PI * 0.85}
              panSpeed={0.6}
              rotateSpeed={0.8}
            />
            <Suspense fallback={null}>
              <Environment preset="city" />
            </Suspense>
          </Canvas>
        </ViewerErrorBoundary>
      )}
    </div>
  );
}
