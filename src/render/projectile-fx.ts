/**
 * 远程武器特效（任务 018，渲染层，事件 + 实体轮询驱动；光球爆闪仍在 orb-fx）：
 * - 事件：出手水雾/火花、命中/落地水花四溅、入水水柱、弹跳小水花、被吞的气流、捕鱼水花；
 * - 吐出的鱼（fish-flop.ts 状态机）：命中目标“啪”地拍扁 + 卡通星形冲击 → 弹开掉地；落地啪嗒蹦 FISH_FLOP.hops 下（每次压扁、尾巴拍地、溅水），
 *   附近有水就朝水蹦、最后跳进水里（入水水花后消失）；没水就“噗”地化成一团星星水花消失；弹道直接入水则钻进水里。只是渲染表现，逻辑层不回补鱼群。
 * - 轮询：水弹沿途甩水滴、鱼从尾巴甩水、敌弹拖紫色火花；“湿”的实体滴水；光球蓄力时火花向嘴里吸入；张嘴吞时白色气流吸入。
 * 粒子用两个 InstancedMesh 对象池（水滴受瓦片光照、火花加性自发光），鱼与星形冲击用固定大小的池。随机数只用于视觉（本地 LCG）。
 */
import * as THREE from 'three';
import type { Tuning } from '../config/tuning.ts';
import type { SimEvent } from '../core/game-events.ts';
import { lerp } from '../core/math.ts';
import type { Entity } from '../entities/entity.ts';
import { terrainHeightAt } from '../physics/tile-collision.ts';
import type { FluidQuery } from '../world/fluid-map.ts';
import type { TileQuery } from '../world/tile-map.ts';
import { fishVariantOf, fishWiggle } from './cartoon-fish.ts';
import type { FishPose } from './cartoon-fish.ts';
import { createFlopState, startDive, startFlop, stepFlop } from './fish-flop.ts';
import type { FlopEnv, FlopSignal, FlopState } from './fish-flop.ts';
import { FISH_SHOT } from './fish-shot-view.ts';
import { createParticlePool } from './particle-pool.ts';
import type { ParticlePool } from './particle-pool.ts';
import type { FishModel } from './projectile-views.ts';
import { createWingDashFx } from './wing-dash-fx.ts';

export const DROP_CAPACITY = 900;
export const SPARK_CAPACITY = 1200;
export const FLOPPER_CAPACITY = 12;
export const STAR_CAPACITY = 12;
const FX_Z = 0.2;
const WATER = '#a9defa';
const WATER_DEEP = '#5fb4e6';
const ENEMY = '#c27bff';
const GOLD = '#ffd06a';
const ORB = '#ffc45c';
/** 鱼侧躺时身体半高（身长倍数）：状态 y 是贴地点，渲染中心抬高这么多。 */
const FISH_HALF_HEIGHT = 0.2;
/** “啪”星形冲击：命中/消失的大小（格）、寿命（s）、外/内星颜色。 */
export const SPLAT_STAR = Object.freeze({ hitSize: 0.62, poofSize: 0.4, life: 0.32, outer: '#fff27a', inner: '#ff9d2e', points: 8, innerRatio: 0.45 });

export interface ProjectileFxOptions {
  readonly scene: THREE.Object3D;
  readonly tuning: Tuning;
  /** 地形（鱼蹦跳找地面/撞墙）；缺省时鱼在结束点原地蹦。 */
  readonly terrain?: TileQuery;
  /** 格子水（鱼蹦回水里）；缺省视为附近没水。 */
  readonly fluid?: FluidQuery;
  /** 鱼模型工厂（projectile-views.makeFish）。 */
  readonly makeFish: () => FishModel;
  /** 飞鱼（实体 id）的配色（projectile-views.fishVariant）；缺省按 id 哈希。 */
  readonly fishVariant?: (id: number) => number;
  /** 视觉随机种子。 */
  readonly seed?: number;
}

interface Flopper {
  readonly model: FishModel;
  readonly spin: THREE.Group;
  readonly state: FlopState;
  active: boolean;
  /** 开始时的 y（无地形时当作平地）。 */
  ground: number;
  time: number;
  /** 最近一次落地后的时间（尾巴拍地）。 */
  slap: number;
}

interface Star {
  readonly object: THREE.Group;
  active: boolean;
  t: number;
  size: number;
  rot: number;
}

export interface ProjectileFx {
  handleEvents(events: readonly SimEvent[]): void;
  /** 每帧：实体驱动的拖尾/滴水/吸入粒子，推进粒子与蹦跳鱼。dt = 0（hitstop）时冻结。 */
  update(entities: readonly Entity[], alpha: number, dt: number): void;
  readonly drops: ParticlePool;
  readonly sparks: ParticlePool;
  /** 正在蹦的鱼数量（调试/测试）。 */
  readonly floppers: number;
  /** 正在播放的星形冲击数量（调试/测试）。 */
  readonly stars: number;
  /** 鱼蹦跳状态（调试/测试，只读）。 */
  flopStates(): readonly FlopState[];
  dispose(): void;
}

/** 视觉随机数（本地 LCG）与粒子喷射工具；调用顺序决定随机序列。 */
interface FxEmitters {
  readonly rnd: () => number;
  readonly between: (a: number, b: number) => number;
  /** 一簇水滴：方向 (dx,dy) 的锥形喷射（spread 弧度），速度区间 [v0,v1]。 */
  readonly splash: (x: number, y: number, n: number, dx: number, dy: number, spread: number, v0: number, v1: number, color?: string, size?: number) => void;
  readonly burst: (x: number, y: number, n: number, color: string, v0: number, v1: number, size?: number, life?: number) => void;
  /** 粒子从环上被吸向 (x,y)：rate = 本帧期望数量（小数按概率）。 */
  readonly inflow: (x: number, y: number, rate: number, radius: number, color: string, size: number) => void;
}

function createFxEmitters(initialSeed: number, drops: ParticlePool, sparks: ParticlePool): FxEmitters {
  let seed = initialSeed;
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const between = (a: number, b: number): number => a + (b - a) * rnd();

  const splash = (x: number, y: number, n: number, dx: number, dy: number, spread: number, v0: number, v1: number, color = WATER, size = 0.07): void => {
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      const a = base + between(-spread, spread);
      const v = between(v0, v1);
      drops.emit({
        x, y, z: FX_Z + between(-0.15, 0.15), vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: between(-1, 1),
        life: between(0.35, 0.7), size0: size * between(0.7, 1.3), size1: size * 0.25, gravity: 22, drag: 0.6, color: rnd() < 0.3 ? WATER_DEEP : color,
      });
    }
  };

  const burst = (x: number, y: number, n: number, color: string, v0: number, v1: number, size = 0.06, life = 0.4): void => {
    for (let i = 0; i < n; i++) {
      const a = between(0, Math.PI * 2);
      const v = between(v0, v1);
      sparks.emit({
        x, y, z: FX_Z + 0.1, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: between(-0.5, 0.5),
        life: life * between(0.6, 1.2), size0: size * between(0.8, 1.4), size1: 0, gravity: 0, drag: 3, color,
      });
    }
  };

  const inflow = (x: number, y: number, rate: number, radius: number, color: string, size: number): void => {
    let n = Math.floor(rate);
    if (rnd() < rate - n) n++;
    for (let i = 0; i < n; i++) {
      const a = between(0, Math.PI * 2);
      const r = radius * between(0.7, 1.15);
      const t = between(0.18, 0.3);
      sparks.emit({
        x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, z: FX_Z + 0.25, vx: (-Math.cos(a) * r) / t, vy: (-Math.sin(a) * r) / t, vz: 0,
        life: t, size0: size * 0.5, size1: size * 1.2, gravity: 0, drag: 0, color,
      });
    }
  };
  return { rnd, between, splash, burst, inflow };
}

/** “啪”星形冲击池：外星（亮黄）+ 内星（橙），共享几何/材质。 */
function createStarPool(root: THREE.Group): { readonly stars: Star[]; pop(x: number, y: number, size: number, z: number, rot: () => number): void; dispose(): void } {
  const starShape = new THREE.Shape();
  for (let i = 0; i < SPLAT_STAR.points * 2; i++) {
    const a = (i / (SPLAT_STAR.points * 2)) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? 1 : SPLAT_STAR.innerRatio;
    if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  starShape.closePath();
  const starGeo = new THREE.ShapeGeometry(starShape);
  const starOuter = new THREE.MeshBasicMaterial({ color: SPLAT_STAR.outer, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  starOuter.name = 'fish-splat-star';
  const starInner = new THREE.MeshBasicMaterial({ color: SPLAT_STAR.inner, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  starInner.name = 'fish-splat-star-inner';
  const stars: Star[] = [];
  for (let i = 0; i < STAR_CAPACITY; i++) {
    const object = new THREE.Group();
    object.name = `fish-splat-star-${i}`;
    const outer = new THREE.Mesh(starGeo, starOuter);
    const inner = new THREE.Mesh(starGeo, starInner);
    inner.scale.setScalar(0.55);
    inner.position.z = 0.01;
    inner.rotation.z = Math.PI / SPLAT_STAR.points;
    object.add(outer, inner);
    object.visible = false;
    root.add(object);
    stars.push({ object, active: false, t: 0, size: 0, rot: 0 });
  }
  return {
    stars,
    /** 取空闲槽（满则复用最老的一个）播放；rot 在选定槽后取（视觉随机序列不变）。 */
    pop(x, y, size, z, rot) {
      let st = stars.find((q) => !q.active);
      if (!st) {
        st = stars[0] as Star;
        for (const q of stars) if (q.t > st.t) st = q;
      }
      Object.assign(st, { active: true, t: 0, size, rot: rot() });
      st.object.position.set(x, y, z);
      st.object.visible = true;
      st.object.scale.setScalar(0.001);
    },
    dispose() {
      starGeo.dispose();
      starOuter.dispose();
      starInner.dispose();
    },
  };
}

function updateStar(st: Star, dt: number): void {
  st.t += dt;
  const k = st.t / SPLAT_STAR.life;
  if (k >= 1) {
    st.active = false;
    st.object.visible = false;
    return;
  }
  // 迅速弹大（带过冲）→ 停一下 → 缩没。
  const grow = k < 0.22 ? Math.sin((k / 0.22) * Math.PI * 0.6) / Math.sin(Math.PI * 0.6) * 1.15 : 1.15 - 0.15 * Math.min(1, (k - 0.22) / 0.2);
  const shrink = k > 0.55 ? 1 - ((k - 0.55) / 0.45) ** 2 : 1;
  st.object.scale.setScalar(Math.max(0.001, st.size * grow * shrink));
  st.object.rotation.z = st.rot + 0.5 * k;
}

/** 取空闲的蹦跳鱼槽（池满：复用蹦得最久的一条），重置计时并换配色。 */
function claimFlopperSlot(floppers: readonly Flopper[], variant: number): Flopper {
  let slot = floppers.find((f) => !f.active);
  if (!slot) {
    slot = floppers[0] as Flopper;
    for (const f of floppers) if (f.time > slot.time) slot = f;
  }
  slot.active = true;
  slot.time = 0;
  slot.slap = 1;
  slot.model.setVariant(variant);
  slot.spin.visible = true;
  return slot;
}

function drawFlopper(f: Flopper, fishPose: FishPose): void {
  const s = f.state;
  const L = FISH_SHOT.length;
  const sq = s.squash;
  const splat = s.phase === 'splat';
  const sx = splat ? 1 - sq : 1 + 0.6 * sq;
  const sy = splat ? 1 + 0.6 * sq : 1 - sq;
  const shrink = s.phase === 'poof' ? 1 - s.fade : s.phase === 'dive' ? 1 - 0.6 * s.fade : 1;
  const k = L * Math.max(0.001, shrink);
  f.model.object.scale.set(sx * k, sy * k, (splat ? sy : 1) * k);
  const lift = splat || s.phase === 'dive' ? 0 : FISH_HALF_HEIGHT * L * (1 - sq) * shrink;
  f.spin.position.set(s.x, s.y + lift, FX_Z + 0.2);
  f.spin.rotation.set(0, 0, s.roll);
  // 动作：空中扭、落地尾巴拍地（大幅快速衰减）、躺着抽动、拍扁时张大嘴。
  if (s.phase === 'air') fishWiggle(f.time, 1.6, fishPose);
  else if (s.phase === 'splat') {
    fishWiggle(f.time, 0.3, fishPose);
    fishPose.mouth = 1;
  } else if (s.phase === 'rest' || s.phase === 'land') {
    const decay = Math.max(0, 1 - f.slap / 0.35);
    fishWiggle(f.time * 1.6, 0.25 + 1.4 * decay, fishPose);
  } else fishWiggle(f.time, s.phase === 'dive' ? 1.2 : 0.4, fishPose);
  f.model.pose(fishPose);
}

/** 实体驱动的粒子（每帧轮询）：水弹/鱼/敌弹拖尾、湿身滴水、光球蓄力与张嘴吞的吸入。 */
function emitEntityTrails(e: Entity, alpha: number, dt: number, fx: FxEmitters, drops: ParticlePool, sparks: ParticlePool, tuning: Tuning): void {
  const { rnd, between, inflow } = fx;
  const b = e.body;
  const x = lerp(b.prevX, b.x, alpha);
  const y = lerp(b.prevY, b.y, alpha);
  if (e.kind === 'waterShot') {
    // 沿途甩水滴（约 45 滴/秒）。
    if (rnd() < dt * 45) {
      drops.emit({ x, y: y + b.height / 2, z: FX_Z, vx: b.vx * 0.15 + between(-0.6, 0.6), vy: b.vy * 0.15 + between(-0.3, 0.6), vz: between(-0.4, 0.4), life: between(0.3, 0.55), size0: 0.05, size1: 0.015, gravity: 20, drag: 1, color: WATER });
    }
  } else if (e.kind === 'fishShot') {
    // 沿途甩水滴（约 32 滴/秒），从身后（速度反方向）甩出。
    if (rnd() < dt * 32) {
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const bx = x - (b.vx / sp) * 0.4;
      const by = y + b.height / 2 - (b.vy / sp) * 0.4;
      drops.emit({ x: bx, y: by, z: FX_Z, vx: b.vx * 0.12 + between(-1.4, 1.4), vy: b.vy * 0.12 + between(0, 1.6), vz: between(-0.5, 0.5), life: between(0.35, 0.55), size0: 0.055, size1: 0.015, gravity: 18, drag: 1, color: rnd() < 0.3 ? WATER_DEEP : WATER });
    }
  } else if (e.kind === 'codexShot' || e.kind === 'bugShot') {
    const code = e.kind === 'codexShot';
    const count = Math.floor(dt * 160 + rnd());
    for (let i = 0; i < count; i++) {
      const trail = rnd();
      sparks.emit({
        x: x - b.vx * dt * trail + between(-0.08, 0.08), y: y + b.height / 2 - b.vy * dt * trail + between(-0.12, 0.12), z: FX_Z + between(0.1, 0.35),
        vx: b.vx * 0.06 + between(-0.8, 0.8), vy: b.vy * 0.06 + between(-0.9, 0.9), vz: between(-0.3, 0.3),
        life: between(0.22, 0.5), size0: between(0.07, 0.16), size1: 0, gravity: 0.4, drag: 2,
        color: code ? rnd() < 0.25 ? '#d6fbff' : '#36beff' : rnd() < 0.5 ? '#adff44' : '#c76cff',
      });
    }
  } else if (e.kind === 'enemyShot') {
    if (rnd() < dt * 30) sparks.emit({ x, y: y + b.height / 2, z: FX_Z, vx: between(-0.3, 0.3), vy: between(-0.3, 0.3), vz: 0, life: 0.35, size0: 0.07, size1: 0, gravity: -1, drag: 2, color: e.projectile?.returned ? GOLD : ENEMY });
  }
  // 湿：从身体上滴水（约 14 滴/秒）。
  if (e.wetTicks !== undefined && e.wetTicks > 0 && rnd() < dt * 14) {
    drops.emit({ x: x + between(-b.halfWidth, b.halfWidth), y: y + b.height * between(0.25, 0.85), z: FX_Z + 0.3, vx: 0, vy: -0.5, vz: 0, life: 0.6, size0: 0.05, size1: 0.03, gravity: 14, drag: 0, color: WATER });
  }
  const p = e.pelican;
  if (p) {
    const m = p.ride.mode === 'riding' ? tuning.player.bike.muzzle : tuning.attacks.orb.muzzle;
    const mx = x + m.x * e.facing;
    const my = y + m.y;
    if (p.weapon.gulpTicks > 0) {
      inflow(mx + 0.6 * e.facing, my, dt * 90, 2.2, '#adf5ff', 0.08);
    }
  }
}

export function createProjectileFx(options: ProjectileFxOptions): ProjectileFx {
  const { scene, tuning, terrain } = options;
  const root = new THREE.Group();
  root.name = 'projectile-fx';
  scene.add(root);
  const dash = createWingDashFx(root);
  const drops = createParticlePool('water-drops', DROP_CAPACITY, true);
  const sparks = createParticlePool('sparks', SPARK_CAPACITY, false);
  root.add(drops.mesh, sparks.mesh);
  const fx = createFxEmitters((options.seed ?? 0x2f6b9d1) >>> 0, drops, sparks);
  const { rnd, between, splash, burst } = fx;

  const floppers: Flopper[] = [];
  for (let i = 0; i < FLOPPER_CAPACITY; i++) {
    const model = options.makeFish();
    const spin = new THREE.Group();
    spin.name = `fish-flopper-${i}`;
    spin.rotation.order = 'ZYX';
    spin.visible = false;
    spin.add(model.object);
    root.add(spin);
    floppers.push({ model, spin, state: createFlopState(), active: false, ground: 0, time: 0, slap: 1 });
  }
  const starPool = createStarPool(root);
  const stars = starPool.stars;

  /** 无地形时的平地高度（当前正在推进的那条鱼开始蹦时的 y）。 */
  let flatGround = 0;
  const flopEnv: FlopEnv = {
    groundAt: (x, yTop) => (terrain ? terrainHeightAt(terrain, x, yTop, 12) : flatGround),
    waterAt: (tx, ty) => (options.fluid ? options.fluid.amountAt(tx, ty) : 0),
    solidAt: (x, y) => (terrain ? terrain.collisionAt(Math.floor(x), Math.floor(y)) === 'solid' : false),
  };
  const fishPose: FishPose = { bend: 0, tail: 0, mouth: 0, fin: 0 };

  /** 星形冲击：命中时放在鱼后面（压扁的鱼叠在星上），“噗”时在前面。 */
  const popStar = (x: number, y: number, size: number, z = FX_Z + 0.45): void => starPool.pop(x, y, size, z, () => between(-0.4, 0.4));

  const claimFlopper = (id: number): Flopper => claimFlopperSlot(floppers, options.fishVariant ? options.fishVariant(id) : fishVariantOf(id));

  const onFlopSignal = (f: Flopper, signal: FlopSignal): void => {
    const s = f.state;
    if (signal === 'landed') {
      f.slap = 0;
      splash(s.x, s.y + 0.05, 5, 0, 1, 1.1, 1.5, 3.2);
    } else if (signal === 'entered') {
      splash(s.x, s.y, 14, 0, 1, 0.45, 3, 6.5);
      splash(s.x, s.y, 6, s.vx, 1, 0.9, 1, 3);
    } else if (signal === 'poofed') {
      burst(s.x, s.y + 0.2, 12, '#ffffff', 1.2, 3.2, 0.07, 0.35);
      splash(s.x, s.y + 0.2, 6, 0, 1, 1.4, 1.2, 3);
      popStar(s.x, s.y + 0.25, SPLAT_STAR.poofSize);
    } else if (signal === 'done') {
      f.active = false;
      f.spin.visible = false;
    }
  };

  const updateFlop = (f: Flopper, dt: number): void => {
    f.time += dt;
    f.slap += dt;
    flatGround = f.ground;
    onFlopSignal(f, stepFlop(f.state, dt, flopEnv));
    if (f.active) drawFlopper(f, fishPose);
  };

  const onFired = (ev: Extract<SimEvent, { type: 'projectileFired' }>): void => {
    if (ev.kind === 'waterShot') {
      splash(ev.x, ev.y, 10, ev.dirX, ev.dirY, 0.45, 3, 8, WATER, 0.06);
      burst(ev.x, ev.y, 4, '#e8f7ff', 0.5, 2, 0.08, 0.25);
    } else if (ev.kind === 'fishShot') {
      // “嗖”：4–6 颗水滴 + 一点口水星。
      splash(ev.x, ev.y, 4 + Math.floor(rnd() * 3), ev.dirX, ev.dirY, 0.55, 2.5, 5.5);
      burst(ev.x + ev.dirX * 0.15, ev.y + 0.05, 4, '#f4fbff', 0.8, 2.4, 0.045, 0.28);
    } else if (ev.kind === 'codexShot' || ev.kind === 'bugShot') {
      burst(ev.x, ev.y, 14, ev.kind === 'codexShot' ? '#65dcff' : '#b4ff4c', 0.5, 3.5, 0.1, 0.25);
    } else if (ev.kind === 'orb') {
      burst(ev.x, ev.y, 4 + 6 * ev.level, ORB, 1.5, 3 + 2 * ev.level, 0.05 + 0.02 * ev.level);
    } else if (ev.kind === 'photonBug' || ev.kind === 'photonWheel') {
      burst(ev.x, ev.y, 10, ev.kind === 'photonWheel' ? GOLD : '#83eaff', 0.4, 2.5, 0.08);
    } else if (ev.kind === 'droneBomb' || ev.kind === 'droneThermite') {
      burst(ev.x, ev.y, 5, '#ffe6a3', .2, .7, .035, .15);
    } else {
      burst(ev.x, ev.y, 6, ev.returned ? GOLD : ENEMY, 0.5, 2.5);
    }
    if (ev.returned) burst(ev.x, ev.y, 14, GOLD, 2, 5, 0.07);
  };

  const onImpact = (ev: Extract<SimEvent, { type: 'projectileImpact' }>): void => {
    const speed = Math.hypot(ev.vx, ev.vy);
    if ((ev.kind === 'droneBomb' || ev.kind === 'droneThermite') && ev.reason === 'terrain') {
      burst(ev.x, ev.y, ev.kind === 'droneBomb' ? 28 : 18, '#ffd591', 1, 4, .06, .45);
      return;
    }
    if (ev.kind === 'codexShot' || ev.kind === 'bugShot') {
      if (ev.reason === 'hit' || ev.reason === 'terrain') {
        const code = ev.kind === 'codexShot';
        burst(ev.x, ev.y, 48, code ? '#4acfff' : '#bcff49', 2, 9, 0.15, 0.5);
        burst(ev.x, ev.y, 24, code ? '#e7ffff' : '#c774ff', 1, 5, 0.11, 0.35);
      }
      return;
    }
    if (ev.kind === 'photonBug' || ev.kind === 'photonWheel') {
      if (ev.reason === 'hit') {
        burst(ev.x, ev.y, 32, ev.kind === 'photonWheel' ? GOLD : '#83eaff', 2, 9, 0.13, 0.5);
        burst(ev.x, ev.y, 12, '#ffffff', 0.5, 4, 0.17, 0.24);
        popStar(ev.x, ev.y, ev.kind === 'photonWheel' ? 1.05 : 0.8);
      }
      return;
    }
    if (ev.reason === 'swallowed') {
      burst(ev.x, ev.y, 8, '#ffffff', 0.5, 1.5, 0.05, 0.25);
      return;
    }
    if (ev.kind === 'waterShot') {
      if (ev.reason === 'water') splash(ev.x, ev.y, 12, 0, 1, 0.35, 3, 6.5);
      else if (ev.reason === 'expire') splash(ev.x, ev.y, 5, ev.vx, ev.vy, 1, 0.5, 2);
      else {
        // 水花四溅：向上半球为主，顺来向带一点。
        splash(ev.x, ev.y, 14, -ev.vx * 0.2, 1, 1.25, 2.5, 6.5);
        splash(ev.x, ev.y, 6, ev.vx, Math.abs(ev.vy) * 0.3 + 1, 0.6, 1, 3 + speed * 0.1);
      }
    } else if (ev.kind === 'fishShot') {
      const f = claimFlopper(ev.id);
      if (ev.reason === 'water') {
        splash(ev.x, ev.y, 12, 0, 1, 0.4, 2.5, 6);
        startDive(f.state, ev.x, ev.y, ev.vx);
      } else {
        const hit = ev.reason === 'hit';
        if (hit) {
          // 啪！水花 + 卡通星形冲击（在鱼与目标接触处）。
          const dir = ev.vx < 0 ? -1 : 1;
          splash(ev.x + dir * 0.25, ev.y, 10, -dir, 0.8, 1.2, 2, 5);
          popStar(ev.x + dir * 0.5, ev.y + 0.05, SPLAT_STAR.hitSize, FX_Z + 0.05);
        } else splash(ev.x, ev.y, 6, 0, 1, 1.2, 1.5, 4);
        f.ground = ev.y - FISH_HALF_HEIGHT * FISH_SHOT.length;
        startFlop(f.state, { x: ev.x, y: ev.y - (hit ? 0 : FISH_HALF_HEIGHT * FISH_SHOT.length * 0.5), vx: ev.vx, vy: ev.vy, hit, random: rnd() });
      }
      drawFlopper(f, fishPose);
    } else if (ev.kind === 'enemyShot') {
      burst(ev.x, ev.y, ev.reason === 'expire' ? 5 : 14, ev.returned ? GOLD : ENEMY, 1, 4.5, 0.07);
    } else if (ev.level > 1) {
      burst(ev.x, ev.y, 6 * ev.level, ORB, 2, 3 + 2 * ev.level, 0.06);
    }
  };

  return {
    drops,
    sparks,
    get floppers() {
      return floppers.filter((f) => f.active).length;
    },
    get stars() {
      return stars.filter((q) => q.active).length;
    },
    flopStates() {
      return floppers.filter((f) => f.active).map((f) => f.state);
    },
    handleEvents(events) {
      for (const ev of events) {
        if (ev.type === 'hit' && ev.sourceId === ev.attackerId) {
          burst(ev.x, ev.y, 36, '#ffd37d', 2, 8, 0.12, 0.4);
          burst(ev.x, ev.y, 16, '#b9f7ff', 1, 5, 0.1, 0.3);
          popStar(ev.x, ev.y, 0.7);
        } else if (ev.type === 'projectileFired') onFired(ev);
        else if (ev.type === 'projectileImpact') onImpact(ev);
        else if (ev.type === 'projectileBounce') {
          if (ev.kind === 'fishShot' || ev.kind === 'waterShot') splash(ev.x, ev.y, 5, 0, 1, 1, 1.5, 3.5);
        } else if (ev.type === 'swallowed') burst(ev.x, ev.y, 10, '#ffffff', 1, 3, 0.05, 0.3);
        else if (ev.type === 'fishCaught') {
          splash(ev.x, ev.y, 6, 0, 1, 0.8, 1.5, 3.5);
          burst(ev.x, ev.y, 4, '#fff6c8', 0.5, 1.5, 0.05, 0.3);
        }
      }
    },
    update(entities, alpha, dt) {
      dash.update(entities, alpha, dt);
      if (!(dt >= 0) || !Number.isFinite(alpha)) throw new Error(`projectile fx: invalid dt ${dt} / alpha ${alpha}`);
      if (dt > 0) {
        for (const e of entities) if (!e.removed) emitEntityTrails(e, alpha, dt, fx, drops, sparks, tuning);
      }
      drops.update(dt);
      sparks.update(dt);
      if (dt > 0) {
        for (const f of floppers) if (f.active) updateFlop(f, dt);
        for (const st of stars) if (st.active) updateStar(st, dt);
      }
    },
    dispose() {
      root.removeFromParent();
      dash.dispose();
      drops.dispose();
      sparks.dispose();
      for (const f of floppers) f.spin.clear();
      floppers.length = 0;
      stars.length = 0;
      starPool.dispose();
    },
  };
}
