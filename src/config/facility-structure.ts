import type { Rect } from '../core/math.ts';

/** Shared visual and acoustic center of the anomaly above the approach. */
export const FORTRESS_BLACKHOLE = { position: { x: 36, y: 29, z: -5 } } as const;

/** The basin extends below the fortress without moving the ruins' jump route. */
export const FORTRESS_COOLANT = { x: 54, y: 2, w: 146, h: 16 } as const satisfies Rect;

/** Terrain edges remain independent of the liquid filling the lower chamber. */
export const FORTRESS_CHASM = {
  left: 54, right: 70, bottom: 5,
  steppingStones: [[56, 61, 20], [61, 70, 22]],
} as const;

/** West end of the approach: its top sits well above jump height, so only flight reaches it. */
export const FORTRESS_PLATEAU = { right: 14, top: 27 } as const;

/** Shared cutaway shell: solid in the player plane, with only marked entrances open. */
export const FORTRESS_STRUCTURE = {
  bounds: { left: 88, right: 198, bottom: 2, roofY: 74 },
  doors: [
    { id: 'entrance', label: '主入口', x: 88, y: 20, w: 2, h: 8 },
    { id: 'exit', label: '东侧出口', x: 196, y: 20, w: 2, h: 8 },
    { id: 'roof', label: '屋顶检修口', x: 102, y: 73, w: 4, h: 2 },
  ],
  walls: [
    { x: 88, y: 2, w: 2, h: 18 }, { x: 88, y: 28, w: 2, h: 47 },
    { x: 196, y: 2, w: 2, h: 18 }, { x: 196, y: 28, w: 2, h: 47 },
  ] satisfies readonly Rect[],
  roof: [
    { x: 90, y: 73, w: 12, h: 2 }, { x: 106, y: 73, w: 90, h: 2 },
  ] satisfies readonly Rect[],
  canopy: { x: 100, y: 79, w: 8, h: 1 },
  creekRetainingWall: { x: 70, y: 2, w: 2, h: 8 },
} as const;
