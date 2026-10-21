import { RESIDENCE_WORLD } from '../../config/residence.ts';
import { hash01 } from '../../core/rng.ts';

export const RIVER_LEVEL = -28;
export const DISTRICT_LEVEL = -27.35;
export const RIVER_LEFT = RESIDENCE_WORLD.minX - 850;
export const RIVER_RIGHT = RESIDENCE_WORLD.maxX + 850;

export interface RiverDistrict {
  x: number;
  z: number;
  width: number;
  depth: number;
  kind: 'garden' | 'civic' | 'landmark';
  seed: number;
}

/** 同一河湾内的岸块尺度和进深不同，纵深水道不再被规则的椭圆阵列切开。 */
export function residenceRiverDistricts(homeCenter: number): RiverDistrict[] {
  const districts: RiverDistrict[] = [];
  for (let segment = -4; segment <= 4; segment++) {
    const x = homeCenter + segment * 680;
    if (x < RIVER_LEFT - 400 || x > RIVER_RIGHT + 400) continue;
    const plans = [
      { dx: -192, z: -166, width: 196, depth: 116, kind: 'garden' },
      { dx: 188, z: -267, width: 242, depth: 145, kind: 'garden' },
      { dx: -93, z: -472, width: 279, depth: 194, kind: 'civic' },
      { dx: 242, z: -660, width: 313, depth: 221, kind: 'landmark' },
      { dx: -222, z: -922, width: 327, depth: 211, kind: 'civic' },
    ] as const;
    for (const [index, plan] of plans.entries()) {
      const seed = 100 + index * 100 + segment * 13;
      const isMainLandmark = segment === 0 && plan.kind === 'landmark';
      districts.push({
        x: x + plan.dx + (isMainLandmark ? 0 : (hash01(index, segment, 91) - .5) * 43),
        z: plan.z + (hash01(index, segment, 17) - .5) * 30,
        width: plan.width * (.94 + hash01(index, segment, 83) * .14),
        depth: plan.depth * (.92 + hash01(index, segment, 43) * .17),
        kind: plan.kind, seed,
      });
    }
  }
  return districts;
}

/** 超椭圆直岸与弧角组合成半岛轮廓；凹进处形成港湾，保留内部可建造空间。 */
export function districtOutline(district: RiverDistrict, inset = 0): [number, number][] {
  const phase = hash01(district.seed, 1, 17) * Math.PI * 2;
  const power = district.kind === 'garden' ? .72 : .62;
  return Array.from({ length: 64 }, (_, i) => {
    const angle = i / 64 * Math.PI * 2;
    const c = Math.cos(angle), s = Math.sin(angle);
    const ripple = 1 + Math.sin(angle * 3 + phase) * .07 + Math.cos(angle * 5 + phase) * .035;
    return [district.x + Math.sign(c) * Math.pow(Math.abs(c), power) * (district.width / 2 - inset) * ripple,
      district.z + Math.sign(s) * Math.pow(Math.abs(s), power) * (district.depth / 2 - inset) * ripple];
  });
}
