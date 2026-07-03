export type Grid3DTheme = 'dark' | 'light';

export interface ThemeColors {
  cellI: string;
  cellR: string;
  cellI2: string;
  cellS: string;
  cell1: string;
  cell5: string;
  sideColor: string;
  emissiveGold: string;
  emissiveOther: string;
  emissiveIntensity: number;
  emissiveSideIntensity: number;
}

const DARK_COLORS: ThemeColors = {
  cellI: '#4a7fe8',
  cellR: '#a855f7',
  cellI2: '#4a7fe8',
  cellS: '#ec4899',
  cell1: '#f2c14e',
  cell5: '#f2c14e',
  sideColor: '#6b5118',
  emissiveGold: '#e6b13d',
  emissiveOther: '#0a1128',
  emissiveIntensity: 0.5,
  emissiveSideIntensity: 0.35,
};

const LIGHT_COLORS: ThemeColors = {
  cellI: '#153a82',
  cellR: '#7c3aed',
  cellI2: '#153a82',
  cellS: '#db2777',
  cell1: '#d99a1c',
  cell5: '#d99a1c',
  sideColor: '#475569',
  emissiveGold: '#000000',
  emissiveOther: '#000000',
  emissiveIntensity: 0,
  emissiveSideIntensity: 0,
};

export const GRID3D_THEMES = {
  dark: {
    colors: DARK_COLORS,
    ambientIntensity: 0.35,
    ambientColor: '#c7d2ee',
    directionalIntensity: 1.2,
    directionalColor: '#fff2d5',
    pointLight1Color: '#e6b13d',
    pointLight1Intensity: 3.5,
    pointLight2Color: '#3b82f6',
    pointLight2Intensity: 1.4,
    rimLightColor: '#f0c050',
    rimLightIntensity: 2.0,
    fogColor: '#0a1128',
    fogNear: 35,
    fogFar: 75,
    bgColor: '#0a1128' as string | null,
    useFloorGlow: true,
    sparkleColor: '#f5cf6b',
    sparkleOpacity: 0.6,
  },
  light: {
    colors: LIGHT_COLORS,
    ambientIntensity: 0.7,
    ambientColor: '#ffffff',
    directionalIntensity: 1.5,
    directionalColor: '#ffffff',
    pointLight1Color: '#e6b13d',
    pointLight1Intensity: 1.0,
    pointLight2Color: '#3b82f6',
    pointLight2Intensity: 0.8,
    rimLightColor: '#ffffff',
    rimLightIntensity: 0,
    fogColor: null,
    fogNear: 0,
    fogFar: 0,
    bgColor: null as string | null,
    useFloorGlow: false,
    sparkleColor: '#e6b13d',
    sparkleOpacity: 0.0,
  },
};

export function getCellTheme(theme: Grid3DTheme, colIndex: number): string {
  const colors = GRID3D_THEMES[theme].colors;
  // Letter column ranges in the 70-col IRIS_MASK:
  // I: 0-8, R: 12-22, I: 26-34, S: 38-48, space, 1: 54-58, 5: 62-70
  if (colIndex <= 8) return colors.cellI;
  if (colIndex <= 22) return colors.cellR;
  if (colIndex <= 34) return colors.cellI2;
  if (colIndex <= 48) return colors.cellS;
  if (colIndex <= 58) return colors.cell1;
  return colors.cell5;
}

export function isGoldCell(colIndex: number): boolean {
  return colIndex >= 44;
}
