import { useEffect, useRef, useState } from 'react';

interface Options {
  /** Tải trước khi phần tử thực sự lọt vào khung nhìn. Mặc định 400px. */
  rootMargin?: string;
  /**
   * Nạp sẵn sau khi trang rảnh, kể cả khi người dùng chưa cuộn tới.
   * Cuộn xuống sẽ thấy ngay thay vì phải chờ tải chunk.
   */
  prefetch?: () => Promise<unknown>;
  /** Hạn chờ tối đa trước khi ép prefetch chạy. Mặc định 3000ms. */
  prefetchTimeout?: number;
}

const supportsIdle =
  typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function';

const scheduleIdle: (cb: () => void, timeout: number) => number = supportsIdle
  ? (cb, timeout) => window.requestIdleCallback(cb, { timeout })
  : (cb, timeout) => window.setTimeout(cb, Math.min(timeout, 1000));

const cancelIdle: (handle: number) => void = supportsIdle
  ? (handle) => window.cancelIdleCallback(handle)
  : (handle) => window.clearTimeout(handle);

/**
 * Trả về ref để gắn vào vùng chứa và cờ `visible` bật một lần duy nhất
 * khi vùng đó sắp lọt vào khung nhìn. Dùng để hoãn mount các chunk nặng.
 */
export function useLazyOnVisible<T extends HTMLElement = HTMLDivElement>({
  rootMargin = '400px',
  prefetch,
  prefetchTimeout = 3000,
}: Options = {}) {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Trình duyệt không hỗ trợ thì hiển thị luôn, không chặn nội dung.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  useEffect(() => {
    if (!prefetch) return;
    let cancelled = false;
    const handle = scheduleIdle(() => {
      if (!cancelled) void prefetch().catch(() => {});
    }, prefetchTimeout);
    return () => {
      cancelled = true;
      cancelIdle(handle);
    };
    // prefetch là hàm import tĩnh, không đổi giữa các lần render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefetchTimeout]);

  return { ref, visible };
}
