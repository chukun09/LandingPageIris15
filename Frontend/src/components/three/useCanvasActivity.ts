import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

/**
 * Dừng hẳn vòng lặp vẽ khi khung 3D không được nhìn.
 *
 * Khung 3D nằm giữa trang; khi người dùng cuộn xuống đọc Bức tường ký ức thì nó
 * đã khuất hoàn toàn nhưng vẫn vẽ đủ 60 khung hình mỗi giây. Đây là khoản tiết
 * kiệm pin và CPU lớn nhất của cả trang, nhất là trên điện thoại tại sự kiện.
 */
export function useCanvasActivity(baseFrameloop: 'always' | 'demand') {
  const gl = useThree((state) => state.gl);
  const setFrameloop = useThree((state) => state.setFrameloop);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const canvas = gl.domElement;
    const target = canvas.parentElement ?? canvas;

    let visible = true;
    let hidden = document.hidden;

    const apply = () => {
      const active = visible && !hidden;
      setFrameloop(active ? baseFrameloop : 'never');
      if (active) invalidate();
    };

    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              visible = entries.some((e) => e.isIntersecting);
              apply();
            },
            { threshold: 0.05 },
          )
        : null;
    observer?.observe(target);

    const onVisibility = () => {
      hidden = document.hidden;
      apply();
    };
    document.addEventListener('visibilitychange', onVisibility);

    apply();
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      setFrameloop(baseFrameloop);
    };
  }, [gl, setFrameloop, invalidate, baseFrameloop]);
}

/**
 * Ngân sách pixel thay cho một hệ số DPR cố định.
 *
 * Với DPR cố định 1.75, canvas desktop toàn màn hình vẽ 4.7 triệu điểm ảnh còn
 * canvas điện thoại chỉ vẽ 0.2 triệu — hai ngân sách chênh nhau hơn 20 lần.
 */
export function dprForBudget(cssWidth: number, cssHeight: number, lowTier: boolean): number {
  const budget = lowTier ? 1.3e6 : 2.4e6;
  const area = Math.max(1, cssWidth * cssHeight);
  const device = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.max(1, Math.min(device, Math.min(2, Math.sqrt(budget / area))));
}
