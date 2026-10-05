// 斜坡渲染测试共享夹具（render-slopes / render-flora）。
import { LEVEL_LEGEND, parseLevel } from '../../src/world/test-level.ts';
import type { LevelLegend } from '../../src/world/test-level.ts';
import { SHAPE_HALF, SHAPE_SLOPE_L, SHAPE_SLOPE_R } from '../../src/world/tile-shapes.ts';

/** 草皮斜坡图例：'g' 草，'r' 草 SLOPE_R，'l' 草 SLOPE_L，'h' 草半砖。 */
export const GRASS_LEGEND: LevelLegend = Object.freeze({
  ...LEVEL_LEGEND,
  g: { tile: 'grass' },
  r: { tile: 'grass', shape: SHAPE_SLOPE_R },
  l: { tile: 'grass', shape: SHAPE_SLOPE_L },
  h: { tile: 'grass', shape: SHAPE_HALF },
});

/**
 * 坡地夹具（16×8）：x=1..3 平地顶 y=3；x=4 斜坡 R（3→4）；x=5..7 顶 y=4；x=8 斜坡 L（4→3）；
 * x=9 半砖（3.5）；x=10 顶 y=3；x=11 顶 y=4（台阶，无斜坡）；x=12..13 顶 y=3；x=14 顶 y=2。
 */
export const SLOPE_ROWS = [
  '=..............=',
  '=..............=',
  '=..............=',
  '=.P............=',
  '=...rggglh.g...=',
  '=gggg###gggggg.=',
  '=##############=',
  '================',
];

export function slopeLevel() {
  return parseLevel(SLOPE_ROWS, GRASS_LEGEND);
}
