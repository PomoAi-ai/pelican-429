import type { DefinitionKit } from '../render/definition-kit.ts';
import type { RockTerrainCell } from '../config/rock-terrain.ts';
import { generateTileTextures } from '../render/tile-textures.ts';
import type { DepthLayerId } from './definition-depth-layout.ts';

export type DepthTheme = 'valley' | 'lake' | 'coast' | 'buildings' | 'ruins' | 'cave';

const terrainTextures = generateTileTextures(128);

function blocks(kit: DefinitionKit, x: number, y: number, width: number, height: number): void {
  for (let dx = 0; dx < width; dx++) for (let dy = 0; dy < height; dy++) kit.solid('A', x + dx, y + dy);
}

/** 平台内部填实体，相邻高差的顶面用共享坡形连接，不把山体画成一条空悬边线。 */
function land(kit: DefinitionKit, left: number, bottom: number, runs: readonly (readonly [number, number])[]): void {
  const heights = runs.flatMap(([width, top]) => Array<number>(width).fill(top));
  const cells: RockTerrainCell[] = [];
  for (let column = 0; column < heights.length; column++) {
    const top = heights[column]!;
    const next = column + 1 === heights.length ? top : heights[column + 1]!;
    const floor = next < top ? top - 1 : top;
    const x = left + column;
    for (let y = bottom; y < floor; y++) cells.push({ x, y, shape: 'A', material: 'stone', ore: false });
    if (next > top) cells.push({ x, y: top, shape: 'D', material: 'stone', ore: false });
    else if (next < top) cells.push({ x, y: top - 1, shape: 'E', material: 'stone', ore: false });
  }
  kit.terrain(cells, terrainTextures);
}

/** 缓坡屋面逐两格抬高一格，再连续落下；每格三角不会形成重复锯齿。 */
function roof(kit: DefinitionKit, left: number, eave: number, width: number): void {
  for (let x = -1; x <= width; x++) kit.solid('B', left + x, eave - .5);
  for (let x = 0; x < width; x++) {
    const half = Math.min(x, width - 1 - x);
    const rise = Math.floor(half / 2);
    blocks(kit, left + x, eave, 1, rise);
    const shape = x < width / 2 ? half % 2 === 0 ? 'F' : 'G' : half % 2 === 0 ? 'I' : 'H';
    kit.solid(shape, left + x, eave + rise);
  }
}

function house(kit: DefinitionKit, left: number, base: number, height = 4): void {
  const width = 8;
  blocks(kit, left, base - 1, width, 1);
  blocks(kit, left, base, 1, height); blocks(kit, left + width - 1, base, 1, height);
  for (let x = 1; x < width - 1; x++) for (let y = 0; y < height; y++) {
    const door = x <= 2 && y < 3;
    const window = x >= 4 && x <= 5 && y >= 1 && y < 3;
    if (!door && !window) kit.wall('W0', left + x, base + y);
  }
  kit.window(2, 3, left + 1, base, 'arch');
  kit.window(2, 2, left + 4, base + 1, 'rectangle', true, true);
  roof(kit, left, base + height, width);
}

function tower(kit: DefinitionKit, left: number, base: number, height: number, lantern: boolean): void {
  blocks(kit, left - 1, base - 1, 6, 1);
  blocks(kit, left, base, 1, height); blocks(kit, left + 3, base, 1, height);
  for (let x = 1; x <= 2; x++) for (let y = 0; y < height; y++) {
    if (y >= height - 3 && y < height - 1 || y < 3) continue;
    kit.wall('W0', left + x, base + y);
  }
  kit.window(2, 3, left + 1, base, 'arch');
  kit.window(2, 2, left + 1, base + height - 3, lantern ? 'rectangle' : 'round', lantern, lantern);
  roof(kit, left, base + height, 4);
}

function bridge(kit: DefinitionKit, left: number, base: number, width: number, top: number): void {
  blocks(kit, left, base, 2, top - base);
  blocks(kit, left + width - 2, base, 2, top - base);
  for (let x = 0; x < width; x++) kit.solid('B', left + x, top);
  for (let x = 2; x < 4; x++) {
    kit.solid('E-U', left + x, top - (4 - x));
    kit.solid('D-U', left + width - 1 - x, top - (4 - x));
  }
}

function foreground(kit: DefinitionKit, theme: DepthTheme): void {
  const cells: RockTerrainCell[] = [];
  const material = theme === 'valley' || theme === 'lake' ? 'dirt' : 'stone';
  for (const [left, width] of [[2, 8], [18, 12], [36, 10]] as const) {
    for (let x = left; x < left + width; x++) for (let y = -1; y < 1; y++) {
      cells.push({ x, y, shape: 'A', material, ore: false });
    }
  }
  kit.terrain(cells, terrainTextures);
  if (theme === 'buildings' || theme === 'ruins' || theme === 'coast') {
    for (const x of [2, 18, 45]) { kit.solid('B', x, 1); kit.solid('K', x + 1, 1); }
  }
  if (theme === 'cave') {
    blocks(kit, -2, 9, 4, 2); blocks(kit, 47, 10, 4, 2);
    kit.solid('J-180', 0, 8); kit.solid('J-180', 48, 9);
  }
}

function valley(kit: DefinitionKit, layer: DepthLayerId): void {
  if (layer === 'background-near') {
    land(kit, 0, -2, [[2, 1], [8, 2], [2, 1], [2, 0]]);
    land(kit, 32, -2, [[1, 1], [1, 2], [7, 3], [5, 2], [2, 1], [2, 0]]);
  } else if (layer === 'background-far') {
    land(kit, -4, -2, [[2, 0], [2, 1], [12, 2], [2, 1]]);
    bridge(kit, 15, -2, 15, 3);
    land(kit, 34, -2, [[2, 1], [2, 2], [8, 3], [2, 2], [2, 1]]);
  } else if (layer === 'distance-near') {
    land(kit, -14, -2, [[8, 1], [8, 2], [8, 3], [6, 2], [8, 1], [8, 0], [8, 1], [8, 2], [8, 1]]);
  } else if (layer === 'distance-mid') {
    land(kit, -8, -2, [[5, 1], [5, 2], [4, 3], [6, 4], [5, 3], [5, 2]]);
    land(kit, 35, -2, [[4, 1], [4, 2], [4, 3], [6, 4], [4, 3], [4, 2]]);
  }
}

function lake(kit: DefinitionKit, layer: DepthLayerId): void {
  if (layer === 'background-near') {
    land(kit, -6, -3, [[8, 1], [8, 2], [2, 1], [2, 0]]);
    land(kit, 34, -3, [[2, 0], [2, 1], [8, 2], [4, 1]]);
    house(kit, -5, 1);
    for (let x = 33; x < 40; x++) kit.platform('full', .75, 1, x);
  } else if (layer === 'background-far') {
    land(kit, -8, -3, [[4, 0], [16, 1], [2, 0]]);
    land(kit, 36, -3, [[2, 0], [2, 1], [10, 2], [4, 1]]);
  } else if (layer === 'distance-near') {
    land(kit, -12, -2, [[6, 0], [10, 1], [6, 2], [8, 1], [4, 0]]);
    land(kit, 42, -2, [[6, 0], [10, 1], [5, 2], [6, 1], [4, 0]]);
  } else if (layer === 'distance-mid') {
    land(kit, 7, -2, [[6, 0], [5, 1], [4, 2], [5, 1], [6, 0]]);
  }
}

function coast(kit: DefinitionKit, layer: DepthLayerId): void {
  if (layer === 'background-near') {
    land(kit, 0, -3, [[2, 1], [14, 2], [2, 1], [2, 0]]);
    land(kit, 32, -3, [[1, 1], [1, 2], [12, 3], [2, 2], [2, 1]]);
    house(kit, 7, 2); tower(kit, 35, 3, 5, true);
  } else if (layer === 'background-far') {
    land(kit, -8, -3, [[4, 0], [16, 1], [2, 0]]);
    land(kit, 36, -3, [[14, 2], [2, 1]]);
    house(kit, -4, 1); house(kit, 37, 2);
    for (let x = 9; x < 14; x++) kit.platform('full', .75, .5, x);
  } else if (layer === 'distance-near') {
    land(kit, -15, -2, [[6, 0], [14, 1], [5, 2], [5, 1], [4, 0]]);
    house(kit, -4, 1, 3);
    land(kit, 44, -2, [[4, 0], [4, 1], [4, 2], [4, 1], [4, 0]]);
  } else if (layer === 'distance-mid') {
    land(kit, 34, -2, [[6, 0], [6, 1], [4, 2], [4, 1], [6, 0]]);
  }
}

function town(kit: DefinitionKit, layer: DepthLayerId): void {
  if (layer === 'background-near') {
    land(kit, -2, 0, [[16, 1], [13, 2], [17, 3], [3, 2], [3, 1]]);
    house(kit, 2, 1); house(kit, 16, 2); house(kit, 34, 3);
  } else if (layer === 'background-far') {
    land(kit, -4, 0, [[26, 1], [28, 2]]);
    house(kit, 10, 1); house(kit, 24, 2); tower(kit, 35, 2, 6, false);
  } else if (layer === 'distance-near') {
    land(kit, -12, -1, [[80, 0]]);
    for (const x of [-10, 4, 19, 34, 49]) house(kit, x, 0, 3);
  } else if (layer === 'distance-mid') {
    for (const x of [-16, 12, 39, 64]) house(kit, x, -1, 3);
    tower(kit, 28, -1, 5, false);
  }
}

function ruins(kit: DefinitionKit, layer: DepthLayerId): void {
  if (layer === 'background-near') {
    land(kit, 8, -2, [[2, 0], [26, 1], [2, 0]]);
    blocks(kit, 16, 1, 2, 5); blocks(kit, 28, 1, 2, 3);
    blocks(kit, 18, 1, 10, 1);
    kit.window(8, 5, 18, 2, 'arch');
    blocks(kit, 16, 6, 5, 1); kit.solid('E', 21, 6);
    blocks(kit, 29, 4, 3, 1); kit.solid('D', 28, 4);
    blocks(kit, 10, 1, 1, 2); blocks(kit, 35, 1, 1, 2);
  } else if (layer === 'background-far') {
    land(kit, -4, -2, [[22, 1], [3, 0]]);
    land(kit, 34, -2, [[3, 1], [13, 2], [3, 1]]);
    blocks(kit, 7, 1, 2, 4); blocks(kit, 10, 1, 1, 3); blocks(kit, 7, 5, 5, 1);
    blocks(kit, 37, 2, 2, 5); kit.window(3, 3, 39, 3, 'broken');
  } else if (layer === 'distance-near') {
    land(kit, -8, -2, [[10, 0], [12, 1], [8, 0]]);
    land(kit, 32, -2, [[4, 0], [12, 1], [8, 0]]);
    blocks(kit, 6, 1, 2, 3); blocks(kit, 38, 1, 3, 4);
  } else if (layer === 'distance-mid') {
    land(kit, 5, -2, [[8, 0], [10, 1], [8, 0]]);
    blocks(kit, 15, 1, 2, 4); blocks(kit, 20, 1, 1, 2);
  }
}

function cave(kit: DefinitionKit, layer: DepthLayerId): void {
  if (layer === 'background-near') {
    land(kit, 0, -2, [[2, 8], [1, 7], [1, 6], [1, 5], [1, 4], [1, 3], [5, 2], [2, 1]]);
    land(kit, 34, -2, [[1, 1], [8, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [3, 8]]);
    blocks(kit, 2, 9, 8, 2); kit.solid('E-U', 10, 9);
    blocks(kit, 43, 10, 7, 2); kit.solid('D-U', 42, 10);
  } else if (layer === 'background-far') {
    land(kit, -4, -1, [[20, 1], [2, 0]]);
    land(kit, 34, -1, [[2, 1], [14, 2]]);
    bridge(kit, 14, 0, 21, 8);
    kit.solid('J-180', 18, 7); kit.solid('J-180', 30, 7);
  } else if (layer === 'distance-near') {
    land(kit, -8, 0, [[4, 5], [2, 4], [2, 3], [4, 2], [8, 1]]);
    land(kit, 37, 0, [[4, 1], [2, 2], [2, 3], [4, 4], [4, 5]]);
    blocks(kit, 21, -1, 2, 6); kit.solid('J', 21, 5); kit.solid('J', 22, 5);
  } else if (layer === 'distance-mid') {
    bridge(kit, -2, -1, 17, 7);
    blocks(kit, 29, 6, 18, 2); blocks(kit, 44, -1, 3, 7);
    kit.solid('E-U', 28, 6); kit.solid('J-180', 35, 5);
  } else if (layer === 'distance-far') {
    blocks(kit, -10, -2, 2, 12); blocks(kit, 57, -2, 2, 14);
    blocks(kit, -8, 10, 20, 1); blocks(kit, 42, 12, 15, 1);
    for (let x = 12; x < 22; x++) {
      const y = 11 + (x - 12) * .5;
      blocks(kit, x, y, 1, 1); kit.solid('F', x, y + 1);
    }
    blocks(kit, 22, 16, 10, 1);
    for (let x = 32; x < 42; x++) {
      const y = 16 - (x - 32) * .5;
      blocks(kit, x, y, 1, 1); kit.solid('I', x, y + 1);
    }
  }
}

/** 层深、材质与装饰由宿主统一装配；这里仅使用共享定义构件搭建完整景观。 */
export function buildDepthScenery(kit: DefinitionKit, theme: DepthTheme, layer: DepthLayerId): void {
  if (layer === 'foreground') { foreground(kit, theme); return; }
  if (theme === 'valley') valley(kit, layer);
  else if (theme === 'lake') lake(kit, layer);
  else if (theme === 'coast') coast(kit, layer);
  else if (theme === 'buildings') town(kit, layer);
  else if (theme === 'ruins') ruins(kit, layer);
  else cave(kit, layer);
}
