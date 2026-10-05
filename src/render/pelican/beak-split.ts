// Runtime split of the vendored bill (standing-pouch) into an upper bill and a hinged lower jaw. The open
// mouth shows the background through the gap (cartoon style, no mouth interior). The vendor file stays
// untouched: this reads its ring layout (see ringSurface/createBeak in standing-bird.js) and checks it before cutting.
//
// Layout: v = 0 root pole, v = count − 1 tip pole, rings in between with `sides` vertices each;
// ring = (v − 1) / sides | 0, j = (v − 1) % sides. j = 0 (near, z = +w) and j = sides / 2 (far, z = −w)
// are the mouth line; j in (sides/2, sides) is the lower half (the jaw).
import * as THREE from 'three';

/** Vertices per bill ring in the vendored standing-bird.js (BEAK_SIDES there). */
export const BEAK_SIDES = 48;
/** Tolerance of the layout checks (bird units). */
const LAYOUT_EPSILON = 1e-4;
const MIN_RINGS = 3;

export interface PouchSplit {
  /** Number of full rings between the two poles. */
  rings: number;
  /** Triangle indices of the upper bill (every vertex in j ∈ [0, sides/2] or a pole). */
  upper: Uint32Array;
  /** Triangle indices of the lower jaw (at least one vertex in j ∈ (sides/2, sides)). */
  jaw: Uint32Array;
}

function layoutError(detail: string): never {
  throw new Error(`Pelican bill layout changed (standing-pouch): ${detail}. Update beak-split.ts before splitting the jaw.`);
}

function ringsOf(count: number, sides: number): number {
  if (!Number.isInteger(sides) || sides < 4 || sides % 2 !== 0) layoutError(`sides must be an even integer ≥ 4, got ${sides}`);
  const rings = (count - 2) / sides;
  if (!Number.isInteger(rings) || rings < MIN_RINGS) layoutError(`${count} vertices are not 2 poles + ≥${MIN_RINGS} rings of ${sides}`);
  return rings;
}

/**
 * Splits the bill's index into upper bill and jaw by ring position, after checking the vertex layout.
 * Throws when the geometry has no index, the vertex count is not poles + rings, a ring's two mouth-line
 * vertices are not z-mirrors at equal x/y, a lower vertex sits above its ring's mouth line, or either
 * half would be empty.
 */
export function splitPouchGeometry(geometry: THREE.BufferGeometry, sides: number = BEAK_SIDES): PouchSplit {
  const index = geometry.index;
  if (!index) layoutError('geometry has no index');
  const position = geometry.getAttribute('position');
  if (!position || position.itemSize !== 3) layoutError('geometry has no xyz position attribute');
  const rings = ringsOf(position.count, sides);
  const half = sides / 2;

  for (let ring = 0; ring < rings; ring++) {
    const near = 1 + ring * sides;
    const far = near + half;
    const y = position.getY(near);
    const nearZ = position.getZ(near);
    const values = [position.getX(near), y, nearZ, position.getX(far), position.getY(far), position.getZ(far)];
    if (!values.every(Number.isFinite)) layoutError(`ring ${ring} mouth line is not finite`);
    if (Math.abs(values[0]! - values[3]!) > LAYOUT_EPSILON || Math.abs(y - values[4]!) > LAYOUT_EPSILON
      || Math.abs(nearZ + values[5]!) > LAYOUT_EPSILON || nearZ < -LAYOUT_EPSILON) {
      layoutError(`ring ${ring} mouth-line vertices j=0/j=${half} are not z mirrors at equal x/y (${values.join(', ')})`);
    }
    for (let j = half + 1; j < sides; j++) {
      const lowerY = position.getY(near + j);
      if (!(lowerY <= y + LAYOUT_EPSILON)) layoutError(`ring ${ring} jaw vertex j=${j} is above the mouth line (${lowerY} > ${y})`);
    }
  }

  const tip = position.count - 1;
  const isJaw = (v: number): boolean => v > 0 && v < tip && (v - 1) % sides > half;
  const upper: number[] = [];
  const jaw: number[] = [];
  if (index.count % 3 !== 0) layoutError(`index count ${index.count} is not a triangle list`);
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    (isJaw(a) || isJaw(b) || isJaw(c) ? jaw : upper).push(a, b, c);
  }
  if (upper.length + jaw.length !== index.count) layoutError('triangles were lost while splitting');
  if (upper.length === 0 || jaw.length === 0) layoutError(`split left an empty half (upper ${upper.length / 3}, jaw ${jaw.length / 3} triangles)`);
  return { rings, upper: Uint32Array.from(upper), jaw: Uint32Array.from(jaw) };
}
