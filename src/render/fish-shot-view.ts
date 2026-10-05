/**
 * 飞行中的吐出鱼视图（任务 018 打磨）：卡通鱼 + 两条淡淡的弧形速度线，对象池复用（实体结束只归还槽位，不释放 GPU 资源）。
 * - 尺寸：身长 FISH_SHOT.length 格（碰撞半径不变，只是看得见）；出手时从嘴里“弹”出来（popIn 过冲放大）。
 * - 动作：身体 S 形扭动、尾巴甩、嘴一张一合（fishWiggle）；整体绕视线轴翻跟头（fishTumbleRate：头朝前时放慢，偶尔头朝前），
 *   叠加绕身体长轴的小幅翻转（露出一点另一侧）；向左飞时绕长轴翻 π，保证“头朝前”时肚皮朝下。
 * - 速度线：最近 FISH_SHOT.trailSamples 帧的位置组成两条上下偏移的渐细渐隐带（顶点色 RGBA），位置随弹道自然成弧。
 * 配色取自 FishVariantRelay（与鹈鹕嘴里露出的那条一致），按实体 id 记住最近 VARIANT_MEMORY 条，供落地蹦跳的鱼沿用。
 */
import * as THREE from 'three';
import { lerp } from '../core/math.ts';
import type { Entity } from '../entities/entity.ts';
import { fishTumbleRate, fishWiggle } from './cartoon-fish.ts';
import type { CartoonFish, CartoonFishKit, FishPose, FishVariantRelay } from './cartoon-fish.ts';
import type { EntityView } from './view-registry.ts';

export const FISH_SHOT = Object.freeze({
  /** 身长（格）。 */
  length: 1.0,
  /** 出手弹出：时长（s）、起始比例、过冲。 */
  popIn: 0.1,
  popFrom: 0.45,
  popOvershoot: 0.15,
  /** 飞行扭动强度（fishWiggle k）。 */
  wiggle: 1.25,
  /** 绕长轴的翻转幅度（rad）与角频率（rad/s）。 */
  flipAmp: 0.45,
  flipFreq: 6,
  /** 速度线：采样帧数、上下偏移（格）、最大半宽（格）、最大不透明度、显示所需最低速度（格/s）。 */
  trailSamples: 14,
  trailOffset: 0.2,
  trailWidth: 0.028,
  trailAlpha: 0.5,
  trailMinSpeed: 2,
});

interface Slot {
  readonly fish: CartoonFish;
  readonly group: THREE.Group;
  readonly spin: THREE.Group;
  readonly trail: THREE.Mesh;
  readonly trailPos: THREE.BufferAttribute;
  readonly trailCol: THREE.BufferAttribute;
  /** 采样历史 [x0,y0,x1,y1,...]，0 = 最新。 */
  readonly hist: Float32Array;
  count: number;
  busy: boolean;
  entityId: number;
  time: number;
  roll: number;
}

export interface FishShotPool {
  acquire(entity: Entity): EntityView;
  /** 该实体 id 的鱼用的配色（最近记住的；没见过的 id 视为新出手的鱼，从接力取）。 */
  variantOf(id: number): number;
  /** 已创建槽数（只增不减）。 */
  readonly size: number;
  /** 正在使用的槽数。 */
  readonly active: number;
  dispose(): void;
}

const RIBBONS = [1, -1] as const;
/** 记住最近多少条飞鱼的配色（命中事件在视图销毁前处理，这只是余量）。 */
const VARIANT_MEMORY = 32;

export function createFishShotPool(kit: CartoonFishKit, relay: FishVariantRelay, z = 0.15): FishShotPool {
  const S = FISH_SHOT;
  if (!(Number.isInteger(S.trailSamples) && S.trailSamples >= 3)) throw new RangeError(`fish-shot-view: trailSamples must be an integer >= 3, got ${S.trailSamples}`);
  const N = S.trailSamples;
  const verts = RIBBONS.length * N * 2;
  const index: number[] = [];
  for (let r = 0; r < RIBBONS.length; r++) {
    for (let i = 0; i < N - 1; i++) {
      const a = (r * N + i) * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const trailMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  trailMat.name = 'fish-shot-trail';
  const geometries: THREE.BufferGeometry[] = [];
  const slots: Slot[] = [];
  const pose: FishPose = { bend: 0, tail: 0, mouth: 0, fin: 0 };
  const variants = new Map<number, number>();
  /** 实体 id 的配色：第一次见到（视图创建，或从没画过一帧就结束的鱼）时从接力取走并记住。 */
  const variantFor = (id: number): number => {
    let v = variants.get(id);
    if (v === undefined) {
      v = relay.take();
      variants.set(id, v);
      if (variants.size > VARIANT_MEMORY) variants.delete(variants.keys().next().value as number);
    }
    return v;
  };

  const makeSlot = (): Slot => {
    const fish = kit.create(0);
    const group = new THREE.Group();
    const spin = new THREE.Group();
    spin.rotation.order = 'ZYX';
    spin.add(fish.object);
    const geo = new THREE.BufferGeometry();
    const trailPos = new THREE.BufferAttribute(new Float32Array(verts * 3), 3);
    const trailCol = new THREE.BufferAttribute(new Float32Array(verts * 4), 4);
    trailPos.setUsage(THREE.DynamicDrawUsage);
    trailCol.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', trailPos);
    geo.setAttribute('color', trailCol);
    geo.setIndex(index);
    geometries.push(geo);
    const trail = new THREE.Mesh(geo, trailMat);
    trail.name = 'fish-shot-trail';
    trail.frustumCulled = false;
    trail.position.z = -0.08;
    group.add(spin, trail);
    return { fish, group, spin, trail, trailPos, trailCol, hist: new Float32Array(N * 2), count: 0, busy: false, entityId: -1, time: 0, roll: 0 };
  };

  const writeTrail = (slot: Slot, cx: number, cy: number, speed: number): void => {
    const { hist, trailPos, trailCol } = slot;
    const vis = Math.min(1, Math.max(0, (speed - S.trailMinSpeed) / S.trailMinSpeed));
    const last = Math.max(0, slot.count - 1);
    for (let r = 0; r < RIBBONS.length; r++) {
      const side = RIBBONS[r] as number;
      for (let i = 0; i < N; i++) {
        const j = Math.min(i, last);
        const x = (hist[j * 2] as number) - cx;
        const y = (hist[j * 2 + 1] as number) - cy;
        // 切线：相邻样本差（新 → 旧）。
        const ja = Math.max(0, j - 1);
        const jb = Math.min(last, j + 1);
        let tx = (hist[ja * 2] as number) - (hist[jb * 2] as number);
        let ty = (hist[ja * 2 + 1] as number) - (hist[jb * 2 + 1] as number);
        const len = Math.hypot(tx, ty) || 1;
        tx /= len;
        ty /= len;
        const nx = -ty;
        const ny = tx;
        const u = i / (N - 1);
        const w = S.trailWidth * (1 - u);
        const o = S.trailOffset * side * (1 - 0.35 * u);
        const alpha = i <= last && slot.count >= 2 ? S.trailAlpha * vis * (1 - u) ** 1.3 : 0;
        const v = (r * N + i) * 2;
        trailPos.setXYZ(v, x + nx * (o + w), y + ny * (o + w), 0);
        trailPos.setXYZ(v + 1, x + nx * (o - w), y + ny * (o - w), 0);
        trailCol.setXYZW(v, 1, 1, 1, alpha);
        trailCol.setXYZW(v + 1, 1, 1, 1, alpha);
      }
    }
    trailPos.needsUpdate = true;
    trailCol.needsUpdate = true;
  };

  return {
    acquire(entity) {
      let slot = slots.find((s) => !s.busy);
      if (!slot) {
        slot = makeSlot();
        slots.push(slot);
      }
      const sl = slot;
      sl.busy = true;
      sl.entityId = entity.id;
      sl.group.name = `fish-shot-${entity.id}`;
      sl.fish.setVariant(variantFor(entity.id));
      sl.count = 0;
      sl.time = 0;
      // 出手时鼻尖大致朝前上方。
      sl.roll = Math.atan2(entity.body.vy, entity.body.vx);
      sl.spin.scale.setScalar(S.length * S.popFrom);
      return {
        object: sl.group,
        sync(e, alpha, frameDt) {
          if (e.id !== sl.entityId) throw new Error(`fish-shot-view: slot bound to ${sl.entityId}, got entity ${e.id}`);
          const cx = lerp(e.body.prevX, e.body.x, alpha);
          const cy = lerp(e.body.prevY, e.body.y, alpha) + e.body.height / 2;
          sl.group.position.set(cx, cy, z);
          const speed = Math.hypot(e.body.vx, e.body.vy);
          if (frameDt > 0 || sl.count === 0) {
            sl.time += frameDt;
            sl.hist.copyWithin(2, 0, (N - 1) * 2);
            sl.hist[0] = cx;
            sl.hist[1] = cy;
            sl.count = Math.min(N, sl.count + 1);
            if (speed > 1e-6) sl.roll += fishTumbleRate(sl.roll, Math.atan2(e.body.vy, e.body.vx), speed, e.body.vx) * frameDt;
            sl.roll %= Math.PI * 2;
          }
          // 弹出：过冲后回到 1。
          const k = Math.min(1, sl.time / S.popIn);
          const pop = S.popFrom + (1 - S.popFrom) * k + S.popOvershoot * Math.sin(Math.PI * k);
          sl.spin.scale.setScalar(S.length * pop);
          sl.spin.rotation.set((e.body.vx < 0 ? Math.PI : 0) + S.flipAmp * Math.sin(sl.time * S.flipFreq), 0, sl.roll);
          sl.fish.pose(fishWiggle(sl.time, S.wiggle, pose));
          writeTrail(sl, cx, cy, speed);
        },
        dispose() {
          sl.busy = false;
          sl.entityId = -1;
          sl.group.removeFromParent();
        },
      };
    },
    variantOf: variantFor,
    get size() {
      return slots.length;
    },
    get active() {
      return slots.filter((s) => s.busy).length;
    },
    dispose() {
      for (const s of slots) s.group.removeFromParent();
      slots.length = 0;
      for (const g of geometries) g.dispose();
      trailMat.dispose();
    },
  };
}
