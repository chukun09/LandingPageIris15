import * as THREE from 'three';
import type { MosaicGeometry } from '../../types/mosaic';

export const ENTRANCE_DURATION = 1.9;
export const ENTRANCE_DURATION_REDUCED = 0.35;
export const TRANSITION_DURATION = 1.25;
export const REVEAL_DURATION = 0.55;

export interface MosaicState {
  /** Thời điểm khung hình đầu tiên; lấy trong useFrame, không đọc lúc render. */
  t0: number;
  /** Thời điểm lần đổi chế độ gần nhất; 0 = chưa từng đổi. */
  modeStart: number;
  mode: 0 | 1;
  hoverId: number;
  hoverAmount: Float32Array;
  /** Chỉ các ô đang trong quá trình mượt hoá — giữ vòng lặp hover ở O(1). */
  hoverActive: Set<number>;
  revealStart: number;
  frameAccumulator: number;
}

export interface MosaicConfig {
  reducedMotion: boolean;
  /** Tỷ lệ khung của canvas, để lưới triển lãm không tràn ra ngoài. */
  canvasAspect: number;
  /** Giới hạn 30 Hz cho máy yếu. */
  throttleHz: number;
}

export function createMosaicState(count: number): MosaicState {
  return {
    t0: 0,
    modeStart: 0,
    mode: 0,
    hoverId: -1,
    hoverAmount: new Float32Array(count),
    hoverActive: new Set(),
    revealStart: -1,
    frameAccumulator: 0,
  };
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

const _dummy = new THREE.Object3D();

/** Bố cục lưới triển lãm, khớp tỷ lệ khung nhìn nên không bị cắt trên dưới. */
export function exhibitionGrid(geometry: MosaicGeometry, canvasAspect: number) {
  const n = Math.max(1, geometry.count);
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * Math.max(0.4, canvasAspect))));
  const rows = Math.max(1, Math.ceil(n / cols));
  // Bề rộng lưới bám theo bề rộng chữ để camera không phải chỉnh lại zoom.
  const spacing = (geometry.cols * 0.86) / cols;
  return { cols, rows, spacing };
}

/**
 * Cập nhật ma trận của mọi ô cho một khung hình.
 *
 * Trả về false khi không có gì chuyển động — khi đó người gọi bỏ qua luôn việc
 * đánh dấu instanceMatrix cần cập nhật, tránh đẩy lại toàn bộ buffer lên GPU
 * mỗi khung hình như code cũ vẫn làm kể cả lúc đứng yên.
 */
export function stepMosaic(
  state: MosaicState,
  geometry: MosaicGeometry,
  mesh: THREE.InstancedMesh,
  tileAttribute: THREE.InstancedBufferAttribute,
  now: number,
  delta: number,
  config: MosaicConfig,
): boolean {
  if (state.t0 === 0) state.t0 = now;

  const age = now - state.t0;
  const entranceDuration = config.reducedMotion ? ENTRANCE_DURATION_REDUCED : ENTRANCE_DURATION;
  const sinceMode = state.modeStart > 0 ? now - state.modeStart : Number.POSITIVE_INFINITY;
  const sinceReveal = state.revealStart >= 0 ? now - state.revealStart : -1;

  const entering = age < entranceDuration;
  const transitioning = sinceMode < TRANSITION_DURATION;
  const revealing = sinceReveal >= 0 && sinceReveal < REVEAL_DURATION;
  const hovering = state.hoverActive.size > 0;
  const idling = !config.reducedMotion && state.mode === 0 && !entering;
  const wobbling = !config.reducedMotion && state.mode === 1 && !transitioning;

  if (!entering && !transitioning && !revealing && !hovering && !idling && !wobbling) {
    return false;
  }

  // Máy yếu: gộp delta để chỉ cập nhật ~30 lần/giây.
  if (config.throttleHz > 0) {
    state.frameAccumulator += delta;
    if (state.frameAccumulator < 1 / config.throttleHz) return false;
    state.frameAccumulator = 0;
  }

  const grid = exhibitionGrid(geometry, config.canvasAspect);
  const depthRef = geometry.rows;
  const entranceZ = -depthRef * 0.9;

  const tileArray = tileAttribute.array as Float32Array;
  let tileDirty = false;

  for (let i = 0; i < geometry.count; i++) {
    const originX = geometry.centerX[i];
    const originY = geometry.centerY[i];
    const tileW = geometry.sizeX[i];
    const tileH = geometry.sizeY[i];
    const minSide = Math.min(tileW, tileH);
    const depth = minSide * 0.35;

    // ── hiệu ứng vào: bay từ xa vào, toả dần từ tâm ra ─────────────────
    let entranceScale = 1;
    let entranceOffsetZ = 0;
    let entranceSpin = 0;
    if (entering) {
      const delay = geometry.dist[i] * 0.55 + geometry.jitter[i];
      const t = easeOutCubic(clamp01((age - delay) / 0.85));
      entranceScale = t;
      entranceOffsetZ = (1 - t) * entranceZ;
      entranceSpin = (1 - t) * 0.6;
    }

    // ── chuyển giữa chế độ chữ và chế độ contact sheet ─────────────────
    const gridIndex = geometry.sheetIndex[i];
    const col = gridIndex % grid.cols;
    const row = Math.floor(gridIndex / grid.cols);
    const sheetX = (col - (grid.cols - 1) / 2) * grid.spacing;
    const sheetY = ((grid.rows - 1) / 2 - row) * grid.spacing;
    const sheetSide = grid.spacing * 0.9;

    const stagger = config.reducedMotion ? 0 : geometry.dist[i] * 0.25;
    const tMode = easeInOutCubic(clamp01((sinceMode - stagger) / (TRANSITION_DURATION - 0.25)));
    const blend = state.mode === 1 ? tMode : 1 - tMode;

    let x = originX + (sheetX - originX) * blend;
    let y = originY + (sheetY - originY) * blend;
    let scaleX = tileW + (sheetSide - tileW) * blend;
    let scaleY = tileH + (sheetSide - tileH) * blend;
    let z = entranceOffsetZ;

    // Vòng cung nhẹ trong lúc chuyển để hai trạng thái không trượt phẳng vào nhau.
    if (transitioning) z += Math.sin(blend * Math.PI) * depthRef * 0.25;

    // ── nhịp thở khi đứng yên ở chế độ chữ ────────────────────────────
    if (idling && state.mode === 0) {
      const phase = now * 0.9 + (originX + originY) * 0.09;
      z += Math.sin(phase) * depthRef * 0.02;
      const breathe = 1 + Math.sin(phase) * 0.012;
      scaleX *= breathe;
      scaleY *= breathe;
    }

    // ── hover ─────────────────────────────────────────────────────────
    const target = i === state.hoverId ? 1 : 0;
    let hover = state.hoverAmount[i];
    if (state.hoverActive.has(i)) {
      hover = THREE.MathUtils.damp(hover, target, 9, Math.min(delta, 1 / 20));
      if (Math.abs(hover - target) < 1e-3) {
        hover = target;
        state.hoverActive.delete(i);
      }
      state.hoverAmount[i] = hover;
    }
    if (hover > 0) {
      z += hover * minSide * 0.8;
      scaleX *= 1 + hover * 0.1;
      scaleY *= 1 + hover * 0.1;
    }

    // ── hiện ảnh dần khi atlas về ─────────────────────────────────────
    if (revealing) {
      const delay = geometry.dist[i] * 0.3;
      const reveal = clamp01((sinceReveal - delay) / 0.25);
      if (tileArray[i * 4 + 2] !== reveal) {
        tileArray[i * 4 + 2] = reveal;
        tileDirty = true;
      }
    }

    // Khe hở nhỏ thôi: mạch vữa dày làm đứt nét chữ khi nhìn từ xa.
    const finalScaleX = Math.max(0.0001, scaleX * 0.975 * entranceScale);
    const finalScaleY = Math.max(0.0001, scaleY * 0.975 * entranceScale);

    _dummy.position.set(x, y, z);
    _dummy.rotation.set(0, entranceSpin, 0);
    _dummy.scale.set(finalScaleX, finalScaleY, Math.max(0.0001, depth * entranceScale));
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (tileDirty) tileAttribute.needsUpdate = true;
  return true;
}
