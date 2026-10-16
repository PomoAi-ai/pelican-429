import { TILE_SHAPE_DEFINITIONS, type DefinitionPoint } from '../config/definition-kit.ts';
import { getResidenceResource, RESIDENCE_WORLD } from '../config/residence.ts';
import type { ResidenceState } from './residence.ts';

export interface ResidenceLightField {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly occupied: Uint8Array;
  readonly sky: Uint8Array;
}

const CELL_SIZE = .5;
const shapePoints = new Map(TILE_SHAPE_DEFINITIONS.map(shape => [shape.id, shape.points]));

function inside(points: readonly DefinitionPoint[], x: number, y: number): boolean {
  let positive = false, negative = false;
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[(i + 1) % points.length]!;
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    positive ||= cross > 0;
    negative ||= cross < 0;
  }
  return !(positive && negative);
}

/** 剖面是展示方式，只有顶部天空、地表窗户和连通的空气能提供自然光。 */
export function buildResidenceLightField(state: ResidenceState): ResidenceLightField {
  const { minX, minY, width: worldWidth, height: worldHeight, foundationTop } = RESIDENCE_WORLD;
  const width = worldWidth / CELL_SIZE, height = (worldHeight - minY) / CELL_SIZE;
  const occupied = new Uint8Array(width * height);
  const sky = new Uint8Array(width * height);
  const field = { minX, minY, width, height, cellSize: CELL_SIZE, occupied, sky };
  const rect = (x: number, y: number, w: number, h: number, value: number): void => {
    const left = Math.max(0, Math.floor((x - minX) / CELL_SIZE));
    const right = Math.min(width, Math.ceil((x + w - minX) / CELL_SIZE));
    const bottom = Math.max(0, Math.floor((y - minY) / CELL_SIZE));
    const top = Math.min(height, Math.ceil((y + h - minY) / CELL_SIZE));
    for (let cy = bottom; cy < top; cy++) occupied.fill(value, cy * width + left, cy * width + right);
  };
  if (state.underground) {
    occupied.fill(1, 0, (foundationTop - minY) / CELL_SIZE * width);
    for (const index of state.underground) {
      rect(minX + index % worldWidth, minY + Math.floor(index / worldWidth), 1, 1, 0);
    }
  }
  for (const placement of state.placements) {
    const resource = getResidenceResource(placement.resourceId);
    const { x, y } = placement;
    if (resource.kind === 'solid') {
      const points = shapePoints.get(resource.shape)!;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        if (inside(points, (dx + .5) * CELL_SIZE, (dy + .5) * CELL_SIZE)) {
          occupied[((y - minY) * 2 + dy) * width + (x - minX) * 2 + dx] = 1;
        }
      }
    } else if (resource.kind === 'door') {
      const left = x + (resource.side === 'left' ? .5 : 0);
      rect(left, y + 3.5, .5, .5, 1);
      if (!placement.open) rect(left, y, .5, 3.5, 1);
    } else if (resource.kind === 'platform') {
      // 薄平台仍然遮住上方天空，不能因小于采样间隔而漏光。
      rect(x + (resource.platformWidth === 'right' ? .5 : 0), y + .3,
        resource.platformWidth === 'full' ? 1 : .5, .2, 1);
    }
  }
  const buckets: number[][] = Array.from({ length: 256 }, () => []);
  const seed = (index: number, light: number): void => {
    if (!occupied[index] && light > sky[index]!) {
      sky[index] = light;
      buckets[light]!.push(index);
    }
  };
  for (let cx = 0; cx < width; cx++) {
    let light = 255;
    for (let cy = height - 1; cy >= 0; cy--) {
      const index = cy * width + cx;
      if (occupied[index]) break;
      if (minY + (cy + .5) * CELL_SIZE < foundationTop) light = Math.max(0, light - 4);
      seed(index, light);
    }
  }
  for (const placement of state.placements) {
    const resource = getResidenceResource(placement.resourceId);
    if (resource.kind !== 'glazing') continue;
    for (let dy = 0; dy < resource.height * 2; dy++) for (let dx = 0; dx < resource.width * 2; dx++) {
      const y = placement.y + (dy + .5) * CELL_SIZE;
      if (y < foundationTop) continue;
      seed(((placement.y - minY) * 2 + dy) * width + (placement.x - minX) * 2 + dx, 210);
    }
  }
  // 按亮度降序传播，最亮路径先到达；转入洞穴后每半格损耗，无法照穿实心砖。
  for (let light = 255; light > 12; light--) {
    const bucket = buckets[light]!;
    for (const index of bucket) {
      if (sky[index] !== light) continue;
      const x = index % width;
      if (x > 0) seed(index - 1, light - 12);
      if (x + 1 < width) seed(index + 1, light - 12);
      if (index >= width) seed(index - width, light - 12);
      if (index + width < sky.length) seed(index + width, light - 12);
    }
  }
  return field;
}

export function sampleResidenceSky(field: ResidenceLightField, x: number, y: number): number {
  const cx = Math.floor((x - field.minX) / field.cellSize);
  const cy = Math.floor((y - field.minY) / field.cellSize);
  if (cx < 0 || cx >= field.width || cy < 0 || cy >= field.height) return y >= RESIDENCE_WORLD.foundationTop ? 1 : 0;
  return field.sky[cy * field.width + cx]! / 255;
}
