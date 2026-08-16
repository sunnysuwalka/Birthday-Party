// ============================================================
// src/App.jsx
// ============================================================

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
} from "react";

import {
  Canvas,
  useFrame,
} from "@react-three/fiber";

import {
  OrbitControls,
  Text,
  Html,
} from "@react-three/drei";

import { io } from "socket.io-client";

import * as THREE from "three";

import Login from "./Login";

// ============================================================
// CONFIG
// ============================================================

const SPEED = 5;
const REMOTE_SMOOTHING = 12;
const PLAYER_RADIUS = 0.42;
const WORLD_LIMIT = 38;

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

// ============================================================
// COLORS
// ============================================================

const COLORS = {
  grass: "#5f8f45", grassLight: "#79a85b", grassDark: "#416d35",
  path: "#c9b79c", pathEdge: "#aa987f",
  building: "#e8e0d3", buildingDark: "#b9aa96", concrete: "#c8c2b7",
  wood: "#73523b", woodDark: "#4b3527",
  glass: "#79b9c9", glassDark: "#315f6c",
  pool: "#35b8d2", poolDeep: "#168ba9",
  white: "#f7f5ef", black: "#1d211d",
  palm: "#286b38", leaf: "#3e8248", trunk: "#8a633e",
  flower: "#e66d7a", flower2: "#f0b94b", metal: "#4a4d4a",
};

// ============================================================
// COLLISION DATA
// ============================================================

const OBSTACLES = [
  { position: [0, 1.6, -18], size: [18, 3.2, 7] }, // Reception
  { position: [0, 1, -13.5], size: [5, 2, 3] },    // Reception projection
  { position: [-18, 1.5, -5], size: [9, 3, 7] },   // Villa 1
  { position: [18, 1.5, -5], size: [9, 3, 7] },    // Villa 2
  { position: [-18, 1.5, 10], size: [9, 3, 7] },   // Villa 3
  { position: [18, 1.5, 10], size: [9, 3, 7] },    // Villa 4
  { position: [0, 1.5, 23], size: [15, 3, 7] },    // Restaurant

  // PARTY HALL WALLS (Center is [-26, 0, 5])
  { position: [-26, 1.5, -4], size: [18, 3, 1] },     // North wall
  { position: [-26, 1.5, 14], size: [18, 3, 1] },     // South wall
  { position: [-34.5, 1.5, 5], size: [1, 3, 19] },    // West wall (Back)
  { position: [-17.5, 1.5, -0.5], size: [1, 3, 8] },  // East wall (Entrance side north)
  { position: [-17.5, 1.5, 10.5], size: [1, 3, 8] },  // East wall (Entrance side south)
];

function getObstacleBox(obstacle) {
  const [x, y, z] = obstacle.position;
  const [width, height, depth] = obstacle.size;
  return new THREE.Box3(
    new THREE.Vector3(x - width / 2, y - height / 2, z - depth / 2),
    new THREE.Vector3(x + width / 2, y + height / 2, z + depth / 2)
  );
}

function collidesWithWorld(position) {
  const playerBox = new THREE.Box3(
    new THREE.Vector3(position.x - PLAYER_RADIUS, 0, position.z - PLAYER_RADIUS),
    new THREE.Vector3(position.x + PLAYER_RADIUS, 2, position.z + PLAYER_RADIUS)
  );
  for (const obstacle of OBSTACLES) {
    if (playerBox.intersectsBox(getObstacleBox(obstacle))) return true;
  }
  return false;
}

function isOutsideWorld(position) {
  return (
    position.x - PLAYER_RADIUS < -WORLD_LIMIT || position.x + PLAYER_RADIUS > WORLD_LIMIT ||
    position.z - PLAYER_RADIUS < -WORLD_LIMIT || position.z + PLAYER_RADIUS > WORLD_LIMIT
  );
}

function collidesWithOtherPlayer(position, otherPlayers, ignoreId = null) {
  for (const player of otherPlayers) {
    if (!player?.position || player.id === ignoreId) continue;
    const dx = position.x - player.position[0];
    const dz = position.z - player.position[2];
    if (dx * dx + dz * dz < (PLAYER_RADIUS * 1.8) ** 2) return true;
  }
  return false;
}

// ============================================================
// ENVIRONMENT COMPONENTS
// ============================================================

function Terrain() {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(80, 80, 32, 32);
    const position = geo.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      position.setZ(i, Math.sin(x * 0.13) * 0.12 + Math.cos(y * 0.17) * 0.1 + Math.sin((x + y) * 0.08) * 0.08);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <>
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, 8]} receiveShadow>
        <meshStandardMaterial color={COLORS.grass} roughness={1} />
      </mesh>
      <mesh position={[0, -0.25, 8]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[180, 180]} />
        <meshStandardMaterial color="#426b39" roughness={1} />
      </mesh>
    </>
  );
}

function Path({ position, rotation = 0, width = 4, length = 20 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, -0.04, 0]} receiveShadow>
        <boxGeometry args={[width + 0.25, 0.08, length + 0.25]} />
        <meshStandardMaterial color={COLORS.pathEdge} />
      </mesh>
      <mesh position={[0, 0.01, 0]} receiveShadow>
        <boxGeometry args={[width, 0.1, length]} />
        <meshStandardMaterial color={COLORS.path} roughness={0.95} />
      </mesh>
    </group>
  );
}

function Stone({ position, scale = 1 }) {
  return (
    <mesh position={position} scale={scale} castShadow>
      <icosahedronGeometry args={[0.35, 1]} />
      <meshStandardMaterial color="#8d8b80" roughness={1} />
    </mesh>
  );
}

function PalmTree({ position, scale = 1, rotation = 0 }) {
  const leaves = Array.from({ length: 7 }).map((_, i) => {
    const angle = (i / 7) * Math.PI * 2;
    return (
      <mesh key={i} position={[Math.cos(angle) * 0.85, 4.4, Math.sin(angle) * 0.85]} rotation={[0.35, -angle, -0.18]} castShadow>
        <boxGeometry args={[0.28, 2.1, 0.08]} />
        <meshStandardMaterial color={COLORS.leaf} />
      </mesh>
    );
  });
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <mesh position={[0, 2, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.35, 4.2, 8]} />
        <meshStandardMaterial color={COLORS.trunk} roughness={1} />
      </mesh>
      {leaves}
      <mesh position={[0, 4.4, 0]} castShadow>
        <sphereGeometry args={[0.45, 8, 8]} />
        <meshStandardMaterial color={COLORS.leaf} />
      </mesh>
    </group>
  );
}

function Bush({ position, scale = 1, color = COLORS.leaf }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[-0.35, 0.45, 0]} castShadow><sphereGeometry args={[0.55, 10, 10]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0.35, 0.5, 0.05]} castShadow><sphereGeometry args={[0.65, 10, 10]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0, 0.7, -0.3]} castShadow><sphereGeometry args={[0.55, 10, 10]} /><meshStandardMaterial color={color} /></mesh>
    </group>
  );
}

function FlowerBed({ position }) {
  const flowers = Array.from({ length: 12 }).map((_, i) => (
    <mesh key={i} position={[(i % 6) * 0.45 - 1.1, 0.45, Math.floor(i / 6) * 0.45 - 0.2]}>
      <sphereGeometry args={[0.12, 8, 8]} />
      <meshStandardMaterial color={i % 2 === 0 ? COLORS.flower : COLORS.flower2} />
    </mesh>
  ));
  return (
    <group position={position}>
      <mesh position={[0, 0.12, 0]} receiveShadow><boxGeometry args={[3, 0.25, 1.2]} /><meshStandardMaterial color={COLORS.woodDark} /></mesh>
      {flowers}
    </group>
  );
}

function Planter({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[1.2, 0.9, 1.2]} />
        <meshStandardMaterial color="#837767" />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <sphereGeometry args={[0.8, 10, 10]} />
        <meshStandardMaterial color={COLORS.leaf} />
      </mesh>
    </group>
  );
}

function Reception() {
  return (
    <group position={[0, 0, -18]}>
      <mesh position={[0, 2, 0]} castShadow receiveShadow><boxGeometry args={[18, 4, 7]} /><meshStandardMaterial color={COLORS.building} roughness={0.8} /></mesh>
      <mesh position={[0, 4.15, 0]} castShadow><boxGeometry args={[19, 0.35, 8]} /><meshStandardMaterial color="#6e756b" /></mesh>
      <mesh position={[0, 2, 3.58]}><boxGeometry args={[7, 3.2, 0.12]} /><meshStandardMaterial color={COLORS.glass} transparent opacity={0.55} metalness={0.2} roughness={0.15} /></mesh>
      {[-3.8, 3.8].map((x) => <mesh key={x} position={[x, 2, 3.8]} castShadow><boxGeometry args={[0.35, 4.1, 0.35]} /><meshStandardMaterial color={COLORS.black} /></mesh>)}
      <mesh position={[0, 4.2, 5]} castShadow><boxGeometry args={[9, 0.35, 3]} /><meshStandardMaterial color="#313630" /></mesh>
      {[-4, 4].map((x) => <mesh key={x} position={[x, 2, 4.8]} castShadow><cylinderGeometry args={[0.2, 0.2, 4, 12]} /><meshStandardMaterial color="#ddd7ca" /></mesh>)}
      <mesh position={[0, 1, -0.7]} castShadow><boxGeometry args={[4, 1.2, 1]} /><meshStandardMaterial color="#6b5140" /></mesh>
      <Text position={[0, 2.9, 3.65]} fontSize={0.8} color="#27352c" anchorX="center" anchorY="middle">ARISUN RESORT</Text>
      <Text position={[0, 2.15, 3.68]} fontSize={0.24} color="#5b665d" anchorX="center" anchorY="middle">HOTEL • SPA • LOUNGE</Text>
    </group>
  );
}

function Villa({ position, rotation = 0 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 1.8, 0]} castShadow receiveShadow><boxGeometry args={[9, 3.6, 7]} /><meshStandardMaterial color={COLORS.building} roughness={0.8} /></mesh>
      <mesh position={[0, 3.75, 0]} castShadow><boxGeometry args={[9.5, 0.35, 7.5]} /><meshStandardMaterial color="#4d554e" /></mesh>
      <mesh position={[0, 1.9, 3.53]}><boxGeometry args={[6, 2.7, 0.12]} /><meshStandardMaterial color={COLORS.glass} transparent opacity={0.62} metalness={0.2} roughness={0.15} /></mesh>
      <mesh position={[-4.45, 1.8, 0]} castShadow><boxGeometry args={[0.2, 3.6, 6.7]} /><meshStandardMaterial color="#c9c2b6" /></mesh>
      <mesh position={[0, 1, 3.7]}><boxGeometry args={[1.2, 2, 0.18]} /><meshStandardMaterial color={COLORS.woodDark} /></mesh>
      <mesh position={[0, 0.15, 5.3]} receiveShadow><boxGeometry args={[8, 0.3, 3]} /><meshStandardMaterial color="#b89976" /></mesh>
      <mesh position={[0, 0.3, 7]} receiveShadow><boxGeometry args={[5, 0.25, 2.5]} /><meshStandardMaterial color={COLORS.pool} /></mesh>
      <mesh position={[0, 0.17, 7]}><boxGeometry args={[5.5, 0.12, 3]} /><meshStandardMaterial color="#e4e0d6" /></mesh>
      <mesh position={[0, 0.3, 7]}><boxGeometry args={[4.8, 0.1, 2.3]} /><meshStandardMaterial color={COLORS.pool} /></mesh>
    </group>
  );
}

function MainPool() {
  return (
    <group position={[0, 0, 7.8]}>
      <mesh position={[0, 0.05, 0]} receiveShadow><boxGeometry args={[18, 0.25, 16]} /><meshStandardMaterial color="#e7e0d3" /></mesh>
      <mesh position={[0, 0.25, 0]} receiveShadow><boxGeometry args={[16.8, 0.18, 14.8]} /><meshStandardMaterial color={COLORS.pool} metalness={0.05} roughness={0.15} /></mesh>
      <mesh position={[0, 0.38, -5]}><boxGeometry args={[16.5, 0.12, 2]} /><meshStandardMaterial color="#8edbe6" /></mesh>
      {[0, 0.25, 0.5].map((y, i) => <mesh key={i} position={[-5, y, 5.2 + i * 0.4]}><boxGeometry args={[2, 0.2, 0.5]} /><meshStandardMaterial color="#d8d4ca" /></mesh>)}
      <mesh position={[3.5, 0.5, 0]} castShadow><cylinderGeometry args={[1.3, 1.3, 0.8, 24]} /><meshStandardMaterial color="#ded8cb" /></mesh>
      <PalmTree position={[3.5, 0.9, 0]} scale={0.75} />
    </group>
  );
}

function Lounger({ position, rotation = 0 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.35, 0]} rotation={[0.2, 0, 0]} castShadow><boxGeometry args={[1.2, 0.12, 2.2]} /><meshStandardMaterial color="#e9e2d4" /></mesh>
      <mesh position={[0, 0.65, -0.75]} rotation={[-0.35, 0, 0]} castShadow><boxGeometry args={[1.2, 0.12, 1]} /><meshStandardMaterial color="#e9e2d4" /></mesh>
      {[-0.42, 0.42].map((x) => <mesh key={x} position={[x, 0.15, 0.2]}><cylinderGeometry args={[0.04, 0.04, 0.35, 6]} /><meshStandardMaterial color={COLORS.metal} /></mesh>)}
    </group>
  );
}

function Umbrella({ position, color = "#f3eee2" }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.8, 0]}><cylinderGeometry args={[0.04, 0.04, 3.6, 8]} /><meshStandardMaterial color={COLORS.metal} /></mesh>
      <mesh position={[0, 3.45, 0]}><coneGeometry args={[1.6, 0.55, 24]} /><meshStandardMaterial color={color} /></mesh>
    </group>
  );
}

function Restaurant() {
  return (
    <group position={[0, 0, 23]}>
      <mesh position={[0, 1.7, 0]} castShadow><boxGeometry args={[15, 3.4, 7]} /><meshStandardMaterial color="#d8d1c4" /></mesh>
      <mesh position={[0, 3.55, 0]} castShadow><boxGeometry args={[15.8, 0.3, 7.8]} /><meshStandardMaterial color="#4d554d" /></mesh>
      <mesh position={[0, 1.8, 3.55]}><boxGeometry args={[11, 2.7, 0.1]} /><meshStandardMaterial color={COLORS.glass} transparent opacity={0.6} /></mesh>
      <Text position={[0, 2.85, 3.65]} fontSize={0.7} color="#26352b" anchorX="center">THE PALM TABLE</Text>
      <Text position={[0, 2.25, 3.65]} fontSize={0.22} color="#58645b" anchorX="center">RESTAURANT & CAFE</Text>
      <mesh position={[0, 0.1, 5.3]} receiveShadow><boxGeometry args={[16, 0.2, 4]} /><meshStandardMaterial color="#b28e68" /></mesh>
    </group>
  );
}

function CafeTable({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.75, 0]} castShadow><cylinderGeometry args={[0.8, 0.8, 0.12, 20]} /><meshStandardMaterial color="#e8e1d5" /></mesh>
      <mesh position={[0, 0.38, 0]}><cylinderGeometry args={[0.08, 0.08, 0.7, 8]} /><meshStandardMaterial color={COLORS.metal} /></mesh>
      <mesh position={[0, 0.05, 0]}><cylinderGeometry args={[0.4, 0.4, 0.08, 12]} /><meshStandardMaterial color={COLORS.metal} /></mesh>
    </group>
  );
}

function Chair({ position, rotation = 0 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.55, 0]}><boxGeometry args={[0.7, 0.12, 0.7]} /><meshStandardMaterial color="#d6cec0" /></mesh>
      <mesh position={[0, 1, -0.3]}><boxGeometry args={[0.7, 0.9, 0.12]} /><meshStandardMaterial color="#d6cec0" /></mesh>
      {[[-0.25, 0.25], [0.25, 0.25], [-0.25, -0.25], [0.25, -0.25]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.25, z]}><cylinderGeometry args={[0.035, 0.035, 0.5, 6]} /><meshStandardMaterial color={COLORS.metal} /></mesh>
      ))}
    </group>
  );
}

function Bench({ position, rotation = 0 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.65, 0]} castShadow><boxGeometry args={[2.4, 0.18, 0.6]} /><meshStandardMaterial color={COLORS.wood} /></mesh>
      <mesh position={[0, 1.1, -0.2]}><boxGeometry args={[2.4, 0.9, 0.12]} /><meshStandardMaterial color={COLORS.wood} /></mesh>
      {[-0.8, 0.8].map((x) => <mesh key={x} position={[x, 0.3, 0]}><boxGeometry args={[0.12, 0.6, 0.45]} /><meshStandardMaterial color={COLORS.metal} /></mesh>)}
    </group>
  );
}

// ============================================================
// PARTY HALL & CLUB COMPONENTS
// ============================================================
function DynamicLight({ color, position, speed }) {
  const lightRef = useRef();
  useFrame(({ clock }) => {
    if (lightRef.current) {
      lightRef.current.position.x = position[0] + Math.sin(clock.elapsedTime * speed) * 4;
      lightRef.current.position.z = position[2] + Math.cos(clock.elapsedTime * speed * 0.8) * 4;
    }
  });
  return <pointLight ref={lightRef} position={position} intensity={12} color={color} distance={12} />;
}

function ClubLaser({ position, color, speed, rotationOffset }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime * speed;
    ref.current.rotation.x = Math.sin(t) * 0.5 + rotationOffset[0];
    ref.current.rotation.y = Math.cos(t * 0.8) * 0.5 + rotationOffset[1];
    ref.current.rotation.z = Math.sin(t * 1.2) * 0.5 + rotationOffset[2];
  });
  return (
    <group ref={ref} position={position}>
      <mesh position={[0, -3, 0]}>
        <cylinderGeometry args={[0.03, 0.15, 6, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

function PartyHall({ partyStarted }) {
  const wallColor = partyStarted ? "#ff1493" : "#111";
  const audioRef = useRef(null);

  useEffect(() => {
    if (partyStarted) {
      if (!audioRef.current) {
        audioRef.current = new Audio("/music.mp3");
        audioRef.current.loop = true;
      }
      audioRef.current.play().catch((e) => console.log("Audio play blocked or failed:", e));
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [partyStarted]);

  const balloons = useMemo(() => {
    if (!partyStarted) return null;
    const colors = ["#ff007f", "#00ffff", "#ffcc00", "#7f00ff", "#00ff7f", "#ff4500"];
    const items = [];
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const radius = 7.5;
      const x = -26 + Math.cos(angle) * radius;
      const z = 5 + Math.sin(angle) * radius;
      const y = 2.0 + (i % 3) * 0.4;
      const color = colors[i % colors.length];
      items.push(
        <group key={i} position={[x, y, z]}>
          <mesh castShadow>
            <sphereGeometry args={[0.35, 16, 16]} />
            <meshStandardMaterial color={color} roughness={0.3} metalness={0.1} />
          </mesh>
          <mesh position={[0, -0.5, 0]}>
            <cylinderGeometry args={[0.01, 0.01, 1, 6]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
          </mesh>
        </group>
      );
    }
    return items;
  }, [partyStarted]);

  return (
    <group>
      <mesh position={[-26, 0.02, 5]} receiveShadow>
        <boxGeometry args={[18, 0.05, 18]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.1} metalness={0.9} />
      </mesh>

      <mesh position={[-26, 1.5, -4]} castShadow><boxGeometry args={[18, 3, 1]} /><meshStandardMaterial color={wallColor} /></mesh>
      <mesh position={[-26, 1.5, 14]} castShadow><boxGeometry args={[18, 3, 1]} /><meshStandardMaterial color={wallColor} /></mesh>
      <mesh position={[-34.5, 1.5, 5]} castShadow><boxGeometry args={[1, 3, 19]} /><meshStandardMaterial color={wallColor} /></mesh>
      <mesh position={[-17.5, 1.5, -0.5]} castShadow><boxGeometry args={[1, 3, 8]} /><meshStandardMaterial color={wallColor} /></mesh>
      <mesh position={[-17.5, 1.5, 10.5]} castShadow><boxGeometry args={[1, 3, 8]} /><meshStandardMaterial color={wallColor} /></mesh>

      <mesh position={[-26, 3, 5]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[18, 18]} />
        <meshStandardMaterial color="#050505" side={THREE.FrontSide} />
      </mesh>

      {!partyStarted && (
        <group>
          <mesh position={[-26, 0.06, 5]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.5, 2, 32]} />
            <meshBasicMaterial color="#ffcc00" side={THREE.DoubleSide} transparent opacity={0.6} />
          </mesh>
          <Text position={[-26, 1.5, 5]} fontSize={0.3} color="#ffcc00" anchorX="center" anchorY="middle">
            ADMIN ZONE
          </Text>
        </group>
      )}

      {partyStarted && (
        <group>
          <mesh position={[-26, 2.5, -3.4]}><boxGeometry args={[17, 0.05, 0.05]} /><meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={2} /></mesh>
          <mesh position={[-26, 2.5, 13.4]}><boxGeometry args={[17, 0.05, 0.05]} /><meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={2} /></mesh>

          <Text position={[-26, 2.4, -3.45]} fontSize={0.85} color="#00ffff" anchorX="center" anchorY="middle">
            happy birthday dear rishika ❤️
          </Text>
          <Text position={[-34.4, 2.4, 5]} rotation={[0, Math.PI / 2, 0]} fontSize={0.85} color="#ff007f" anchorX="center" anchorY="middle">
            happy birthday dear rishika ❤️
          </Text>
          <Text position={[-26, 2.4, 13.45]} rotation={[0, Math.PI, 0]} fontSize={0.85} color="#ffcc00" anchorX="center" anchorY="middle">
            happy birthday dear rishika ❤️
          </Text>

          {balloons}

          <mesh position={[-26, 0.06, 5]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[10, 10, 12, 12]} />
            <meshBasicMaterial color="#00ffff" wireframe transparent opacity={0.2} blending={THREE.AdditiveBlending} />
          </mesh>

          <group position={[-32.5, 0, 5]}>
            <mesh position={[0, 0.6, 0]} castShadow><boxGeometry args={[2, 1.2, 4]} /><meshStandardMaterial color="#1a1a1a" metalness={0.8} /></mesh>
            <mesh position={[1.01, 0.6, 0]}><boxGeometry args={[0.05, 1, 3.8]} /><meshStandardMaterial color="#ff007f" emissive="#ff007f" emissiveIntensity={1.5} /></mesh>
            <mesh position={[0, 1.25, -0.8]}><cylinderGeometry args={[0.3, 0.3, 0.05, 16]} /><meshStandardMaterial color="#333" metalness={0.9} /></mesh>
            <mesh position={[0, 1.25, 0.8]}><cylinderGeometry args={[0.3, 0.3, 0.05, 16]} /><meshStandardMaterial color="#333" metalness={0.9} /></mesh>
            <mesh position={[0, 1.25, 0]}><boxGeometry args={[0.5, 0.08, 0.6]} /><meshStandardMaterial color="#222" /></mesh>
            <mesh position={[0, 1.27, 0]}><boxGeometry args={[0.4, 0.05, 0.5]} /><meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={1.2} /></mesh>
            <group position={[0.2, 1.25, 0]} rotation={[0, -Math.PI / 2, 0]}>
              <mesh position={[0, 0.02, 0]}><boxGeometry args={[0.4, 0.02, 0.3]} /><meshStandardMaterial color="#aaa" /></mesh>
              <mesh position={[0, 0.15, -0.15]} rotation={[0.4, 0, 0]}><boxGeometry args={[0.4, 0.3, 0.02]} /><meshStandardMaterial color="#aaa" /></mesh>
              <mesh position={[0, 0.15, -0.14]} rotation={[0.4, 0, 0]}><boxGeometry args={[0.36, 0.26, 0.01]} /><meshStandardMaterial color="#00ffb7" emissive="#00ffb7" emissiveIntensity={1.5} /></mesh>
            </group>
            <group position={[0, 1.5, -3]}>
              <mesh castShadow><boxGeometry args={[1.5, 3, 1.5]} /><meshStandardMaterial color="#050505" /></mesh>
              <mesh position={[0.76, 0.6, 0]} rotation={[0, 0, -Math.PI / 2]}><cylinderGeometry args={[0.4, 0.4, 0.05, 16]} /><meshStandardMaterial color="#222" /></mesh>
              <mesh position={[0.76, -0.6, 0]} rotation={[0, 0, -Math.PI / 2]}><cylinderGeometry args={[0.5, 0.5, 0.05, 16]} /><meshStandardMaterial color="#222" /></mesh>
            </group>
            <group position={[0, 1.5, 3]}>
              <mesh castShadow><boxGeometry args={[1.5, 3, 1.5]} /><meshStandardMaterial color="#050505" /></mesh>
              <mesh position={[0.76, 0.6, 0]} rotation={[0, 0, -Math.PI / 2]}><cylinderGeometry args={[0.4, 0.4, 0.05, 16]} /><meshStandardMaterial color="#222" /></mesh>
              <mesh position={[0.76, -0.6, 0]} rotation={[0, 0, -Math.PI / 2]}><cylinderGeometry args={[0.5, 0.5, 0.05, 16]} /><meshStandardMaterial color="#222" /></mesh>
            </group>
          </group>

          <group position={[-19, 0, 8]}>
            <mesh position={[0, 0.6, 0]} castShadow><boxGeometry args={[1.5, 1.2, 4]} /><meshStandardMaterial color="#111" roughness={0.1} /></mesh>
            <mesh position={[-1.2, 0.4, -0.8]}><cylinderGeometry args={[0.2, 0.2, 0.8, 16]} /><meshStandardMaterial color="#333" metalness={0.8} /></mesh>
            <mesh position={[-1.2, 0.85, -0.8]}><cylinderGeometry args={[0.25, 0.25, 0.1, 16]} /><meshStandardMaterial color="#ff007f" roughness={0.2} /></mesh>
            <mesh position={[-1.2, 0.4, 0.8]}><cylinderGeometry args={[0.2, 0.2, 0.8, 16]} /><meshStandardMaterial color="#333" metalness={0.8} /></mesh>
            <mesh position={[-1.2, 0.85, 0.8]}><cylinderGeometry args={[0.25, 0.25, 0.1, 16]} /><meshStandardMaterial color="#ff007f" roughness={0.2} /></mesh>
            <mesh position={[0, 1.35, 0]}><boxGeometry args={[0.2, 0.3, 2]} /><meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={1.5} transparent opacity={0.8} /></mesh>
          </group>

          <DynamicLight color="#ff007f" position={[-24, 1.5, 3]} speed={2.1} />
          <DynamicLight color="#00ffff" position={[-28, 1.5, 7]} speed={1.6} />
          <DynamicLight color="#7f00ff" position={[-24, 1.5, 7]} speed={2.5} />
          <DynamicLight color="#00ff7f" position={[-28, 1.5, 3]} speed={1.9} />
          <DynamicLight color="#ff0000" position={[-22, 2.5, 5]} speed={3.0} />
          <DynamicLight color="#ffff00" position={[-30, 2.5, 5]} speed={2.8} />
          <DynamicLight color="#0000ff" position={[-26, 2.5, 1]} speed={2.2} />
          <DynamicLight color="#ff8800" position={[-26, 2.5, 9]} speed={2.7} />

          <group position={[-26, 3, 5]}>
            <ClubLaser position={[-2, 0, -2]} color="#ff00ff" speed={2.3} rotationOffset={[0.5, 0, 0]} />
            <ClubLaser position={[2, 0, 2]} color="#00ffff" speed={1.8} rotationOffset={[-0.5, 1, 0]} />
            <ClubLaser position={[-2, 0, 2]} color="#00ff00" speed={2.5} rotationOffset={[0, -0.5, 0.5]} />
            <ClubLaser position={[2, 0, -2]} color="#ff007f" speed={1.5} rotationOffset={[0.2, 0.5, -0.5]} />
            <ClubLaser position={[0, 0, 0]} color="#ffff00" speed={3.0} rotationOffset={[0.1, 0.1, 0.1]} />
          </group>
        </group>
      )}
    </group>
  );
}

// ============================================================
// STORY GUIDING ARROW
// ============================================================
function PathArrow({ position, yRot }) {
  const ref = useRef();
  useFrame((state) => {
    ref.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 6) * 0.15;
  });
  return (
    <group position={position} rotation={[0, yRot, 0]} ref={ref}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.4, 1.2, 16]} />
        <meshStandardMaterial color="#00ffb7" emissive="#00cc99" emissiveIntensity={1.5} />
      </mesh>
    </group>
  );
}

function ResortEnvironment({ storyState, user, partyStarted }) {
  const isRishika = user?.name?.toLowerCase() === "rishika";
  const showArrows = storyState === "RISHIKA_APPROACHING" && isRishika;

  return (
    <>
      <Terrain />
      <Path position={[0, 0, -6]} width={5} length={24} />
      <Path position={[0, 0, 17]} width={5} length={20} />
      <Path position={[-11, 0, 5]} rotation={Math.PI / 2} width={4} length={28} />
      <Path position={[11, 0, 5]} rotation={Math.PI / 2} width={4} length={28} />
      <Path position={[-20, 0, 5]} rotation={Math.PI / 2} width={4} length={10} />

      <Reception />
      <Villa position={[-18, 0, -5]} />
      <Villa position={[18, 0, -5]} />
      <Villa position={[-18, 0, 10]} />
      <Villa position={[18, 0, 10]} />
      <MainPool />
      <Restaurant />

      <Lounger position={[-12, 0, 4]} rotation={Math.PI / 2} />
      <Lounger position={[-12, 0, 8]} rotation={Math.PI / 2} />
      <Lounger position={[-12, 0, 12]} rotation={Math.PI / 2} />
      <Lounger position={[12, 0, 4]} rotation={-Math.PI / 2} />
      <Lounger position={[12, 0, 8]} rotation={-Math.PI / 2} />
      <Lounger position={[12, 0, 12]} rotation={-Math.PI / 2} />
      <Umbrella position={[-12, 0, 6]} />
      <Umbrella position={[12, 0, 10]} color="#d8e7df" />

      <CafeTable position={[-5, 0, 29]} />
      <CafeTable position={[0, 0, 29]} />
      <CafeTable position={[5, 0, 29]} />
      <Chair position={[-6, 0, 29]} rotation={Math.PI / 2} />
      <Chair position={[-4, 0, 29]} rotation={-Math.PI / 2} />
      <Chair position={[-1, 0, 29]} rotation={Math.PI / 2} />
      <Chair position={[1, 0, 29]} rotation={-Math.PI / 2} />
      <Chair position={[4, 0, 29]} rotation={Math.PI / 2} />
      <Chair position={[6, 0, 29]} rotation={-Math.PI / 2} />

      <PalmTree position={[-28, 0, -15]} scale={1.3} />
      <PalmTree position={[28, 0, -15]} scale={1.25} />
      <PalmTree position={[-28, 0, 20]} scale={1.2} />
      <PalmTree position={[28, 0, 20]} scale={1.25} />
      <PalmTree position={[-15, 0, -16]} scale={0.9} />
      <PalmTree position={[15, 0, -16]} scale={0.9} />
      <PalmTree position={[-15, 0, 27]} scale={0.9} />
      <PalmTree position={[15, 0, 27]} scale={0.9} />

      <Bush position={[-12, 0, -16]} scale={1.2} />
      <Bush position={[12, 0, -16]} scale={1.2} />
      <Bush position={[-11, 0, 18]} />
      <Bush position={[11, 0, 18]} />
      <Bush position={[-25, 0, -15]} />
      <Bush position={[25, 0, 0]} />
      <Bush position={[-25, 0, 25]} />
      <Bush position={[25, 0, 15]} />

      <FlowerBed position={[-7, 0, -14]} />
      <FlowerBed position={[7, 0, -14]} />
      <FlowerBed position={[-7, 0, 20]} />
      <FlowerBed position={[7, 0, 20]} />
      <Planter position={[-7, 0, -10]} />
      <Planter position={[7, 0, -10]} />

      <Bench position={[-5, 0, 17]} rotation={Math.PI / 2} />
      <Bench position={[5, 0, 17]} rotation={-Math.PI / 2} />
      <Stone position={[-9, 0.2, -12]} scale={0.8} />
      <Stone position={[9, 0.2, -12]} scale={1.1} />
      <Stone position={[-27, 0.2, 10]} scale={0.8} />
      <Stone position={[27, 0.2, 10]} scale={0.9} />

      <group position={[0, 0, -10]}>
        <mesh position={[0, 2.2, 0]} castShadow><boxGeometry args={[5, 2, 0.25]} /><meshStandardMaterial color="#253229" /></mesh>
        <mesh position={[-2, 0.9, 0]}><cylinderGeometry args={[0.12, 0.12, 2.2, 8]} /><meshStandardMaterial color="#4d3526" /></mesh>
        <mesh position={[2, 0.9, 0]}><cylinderGeometry args={[0.12, 0.12, 2.2, 8]} /><meshStandardMaterial color="#4d3526" /></mesh>
        <Text position={[0, 2.25, 0.15]} fontSize={0.55} color="#f2eee3" anchorX="center" anchorY="middle">ARISUN</Text>
        <Text position={[0, 1.75, 0.15]} fontSize={0.2} color="#d8c99f" anchorX="center" anchorY="middle">PRIVATE RESORT</Text>
      </group>

      <PartyHall partyStarted={partyStarted} />

      {showArrows && (
        <group>
          <PathArrow position={[0, 0.5, 16.5]} yRot={Math.PI / 2} /> 
          <PathArrow position={[-6, 0.5, 16.5]} yRot={Math.PI / 2} />
          <PathArrow position={[-11, 0.5, 16.5]} yRot={0} />
          <PathArrow position={[-11, 0.5, 8]} yRot={0} />
          <PathArrow position={[-11, 0.5, -0.5]} yRot={-Math.PI / 2} />
          <PathArrow position={[-5, 0.5, -0.5]} yRot={-Math.PI / 2} />
          <PathArrow position={[0, 0.5, -0.5]} yRot={0} />
        </group>
      )}
    </>
  );
}

// ============================================================
// CHARACTER
// ============================================================

const CharacterAvatar = forwardRef(function CharacterAvatar({ gender = "male", movingRef, activeMessage, action }, ref) {
  const leftLeg = useRef();
  const rightLeg = useRef();
  const leftArm = useRef();
  const rightArm = useRef();
  const torso = useRef();
  const head = useRef();

  const walkPhase = useRef(0);
  const idlePhase = useRef(Math.random() * Math.PI * 2);

  const isMale = gender === "male";
  const skin = isMale ? "#b97852" : "#d99b72";
  const shirt = isMale ? "#2563eb" : "#d9468a";
  const pants = isMale ? "#1e293b" : "#5b21b6";
  const hair = isMale ? "#241914" : "#3b2118";

  useFrame((_, delta) => {
    if (!ref.current) return;
    const moving = movingRef?.current === true;

    if (moving) walkPhase.current += delta * 11;
    idlePhase.current += delta * 2;

    let isOverriding = false;

    // --- PROCEDURAL ANIMATIONS (ACTIONS) ---
    if (action && action.type !== 'IDLE') {
      const elapsed = (Date.now() - action.ts) / 1000;

      if (action.type === 'DANCE') {
        isOverriding = true;
        const t = elapsed * 8;
        leftArm.current.rotation.z = Math.sin(t) * 0.5 - 0.5;
        leftArm.current.rotation.x = Math.cos(t);
        rightArm.current.rotation.z = -Math.sin(t) * 0.5 + 0.5;
        rightArm.current.rotation.x = -Math.cos(t);
        torso.current.rotation.y = Math.sin(t * 0.5) * 0.3;
        torso.current.position.y = 0.72 + Math.abs(Math.sin(t)) * 0.1;
        leftLeg.current.rotation.x = Math.sin(t) * 0.4;
        rightLeg.current.rotation.x = -Math.sin(t) * 0.4;
        leftLeg.current.position.y = 0.52 + Math.max(0, Math.sin(t)) * 0.15;
        rightLeg.current.position.y = 0.52 + Math.max(0, -Math.sin(t)) * 0.15;

      } else if (action.type === 'SLAP') {
        isOverriding = true;
        if (elapsed < 1.0) {
          if (elapsed < 0.2) {
            const p = elapsed / 0.2;
            rightArm.current.rotation.x = 0.5 * p; 
            rightArm.current.rotation.z = 0.5 * p;
            torso.current.rotation.y = -0.3 * p;
          } else if (elapsed < 0.3) {
            const p = (elapsed - 0.2) / 0.1;
            rightArm.current.rotation.x = 0.5 - (2.0) * p;
            rightArm.current.rotation.z = 0.5 - (0.8) * p;
            torso.current.rotation.y = -0.3 + (0.7) * p;
          } else if (elapsed < 0.6) {
            rightArm.current.rotation.x = -1.5;
            rightArm.current.rotation.z = -0.3;
            torso.current.rotation.y = 0.4;
          } else {
            const p = (elapsed - 0.6) / 0.4;
            rightArm.current.rotation.x = -1.5 * (1 - p);
            rightArm.current.rotation.z = -0.3 * (1 - p);
            torso.current.rotation.y = 0.4 * (1 - p);
          }
        }
      } else if (action.type === 'SLAPPED') {
        isOverriding = true;
        if (elapsed > 0.2 && elapsed < 1.5) {
          const snap = elapsed - 0.2;
          if (snap < 0.1) {
            const p = snap / 0.1;
            head.current.rotation.y = (Math.PI / 2.2) * p;
            head.current.rotation.z = 0.3 * p;
            torso.current.rotation.z = 0.15 * p;
            torso.current.rotation.x = -0.1 * p; 
          } else {
            const p = 1 - ((snap - 0.1) / 1.2);
            head.current.rotation.y = (Math.PI / 2.2) * p;
            head.current.rotation.z = 0.3 * p;
            torso.current.rotation.z = 0.15 * p;
            torso.current.rotation.x = -0.1 * p;
          }
        }
      } else if (action.type === 'HUG') {
        isOverriding = true;
        if (elapsed < 3.0) {
          const progress = Math.min(1, elapsed / 0.4);
          leftArm.current.rotation.z = -0.3 * progress;
          leftArm.current.rotation.x = -Math.PI / 2.5 * progress;
          leftArm.current.rotation.y = 0.6 * progress;

          rightArm.current.rotation.z = 0.3 * progress;
          rightArm.current.rotation.x = -Math.PI / 2.5 * progress;
          rightArm.current.rotation.y = -0.6 * progress;
        }
      }
    }

    if (!isOverriding) {
      torso.current.rotation.y = THREE.MathUtils.lerp(torso.current.rotation.y, 0, delta * 5);
      torso.current.rotation.x = THREE.MathUtils.lerp(torso.current.rotation.x, 0, delta * 5);
      torso.current.rotation.z = THREE.MathUtils.lerp(torso.current.rotation.z, 0, delta * 5);
      head.current.rotation.y = THREE.MathUtils.lerp(head.current.rotation.y, 0, delta * 5);
      head.current.rotation.z = THREE.MathUtils.lerp(head.current.rotation.z, 0, delta * 5);
      
      const breathing = Math.sin(idlePhase.current) * 0.012;
      torso.current.position.y = 0.72 + breathing;
      head.current.position.y = 1.35 + breathing;

      if (leftArm.current && rightArm.current) {
        if (moving) {
          const swing = Math.sin(walkPhase.current) * 0.45;
          leftArm.current.rotation.x = -swing;
          rightArm.current.rotation.x = swing;
          leftArm.current.rotation.y = 0; leftArm.current.rotation.z = 0;
          rightArm.current.rotation.y = 0; rightArm.current.rotation.z = 0;
        } else {
          leftArm.current.rotation.x = THREE.MathUtils.lerp(leftArm.current.rotation.x, 0, delta * 8);
          rightArm.current.rotation.x = THREE.MathUtils.lerp(rightArm.current.rotation.x, 0, delta * 8);
          leftArm.current.rotation.y = THREE.MathUtils.lerp(leftArm.current.rotation.y, 0, delta * 8);
          rightArm.current.rotation.y = THREE.MathUtils.lerp(rightArm.current.rotation.y, 0, delta * 8);
          leftArm.current.rotation.z = THREE.MathUtils.lerp(leftArm.current.rotation.z, 0, delta * 8);
          rightArm.current.rotation.z = THREE.MathUtils.lerp(rightArm.current.rotation.z, 0, delta * 8);
        }
      }
    }

    if (leftLeg.current && rightLeg.current) {
      if (moving && !isOverriding) {
        const swing = Math.sin(walkPhase.current) * 0.55;
        leftLeg.current.rotation.x = swing;
        rightLeg.current.rotation.x = -swing;
      } else if (!isOverriding) {
        leftLeg.current.rotation.x = THREE.MathUtils.lerp(leftLeg.current.rotation.x, 0, delta * 8);
        rightLeg.current.rotation.x = THREE.MathUtils.lerp(rightLeg.current.rotation.x, 0, delta * 8);
      }
      if (!isOverriding) {
        leftLeg.current.position.y = THREE.MathUtils.lerp(leftLeg.current.position.y, 0.52, delta * 8);
        rightLeg.current.position.y = THREE.MathUtils.lerp(rightLeg.current.position.y, 0.52, delta * 8);
      }
    }
  });

  return (
    <group ref={ref}>
      {activeMessage && (
        <Html position={[0, 1.9, 0]} center zIndexRange={[100, 0]}>
          <div style={{
            background: "rgba(255, 255, 255, 0.95)", color: "#111", padding: "8px 16px",
            borderRadius: "16px", fontWeight: "600", fontSize: "14px", whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)", pointerEvents: "none", transform: "translateY(-10px)",
            fontFamily: "sans-serif"
          }}>
            {activeMessage}
          </div>
        </Html>
      )}

      <group ref={leftLeg} position={[-0.16, 0.52, 0]}>
        <mesh position={[0, -0.4, 0]} castShadow><cylinderGeometry args={[0.105, 0.095, 0.8, 8]} /><meshStandardMaterial color={pants} /></mesh>
        <mesh position={[0, -0.82, 0.08]} castShadow><boxGeometry args={[0.22, 0.16, 0.4]} /><meshStandardMaterial color="#111827" /></mesh>
      </group>
      <group ref={rightLeg} position={[0.16, 0.52, 0]}>
        <mesh position={[0, -0.4, 0]} castShadow><cylinderGeometry args={[0.105, 0.095, 0.8, 8]} /><meshStandardMaterial color={pants} /></mesh>
        <mesh position={[0, -0.82, 0.08]} castShadow><boxGeometry args={[0.22, 0.16, 0.4]} /><meshStandardMaterial color="#111827" /></mesh>
      </group>

      <mesh ref={torso} position={[0, 0.72, 0]} castShadow><boxGeometry args={isMale ? [0.58, 0.72, 0.32] : [0.5, 0.7, 0.3]} /><meshStandardMaterial color={shirt} /></mesh>

      <group ref={leftArm} position={[-0.38, 0.98, 0]}>
        <mesh position={[0, -0.32, 0]} castShadow><cylinderGeometry args={[0.08, 0.07, 0.64, 8]} /><meshStandardMaterial color={shirt} /></mesh>
        <mesh position={[0, -0.67, 0]} castShadow><sphereGeometry args={[0.09, 8, 8]} /><meshStandardMaterial color={skin} /></mesh>
      </group>
      <group ref={rightArm} position={[0.38, 0.98, 0]}>
        <mesh position={[0, -0.32, 0]} castShadow><cylinderGeometry args={[0.08, 0.07, 0.64, 8]} /><meshStandardMaterial color={shirt} /></mesh>
        <mesh position={[0, -0.67, 0]} castShadow><sphereGeometry args={[0.09, 8, 8]} /><meshStandardMaterial color={skin} /></mesh>
      </group>

      <group ref={head} position={[0, 1.35, 0]}>
        <mesh castShadow><sphereGeometry args={[0.27, 16, 16]} /><meshStandardMaterial color={skin} /></mesh>
        <mesh position={[0, 0.11, -0.03]} castShadow><sphereGeometry args={[0.28, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.9]} /><meshStandardMaterial color={hair} /></mesh>
        <mesh position={[-0.09, 0.03, 0.245]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color="#111111" /></mesh>
        <mesh position={[0.09, 0.03, 0.245]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color="#111111" /></mesh>
        <mesh position={[0, -0.01, 0.27]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color={skin} /></mesh>
      </group>
    </group>
  );
});

// ============================================================
// LOCAL PLAYER
// ============================================================
function LocalPlayer({ spawnPosition, onMove, playerPositionRef, gender, otherPlayersRef, movementLocked, activeMessage, action, onCancelAction, pendingAction, onPendingComplete }) {
  const ref = useRef();
  const keys = useRef({});
  const movingRef = useRef(false);

  useEffect(() => {
    if (!ref.current || !spawnPosition) return;
    ref.current.position.set(spawnPosition[0], spawnPosition[1], spawnPosition[2]);
    playerPositionRef.current.copy(ref.current.position);
  }, [spawnPosition, playerPositionRef]);

  useEffect(() => {
    const down = (e) => (keys.current[e.code] = true);
    const up = (e) => (keys.current[e.code] = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useFrame((_, delta) => {
    if (!ref.current) return;

    if (pendingAction) {
      const target = otherPlayersRef.current[pendingAction.targetId];
      if (target) {
        const dx = target.position[0] - ref.current.position.x;
        const dz = target.position[2] - ref.current.position.z;
        const dist = Math.hypot(dx, dz);
        
        if (dist > 0.80) {
          movingRef.current = true;
          const moveSpeed = SPEED * delta;
          ref.current.position.x += (dx / dist) * moveSpeed;
          ref.current.position.z += (dz / dist) * moveSpeed;
          ref.current.rotation.y = Math.atan2(dx, dz);
          
          playerPositionRef.current.copy(ref.current.position);
          onMove({ position: [ref.current.position.x, ref.current.position.y, ref.current.position.z], rotation: ref.current.rotation.y, gender });
        } else {
          movingRef.current = false;
          onPendingComplete(pendingAction);
        }
        return; 
      } else {
        onPendingComplete(null);
      }
    }

    const direction = new THREE.Vector3();
    if (keys.current.KeyW) direction.z -= 1;
    if (keys.current.KeyS) direction.z += 1;
    if (keys.current.KeyA) direction.x -= 1;
    if (keys.current.KeyD) direction.x += 1;

    movingRef.current = direction.lengthSq() > 0 && !movementLocked;

    if (movingRef.current && action?.type && action.type !== 'IDLE') {
      onCancelAction();
    }

    if (!movingRef.current || movementLocked) return;

    direction.normalize();
    const movement = new THREE.Vector3(direction.x * SPEED * delta, 0, direction.z * SPEED * delta);
    const targetRotation = Math.atan2(direction.x, direction.z);

    ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, targetRotation, Math.min(1, delta * 15));

    const nextX = ref.current.position.clone();
    nextX.x += movement.x;
    if (!collidesWithWorld(nextX) && !collidesWithOtherPlayer(nextX, Object.values(otherPlayersRef.current)) && !isOutsideWorld(nextX)) {
      ref.current.position.x = nextX.x;
    }

    const nextZ = ref.current.position.clone();
    nextZ.z += movement.z;
    if (!collidesWithWorld(nextZ) && !collidesWithOtherPlayer(nextZ, Object.values(otherPlayersRef.current)) && !isOutsideWorld(nextZ)) {
      ref.current.position.z = nextZ.z;
    }

    playerPositionRef.current.copy(ref.current.position);
    onMove({
      position: [ref.current.position.x, ref.current.position.y, ref.current.position.z],
      rotation: ref.current.rotation.y,
      gender,
    });
  });

  return <CharacterAvatar ref={ref} gender={gender} movingRef={movingRef} activeMessage={activeMessage} action={action} />;
}

// ============================================================
// REMOTE PLAYER
// ============================================================
function RemotePlayer({ player, activeMessage, action }) {
  const ref = useRef();
  const movingRef = useRef(false);
  const targetPosition = useRef(new THREE.Vector3(player.position[0], player.position[1], player.position[2]));
  const targetRotation = useRef(player.rotation || 0);

  useEffect(() => {
    targetPosition.current.set(player.position[0], player.position[1], player.position[2]);
    targetRotation.current = player.rotation || 0;
  }, [player.position, player.rotation]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    const smoothing = 1 - Math.exp(-REMOTE_SMOOTHING * delta);
    const distance = ref.current.position.distanceTo(targetPosition.current);
    movingRef.current = distance > 0.025;
    ref.current.position.lerp(targetPosition.current, smoothing);
    ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, targetRotation.current, smoothing);
  });

  return <CharacterAvatar ref={ref} gender={player.gender} movingRef={movingRef} activeMessage={activeMessage} action={action} />;
}

// ============================================================
// CAMERA
// ============================================================
function FollowCamera({ playerPositionRef, controlsRef }) {
  const previousPosition = useRef(new THREE.Vector3());
  const initialized = useRef(false);

  useFrame(({ camera }) => {
    if (!controlsRef.current) return;
    const player = playerPositionRef.current;

    if (!initialized.current) {
      previousPosition.current.copy(player);
      controlsRef.current.target.set(player.x, player.y + 0.9, player.z);
      camera.position.set(player.x + 7, player.y + 5.5, player.z + 7);
      initialized.current = true;
      return;
    }

    const movement = new THREE.Vector3().subVectors(player, previousPosition.current);
    if (movement.lengthSq() > 0) {
      camera.position.add(movement);
      controlsRef.current.target.add(movement);
    }
    previousPosition.current.copy(player);
    controlsRef.current.update();
  });

  return null;
}

// ============================================================
// LIGHTING
// ============================================================
function ResortLighting({ night, partyStarted }) {
  if (night) {
    return (
      <>
        <ambientLight intensity={partyStarted ? 0.6 : 0.3} />
        <directionalLight position={[-10, 15, 5]} intensity={0.7} color="#b7c9ff" castShadow />
        <pointLight position={[0, 4, 7]} intensity={5} color="#4ed8ff" distance={18} />
        <pointLight position={[0, 5, -15]} intensity={4} color="#ffd6a1" distance={20} />
        <pointLight position={[0, 3, 24]} intensity={4} color="#ffbd7a" distance={18} />
      </>
    );
  }
  return (
    <>
      <ambientLight intensity={1.7} />
      <directionalLight position={[-15, 22, 10]} intensity={3.2} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-40} shadow-camera-right={40} shadow-camera-top={40} shadow-camera-bottom={-40} />
      <hemisphereLight skyColor="#bde8ff" groundColor="#5d7d45" intensity={1} />
    </>
  );
}

// ============================================================
// WORLD
// ============================================================
function World({ night, user, onAuthError, storyState, onStoryState, onShowHello, onMessage, uiActions, activeMessages, partyStarted, setPartyStarted, onPartyZone }) {
  const socketRef = useRef(null);
  const controlsRef = useRef(null);
  const playerPositionRef = useRef(new THREE.Vector3(0, 0.8, -8));
  const otherPlayersRef = useRef({});

  const [spawnPosition, setSpawnPosition] = useState(null);
  const [localGender, setLocalGender] = useState(null);
  const [movementLocked, setMovementLocked] = useState(false);
  const [remotePlayers, setRemotePlayers] = useState({});
  
  const [playerActions, setPlayerActions] = useState({});
  const [pendingAction, setPendingAction] = useState(null);

  useEffect(() => {
    if (!user?.name) return;

    const socket = io(SERVER_URL, {
      auth: {
        name: user.name,
        ...(user.password ? { password: user.password } : {}),
      },
    });
    socketRef.current = socket;

    uiActions.current = {
      sayHello: () => socket.emit("sayHello"),
      sendChat: (text) => socket.emit("chatMessage", text),
      startParty: () => socket.emit("chatMessage", "/START_PARTY"),
      triggerAction: (type) => {
        const others = Object.values(otherPlayersRef.current);
        let nearestId = null;
        let minDist = Infinity;
        const myPos = playerPositionRef.current;

        for (const p of others) {
          const dist = Math.hypot(p.position[0] - myPos.x, p.position[2] - myPos.z);
          if (dist < minDist) { minDist = dist; nearestId = p.id; }
        }

        if (type === 'DANCE') {
          socket.emit("chatMessage", "/ACTION DANCE");
        } else if (nearestId) {
          setPendingAction({ type, targetId: nearestId });
        }
      }
    };

    const handleCurrentPlayers = (players) => {
      const others = {};
      players.forEach((player) => {
        if (player.id === socket.id) {
          setSpawnPosition([...player.position]);
          setLocalGender(player.gender);
          setMovementLocked(player.movementLocked);
        } else {
          others[player.id] = player;
        }
      });
      otherPlayersRef.current = others;
      setRemotePlayers(others);
    };

    const handlePlayerJoined = (player) => {
      if (player.id === socket.id) return;
      setRemotePlayers((current) => {
        const updated = { ...current, [player.id]: player };
        otherPlayersRef.current = updated;
        return updated;
      });
    };

    const handlePlayerMoved = (player) => {
      if (player.id === socket.id) return;
      setRemotePlayers((current) => {
        const updated = {
          ...current,
          [player.id]: { ...current[player.id], ...player, position: [...player.position] },
        };
        otherPlayersRef.current = updated;
        return updated;
      });
    };

    const handlePlayerLeft = (id) => {
      setRemotePlayers((current) => {
        const updated = { ...current };
        delete updated[id];
        otherPlayersRef.current = updated;
        return updated;
      });
    };

    socket.on("storyState", (data) => onStoryState(data.state));
    socket.on("showHelloButton", () => onShowHello(true));
    socket.on("hello", (data) => {
      onShowHello(false);
      onMessage(data);
    });
    socket.on("unlockPlayers", () => setMovementLocked(false));
    
    socket.on("chatMessage", (data) => {
      if (data.text === "/START_PARTY") {
        setPartyStarted(true);
      } else if (data.text.startsWith("/ACTION")) {
        const parts = data.text.split(" ");
        const actionType = parts[1];
        const targetId = parts[2];
        const initiatorId = data.playerId || data.from;
        const now = Date.now();

        setPlayerActions(prev => ({
          ...prev,
          [initiatorId]: { type: actionType, target: targetId, ts: now },
          ...(targetId && targetId !== initiatorId && targetId !== 'no_target' ? {
            [targetId]: { type: actionType === 'SLAP' ? 'SLAPPED' : actionType, initiator: initiatorId, ts: now }
          } : {})
        }));
      } else {
        onMessage(data);
      }
    });

    socket.on("connect_error", (err) => onAuthError?.(err?.message || "Authorization failed."));
    socket.on("currentPlayers", handleCurrentPlayers);
    socket.on("playerJoined", handlePlayerJoined);
    socket.on("playerMoved", handlePlayerMoved);
    socket.on("playerLeft", handlePlayerLeft);

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  const inZoneRef = useRef(false);
  useFrame(() => {
    if (user?.name?.toLowerCase() === "admin" && !partyStarted) {
      const player = playerPositionRef.current;
      const dist = Math.hypot(player.x - (-26), player.z - 5);
      const inZone = dist < 2.5;
      if (inZone !== inZoneRef.current) {
        inZoneRef.current = inZone;
        onPartyZone(inZone);
      }
    }
  });

  const sendMovement = (data) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("playerMove", data);
    }
  };

  const handlePendingComplete = (actionCompleted) => {
    if (actionCompleted && socketRef.current) {
      socketRef.current.emit("chatMessage", `/ACTION ${actionCompleted.type} ${actionCompleted.targetId}`);
    }
    setPendingAction(null);
  };

  const cancelAction = () => {
    if (socketRef.current) {
      socketRef.current.emit("chatMessage", "/ACTION IDLE");
      setPlayerActions(prev => ({ ...prev, [socketRef.current.id]: { type: 'IDLE' } }));
    }
  };

  const localMessage = activeMessages.filter(m => m.playerId === socketRef.current?.id).pop()?.text;
  const myId = socketRef.current?.id;

  return (
    <>
      <ResortLighting night={night} partyStarted={partyStarted} />
      <ResortEnvironment storyState={storyState} user={user} partyStarted={partyStarted} />

      {spawnPosition && localGender && (
        <LocalPlayer
          spawnPosition={spawnPosition}
          onMove={sendMovement}
          playerPositionRef={playerPositionRef}
          gender={localGender}
          otherPlayersRef={otherPlayersRef}
          movementLocked={movementLocked}
          activeMessage={localMessage}
          action={playerActions[myId]}
          onCancelAction={cancelAction}
          pendingAction={pendingAction}
          onPendingComplete={handlePendingComplete}
        />
      )}

      {Object.values(remotePlayers).map((player) => (
        <RemotePlayer
          key={player.id}
          player={player}
          activeMessage={activeMessages.filter(m => m.playerId === player.id).pop()?.text}
          action={playerActions[player.id]}
        />
      ))}

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableZoom
        enableRotate
        minDistance={5}
        maxDistance={18}
        minPolarAngle={0.35}
        maxPolarAngle={Math.PI / 2.05}
        enableDamping
        dampingFactor={0.08}
      />

      <FollowCamera playerPositionRef={playerPositionRef} controlsRef={controlsRef} />
      {!night && <fog attach="fog" args={["#bfe6f4", 45, 100]} />}
    </>
  );
}

// ============================================================
// APP
// ============================================================

export default function App() {
  const [night, setNight] = useState(true);
  const [user, setUser] = useState(null);
  const [loginError, setLoginError] = useState("");

  const [storyState, setStoryState] = useState("");
  const [showHelloButton, setShowHelloButton] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");

  const [partyStarted, setPartyStarted] = useState(false);
  const [showPartyButton, setShowPartyButton] = useState(false);

  const uiActions = useRef({});

  const handleLogin = (loggedInUser) => {
    setLoginError("");
    setUser(loggedInUser);
  };

  const handleAuthError = (message) => {
    setLoginError(message);
    setUser(null);
  };

  const handleNewMessage = (msg) => {
    const newMsg = {
      id: msg.id || `${msg.from}-${msg.createdAt}`,
      playerId: msg.playerId || msg.from,
      text: msg.text
    };

    setMessages((prev) => [...prev, newMsg]);
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== newMsg.id));
    }, 5000);
  };

  if (!user) {
    return <Login onLogin={handleLogin} externalError={loginError} />;
  }

  const showInteractions = storyState === "FREE" || showHelloButton;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: night ? "#08101b" : "#a9dff2",
      }}
    >
      <Canvas shadows dpr={[1, 1.5]} camera={{ position: [7, 6, 17], fov: 50, near: 0.1, far: 150 }}>
        <color attach="background" args={[night ? "#08101b" : "#a9dff2"]} />
        <World
          night={night}
          user={user}
          onAuthError={handleAuthError}
          storyState={storyState}
          onStoryState={setStoryState}
          onShowHello={setShowHelloButton}
          onMessage={handleNewMessage}
          uiActions={uiActions}
          activeMessages={messages}
          partyStarted={partyStarted}
          setPartyStarted={setPartyStarted}
          onPartyZone={setShowPartyButton}
        />
      </Canvas>

      {/* ADMIN START PARTY BUTTON */}
      {showPartyButton && !partyStarted && (
        <div style={{ position: "fixed", top: 120, left: "50%", transform: "translateX(-50%)", zIndex: 30 }}>
          <button
            onClick={() => {
              uiActions.current?.startParty?.();
              setShowPartyButton(false);
            }}
            style={{
              padding: "20px 40px", fontSize: 22, fontWeight: "bold", borderRadius: 50,
              background: "#ff007f", color: "#fff", border: "none", cursor: "pointer",
              boxShadow: "0 6px 30px rgba(255,0,127,0.5)", letterSpacing: "0.05em",
              transition: "transform 0.1s, background 0.2s"
            }}
            onMouseOver={(e) => { e.target.style.transform = "scale(1.05)"; e.target.style.background = "#e60073"; }}
            onMouseOut={(e) => { e.target.style.transform = "scale(1)"; e.target.style.background = "#ff007f"; }}
          >
            Start Party 🎉
          </button>
        </div>
      )}

      {/* SAY HELLO SCENE BUTTON */}
      {showHelloButton && (
        <div style={{ position: "fixed", bottom: 120, left: "50%", transform: "translateX(-50%)", zIndex: 30 }}>
          <button
            onClick={() => {
              uiActions.current?.sayHello?.();
              setShowHelloButton(false);
            }}
            style={{
              padding: "16px 36px", fontSize: 20, fontWeight: "bold", borderRadius: 50,
              background: "#168ba9", color: "#fff", border: "none", cursor: "pointer",
              boxShadow: "0 6px 20px rgba(0,0,0,0.3)", letterSpacing: "0.05em",
              transition: "transform 0.1s"
            }}
            onMouseOver={(e) => e.target.style.transform = "scale(1.05)"}
            onMouseOut={(e) => e.target.style.transform = "scale(1)"}
          >
            Say Hello 👋
          </button>
        </div>
      )}

      {/* ACTIONS & INTERACTION MENU */}
      {showInteractions && (
        <div style={{ position: "fixed", bottom: 105, left: "50%", transform: "translateX(-50%)", zIndex: 30, display: 'flex', gap: '15px' }}>
          <button
            onClick={() => uiActions.current?.triggerAction?.('DANCE')}
            style={{ padding: "12px 20px", fontSize: 16, fontWeight: "bold", borderRadius: 25, background: "#8b5cf6", color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 15px rgba(0,0,0,0.2)", transition: "transform 0.1s" }}
            onMouseOver={(e) => e.target.style.transform = "scale(1.1)"} onMouseOut={(e) => e.target.style.transform = "scale(1)"}
          >
            Dance 🕺
          </button>
          <button
            onClick={() => uiActions.current?.triggerAction?.('HUG')}
            style={{ padding: "12px 20px", fontSize: 16, fontWeight: "bold", borderRadius: 25, background: "#ec4899", color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 15px rgba(0,0,0,0.2)", transition: "transform 0.1s" }}
            onMouseOver={(e) => e.target.style.transform = "scale(1.1)"} onMouseOut={(e) => e.target.style.transform = "scale(1)"}
          >
            Hug 🤗
          </button>
          <button
            onClick={() => uiActions.current?.triggerAction?.('SLAP')}
            style={{ padding: "12px 20px", fontSize: 16, fontWeight: "bold", borderRadius: 25, background: "#ef4444", color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 15px rgba(0,0,0,0.2)", transition: "transform 0.1s" }}
            onMouseOver={(e) => e.target.style.transform = "scale(1.1)"} onMouseOut={(e) => e.target.style.transform = "scale(1)"}
          >
            Slap 🖐️
          </button>
        </div>
      )}

      {/* CHAT INPUT */}
      {storyState === "FREE" && (
        <div style={{ position: "fixed", bottom: 40, left: "50%", transform: "translateX(-50%)", zIndex: 30, width: "100%", maxWidth: 600, padding: "0 20px", boxSizing: "border-box" }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (chatInput.trim()) {
                uiActions.current?.sendChat?.(chatInput);
                setChatInput("");
              }
            }}
            style={{ display: "flex", gap: 10, background: "rgba(20,25,21,0.85)", padding: 12, borderRadius: 40, backdropFilter: "blur(10px)", boxShadow: "0 8px 30px rgba(0,0,0,0.2)" }}
          >
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type a message..."
              style={{ flex: 1, background: "transparent", border: "none", color: "#fff", padding: "0 20px", fontSize: 16, outline: "none", fontFamily: "Arial, sans-serif" }}
            />
            <button
              type="submit"
              style={{ background: "#4ed8ff", color: "#000", border: "none", padding: "12px 24px", borderRadius: 30, fontWeight: "bold", fontSize: 15, cursor: "pointer" }}
            >
              Send
            </button>
          </form>
        </div>
      )}

      {/* RESORT UI */}
      <div
        style={{ position: "fixed", top: 20, left: 20, zIndex: 20, padding: "14px 18px", borderRadius: 12, background: "rgba(20,25,21,0.78)", backdropFilter: "blur(10px)", color: "#fff", fontFamily: "Arial, sans-serif", userSelect: "none", boxShadow: "0 8px 30px rgba(0,0,0,.2)" }}
      >
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "0.04em" }}>ARISUN RESORT</div>
        <div style={{ marginTop: 5, fontSize: 12, opacity: 0.75 }}>PRIVATE RESORT EXPERIENCE</div>
        <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6 }}>
          <div><b>W A S D</b> — Move / Stop Action</div>
          <div><b>Mouse</b> — Look around</div>
          <div><b>Wheel</b> — Zoom</div>
        </div>
      </div>

      <button
        onClick={() => setNight((value) => !value)}
        style={{ position: "fixed", top: 20, right: 20, zIndex: 20, border: "none", borderRadius: 10, padding: "11px 16px", background: "rgba(20,25,21,.8)", backdropFilter: "blur(10px)", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13 }}
      >
        {night ? "☀ Day Mode" : "☾ Sunset / Night"}
      </button>
    </div>
  );
}