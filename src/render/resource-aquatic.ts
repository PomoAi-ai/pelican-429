import type { LevelData } from '../world/level.ts';
import { mulberry32 } from '../core/rng.ts';
import { BED_KINDS, BED_RULES, FLOAT_KINDS, FLOAT_RULES, planMotes } from './water-flora.ts';
import type { BedKind, FloatKind, MoteKind } from './water-flora.ts';
import type { WaterFloraPlan } from './water-flora-view.ts';

/** 强制摆出所选物种，实例尺寸取正式规则，运动仍由 water-flora-view 驱动。 */
export function aquaticPreviewPlan(level: LevelData, kind: BedKind | FloatKind | MoteKind, seed: number): WaterFloraPlan {
  const rng = mulberry32(seed);
  const sample = ([lo, hi]: readonly [number, number]): number => lo + (hi - lo) * rng();
  const lake = level.lakes[0]!;
  if ((BED_KINDS as readonly string[]).includes(kind)) {
    const bedKind = kind as BedKind;
    const rule = BED_RULES[bedKind];
    return { floaters: [], motes: [], bed: Array.from({ length: 3 }, (_, i) => ({
      kind: bedKind, lake: 0, x: 23 + i, y: lake.level - 5, tx: 23 + i, ty: lake.level - 5, z: 0,
      height: sample(rule.height), width: 1, yaw: rng() * Math.PI, tint: rule.palette[Math.floor(rng() * rule.palette.length)]!,
    })) };
  }
  if ((FLOAT_KINDS as readonly string[]).includes(kind)) {
    const floatKind = kind as FloatKind;
    const rule = FLOAT_RULES[floatKind];
    return { bed: [], motes: [], floaters: Array.from({ length: 3 }, (_, i) => ({
      kind: floatKind, lake: 0, u: (23 + i - lake.x0) / (lake.x1 + 1 - lake.x0), z: 0,
      yaw: rng() * Math.PI, scale: sample(rule.size), mobility: rule.mobility, phase: rng() * Math.PI * 2,
      tint: rule.palette[Math.floor(rng() * rule.palette.length)]!,
    })) };
  }
  return { bed: [], floaters: [], motes: planMotes(level.lakes, () => 5).map((mote) => ({ ...mote, kind: kind as MoteKind })) };
}
