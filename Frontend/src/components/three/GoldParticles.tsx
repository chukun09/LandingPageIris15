import { Sparkles } from '@react-three/drei';
import type { Grid3DTheme } from './themeConfig';
import { GRID3D_THEMES } from './themeConfig';

interface GoldParticlesProps {
  theme: Grid3DTheme;
  tier: 'high' | 'low';
  exhibitionMode: boolean;
  reducedMotion: boolean;
}

export function GoldParticles({ theme, tier, exhibitionMode, reducedMotion }: GoldParticlesProps) {
  if (reducedMotion) return null;

  const cfg = GRID3D_THEMES[theme];
  const opacity = cfg.sparkleOpacity * (exhibitionMode ? 0.4 : 1);

  if (opacity < 0.01) return null;

  const count = tier === 'high' ? 180 : 60;

  return (
    <>
      {/* Background dust layer */}
      <Sparkles
        count={count}
        scale={[70, 14, 14]}
        position={[0, 0, -4]}
        size={4}
        speed={0.25}
        opacity={opacity}
        color={cfg.sparkleColor}
        noise={1.2}
      />
      {/* Foreground bokeh — dark + high only */}
      {theme === 'dark' && tier === 'high' && (
        <Sparkles
          count={40}
          scale={[30, 10, 8]}
          position={[0, 0, 3]}
          size={7}
          speed={0.15}
          opacity={opacity * 0.7}
          color={cfg.sparkleColor}
          noise={0.8}
        />
      )}
    </>
  );
}
