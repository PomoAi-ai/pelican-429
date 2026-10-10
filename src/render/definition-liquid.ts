import * as THREE from 'three';
import type { WaterPaletteName } from '../config/water-palettes.ts';
import type { DefinitionCollider } from '../physics/definition-collision.ts';
import { createFluidMap, FLUID_FULL } from '../world/fluid-map.ts';
import { createTileMap } from '../world/tile-map.ts';
import { DEFAULT_TILES, TILE_STONE } from '../world/tile-types.ts';
import { createDefinitionKit } from './definition-kit.ts';
import { createWaterView, WATER_FRONT_Z, WATER_TOP_BACK_Z } from './water-view.ts';

export interface DefinitionLiquid {
  readonly root: THREE.Group;
  readonly solids: DefinitionCollider[];
  readonly width: number;
  readonly height: number;
  readonly playerX: number;
  readonly playerY: number;
  update(time: number): void;
  dispose(): void;
}

/** 三个剖面水池使用游戏水量与材质；定义坐标沿 +Z 指向背景墙。 */
export function createDefinitionLiquid(): DefinitionLiquid {
  const root = new THREE.Group();
  root.name = 'definition-liquid';
  const kit = createDefinitionKit();
  root.add(kit.root);
  const width = 18;
  const height = 7;
  const view = { x: 0, y: 0, w: 6, h: height };
  const pools: readonly { depth: number; palette: WaterPaletteName }[] = [
    { depth: .5, palette: 'clear' },
    { depth: 2, palette: 'emerald' },
    { depth: 3, palette: 'deep' },
  ];
  const waters = pools.map(({ depth, palette }, index) => {
    const offset = index * 6;
    const map = createTileMap(6, height, DEFAULT_TILES);
    const solid = (x: number, y: number): void => {
      map.set(x, y, TILE_STONE);
      kit.solid('A', x + offset, y);
    };
    for (let x = 0; x < 6; x++) solid(x, 0);
    const wallHeight = Math.ceil(depth + .25);
    for (let y = 1; y <= wallHeight; y++) {
      solid(0, y);
      solid(5, y);
      for (let x = 1; x < 5; x++) kit.wall('W0', x + offset, y);
    }
    const fluid = createFluidMap(map);
    for (let y = 1; y <= Math.ceil(depth); y++) {
      const amount = Math.round(Math.min(1, depth - y + 1) * FLUID_FULL);
      for (let x = 1; x < 5; x++) fluid.set(x, y, amount);
    }
    const water = createWaterView(fluid, { palette, marginChunks: 0 });
    // 世界水面含后沿延伸；这里只把其完整 Z 包络装配到实体的 1 格深内。
    const waterDepth = WATER_FRONT_Z - WATER_TOP_BACK_Z;
    water.root.scale.z = -1 / waterDepth;
    water.root.position.set(offset, 0, WATER_FRONT_Z / waterDepth - .5);
    root.add(water.root);
    water.update(view, 0);
    return { water, fluid };
  });
  return {
    root, solids: kit.solids, width, height, playerX: .5, playerY: 2,
    update(time) {
      for (const { water } of waters) water.update(view, time);
    },
    dispose() {
      for (const { water, fluid } of waters) {
        water.dispose();
        fluid.dispose();
      }
      kit.dispose();
      root.clear();
    },
  };
}
