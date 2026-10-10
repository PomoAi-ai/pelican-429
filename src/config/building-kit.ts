export const BUILDING_KIT_VARIANTS = {
  block: ['single', 'row', 'corner', 'full-depth'],
  wall: ['single', 'patch'],
  door: ['closed', 'open', 'lintel-closed', 'lintel-open'],
  solar: ['left', 'level', 'right'],
} as const;

export type BuildingKitKind = keyof typeof BUILDING_KIT_VARIANTS;
export type BuildingKitVariant = (typeof BUILDING_KIT_VARIANTS)[BuildingKitKind][number];
export type SolarVariant = (typeof BUILDING_KIT_VARIANTS.solar)[number];
export type SolarMounting = 'inner' | 'center' | 'outer';

export function isBuildingKitKind(value: string): value is BuildingKitKind {
  return Object.hasOwn(BUILDING_KIT_VARIANTS, value);
}

/** 构件从左下角开始占格，太阳能尺寸包含底座与左右倾斜后的面板。 */
export const BUILDING_KIT = {
  block: { width: 1, height: 1, depth: 0.9 },
  wall: { width: 1, height: 1, depth: 0.14 },
  door: { width: 0.14, height: 3, depth: 1.4, lintelHeight: 1 },
  solar: { width: 1, height: 0.5, depth: 1, tilt: Math.PI * 22 / 180,
    pivotHeight: 0.27, panelWidth: 0.94, panelBottom: -0.0275, panelTop: 0.04375 },
} as const;
