import { DEFINITION_DEPTH, TILE_SHAPE_DEFINITIONS, WALL_POLYGONS, type DefinitionPoint } from '../config/definition-kit.ts';
import { getResidenceResource, RESIDENCE_LIGHTS, RESIDENCE_WORLD, type ResidenceLight } from '../config/residence.ts';
import type { ResidencePlacement, ResidenceState } from './residence.ts';

export interface ResidenceLamp {
  readonly placement: ResidencePlacement;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  /** 线性空间颜色。 */
  readonly color: { readonly r: number; readonly g: number; readonly b: number };
  readonly radius: number;
  /** 渲染端点光强度。 */
  readonly intensity: number;
}

export interface ResidenceLightField {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  /** 遮挡度：0 空气、1 半透明（关闭的能量门）、2 实心。 */
  readonly opacity: Uint8Array;
  readonly sky: Uint8Array;
  /**
   * 每格 RGB 三字节，存后墙辐照度 x 的 √(x/(1+x))：逐通道 Reinhard 可逆、保持色相、没有硬饱和，
   * 外层平方根让暗部不出色带；着色器按 e/(1-e) 解码回与点光同单位的辐照度。
   */
  readonly lamp: Uint8Array;
  /** 按构件顺序排列。 */
  readonly lamps: readonly ResidenceLamp[];
}

/** 1/4 格单位，右开区间。 */
export interface ResidenceLightRect { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }

interface LampBlock extends ResidenceLightRect {
  readonly lamp: ResidenceLamp;
  readonly falloff: Float32Array;
  readonly gain: readonly [number, number, number];
}

const CELL_SIZE = .25, SUB = 1 / CELL_SIZE;
const { minX: MIN_X, minY: MIN_Y, foundationTop: FOUNDATION_TOP } = RESIDENCE_WORLD;
const WIDTH = RESIDENCE_WORLD.width / CELL_SIZE;
const HEIGHT = (RESIDENCE_WORLD.height - MIN_Y) / CELL_SIZE;
/** 中心低于基础顶面的行。 */
const FOUNDATION_ROW = (FOUNDATION_TOP - MIN_Y) / CELL_SIZE;
const SOLID = 1, WALL = 2, DOOR = 4;
/**
 * 泰拉瑞亚式天空光：地表以上没有实心也没有背景墙的格子就是露天，按满亮度播种；有背景墙即室内，
 * 只能从露天格传播进来，所以窗（不带墙）、门洞和拆掉墙的地方成为光源，离开越远越暗。地表以下不播种。
 * 空气中每 1/4 格按比例衰减并以 SKY_MIN_STEP 兜住尾巴，约每格 ×.8，离窗约 5 格降到三成、12 格归零。
 */
const SKY_AIR_PASS = .9457, SKY_MIN_STEP = 2;
/** 低于 5/255 直接归零，对应泰拉瑞亚约 .0185 的截断：长尾不会把整片暗处抬成一层灰。 */
const SKY_MIN_LIGHT = 5;
const cut = (light: number): number => light < SKY_MIN_LIGHT ? 0 : light;
const skyAirStep = (light: number): number => cut(light - Math.max(SKY_MIN_STEP, Math.ceil(light * (1 - SKY_AIR_PASS))));
/**
 * 光离开一个实心 1/4 格时保留的比例（泰拉瑞亚式渗透），天空光与灯光共用。每格约 ×.27，
 * 1 格薄墙另一侧剩二三成、2 格以下不足一成，天空光 255 在约 3 格厚实心内截断为 0。
 */
export const SOLID_PASS = .72;
const skySolidStep = (light: number): number => cut(Math.floor(light * SOLID_PASS));
/**
 * 天空光单向最远传播的 1/4 格数；格子只受这个距离内的遮挡影响。空气与实心两种衰减在不同亮度下各有快慢，
 * 所以按两种步长任意组合的最长链计算。
 */
const SKY_REACH = (() => {
  const chain = new Uint8Array(256);
  for (let light = SKY_MIN_LIGHT; light < 256; light++) {
    chain[light] = 1 + Math.max(chain[skyAirStep(light)]!, chain[skySolidStep(light)]!);
  }
  return chain[255]!;
})();
/** 灯光穿出一个实心 1/4 格时路径代价额外加的 1/4 格数：让绕行通常优于穿墙，又不至于让薄墙完全不透。 */
const LAMP_SOLID_COST = 3;
/** 灯光最多穿出的实心 1/4 格数：第 12 个（3 格）透过率已低于 2%，3 格厚墙另一侧为 0。 */
const LAMP_SOLID_EXITS = 11;
const STRIP = 256;
/** 后墙正面在住宅坐标 z = 构件深度一半处；灯到后墙的距离就是光场等效受光深度。 */
const WALL_Z = DEFINITION_DEPTH.tile / 2;
/**
 * 光场等效受光深度的下限。贴墙灯的真实深度很小（壁灯 .36），平方反比峰值 intensity/h² 会冲到百级，
 * 但灯罩本身挡住了射向贴身墙面的直射，1/4 格采样也表现不出亚格热点，只会把峰值抹成一大片高亮；
 * 取 .6 让峰值落在与灯罩尺寸相当的范围内。高光点光仍用真实位置。
 */
const MIN_LAMP_DEPTH = .6;
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

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
}

const overlaps = (a: ResidenceLightRect, b: ResidenceLightRect): boolean =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const union = (a: ResidenceLightRect, b: ResidenceLightRect): ResidenceLightRect => ({
  x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });

/** 剖面是展示方式，背景墙标记室内：只有地表以上无墙无实心的格子和与之连通的空气能提供自然光。 */
function rasterize(state: ResidenceState, mask: Uint8Array): void {
  mask.fill(0);
  // 在 1/4 格中心采样轮廓，半砖、四分砖、半墙与斜墙都保持形状。
  const shape = (points: readonly DefinitionPoint[], x: number, y: number, value: number): void => {
    for (let dy = 0; dy < SUB; dy++) for (let dx = 0; dx < SUB; dx++) {
      if (inside(points, (dx + .5) / SUB, (dy + .5) / SUB)) mask[((y - MIN_Y) * SUB + dy) * WIDTH + (x - MIN_X) * SUB + dx]! |= value;
    }
  };
  const rect = (x: number, y: number, w: number, h: number, value: number): void => {
    const left = Math.max(0, Math.floor((x - MIN_X) / CELL_SIZE));
    const right = Math.min(WIDTH, Math.ceil((x + w - MIN_X) / CELL_SIZE));
    const bottom = Math.max(0, Math.floor((y - MIN_Y) / CELL_SIZE));
    const top = Math.min(HEIGHT, Math.ceil((y + h - MIN_Y) / CELL_SIZE));
    for (let cy = bottom; cy < top; cy++) mask.fill(value, cy * WIDTH + left, cy * WIDTH + right);
  };
  if (state.underground) {
    mask.fill(SOLID, 0, FOUNDATION_ROW * WIDTH);
    for (const index of state.underground) {
      rect(MIN_X + index % RESIDENCE_WORLD.width, MIN_Y + Math.floor(index / RESIDENCE_WORLD.width), 1, 1, 0);
    }
  }
  for (const placement of state.placements) {
    const resource = getResidenceResource(placement.resourceId);
    const { x, y } = placement;
    if (resource.kind === 'solid') shape(shapePoints.get(resource.shape)!, x, y, SOLID);
    else if (resource.kind === 'door') {
      const left = x + (resource.side === 'left' ? .5 : 0);
      rect(left, y + 3.5, .5, .5, SOLID);
      // 能量门只有半格厚，天空光与灯光穿过两个实心 1/4 格约剩一半；太阳遮挡按半透明计。
      if (!placement.open) rect(left, y, .5, 3.5, SOLID | DOOR);
    } else if (resource.kind === 'platform') {
      // 薄平台至少按一个实心 1/4 格遮光，不能因小于采样间隔而漏光。
      rect(x + (resource.platformWidth === 'right' ? .5 : 0), y + .3,
        resource.platformWidth === 'full' ? 1 : .5, .2, SOLID);
    }
  }
  // 墙只叠加标记位，最后写入，避免被上面整段覆盖的地下与门清掉。窗与墙同层互斥，窗格天然无墙。
  for (const placement of state.placements) {
    const resource = getResidenceResource(placement.resourceId);
    if (resource.kind === 'wall') shape(WALL_POLYGONS[resource.wallId]!, placement.x, placement.y, WALL);
  }
}

/**
 * 在窗口列 [x0, x1) 内从零计算天空光，只写回 [w0, w1)。写回列距窗口边缘至少 SKY_REACH，
 * 它能收到的光线路径都在窗口内，所以结果与全图计算逐格一致。返回实际变化的范围。
 */
function computeSky(mask: Uint8Array, sky: Uint8Array, x0: number, x1: number, w0: number, w1: number): ResidenceLightRect | null {
  const span = x1 - x0;
  const local = new Uint8Array(span * HEIGHT);
  const buckets: number[][] = Array.from({ length: 256 }, () => []);
  const seed = (cx: number, cy: number, light: number): void => {
    const index = cy * span + cx - x0;
    if (light > local[index]!) {
      local[index] = light;
      buckets[light]!.push(index);
    }
  };
  // 泰拉瑞亚规则：地表以上无实心、无背景墙即露天，屋顶下也一样；地表以下只靠传播。
  for (let cy = FOUNDATION_ROW; cy < HEIGHT; cy++) for (let cx = x0; cx < x1; cx++) {
    if (!(mask[cy * WIDTH + cx]! & (SOLID | WALL))) seed(cx, cy, 255);
  }
  // 按亮度降序传播，最亮路径先到达；离开空气按 skyAirStep，离开实心按 skySolidStep，
  // 实心表层接近邻格亮度、向内迅速变暗。两种步长都严格递减，降序处理即逐格取最亮路径。
  for (let light = 255; light > 0; light--) {
    for (const index of buckets[light]!) {
      if (local[index] !== light) continue;
      const cy = Math.floor(index / span), cx = index - cy * span + x0;
      const next = mask[cy * WIDTH + cx]! & SOLID ? skySolidStep(light) : skyAirStep(light);
      if (!next) continue;
      if (cx > x0) seed(cx - 1, cy, next);
      if (cx + 1 < x1) seed(cx + 1, cy, next);
      if (cy > 0) seed(cx, cy - 1, next);
      if (cy + 1 < HEIGHT) seed(cx, cy + 1, next);
    }
  }
  let changed: ResidenceLightRect | null = null;
  for (let cy = 0; cy < HEIGHT; cy++) for (let cx = w0; cx < w1; cx++) {
    const value = local[cy * span + cx - x0]!;
    if (sky[cy * WIDTH + cx] === value) continue;
    sky[cy * WIDTH + cx] = value;
    const cell = { x0: cx, y0: cy, x1: cx + 1, y1: cy + 1 };
    changed = changed ? union(changed, cell) : cell;
  }
  return changed;
}

/**
 * 灯光沿代价最小的路径传播（8 邻域，两个正交邻格任一实心则不能斜走，实心内部因此只走正交），
 * 可以绕过拐角；穿出实心 1/4 格既加路径代价、又乘 SOLID_PASS，薄墙另一侧透出微光，厚墙另一侧全黑。
 * 路径选择用代价，亮度用该路径的真实长度与穿出次数计算；每灯独立整块洪泛，增量与全量自然一致。
 * 衰减与 three 点光（decay 2）在后墙上的辐照度一致：路径长 d 与灯到后墙深度 h 合成 dEff，
 * 取 intensity / dEff² × (1-(dEff/r)⁴)² 再乘入射余弦 h/dEff，灯后墙上出现集中光斑，远处按平方反比变暗。
 */
function floodLamp(mask: Uint8Array, placement: ResidencePlacement, light: ResidenceLight): LampBlock {
  const position = { x: placement.x + light.offset.x, y: placement.y + light.offset.y, z: light.offset.z };
  const color = { r: srgbToLinear(light.color >> 16 & 255), g: srgbToLinear(light.color >> 8 & 255), b: srgbToLinear(light.color & 255) };
  const lamp: ResidenceLamp = { placement, position, color, radius: light.radius, intensity: light.intensity };
  const radius = light.radius / CELL_SIZE, reach = Math.ceil(radius);
  const sx = Math.floor((position.x - MIN_X) / CELL_SIZE), sy = Math.floor((position.y - MIN_Y) / CELL_SIZE);
  const x0 = Math.max(0, sx - reach), x1 = Math.min(WIDTH, sx + reach + 1);
  const y0 = Math.max(0, sy - reach), y1 = Math.min(HEIGHT, sy + reach + 1);
  const w = x1 - x0, h = y1 - y0;
  const falloff = new Float32Array(w * h);
  const block: LampBlock = { x0, y0, x1, y1, lamp, falloff, gain: [color.r, color.g, color.b] };
  // 世界外按实心处理；灯被埋进实心格时不发光。
  if (sx < 0 || sx >= WIDTH || sy < 0 || sy >= HEIGHT || mask[sy * WIDTH + sx]! & SOLID) return block;
  const solid = (x: number, y: number): boolean => (mask[(y + y0) * WIDTH + x + x0]! & SOLID) !== 0;
  const cost = new Float64Array(w * h).fill(Infinity), length = new Float64Array(w * h), exits = new Uint8Array(w * h);
  // 最小堆，懒删除；每格最多被 8 个邻格各推入一次。
  const heapDistance = new Float64Array(w * h * 8 + 1), heapIndex = new Int32Array(w * h * 8 + 1);
  let size = 0;
  const push = (d: number, index: number): void => {
    let k = size++;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (heapDistance[parent]! <= d) break;
      heapDistance[k] = heapDistance[parent]!;
      heapIndex[k] = heapIndex[parent]!;
      k = parent;
    }
    heapDistance[k] = d;
    heapIndex[k] = index;
  };
  const pop = (): number => {
    const top = heapIndex[0]!;
    const d = heapDistance[--size]!, index = heapIndex[size]!;
    let k = 0;
    for (;;) {
      let child = k * 2 + 1;
      if (child >= size) break;
      if (child + 1 < size && heapDistance[child + 1]! < heapDistance[child]!) child++;
      if (heapDistance[child]! >= d) break;
      heapDistance[k] = heapDistance[child]!;
      heapIndex[k] = heapIndex[child]!;
      k = child;
    }
    heapDistance[k] = d;
    heapIndex[k] = index;
    return top;
  };
  const start = (sy - y0) * w + sx - x0;
  cost[start] = 0;
  push(0, start);
  while (size > 0) {
    const index = pop();
    const cx = index % w, cy = (index - cx) / w;
    const leaving = solid(cx, cy);
    const exited = exits[index]! + (leaving ? 1 : 0);
    if (exited > LAMP_SOLID_EXITS) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (dx && dy && (solid(nx, cy) || solid(cx, ny))) continue;
      const step = dx && dy ? Math.SQRT2 : 1;
      const nextLength = length[index]! + step, nextCost = cost[index]! + step + (leaving ? LAMP_SOLID_COST : 0);
      const target = ny * w + nx;
      if (nextLength > radius || nextCost >= cost[target]!) continue;
      cost[target] = nextCost;
      length[target] = nextLength;
      exits[target] = exited;
      push(nextCost, target);
    }
  }
  const depth = Math.max(MIN_LAMP_DEPTH, WALL_Z - light.offset.z), r2 = light.radius ** 2;
  for (let i = 0; i < falloff.length; i++) {
    if (cost[i] === Infinity) continue;
    const d2 = (length[i]! * CELL_SIZE) ** 2 + depth * depth;
    // three 的距离窗口：半径处斜率为零，不出现亮度台阶。
    const edge = Math.max(0, 1 - (d2 / r2) ** 2);
    falloff[i] = light.intensity * depth / (d2 * Math.sqrt(d2)) * edge * edge * SOLID_PASS ** exits[i]!;
  }
  return block;
}

export function createResidenceLight(state: ResidenceState): ResidenceLightField & { sync(): ResidenceLightRect[] } {
  let mask = new Uint8Array(WIDTH * HEIGHT), next = new Uint8Array(WIDTH * HEIGHT);
  const opacity = new Uint8Array(WIDTH * HEIGHT);
  const opacityOf = (cell: number): number => cell & SOLID ? cell & DOOR ? 1 : 2 : 0;
  const sky = new Uint8Array(WIDTH * HEIGHT);
  const lamp = new Uint8Array(WIDTH * HEIGHT * 3);
  const lamps: ResidenceLamp[] = [];
  const columnMin = new Int32Array(WIDTH), columnMax = new Int32Array(WIDTH);
  let blocks = new Map<ResidencePlacement, LampBlock>();

  /** 按构件顺序重建灯列表；新增、移除和遮挡改动过的灯返回其范围。 */
  const refreshLamps = (changed: readonly ResidenceLightRect[]): ResidenceLightRect[] => {
    const dirty: ResidenceLightRect[] = [];
    const current = new Map<ResidencePlacement, LampBlock>();
    lamps.length = 0;
    for (const placement of state.placements) {
      const light = RESIDENCE_LIGHTS[placement.resourceId];
      if (!light) continue;
      let block = blocks.get(placement);
      if (!block || changed.some(rect => overlaps(rect, block!))) {
        block = floodLamp(mask, placement, light);
        dirty.push(block);
      }
      current.set(placement, block);
      lamps.push(block.lamp);
    }
    for (const [placement, block] of blocks) if (!current.has(placement)) dirty.push(block);
    blocks = current;
    return dirty;
  };

  // 固定按灯列表顺序累加，增量与全量对同一格的浮点求和顺序相同，结果逐位一致。
  const accumulate = (rect: ResidenceLightRect): void => {
    const w = rect.x1 - rect.x0;
    const sum = new Float32Array(w * (rect.y1 - rect.y0) * 3);
    for (const block of blocks.values()) {
      if (!overlaps(rect, block)) continue;
      const bw = block.x1 - block.x0;
      const [r, g, b] = block.gain;
      for (let cy = Math.max(rect.y0, block.y0); cy < Math.min(rect.y1, block.y1); cy++) {
        for (let cx = Math.max(rect.x0, block.x0); cx < Math.min(rect.x1, block.x1); cx++) {
          const f = block.falloff[(cy - block.y0) * bw + cx - block.x0]!;
          if (!f) continue;
          const index = ((cy - rect.y0) * w + cx - rect.x0) * 3;
          sum[index]! += f * r;
          sum[index + 1]! += f * g;
          sum[index + 2]! += f * b;
        }
      }
    }
    for (let cy = rect.y0; cy < rect.y1; cy++) for (let cx = rect.x0; cx < rect.x1; cx++) {
      const source = ((cy - rect.y0) * w + cx - rect.x0) * 3, target = (cy * WIDTH + cx) * 3;
      for (let k = 0; k < 3; k++) {
        const x = sum[source + k]!;
        lamp[target + k] = Math.round(Math.sqrt(x / (1 + x)) * 255);
      }
    }
  };

  rasterize(state, mask);
  for (let i = 0; i < mask.length; i++) opacity[i] = opacityOf(mask[i]!);
  computeSky(mask, sky, 0, WIDTH, 0, WIDTH);
  refreshLamps([]);
  for (let x = 0; x < WIDTH; x += STRIP) accumulate({ x0: x, y0: 0, x1: Math.min(WIDTH, x + STRIP), y1: HEIGHT });

  return {
    minX: MIN_X, minY: MIN_Y, width: WIDTH, height: HEIGHT, cellSize: CELL_SIZE, opacity, sky, lamp, lamps,
    /** 掩码全图重新光栅化后逐格比对，传播与累加只在变化附近进行；返回需要重新上传的矩形。 */
    sync(): ResidenceLightRect[] {
      rasterize(state, next);
      columnMin.fill(HEIGHT);
      columnMax.fill(-1);
      // 先按 4 字节整字比对跳过没有变化的大片区域，全图逐字节比较在 1/4 格分辨率下太慢。
      const nextWords = new Uint32Array(next.buffer), maskWords = new Uint32Array(mask.buffer);
      for (let w = 0; w < nextWords.length; w++) {
        if (nextWords[w] === maskWords[w]) continue;
        for (let i = w * 4; i < w * 4 + 4; i++) {
          if (next[i] === mask[i]) continue;
          const cx = i % WIDTH, cy = (i - cx) / WIDTH;
          columnMin[cx] = Math.min(columnMin[cx]!, cy);
          columnMax[cx] = Math.max(columnMax[cx]!, cy);
          opacity[i] = opacityOf(next[i]!);
        }
      }
      [mask, next] = [next, mask];
      // 只合并天空重算窗口互相重叠的脏段，相距很远的编辑各自计算。
      const segments: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
      for (let cx = 0; cx < WIDTH; cx++) {
        if (columnMax[cx]! < 0) continue;
        const last = segments.at(-1);
        if (last && cx - last.x1 < SKY_REACH * 4) {
          last.x1 = cx + 1;
          last.y0 = Math.min(last.y0, columnMin[cx]!);
          last.y1 = Math.max(last.y1, columnMax[cx]! + 1);
        } else segments.push({ x0: cx, y0: columnMin[cx]!, x1: cx + 1, y1: columnMax[cx]! + 1 });
      }
      const rects: ResidenceLightRect[] = segments.map(segment => {
        const skyChanged = computeSky(mask, sky, Math.max(0, segment.x0 - SKY_REACH * 2), Math.min(WIDTH, segment.x1 + SKY_REACH * 2),
          Math.max(0, segment.x0 - SKY_REACH), Math.min(WIDTH, segment.x1 + SKY_REACH));
        return skyChanged ? union(segment, skyChanged) : segment;
      });
      rects.push(...refreshLamps(segments));
      const merged: ResidenceLightRect[] = [];
      for (let rect of rects) {
        for (let i = merged.findIndex(item => overlaps(item, rect)); i !== -1; i = merged.findIndex(item => overlaps(item, rect))) {
          rect = union(rect, merged.splice(i, 1)[0]!);
        }
        merged.push(rect);
      }
      for (const rect of merged) accumulate(rect);
      return merged.map(({ x0, y0, x1, y1 }) => ({ x0, y0, x1, y1 }));
    },
  };
}
