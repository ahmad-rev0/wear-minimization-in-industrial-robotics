"use client";

import { useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  Grid,
  Html,
  Float,
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

  return (
    <group position={[joint.x, joint.y, joint.z]}>
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

      {/* Main joint sphere */}
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
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

      {/* Tooltip */}
      {(isSelected || hovered) && (
        <Html distanceFactor={4} position={[0, radius + 0.15, 0]} center>
          <div className="px-3 py-2 rounded-lg bg-zinc-900/95 border border-zinc-700 backdrop-blur-sm shadow-xl">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: joint.color }}
              />
              <span className="text-xs font-semibold capitalize text-zinc-100">
                {joint.joint_id.replace("_", " ")}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
              <span className="text-zinc-500">Wear</span>
              <span className="font-mono" style={{ color: joint.color }}>
                {(joint.wear_index * 100).toFixed(1)}%
              </span>
              <span className="text-zinc-500">Status</span>
              <span
                className={`capitalize ${
                  joint.wear_status === "severe"
                    ? "text-red-400"
                    : joint.wear_status === "moderate"
                    ? "text-yellow-400"
                    : "text-green-400"
                }`}
              >
                {joint.wear_status}
              </span>
              <span className="text-zinc-500">Anomaly</span>
              <span className="text-zinc-300 font-mono">
                {(joint.anomaly_rate * 100).toFixed(1)}%
              </span>
              <span className="text-zinc-500">Energy</span>
              <span className="text-zinc-300 font-mono">
                {joint.signal_energy.toFixed(0)}
              </span>
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
  const groupRef = useRef<THREE.Group>(null!);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.06;
    }
  });

  const joints = model.joints;
  const lastJoint = joints[joints.length - 1];

  return (
    <Float speed={0.4} rotationIntensity={0} floatIntensity={0.2}>
      <group ref={groupRef}>
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
            color="#3b82f6"
            emissive="#3b82f6"
            emissiveIntensity={0.3}
          />
        </mesh>
      </group>
    </Float>
  );
}

// ── Main viewer component ───────────────────────────────────

interface Props {
  model: RobotModelData | null;
  selectedJoint: string | null;
  onJointClick: (id: string) => void;
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
      <div className="absolute top-3 left-3 z-10 flex gap-3 text-[10px] text-zinc-400">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" /> Healthy
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-yellow-500" /> Moderate
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Severe
        </span>
      </div>

      {/* Hint */}
      <div className="absolute bottom-3 left-3 z-10 text-[10px] text-zinc-600">
        Click a joint for details. Drag to orbit.
      </div>

      <Canvas
        camera={{ position: [1.8, 1.5, 2.5], fov: 38 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      >
        <color attach="background" args={["#08080c"]} />
        <fog attach="fog" args={["#08080c", 5, 14]} />

        <ambientLight intensity={0.25} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
        <pointLight position={[-3, 2, -3]} intensity={0.5} color="#3b82f6" />
        <pointLight position={[3, 0.5, 2]} intensity={0.2} color="#8b5cf6" />

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
          enablePan={false}
          minDistance={1.5}
          maxDistance={6}
          minPolarAngle={0.2}
          maxPolarAngle={Math.PI / 2}
        />
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}
