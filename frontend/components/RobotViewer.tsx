"use client";

import { useRef, useState } from "react";
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

// ── Joint sphere (clickable, color-coded by wear) ───────────

function JointSphere({
  joint,
  isSelected,
  onClick,
}: {
  joint: JointModel;
  isSelected: boolean;
  onClick: () => void;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);

  useFrame(() => {
    if (!ref.current) return;
    const target = isSelected || hovered ? 1.3 : 1.0;
    ref.current.scale.lerp(new THREE.Vector3(target, target, target), 0.1);
  });

  const radius = joint.joint_id === "base" ? 0.12 : 0.09;

  return (
    <group position={[joint.x, joint.y, joint.z]}>
      <mesh
        ref={ref}
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

      {/* Glow ring for selected */}
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

      {/* Label */}
      {(isSelected || hovered) && (
        <Html distanceFactor={4} position={[0, radius + 0.12, 0]} center>
          <div className="px-2 py-1 rounded-md bg-zinc-900/95 border border-zinc-700 text-xs whitespace-nowrap backdrop-blur-sm">
            <span className="font-semibold capitalize text-zinc-100">
              {joint.joint_id.replace("_", " ")}
            </span>
            <span className="ml-2 font-mono" style={{ color: joint.color }}>
              {(joint.wear_index * 100).toFixed(1)}%
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Link between joints ─────────────────────────────────────

function Link({
  from,
  to,
}: {
  from: [number, number, number];
  to: [number, number, number];
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

  return (
    <mesh position={mid} quaternion={quaternion}>
      <cylinderGeometry args={[0.03, 0.03, length, 12]} />
      <meshStandardMaterial
        color="#3f3f46"
        roughness={0.5}
        metalness={0.8}
      />
    </mesh>
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
      groupRef.current.rotation.y += delta * 0.05;
    }
  });

  const joints = model.joints;

  return (
    <Float speed={0.5} rotationIntensity={0} floatIntensity={0.3}>
      <group ref={groupRef}>
        {/* Links between consecutive joints */}
        {joints.slice(0, -1).map((j, i) => (
          <Link
            key={`link-${i}`}
            from={[j.x, j.y, j.z]}
            to={[joints[i + 1].x, joints[i + 1].y, joints[i + 1].z]}
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

        {/* Base platform */}
        <mesh position={[0, -0.06, 0]}>
          <cylinderGeometry args={[0.2, 0.22, 0.06, 32]} />
          <meshStandardMaterial color="#27272a" metalness={0.9} roughness={0.2} />
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
      {/* Legend */}
      <div className="absolute top-3 left-3 z-10 flex gap-3 text-[10px] text-zinc-400">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" /> Healthy
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-yellow-500" /> Moderate
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" /> Severe
        </span>
      </div>

      <Canvas
        camera={{ position: [1.5, 1.5, 2.5], fov: 40 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#0a0a0f"]} />
        <fog attach="fog" args={["#0a0a0f", 5, 15]} />

        <ambientLight intensity={0.3} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <pointLight position={[-3, 2, -3]} intensity={0.4} color="#3b82f6" />

        <RobotArm
          model={model}
          selectedJoint={selectedJoint}
          onJointClick={onJointClick}
        />

        <Grid
          args={[10, 10]}
          position={[0, -0.09, 0]}
          cellSize={0.3}
          cellColor="#1e1e24"
          sectionColor="#27272a"
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
