/**
 * 格子世界的 1/4 光场来源：实体与平台取 1/4 掩码，背景墙按墙形状、窗透光，物件层的灯是灯源，能量门按实心（门板另带门标记），
 * 水按子格水面（子格中心在水面以下）占子格，树冠椭圆、浮空岛穿透与洞穴发光源照旧并入。
 * 掩码变化（含形状与同格组合）经 TileMap.onMaskChange、墙与物件经 building.onChange、门经 parts.onChange 失效；
 * 水量变化由调用方按节奏 scanWater（只重扫水量版本变了的区块）。
 */
import { ISLAND_LIGHT } from '../config/cave-island-rules.ts';
import { WALL_POLYGONS, type DefinitionPoint } from '../config/definition-kit.ts';
import { getResidenceResource } from '../config/residence.ts';
import { FLUID_FULL, type FluidMap } from './fluid-map.ts';
import type { TreeInstance } from './level.ts';
import {
  LIGHT_CELL, MEDIUM_DOOR, MEDIUM_FOLIAGE, MEDIUM_PASS, MEDIUM_PLATFORM, MEDIUM_SOLID, MEDIUM_WALL, MEDIUM_WATER, createLightField,
  srgbToLinear, stepTable, worldLightRules, type LightEmitter, type LightField, type LightFieldSource, type LightLamp, type LightRules,
} from './light-field.ts';
import type { TileMap } from './tile-map.ts';
import { SUBCELLS } from './tile-shapes.ts';

/** 树冠遮光椭圆（格坐标）。 */
interface CanopyRegion {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

/** 由树生成树冠椭圆：中心在树冠中部，半宽 = canopyHalfWidth，半高 = canopyHeight/2。 */
export function treeCanopies(trees: readonly TreeInstance[]): CanopyRegion[] {
  return trees.map((t) => ({
    cx: t.x + 0.5 + t.crownDx,
    cy: t.baseY + t.trunkHeight + t.canopyHeight / 2,
    rx: Math.max(0.5, t.canopyHalfWidth),
    ry: Math.max(0.5, t.canopyHeight / 2),
  }));
}

/**
 * 城区的天空光：空气每子格按比例衰减并以 2 兜住尾巴，约每格 ×.8，离窗约 5 格降到三成、12 格归零；
 * 低于 5/255 直接归零，长尾不会把整片暗处抬成一层灰。
 */
const SKY_AIR_PASS = .9457, SKY_MIN_STEP = 2, SKY_MIN_LIGHT = 5;
/** 天空光离开一个实心子格时保留的比例：每格约 ×.27，255 在约 3 格厚实心内截断为 0；城区着色器按它把实心内亮度换算成深度。 */
export const CITY_SKY_SOLID_PASS = .72;

/** 城区规则：floorRow（子格行）及以上无墙无实心的空气露天；平台、门都按实心衰减。 */
export function cityLightRules(floorRow: number): LightRules {
  const cut = (light: number): number => light < SKY_MIN_LIGHT ? 0 : light;
  const air = stepTable((light) => cut(light - Math.max(SKY_MIN_STEP, Math.ceil(light * (1 - SKY_AIR_PASS)))));
  const solid = stepTable((light) => cut(Math.floor(light * CITY_SKY_SOLID_PASS)));
  return { air, solid, water: air, foliage: air, platform: solid, pass: solid, sky: { kind: 'open', floorRow } };
}

export interface WorldLightFieldInput {
  readonly map: TileMap;
  readonly fluid: FluidMap;
  readonly trees: readonly TreeInstance[];
  readonly decay: Parameters<typeof worldLightRules>[0];
  /** 覆盖按 decay 生成的世界规则（城区用 cityLightRules）。 */
  readonly rules?: LightRules;
  readonly emitters?: readonly LightEmitter[];
  /** 浮空岛所在格（行主序逻辑格，1 = 天空光穿透）。 */
  readonly skyPass?: Uint8Array;
}

export interface WorldLightField extends LightField {
  /** 重扫上次扫描以来水量版本变了的区块，水面子格变了的格失效（下次 sync 生效）；返回这些区块的列范围（含），无变化为 null。 */
  scanWater(): { readonly x0: number; readonly x1: number } | null;
  /** 砍倒的树：擦掉树冠遮光。 */
  removeTree(id: number): void;
  dispose(): void;
}

/** 格内被水占的子格位（位 sy*4+sx）：子格中心在其水面以下，即上方子格有水或水量过半（同 FluidQuery.subTopAt > .5）。 */
function wetBits(fluid: FluidMap, tx: number, ty: number): number {
  const { cells, subWidth } = fluid;
  const last = fluid.subHeight - 1;
  let bits = 0;
  for (let r = 0; r < SUBCELLS; r++) {
    const sy = ty * SUBCELLS + r;
    const row = sy * subWidth + tx * SUBCELLS;
    for (let k = 0; k < SUBCELLS; k++) {
      const a = cells[row + k]!;
      if (a === 0) continue;
      if (a * 2 > FLUID_FULL || (sy < last && cells[row + k + subWidth]! > 0)) bits |= 1 << (r * SUBCELLS + k);
    }
  }
  return bits;
}

function insidePolygon(points: readonly DefinitionPoint[], x: number, y: number): boolean {
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

/** 背景墙在格内的子格位；窗占墙层但透光，没有墙位。 */
function wallBits(wallId: string): number {
  const polygon = WALL_POLYGONS[wallId];
  if (polygon === undefined) {
    if (getResidenceResource(wallId).kind !== 'glazing') throw new Error(`light-field: wall '${wallId}' has no polygon and is not glazing`);
    return 0;
  }
  let bits = 0;
  for (let sy = 0; sy < SUBCELLS; sy++) for (let sx = 0; sx < SUBCELLS; sx++) {
    if (insidePolygon(polygon, (sx + .5) / SUBCELLS, (sy + .5) / SUBCELLS)) bits |= 1 << (sy * SUBCELLS + sx);
  }
  return bits;
}

export function createWorldLightField(input: WorldLightFieldInput): WorldLightField {
  const { map, fluid } = input;
  const { width, height } = map;
  if (fluid.width !== width || fluid.height !== height) throw new Error(`light-field: fluid ${fluid.width}×${fluid.height} does not match map ${width}×${height}`);
  const skyPass = input.skyPass;
  if (skyPass !== undefined && skyPass.length !== width * height) throw new Error(`light-field: skyPass length ${skyPass.length} does not match ${width}×${height}`);
  const canopies = treeCanopies(input.trees);
  const canopyOf = new Map(input.trees.map((t, i) => [t.id, canopies[i]!]));
  const removed = new Set<CanopyRegion>();
  const wallCache = new Map<string, number>();
  // 上次 scanWater 看到的区块水量版本与各格水面子格；只由 scanWater 更新，未计算条带里的变化也会在扫描时失效邻近条带。
  const seenChunks = fluid.chunkRevisions.slice();
  // 一格一行的 4 个子格正好是一个 32 位字：四行全零即无水，大片干地不必逐子格看。
  const quads = new Uint32Array(fluid.cells.buffer, fluid.cells.byteOffset, fluid.cells.length / SUBCELLS);
  const wetAt = (tx: number, ty: number): number => {
    const q = ty * SUBCELLS * width + tx;
    return quads[q]! | quads[q + width]! | quads[q + 2 * width]! | quads[q + 3 * width]! ? wetBits(fluid, tx, ty) : 0;
  };
  const wetSeen = new Uint16Array(width * height);
  for (let ty = 0; ty < height; ty++) for (let tx = 0; tx < width; tx++) wetSeen[ty * width + tx] = wetAt(tx, ty);

  const source: LightFieldSource = {
    minX: 0, minY: 0, width, height, emitters: input.emitters ?? [],
    rasterize(x0, y0, x1, y1, out) {
      out.fill(0);
      const w = x1 - x0;
      const set = (sx: number, sy: number, bits: number): void => {
        if (sx >= x0 && sx < x1 && sy >= y0 && sy < y1) out[(sy - y0) * w + sx - x0]! |= bits;
      };
      for (let ty = Math.floor(y0 / SUBCELLS); ty * SUBCELLS < y1; ty++) {
        for (let tx = Math.floor(x0 / SUBCELLS); tx * SUBCELLS < x1; tx++) {
          const solid = map.solidMask(tx, ty), platform = map.platformMask(tx, ty);
          const wall = map.building.wallAt(tx, ty);
          let walls = 0;
          if (wall && wall.x === tx && wall.y === ty) {
            let bits = wallCache.get(wall.wallId);
            if (bits === undefined) wallCache.set(wall.wallId, bits = wallBits(wall.wallId));
            walls = bits;
          }
          const wet = wetAt(tx, ty);
          const pass = skyPass?.[ty * width + tx] === 1 ? MEDIUM_PASS : 0;
          if (solid === 0 && platform === 0 && walls === 0 && wet === 0 && pass === 0) continue;
          for (let bit = 0; bit < SUBCELLS * SUBCELLS; bit++) {
            const sx = bit % SUBCELLS, sy = (bit - sx) / SUBCELLS, flag = 1 << bit;
            const m = (solid & flag ? MEDIUM_SOLID : 0) | (platform & flag ? MEDIUM_PLATFORM : 0) | (walls & flag ? MEDIUM_WALL : 0)
              | (wet & flag ? MEDIUM_WATER : 0) | pass;
            if (m) set(tx * SUBCELLS + sx, ty * SUBCELLS + sy, m);
          }
        }
      }
      // 能量门：门楣实心，关闭时的门板另带门标记（半格厚，渲染端按半透明遮挡太阳）。
      for (const part of map.parts.query(x0 * LIGHT_CELL, y0 * LIGHT_CELL, x1 * LIGHT_CELL, y1 * LIGHT_CELL)) {
        if (part.kind !== 'door') continue;
        part.solids.forEach((points, index) => {
          const xs = points.map(([px]) => px), ys = points.map(([, py]) => py);
          for (let sy = Math.floor(Math.min(...ys) * SUBCELLS); sy < Math.ceil(Math.max(...ys) * SUBCELLS); sy++) {
            for (let sx = Math.floor(Math.min(...xs) * SUBCELLS); sx < Math.ceil(Math.max(...xs) * SUBCELLS); sx++) {
              if (insidePolygon(points, (sx + .5) * LIGHT_CELL, (sy + .5) * LIGHT_CELL)) set(sx, sy, MEDIUM_SOLID | (index > 0 ? MEDIUM_DOOR : 0));
            }
          }
        });
      }
      // 树冠：子格中心落在椭圆内即遮光（被实心、平台、水占的子格按优先级不受影响）。
      for (const c of canopies) {
        if (removed.has(c)) continue;
        const sx0 = Math.max(x0, Math.floor((c.cx - c.rx) * SUBCELLS)), sx1 = Math.min(x1, Math.ceil((c.cx + c.rx) * SUBCELLS));
        const sy0 = Math.max(y0, Math.floor((c.cy - c.ry) * SUBCELLS)), sy1 = Math.min(y1, Math.ceil((c.cy + c.ry) * SUBCELLS));
        for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
          const dx = ((sx + .5) * LIGHT_CELL - c.cx) / c.rx, dy = ((sy + .5) * LIGHT_CELL - c.cy) / c.ry;
          if (dx * dx + dy * dy <= 1) out[(sy - y0) * w + sx - x0]! |= MEDIUM_FOLIAGE;
        }
      }
    },
    lamps() {
      const out: LightLamp[] = [];
      for (const object of map.building.objects()) {
        const light = object.light;
        if (!light) continue;
        out.push({
          key: object, x: object.x + light.offset.x, y: object.y + light.offset.y, z: light.offset.z,
          color: { r: srgbToLinear(light.color >> 16 & 255), g: srgbToLinear(light.color >> 8 & 255), b: srgbToLinear(light.color & 255) },
          radius: light.radius, intensity: light.intensity,
        });
      }
      return out;
    },
  };

  const field = createLightField(source, input.rules ?? worldLightRules(input.decay, { shade: ISLAND_LIGHT.SKY_SHADE, decay: ISLAND_LIGHT.SKY_PASS_DECAY }));
  const unsubscribe = [
    map.onMaskChange((tx, ty) => field.invalidate(tx, ty, tx + 1, ty + 1)),
    map.building.onChange((x0, y0, x1, y1) => field.invalidate(x0, y0, x1, y1)),
    // 太阳能板每 tick 转动，不进光场。
    map.parts.onChange((kind, x0, y0, x1, y1) => { if (kind === 'door') field.invalidate(x0, y0, x1, y1); }),
  ];
  return Object.assign(field, {
    scanWater() {
      const revisions = fluid.chunkRevisions;
      let x0 = width, x1 = -1;
      const check = (tx: number, ty: number): void => {
        const i = ty * width + tx;
        const wet = wetAt(tx, ty);
        if (wet === wetSeen[i]) return;
        wetSeen[i] = wet;
        field.invalidate(tx, ty, tx + 1, ty + 1);
      };
      for (let k = 0; k < revisions.length; k++) {
        if (revisions[k] === seenChunks[k]) continue;
        seenChunks[k] = revisions[k]!;
        const cx = k % fluid.chunksX, cy = (k - cx) / fluid.chunksX;
        const size = fluid.chunkSize;
        const tx0 = cx * size, tx1 = Math.min(width, tx0 + size);
        // 区块底边下方一行也要重查：“上方子格有水”时其水面到子格顶。
        const ty0 = Math.max(0, cy * size - 1), ty1 = Math.min(height, (cy + 1) * size);
        for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) check(tx, ty);
        x0 = Math.min(x0, tx0);
        x1 = Math.max(x1, tx1 - 1);
      }
      return x1 < 0 ? null : { x0, x1 };
    },
    removeTree(id: number) {
      const canopy = canopyOf.get(id);
      if (canopy === undefined) throw new Error(`light-field: removeTree unknown tree ${id}`);
      if (removed.has(canopy)) throw new Error(`light-field: tree ${id} already removed`);
      removed.add(canopy);
      field.invalidate(Math.floor(canopy.cx - canopy.rx), Math.floor(canopy.cy - canopy.ry), Math.ceil(canopy.cx + canopy.rx), Math.ceil(canopy.cy + canopy.ry));
    },
    dispose() { for (const off of unsubscribe) off(); },
  });
}
