"use client";

import { useRef, useState } from "react";
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
                <span className="text-[12px] font-semibold capitalize text-zinc-100 tracking-tight">
                  {joint.joint_id.replace("_", " ")}
                </span>
              </div>
              <span
                className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
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
                <span className="text-[10px] text-zinc-500 font-medium">Wear Index</span>
                <span className="text-[13px] font-bold font-mono" style={{ color: joint.color }}>
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
                <div className="text-[9px] text-zinc-600 font-medium uppercase tracking-wider mb-0.5">Anomaly</div>
                <div className="text-[11px] text-zinc-200 font-mono font-medium">
                  {(joint.anomaly_rate * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-[9px] text-zinc-600 font-medium uppercase tracking-wider mb-0.5">Energy</div>
                <div className="text-[11px] text-zinc-200 font-mono font-medium">
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

// ── Main viewer component ───────────────────────────────────

interface Props {
  model: RobotModelData | null;
  selectedJoint: string | null;
  onJointClick: (id: string | null) => void;
}

export function RobotViewer({ model, selectedJoint, onJointClick }: Props) {
  if (!model) {
    return (
      <div className="w-full h-full flex items-center justify-center text-zinc-600">
        No model data
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      {/* Legend overlay */}
      <div className="absolute top-3 left-3 z-10 flex gap-3 text-[10px] text-zinc-500 glass px-3 py-1.5 rounded-lg border border-zinc-800/40">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Healthy
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Moderate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Severe
        </span>
      </div>

      {/* Hint */}
      <div className="absolute bottom-3 left-3 z-10 text-[9px] text-zinc-700 font-medium tracking-wide">
        Click joint for details &middot; Drag to orbit &middot; Right-drag to pan
      </div>

      <Canvas
        camera={{ position: [2.2, 1.8, 3.0], fov: 38 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        onPointerMissed={() => onJointClick(null)}
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
          target={[0, 0.9, 0.25]}
          minDistance={1.2}
          maxDistance={8}
          minPolarAngle={0.1}
          maxPolarAngle={Math.PI * 0.85}
          panSpeed={0.6}
          rotateSpeed={0.8}
        />
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}
