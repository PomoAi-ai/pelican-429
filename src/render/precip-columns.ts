/**
 * 降水列数据（任务 022）：每列一个 RGBA float 纹素（DataTexture，宽 = 地图宽，高 1，最近邻采样），供雨雪粒子、溅射、滴水与
 * 湿润/积雪着色共用（GLSL precipColumn(x)，见 precip-surface）：
 * - R = roof：最高遮挡格顶边（world/sky-exposure；洞穴、浮空岛下、渔屋内都在其下 → 不下雨、不积雪）；
 *   该格是斜坡/半砖时取顶边 − 0.5（坡面平均高度；着色器在相邻列间线性插值后正好贴合连续斜坡）；
 * - G = stop：降水落点 = max(roof, 该列水面)（雨丝/雪花落到这里消失，溅射/涟漪画在这里）；
 * - B = 雪量系数（沙漠核心 = desertFactor，过渡带线性渐变，其余 1）；
 * - A = 落点是水面（1）还是实心顶面（0）。
 * refresh(x0, x1) 只重算给定列区间（视野 ± 边距，调用方按帧节流），有变化才重新上传纹理。
 */
import * as THREE from 'three';
import type { DesertInfo } from '../world/level.ts';
import { roofTop } from '../world/sky-exposure.ts';
import { SHAPE_FULL } from '../world/tile-shapes.ts';
import type { TileQuery } from '../world/tile-map.ts';

/** 视为水面的最小水量（0..255；更薄的水膜不算水面）。 */
export const PRECIP_WATER_MIN = 8;

export interface PrecipColumnSource {
  readonly map: TileQuery;
  /** 格子水（FluidMap 满足）：行主序水量 0..255。 */
  readonly fluid: { readonly width: number; readonly height: number; readonly cells: Uint8Array };
  readonly deserts: readonly DesertInfo[];
  /** 沙漠核心的雪量系数 [0,1]。 */
  readonly desertFactor: number;
}

export interface PrecipColumn {
  readonly roof: number;
  readonly stop: number;
  readonly snow: number;
  readonly water: boolean;
}

/** 列 x 的雪量系数：沙漠核心 [x0,x1] = factor，过渡带 [lo,x0)、(x1,hi] 线性渐变到 1，其余 1。 */
export function desertSnowFactor(deserts: readonly DesertInfo[], x: number, factor: number): number {
  let k = 1;
  for (const d of deserts) {
    if (x < d.lo || x > d.hi) continue;
    let w: number;
    if (x >= d.x0 && x <= d.x1) w = 1;
    else if (x < d.x0) w = (x - d.lo + 1) / Math.max(1, d.x0 - d.lo + 1);
    else w = (d.hi - x + 1) / Math.max(1, d.hi - d.x1 + 1);
    k = Math.min(k, 1 + (factor - 1) * Math.min(1, Math.max(0, w)));
  }
  return k;
}

/** 列 tx 自 roof 起向上的连续水柱顶（无水 = roof）。 */
export function waterTop(fluid: PrecipColumnSource['fluid'], tx: number, roof: number): number {
  let top = roof;
  for (let ty = Math.max(0, roof); ty < fluid.height; ty++) {
    const a = fluid.cells[ty * fluid.width + tx] as number;
    if (a < PRECIP_WATER_MIN) break;
    top = ty + a / 255;
    if (a < 255) break;
  }
  return top;
}

export function computePrecipColumn(src: PrecipColumnSource, tx: number): PrecipColumn {
  const top = roofTop(src.map, tx);
  const roof = top > 0 && src.map.shapeAt(tx, top - 1) !== SHAPE_FULL ? top - 0.5 : top;
  const w = waterTop(src.fluid, tx, top);
  const water = w > top + 1e-3;
  return { roof, stop: water ? w : roof, snow: desertSnowFactor(src.deserts, tx, src.desertFactor), water };
}

export interface PrecipColumns {
  readonly width: number;
  readonly texture: THREE.DataTexture;
  /** RGBA float，长度 width × 4。 */
  readonly data: Float32Array;
  at(tx: number): PrecipColumn;
  /** 重算列 [x0, x1]（夹到地图内）；有变化则标记纹理更新并返回 true。 */
  refresh(x0: number, x1: number): boolean;
  dispose(): void;
}

export function createPrecipColumns(src: PrecipColumnSource): PrecipColumns {
  const { map, fluid } = src;
  if (!map || !fluid) throw new Error('precip-columns: map and fluid are required');
  if (fluid.width !== map.width || fluid.height !== map.height) {
    throw new Error(`precip-columns: fluid ${fluid.width}×${fluid.height} does not match map ${map.width}×${map.height}`);
  }
  if (!(src.desertFactor >= 0 && src.desertFactor <= 1)) throw new Error(`precip-columns: desertFactor must be in [0,1], got ${src.desertFactor}`);
  const W = map.width;
  const data = new Float32Array(W * 4);
  const write = (tx: number): boolean => {
    const c = computePrecipColumn(src, tx);
    const i = tx * 4;
    const water = c.water ? 1 : 0;
    if (data[i] === c.roof && data[i + 1] === Math.fround(c.stop) && data[i + 2] === Math.fround(c.snow) && data[i + 3] === water) return false;
    data[i] = c.roof;
    data[i + 1] = c.stop;
    data[i + 2] = c.snow;
    data[i + 3] = water;
    return true;
  };
  for (let tx = 0; tx < W; tx++) write(tx);
  const texture = new THREE.DataTexture(data, W, 1, THREE.RGBAFormat, THREE.FloatType);
  texture.name = 'precip-columns';
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return {
    width: W,
    texture,
    data,
    at(tx) {
      if (!Number.isInteger(tx) || tx < 0 || tx >= W) throw new Error(`precip-columns: column ${tx} outside width ${W}`);
      const i = tx * 4;
      return { roof: data[i] as number, stop: data[i + 1] as number, snow: data[i + 2] as number, water: data[i + 3] === 1 };
    },
    refresh(x0, x1) {
      if (!Number.isFinite(x0) || !Number.isFinite(x1)) throw new Error(`precip-columns: invalid range [${x0}, ${x1}]`);
      const a = Math.max(0, Math.floor(x0));
      const b = Math.min(W - 1, Math.ceil(x1));
      let changed = false;
      for (let tx = a; tx <= b; tx++) if (write(tx)) changed = true;
      if (changed) texture.needsUpdate = true;
      return changed;
    },
    dispose() {
      texture.dispose();
    },
  };
}
