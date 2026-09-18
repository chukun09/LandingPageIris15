import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { applyAtlasUniforms, createAtlasMaterial } from './atlasMaterial';
import { createMosaicState, stepMosaic } from './mosaicAnimation';
import { useAtlasTexture } from './useAtlasTexture';
import { getLetterColor, GRID3D_THEMES } from './themeConfig';
import type { Grid3DTheme } from './themeConfig';
import type { MosaicGeometry } from '../../types/mosaic';

interface MosaicMeshProps {
  geometry: MosaicGeometry;
  theme: Grid3DTheme;
  exhibitionMode: boolean;
  reducedMotion: boolean;
  isCoarse: boolean;
  lowTier: boolean;
  onTileClick: (postId: number) => void;
}

const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();
const _color = new THREE.Color();

/**
 * Toàn bộ bức tường trong MỘT InstancedMesh.
 *
 * Thay cho kiến trúc cũ: một InstancedMesh cho mỗi URL ảnh, mỗi cái mang mảng 6
 * material trên BoxGeometry — tức 6 lệnh vẽ mỗi mesh và một vòng useFrame riêng
 * cho mỗi ảnh.
 */
export function MosaicMesh({
  geometry,
  theme,
  exhibitionMode,
  reducedMotion,
  isCoarse,
  lowTier,
  onTileClick,
}: MosaicMeshProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { gl, camera, size, invalidate } = useThree();

  const tileSize = lowTier ? 64 : 128;
  const { atlas, placeholder } = useAtlasTexture(tileSize, geometry.photoCount);

  const boxGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const atlasMaterial = useMemo(() => createAtlasMaterial(placeholder), [placeholder]);

  const tileAttribute = useMemo(
    () => new THREE.InstancedBufferAttribute(new Float32Array(geometry.count * 4), 4),
    [geometry.count],
  );

  const brandAttribute = useMemo(
    () => new THREE.InstancedBufferAttribute(new Float32Array(geometry.count * 3), 3),
    [geometry.count],
  );

  const state = useMemo(() => createMosaicState(geometry.count), [geometry.count]);
  const hoverRef = useRef(-1);
  const cursorRef = useRef('auto');
  const pointerDirty = useRef(false);
  const pressRef = useRef<{ id: number; x: number; y: number; t: number } | null>(null);

  // ── nạp dữ liệu tĩnh theo ô: slot atlas, cờ vàng, tỷ lệ khung ────────────
  useEffect(() => {
    const array = tileAttribute.array as Float32Array;
    for (let i = 0; i < geometry.count; i++) {
      array[i * 4 + 0] = geometry.slot[i];
      array[i * 4 + 1] = geometry.gold[i];
      array[i * 4 + 2] = 0; // reveal, chạy lên 1 khi atlas về
      array[i * 4 + 3] = geometry.sizeX[i] / Math.max(0.0001, geometry.sizeY[i]);
    }
    tileAttribute.needsUpdate = true;
  }, [geometry, tileAttribute]);

  // ── màu thương hiệu theo chữ cái (mặt bên + ô chưa có ảnh) ───────────────
  useEffect(() => {
    const array = brandAttribute.array as Float32Array;
    for (let i = 0; i < geometry.count; i++) {
      // Color.set() đã chuyển sRGB → tuyến tính, đúng không gian màu của shader.
      _color.set(getLetterColor(theme, geometry.letterId[i], geometry.letters));
      array[i * 3 + 0] = _color.r;
      array[i * 3 + 1] = _color.g;
      array[i * 3 + 2] = _color.b;
    }
    brandAttribute.needsUpdate = true;
    invalidate();
  }, [geometry, theme, brandAttribute, invalidate]);

  // ── đổi theme = ghi uniform, không biên dịch lại shader ──────────────────
  useEffect(() => {
    const cfg = GRID3D_THEMES[theme];
    const u = atlasMaterial.uniforms;
    u.uEmissiveGold.value.set(cfg.colors.emissiveGold);
    u.uEmissiveOther.value.set(cfg.colors.emissiveOther);
    u.uEmissiveBase.value = cfg.colors.emissiveIntensity;
    invalidate();
  }, [theme, atlasMaterial, invalidate]);

  // ── atlas về: thay ảnh của cùng texture rồi chạy hiệu ứng hiện dần ───────
  useEffect(() => {
    if (!atlas) return;
    atlasMaterial.material.map = atlas.texture;
    atlasMaterial.material.needsUpdate = true;
    applyAtlasUniforms(atlasMaterial.uniforms, atlas);
    state.revealStart = -1; // stepMosaic sẽ đặt lại theo đồng hồ của khung hình
    invalidate();
  }, [atlas, atlasMaterial, state, invalidate]);

  // ── ghi nhận lần đổi chế độ ──────────────────────────────────────────────
  useEffect(() => {
    state.mode = exhibitionMode ? 1 : 0;
    state.modeStart = -1; // -1 = đánh dấu cần lấy mốc thời gian ở khung kế tiếp
    invalidate();
  }, [exhibitionMode, state, invalidate]);

  // ── bao hình tĩnh: một mesh thì cắt theo khối là vô nghĩa, nhưng raycast
  //    của InstancedMesh vẫn thoát sớm dựa vào boundingSphere ────────────────
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const radius = Math.hypot(geometry.cols, geometry.rows) * 0.9;
    mesh.frustumCulled = false;
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -geometry.rows * 0.3), radius);
    mesh.computeBoundingSphere = () => {};
  }, [geometry]);

  // ── con trỏ: chỉ đặt cờ, việc raycast dồn vào đúng một lần mỗi khung hình ─
  useEffect(() => {
    const canvas = gl.domElement;

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      _pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      pointerDirty.current = true;
      invalidate();
    };
    const onLeave = () => {
      markHover(-1);
      pointerDirty.current = false;
      invalidate();
    };
    const onDown = (e: PointerEvent) => {
      // Trên cảm ứng chưa có hover nên phải bắn tia ngay tại thời điểm chạm.
      if (e.pointerType !== 'mouse') {
        const rect = canvas.getBoundingClientRect();
        _pointer.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        pointerDirty.current = true;
      }
      pressRef.current = { id: hoverRef.current, x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const onUp = (e: PointerEvent) => {
      const press = pressRef.current;
      pressRef.current = null;
      if (!press) return;
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      const id = press.id >= 0 ? press.id : hoverRef.current;
      // Phân biệt chạm với kéo xoay: code cũ mở modal ngay ở pointerdown nên mọi
      // thao tác kéo bắt đầu trên một ô đều bật modal.
      if (id >= 0 && moved < 10 && performance.now() - press.t < 350) {
        const postId = geometry.postId[id];
        if (postId >= 0) onTileClick(postId);
      }
    };
    const onCancel = () => {
      pressRef.current = null;
    };

    canvas.addEventListener('pointermove', onMove, { passive: true });
    canvas.addEventListener('pointerleave', onLeave, { passive: true });
    canvas.addEventListener('pointerdown', onDown, { passive: true });
    canvas.addEventListener('pointerup', onUp, { passive: true });
    canvas.addEventListener('pointercancel', onCancel, { passive: true });
    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, geometry, onTileClick, invalidate]);

  function markHover(next: number) {
    if (next === hoverRef.current) return;
    if (hoverRef.current >= 0) state.hoverActive.add(hoverRef.current);
    if (next >= 0) state.hoverActive.add(next);
    hoverRef.current = next;
    state.hoverId = next;

    const cursor = next >= 0 ? 'pointer' : 'auto';
    if (cursor !== cursorRef.current) {
      gl.domElement.style.cursor = cursor;
      cursorRef.current = cursor;
    }
  }

  // ── giải phóng tài nguyên ────────────────────────────────────────────────
  useEffect(
    () => () => {
      boxGeometry.dispose();
      atlasMaterial.dispose();
      meshRef.current?.dispose();
    },
    [boxGeometry, atlasMaterial],
  );

  // ── MỘT vòng useFrame duy nhất cho toàn bộ cảnh ──────────────────────────
  useFrame((frameState, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const now = frameState.clock.elapsedTime;

    if (state.modeStart === -1) state.modeStart = now;
    if (state.revealStart === -1 && atlas) state.revealStart = now;

    // Đúng một lần bắn tia, lên đúng một đối tượng, mỗi khung hình đã vẽ.
    if (pointerDirty.current && !isCoarse) {
      pointerDirty.current = false;
      _raycaster.setFromCamera(_pointer, camera);
      const hit = _raycaster.intersectObject(mesh, false)[0];
      markHover(hit?.instanceId ?? -1);
    } else if (pointerDirty.current) {
      pointerDirty.current = false;
      _raycaster.setFromCamera(_pointer, camera);
      const hit = _raycaster.intersectObject(mesh, false)[0];
      hoverRef.current = hit?.instanceId ?? -1;
    }

    // Nhịp phát sáng của số 15 là MỘT uniform vô hướng, không phải 70 lượt ghi
    // emissive theo từng ô như code cũ.
    if (theme === 'dark' && !reducedMotion) {
      atlasMaterial.uniforms.uGoldPulse.value = 1.05 + Math.sin(now * 1.4) * 0.3;
    }

    const moved = stepMosaic(state, geometry, mesh, tileAttribute, now, delta, {
      reducedMotion,
      canvasAspect: size.width / Math.max(1, size.height),
      throttleHz: lowTier ? 30 : 0,
    });
    if (moved) invalidate();
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[boxGeometry, atlasMaterial.material, geometry.count]}
      dispose={null}
    >
      <primitive object={tileAttribute} attach="geometry-attributes-aTile" />
      <primitive object={brandAttribute} attach="geometry-attributes-aBrand" />
    </instancedMesh>
  );
}
