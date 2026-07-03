import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { Sparkles as SparklesIcon, Grid, Maximize2, Minimize2, RotateCw } from 'lucide-react';
import { Effects } from './three/Effects';
import { GoldParticles } from './three/GoldParticles';
import { getCellTheme as getThemeColor, GRID3D_THEMES } from './three/themeConfig';
import type { Grid3DTheme } from './three/themeConfig';
import { usePerfTier } from '../hooks/usePerfTier';

const IRIS_MASK = [
  "  ███████   ████████   ███████   █████████      ███      █████████    ",
  "    ███     ███  ███     ███     ███           ████      ███          ",
  "    ███     ███  ███     ███     ███          ██ ██      ███          ",
  "    ███     ████████     ███     █████████       ██      █████████    ",
  "    ███     ██████       ███           ███       ██            ███    ",
  "    ███     ███ ███      ███           ███       ██            ███    ",
  "    ███     ███  ███     ███     ███   ███       ██     ███    ███    ",
  "  ███████   ███   ███   ███████   ████████     ██████    █████████    "
];

interface Post {
  id: number;
  message: string;
  department: string;
  thumbnailImagePath?: string;
  thumbnailUrl?: string;
  voteCount: number;
  createdAt: string;
}

interface Grid3DProps {
  approvedPosts: Post[];
  onCellClick: (post: Post) => void;
  theme: Grid3DTheme;
}

// Module-level reusable objects (avoid per-frame allocation)
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }
function easeInOutCubic(t: number) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function clamp01(t: number) { return Math.max(0, Math.min(1, t)); }

class CanvasErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: unknown, info: unknown) { console.error('Canvas Error Boundary:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-brand-surface p-6 text-center z-10">
          <p className="text-sm font-semibold text-brand-textSecondary mb-2">Không thể hiển thị mô hình 3D</p>
          <p className="text-xs text-brand-textMuted">Vui lòng tải lại trang hoặc kiểm tra kết nối mạng.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Solid Instanced Group ────────────────────────────────────────────────────
const SingleSolidInstancedGroup = ({
  cells, getCellColor, exhibitionMode, theme, mountTime, reducedMotion, isGold,
}: {
  cells: { r: number; c: number; index: number; dist: number; jitter: number }[];
  getCellColor: (c: number) => string;
  exhibitionMode: boolean;
  theme: Grid3DTheme;
  mountTime: number;
  reducedMotion: boolean;
  isGold: boolean;
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const prevModeRef = useRef(false);
  const transitionStartRef = useRef(0);

  const cfg = GRID3D_THEMES[theme];

  const material = useMemo(() =>
    new THREE.MeshStandardMaterial({
      roughness: isGold ? 0.25 : 0.3,
      metalness: isGold ? 0.6 : 0.2,
      emissive: new THREE.Color(isGold ? cfg.colors.emissiveGold : cfg.colors.emissiveOther),
      emissiveIntensity: isGold && theme === 'dark' ? 1.1 : cfg.colors.emissiveIntensity,
    }),
    [theme, isGold] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Set initial positions + colors
  useEffect(() => {
    if (!meshRef.current) return;
    cells.forEach((cell, i) => {
      const x = cell.c - 34.5;
      const y = 3.5 - cell.r;
      _dummy.position.set(x, y, 0);
      _dummy.scale.set(0.85, 0.85, 0.5);
      _dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, _dummy.matrix);
      _color.set(getCellColor(cell.c));
      meshRef.current!.setColorAt(i, _color);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [cells, getCellColor]);

  useFrame((state) => {
    if (!meshRef.current) return;
    const now = state.clock.getElapsedTime();

    if (isGold && theme === 'dark' && !reducedMotion) {
      material.emissiveIntensity = 1.1 + Math.sin(now * 1.5) * 0.35;
    }

    if (exhibitionMode !== prevModeRef.current) {
      transitionStartRef.current = now;
      prevModeRef.current = exhibitionMode;
    }
    const elapsed = transitionStartRef.current > 0 ? now - transitionStartRef.current : 999;

    // Entrance animation
    const entranceDone = reducedMotion ? (now - mountTime) > 0.4 : (now - mountTime) > 2.2;

    cells.forEach((cell, i) => {
      const origX = cell.c - 34.5;
      const origY = 3.5 - cell.r;

      // Entrance
      let entScale = 0.85;
      let entZ = 0;
      if (!entranceDone) {
        const age = now - mountTime;
        if (reducedMotion) {
          const t = easeOutCubic(clamp01(age / 0.4));
          entScale = 0.85 * t;
        } else {
          const delay = cell.dist * 0.03 + cell.jitter;
          const t = easeOutCubic(clamp01((age - delay) / 0.9));
          entScale = 0.85 * t;
          entZ = (1 - t) * -18;
          _dummy.rotation.y = (1 - t) * 0.6;
        }
      } else {
        _dummy.rotation.set(0, 0, 0);
      }

      // Mode transition — solid cells recede in exhibition mode
      const destX = origX * 1.25;
      const destY = origY * 1.25;
      const destZ = -20;
      const destScale = 0.15;

      const staggerDelay = reducedMotion ? 0 : cell.dist * 0.012;
      const tCell = easeInOutCubic(clamp01((elapsed - staggerDelay) / 1.0));

      let x, y, z, scale;
      if (exhibitionMode) {
        x = THREE.MathUtils.lerp(origX, destX, tCell);
        y = THREE.MathUtils.lerp(origY, destY, tCell);
        z = THREE.MathUtils.lerp(entZ, destZ, tCell);
        scale = THREE.MathUtils.lerp(entScale, destScale, tCell);
      } else {
        x = THREE.MathUtils.lerp(destX, origX, tCell);
        y = THREE.MathUtils.lerp(destY, origY, tCell);
        z = THREE.MathUtils.lerp(destZ, entZ, tCell);
        scale = THREE.MathUtils.lerp(destScale, entScale, tCell);
      }

      // Breathing wave in logo mode (after entrance)
      if (!exhibitionMode && entranceDone && !reducedMotion) {
        z += Math.sin(now * 1.2 + (origX + origY) * 0.35) * 0.15;
        scale *= 1 + Math.sin(now * 1.2 + origX * 0.35) * 0.02;
      }

      _dummy.position.set(x, y, z);
      _dummy.scale.set(scale, scale, 0.5);
      _dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, _dummy.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, cells.length]} material={material}>
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
};

const SolidInstancedGroup = ({
  cells, getCellColor, exhibitionMode, theme, mountTime, reducedMotion,
}: {
  cells: { r: number; c: number; index: number; dist: number; jitter: number }[];
  getCellColor: (c: number) => string;
  exhibitionMode: boolean;
  theme: Grid3DTheme;
  mountTime: number;
  reducedMotion: boolean;
}) => {
  const goldCells = useMemo(() => cells.filter(c => c.c >= 44), [cells]);
  const otherCells = useMemo(() => cells.filter(c => c.c < 44), [cells]);

  return (
    <>
      {otherCells.length > 0 && (
        <SingleSolidInstancedGroup
          cells={otherCells}
          getCellColor={getCellColor}
          exhibitionMode={exhibitionMode}
          theme={theme}
          mountTime={mountTime}
          reducedMotion={reducedMotion}
          isGold={false}
        />
      )}
      {goldCells.length > 0 && (
        <SingleSolidInstancedGroup
          cells={goldCells}
          getCellColor={getCellColor}
          exhibitionMode={exhibitionMode}
          theme={theme}
          mountTime={mountTime}
          reducedMotion={reducedMotion}
          isGold={true}
        />
      )}
    </>
  );
};

// ─── Textured Instanced Group ─────────────────────────────────────────────────
const TexturedInstancedGroup = ({
  cells, textureUrl, posts, onCellClick, exhibitionMode, photoIdxMap, totalPhotoCount, theme, mountTime, reducedMotion,
}: {
  cells: { r: number; c: number; index: number; dist: number; jitter: number }[];
  textureUrl: string;
  posts: Post[];
  onCellClick: (post: Post) => void;
  exhibitionMode: boolean;
  photoIdxMap: Record<number, number>;
  totalPhotoCount: number;
  theme: Grid3DTheme;
  mountTime: number;
  reducedMotion: boolean;
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const hoverAmountRef = useRef(new Float32Array(cells.length));
  const [hoveredInstanceId, setHoveredInstanceId] = useState<number | null>(null);
  const prevModeRef = useRef(false);
  const transitionStartRef = useRef(0);

  const texture = useTexture(textureUrl);
  texture.colorSpace = THREE.SRGBColorSpace;

  const cfg = GRID3D_THEMES[theme];

  const materials = useMemo(() => {
    const sideMat = new THREE.MeshStandardMaterial({
      color: cfg.colors.sideColor,
      roughness: 0.3,
      metalness: 0.2,
      emissive: new THREE.Color(cfg.colors.emissiveGold),
      emissiveIntensity: cfg.colors.emissiveSideIntensity,
    });
    const frontMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.4, metalness: 0.1 });
    return [sideMat, sideMat, sideMat, sideMat, frontMat, sideMat];
  }, [texture, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!meshRef.current) return;
    cells.forEach((cell, i) => {
      const x = cell.c - 34.5;
      const y = 3.5 - cell.r;
      _dummy.position.set(x, y, 0);
      _dummy.scale.set(0.85, 0.85, 0.5);
      _dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, _dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [cells]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const now = state.clock.getElapsedTime();

    if (exhibitionMode !== prevModeRef.current) {
      transitionStartRef.current = now;
      prevModeRef.current = exhibitionMode;
    }
    const elapsed = transitionStartRef.current > 0 ? now - transitionStartRef.current : 999;
    const entranceDone = reducedMotion ? (now - mountTime) > 0.4 : (now - mountTime) > 2.2;

    const cols = Math.ceil(Math.sqrt(totalPhotoCount));
    const totalRows = Math.ceil(totalPhotoCount / cols);

    cells.forEach((cell, i) => {
      const origX = cell.c - 34.5;
      const origY = 3.5 - cell.r;

      // Damped hover
      const targetHover = hoveredInstanceId === i ? 1 : 0;
      hoverAmountRef.current[i] = THREE.MathUtils.damp(
        hoverAmountRef.current[i], targetHover, 8, delta
      );
      const hoverAmt = hoverAmountRef.current[i];

      // Entrance
      let entScale = 0.85;
      let entZ = 0;
      if (!entranceDone) {
        const age = now - mountTime;
        if (reducedMotion) {
          entScale = 0.85 * easeOutCubic(clamp01(age / 0.4));
        } else {
          const delay = cell.dist * 0.03 + cell.jitter;
          const t = easeOutCubic(clamp01((age - delay) / 0.9));
          entScale = 0.85 * t;
          entZ = (1 - t) * -18;
        }
      }

      const photoIdx = photoIdxMap[cell.index] ?? 0;
      const col = photoIdx % cols;
      const row = Math.floor(photoIdx / cols);
      const destX = (col - (cols - 1) / 2) * 3.4;
      const destY = (row - (totalRows - 1) / 2) * -3.4;
      const destZ = 2.0;
      const destScale = 1.8;

      const staggerDelay = reducedMotion ? 0 : cell.dist * 0.012;
      const tCell = easeInOutCubic(clamp01((elapsed - staggerDelay) / 1.0));

      let x, y, z, scale, rx = 0, ry = 0;
      if (exhibitionMode) {
        x = THREE.MathUtils.lerp(origX, destX, tCell);
        y = THREE.MathUtils.lerp(origY, destY, tCell);
        z = THREE.MathUtils.lerp(entZ, destZ + Math.sin(tCell * Math.PI) * 2.5, tCell);
        ry = (1 - tCell) * 0.5;
        scale = THREE.MathUtils.lerp(entScale, destScale, tCell);
        scale *= 1 + 0.14 * hoverAmt;
        z += 0.6 * hoverAmt;

        if (tCell >= 1 && !reducedMotion) {
          x += Math.sin(now * 0.7 + cell.index) * 0.08;
          y += Math.cos(now * 0.7 + cell.index) * 0.08;
          z += Math.sin(now * 1.1 + cell.index) * 0.12;
          rx = Math.sin(now * 0.4 + cell.index) * 0.04;
          ry += Math.cos(now * 0.4 + cell.index) * 0.04;
        }
      } else {
        x = THREE.MathUtils.lerp(destX, origX, tCell);
        y = THREE.MathUtils.lerp(destY, origY, tCell);
        z = THREE.MathUtils.lerp(destZ, entZ, tCell);
        scale = THREE.MathUtils.lerp(destScale, entScale, tCell);
        scale *= 1 + 0.14 * hoverAmt;
        z += 0.6 * hoverAmt;
      }

      _dummy.position.set(x, y, z);
      _dummy.scale.set(scale, scale, 0.5);
      _dummy.rotation.set(rx, ry, 0);
      _dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, _dummy.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  const handlePointerDown = (e: { instanceId?: number; stopPropagation: () => void }) => {
    e.stopPropagation();
    if (e.instanceId !== undefined) {
      const cell = cells[e.instanceId];
      const boundPost = posts[cell.index % posts.length];
      if (boundPost) onCellClick(boundPost);
    }
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, cells.length]}
      material={materials}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHoveredInstanceId(e.instanceId ?? null);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHoveredInstanceId(null);
        document.body.style.cursor = 'auto';
      }}
      onPointerDown={handlePointerDown}
    >
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
};

// ─── Scene ────────────────────────────────────────────────────────────────────
const Scene = ({
  approvedPosts, onCellClick, activeCells, exhibitionMode, theme, reducedMotion, isCoarse, autoRotate,
}: {
  approvedPosts: Post[];
  onCellClick: (post: Post) => void;
  activeCells: { r: number; c: number; dist: number; jitter: number }[];
  exhibitionMode: boolean;
  theme: Grid3DTheme;
  reducedMotion: boolean;
  isCoarse: boolean;
  autoRotate: boolean;
}) => {
  const { size, camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const mountTime = useRef(0);

  const cfg = GRID3D_THEMES[theme];
  const { tier } = usePerfTier();

  // Capture mount time on first frame
  useFrame((state) => {
    if (mountTime.current === 0) mountTime.current = state.clock.getElapsedTime();
  });

  // Auto-rotation + cursor parallax
  useFrame((state) => {
    if (!groupRef.current) return;
    if (!exhibitionMode && !reducedMotion) {
      const targetY = isCoarse
        ? Math.sin(state.clock.getElapsedTime() * 0.15) * 0.12
        : state.pointer.x * 0.18 + Math.sin(state.clock.getElapsedTime() * 0.15) * 0.06;
      const targetX = isCoarse ? 0 : -state.pointer.y * 0.09;
      groupRef.current.rotation.y = THREE.MathUtils.damp(groupRef.current.rotation.y, targetY, 2.5, state.clock.getDelta?.() ?? 0.016);
      groupRef.current.rotation.x = THREE.MathUtils.damp(groupRef.current.rotation.x, targetX, 2.5, state.clock.getDelta?.() ?? 0.016);
    } else if (exhibitionMode) {
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, 0, 0.08);
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, 0.08);
    }
  });

  useEffect(() => {
    const padding = size.width < 640 ? 6 : 20;
    const calculatedZoom = size.width / (70 + padding);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = Math.max(3.8, Math.min(26, calculatedZoom));
      camera.updateProjectionMatrix();
    }
  }, [size.width, camera]);

  const getCellColor = useCallback((c: number) => getThemeColor(theme, c), [theme]);

  const photoIdxMap = useMemo(() => {
    const map: Record<number, number> = {};
    let count = 0;
    activeCells.forEach((_, idx) => {
      const post = approvedPosts.length > 0 ? approvedPosts[idx % approvedPosts.length] : null;
      const url = post?.thumbnailUrl || post?.thumbnailImagePath;
      if (url) { map[idx] = count++; }
    });
    return { map, total: count };
  }, [activeCells, approvedPosts]);

  const groups = useMemo(() => {
    const grps: Record<string, { r: number; c: number; index: number; dist: number; jitter: number }[]> = {};
    const solid: { r: number; c: number; index: number; dist: number; jitter: number }[] = [];
    activeCells.forEach((cell, idx) => {
      const post = approvedPosts.length > 0 ? approvedPosts[idx % approvedPosts.length] : null;
      const url = post?.thumbnailUrl || post?.thumbnailImagePath;
      if (url) {
        if (!grps[url]) grps[url] = [];
        grps[url].push({ ...cell, index: idx });
      } else {
        solid.push({ ...cell, index: idx });
      }
    });
    return { grps, solid };
  }, [activeCells, approvedPosts]);

  const mt = mountTime.current;

  return (
    <>
      {/* Background color (dark theme only — required for bloom composer alpha fix) */}
      {cfg.bgColor && <color attach="background" args={[cfg.bgColor]} />}
      {cfg.fogColor && cfg.fogFar > 0 && (
        <fog attach="fog" args={[cfg.fogColor, cfg.fogNear, cfg.fogFar]} />
      )}

      <OrbitControls
        enableZoom={true}
        enablePan={true}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 1.5}
        makeDefault
        autoRotate={autoRotate}
        autoRotateSpeed={1.5}
      />

      {/* Lighting */}
      <ambientLight intensity={cfg.ambientIntensity} color={cfg.ambientColor} />
      <directionalLight position={[10, 20, 15]} intensity={cfg.directionalIntensity} color={cfg.directionalColor} />
      <pointLight position={[15, 2, 8]} intensity={cfg.pointLight1Intensity} color={cfg.pointLight1Color} distance={30} />
      <pointLight position={[-15, 0, 5]} intensity={cfg.pointLight2Intensity} color={cfg.pointLight2Color} distance={25} />
      {cfg.rimLightIntensity > 0 && (
        <pointLight position={[0, 6, -12]} intensity={cfg.rimLightIntensity} color={cfg.rimLightColor} distance={40} />
      )}

      {/* Floor glow (dark only) */}
      {cfg.useFloorGlow && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -6, 0]}>
          <planeGeometry args={[60, 20]} />
          <meshBasicMaterial color={cfg.pointLight1Color} transparent opacity={0.10} depthWrite={false} />
        </mesh>
      )}

      {/* Gold dust particles — outside the rotating group for stable field */}
      <GoldParticles theme={theme} tier={tier} exhibitionMode={exhibitionMode} reducedMotion={reducedMotion} />

      {/* Grid Group */}
      <group ref={groupRef}>
        {groups.solid.length > 0 && (
          <SolidInstancedGroup
            cells={groups.solid}
            getCellColor={getCellColor}
            exhibitionMode={exhibitionMode}
            theme={theme}
            mountTime={mt}
            reducedMotion={reducedMotion}
          />
        )}

        {Object.entries(groups.grps).map(([url, cells]) => (
          <TexturedInstancedGroup
            key={url}
            cells={cells}
            textureUrl={url}
            posts={approvedPosts}
            onCellClick={onCellClick}
            exhibitionMode={exhibitionMode}
            photoIdxMap={photoIdxMap.map}
            totalPhotoCount={photoIdxMap.total}
            theme={theme}
            mountTime={mt}
            reducedMotion={reducedMotion}
          />
        ))}
      </group>

      {/* Bloom post-processing (dark theme + high perf only) */}
      <Effects theme={theme} isCoarse={isCoarse} tier={tier} reducedMotion={reducedMotion} />
    </>
  );
};

// ─── Loading Placeholder ──────────────────────────────────────────────────────
const Grid3DPlaceholder = () => (
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-brand-surface z-10">
    <div className="w-10 h-10 border-4 border-brand-primary border-t-transparent rounded-full animate-spin mb-4" />
    <span className="text-sm font-semibold text-brand-textMuted">Đang tải mô hình 3D...</span>
  </div>
);

// ─── Main Export ──────────────────────────────────────────────────────────────
export const Grid3D: React.FC<Grid3DProps> = ({ approvedPosts, onCellClick, theme }) => {
  const [exhibitionMode, setExhibitionMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const { reducedMotion, isCoarse } = usePerfTier();

  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  // Precompute active cells with distance & jitter (stable)
  const activeCells = useMemo(() => {
    const cells: { r: number; c: number; dist: number; jitter: number }[] = [];
    let seed = 42;
    const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; };
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 70; c++) {
        if (IRIS_MASK[r] && IRIS_MASK[r][c] === '█') {
          cells.push({
            r, c,
            dist: Math.hypot(c - 34.5, (3.5 - r) * 2),
            jitter: rand() * 0.15,
          });
        }
      }
    }
    return cells;
  }, []);

  return (
    <div className={isFullscreen ? "fixed inset-0 w-screen h-screen z-50 bg-brand-bg/98 backdrop-blur-lg flex flex-col p-4" : "w-full flex flex-col items-center py-4 relative"}>
      <div className={isFullscreen ? "flex-1 w-full relative overflow-hidden bg-brand-card border border-brand-border/60 rounded-3xl animate-fadeIn" : "w-full aspect-[16/7] min-h-[300px] sm:min-h-[450px] md:min-h-[550px] overflow-hidden relative rounded-3xl border border-brand-border/60 bg-brand-card shadow-sm"}>
        <CanvasErrorBoundary>
          <React.Suspense fallback={<Grid3DPlaceholder />}>
            <Canvas
              orthographic
              camera={{ position: [0, 4, 30], zoom: 20, near: 0.1, far: 1000 }}
              gl={{ antialias: true, alpha: theme === 'light' }}
              dpr={[1, isCoarse ? 1.5 : 1.75]}
            >
              <Scene
                approvedPosts={approvedPosts}
                onCellClick={onCellClick}
                activeCells={activeCells}
                exhibitionMode={exhibitionMode}
                theme={theme}
                reducedMotion={reducedMotion}
                isCoarse={isCoarse}
                autoRotate={autoRotate}
              />
            </Canvas>
          </React.Suspense>
        </CanvasErrorBoundary>

        {/* Floating Controls */}
        {isFullscreen ? (
          /* Fullscreen Close/Minimize Button Floating Top-Right */
          <button
            onClick={() => setIsFullscreen(false)}
            className="absolute top-4 right-4 p-2.5 bg-brand-card hover:bg-brand-surface border border-brand-border text-brand-textSecondary hover:text-brand-primary rounded-full transition-all active:scale-95 z-20 shadow-md flex items-center justify-center"
            title="Thu nhỏ"
          >
            <Minimize2 className="w-4.5 h-4.5" />
          </button>
        ) : (
          /* Normal Mode Controls Floating Bottom-Right */
          <div className="absolute bottom-4 right-4 flex items-center gap-2 z-20">
            <button
              onClick={() => setExhibitionMode(!exhibitionMode)}
              className="flex items-center gap-2 px-4 py-2.5 bg-brand-card hover:bg-brand-surface border border-brand-border rounded-full text-xs font-bold text-brand-primary hover:text-brand-secondary hover:border-brand-secondary/50 transition-all active:scale-95 shadow-sm"
            >
              {exhibitionMode ? (
                <><SparklesIcon className="w-4 h-4 text-brand-secondary" /> Xếp chữ IRIS 15</>
              ) : (
                <><Grid className="w-4 h-4 text-brand-secondary" /> Triển lãm ảnh</>
              )}
            </button>
            <button
              onClick={() => setIsFullscreen(true)}
              className="p-2.5 bg-brand-card hover:bg-brand-surface border border-brand-border text-brand-textSecondary hover:text-brand-primary rounded-full transition-all active:scale-95 shadow-sm"
              title="Xem toàn màn hình"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Fullscreen Footer Controls */}
      {isFullscreen && (
        <div className="flex flex-wrap items-center justify-center gap-3 py-3 border-t border-brand-border/60 shrink-0 mt-4 w-full select-none">
          <button
            onClick={() => setExhibitionMode(!exhibitionMode)}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-card hover:bg-brand-surface border border-brand-border rounded-xl text-xs font-bold text-brand-primary hover:text-brand-secondary hover:border-brand-secondary/50 transition-all active:scale-95 shadow-sm"
          >
            {exhibitionMode ? (
              <><SparklesIcon className="w-4 h-4 text-brand-secondary" /> Xếp chữ IRIS 15</>
            ) : (
              <><Grid className="w-4 h-4 text-brand-secondary" /> Triển lãm ảnh</>
            )}
          </button>

          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`flex items-center gap-2 px-5 py-2.5 border rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm ${
              autoRotate
                ? 'bg-brand-primary text-white border-brand-primary shadow-glow-primary'
                : 'bg-brand-card hover:bg-brand-surface border-brand-border text-brand-textSecondary hover:text-brand-textPrimary hover:border-brand-primary/50'
            }`}
          >
            <RotateCw className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }} />
            <span>Tự động xoay: {autoRotate ? 'BẬT' : 'TẮT'}</span>
          </button>
        </div>
      )}

      {/* Hint */}
      {!isFullscreen && (
        <p className="text-[10px] text-brand-textMuted font-bold tracking-wide flex items-center gap-1.5 mt-5 opacity-75 select-none">
          <SparklesIcon className="w-3.5 h-3.5 text-brand-secondary" />
          Kéo chuột để xoay 360° • Cuộn để phóng to • Chuột phải kéo để di chuyển camera
        </p>
      )}
    </div>
  );
}
