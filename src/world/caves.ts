/**
 * 世界生成：地下洞穴网络（021；纯函数、确定性，只用 core/rng 的 seed 化哈希/噪声）。规则常量见 config/cave-island-rules 的 CAVE_RULES。
 *
 * 可挖带：每列 ty ∈ [lo[x], hi[x]]，hi = ground − 1 − 顶板（保护列 ROOF_PROTECT，否则 ROOF_MIN；结构地基列另限 ≤ 地板行 − 1 − ROOF_PROTECT），
 *   lo = max(BEDROCK_KEEP, ground − 1 − DEPTH_MAX)。
 * 洞穴基准面 datum = hi 的"只降低"斜率限制包络（斜率 DATUM_SLOPE）：隧道/洞室都压在它之下，不会被顶板裁掉、也不会贴着湖床/渔屋。
 * 1. 洞室：按图宽分槽放 ROOM_COUNT 个椭圆洞室（中心在 datum 下 ry+1..），中心高度序列再做"只降低"的斜率限制（相邻洞室连线坡度 ≤ LINK_SLOPE）；
 *    地面削平（v ≥ −FLOOR_CUT）+ 1 格噪声起伏，高洞室留一条石平台。
 * 2. 隧道（噪声蠕虫）：相邻洞室依次连通；y(x) = clamp(线性插值 + 包络 × 噪声, [loS + r, datum − r])，各项斜率有界 → 坡度 ≤ TUNNEL_SLOPE；
 *    半径按噪声在 TUNNEL_R 内变化（竖向净空 ≥ 4 行）。另有若干死胡同分支。
 * 3. 入口：口部两侧地表平坦，向 dir 每列下降 1 的斜坡隧道（开口高 ENTRANCE_HEIGHT）：顶板不足 2 行处整列挖开（露天段，ground 降到坡面），
 *    之后为有顶段，直到坡顶低于 datum；再用隧道接到最近的洞室。至少一个入口距出生点 ENTRANCE_NEAR 列（放不下退到 ENTRANCE_NEAR_FALLBACK_MIN）。
 * 洞穴特征（斜坡形状、水潭、发光源）见 cave-features.ts。坐标约定同 TileMap：y 向上；网格行主序 ty*width+tx。
 */
import { CAVE_RULES } from '../config/cave-island-rules.ts';
import { hash01, valueNoise1D, valueNoise2D } from '../core/rng.ts';
import { CAVE_CELL, CAVE_ENTRANCE, CAVE_OPEN } from './level.ts';
import type { CaveEntrance, CaveRoom } from './level.ts';
import type { ColumnSpan } from './slopes.ts';

const SALT_ROOM = 0xca7e;
const SALT_TUNNEL = 0x7a11;
const SALT_ENTRANCE = 0xe17a;
const SALT_BRANCH = 0xb4a7;
const SALT_POOL = 0x9001;

/** datum / 下界包络的斜率；洞室连线坡度上限；隧道噪声包络。三者之和 + 噪声斜率 ≤ TUNNEL_SLOPE（见 validate 注释）。 */
export const DATUM_SLOPE = 0.4;
export const LINK_SLOPE = 0.45;
/** 入口斜坡每列下降的行数。 */
export const ENTRANCE_DROP = 1;
/** 露天段：坡面之上剩余顶板 < 该行数时整列挖开。 */
const LIP_MIN = 2;
/** 斜坡最长列数（超过即放弃该候选）。 */
const RAMP_MAX = 48;
/** 家列与真实出生点的偏差余量（出生点在渔屋陆侧门外的门前空地）。 */
export const NEAR_SLACK = 6;
/** 地图左右边缘保留的实心列。 */
const EDGE_KEEP = 3;

export interface CaveNetworkInput {
  /** 地表顶边（入口露天段会原地降低）。 */
  readonly ground: Int32Array;
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  /** 顶板加厚的保护列区间（出生草甸、渔屋及院子、水体）。 */
  readonly protect: readonly ColumnSpan[];
  /**
   * 结构地基：列 [span] 内地板瓦片行 floorRow（结构瓦片，不算岩层顶板）之下保留 ROOF_PROTECT 行实心，
   * 即洞穴格 ty ≤ floorRow − 1 − ROOF_PROTECT。渔屋地板盖在地表顶行上，只按 ground 算顶板会少 1 行。
   */
  readonly foundations: readonly CaveFoundation[];
  /** 入口禁放区间（保护列 + 沙漠等）。 */
  readonly noEntrance: readonly ColumnSpan[];
  /** 出生点列（近入口参考）。 */
  readonly spawnX: number;
}

/** 结构地基（见 CaveNetworkInput.foundations）。 */
export interface CaveFoundation {
  readonly span: ColumnSpan;
  readonly floorRow: number;
}

export interface CaveNetwork {
  /** 行主序掩码（CAVE_CELL / CAVE_ENTRANCE）。 */
  readonly mask: Uint8Array;
  readonly rooms: readonly CaveRoom[];
  readonly entrances: readonly CaveEntrance[];
  /** 洞室设计地面行（第一行被挖的格），供 cave-features 使用。 */
  readonly roomFloors: readonly number[];
  /** 水潭盆地（洞室地面中部下挖的碗形坑，水面 = 洞室地面行），供 cave-features.planCavePools 注水。 */
  readonly basins: readonly CaveBasin[];
}

/** 水潭盆地：列 [x0,x1]，水面顶边 level（= 洞室地面行），所属洞室 room。 */
export interface CaveBasin {
  readonly room: number;
  readonly x0: number;
  readonly x1: number;
  readonly level: number;
}

interface Band {
  readonly lo: Int32Array;
  readonly hi: Int32Array;
  /** hi 的只降低斜率包络。 */
  readonly datum: Float64Array;
  /** lo 的只抬高斜率包络。 */
  readonly loS: Float64Array;
}

const pickInt = (u: number, min: number, max: number): number => min + Math.min(max - min, Math.floor(u * (max - min + 1)));
const overlapsAny = (lo: number, hi: number, spans: readonly ColumnSpan[]): boolean => spans.some(([a, b]) => hi >= a && lo <= b);

function buildBand(ground: Int32Array, protect: readonly ColumnSpan[], foundations: readonly CaveFoundation[]): Band {
  const R = CAVE_RULES;
  const n = ground.length;
  const lo = new Int32Array(n);
  const hi = new Int32Array(n);
  const prot = new Uint8Array(n);
  for (const [a, b] of protect) prot.fill(1, Math.max(0, a), Math.min(n, b + 1));
  for (let x = 0; x < n; x++) {
    const g = ground[x] as number;
    hi[x] = g - 1 - (prot[x] === 1 ? R.ROOF_PROTECT : R.ROOF_MIN);
    lo[x] = Math.max(R.BEDROCK_KEEP, g - 1 - R.DEPTH_MAX);
  }
  for (const f of foundations) {
    for (let x = Math.max(0, f.span[0]); x <= Math.min(n - 1, f.span[1]); x++) hi[x] = Math.min(hi[x] as number, f.floorRow - 1 - R.ROOF_PROTECT);
  }
  const datum = Float64Array.from(hi);
  const loS = Float64Array.from(lo);
  for (let x = 1; x < n; x++) {
    datum[x] = Math.min(datum[x] as number, (datum[x - 1] as number) + DATUM_SLOPE);
    loS[x] = Math.max(loS[x] as number, (loS[x - 1] as number) - DATUM_SLOPE);
  }
  for (let x = n - 2; x >= 0; x--) {
    datum[x] = Math.min(datum[x] as number, (datum[x + 1] as number) + DATUM_SLOPE);
    loS[x] = Math.max(loS[x] as number, (loS[x + 1] as number) - DATUM_SLOPE);
  }
  return { lo, hi, datum, loS };
}

interface Carver {
  readonly mask: Uint8Array;
  readonly band: Band;
  readonly width: number;
  /** 在可挖带内把 (x,y) 标为 value（不覆盖已有的入口标记）。 */
  cell(x: number, y: number, value?: number): void;
  disc(cx: number, cy: number, r: number): void;
}

function createCarver(width: number, height: number, band: Band): Carver {
  const mask = new Uint8Array(width * height);
  const cell = (x: number, y: number, value = CAVE_CELL): void => {
    if (x < EDGE_KEEP || x > width - 1 - EDGE_KEEP) return;
    if (y < (band.lo[x] as number) || y > (band.hi[x] as number)) return;
    const i = y * width + x;
    if (mask[i] === CAVE_ENTRANCE || mask[i] === CAVE_OPEN) return;
    mask[i] = value;
  };
  return {
    mask,
    band,
    width,
    cell,
    disc(cx, cy, r) {
      const r2 = r * r;
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cy;
          if (dx * dx + dy * dy <= r2) cell(x, y);
        }
      }
    },
  };
}

/** 隧道中心线的夹紧：[loS + r, datum − r − .5]（列 x 越界按边缘）。 */
function clampTunnel(band: Band, x: number, y: number, r: number): number {
  const c = Math.min(band.datum.length - 1, Math.max(0, Math.round(x)));
  const top = (band.datum[c] as number) - r - 0.5;
  const bottom = (band.loS[c] as number) + r - 0.3;
  return Math.max(bottom, Math.min(top, y));
}

function tunnelRadius(x: number, salt: number): number {
  const R = CAVE_RULES.TUNNEL_R;
  const t = valueNoise1D(x / 9, salt) * 0.5 + 0.5;
  return R.min + (R.max - R.min) * t;
}

/**
 * 从 (ax, ay) 到 (bx, by) 挖一条噪声隧道（ay/by 为隧道底面 y，即站立面）。
 * 中心 y = 线性插值 + 4t(1−t) 包络 × 噪声 + r，夹在可挖带包络内；沿连线每 0.5 格（按水平/竖直跨度较大者）一个圆盘。
 */
function carveTunnel(c: Carver, ax: number, ay: number, bx: number, by: number, salt: number): void {
  const R = CAVE_RULES;
  const dx = bx - ax;
  const len = Math.abs(dx);
  if (len < 1) {
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y += 0.5) c.disc(ax + 0.5, y + R.TUNNEL_R.min, R.TUNNEL_R.min);
    return;
  }
  // 按水平与竖直跨度中较大者每 0.5 格一个圆盘：陡连线（洞室在坡底正下方）也是连续竖井，不会断成几团。
  const steps = Math.ceil(Math.max(len, Math.abs(by - ay)) * 2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = ax + dx * t + 0.5;
    const r = tunnelRadius(x, salt);
    const wob = R.TUNNEL_AMP * valueNoise1D(x / R.TUNNEL_SCALE, salt ^ 0x55) * 4 * t * (1 - t);
    const raw = ay + (by - ay) * t + wob + r - 0.35;
    // 端点（洞室/入口底面）不夹紧：它们由构造保证在可挖带内。
    const y = s === 0 || s === steps ? raw : clampTunnel(c.band, x, raw, r);
    c.disc(x, y, r);
  }
}

interface RoomPlan {
  readonly cx: number;
  cy: number;
  readonly rx: number;
  readonly ry: number;
}

/** 洞室选址：按槽放置，中心在 datum 下；相邻洞室中心高度只降低地做斜率限制。 */
function planRooms(band: Band, width: number, seed: number): RoomPlan[] {
  const R = CAVE_RULES;
  const salt = (seed ^ SALT_ROOM) >>> 0;
  const scale = width / 1200;
  const count = Math.max(1, Math.round(pickInt(hash01(0, 0, salt), R.ROOM_COUNT.min, R.ROOM_COUNT.max) * scale));
  const margin = EDGE_KEEP + R.ROOM_RX.max + 2;
  const usable = width - 2 * margin;
  if (usable < 1) return [];
  const slot = usable / count;
  const rooms: RoomPlan[] = [];
  for (let k = 0; k < count; k++) {
    const rx = pickInt(hash01(k, 1, salt), R.ROOM_RX.min, R.ROOM_RX.max);
    const ry = pickInt(hash01(k, 2, salt), R.ROOM_RY.min, R.ROOM_RY.max);
    const cx = Math.round(margin + slot * (k + 0.2 + 0.6 * hash01(k, 3, salt)));
    const prev = rooms[rooms.length - 1];
    if (prev && cx - prev.cx < R.ROOM_GAP) continue;
    const top = (band.datum[cx] as number) - ry - 1;
    const extra = pickInt(hash01(k, 4, salt), 0, R.ROOM_DEPTH.max - R.ROOM_DEPTH.min);
    const bottom = (band.loS[cx] as number) + ry + 1;
    rooms.push({ cx, cy: Math.max(bottom, top - extra), rx, ry });
  }
  // 相邻洞室连线坡度 ≤ LINK_SLOPE：只降低（仍在 datum 之下）。
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1] as RoomPlan;
    const b = rooms[i] as RoomPlan;
    b.cy = Math.min(b.cy, a.cy + LINK_SLOPE * (b.cx - a.cx));
  }
  for (let i = rooms.length - 2; i >= 0; i--) {
    const a = rooms[i] as RoomPlan;
    const b = rooms[i + 1] as RoomPlan;
    a.cy = Math.min(a.cy, b.cy + LINK_SLOPE * (b.cx - a.cx));
  }
  for (const r of rooms) r.cy = Math.round(r.cy);
  return rooms;
}

/** 洞室地面行（第一行被挖的格）。 */
const roomFloorRow = (r: RoomPlan): number => Math.ceil(r.cy - CAVE_RULES.FLOOR_CUT * r.ry - 0.5);

/** 挖洞室（椭圆 + 噪声边界、地面削平 + 1 格起伏）与可选石平台；返回实际地面行。 */
function carveRoom(c: Carver, r: RoomPlan, k: number, seed: number): number {
  const R = CAVE_RULES;
  const salt = (seed ^ SALT_ROOM ^ Math.imul(k + 1, 0x9e37)) >>> 0;
  const floor = roomFloorRow(r);
  for (let y = floor - 1; y <= r.cy + r.ry + 2; y++) {
    for (let x = r.cx - r.rx - 2; x <= r.cx + r.rx + 2; x++) {
      const u = (x + 0.5 - r.cx) / r.rx;
      const v = (y + 0.5 - r.cy) / r.ry;
      const edge = 1 + 0.22 * valueNoise2D(x / 3.5, y / 3.5, salt);
      if (u * u + v * v > edge) continue;
      // 地面：削平到 floor，按噪声抬起 1 格（起伏）；靠近两壁的地面跟随椭圆。
      const bump = valueNoise1D(x / 4, salt ^ 0x31) > 0.35 ? 1 : 0;
      if (y < floor + bump) continue;
      c.cell(x, y);
    }
  }
  if (r.ry >= R.LEDGE_MIN_RY) {
    const w = pickInt(hash01(k, 7, salt), R.LEDGE_WIDTH.min, R.LEDGE_WIDTH.max);
    const room = 2 * r.rx - 5 - w;
    if (room >= 0) {
      const x0 = r.cx - r.rx + 3 + Math.floor(hash01(k, 8, salt) * (room + 1));
      const ly = floor + 4;
      const ok = (x: number): boolean => {
        for (let y = floor + 1; y <= ly + 3; y++) if (c.mask[y * c.width + x] !== CAVE_CELL) return false;
        return true;
      };
      let fits = x0 + w - 1 <= r.cx + r.rx - 3;
      for (let x = x0; fits && x < x0 + w; x++) fits = ok(x);
      if (fits) for (let x = x0; x < x0 + w; x++) c.mask[ly * c.width + x] = 0;
    }
  }
  return floor;
}

/** 列 x 的洞室地面可站立行（实际被挖的最低行），找不到返回设计地面行。 */
function standRow(c: Carver, x: number, from: number, to: number): number {
  for (let y = from; y <= to; y++) if (c.mask[y * c.width + x] === CAVE_CELL) return y;
  return from;
}

interface EntrancePlan {
  readonly x: number;
  readonly dir: 1 | -1;
  readonly g0: number;
  readonly height: number;
  /** 斜坡列数（不含口部列）。 */
  readonly len: number;
}

/** 入口候选是否可放：口部两侧平坦、斜坡列在图内且不在禁放区、地表不比坡面低、坡底进入 datum 之下。返回斜坡长度或 -1。 */
function entranceLength(input: CaveNetworkInput, band: Band, x: number, dir: 1 | -1, h: number): number {
  const R = CAVE_RULES;
  const { ground, width } = input;
  const g0 = ground[x] as number;
  // 口部外侧：紧邻列不低于口部（口部顶砖削成下坡），再往外 APPROACH 列内起伏 ≤ 2（可走过来）。
  for (let j = 1; j <= R.APPROACH; j++) {
    const a = x - dir * j;
    if (a < EDGE_KEEP || a > width - 1 - EDGE_KEEP) return -1;
    const ga = ground[a] as number;
    if (j === 1 ? ga < g0 || ga > g0 + 1 : Math.abs(ga - g0) > 2) return -1;
  }
  for (let k = 1; k <= RAMP_MAX; k++) {
    const c = x + dir * k;
    if (c < EDGE_KEEP + 1 || c > width - 2 - EDGE_KEEP) return -1;
    const f = g0 - ENTRANCE_DROP * k;
    if ((ground[c] as number) <= f) return -1;
    if (f - 1 < (band.lo[c] as number)) return -1;
    if (f + h + 1 <= (band.datum[c] as number)) return k;
  }
  return -1;
}

/** 挖入口：露天段整列挖开并降低 ground，有顶段挖 h 行；返回 CaveEntrance（room 待定 −1）。 */
function carveEntrance(c: Carver, ground: Int32Array, p: EntrancePlan): Omit<CaveEntrance, 'room'> {
  const { width } = c;
  let covered = false;
  for (let k = 1; k <= p.len; k++) {
    const x = p.x + p.dir * k;
    const f = p.g0 - ENTRANCE_DROP * k;
    const g = ground[x] as number;
    const open = !covered && f + p.height + LIP_MIN > g;
    const top = open ? g - 1 : f + p.height - 1;
    if (!open) covered = true;
    for (let y = f; y <= top; y++) c.mask[y * width + x] = open ? CAVE_OPEN : CAVE_ENTRANCE;
    if (open) ground[x] = f;
  }
  const end = p.x + p.dir * p.len;
  return {
    x: p.x,
    dir: p.dir,
    surfaceY: p.g0,
    height: p.height,
    x0: Math.min(p.x, end),
    x1: Math.max(p.x, end),
    innerX: end,
    innerY: p.g0 - ENTRANCE_DROP * p.len,
  };
}

/** 选入口：先放近入口（距出生点 ENTRANCE_NEAR 内），再按哈希候选补足数量；放不下即抛（带 seed）。 */
function planEntrances(input: CaveNetworkInput, band: Band): EntrancePlan[] {
  const R = CAVE_RULES;
  const { width, seed, spawnX } = input;
  const salt = (seed ^ SALT_ENTRANCE) >>> 0;
  const want = pickInt(hash01(0, 0, salt), R.ENTRANCE_COUNT.min, R.ENTRANCE_COUNT.max);
  const plans: EntrancePlan[] = [];
  let clear = R.ENTRANCE_CLEAR;
  const tryAt = (x: number, dir: 1 | -1, k: number): EntrancePlan | null => {
    if (x < EDGE_KEEP + R.APPROACH + 1 || x > width - 2 - EDGE_KEEP - R.APPROACH) return null;
    if (plans.some((p) => Math.abs(p.x - x) < R.ENTRANCE_GAP)) return null;
    const h = pickInt(hash01(x, k, salt), R.ENTRANCE_HEIGHT.min, R.ENTRANCE_HEIGHT.max);
    const len = entranceLength(input, band, x, dir, h);
    if (len < 0) return null;
    const lo = Math.min(x - dir * R.APPROACH, x + dir * len) - clear;
    const hi = Math.max(x - dir * R.APPROACH, x + dir * len) + clear;
    if (overlapsAny(lo, hi, input.noEntrance)) return null;
    return { x, dir, g0: input.ground[x] as number, height: h, len };
  };
  // 近入口：距家列 [NEAR.min+NEAR_SLACK, NEAR.max−NEAR_SLACK]（出生点在渔屋陆侧门外，偏离屋中心数列），两侧交替、由近到远。
  // 该窗口全被湖/渔屋/起伏地形占满时，退到 [NEAR_FALLBACK_MIN+NEAR_SLACK, NEAR.min+NEAR_SLACK) 由远到近（离首选窗口最近者优先）。
  const side: 1 | -1 = hash01(0, 1, salt) < 0.5 ? -1 : 1;
  const windows: ReadonlyArray<readonly [number, number, 1 | -1]> = [
    [R.ENTRANCE_NEAR.min + NEAR_SLACK, R.ENTRANCE_NEAR.max - NEAR_SLACK, 1],
    [R.ENTRANCE_NEAR.min + NEAR_SLACK - 1, R.ENTRANCE_NEAR_FALLBACK_MIN + NEAR_SLACK, -1],
  ];
  let near: EntrancePlan | null = null;
  // 每个窗口两轮：先按 ENTRANCE_CLEAR 留余量；放不下（出生点贴图边、两侧都是湖）再把余量降到 1 列（顶板保护列仍不进入）。
  search: for (const [from, to, step] of windows) {
    for (const c of [R.ENTRANCE_CLEAR, 1]) {
      clear = c;
      for (let d = from; step > 0 ? d <= to : d >= to; d += step) {
        for (const s of [side, -side as 1 | -1]) {
          const x = Math.round(spawnX) + s * d;
          for (const dir of [s, -s as 1 | -1]) {
            near = tryAt(x, dir, 2);
            if (near) break search;
          }
        }
      }
    }
  }
  clear = R.ENTRANCE_CLEAR;
  if (!near) throw new Error(`generateWorld(seed=${seed}): no cave entrance site within ${R.ENTRANCE_NEAR_FALLBACK_MIN}..${R.ENTRANCE_NEAR.max} columns of the spawn (x=${spawnX})`);
  plans.push(near);
  for (let j = 0; j < 400 && plans.length < want; j++) {
    const x = EDGE_KEEP + Math.floor(hash01(j, 3, salt) * (width - 2 * EDGE_KEEP));
    const dir: 1 | -1 = hash01(j, 4, salt) < 0.5 ? -1 : 1;
    const p = tryAt(x, dir, 5) ?? tryAt(x, -dir as 1 | -1, 5);
    if (p) plans.push(p);
  }
  if (plans.length < R.ENTRANCE_COUNT.min) throw new Error(`generateWorld(seed=${seed}): only ${plans.length} cave entrances fit (need ${R.ENTRANCE_COUNT.min})`);
  return plans.sort((a, b) => a.x - b.x);
}

/** 生成洞穴网络（掩码 + 洞室 + 入口）；入口露天段原地降低 input.ground。 */
export function planCaveNetwork(input: CaveNetworkInput): CaveNetwork {
  const R = CAVE_RULES;
  const { ground, width, height, seed } = input;
  if (ground.length !== width) throw new Error(`planCaveNetwork(seed=${seed}): ground length ${ground.length} != width ${width}`);
  const band = buildBand(ground, input.protect, input.foundations);
  const c = createCarver(width, height, band);
  const plansE = planEntrances(input, band);
  const rooms = planRooms(band, width, seed);
  if (rooms.length === 0) throw new Error(`planCaveNetwork(seed=${seed}): map too narrow for cave rooms (width ${width})`);

  // 入口先挖（标记不会被洞室/隧道覆盖），ground 随之降低；之后的可挖带仍按原 band（入口列的 hi 只会更深，不影响）。
  const entrancesRaw = plansE.map((p) => carveEntrance(c, ground, p));
  const floors = rooms.map((r, k) => carveRoom(c, r, k, seed));
  const tsalt = (seed ^ SALT_TUNNEL) >>> 0;
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1] as RoomPlan;
    const b = rooms[i] as RoomPlan;
    carveTunnel(c, a.cx, floors[i - 1] as number, b.cx, floors[i] as number, (tsalt ^ Math.imul(i, 0x2c1b)) >>> 0);
  }
  // 入口 → 最近洞室（水平距离 + 高差惩罚）。
  const entrances: CaveEntrance[] = entrancesRaw.map((e, j) => {
    let best = 0;
    let bd = Infinity;
    rooms.forEach((r, k) => {
      const d = Math.abs(r.cx - e.innerX) + 0.5 * Math.max(0, e.innerY - (floors[k] as number) - Math.abs(r.cx - e.innerX));
      if (d < bd) {
        bd = d;
        best = k;
      }
    });
    const r = rooms[best] as RoomPlan;
    carveTunnel(c, e.innerX, e.innerY, r.cx, floors[best] as number, (tsalt ^ Math.imul(j + 101, 0x2c1b)) >>> 0);
    return Object.freeze({ ...e, room: best });
  });
  // 死胡同分支。
  const bsalt = (seed ^ SALT_BRANCH) >>> 0;
  const branches = Math.round(R.BRANCH_MAX * hash01(0, 0, bsalt) * (width / 1200) + 0.5);
  for (let j = 0; j < branches; j++) {
    const k = Math.floor(hash01(j, 1, bsalt) * rooms.length);
    const r = rooms[k] as RoomPlan;
    const dir = hash01(j, 2, bsalt) < 0.5 ? -1 : 1;
    const len = pickInt(hash01(j, 3, bsalt), R.BRANCH_LEN.min, R.BRANCH_LEN.max);
    const x1 = Math.min(width - 1 - EDGE_KEEP - 3, Math.max(EDGE_KEEP + 3, r.cx + dir * (r.rx + len)));
    const drift = (hash01(j, 4, bsalt) - 0.5) * 0.6 * Math.abs(x1 - r.cx);
    carveTunnel(c, r.cx, floors[k] as number, x1, (floors[k] as number) + drift, (bsalt ^ Math.imul(j + 7, 0x51ed)) >>> 0);
  }

  // 水潭盆地（最后挖：不会再被隧道改动）：洞室地面中部碗形下挖 POOL_DEPTH 行；只在地面行确为洞室地面的列下挖。
  const psalt = (seed ^ SALT_POOL) >>> 0;
  const basins: CaveBasin[] = [];
  rooms.forEach((r, k) => {
    if (hash01(k, 0, psalt) >= R.POOL_CHANCE) return;
    const floor = floors[k] as number;
    const bw = Math.max(2, Math.round(r.rx * 0.45));
    const depth = pickInt(hash01(k, 1, psalt), R.POOL_DEPTH.min, R.POOL_DEPTH.max);
    let x0 = Infinity;
    let x1 = -Infinity;
    for (let x = r.cx - bw; x <= r.cx + bw; x++) {
      const i = floor * width + x;
      if (c.mask[i] !== CAVE_CELL || c.mask[i - width] !== 0) continue;
      const t = (x - r.cx) / (bw + 1);
      const d = Math.max(1, Math.round(depth * (1 - t * t)));
      for (let y = floor - d; y < floor; y++) c.cell(x, y);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
    }
    if (x1 >= x0) basins.push(Object.freeze({ room: k, x0, x1, level: floor }));
  });

  const out: CaveRoom[] = rooms.map((r, k) => {
    const floor = floors[k] as number;
    const fy = standRow(c, r.cx, floor - 1, r.cy);
    return Object.freeze({ cx: r.cx, cy: r.cy, rx: r.rx, ry: r.ry, floorX: r.cx, floorY: fy });
  });
  return { mask: c.mask, rooms: Object.freeze(out), entrances: Object.freeze(entrances), roomFloors: Object.freeze(floors), basins: Object.freeze(basins) };
}

/** 入口占用列区间（含口部前 APPROACH 列）。 */
export function entranceSpan(e: CaveEntrance): ColumnSpan {
  const a = e.x - e.dir * CAVE_RULES.APPROACH;
  return [Math.min(a, e.x0), Math.max(a, e.x1)];
}
