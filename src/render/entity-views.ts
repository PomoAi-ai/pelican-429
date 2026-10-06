/**
 * 具体实体视图：鹈鹕（复用预构建的 rig + animator）与训练假人（简化几何 + 受击闪白/倾斜）。
 * 位置插值：lerp(prev, cur, alpha)，脚底为原点，z=0。
 * 斜坡脚底偏移（可选 terrain）：碰撞盒在斜坡上由角支撑、悬在坡面之上，模型按中心列地面高度下沉（同泰拉瑞亚 gfxOffY）。
 */
import * as THREE from 'three';
import type { Tuning } from '../config/tuning.ts';
import { clamp, damp, lerp } from '../core/math.ts';
import { attackPhase } from '../combat/attacks.ts';
import type { AttackInstance, AttackPhase } from '../combat/attacks.ts';
import type { Entity, RideData } from '../entities/entity.ts';
import type { Body } from '../physics/body.ts';
import { terrainHeightAt } from '../physics/tile-collision.ts';
import type { TileQuery } from '../world/tile-map.ts';
import { createPelicanAnimator, DEFAULT_PELICAN_ANIM_TUNING } from './pelican/pelican-animator.ts';
import type { PelicanAnimInput, PelicanAnimTuning } from './pelican/pelican-animator.ts';
import type { PelicanRig } from './pelican/pelican-rig.ts';
import { createPelicanAttackLayer } from './pelican/pelican-attack-layer.ts';
import type { PelicanSpitInput } from './pelican/pelican-attack-layer.ts';
import { createPelicanPouch } from './pelican/pelican-pouch.ts';
import type { FishVariantRelay } from './cartoon-fish.ts';
import { fillSpitInput, mouthTimeline } from './pelican-weapon-view.ts';
import { createPelicanScarf } from './pelican/pelican-scarf.ts';
import { createPelicanBeakAvoid } from './pelican/pelican-beak-avoid.ts';
import type { BeakAvoidInput } from './pelican/pelican-beak-avoid.ts';
import { collectObstacleBoxes, supportOf, supportPosition, supportTopAt } from './entity-surroundings.ts';
import type { ObstacleBox } from './entity-surroundings.ts';
import { createDummyBodyGeometry, DUMMY_POST_HEIGHT } from './dummy-shape.ts';
import { createTreeRideFollower } from './tree-ride.ts';
import type { TreeRideQuery } from './tree-ride.ts';

export { shotPhaseProgress } from './pelican-weapon-view.ts';
/** 没有 HTML HUD 的检视镜头可启用此层显示世界血条。 */
export const DUMMY_HEALTH_LAYER = 1;
import type { EntityView, EntityViewFactory } from './view-registry.ts';

/** 当前攻击阶段内的进度 [0,1]（animator 约定为“阶段内进度”，不是整段攻击进度）。 */
export function attackPhaseProgress(a: AttackInstance): { phase: AttackPhase; progress: number } {
  const { startup, active, recovery } = a.def;
  const phase = attackPhase(a);
  const [start, length] = phase === 'startup' ? [0, startup] : phase === 'active' ? [startup, active] : [startup + active, recovery];
  const progress = length <= 0 ? 1 : clamp((a.elapsed - start) / length, 0, 1);
  return { phase, progress };
}

/**
 * 骑行进度（契约 C2）：mounting/dismounting 为 (ticks + alpha) / (length − 1)，夹到 [0,1]，length = mountTicks|dismountTicks。
 * 控制器每 tick 先 +1 再判定，ticks 在该 mode 内取 0..length−1、第 length 个 tick 切到下一 mode；以 length − 1 为分母，
 * 最后一个 tick 已到 1（下车时车已缩没、上车时已坐稳），低帧率跳帧也不会在切 mode 时跳变。off/riding 为 0。
 */
export function rideProgress(ride: RideData, tuning: Tuning, alpha = 1): number {
  if (!(Number.isFinite(alpha) && alpha >= 0 && alpha <= 1)) throw new Error(`rideProgress: alpha must be in [0,1], got ${alpha}`);
  const { mountTicks, dismountTicks } = tuning.player.bike;
  const span = (length: number): number => Math.max(1, length - 1);
  if (ride.mode === 'mounting') return clamp((ride.ticks + alpha) / span(mountTicks), 0, 1);
  if (ride.mode === 'dismounting') return clamp((ride.ticks + alpha) / span(dismountTicks), 0, 1);
  return 0;
}

/**
 * 把鹈鹕实体映射为 animator 输入（原地写入 out 并返回）：state 直接透传（含 fly/glide/swim），
 * 攻击给出 attackId/阶段进度，吐射时间轴给出 shotPhase/shotProgress（任意状态，见 pelican-weapon-view），骑行给出 mode/progress/pedaling/cause。
 * dx 为本帧水平位移，alpha 为渲染插值系数（只影响上下车进度）。
 */
export function fillPelicanAnimInput(out: PelicanAnimInput, e: Entity, dx: number, tuning: Tuning, alpha = 1): PelicanAnimInput {
  const p = e.pelican;
  if (!p) throw new Error(`pelican view: entity ${e.id} lost its pelican component`);
  const b = e.body;
  out.state = p.state;
  out.stateTime = p.stateTicks * tuning.sim.step;
  out.vx = b.vx;
  out.vy = b.vy;
  out.facing = e.facing;
  out.turning = p.moveX !== 0 || e.attack !== undefined || p.humanCombat.action !== null || p.shotTicks >= 0;
  out.dx = dx;
  out.gaitMode = p.moveGear;
  if (e.attack) {
    const ap = attackPhaseProgress(e.attack);
    out.attackId = e.attack.def.id;
    out.attackPhase = ap.phase;
    out.attackProgress = ap.progress;
  } else {
    if (p.state === 'attack') throw new Error(`pelican view: entity ${e.id} is in 'attack' state without an attack instance`);
    out.attackId = null;
    out.attackPhase = null;
    out.attackProgress = 0;
  }
  // 嘴部时间轴按当前吐射武器（任务 018；张嘴吞为全开）。
  const shot = mouthTimeline(e, tuning);
  out.shotPhase = shot ? shot.phase : null;
  out.shotProgress = shot ? shot.progress : 0;
  const ride = p.ride;
  out.ride.mode = ride.mode;
  out.ride.progress = rideProgress(ride, tuning, alpha);
  out.ride.pedaling = ride.pedaling;
  out.ride.cause = ride.cause;
  return out;
}

/** 脚底偏移的指数平滑系数（1/s）。 */
const SLOPE_SINK_LAMBDA = 20;
/** 地面探测起点抬高量（格）：terrainHeightAt 的 yTop 落在实心内部会返回 null，抬高半格避免脚底浮点误差落进地面。 */
const SINK_PROBE = 0.5;

/**
 * 斜坡脚底偏移目标（DESIGN 2.12）：onGround、slopeSink>0 且中心列 terrainHeightAt 有值时
 * clamp(地面高 − y, −halfWidth, 0) × slopeSink；否则 0（无地形、空中、平地都为 0）。探测从 y + SINK_PROBE 往下找。
 */
export function slopeSinkOffset(terrain: TileQuery | undefined, x: number, y: number, onGround: boolean, halfWidth: number, slopeSink: number): number {
  if (!(Number.isFinite(slopeSink) && slopeSink >= 0 && slopeSink <= 1)) throw new Error(`slopeSinkOffset: slopeSink must be in [0,1], got ${slopeSink}`);
  if (!terrain || !onGround || slopeSink === 0) return 0;
  const ground = terrainHeightAt(terrain, x, y + SINK_PROBE);
  if (ground === null) return 0;
  return clamp(ground - y, -halfWidth, 0) * slopeSink;
}

/** 步态地面采样起点高于渲染脚底的量与向下探测深度（格）。 */
const GAIT_PROBE_UP = 1.2;
const GAIT_PROBE_DEPTH = 3;

/** 每个视图一个：返回平滑后的脚底偏移（加到渲染 y 上）。 */
function createFootSink(terrain: TileQuery | undefined, slopeSink: number): (b: Body, x: number, y: number, frameDt: number) => number {
  let offset = 0;
  return (b, x, y, frameDt) => {
    if (!terrain) return 0;
    offset = damp(offset, slopeSinkOffset(terrain, x, y, b.onGround, b.halfWidth, slopeSink), SLOPE_SINK_LAMBDA, frameDt);
    return offset;
  };
}

export interface PelicanViewOptions {
  readonly rig: PelicanRig;
  readonly tuning: Tuning;
  readonly windAt: (x: number, y: number) => number;
  readonly animTuning?: PelicanAnimTuning;
  /** 地形查询（可选）：提供时启用斜坡脚底偏移。 */
  readonly terrain?: TileQuery;
  /** 场景实体（可选，019 打磨 B）：提供时站在实体头上脚贴合其顶面并随之移动、喙避让前方实体。 */
  readonly actors?: () => readonly Entity[];
  /** 吐鱼配色接力（projectile-views.fishRelay）：嘴里露出的鱼与随后飞出的鱼同色；缺省时嘴里的鱼用默认配色。 */
  readonly fishRelay?: FishVariantRelay;
  /** 树平台随动（015 追加，render/tree-ride）：站在摇动的树冠/树枝平台上时整体随树平移并微倾；缺省不随动。 */
  readonly treeRide?: TreeRideQuery;
}

const NO_ACTORS: readonly Entity[] = Object.freeze([]);

/**
 * 鹈鹕视图工厂。rig 构建昂贵（约 400ms），由组合根预先构建一次并复用：
 * 同一时刻只允许一个鹈鹕视图持有 rig；视图销毁只把 rig 从场景摘下，不释放 rig 资源。
 */
export function createPelicanViewFactory(options: PelicanViewOptions): EntityViewFactory {
  const { rig, tuning } = options;
  const animTuning = options.animTuning ?? DEFAULT_PELICAN_ANIM_TUNING;
  let owner: number | null = null;

  return (entity) => {
    if (entity.kind !== 'pelican' || !entity.pelican) throw new Error(`pelican view: entity ${entity.id} is not a pelican`);
    if (owner !== null) throw new Error(`pelican view: rig already used by entity ${owner}, cannot attach to ${entity.id}`);
    owner = entity.id;
    if (rig.kneeDirection !== animTuning.kneeDirection) {
      throw new Error(`pelican view: rig kneeDirection ${rig.kneeDirection} differs from animTuning.kneeDirection ${animTuning.kneeDirection}`);
    }
    const animator = createPelicanAnimator(animTuning, rig.animGeometry);
    const scarf = createPelicanScarf(rig.root);
    // 任务 018：远程攻击叠加层（颈后缩前甩、反冲）与嘴囊（挂在下颌上，随 rig 复用；视图销毁时摘下）。
    const attackLayer = createPelicanAttackLayer();
    const pouch = createPelicanPouch(rig.root, options.fishRelay);
    const spit: PelicanSpitInput = { weapon: 'water', phase: 'idle', progress: 0, charge: 0, held: 'none' };
    const terrain = options.terrain;
    const actorsOf = options.actors ?? ((): readonly Entity[] => NO_ACTORS);
    // 019 打磨 B：喙避让（贴墙/被实体挡住时仰头后缩，啄击优先）。
    const { tip, center } = rig.diagnostics.mouth;
    const standMuzzle = tuning.attacks.orb.muzzle;
    const rideMuzzle = tuning.player.bike.muzzle;
    const beakAvoid = createPelicanBeakAvoid(rig.animGeometry, { tip, center, rideOffset: [rideMuzzle.x - standMuzzle.x, rideMuzzle.y - standMuzzle.y] });
    const boxes: ObstacleBox[] = [];
    const avoidInput: BeakAvoidInput = { x: 0, y: 0, facing: 1, boxes, pecking: false };
    // 站在实体头上（solid.supportId）：步态在随支撑体平移的参考系里工作（carry 为累计平移），
    // 锁地的脚随支撑体移动不打滑；地面采样取支撑体顶面曲面（超出其范围退回瓦片地面）。
    let support: Entity | null = null;
    let supportX = 0;
    let supportY = 0;
    let carriedId: number | null = null;
    let carryX = 0;
    let carryY = 0;
    // 步态地面采样：从渲染脚底上方 GAIT_PROBE_UP 往下找（上坡脚够得着、下坡在 GAIT_PROBE_DEPTH 内）。
    let probeY = 0;
    const worldGround = (wx: number): number | null => {
      if (support) {
        const top = supportTopAt(support, supportX, supportY, wx, tuning);
        if (top !== null) return top;
      }
      return terrain ? terrainHeightAt(terrain, wx, probeY + GAIT_PROBE_UP, GAIT_PROBE_DEPTH) : null;
    };
    const groundAt = terrain || options.actors
      ? (gx: number): number | null => {
          const g = worldGround(gx + carryX);
          return g === null ? null : g - carryY;
        }
      : null;
    const footSink = createFootSink(options.terrain, tuning.render.slopeSink);
    // 根节点整体随树平移/倾斜：姿态（步态锁地的脚、骑车）都在根局部系，脚与地面采样随同一位移，贴着摇动的树枝。
    const treeRide = createTreeRideFollower(options.treeRide);
    let lastX: number | null = null;
    const input: PelicanAnimInput = {
      state: 'idle',
      stateTime: 0,
      vx: 0,
      vy: 0,
      facing: 1,
      turning: false,
      attackPhase: null,
      attackProgress: 0,
      dx: 0,
      attackId: null,
      shotPhase: null,
      shotProgress: 0,
      x: 0,
      y: 0,
      groundAt,
      ride: { mode: 'off', progress: 0, pedaling: false, cause: null },
      gaitMode: 'walk',
    };

    const view: EntityView = {
      object: rig.root,
      sync(e, alpha, frameDt) {
        const b = e.body;
        const x = lerp(b.prevX, b.x, alpha);
        const y = lerp(b.prevY, b.y, alpha);
        const renderY = y + footSink(b, x, y, frameDt);
        const ride = treeRide(b, x, y, frameDt);
        rig.root.position.set(x + ride.x, renderY + ride.y, 0);
        rig.root.rotation.z = ride.tilt;
        const actors = actorsOf();
        support = supportOf(e, actors);
        if (support) {
          const sp = supportPosition(support, alpha);
          if (carriedId === support.id) {
            carryX += sp.x - supportX;
            carryY += sp.y - supportY;
          }
          supportX = sp.x;
          supportY = sp.y;
          carriedId = support.id;
        } else carriedId = null;
        const gx = x - carryX;
        fillPelicanAnimInput(input, e, lastX === null ? 0 : gx - lastX, tuning, alpha);
        input.x = gx;
        input.y = renderY - carryY;
        probeY = renderY;
        lastX = gx;
        const pose = animator.update(input, frameDt);
        pouch.set(attackLayer.apply(pose, fillSpitInput(spit, e, tuning), frameDt));
        avoidInput.x = x;
        avoidInput.y = renderY;
        avoidInput.facing = e.facing;
        avoidInput.pecking = input.attackId !== null;
        collectObstacleBoxes(boxes, e, x, renderY, actors, terrain, tuning, alpha);
        beakAvoid.apply(pose, avoidInput, frameDt);
        rig.applyPose(pose);
        scarf.update(input, pose, options.windAt(x, y + b.height), frameDt);
      },
      dispose() {
        scarf.dispose();
        pouch.dispose();
        rig.root.removeFromParent();
        owner = null;
      },
    };
    return view;
  };
}

const DUMMY_COLOR = '#d9b36c';
const DUMMY_POST_COLOR = '#6b4a2f';
const DUMMY_STRIPE_COLOR = '#c0392b';
const MAX_TILT = 0.35;
/** 湿透的稻草色与湿度满格的剩余 tick（剩余更少时逐渐变干）。 */
const DUMMY_WET_COLOR = '#6f5a3a';
const WET_FADE_TICKS = 40;

export interface DummyViewOptions {
  readonly tuning: Tuning;
  /** 地形查询（可选）：提供时启用斜坡脚底偏移。 */
  readonly terrain?: TileQuery;
  /** 树平台随动（同鹈鹕）。 */
  readonly treeRide?: TreeRideQuery;
}

/** 训练假人：稻草胶囊身体 + 红色靶环 + 木桩底座；闪白（emissive）、硬直倾斜、归零后半透明。 */
export function createDummyViewFactory(options: DummyViewOptions): EntityViewFactory {
  const { tuning } = options;
  const { halfWidth, height } = tuning.dummy;
  const flashTicks = Math.max(1, tuning.combat.hitFlashTicks);

  return (entity) => {
    if (entity.kind !== 'trainingDummy' || !entity.health) throw new Error(`dummy view: entity ${entity.id} is not a training dummy with health`);
    const root = new THREE.Group();
    root.name = `dummy-${entity.id}`;
    const tilt = new THREE.Group();
    root.add(tilt);

    const bodyMat = new THREE.MeshStandardMaterial({ color: DUMMY_COLOR, roughness: 0.9, emissive: '#ffffff', emissiveIntensity: 0 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: DUMMY_STRIPE_COLOR, roughness: 0.7, emissive: '#ffffff', emissiveIntensity: 0 });
    const postMat = new THREE.MeshStandardMaterial({ color: DUMMY_POST_COLOR, roughness: 0.9 });
    const materials = [bodyMat, stripeMat, postMat];

    // 身体：平顶圆角回转体，顶面 = 碰撞盒顶（dummy-shape，019 打磨 B；站头上的鹈鹕脚贴合）。
    const postHeight = DUMMY_POST_HEIGHT;
    const radius = halfWidth;
    const capsuleLength = Math.max(0.01, height - postHeight - 2 * radius);
    const bodyGeo = createDummyBodyGeometry(halfWidth, height);
    const stripeGeo = new THREE.TorusGeometry(radius * 1.02, 0.06, 8, 24);
    const postGeo = new THREE.CylinderGeometry(0.12, 0.18, postHeight, 12);
    const baseGeo = new THREE.CylinderGeometry(0.45, 0.5, 0.12, 20);
    const healthGeo = new THREE.PlaneGeometry(1.25, 0.11);
    const healthBackMat = new THREE.MeshBasicMaterial({ color: '#13222e', side: THREE.DoubleSide });
    const healthFillMat = new THREE.MeshBasicMaterial({ color: '#79e78a', side: THREE.DoubleSide, toneMapped: false });
    const healthBack = new THREE.Mesh(healthGeo, healthBackMat);
    const healthFill = new THREE.Mesh(healthGeo, healthFillMat);
    healthBack.layers.set(DUMMY_HEALTH_LAYER);
    healthFill.layers.set(DUMMY_HEALTH_LAYER);
    healthBack.position.set(0, height + 0.4, 0.55);
    healthFill.position.set(0, height + 0.4, 0.56);
    healthBack.scale.set(1.06, 1.5, 1);
    root.add(healthBack, healthFill);
    const geometries = [bodyGeo, stripeGeo, postGeo, baseGeo, healthGeo];

    const body = new THREE.Mesh(bodyGeo, bodyMat);
    const bodyCenter = postHeight + radius + capsuleLength / 2;
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.rotation.x = Math.PI / 2;
    stripe.position.y = bodyCenter + capsuleLength * 0.15;
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.y = postHeight / 2;
    const base = new THREE.Mesh(baseGeo, postMat);
    base.position.y = 0.06;
    for (const m of [body, stripe, post, base]) {
      m.castShadow = true;
      m.receiveShadow = true;
      tilt.add(m);
    }

    let tiltAngle = 0;
    let faded = false;
    let wet = 0;
    const dryColor = new THREE.Color(DUMMY_COLOR);
    const wetColor = new THREE.Color(DUMMY_WET_COLOR);
    const footSink = createFootSink(options.terrain, tuning.render.slopeSink);
    const treeRide = createTreeRideFollower(options.treeRide);

    return {
      object: root,
      sync(e, alpha, frameDt) {
        const h = e.health;
        if (!h) throw new Error(`dummy view: entity ${e.id} lost its health component`);
        const b = e.body;
        const x = lerp(b.prevX, b.x, alpha);
        const y = lerp(b.prevY, b.y, alpha);
        const ride = treeRide(b, x, y, frameDt);
        root.position.set(x + ride.x, y + footSink(b, x, y, frameDt) + ride.y, 0);
        root.rotation.z = ride.tilt;

        const flash = clamp(h.flashTicks / flashTicks, 0, 1);
        const healthShare = Math.max(0, h.hp / h.maxHp);
        healthFill.scale.x = healthShare;
        healthFill.position.x = -(1 - healthShare) * 0.625;
        healthFillMat.color.set(healthShare < 0.3 ? '#ff756b' : healthShare < 0.6 ? '#ffd475' : '#79e78a');
        bodyMat.emissiveIntensity = flash * 0.9;
        // 湿（任务 018）：稻草吸水变暗，干得慢慢恢复（滴水粒子见 projectile-fx）。
        wet = damp(wet, clamp((e.wetTicks ?? 0) / WET_FADE_TICKS, 0, 1), 6, frameDt);
        bodyMat.color.copy(dryColor).lerp(wetColor, 0.5 * wet);
        stripeMat.emissiveIntensity = flash * 0.9;

        // 硬直时顺击退方向后仰（绕脚底旋转），之后回正。
        const target = h.hitstunTicks > 0 ? clamp(-b.vx * 0.05, -MAX_TILT, MAX_TILT) : 0;
        tiltAngle = damp(tiltAngle, target, 12, frameDt);
        tilt.rotation.z = tiltAngle;

        const down = h.hp <= 0;
        if (down !== faded) {
          faded = down;
          for (const m of materials) {
            m.transparent = down;
            m.opacity = down ? 0.35 : 1;
            m.needsUpdate = true;
          }
        }
      },
      dispose() {
        root.removeFromParent();
        for (const g of geometries) g.dispose();
        for (const m of materials) m.dispose();
        healthBackMat.dispose();
        healthFillMat.dispose();
      },
    };
  };
}
