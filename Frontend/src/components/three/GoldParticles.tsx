import { Sparkles } from '@react-three/drei';
import type { Grid3DTheme } from './themeConfig';
import { GRID3D_THEMES } from './themeConfig';

interface GoldParticlesProps {
  theme: Grid3DTheme;
  tier: 'high' | 'low';
  exhibitionMode: boolean;
  reducedMotion: boolean;
  /** Bề rộng hình chữ theo đơn vị lưới, để bụi trải đúng phạm vi. */
  spread: number;
}

/** Bụi trong luồng đèn an toàn của phòng tối. Chỉ có ở theme tối. */
export function GoldParticles({ theme, tier, exhibitionMode, reducedMotion, spread }: GoldParticlesProps) {
  if (reducedMotion || theme !== 'dark') return null;

  const cfg = GRID3D_THEMES[theme];
  const opacity = cfg.sparkleOpacity * (exhibitionMode ? 0.35 : 1);
  if (opacity < 0.01) return null;

  // Máy yếu chỉ giữ một lớp và giảm mạnh số hạt.
  const count = tier === 'high' ? 140 : 45;
  const depth = spread * 0.12;

  return (
    <>
      <Sparkles
        count={count}
        scale={[spread * 1.05, depth * 1.6, depth]}
        position={[0, 0, -depth * 0.4]}
        size={4}
        speed={0.22}
        opacity={opacity}
        color={cfg.sparkleColor}
        noise={1.2}
      />
      {tier === 'high' && (
        <Sparkles
          count={36}
          scale={[spread * 0.5, depth, depth * 0.7]}
          position={[0, 0, depth * 0.5]}
          size={7}
          speed={0.14}
          opacity={opacity * 0.65}
          color={cfg.sparkleColor}
          noise={0.8}
        />
      )}
    </>
  );
}
