import { EffectComposer, Bloom, Vignette, SMAA } from '@react-three/postprocessing';
import type { Grid3DTheme } from './themeConfig';

interface EffectsProps {
  theme: Grid3DTheme;
  isCoarse: boolean;
  tier: 'high' | 'low';
  reducedMotion: boolean;
}

/**
 * Khi có EffectComposer, cảnh được vẽ vào render target riêng nên khử răng cưa
 * của framebuffer mặc định hoàn toàn vô ích — thứ duy nhất vẽ ra đó là một hình
 * chữ nhật toàn màn hình. Vì vậy máy khoẻ dùng SMAA trong chuỗi hậu kỳ, còn máy
 * yếu bỏ hẳn composer và dùng MSAA phần cứng (rẻ hơn trên GPU tile-based).
 */
export function Effects({ theme, isCoarse, tier, reducedMotion }: EffectsProps) {
  if (tier === 'low' || reducedMotion) return null;

  const withBloom = theme === 'dark';

  return (
    <EffectComposer multisampling={0}>
      {withBloom ? (
        <Bloom
          mipmapBlur
          // Chuỗi bloom ở độ phân giải đầy đủ tốn nhiều bộ nhớ hơn cả sprite atlas.
          resolutionScale={0.5}
          intensity={0.7}
          luminanceThreshold={0.72}
          luminanceSmoothing={0.22}
          radius={0.68}
        />
      ) : (
        <></>
      )}
      {withBloom ? <Vignette offset={0.28} darkness={0.45} eskil={false} /> : <></>}
      {isCoarse ? <></> : <SMAA />}
    </EffectComposer>
  );
}
