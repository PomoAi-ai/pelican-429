/**
 * 洞穴与浮空岛装饰几何（021；纯 three 计算，node 下可测）。
 * PartBuilder：带索引几何累加器，属性 position / normal / color / aGlow（自发光权重 0..1，cave-decor 材质把 vColor×aGlow 加到自发光，
 * 光照图对自发光不衰减 → 暗处也亮）。所有形状的随机只用 core/rng 的整数哈希（确定性）。
 * 形状单位 = 瓦片；锚点：地面类（石笋/蘑菇/晶簇/苔藓/岩石）在 y=0 向上长，顶棚类（钟乳石/垂苔/顶棚晶簇）在 y=0 向下长，
 * 蛛网锚在顶棚角（向下、向内展开）。
 */
import * as THREE from 'three';
import { hash01 } from '../core/rng.ts';

type Rgb = THREE.Color;
const C = (hex: string): Rgb => new THREE.Color(hex);

export class PartBuilder {
  readonly pos: number[] = [];
  readonly col: number[] = [];
  readonly glow: number[] = [];
  readonly idx: number[] = [];

  vertex(x: number, y: number, z: number, c: Rgb, g: number): number {
    this.pos.push(x, y, z);
    this.col.push(c.r, c.g, c.b);
    this.glow.push(g);
    return this.pos.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  /**
   * 旋转体：profile 为 [半径, 高度] 自下而上；segs 段；中心 (cx,cz)；zs = z 向压扁（贴墙的扁形）；
   * color(t) 按 profile 进度着色；glow(t) 自发光权重；wob = 半径扰动幅度（按 salt 哈希，卡通的不规则）。
   */
  lathe(profile: ReadonlyArray<readonly [number, number]>, segs: number, cx: number, cz: number, color: (t: number) => Rgb, glow: (t: number) => number, salt: number, wob = 0, zs = 1, lean = 0): void {
    if (profile.length < 2 || segs < 3) throw new Error('cave-geometry: lathe needs ≥ 2 profile points and ≥ 3 segments');
    const rows: number[][] = [];
    const n = profile.length - 1;
    const h0 = (profile[0] as readonly [number, number])[1];
    const h1 = (profile[n] as readonly [number, number])[1];
    profile.forEach(([r, y], i) => {
      const t = i / n;
      const ring: number[] = [];
      const c = color(t);
      const g = glow(t);
      const k = h1 === h0 ? 0 : (y - h0) / (h1 - h0);
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const rr = r * (1 + wob * (hash01(s, i, salt) - 0.5) * 2);
        ring.push(this.vertex(cx + Math.cos(a) * rr + lean * k * k, y, cz + Math.sin(a) * rr * zs, c, g));
      }
      rows.push(ring);
    });
    for (let i = 0; i < n; i++) {
      const a = rows[i] as number[];
      const b = rows[i + 1] as number[];
      for (let s = 0; s < segs; s++) {
        const s1 = (s + 1) % segs;
        this.tri(a[s] as number, b[s1] as number, a[s1] as number);
        this.tri(a[s] as number, b[s] as number, b[s1] as number);
      }
    }
  }

  /** 平面四边形（双面材质；a→b→c→d 逆时针朝 +z）。 */
  quad(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], col: Rgb, g: number): void {
    const v = [a, b, c, d].map((p) => this.vertex(p[0] as number, p[1] as number, p[2] as number, col, g));
    this.tri(v[0] as number, v[1] as number, v[2] as number);
    this.tri(v[0] as number, v[2] as number, v[3] as number);
  }

  /** 输出带索引几何；flip = 上下翻转（顶棚版本，绕序随之翻转）。 */
  build(flip = false): THREE.BufferGeometry {
    if (this.idx.length === 0) throw new Error('cave-geometry: empty part');
    const pos = Float32Array.from(this.pos);
    const idx = Uint32Array.from(this.idx);
    if (flip) {
      for (let i = 1; i < pos.length; i += 3) pos[i] = -(pos[i] as number);
      for (let i = 0; i < idx.length; i += 3) {
        const t = idx[i + 1] as number;
        idx[i + 1] = idx[i + 2] as number;
        idx[i + 2] = t;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.glow, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

const STONE_DARK = C('#4a4550');
const STONE_MID = C('#6e6874');
const STONE_WET = C('#a9a3b4');
const DIRT_DARK = C('#4d3626');
const DIRT_MID = C('#76533a');
/** 浮空岛岩块：暖灰褐带层理（与土色岛体协调，不用洞穴冷灰石色）。 */
const ROCK_WARM_DARK = C('#5a4a3e');
const ROCK_WARM_MID = C('#857060');
const ROCK_WARM_LIGHT = C('#a8927c');
const MOSS_DARK = C('#2f5a2a');
const MOSS_LIGHT = C('#6f9f45');
const WEB = C('#d9dde3');
const MUSH_STEM = C('#d8e6dc');
const MUSH_CAP = [C('#3fe0c0'), C('#58c8ff'), C('#8cff9a')] as const;
const CRYSTAL = { cyan: [C('#3fd8ff'), C('#b8f6ff')], purple: [C('#a35cff'), C('#e2c2ff')] } as const;

const lerpC = (a: Rgb, b: Rgb, t: number): Rgb => a.clone().lerp(b, Math.min(1, Math.max(0, t)));

/** 钟乳石/石笋轮廓：卡通的圆润锥（根部鼓、尖部收），湿亮尖端（颜色变亮，配合低粗糙度材质出高光）。 */
function spire(b: PartBuilder, len: number, r0: number, cx: number, cz: number, salt: number, dirt = false): void {
  const prof: Array<[number, number]> = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bulge = 1 + 0.18 * Math.sin(t * Math.PI * 1.6 + hash01(i, 3, salt) * 2);
    prof.push([Math.max(0.012, r0 * Math.pow(1 - t, 0.75) * bulge), len * t]);
  }
  prof[n] = [0.0, len];
  const base = dirt ? DIRT_DARK : STONE_DARK;
  const mid = dirt ? DIRT_MID : STONE_MID;
  b.lathe(prof, 7, cx, cz, (t) => (t < 0.6 ? lerpC(base, mid, t / 0.6) : lerpC(mid, STONE_WET, (t - 0.6) / 0.4)), () => 0, salt, 0.12, 0.85, (hash01(1, 9, salt) - 0.5) * 0.15);
}

export function stalagmiteGeometry(v: number): THREE.BufferGeometry {
  const b = new PartBuilder();
  const salt = 0x5a1 + v * 17;
  const len = 0.7 + 0.9 * hash01(v, 1, salt);
  spire(b, len, 0.24 + 0.1 * hash01(v, 2, salt), 0, 0, salt);
  if (hash01(v, 3, salt) < 0.7) spire(b, len * 0.5, 0.14, 0.26, 0.08, salt + 1);
  return b.build();
}

export function stalactiteGeometry(v: number): THREE.BufferGeometry {
  const b = new PartBuilder();
  const salt = 0x5a7 + v * 23;
  const len = 0.8 + 1.1 * hash01(v, 1, salt);
  spire(b, len, 0.22 + 0.1 * hash01(v, 2, salt), 0, 0, salt);
  if (hash01(v, 3, salt) < 0.6) spire(b, len * 0.45, 0.12, -0.24, -0.06, salt + 1);
  return b.build(true);
}

/** 发光蘑菇丛：3–5 朵，白茎 + 发光伞盖（伞盖 aGlow 1，茎 .35）。 */
export function mushroomGeometry(v: number): THREE.BufferGeometry {
  const b = new PartBuilder();
  const salt = 0x3a5 + v * 31;
  const n = 3 + Math.floor(hash01(v, 0, salt) * 3);
  const cap = MUSH_CAP[v % MUSH_CAP.length] as Rgb;
  for (let k = 0; k < n; k++) {
    const x = (hash01(k, 1, salt) - 0.5) * 0.7;
    const z = (hash01(k, 2, salt) - 0.5) * 0.3;
    const h = 0.18 + 0.32 * hash01(k, 3, salt);
    const r = 0.08 + 0.1 * hash01(k, 4, salt);
    b.lathe([[0.035, 0], [0.03, h * 0.6], [0.028, h]], 5, x, z, () => MUSH_STEM, () => 0.35, salt + k);
    b.lathe([[0.02, h - 0.02], [r, h], [r * 0.85, h + r * 0.35], [r * 0.45, h + r * 0.6], [0.0, h + r * 0.68]], 8, x, z, (t) => lerpC(cap, C('#ffffff'), t * 0.4), () => 1, salt + 7 * k);
  }
  return b.build();
}

/** 晶簇（青/紫）：3–5 根六棱柱带尖，切面独立顶点（硬边）；aGlow .85。ceiling = 顶棚版本（向下）。 */
export function crystalGeometry(kind: 'cyan' | 'purple', v: number, ceiling: boolean): THREE.BufferGeometry {
  const b = new PartBuilder();
  const salt = (kind === 'cyan' ? 0xc1 : 0xc7) + v * 41;
  const [deep, light] = CRYSTAL[kind];
  const n = 3 + Math.floor(hash01(v, 0, salt) * 3);
  for (let k = 0; k < n; k++) {
    const h = 0.35 + 0.55 * hash01(k, 1, salt) * (k === 0 ? 1.3 : 1);
    const r = 0.07 + 0.06 * hash01(k, 2, salt);
    const tilt = (hash01(k, 3, salt) - 0.5) * 0.9;
    const x0 = (hash01(k, 4, salt) - 0.5) * 0.35;
    const z0 = (hash01(k, 5, salt) - 0.5) * 0.25;
    const ax = Math.sin(tilt);
    const ay = Math.cos(tilt);
    const ring = (y: number, rr: number): number[][] => {
      const out: number[][] = [];
      for (let s = 0; s < 6; s++) {
        const a = (s / 6) * Math.PI * 2;
        const lx = Math.cos(a) * rr;
        const lz = Math.sin(a) * rr;
        out.push([x0 + lx * ay + ax * y, -lx * ax + ay * y, z0 + lz]);
      }
      return out;
    };
    const bot = ring(0, r);
    const top = ring(h * 0.78, r);
    const tip = [x0 + ax * h, ay * h, z0];
    for (let s = 0; s < 6; s++) {
      const s1 = (s + 1) % 6;
      const c = lerpC(deep, light, 0.25 + 0.5 * hash01(k, s, salt));
      b.quad(bot[s] as number[], bot[s1] as number[], top[s1] as number[], top[s] as number[], c, 0.85);
      const t0 = b.vertex((top[s] as number[])[0] as number, (top[s] as number[])[1] as number, (top[s] as number[])[2] as number, light, 1);
      const t1 = b.vertex((top[s1] as number[])[0] as number, (top[s1] as number[])[1] as number, (top[s1] as number[])[2] as number, light, 1);
      const tp = b.vertex(tip[0] as number, tip[1] as number, tip[2] as number, C('#ffffff'), 1);
      b.tri(t0, t1, tp);
    }
  }
  // 根部石座（不发光）。
  b.lathe([[0.3, -0.04], [0.26, 0.05], [0.12, 0.1]], 7, 0, 0, () => STONE_MID, () => 0, salt, 0.2, 0.7);
  return b.build(ceiling);
}

/** 苔藓垫（地面，扁平小团）或垂苔（顶棚，几缕细锥）。 */
export function mossGeometry(v: number, ceiling: boolean): THREE.BufferGeometry {
  const b = new PartBuilder();
  const salt = 0x30 + v * 13;
  if (!ceiling) {
    const n = 4 + Math.floor(hash01(v, 0, salt) * 3);
    for (let k = 0; k < n; k++) {
      const x = (hash01(k, 1, salt) - 0.5) * 0.9;
      const r = 0.1 + 0.12 * hash01(k, 2, salt);
      b.lathe([[r, -0.02], [r * 0.95, r * 0.25], [r * 0.6, r * 0.5], [0, r * 0.6]], 6, x, (hash01(k, 3, salt) - 0.5) * 0.3, (t) => lerpC(MOSS_DARK, MOSS_LIGHT, t), () => 0.05, salt + k, 0.2, 0.8);
    }
    return b.build();
  }
  const n = 3 + Math.floor(hash01(v, 0, salt) * 4);
  for (let k = 0; k < n; k++) {
    const x = (hash01(k, 1, salt) - 0.5) * 0.9;
    const len = 0.3 + 0.6 * hash01(k, 2, salt);
    b.lathe([[0.05, 0], [0.035, len * 0.5], [0.0, len]], 4, x, (hash01(k, 3, salt) - 0.5) * 0.2, (t) => lerpC(MOSS_DARK, MOSS_LIGHT, t), () => 0.05, salt + k);
  }
  return b.build(true);
}

/** 蛛网：锚在顶棚角，放射丝 + 三圈螺旋丝（细条四边形，朝镜头）；dir = 1 角在左上（向右下展开），-1 镜像。 */
export function cobwebGeometry(v: number): THREE.BufferGeometry {
  const b = new PartBuilder();
  const salt = 0x3eb + v * 7;
  const R = 0.9 + 0.5 * hash01(v, 0, salt);
  const spokes = 5;
  const w = 0.012;
  const z = 0.02;
  const pt = (a: number, r: number): [number, number] => [Math.cos(a) * r, -Math.sin(a) * r];
  const line = (p: [number, number], q: [number, number]): void => {
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * w;
    const ny = (dx / l) * w;
    b.quad([p[0] - nx, p[1] - ny, z], [q[0] - nx, q[1] - ny, z], [q[0] + nx, q[1] + ny, z], [p[0] + nx, p[1] + ny, z], WEB, 0.08);
  };
  for (let s = 0; s < spokes; s++) line([0, 0], pt((s / (spokes - 1)) * (Math.PI / 2), R * (0.85 + 0.15 * hash01(s, 1, salt))));
  for (let ring = 1; ring <= 3; ring++) {
    const r = (R * ring) / 3.4;
    for (let s = 0; s < spokes - 1; s++) {
      const sag = 0.85 + 0.08 * hash01(s, ring, salt);
      const a0 = (s / (spokes - 1)) * (Math.PI / 2);
      const a1 = ((s + 1) / (spokes - 1)) * (Math.PI / 2);
      const m = pt((a0 + a1) / 2, r * sag);
      line(pt(a0, r), m);
      line(m, pt(a1, r));
    }
  }
  return b.build();
}

/** 岩块（浮空岛底面起伏/岛面小石）：不规则压扁圆丘；hang = 倒挂（岛底）；dirt = 泥土色，否则暖灰褐岩（带层理条纹）。 */
export function lumpGeometry(v: number, hang: boolean, dirt: boolean): THREE.BufferGeometry {
  const b = new PartBuilder();
  const salt = 0x1a0 + v * 29 + (dirt ? 5 : 0);
  const r = 0.5 + 0.25 * hash01(v, 0, salt);
  const h = hang ? 0.7 + 0.6 * hash01(v, 1, salt) : 0.35 + 0.2 * hash01(v, 1, salt);
  const prof: Array<[number, number]> = hang
    ? [[r, -0.05], [r * 0.95, h * 0.25], [r * 0.7, h * 0.6], [r * 0.3, h * 0.9], [0, h]]
    : [[r, -0.05], [r * 0.9, h * 0.4], [r * 0.55, h * 0.85], [0, h]];
  const lo = dirt ? DIRT_MID : ROCK_WARM_MID;
  const hi = dirt ? DIRT_DARK : ROCK_WARM_DARK;
  // 岩质：沿高度交替深浅的层理（3 条），顶端（挂点）向土色过渡。
  const strata = (t: number): Rgb => lerpC(lerpC(lo, hi, t), ROCK_WARM_LIGHT, Math.sin(t * Math.PI * 6) > 0.6 ? 0.25 : 0);
  const color = (t: number): Rgb => (hang ? (dirt ? lerpC(lo, hi, t) : lerpC(DIRT_MID, strata(t), Math.min(1, t * 3))) : lerpC(ROCK_WARM_DARK, ROCK_WARM_LIGHT, t * 0.7));
  b.lathe(prof, 8, 0, 0, color, () => 0, salt, 0.22, 0.75);
  return b.build(hang);
}

/** 宝箱（木箱 + 拱形箱盖 + 金边/金锁，金属微光；正面朝镜头，约 1.1 格宽）。 */
export function chestGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder();
  const wood = C('#8a5a2b');
  const woodDark = C('#5e3a19');
  const metal = C('#d8b545');
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: Rgb, top: Rgb): void => {
    b.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], c, 0);
    b.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], c, 0);
    b.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], woodDark, 0);
    b.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], woodDark, 0);
    b.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], top, 0);
  };
  // 箱体 + 木板缝（深色细条）。
  box(-0.55, 0.55, 0, 0.55, -0.32, 0.32, wood, wood);
  for (const y of [0.18, 0.37]) box(-0.55, 0.55, y, y + 0.025, 0.32, 0.33, woodDark, woodDark);
  // 拱形箱盖：5 段折线拱（正面 + 顶面）。
  const arch = 5;
  for (let k = 0; k < arch; k++) {
    const a0 = Math.PI * (k / arch);
    const a1 = Math.PI * ((k + 1) / arch);
    const x0 = 0.57 * Math.cos(a0);
    const x1 = 0.57 * Math.cos(a1);
    const y0 = 0.58 + 0.24 * Math.sin(a0);
    const y1 = 0.58 + 0.24 * Math.sin(a1);
    b.quad([x1, 0.58, 0.34], [x0, 0.58, 0.34], [x0, y0, 0.34], [x1, y1, 0.34], wood, 0);
    b.quad([x1, y1, 0.34], [x0, y0, 0.34], [x0, y0, -0.34], [x1, y1, -0.34], k === 0 || k === arch - 1 ? woodDark : wood, 0);
  }
  box(-0.57, 0.57, 0.55, 0.6, -0.34, 0.34, woodDark, woodDark);
  // 金边：四角竖条、盖沿横条、盖上两道箍；金锁（微光）。
  const g = 0.45;
  for (const x of [-0.57, 0.49]) box(x, x + 0.08, 0, 0.6, 0.33, 0.36, metal, metal);
  box(-0.57, 0.57, 0.53, 0.6, 0.34, 0.37, metal, metal);
  box(-0.57, 0.57, 0, 0.05, 0.33, 0.36, metal, metal);
  for (const x of [-0.3, 0.22]) {
    for (let k = 0; k < arch; k++) {
      const a0 = Math.PI * (k / arch);
      const a1 = Math.PI * ((k + 1) / arch);
      const lo = 0.58 + 0.245 * Math.min(Math.sin(a0), Math.sin(a1));
      const hi = 0.58 + 0.245 * Math.max(Math.sin(a0), Math.sin(a1));
      b.quad([x, lo, 0.36], [x + 0.08, lo, 0.36], [x + 0.08, hi, 0.36], [x, hi, 0.36], metal, g);
    }
  }
  box(-0.09, 0.09, 0.36, 0.6, 0.36, 0.4, metal, metal);
  b.quad([-0.05, 0.42, 0.405], [0.05, 0.42, 0.405], [0.05, 0.52, 0.405], [-0.05, 0.52, 0.405], C('#fff2b0'), 1);
  return b.build();
}

/** 小神龛（两根石柱 + 横梁 + 方形石台 + 悬浮的发光多面宝石；无人形轮廓）。 */
export function shrineGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder();
  b.lathe([[0.16, 0], [0.13, 0.2], [0.11, 1.5], [0.15, 1.6]], 6, -0.55, 0, (t) => lerpC(STONE_MID, STONE_WET, t), () => 0, 0x51, 0.05);
  b.lathe([[0.16, 0], [0.13, 0.2], [0.11, 1.5], [0.15, 1.6]], 6, 0.55, 0, (t) => lerpC(STONE_MID, STONE_WET, t), () => 0, 0x52, 0.05);
  b.quad([-0.8, 1.6, 0.2], [0.8, 1.6, 0.2], [0.85, 1.85, 0.2], [-0.85, 1.85, 0.2], STONE_WET, 0);
  b.quad([0.8, 1.6, -0.2], [-0.8, 1.6, -0.2], [-0.85, 1.85, -0.2], [0.85, 1.85, -0.2], STONE_MID, 0);
  b.quad([-0.85, 1.85, 0.2], [0.85, 1.85, 0.2], [0.85, 1.85, -0.2], [-0.85, 1.85, -0.2], STONE_WET, 0);
  // 方形矮石台（宽、矮，不像身体）。
  b.lathe([[0.42, 0], [0.42, 0.18], [0.34, 0.22], [0.34, 0.3], [0.0, 0.3]], 4, 0, 0, (t) => lerpC(STONE_MID, STONE_WET, t), () => 0, 0x53, 0.02);
  // 悬浮八面体宝石（4 段车削 = 菱形），离台面一段空隙，青白色自发光。
  b.lathe([[0.0, 0.55], [0.2, 0.82], [0.0, 1.18]], 4, 0, 0, (t) => lerpC(C('#7fe8ff'), C('#e8fbff'), t), () => 1, 0x54);
  return b.build();
}

/** 三角形数（测试/预算）。 */
export function partTriangles(g: THREE.BufferGeometry): number {
  if (!g.index) throw new Error('cave-geometry: geometry without index');
  return g.index.count / 3;
}
