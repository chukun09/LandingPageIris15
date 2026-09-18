import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  vRot: number;
  shape: 'rect' | 'circle' | 'star';
  opacity: number;
  life: number;
  maxLife: number;
}

// Bộ màu vàng kim hoàng gia kết hợp xanh ngọc và trắng tinh khôi
const GOLD_PALETTE = [
  '#F5D77F', '#D4AF37', '#E5A93C', '#FFFBEB', '#38BDF8', '#FBBF24', '#F43F5E'
];

let globalTrigger: ((originX?: number, originY?: number) => void) | null = null;

/**
 * Hàm toàn cục để kích hoạt pháo hoa hạt vàng từ bất kỳ component nào.
 */
export function fireCelebration(originX?: number, originY?: number) {
  if (globalTrigger) {
    globalTrigger(originX, originY);
  }
}

export const CelebrationConfetti: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animIdRef = useRef<number | null>(null);

  const spawnBurst = (originX?: number, originY?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const startX = originX ?? window.innerWidth / 2;
    const startY = originY ?? window.innerHeight * 0.45;

    const count = 75;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = Math.random() * 9 + 4;
      const shapes: ('rect' | 'circle' | 'star')[] = ['rect', 'circle', 'star'];

      particlesRef.current.push({
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3.5,
        size: Math.random() * 8 + 4,
        color: GOLD_PALETTE[Math.floor(Math.random() * GOLD_PALETTE.length)],
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.25,
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        opacity: 1,
        life: 0,
        maxLife: Math.random() * 50 + 60,
      });
    }

    if (!animIdRef.current) {
      loop();
    }
  };

  const loop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const list = particlesRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18; // trọng lực nhẹ
      p.vx *= 0.98; // lực cản không khí
      p.rotation += p.vRot;
      p.opacity = Math.max(0, 1 - p.life / p.maxLife);

      if (p.opacity <= 0 || p.y > canvas.height + 20) {
        list.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;

      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Ngôi sao 4 cánh lấp lánh
        ctx.beginPath();
        const r = p.size / 1.8;
        ctx.moveTo(0, -r);
        ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.quadraticCurveTo(0, 0, 0, r);
        ctx.quadraticCurveTo(0, 0, -r, 0);
        ctx.quadraticCurveTo(0, 0, 0, -r);
        ctx.fill();
      }
      ctx.restore();
    }

    if (list.length > 0) {
      animIdRef.current = requestAnimationFrame(loop);
    } else {
      animIdRef.current = null;
    }
  };

  useEffect(() => {
    globalTrigger = spawnBurst;

    const handleResize = () => {
      if (!canvasRef.current) return;
      canvasRef.current.width = window.innerWidth;
      canvasRef.current.height = window.innerHeight;
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      globalTrigger = null;
      window.removeEventListener('resize', handleResize);
      if (animIdRef.current) cancelAnimationFrame(animIdRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50"
      aria-hidden="true"
    />
  );
};
