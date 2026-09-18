import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

export interface AtlasInfo {
  texture: THREE.Texture;
  columns: number;
  rows: number;
  width: number;
  height: number;
  tile: number;
}

const ATLAS_WIDTH = 2048;

/** Texture xám 4×4 gắn từ khung hình đầu tiên. */
function makePlaceholder(): THREE.Texture {
  const data = new Uint8Array(4 * 4 * 4).fill(90);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const tex = new THREE.DataTexture(data, 4, 4, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const scheduleIdle: (cb: () => void, timeout: number) => number =
  typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'
    ? (cb, timeout) => window.requestIdleCallback(cb, { timeout })
    : (cb, timeout) => window.setTimeout(cb, Math.min(timeout, 300));

const cancelIdle: (handle: number) => void =
  typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function'
    ? (handle) => window.cancelIdleCallback(handle)
    : (handle) => window.clearTimeout(handle);

/**
 * Nạp sprite atlas.
 *
 * Không dùng useTexture/Suspense: cách đó chặn toàn bộ canvas cho tới khi ảnh
 * cuối cùng về. Ở đây khung 3D dựng ngay với texture giữ chỗ, atlas về sau thì
 * chỉ là một lần thay ảnh của cùng một texture — không biên dịch lại shader.
 */
export function useAtlasTexture(tileSize: number, photoCount: number) {
  const gl = useThree((state) => state.gl);
  const [placeholder] = useState(makePlaceholder);
  const [atlas, setAtlas] = useState<AtlasInfo | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (photoCount <= 0) return;

    const controller = new AbortController();
    let bitmap: ImageBitmap | null = null;
    let texture: THREE.Texture | null = null;
    let idleHandle: number | null = null;
    let cancelled = false;

    (async () => {
      const res = await fetch(`/api/mosaic/atlas?tile=${tileSize}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Không tải được atlas (HTTP ${res.status})`);
      const blob = await res.blob();
      if (cancelled) return;

      // imageOrientation:'flipY' làm việc lật ngay trong lúc giải mã ngoài luồng
      // chính. Nếu để texture.flipY = true, trình duyệt rơi vào đường copy CPU chậm.
      bitmap = await createImageBitmap(blob, {
        imageOrientation: 'flipY',
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'none',
      });
      if (cancelled) {
        bitmap.close();
        return;
      }

      texture = new THREE.Texture(bitmap);
      texture.flipY = false; // bắt buộc: đã lật ở bước giải mã
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      // Không nâng anisotropy: nó lấy mẫu ra ngoài vùng LOD đã chặn và làm lem
      // ảnh giữa các ô cạnh nhau trong atlas.
      texture.anisotropy = 1;
      texture.needsUpdate = true;

      const columns = Math.max(1, Math.floor(ATLAS_WIDTH / tileSize));
      const rows = Math.max(1, Math.ceil(photoCount / columns));

      const info: AtlasInfo = {
        texture,
        columns,
        rows,
        width: ATLAS_WIDTH,
        height: rows * tileSize,
        tile: tileSize,
      };

      // Ép upload + sinh mipmap vào lúc trang rảnh, thay vì để nó rơi đúng giữa
      // hiệu ứng vào và gây khựng một cụm khung hình.
      idleHandle = scheduleIdle(() => {
        if (cancelled || !texture) return;
        try {
          gl.initTexture(texture);
        } catch {
          // Không chặn được thì cứ để renderer tự upload ở lần vẽ đầu tiên.
        }
        setAtlas(info);
        setReady(true);
      }, 1500);
    })().catch((err: unknown) => {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('Atlas load failed:', err);
    });

    return () => {
      cancelled = true;
      controller.abort();
      if (idleHandle !== null) cancelIdle(idleHandle);
      texture?.dispose();
      bitmap?.close();
      setAtlas(null);
      setReady(false);
    };
  }, [tileSize, photoCount, gl]);

  useEffect(() => () => placeholder.dispose(), [placeholder]);

  return { atlas, placeholder, ready };
}
