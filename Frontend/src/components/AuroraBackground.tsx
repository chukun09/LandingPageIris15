import { useMemo } from 'react';

export function AuroraBackground() {
  const particles = useMemo(() => {
    return Array.from({ length: 28 }, (_, i) => ({
      id: i,
      left: `${(i * 37 + 11) % 100}%`,
      top: `${(i * 53 + 7) % 100}%`,
      size: `${((i * 13) % 4) + 2}px`,
      duration: `${((i * 7) % 6) + 7}s`,
      delay: `${((i * 3) % 5)}s`,
    }));
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-brand-bg to-brand-bgDeep" />

      {/* Aurora blobs — gold */}
      <div
        className="absolute top-[-20%] right-[10%] w-[60vw] h-[60vw] rounded-full opacity-[0.14] blur-[110px] will-change-transform animate-aurora"
        style={{
          background: 'radial-gradient(ellipse, rgb(var(--c-secondary)) 0%, transparent 70%)',
          animationDelay: '0s',
        }}
      />
      {/* Aurora blobs — blue */}
      <div
        className="absolute bottom-[-10%] left-[5%] w-[50vw] h-[50vw] rounded-full opacity-[0.16] blur-[110px] will-change-transform animate-aurora"
        style={{
          background: 'radial-gradient(ellipse, rgb(var(--c-primary)) 0%, transparent 70%)',
          animationDelay: '-8s',
        }}
      />
      {/* Aurora blobs — violet */}
      <div
        className="absolute top-[40%] left-[40%] w-[40vw] h-[40vw] rounded-full opacity-[0.10] blur-[110px] will-change-transform animate-aurora"
        style={{
          background: 'radial-gradient(ellipse, rgba(126,34,206,1) 0%, transparent 70%)',
          animationDelay: '-16s',
        }}
      />

      {/* Gold particle dust — visible in dark, subtle in light */}
      {particles.map(p => (
        <span
          key={p.id}
          className="absolute rounded-full bg-brand-secondary dark:opacity-40 opacity-[0.08] animate-float-slow"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            animationDuration: p.duration,
            animationDelay: p.delay,
          }}
        />
      ))}
    </div>
  );
}
