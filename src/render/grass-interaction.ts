/**
 * 草地交互（渲染层，事件/状态驱动，确定性；只读模拟数据，不改逻辑层）：
 * - 啄击：攻击 active 阶段的判定框（combat.attackHitbox）向下延伸 cut.reachDown 覆盖到地面 → 顺朝向的 spring 倒伏 + 按概率割断 + 草屑；每个攻击实例只触发一次。
 * - 投射物（光球/水弹/鱼/敌弹，任务 018）：飞行时离地 < orbWakeHeight 产生跟随的径向气流（steady，按 key 续期）；projectileImpact 事件（撞地形/命中）在地面附近 → 径向爆压 + 一圈割断 + 草屑。
 * - 鹈鹕落地：从空中落地且下落速度 ≥ landingMinSpeed → 径向冲击（强度随速度）+ 少量草屑。
 * - 骑车：riding 且着地、|vx| ≥ rideMinSpeed → 顺行进方向的持续倒伏；步行着地且 |vx| ≥ walkMinSpeed → 轻微推开（草与灌木）。
 * 扰动写入共享扰动场（grass-disturb，flora 风材质读取），割断改花草实例矩阵（grass-cut），草屑见 grass-debris-fx。
 */
import type * as THREE from 'three';
import { attackHitbox } from '../combat/attacks.ts';
import type { AttackInstance } from '../combat/attacks.ts';
import type { SimEvent } from '../core/game-events.ts';
import type { Entity } from '../entities/entity.ts';
import { createGrassCutter } from './grass-cut.ts';
import type { CutPiece, GrassCutter } from './grass-cut.ts';
import { createDebrisFx } from './grass-debris-fx.ts';
import type { DebrisFx } from './grass-debris-fx.ts';
import { GRASS_DISTURB, createDisturbField } from './grass-disturb.ts';
import type { DisturbField, DisturbUniforms } from './grass-disturb.ts';
import type { Rng } from '../core/rng.ts';

/** 爆点/光球离视觉地面超过该值（格）视为不触地。 */
const GROUND_CONTACT = 1.5;

export interface GrassInteractionOptions {
  readonly scene: THREE.Object3D;
  /** tile-view.root（花草/地被所在）。 */
  readonly tilesRoot: THREE.Object3D;
  /** 视觉地面高度。 */
  readonly ground: (x: number) => number;
  readonly uniforms?: DisturbUniforms;
  readonly rng?: Rng;
}

export interface GrassInteraction {
  readonly field: DisturbField;
  readonly cutter: GrassCutter;
  readonly debris: DebrisFx;
  /** 本帧事件（projectileImpact）。 */
  handleEvents(events: readonly SimEvent[], time: number): void;
  /** 轮询实体（啄击判定框、光球、落地、骑车），推进扰动/再生/草屑。 */
  update(entities: readonly Entity[], time: number, dt: number, wind?: (x: number) => number): void;
  dispose(): void;
}

export function createGrassInteraction(options: GrassInteractionOptions): GrassInteraction {
  if (!options.scene || !options.tilesRoot || typeof options.ground !== 'function') throw new Error('grass-interaction: scene, tilesRoot and ground are required');
  const T = GRASS_DISTURB;
  const field = createDisturbField(options.uniforms);
  const cutter = createGrassCutter(options.tilesRoot);
  const debris = createDebrisFx({ scene: options.scene, rng: options.rng });
  const ground = options.ground;
  const pecked = new WeakSet<AttackInstance>();
  const air = new Map<number, { onGround: boolean; vy: number }>();

  const spray = (pieces: readonly CutPiece[], dirX: number): void => {
    let budget = T.debris.maxPerEvent;
    for (const p of pieces) {
      const n = Math.min(T.debris.perCut, budget);
      if (n <= 0) break;
      debris.emit(p.x, p.y, p.z, n, p.color, dirX);
      budget -= n;
    }
  };

  const peck = (e: Entity, time: number): void => {
    const a = e.attack;
    if (!a || pecked.has(a)) return;
    const box = attackHitbox(a, e.body, e.facing);
    if (!box) return;
    const cx = box.x + box.w / 2;
    const g = ground(cx);
    const reach = { x: box.x, y: box.y - T.cut.reachDown, w: box.w, h: box.h + T.cut.reachDown };
    pecked.add(a);
    if (reach.y > g + 0.6 || reach.y + reach.h < g - 0.3) return; // 空中啄击：够不到草。
    field.add(cx, g + 0.3, T.peck, time, { dirX: e.facing });
    spray(cutter.cut({ x: reach.x, y: Math.min(reach.y, g - 0.3), w: reach.w, h: reach.y + reach.h - Math.min(reach.y, g - 0.3) }, T.cut.peckChance, time), e.facing);
  };

  const burst = (x: number, y: number, time: number): void => {
    const g = ground(x);
    if (Math.abs(y - g) > GROUND_CONTACT) return;
    field.add(x, g + 0.2, T.orbBurst, time, { radial: true });
    const r = T.cut.burstRadius;
    spray(cutter.cut({ x: x - r, y: g - 0.5, w: 2 * r, h: 1.2 }, T.cut.burstChance, time), 0);
  };

  return {
    field,
    cutter,
    debris,
    handleEvents(events, time) {
      // 任务 018：所有投射物（光球/水弹/鱼/敌弹）落地爆压；到期、入水、被吞不压草。
      for (const ev of events) if (ev.type === 'projectileImpact' && (ev.reason === 'terrain' || ev.reason === 'hit')) burst(ev.x, ev.y, time);
    },
    update(entities, time, dt, wind) {
      if (!Number.isFinite(time) || !(dt >= 0)) throw new Error(`grass-interaction: invalid time ${time} / dt ${dt}`);
      for (const e of entities) {
        if (e.removed) continue;
        const b = e.body;
        if (e.projectile) {
          const h = b.y - ground(b.x);
          if (h >= -0.5 && h < T.orbWakeHeight) field.hold(`orb:${e.id}`, b.x, ground(b.x) + 0.2, T.orbWake, time, { radial: true, gain: Math.min(1, Math.max(0, 1 - h / T.orbWakeHeight)) });
          continue;
        }
        if (e.kind !== 'pelican') continue;
        peck(e, time);
        const prev = air.get(e.id);
        if (prev && !prev.onGround && b.onGround) {
          const speed = -prev.vy;
          if (speed >= T.landingMinSpeed) {
            const gain = Math.min(1, (speed - T.landingMinSpeed) / (T.landingFullSpeed - T.landingMinSpeed) * 0.7 + 0.3);
            field.add(b.x, b.y + 0.2, T.landing, time, { radial: true, gain });
            for (let k = 0; k < T.debris.landingBurst; k++) debris.emit(b.x + (k - T.debris.landingBurst / 2) * 0.15, b.y + 0.15, null, 1, 0x86bd50, 0);
          }
        }
        air.set(e.id, { onGround: b.onGround, vy: b.vy });
        const ride = e.pelican?.ride;
        if (ride && ride.mode === 'riding' && b.onGround && Math.abs(b.vx) >= T.rideMinSpeed) {
          field.hold(`ride:${e.id}`, b.x, b.y + 0.2, T.ride, time, { dirX: b.vx > 0 ? 1 : -1, gain: Math.min(1, Math.abs(b.vx) / 8) });
        } else if (b.onGround && Math.abs(b.vx) >= T.walkMinSpeed) {
          field.hold(`walk:${e.id}`, b.x, b.y + 0.2, T.walk, time, { dirX: b.vx > 0 ? 1 : -1, gain: Math.min(1, Math.abs(b.vx) / 6) });
        }
      }
      field.update(time);
      cutter.update(time);
      debris.update(dt, ground, wind);
    },
    dispose() {
      debris.dispose();
    },
  };
}
