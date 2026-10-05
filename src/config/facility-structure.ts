import type { Rect } from '../core/math.ts';

/** The basin extends below the fortress without moving the ruins' jump route. */
export const FORTRESS_COOLANT = { x: 22, y: 2, w: 146, h: 16 } as const satisfies Rect;

/** Terrain edges remain independent of the liquid filling the lower chamber. */
export const FORTRESS_CHASM = {
  left: 22, right: 38, bottom: 5,
  steppingStones: [[24, 29, 20], [31, 36, 20]],
} as const;

/** Shared cutaway shell: solid in the player plane, with only marked entrances open. */
export const FORTRESS_STRUCTURE = {
  bounds: { left: 56, right: 166, bottom: 2, roofY: 74 },
  doors: [
    { id: 'entrance', label: '主入口', x: 56, y: 20, w: 2, h: 8 },
    { id: 'exit', label: '东侧出口', x: 164, y: 20, w: 2, h: 8 },
    { id: 'roof', label: '屋顶检修口', x: 70, y: 73, w: 4, h: 2 },
  ],
  walls: [
    { x: 56, y: 2, w: 2, h: 18 }, { x: 56, y: 28, w: 2, h: 47 },
    { x: 164, y: 2, w: 2, h: 18 }, { x: 164, y: 28, w: 2, h: 47 },
  ] satisfies readonly Rect[],
  roof: [
    { x: 58, y: 73, w: 12, h: 2 }, { x: 74, y: 73, w: 90, h: 2 },
  ] satisfies readonly Rect[],
  canopy: { x: 68, y: 79, w: 8, h: 1 },
  creekRetainingWall: { x: 38, y: 2, w: 2, h: 8 },
} as const;
