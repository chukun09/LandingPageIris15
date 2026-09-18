import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Grid, Maximize2, Minimize2, RotateCw } from 'lucide-react';
import { Effects } from './three/Effects';
import { GoldParticles } from './three/GoldParticles';
import { MosaicMesh } from './three/MosaicMesh';
import { GRID3D_THEMES } from './three/themeConfig';
import type { Grid3DTheme } from './three/themeConfig';
import { useMosaicLayout } from './three/useMosaicLayout';
import { dprForBudget, useCanvasActivity } from './three/useCanvasActivity';
import { usePerfTier } from '../hooks/usePerfTier';
import type { MosaicGeometry } from '../types/mosaic';

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
  targetPostId?: number | null;
  onClearTarget?: () => void;
}

class CanvasErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown, info: unknown) {
    console.error('Canvas Error Boundary:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-brand-surface p-6 text-center z-10">
          <p className="text-sm font-semibold text-brand-textSecondary mb-2">Không hiển thị được mô hình 3D</p>
          <p className="text-xs text-brand-textMuted">Tải lại trang hoặc kiểm tra kết nối mạng.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Ánh sáng, camera và mọi thứ sống bên trong Canvas. */
function Scene({
  geometry,
  theme,
  exhibitionMode,
  autoRotate,
  onTileClick,
}: {
  geometry: MosaicGeometry;
  theme: Grid3DTheme;
  exhibitionMode: boolean;
  autoRotate: boolean;
  onTileClick: (postId: number) => void;
}) {
  const { size, camera, gl } = useThree();
  const { tier, reducedMotion, isCoarse } = usePerfTier();
  const lowTier = tier === 'low';
  const cfg = GRID3D_THEMES[theme];

  useCanvasActivity(reducedMotion ? 'demand' : 'always');

  // alpha là thuộc tính ngữ cảnh WebGL, bất biến sau khi tạo — nên nền phải đổi
  // bằng clearColor. Cách cũ đặt alpha theo theme và bị nền đen khi sang light.
  useEffect(() => {
    gl.setClearColor(new THREE.Color(cfg.clearColor), 1);
  }, [gl, cfg.clearColor]);

  useEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    const padding = size.width < 640 ? geometry.cols * 0.06 : geometry.cols * 0.16;
    camera.zoom = Math.max(1, size.width / (geometry.cols + padding));
    camera.updateProjectionMatrix();
  }, [size.width, camera, geometry.cols]);

  const keyDistance = geometry.cols * 0.9;

  return (
    <>
      {cfg.fogColor && cfg.fogFarFactor > 0 && (
        <fog
          attach="fog"
          args={[cfg.fogColor, geometry.cols * cfg.fogNearFactor, geometry.cols * cfg.fogFarFactor]}
        />
      )}

      <OrbitControls
        makeDefault
        enableZoom
        enablePan
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 1.5}
        autoRotate={autoRotate}
        autoRotateSpeed={1.2}
      />

      <ambientLight intensity={cfg.ambientIntensity} color={cfg.ambientColor} />
      <directionalLight position={[20, 40, 60]} intensity={cfg.directionalIntensity} color={cfg.directionalColor} />
      <pointLight
        position={[geometry.cols * 0.35, geometry.rows * 0.4, geometry.rows * 1.2]}
        intensity={cfg.keyLightIntensity}
        color={cfg.keyLightColor}
        distance={keyDistance}
      />
      <pointLight
        position={[-geometry.cols * 0.35, 0, geometry.rows]}
        intensity={cfg.fillLightIntensity}
        color={cfg.fillLightColor}
        distance={keyDistance}
      />
      {cfg.rimLightIntensity > 0 && (
        <pointLight
          position={[0, geometry.rows * 0.5, -geometry.rows * 1.5]}
          intensity={cfg.rimLightIntensity}
          color={cfg.rimLightColor}
          distance={keyDistance}
        />
      )}

      {cfg.useFloorGlow && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -geometry.rows * 0.85, 0]}>
          <planeGeometry args={[geometry.cols * 1.1, geometry.rows * 1.4]} />
          <meshBasicMaterial color={cfg.keyLightColor} transparent opacity={0.08} depthWrite={false} />
        </mesh>
      )}

      <GoldParticles
        theme={theme}
        tier={tier}
        exhibitionMode={exhibitionMode}
        reducedMotion={reducedMotion}
        spread={geometry.cols}
      />

      <MosaicMesh
        geometry={geometry}
        theme={theme}
        exhibitionMode={exhibitionMode}
        reducedMotion={reducedMotion}
        isCoarse={isCoarse}
        lowTier={lowTier}
        onTileClick={onTileClick}
      />

      <Effects theme={theme} isCoarse={isCoarse} tier={tier} reducedMotion={reducedMotion} />
    </>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-brand-surface z-10 gap-3">
      <div className="w-9 h-9 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-xs font-semibold text-brand-textMuted font-mono tracking-wide">{label}</span>
    </div>
  );
}

export const Grid3D = ({
  approvedPosts,
  onCellClick,
  theme,
  targetPostId,
  onClearTarget,
}: Grid3DProps) => {
  const [exhibitionMode, setExhibitionMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { geometry, error, loading } = useMosaicLayout();
  const { tier } = usePerfTier();

  const postsById = useMemo(() => new Map(approvedPosts.map((p) => [p.id, p])), [approvedPosts]);

  const targetInfo = useMemo(() => {
    if (!targetPostId || !geometry) return null;
    for (let i = 0; i < geometry.count; i++) {
      if (geometry.postId[i] === targetPostId) {
        const lid = geometry.letterId[i];
        const letterObj = geometry.letters.find((l) => l.id === lid);
        return {
          char: letterObj?.char || 'IRIS',
          role: letterObj?.tintRole || 'gold',
          index: i + 1,
        };
      }
    }
    return null;
  }, [targetPostId, geometry]);

  useEffect(() => {
    if (targetPostId) {
      setExhibitionMode(false);
    }
  }, [targetPostId]);

  const handleTileClick = useCallback(
    (postId: number) => {
      const post = postsById.get(postId);
      if (post) onCellClick(post);
    },
    [postsById, onCellClick],
  );

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

  const [viewport, setViewport] = useState({ width: 1200, height: 520 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setViewport({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const maxDpr = dprForBudget(viewport.width, viewport.height, tier === 'low');

  const shell = isFullscreen
    ? 'fixed inset-0 w-screen h-screen z-50 bg-brand-bg/98 backdrop-blur-lg flex flex-col p-4'
    : 'w-full flex flex-col items-center py-4 relative';
  const frame = isFullscreen
    ? 'flex-1 w-full relative overflow-hidden bg-brand-card border border-brand-border/60 rounded-lg'
    : 'w-full aspect-[16/7] min-h-[300px] sm:min-h-[450px] md:min-h-[550px] overflow-hidden relative rounded-lg border border-brand-border/60 bg-brand-card';

  return (
    <div className={shell}>
      <div ref={containerRef} className={frame}>
        {targetInfo && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900/95 border border-amber-400/80 backdrop-blur-md px-4 py-2 rounded-xl text-xs font-bold text-amber-300 flex items-center gap-2.5 z-30 shadow-2xl animate-bounce">
            <span>🎯 Vị trí ảnh của bạn nằm trên chữ:</span>
            <span className="text-sm font-black px-2.5 py-0.5 rounded-lg bg-amber-400 text-slate-950 font-mono shadow">
              {targetInfo.char}
            </span>
            <span className="text-[11px] text-amber-200/80 hidden sm:inline">
              ({targetInfo.role === 'gold' ? 'cụm IRIS' : 'cụm 15'})
            </span>
            {onClearTarget && (
              <button
                onClick={onClearTarget}
                className="ml-1 text-amber-300 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
                title="Đóng định vị"
              >
                ✕
              </button>
            )}
          </div>
        )}

        <CanvasErrorBoundary>
          {loading && <Placeholder label="ĐANG DỰNG BỐ CỤC…" />}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center z-10">
              <p className="text-xs text-brand-textMuted">{error.message}</p>
            </div>
          )}
          {geometry && (
            <Canvas
              orthographic
              camera={{ position: [0, geometry.rows * 0.15, geometry.cols], near: 0.1, far: geometry.cols * 6 }}
              // alpha luôn bật; nền do clearColor quyết định theo theme.
              gl={{ alpha: true, antialias: tier === 'low', powerPreference: 'high-performance', stencil: false }}
              dpr={[1, maxDpr]}
              performance={{ min: 0.5 }}
            >
              <Scene
                geometry={geometry}
                theme={theme}
                exhibitionMode={exhibitionMode}
                autoRotate={autoRotate}
                onTileClick={handleTileClick}
              />
            </Canvas>
          )}
        </CanvasErrorBoundary>

        {isFullscreen ? (
          <button
            onClick={() => setIsFullscreen(false)}
            className="absolute top-4 right-4 p-2.5 bg-brand-card hover:bg-brand-surface border border-brand-border text-brand-textSecondary hover:text-brand-primary rounded-lg transition-all active:scale-95 z-20"
            title="Thu nhỏ"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        ) : null}

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
          <button
            onClick={() => setExhibitionMode((v) => !v)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-brand-card/90 backdrop-blur border border-brand-border text-[11px] font-bold tracking-wide text-brand-textSecondary hover:text-brand-primary hover:border-brand-primary/40 transition-all active:scale-95"
          >
            <Grid className="w-3.5 h-3.5" />
            {exhibitionMode ? 'XẾP CHỮ IRIS 15' : 'BẢN CONTACT SHEET'}
          </button>
          {!isFullscreen && (
            <button
              onClick={() => setIsFullscreen(true)}
              className="p-2 rounded-lg bg-brand-card/90 backdrop-blur border border-brand-border text-brand-textSecondary hover:text-brand-primary transition-all active:scale-95"
              title="Toàn màn hình"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
          {isFullscreen && (
            <button
              onClick={() => setAutoRotate((v) => !v)}
              className={`p-2 rounded-lg bg-brand-card/90 backdrop-blur border transition-all active:scale-95 ${
                autoRotate
                  ? 'border-brand-primary/50 text-brand-primary'
                  : 'border-brand-border text-brand-textSecondary'
              }`}
              title="Tự xoay"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {geometry && (
        <p className="mt-3 text-[10px] font-mono tracking-wider text-brand-textMuted text-center">
          {geometry.photoCount} / {geometry.count} Ô
          {geometry.count - geometry.photoCount > 0 && ` · ${geometry.count - geometry.photoCount} Ô CHỜ ẢNH`}
          {' · LƯỚI '}
          {geometry.rows}×{geometry.cols}
        </p>
      )}
    </div>
  );
};
