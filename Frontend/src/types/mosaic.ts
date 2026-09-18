/** Hợp đồng của GET /api/mosaic/layout — nguồn chuẩn dùng chung web và bản in. */

/** Vai trò màu lấy từ logo: bốn chữ IRIS vàng kim, hai chữ số 15 xanh dương. */
export type TintRole = 'gold' | 'blue';

export interface MosaicLetter {
  id: string;
  char: string;
  tintRole: TintRole;
  printHex: string;
  order: number;
}

export interface MosaicTile {
  /** Số thứ tự ô theo thứ tự đọc. */
  i: number;
  /** Hình chữ nhật trên lưới nguyên [x, y, w, h] — nguồn chuẩn. */
  u: [number, number, number, number];
  /** Bản chuẩn hoá theo bề rộng lưới [x, y, w, h]. */
  r: [number, number, number, number];
  letterId: string;
  /** Id bài viết, -1 nếu ô chưa có ảnh. */
  postId: number;
  /** Thứ hạng gán ảnh; cũng chính là chỉ số ô trong sprite atlas. */
  rank: number;
}

export interface MosaicLayoutResponse {
  layoutId: string;
  glyphVersion: string;
  mode: string;
  photoCount: number;
  tileCount: number;
  emptyTileCount: number;
  minTilesForShape: number;
  lattice: { unitsPerCap: number; rows: number; cols: number };
  viewBox: [number, number];
  letters: MosaicLetter[];
  tiles: MosaicTile[];
}

/**
 * Bố cục đã chuyển sang dạng mảng phẳng để vòng lặp mỗi khung hình không phải
 * truy cập object — đây là vòng lặp nóng nhất của cả trang.
 */
export interface MosaicGeometry {
  layoutId: string;
  count: number;
  photoCount: number;
  rows: number;
  cols: number;
  /** Tâm ô theo toạ độ world, gốc ở giữa hình chữ. */
  centerX: Float32Array;
  centerY: Float32Array;
  /** Kích thước ô theo đơn vị lưới. */
  sizeX: Float32Array;
  sizeY: Float32Array;
  /** Khoảng cách từ tâm hình chữ, dùng cho hiệu ứng toả tròn. */
  dist: Float32Array;
  /** Nhiễu tất định theo ô. */
  jitter: Float32Array;
  /** Ô atlas, -1 nếu không có ảnh. */
  slot: Int32Array;
  /**
   * Vị trí trong bản contact sheet. Đây là `rank`, một hoán vị đầy đủ của
   * 0..count-1, nên lưới contact sheet luôn kín, không có lỗ.
   */
  sheetIndex: Int32Array;
  /** 1 nếu ô thuộc chữ số (màu hổ phách). */
  gold: Uint8Array;
  postId: Int32Array;
  letterId: string[];
  letters: MosaicLetter[];
}
