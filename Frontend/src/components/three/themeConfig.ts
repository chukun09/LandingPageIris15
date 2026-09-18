import type { MosaicLetter } from '../../types/mosaic';

export type Grid3DTheme = 'dark' | 'light';

export interface ThemeColors {
  /** Vàng kim của bốn chữ IRIS. */
  gold: string;
  /** Xanh dương của số 15. */
  blue: string;
  emissiveGold: string;
  emissiveOther: string;
  emissiveIntensity: number;
}

/**
 * Phòng tối: nền gần như đen, vàng kim rực lên như dưới đèn rọi.
 */
const DARK_COLORS: ThemeColors = {
  gold: '#E8B45C',
  blue: '#3B6FE6',
  emissiveGold: '#D9A03A',
  emissiveOther: '#17325F',
  emissiveIntensity: 0.3,
};

/**
 * Bản in trên giấy: vàng kim và xanh dương đúng như logo đặt trên nền trắng ấm.
 */
const LIGHT_COLORS: ThemeColors = {
  gold: '#D9A03A',
  blue: '#2A5AC8',
  emissiveGold: '#000000',
  emissiveOther: '#000000',
  emissiveIntensity: 0,
};

export const GRID3D_THEMES = {
  dark: {
    colors: DARK_COLORS,
    // Ánh sáng phải gần trung tính, nếu không đèn ngả vàng sẽ rửa trôi màu xanh
    // của số 15 thành xám và cặp màu thương hiệu biến mất.
    ambientIntensity: 0.8,
    ambientColor: '#FFFFFF',
    directionalIntensity: 1.0,
    directionalColor: '#FFFFFF',
    keyLightColor: '#F0CC90',
    keyLightIntensity: 1.2,
    fillLightColor: '#6E9BF0',
    fillLightIntensity: 0.8,
    rimLightColor: '#F0C878',
    rimLightIntensity: 0.9,
    fogColor: '#0B0C0E' as string | null,
    // Hệ số nhân với bề rộng lưới, KHÔNG phải khoảng cách tuyệt đối: camera đặt
    // ở z = cols nên mọi mốc sương phải co giãn theo lưới, nếu không đổi độ phân
    // giải lưới là cả bức tường chìm sau màn sương.
    fogNearFactor: 1.05,
    fogFarFactor: 2.4,
    clearColor: '#0B0C0E',
    // Bỏ mặt sàn phát sáng: ở góc nhìn trực giao nó đọc thành một vệt kẻ ngang
    // chứ không ra ánh hắt, và làm loãng chi tiết chữ ký của trang.
    useFloorGlow: false,
    sparkleColor: '#E8A33D',
    sparkleOpacity: 0.5,
  },
  light: {
    colors: LIGHT_COLORS,
    // Ánh sáng dịu và khuếch tán: nền giấy chứ không phải mặt kính chiếu sáng.
    ambientIntensity: 0.95,
    ambientColor: '#FFFFFF',
    directionalIntensity: 1.05,
    directionalColor: '#FFF8EC',
    keyLightColor: '#FFF0D4',
    keyLightIntensity: 0.7,
    fillLightColor: '#DCE4F2',
    fillLightIntensity: 0.6,
    rimLightColor: '#FFFFFF',
    rimLightIntensity: 0,
    fogColor: null as string | null,
    fogNearFactor: 0,
    fogFarFactor: 0,
    clearColor: '#FAF8F4',
    useFloorGlow: false,
    sparkleColor: '#D9A03A',
    sparkleOpacity: 0,
  },
};

/**
 * Màu của một ô theo chữ cái mà nó thuộc về.
 *
 * Trước đây màu được suy ra từ chỉ số cột với các mốc 8/22/34/48/58, trong khi
 * dải cột thật của từng chữ lại khác — 31 trên 230 ô bị tô sai chữ. Giờ máy chủ
 * gửi thẳng danh tính chữ cái nên không còn chỗ để lệch.
 */
export function getLetterColor(
  theme: Grid3DTheme,
  letterId: string,
  letters: MosaicLetter[],
): string {
  const colors = GRID3D_THEMES[theme].colors;
  const letter = letters.find((l) => l.id === letterId);
  return letter?.tintRole === 'blue' ? colors.blue : colors.gold;
}
