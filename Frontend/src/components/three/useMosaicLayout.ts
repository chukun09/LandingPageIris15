import { useEffect, useMemo, useState } from 'react';
import type { MosaicGeometry, MosaicLayoutResponse } from '../../types/mosaic';

/**
 * Lấy bố cục khảm từ máy chủ và chuyển sang mảng phẳng.
 *
 * Trước đây mặt nạ chữ được chép tay ở cả frontend lẫn backend và hai bản đã
 * lệch nhau, khiến khung 3D và file in hiển thị hai chữ khác nhau. Giờ chỉ có
 * một nguồn duy nhất.
 */
export function useMosaicLayout() {
  const [raw, setRaw] = useState<MosaicLayoutResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/mosaic/layout', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Không lấy được bố cục khảm (HTTP ${res.status})`);
        return res.json() as Promise<MosaicLayoutResponse>;
      })
      .then(setRaw)
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err : new Error(String(err)));
      });

    return () => controller.abort();
  }, []);

  const geometry = useMemo<MosaicGeometry | null>(() => (raw ? toGeometry(raw) : null), [raw]);

  return { layout: raw, geometry, error, loading: !raw && !error };
}

function toGeometry(layout: MosaicLayoutResponse): MosaicGeometry {
  const { rows, cols } = layout.lattice;
  const n = layout.tiles.length;

  const centerX = new Float32Array(n);
  const centerY = new Float32Array(n);
  const sizeX = new Float32Array(n);
  const sizeY = new Float32Array(n);
  const dist = new Float32Array(n);
  const jitter = new Float32Array(n);
  const slot = new Int32Array(n);
  const sheetIndex = new Int32Array(n);
  const gold = new Uint8Array(n);
  const postId = new Int32Array(n);
  const letterId: string[] = new Array(n);

  const tintById = new Map(layout.letters.map((l) => [l.id, l.tintRole]));

  // Bộ sinh số Lehmer có hạt giống cố định: nhiễu phải giống nhau qua mọi lần
  // tải trang, nếu không hiệu ứng vào sẽ nhấp nháy khác nhau mỗi lần.
  let seed = 42;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  let maxDist = 1;

  for (let i = 0; i < n; i++) {
    const t = layout.tiles[i];
    const [ux, uy, uw, uh] = t.u;

    const cx = ux + uw / 2 - cols / 2;
    const cy = rows / 2 - (uy + uh / 2);

    centerX[i] = cx;
    centerY[i] = cy;
    sizeX[i] = uw;
    sizeY[i] = uh;

    // Nhân trục dọc để hiệu ứng toả ra theo hình elip hợp với chữ rất dẹt.
    const d = Math.hypot(cx, cy * 2.2);
    dist[i] = d;
    if (d > maxDist) maxDist = d;

    jitter[i] = rand() * 0.15;
    slot[i] = t.postId >= 0 ? t.rank : -1;
    sheetIndex[i] = t.rank;
    gold[i] = tintById.get(t.letterId) === 'gold' ? 1 : 0;
    postId[i] = t.postId;
    letterId[i] = t.letterId;
  }

  // Chuẩn hoá về [0,1] để thời lượng hiệu ứng không đổi khi lưới đổi độ phân giải.
  for (let i = 0; i < n; i++) dist[i] /= maxDist;

  return {
    layoutId: layout.layoutId,
    count: n,
    photoCount: layout.photoCount,
    rows,
    cols,
    centerX,
    centerY,
    sizeX,
    sizeY,
    dist,
    jitter,
    slot,
    sheetIndex,
    gold,
    postId,
    letterId,
    letters: layout.letters,
  };
}
