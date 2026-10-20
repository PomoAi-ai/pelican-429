/**
 * 1/4 格光场（泰拉瑞亚式，纯逻辑、确定性）：每个 1/4 子格一字节天空光（含静态发光）与三字节 RGB 灯光。
 * 介质由光源适配器光栅化（格子掩码、背景墙、平台、水、树冠、浮空岛穿透；城区暂由住宅构件桥接），
 * 按 LIGHT_STRIP 子格宽的竖条带存储，只计算镜头附近的条带（view），世界再大也只占可见范围的内存。
 * - 天空光：连续条带连同两侧 reach 子格的窗口从头计算。亮度非 0 的路径不超过 reach 步，窗口外的种子与路径
 *   影响不到写回的条带，所以结果与全图计算逐格一致；按亮度分桶自亮到暗处理即逐格取最亮路径。
 * - 灯光：每盏灯在自身半径内独立洪泛，按灯列表顺序累加，增量与全量逐位一致。
 * - 分摊：条带、天空光与灯光的重算都是可暂停的工作，sync 可按预算分到多帧，镜头附近先算；每项工作只读一份介质光栅、
 *   完成时才写回，期间的改动排成之后的工作，全部完成后与一次算完逐位一致。
 */
import { DEFINITION_DEPTH } from '../config/definition-kit.ts';
import { CHUNK_SIZE } from './tile-map.ts';
import { SUBCELLS } from './tile-shapes.ts';

export const LIGHT_CELL = 1 / SUBCELLS;
/** 条带宽（子格），与格子区块同宽，镜头按区块流式时条带边界与区块对齐。 */
export const LIGHT_STRIP = CHUNK_SIZE * SUBCELLS;
export const LIGHT_FULL = 255;

/** 子格介质位。门是实心的一种，灯光照常按实心衰减，渲染端按半透明遮挡太阳。 */
export const MEDIUM_SOLID = 1;
export const MEDIUM_WALL = 2;
export const MEDIUM_DOOR = 4;
export const MEDIUM_PLATFORM = 8;
export const MEDIUM_WATER = 16;
export const MEDIUM_FOLIAGE = 32;
/** 浮空岛所在列：天空光穿过岛体降为 passShade，岛体按 pass 表衰减。 */
export const MEDIUM_PASS = 64;
const BLOCKS_SKY = MEDIUM_SOLID | MEDIUM_PLATFORM | MEDIUM_WATER | MEDIUM_FOLIAGE;

export interface LightRules {
  /** 光离开该介质一个子格后的亮度（下标为离开前亮度，值严格小于下标）。 */
  readonly air: Uint8Array;
  readonly solid: Uint8Array;
  readonly water: Uint8Array;
  readonly foliage: Uint8Array;
  readonly platform: Uint8Array;
  /** 浮空岛实心（MEDIUM_PASS 且 MEDIUM_SOLID）。 */
  readonly pass: Uint8Array;
  /**
   * column：每子列自顶向下照到首个遮挡子格为止（浮空岛列降为 passShade 后继续），地下只靠传播。
   * open：floorRow（子格行）及以上没有实心、没有背景墙的空气子格都是露天，屋顶下也一样，墙标记室内。
   */
  readonly sky: { readonly kind: 'column'; readonly passShade: number } | { readonly kind: 'open'; readonly floorRow: number };
}

/** 由单步衰减函数建表；结果必须是 [0, v) 内的整数，保证分桶传播单调收敛。 */
export function stepTable(step: (light: number) => number): Uint8Array {
  const table = new Uint8Array(LIGHT_FULL + 1);
  for (let v = 1; v <= LIGHT_FULL; v++) {
    const next = step(v);
    if (!(Number.isInteger(next) && next >= 0 && next < v)) throw new Error(`light-field: step(${v}) = ${next} must be an integer in [0,${v})`);
    table[v] = next;
  }
  return table;
}

/** 游戏世界规则：调参给的是每格衰减，子格取四次方根，四个子格合起来与每格一致。 */
export function worldLightRules(decay: { readonly airDecay: number; readonly solidDecay: number; readonly waterDecay: number; readonly foliageDecay: number; readonly platformDecay: number },
  island: { readonly shade: number; readonly decay: number }): LightRules {
  const per = (d: number): Uint8Array => {
    if (!(d > 0 && d < 1)) throw new Error(`light-field: decay must be in (0,1), got ${d}`);
    const k = d ** LIGHT_CELL;
    return stepTable((v) => Math.floor(v * k));
  };
  if (!(Number.isInteger(island.shade) && island.shade >= 0 && island.shade <= LIGHT_FULL)) throw new Error(`light-field: island shade must be an integer in [0,${LIGHT_FULL}], got ${island.shade}`);
  return {
    air: per(decay.airDecay), solid: per(decay.solidDecay), water: per(decay.waterDecay),
    foliage: per(decay.foliageDecay), platform: per(decay.platformDecay), pass: per(island.decay),
    sky: { kind: 'column', passShade: island.shade },
  };
}

/** 亮度非 0 的最长传播步数：各介质步进任意组合的最长链。 */
export function lightReach(rules: LightRules): number {
  const tables = [rules.air, rules.solid, rules.water, rules.foliage, rules.platform, rules.pass];
  const chain = new Uint16Array(LIGHT_FULL + 1);
  for (let v = 1; v <= LIGHT_FULL; v++) {
    let longest = 0;
    for (const t of tables) longest = Math.max(longest, chain[t[v]!]!);
    chain[v] = 1 + longest;
  }
  return chain[LIGHT_FULL]!;
}

/** sRGB 字节（0..255）→ 线性。 */
export function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
}

/** 灯源（世界坐标）；key 标识同一盏灯，渲染端据此复用高光槽。 */
export interface LightLamp {
  readonly key: unknown;
  readonly x: number;
  readonly y: number;
  /** 灯离格子平面（后墙前方）的深度偏移。 */
  readonly z: number;
  /** 线性空间颜色。 */
  readonly color: { readonly r: number; readonly g: number; readonly b: number };
  readonly radius: number;
  readonly intensity: number;
}

/** 静态发光格（场内逻辑格坐标）：该格 16 个子格亮度至少为 level，照常向四周衰减。 */
export interface LightEmitter {
  readonly tx: number;
  readonly ty: number;
  readonly level: number;
}

/** 光源适配器：场覆盖逻辑格 [0,width)×[0,height)，左下角在世界 (minX, minY)。 */
export interface LightFieldSource {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
  /** 把场内子格矩形 [x0,x1)×[y0,y1) 的介质写入 out（行主序，行宽 x1−x0，先清零）。 */
  rasterize(x0: number, y0: number, x1: number, y1: number, out: Uint8Array): void;
  /** 当前全部灯源，顺序即累加顺序。 */
  lamps(): readonly LightLamp[];
  readonly emitters: readonly LightEmitter[];
}

/** 子格矩形，右开区间。 */
export interface LightRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** 一个已计算条带：子格 [x0, x0+width) 全高，行主序（行宽 width）。 */
interface LightStrip {
  readonly x0: number;
  readonly width: number;
  readonly sky: Uint8Array;
  readonly medium: Uint8Array;
  /**
   * 每子格 RGB 三字节，存后墙辐照度 x 的 √(x/(1+x))：逐通道 Reinhard 可逆、保持色相、没有硬饱和，
   * 外层平方根让暗部不出色带；着色器按 e/(1-e) 解码回与点光同单位的辐照度。
   */
  readonly lamp: Uint8Array;
}

/** 分摊预算：sync 按它把重算分到多帧。 */
interface LightBudget {
  /** 镜头中心（子格 x）：待算工作按离它的距离先后处理。 */
  readonly focus: number;
  /** 本次必须算完的条带 [s0, s1)（镜头可见范围），不受预算限制。 */
  readonly required: readonly [number, number];
  /** 每完成一小块工作询问一次；返回 true 即停下，剩余工作留到下次 sync。 */
  readonly yieldNow: () => boolean;
}

export interface LightField {
  readonly minX: number;
  readonly minY: number;
  /** 子格数。 */
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly strips: number;
  readonly reach: number;
  /** 按灯列表顺序。 */
  readonly lamps: readonly LightLamp[];
  /** 驻留条带 [s0,s1)（夹到范围内）：释放此范围两侧 keep 条以外的条带，范围内未计算的条带由 sync 计算。 */
  view(s0: number, s1: number, keep: number): void;
  isLoaded(strip: number): boolean;
  /** 世界 x 所在条带已计算（越界按边缘条带）。 */
  covers(x: number): boolean;
  /** 已计算的条带；未计算即抛。 */
  strip(index: number): LightStrip;
  /** 场内逻辑格矩形 [x0,x1)×[y0,y1) 的介质可能变了，下次 sync 比对并重算。 */
  invalidate(x0: number, y0: number, x1: number, y1: number): void;
  /**
   * 计算驻留范围内未算的条带，处理失效区与灯源变化；返回需要重新上传的子格矩形（只含已计算的条带）。
   * 不给预算即一次算完；给预算时未完成的工作留到下次调用，全部完成后与一次算完逐位一致。
   */
  sync(budget?: LightBudget): LightRect[];
  /** 还有待算的工作（条带、天空光或灯光）。 */
  readonly pending: boolean;
  /** 世界点的天空光 [0,1]（子格中心双线性，越界夹取）；所在条带未计算即抛。 */
  sample(x: number, y: number): number;
}

const overlaps = (a: LightRect, b: LightRect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const union = (a: LightRect, b: LightRect): LightRect => ({
  x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });

/** 灯光穿出一个实心子格时保留的比例：1 格薄墙另一侧剩二三成、2 格以下不足一成。 */
const LAMP_SOLID_PASS = .72;
/** 穿出实心子格时路径代价额外加的子格数：让绕行通常优于穿墙，又不至于让薄墙完全不透。 */
const LAMP_SOLID_COST = 3;
/** 灯光最多穿出的实心子格数：第 12 个（3 格）透过率已低于 2%，3 格厚墙另一侧为 0。 */
const LAMP_SOLID_EXITS = 11;
/** 后墙正面在构件深度一半处；灯到后墙的距离就是光场等效受光深度。 */
const WALL_Z = DEFINITION_DEPTH.tile / 2;
/**
 * 光场等效受光深度的下限。贴墙灯的真实深度很小，平方反比峰值会冲到百级，但灯罩挡住了射向贴身墙面的直射，
 * 子格采样也表现不出亚格热点，只会把峰值抹成一大片高亮；取 .6 让峰值落在与灯罩尺寸相当的范围内。
 */
const MIN_LAMP_DEPTH = .6;
/** 分摊时两次询问预算之间的工作量（子格）：约几十微秒，询问本身的开销可以忽略。 */
const CHECK_CELLS = 4096;
/** 光栅化按行带分块，每带之后询问一次预算。 */
const RASTER_BAND = 16;

interface LampBlock extends LightRect {
  readonly lamp: LightLamp;
  readonly falloff: Float32Array;
}

/** 分摊的工作：生成器每到检查点询问预算，完成时返回要上传的矩形。 */
type Work = Generator<void, LightRect[], void>;
interface Job {
  readonly run: Work;
  /** 正在计算、尚未登记的条带（期间落在其上的失效区等它登记后再比对）。 */
  readonly strips: ReadonlySet<number>;
}

const never = (): boolean => false;

export function createLightField(source: LightFieldSource, rules: LightRules): LightField {
  const width = source.width * SUBCELLS;
  const height = source.height * SUBCELLS;
  const stripCount = Math.ceil(width / LIGHT_STRIP);
  const reach = lightReach(rules);
  const { minX, minY } = source;
  for (const e of source.emitters) {
    if (!(Number.isInteger(e.tx) && Number.isInteger(e.ty) && e.tx >= 0 && e.ty >= 0 && e.tx < source.width && e.ty < source.height)) throw new Error(`light-field: emitter out of bounds (${e.tx},${e.ty})`);
    if (!(Number.isInteger(e.level) && e.level >= 1 && e.level <= LIGHT_FULL)) throw new Error(`light-field: emitter (${e.tx},${e.ty}) level must be an integer in [1,${LIGHT_FULL}], got ${e.level}`);
  }
  const strips = new Map<number, LightStrip>();
  let blocks: LampBlock[] = [];
  const lamps: LightLamp[] = [];
  let dirty: LightRect[] = [];
  // 驻留范围与待算工作：未算条带、天空光（条带 → 最低重算行）、灯光（待比对的介质变化矩形；null = 无）。
  let windowA = 0, windowB = 0, keepStrips = 0;
  const pendingStrips = new Set<number>();
  const pendingSky = new Map<number, number>();
  let pendingLamps: LightRect[] | null = null;
  let current: Job | null = null;
  /** 当前工作计算中条带上的失效区，登记后放回 dirty。 */
  let deferred: LightRect[] = [];
  let yieldNow: () => boolean = never;
  // 分桶队列（每个亮度一条单链表 head/next）的节点池；同时进行的计算各取一份，节点按需翻倍。
  const queuePool: Array<{ cell: Int32Array; next: Int32Array }> = [];

  const stripX0 = (s: number): number => s * LIGHT_STRIP;
  const stripWidth = (s: number): number => Math.min(LIGHT_STRIP, width - s * LIGHT_STRIP);
  const newStrip = (s: number): LightStrip => {
    const w = stripWidth(s);
    return { x0: stripX0(s), width: w, sky: new Uint8Array(w * height), medium: new Uint8Array(w * height), lamp: new Uint8Array(w * height * 3) };
  };
  // 同一子格多种介质时按实心、平台、水、树冠的优先级取衰减。
  const stepOf = (m: number): Uint8Array => m & MEDIUM_SOLID ? (m & MEDIUM_PASS ? rules.pass : rules.solid)
    : m & MEDIUM_PLATFORM ? rules.platform : m & MEDIUM_WATER ? rules.water : m & MEDIUM_FOLIAGE ? rules.foliage : rules.air;
  const stepByMedium = Array.from({ length: MEDIUM_PASS * 2 }, (_, m) => stepOf(m));

  /** 按行带光栅化子格矩形 [x0,x1)×[y0,y1) 到 out（行宽 x1−x0），每带之后是一个检查点。 */
  function* rasterizeBands(x0: number, y0: number, x1: number, y1: number, out: Uint8Array): Generator<void, void, void> {
    const span = x1 - x0;
    for (let ya = y0; ya < y1; ya += RASTER_BAND) {
      const yb = Math.min(y1, ya + RASTER_BAND);
      source.rasterize(x0, ya, x1, yb, out.subarray((ya - y0) * span, (yb - y0) * span));
      if (yieldNow()) yield;
    }
  }

  /** 子格列 [w0,w1)、行 yWrite 以上天空光的计算窗口：向两侧和下方各多取 reach，窗口外的光源传不进写回范围。 */
  const skyWindow = (w0: number, w1: number, yWrite: number) => ({ x0: Math.max(0, w0 - reach), x1: Math.min(width, w1 + reach), y0: Math.max(0, yWrite - reach) });

  /** 光栅化天空光计算窗口的介质（行宽为窗口宽，窗口下沿以下留零）。 */
  function* readSkyMedium(w0: number, w1: number, yWrite: number): Generator<void, Uint8Array, void> {
    const { x0, x1, y0 } = skyWindow(w0, w1, yWrite);
    const medium = new Uint8Array((x1 - x0) * height);
    yield* rasterizeBands(x0, y0, x1, height, medium.subarray(y0 * (x1 - x0)));
    return medium;
  }

  /**
   * 按 readSkyMedium 读到的同一窗口介质重新计算子格列 [w0,w1)、行 yWrite 以上的天空光，写进 targets 里的条带；返回实际变化的矩形。
   * 读取之后的改动由之后的工作重算。
   */
  function* computeSky(w0: number, w1: number, yWrite: number, medium: Uint8Array, targets: ReadonlyMap<number, LightStrip>): Generator<void, LightRect | null, void> {
    const { x0, x1, y0 } = skyWindow(w0, w1, yWrite), span = x1 - x0;
    // 最高的非空气子格行之上全是露天空气，天空光恒为满值：只从那一行往下传播，上面直接写满（地表以上的大片天空占多数）。
    let top = 0;
    for (let i = medium.length - 1; i >= 0; i--) if (medium[i]) { top = Math.floor(i / span) + 1; break; }
    if (rules.sky.kind === 'open') top = Math.max(top, rules.sky.floorRow);
    const queued = Math.min(height, top + 1) * span;
    const local = new Uint8Array(span * height);
    const head = new Int32Array(LIGHT_FULL + 1).fill(-1);
    const queue = queuePool.pop() ?? { cell: new Int32Array(1 << 16), next: new Int32Array(1 << 16) };
    let nodes = 0;
    const push = (i: number, light: number): void => {
      if (nodes === queue.cell.length) {
        const cell = new Int32Array(nodes * 2), next = new Int32Array(nodes * 2);
        cell.set(queue.cell);
        next.set(queue.next);
        queue.cell = cell;
        queue.next = next;
      }
      queue.cell[nodes] = i;
      queue.next[nodes] = head[light]!;
      head[light] = nodes++;
    };
    const seed = (i: number, light: number): void => {
      if (light <= local[i]!) return;
      local[i] = light;
      if (i < queued) push(i, light);
    };
    const fill = (i: number, light: number): void => {
      if (light > local[i]!) local[i] = light;
    };
    const rowsPerCheck = Math.max(1, Math.floor(CHECK_CELLS / span));
    if (rules.sky.kind === 'column') {
      const shade = rules.sky.passShade;
      const columnsPerCheck = Math.max(1, Math.floor(CHECK_CELLS / Math.max(1, height - y0)));
      for (let x = 0; x < span; x++) {
        let sky = LIGHT_FULL;
        for (let y = height - 1; y >= y0; y--) {
          const m = medium[y * span + x]!;
          if (m & BLOCKS_SKY) {
            if (!(m & MEDIUM_PASS)) break;
            sky = Math.min(sky, shade);
            continue;
          }
          // 背景墙下不是露天，但墙不挡住下方：墙后的空气照样接天空光。
          if (!(m & MEDIUM_WALL) && sky > 0) fill(y * span + x, sky);
        }
        if ((x + 1) % columnsPerCheck === 0 && yieldNow()) yield;
      }
    } else {
      for (let y = Math.max(y0, rules.sky.floorRow); y < height; y++) {
        for (let x = 0; x < span; x++) if (!(medium[y * span + x]! & (MEDIUM_SOLID | MEDIUM_WALL))) fill(y * span + x, LIGHT_FULL);
        if ((y + 1) % rowsPerCheck === 0 && yieldNow()) yield;
      }
    }
    for (const e of source.emitters) {
      for (let sy = e.ty * SUBCELLS; sy < (e.ty + 1) * SUBCELLS; sy++) for (let sx = e.tx * SUBCELLS; sx < (e.tx + 1) * SUBCELLS; sx++) {
        if (sx >= x0 && sx < x1 && sy >= y0) fill(sy * span + sx - x0, e.level);
      }
    }
    // 光源先全部落位，只有能照亮某个邻格的才入队：成片露天空气彼此都是满值，不必逐格出队。
    for (let i = y0 * span, checked = i; i < queued; i++) {
      if (i - checked >= CHECK_CELLS) {
        checked = i;
        if (yieldNow()) yield;
      }
      const light = local[i]!;
      if (light === 0) continue;
      const next = stepByMedium[medium[i]!]![light]!;
      if (next === 0) continue;
      const x = i % span;
      if ((x > 0 && local[i - 1]! < next) || (x + 1 < span && local[i + 1]! < next)
        || (i - span >= y0 * span && local[i - span]! < next) || (i + span < local.length && local[i + span]! < next)) push(i, light);
    }
    // 传播只往更低的桶里放，当前桶的链表在遍历中不会再变长。
    let work = 0;
    for (let light = LIGHT_FULL; light > 0; light--) {
      for (let n = head[light]!; n !== -1; n = queue.next[n]!) {
        if (++work === CHECK_CELLS) {
          work = 0;
          if (yieldNow()) yield;
        }
        const i = queue.cell[n]!;
        if (local[i] !== light) continue;
        const next = stepByMedium[medium[i]!]![light]!;
        if (next === 0) continue;
        const x = i % span, y = (i - x) / span;
        if (x > 0) seed(i - 1, next);
        if (x + 1 < span) seed(i + 1, next);
        if (y > y0) seed(i - span, next);
        if (y + 1 < height) seed(i + span, next);
      }
    }
    queuePool.push(queue);
    let cx0 = width, cy0 = height, cx1 = -1, cy1 = -1;
    for (let s = Math.floor(w0 / LIGHT_STRIP); s * LIGHT_STRIP < w1; s++) {
      const strip = targets.get(s);
      if (!strip) continue;
      const rowsPerStripCheck = Math.max(1, Math.floor(CHECK_CELLS / strip.width));
      for (let y = yWrite; y < height; y++) {
        for (let x = Math.max(w0, strip.x0); x < Math.min(w1, strip.x0 + strip.width); x++) {
          const value = local[y * span + x - x0]!;
          const target = y * strip.width + x - strip.x0;
          if (strip.sky[target] === value) continue;
          strip.sky[target] = value;
          cx0 = Math.min(cx0, x); cx1 = Math.max(cx1, x); cy0 = Math.min(cy0, y); cy1 = Math.max(cy1, y);
        }
        if ((y + 1) % rowsPerStripCheck === 0 && yieldNow()) yield;
      }
    }
    return cx1 < 0 ? null : { x0: cx0, y0: cy0, x1: cx1 + 1, y1: cy1 + 1 };
  }

  /**
   * 介质变化后天空光可能变化的最低子格行。逐列从上往下接天空光（column）时，改动会改变它下方直到第一个挡光子格之间的光源；
   * 再往下 reach 行内的亮度都可能随之变化。open 模式的光源不依赖上方，只看改动本身。未计算条带里的改动没有介质可查，按到底处理。
   */
  const skyWriteFrom = (rect: LightRect): number => {
    if (rules.sky.kind === 'open') return Math.max(0, rect.y0 - reach);
    let lowest = rect.y0;
    for (let x = rect.x0; x < rect.x1; x++) {
      const strip = strips.get(Math.floor(x / LIGHT_STRIP));
      if (!strip) return 0;
      let y = rect.y0 - 1;
      for (; y >= 0; y--) {
        const m = strip.medium[y * strip.width + x - strip.x0]!;
        if (m & BLOCKS_SKY && !(m & MEDIUM_PASS)) break;
      }
      lowest = Math.min(lowest, Math.max(0, y));
    }
    return Math.max(0, lowest - reach);
  };

  /**
   * 灯光沿代价最小的路径传播（8 邻域，两个正交邻格任一实心则不能斜走），可以绕过拐角；穿出实心子格既加路径代价、
   * 又乘 LAMP_SOLID_PASS，薄墙另一侧透出微光，厚墙另一侧全黑。衰减与 three 点光（decay 2）在后墙上的辐照度一致：
   * 路径长 d 与灯到后墙深度 h 合成 dEff，取 intensity / dEff² × (1-(dEff/r)⁴)² 再乘入射余弦 h/dEff。
   */
  const floodLamp = (lamp: LightLamp): LampBlock => {
    const radius = lamp.radius / LIGHT_CELL, r = Math.ceil(radius);
    const sx = Math.floor((lamp.x - minX) / LIGHT_CELL), sy = Math.floor((lamp.y - minY) / LIGHT_CELL);
    const x0 = Math.max(0, sx - r), x1 = Math.min(width, sx + r + 1);
    const y0 = Math.max(0, sy - r), y1 = Math.min(height, sy + r + 1);
    const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0);
    const falloff = new Float32Array(w * h);
    const block: LampBlock = { x0, y0, x1, y1, lamp, falloff };
    if (sx < 0 || sx >= width || sy < 0 || sy >= height) return block;
    const medium = new Uint8Array(w * h);
    source.rasterize(x0, y0, x1, y1, medium);
    // 灯被埋进实心时不发光。
    if (medium[(sy - y0) * w + sx - x0]! & MEDIUM_SOLID) return block;
    const solid = (x: number, y: number): boolean => (medium[y * w + x]! & MEDIUM_SOLID) !== 0;
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
    const depth = Math.max(MIN_LAMP_DEPTH, WALL_Z - lamp.z), r2 = lamp.radius ** 2;
    for (let i = 0; i < falloff.length; i++) {
      if (cost[i] === Infinity) continue;
      const d2 = (length[i]! * LIGHT_CELL) ** 2 + depth * depth;
      // three 的距离窗口：半径处斜率为零，不出现亮度台阶。
      const edge = Math.max(0, 1 - (d2 / r2) ** 2);
      falloff[i] = lamp.intensity * depth / (d2 * Math.sqrt(d2)) * edge * edge * LAMP_SOLID_PASS ** exits[i]!;
    }
    return block;
  };

  const sameLamp = (a: LightLamp, b: LightLamp): boolean => a.key === b.key && a.x === b.x && a.y === b.y && a.z === b.z
    && a.radius === b.radius && a.intensity === b.intensity && a.color.r === b.color.r && a.color.g === b.color.g && a.color.b === b.color.b;

  /** 按灯源顺序重建灯块（每盏重算的灯之后是一个检查点）；新增、移除、参数变化和遮挡改动过的灯返回其范围。 */
  function* refreshLamps(changed: readonly LightRect[]): Generator<void, LightRect[], void> {
    const out: LightRect[] = [];
    const previous = new Map(blocks.map((b) => [b.lamp.key, b]));
    const next: LampBlock[] = [];
    const list = source.lamps();
    for (const lamp of list) {
      const old = previous.get(lamp.key);
      previous.delete(lamp.key);
      let block = old;
      if (!block || !sameLamp(block.lamp, lamp) || changed.some((rect) => overlaps(rect, block!))) {
        block = floodLamp(lamp);
        out.push(block);
        if (old) out.push(old);
        if (yieldNow()) yield;
      }
      next.push(block);
    }
    for (const old of previous.values()) out.push(old);
    blocks = next;
    lamps.length = 0;
    lamps.push(...list);
    return out;
  }

  // 固定按灯列表顺序累加，增量与全量对同一子格的浮点求和顺序相同，结果逐位一致。
  function* accumulate(rect: LightRect, target: (s: number) => LightStrip | undefined): Generator<void, void, void> {
    for (let s = Math.max(0, Math.floor(rect.x0 / LIGHT_STRIP)); s * LIGHT_STRIP < rect.x1 && s < stripCount; s++) {
      const strip = target(s);
      if (!strip) continue;
      const ax0 = Math.max(rect.x0, strip.x0), ax1 = Math.min(rect.x1, strip.x0 + strip.width);
      const ay0 = Math.max(0, rect.y0), ay1 = Math.min(height, rect.y1);
      const w = ax1 - ax0;
      if (w <= 0 || ay1 <= ay0) continue;
      const sum = new Float32Array(w * (ay1 - ay0) * 3);
      for (const block of blocks) {
        const bw = block.x1 - block.x0;
        const { r, g, b } = block.lamp.color;
        let any = false;
        for (let y = Math.max(ay0, block.y0); y < Math.min(ay1, block.y1); y++) {
          for (let x = Math.max(ax0, block.x0); x < Math.min(ax1, block.x1); x++) {
            any = true;
            const f = block.falloff[(y - block.y0) * bw + x - block.x0]!;
            if (!f) continue;
            const index = ((y - ay0) * w + x - ax0) * 3;
            sum[index]! += f * r;
            sum[index + 1]! += f * g;
            sum[index + 2]! += f * b;
          }
        }
        if (any && yieldNow()) yield;
      }
      for (let y = ay0; y < ay1; y++) for (let x = ax0; x < ax1; x++) {
        const from = ((y - ay0) * w + x - ax0) * 3, to = (y * strip.width + x - strip.x0) * 3;
        for (let k = 0; k < 3; k++) {
          const v = sum[from + k]!;
          strip.lamp[to + k] = Math.round(Math.sqrt(v / (1 + v)) * 255);
        }
      }
    }
  }

  /** 只回报与已计算条带相交的部分（灯块可能整块落在未计算的条带上）。 */
  const loadedPart = (rect: LightRect): LightRect | null => {
    let x0 = Infinity, x1 = -Infinity;
    for (let s = Math.max(0, Math.floor(rect.x0 / LIGHT_STRIP)); s * LIGHT_STRIP < rect.x1 && s < stripCount; s++) {
      if (!strips.has(s)) continue;
      x0 = Math.min(x0, Math.max(rect.x0, stripX0(s)));
      x1 = Math.max(x1, Math.min(rect.x1, stripX0(s) + stripWidth(s)));
    }
    return x1 > x0 ? { x0, y0: rect.y0, x1, y1: rect.y1 } : null;
  };

  const wanted = (s: number): boolean => s >= windowA - keepStrips && s < windowB + keepStrips;

  /** 计算条带 [r0,r1)：介质、天空光与灯光都算完才登记，期间光场照常使用其余条带。 */
  function* stripsWork(r0: number, r1: number): Work {
    const rect = { x0: stripX0(r0), y0: 0, x1: Math.min(width, stripX0(r1)), y1: height };
    // 条带介质取自天空光读的同一份光栅：期间本条带的改动登记后与它比对，即与天空光实际所用的介质比对。
    const medium = yield* readSkyMedium(rect.x0, rect.x1, 0);
    const { x0, x1 } = skyWindow(rect.x0, rect.x1, 0), span = x1 - x0;
    const fresh = new Map<number, LightStrip>();
    for (let s = r0; s < r1; s++) {
      const strip = newStrip(s);
      for (let y = 0; y < height; y++) strip.medium.set(medium.subarray(y * span + strip.x0 - x0, y * span + strip.x0 - x0 + strip.width), y * strip.width);
      fresh.set(s, strip);
    }
    yield* computeSky(rect.x0, rect.x1, 0, medium, fresh);
    yield* accumulate(rect, (s) => fresh.get(s));
    for (const [s, strip] of fresh) if (wanted(s)) strips.set(s, strip);
    return [rect];
  }

  /** 天空光重算：只写开始时已计算的条带；之后才算出的条带用的是更新的介质。 */
  function* skyWork(r0: number, r1: number, from: number): Work {
    const targets = new Map<number, LightStrip>();
    for (let s = r0; s < r1; s++) {
      const strip = strips.get(s);
      if (strip) targets.set(s, strip);
    }
    const w0 = stripX0(r0), w1 = Math.min(width, stripX0(r1));
    const rect = yield* computeSky(w0, w1, from, yield* readSkyMedium(w0, w1, from), targets);
    return rect ? [rect] : [];
  }

  function* lampWork(changed: readonly LightRect[]): Work {
    const touched = yield* refreshLamps(changed);
    const merged: LightRect[] = [];
    for (const block of touched) {
      if (block.x1 <= block.x0 || block.y1 <= block.y0) continue;
      let rect: LightRect = { x0: block.x0, y0: block.y0, x1: block.x1, y1: block.y1 };
      for (let i = merged.findIndex((item) => overlaps(item, rect)); i !== -1; i = merged.findIndex((item) => overlaps(item, rect))) {
        rect = union(rect, merged.splice(i, 1)[0]!);
      }
      merged.push(rect);
    }
    const out: LightRect[] = [];
    for (const rect of merged) {
      yield* accumulate(rect, (s) => strips.get(s));
      const part = loadedPart(rect);
      if (part) out.push(part);
    }
    return out;
  }

  /** 介质变化：已计算条带逐子格比对，只有真正变了的才算；未计算的部分无从比对，按变化处理。 */
  const detect = (): LightRect[] => {
    const pending = dirty;
    dirty = [];
    const changed: LightRect[] = [];
    const out: LightRect[] = [];
    for (const rect of pending) {
      for (let s = Math.floor(rect.x0 / LIGHT_STRIP); s * LIGHT_STRIP < rect.x1; s++) {
        const ax0 = Math.max(rect.x0, stripX0(s)), ax1 = Math.min(rect.x1, stripX0(s) + stripWidth(s));
        const part = { x0: ax0, y0: rect.y0, x1: ax1, y1: rect.y1 };
        if (current?.strips.has(s)) {
          deferred.push(part);
          continue;
        }
        const strip = strips.get(s);
        if (!strip) {
          changed.push(part);
          continue;
        }
        const w = ax1 - ax0;
        const fresh = new Uint8Array(w * (rect.y1 - rect.y0));
        source.rasterize(ax0, rect.y0, ax1, rect.y1, fresh);
        let hit: LightRect | null = null;
        for (let y = rect.y0; y < rect.y1; y++) for (let x = ax0; x < ax1; x++) {
          const value = fresh[(y - rect.y0) * w + x - ax0]!;
          const target = y * strip.width + x - strip.x0;
          if (strip.medium[target] === value) continue;
          strip.medium[target] = value;
          const cell = { x0: x, y0: y, x1: x + 1, y1: y + 1 };
          hit = hit ? union(hit, cell) : cell;
        }
        if (hit) {
          changed.push(hit);
          out.push(hit);
        }
      }
    }
    // 天空光：变化列两侧 reach 内的已计算条带重算，每条只从可能变化的最低行往上算。正在算的条带也要排上：
    // 它的天空光可能已读过这里的旧介质，登记后不会再比对邻条带（未登记就被释放的条带由 nextJob 剔除）。
    for (const rect of changed) {
      const from = skyWriteFrom(rect);
      for (let s = Math.max(0, Math.floor((rect.x0 - reach) / LIGHT_STRIP)); s * LIGHT_STRIP < rect.x1 + reach && s < stripCount; s++) {
        if (strips.has(s) || current?.strips.has(s)) pendingSky.set(s, Math.min(pendingSky.get(s) ?? height, from));
      }
    }
    // 灯源增删不改介质，任何失效都要重新比对灯列表。
    if (pending.length > 0) (pendingLamps ??= []).push(...changed);
    return out;
  };

  /** 子格列范围到镜头中心的距离。 */
  const distance = (x0: number, x1: number, focus: number): number => focus < x0 ? x0 - focus : focus >= x1 ? focus - x1 + 1 : 0;

  /** 取离镜头最近的待算工作：单个条带、相邻待重算条带连成的一段天空光，或全部灯光变化。 */
  const nextJob = (focus: number): Job | null => {
    for (const s of pendingSky.keys()) if (!strips.has(s)) pendingSky.delete(s);
    const candidates: Array<{ readonly score: number; readonly start: () => Job }> = [];
    const offer = (score: number, start: () => Job): void => { candidates.push({ score, start }); };
    for (const s of pendingStrips) {
      offer(distance(stripX0(s), stripX0(s) + stripWidth(s), focus), () => {
        pendingStrips.delete(s);
        return { run: stripsWork(s, s + 1), strips: new Set([s]) };
      });
    }
    const sorted = [...pendingSky.keys()].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length;) {
      let j = i + 1;
      while (j < sorted.length && sorted[j] === sorted[j - 1]! + 1) j++;
      const r0 = sorted[i]!, r1 = sorted[j - 1]! + 1;
      offer(distance(stripX0(r0), Math.min(width, stripX0(r1)), focus), () => {
        let from = height;
        for (let s = r0; s < r1; s++) {
          from = Math.min(from, pendingSky.get(s)!);
          pendingSky.delete(s);
        }
        return { run: skyWork(r0, r1, from), strips: new Set() };
      });
      i = j;
    }
    if (pendingLamps) {
      const changed = pendingLamps;
      offer(Math.min(...changed.map((rect) => distance(rect.x0, rect.x1, focus))), () => {
        pendingLamps = null;
        return { run: lampWork(changed), strips: new Set() };
      });
    }
    let pick = candidates[0];
    for (const candidate of candidates) if (candidate.score < pick!.score) pick = candidate;
    return pick ? pick.start() : null;
  };

  /** 推进当前工作；完成返回其矩形（并放回期间推迟的失效区），被预算打断返回 null。 */
  const advance = (job: Job, out: LightRect[]): boolean => {
    const step = job.run.next();
    if (!step.done) return false;
    out.push(...step.value);
    dirty.push(...deferred);
    deferred = [];
    return true;
  };

  // 初始灯块：此时没有预算，一步就跑完。
  refreshLamps([]).next();

  return {
    minX, minY, width, height, cellSize: LIGHT_CELL, strips: stripCount, reach, lamps,
    view(s0, s1, keep) {
      windowA = Math.max(0, Math.floor(s0));
      windowB = Math.min(stripCount, Math.ceil(s1));
      keepStrips = keep;
      for (const s of [...strips.keys()]) if (!wanted(s)) strips.delete(s);
      pendingStrips.clear();
      for (let s = windowA; s < windowB; s++) if (!strips.has(s) && !current?.strips.has(s)) pendingStrips.add(s);
    },
    isLoaded: (s) => strips.has(s),
    covers: (x) => strips.has(Math.min(stripCount - 1, Math.max(0, Math.floor((x - minX) / LIGHT_CELL / LIGHT_STRIP)))),
    strip(s) {
      if (!Number.isInteger(s) || s < 0 || s >= stripCount) throw new Error(`light-field: strip ${s} outside [0,${stripCount})`);
      const strip = strips.get(s);
      if (!strip) throw new Error(`light-field: strip ${s} is not loaded`);
      return strip;
    },
    invalidate(x0, y0, x1, y1) {
      if (!(x0 < x1 && y0 < y1)) throw new Error(`light-field: empty invalidate rect (${x0},${y0})-(${x1},${y1})`);
      dirty.push({ x0: Math.max(0, x0) * SUBCELLS, y0: Math.max(0, y0) * SUBCELLS, x1: Math.min(source.width, x1) * SUBCELLS, y1: Math.min(source.height, y1) * SUBCELLS });
    },
    get pending() {
      return current !== null || pendingStrips.size > 0 || pendingSky.size > 0 || pendingLamps !== null || dirty.length > 0 || deferred.length > 0;
    },
    sync(budget) {
      const out: LightRect[] = [];
      const focus = budget?.focus ?? 0;
      // 先比对失效区：镜头外条带的改动若等该条带随镜头算出后再比对，介质已一致，相邻条带的天空光与灯光就不会重算。
      if (dirty.length > 0) out.push(...detect());
      // 镜头看得见的条带：正在算的先算完，其余一次算完。
      if (budget) {
        yieldNow = never;
        const [r0, r1] = budget.required;
        if (current && [...current.strips].some((s) => s >= r0 && s < r1)) {
          while (!advance(current, out)) { /* 无预算，一次跑完 */ }
          current = null;
        }
        const need = [...pendingStrips].filter((s) => s >= r0 && s < r1).sort((a, b) => a - b);
        for (let i = 0; i < need.length;) {
          let j = i + 1;
          while (j < need.length && need[j] === need[j - 1]! + 1) j++;
          for (let k = i; k < j; k++) pendingStrips.delete(need[k]!);
          const job: Job = { run: stripsWork(need[i]!, need[j - 1]! + 1), strips: new Set(need.slice(i, j)) };
          while (!advance(job, out)) { /* 无预算，一次跑完 */ }
          i = j;
        }
      }
      yieldNow = budget?.yieldNow ?? never;
      for (;;) {
        if (dirty.length > 0) out.push(...detect());
        current ??= nextJob(focus);
        if (!current) break;
        if (!advance(current, out)) break;
        current = null;
        if (yieldNow()) break;
      }
      yieldNow = never;
      return out.map(loadedPart).filter((rect): rect is LightRect => rect !== null);
    },
    sample(x, y) {
      if (!(Number.isFinite(x) && Number.isFinite(y))) throw new Error(`light-field: invalid sample point (${x},${y})`);
      const fx = Math.min(width - 1, Math.max(0, (x - minX) / LIGHT_CELL - .5));
      const fy = Math.min(height - 1, Math.max(0, (y - minY) / LIGHT_CELL - .5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
      const at = (sx: number, sy: number): number => {
        const s = Math.floor(sx / LIGHT_STRIP);
        const strip = strips.get(s);
        if (!strip) throw new Error(`light-field: sample (${x},${y}) in strip ${s} that is not loaded`);
        return strip.sky[sy * strip.width + sx - strip.x0]! / LIGHT_FULL;
      };
      const tx = fx - x0, ty = fy - y0;
      return (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty;
    },
  };
}
