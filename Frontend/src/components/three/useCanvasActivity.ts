import { useEffect, useState, type RefObject } from 'react';
import { useThree } from '@react-three/fiber';

export type Frameloop = 'always' | 'demand' | 'never';

/**
 * Dừng hẳn vòng lặp vẽ khi khung 3D không được nhìn.
 *
 * Khung 3D nằm giữa trang; khi người dùng cuộn xuống đọc Bức tường ký ức thì nó
 * đã khuất hoàn toàn nhưng vẫn vẽ đủ 60 khung hình mỗi giây. Đây là khoản tiết
 * kiệm pin và CPU lớn nhất của cả trang, nhất là trên điện thoại tại sự kiện.
 * Overlay toàn màn hình (modal chi tiết, upload...) cũng che khung 3D nhưng
 * IntersectionObserver không biết điều đó, nên nơi gọi truyền thêm `paused`.
 *
 * Kết quả phải truyền thẳng vào prop `frameloop` của <Canvas>: mỗi lần Canvas
 * render, R3F đặt lại frameloop theo prop, nên gọi setFrameloop từ bên trong
 * Canvas sẽ bị ghi đè (vd. đóng modal khi khung 3D đang khuất → vẽ lại 60 fps).
 */
export function useCanvasFrameloop(
  targetRef: RefObject<HTMLElement | null>,
  baseFrameloop: 'always' | 'demand',
  paused: boolean,
): Frameloop {
  const [visible, setVisible] = useState(true);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);

  useEffect(() => {
    const target = targetRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((e) => e.isIntersecting)),
      { threshold: 0.05 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetRef]);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return visible && !hidden && !paused ? baseFrameloop : 'never';
}

/** Vẽ lại một khung khi vòng lặp chạy lại — chế độ 'demand' không tự vẽ. */
export function useInvalidateOnResume() {
  const frameloop = useThree((state) => state.frameloop);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (frameloop !== 'never') invalidate();
  }, [frameloop, invalidate]);
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
