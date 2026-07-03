import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import type { Grid3DTheme } from './themeConfig';

interface EffectsProps {
  theme: Grid3DTheme;
  isCoarse: boolean;
  tier: 'high' | 'low';
  reducedMotion: boolean;
}

export function Effects({ theme, isCoarse, tier, reducedMotion }: EffectsProps) {
  if (theme !== 'dark' || tier === 'low' || reducedMotion) return null;

  return (
    <EffectComposer multisampling={isCoarse ? 0 : 4}>
      <Bloom
        mipmapBlur
        intensity={0.85}
        luminanceThreshold={0.75}
        luminanceSmoothing={0.2}
        radius={0.7}
        levels={6}
      />
      <Vignette offset={0.25} darkness={0.5} eskil={false} />
    </EffectComposer>
  );
}
