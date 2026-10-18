import { mulberry32 } from '../core/rng.ts';

export type HarborBuilding = {
  x: number; z: number; width: number; depth: number; height: number;
  kind: 'slab' | 'stepped' | 'blade' | 'twin' | 'ring' | 'spire';
  detail: 0 | 1 | 2; seed: number;
};

export const HARBOR_RIVER = { left: -50, right: 50, near: 2, far: -480, level: -2.8 } as const;
export const HARBOR_ART_FILES = ['sky.jpg'];

export function createHarborDistrict(): HarborBuilding[] {
  const random = mulberry32(0x48b0a);
  const buildings: HarborBuilding[] = [];
  const add = (x: number, z: number, width: number, depth: number, height: number,
    kind: HarborBuilding['kind'], detail: HarborBuilding['detail']): void => {
    buildings.push({ x, z, width, depth, height, kind, detail, seed: buildings.length + 31 });
  };
  // 沿河先留低矮街区与广场，高楼后退形成第二道天际线。
  for (const side of [-1, 1]) {
    for (const [i, z] of [-24, -64, -114, -170, -209].entries()) {
      if (i === (side < 0 ? 2 : 1)) continue;
      add(side * (66 + i % 2 * 4), z, 18 + random() * 5, 14 + random() * 4,
        7 + random() * 7, i % 2 ? 'stepped' : 'slab', 2);
    }
    for (let row = 0; row < 3; row++) {
      for (let lot = 0; lot < 6; lot++) {
        const z = -22 - lot * 37 - row * 8;
        const x = side * (100 + row * 38 + random() * 5);
        const height = 18 + random() * 37 + (lot > 2 ? 9 : 0);
        const kinds = ['slab', 'stepped', 'blade', 'ring', 'slab', 'twin'] as const;
        add(x, z, 11 + random() * 7, 12 + random() * 7, height,
          kinds[(lot + row + (side > 0 ? 2 : 0)) % kinds.length]!, row === 0 ? 2 : 1);
      }
    }
  }
  add(-82, -42, 14, 15, 49, 'blade', 2);
  add(112, -104, 18, 18, 78, 'twin', 2);
  add(-110, -172, 16, 17, 69, 'ring', 2);
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 28; column++) {
      const x = -284 + column * 21 + (row % 2) * 9 + random() * 3;
      const z = -248 - row * 43 - random() * 6;
      if (Math.abs(x) < 64 || (row === 1 && Math.abs(x - 80) < 22)) continue;
      const kinds = ['slab', 'stepped', 'blade', 'slab', 'ring'] as const;
      const height = 14 + random() * (row === 3 ? 35 : 42);
      add(x, z, 9 + random() * 6, 11 + random() * 7, height,
        kinds[(column + row * 2) % kinds.length]!, row < 2 ? 1 : 0);
    }
  }
  add(80, -294, 19, 20, 112, 'spire', 2);
  add(-68, -280, 17, 18, 73, 'blade', 1);
  add(116, -310, 19, 19, 82, 'ring', 1);
  for (let row = 0; row < 2; row++) {
    for (let lot = 0; lot < 25; lot++) {
      add(-150 + lot * 12 + row * 4, -530 - row * 36, 6 + random() * 4, 9 + random() * 4,
        9 + random() * 25, lot % 3 ? 'slab' : 'blade', 0);
    }
  }
  return buildings;
}
