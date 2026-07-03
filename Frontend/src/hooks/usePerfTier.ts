import { useMemo } from 'react';

interface PerfTier {
  tier: 'high' | 'low';
  reducedMotion: boolean;
  isCoarse: boolean;
}

export function usePerfTier(): PerfTier {
  return useMemo(() => {
    const isCoarse = window.matchMedia('(pointer: coarse)').matches;
    const dpr = window.devicePixelRatio ?? 1;
    const cores = navigator.hardwareConcurrency ?? 4;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const low = (isCoarse && dpr > 2) || cores <= 4;

    return { tier: low ? 'low' : 'high', reducedMotion, isCoarse };
  }, []);
}
