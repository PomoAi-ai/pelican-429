import * as THREE from 'three';
import { ENEMY_RULES } from '../config/enemy-rules.ts';
import type { EnemyKind } from '../config/enemy-rules.ts';
import { TUNING } from '../config/tuning.ts';
import { clamp, lerp } from '../core/math.ts';
import { createEnemyRig } from './enemy-rig.ts';
import type { EnemyAction } from './enemy-rig.ts';
import type { EntityViewFactory } from './view-registry.ts';
import { terrainHeightAt } from '../physics/tile-collision.ts';
import type { TileQuery } from '../world/tile-map.ts';
import { createThermiteStream } from './drone-thermite-view.ts';

// GLB 的蓄力、命中、收招段已烘焙；分别缩放才能让动作与新版伤害时刻一致。
const CLIP_PHASE_TICKS: Readonly<Record<EnemyKind, readonly [readonly [number, number, number], readonly [number, number, number]]>> = {
  gatekeeper: [[42, 8, 48], [30, 14, 54]],
  lineHound: [[30, 32, 54], [36, 10, 54]],
  watchWasp: [[57, 1, 42], [72, 180, 1]],
  loadmaster: [[72, 12, 90], [54, 16, 72]],
};

export function createEnemyViewFactory(terrain: TileQuery): EntityViewFactory {
  return (entity) => {
    const kind = entity.enemy!.kind;
    const rig = createEnemyRig(kind, entity.enemy!.appearanceIndex);
    const root = new THREE.Group();
    root.name = `enemy-${kind}-${entity.id}`;
    const flightPivot = new THREE.Group();
    flightPivot.position.y = ENEMY_RULES[kind].height / 2;
    rig.root.position.y = -flightPivot.position.y;
    flightPivot.add(rig.root);
    root.add(flightPivot);
    const geometry = new THREE.PlaneGeometry(1.3, 0.09);
    const backMaterial = new THREE.MeshBasicMaterial({ color: '#172832', side: THREE.DoubleSide });
    const healthMaterial = new THREE.MeshBasicMaterial({ color: '#f3af60', side: THREE.DoubleSide, toneMapped: false });
    const healthBack = new THREE.Mesh(geometry, backMaterial);
    const healthFill = new THREE.Mesh(geometry, healthMaterial);
    healthBack.position.set(0, ENEMY_RULES[kind].height + 0.25, 0.5);
    healthFill.position.copy(healthBack.position); healthFill.position.z += 0.01;
    healthBack.scale.set(1.05, 1.6, 1);
    root.add(healthBack, healthFill);
    const thermiteStream = kind === 'watchWasp' ? createThermiteStream() : null;
    if (thermiteStream) root.add(thermiteStream.root);
    const lookTarget = new THREE.Vector3();
    let clock = 0;
    let hitTime = 0;
    let previousHitstun = 0;
    return {
      object: root,
      sync(e, alpha, frameDt) {
        clock += frameDt;
        root.position.set(lerp(e.body.prevX, e.body.x, alpha), lerp(e.body.prevY, e.body.y, alpha), 0);
        rig.root.rotation.y = e.facing === 1 ? 0 : Math.PI;
        if (kind === 'watchWasp') {
          // 世界坐标的倾斜独立于朝向翻转，左右移动都向前压低机头。
          const lean = -clamp(e.body.vx / ENEMY_RULES.watchWasp.speed, -1, 1) * .24;
          flightPivot.rotation.z = lerp(flightPivot.rotation.z, lean, 1 - Math.exp(-8 * frameDt));
        }
        const health = e.health!;
        if (health.hitstunTicks > previousHitstun) hitTime = 0;
        hitTime += frameDt; previousHitstun = health.hitstunTicks;
        let action: EnemyAction = health.hitstunTicks > 0 ? 'hit' : Math.abs(e.body.vx) > 0.1 ? 'move' : 'idle';
        let seconds = action === 'hit' ? Math.min(hitTime, rig.duration('hit')) : clock % rig.duration(action);
        let warning = 0;
        if (e.attack) {
          action = e.enemy!.skill === 0 ? 'skill1' : 'skill2';
          const def = e.attack.def;
          const ticks = Math.max(0, e.attack.elapsed - 1 + alpha);
          const [startup, active, recovery] = CLIP_PHASE_TICKS[kind][e.enemy!.skill!];
          const clipTicks = ticks < def.startup ? ticks / def.startup * startup
            : ticks < def.startup + def.active ? startup + (ticks - def.startup) / def.active * active
            : startup + active + (ticks - def.startup - def.active) / def.recovery * recovery;
          seconds = clipTicks / (startup + active + recovery) * rig.duration(action);
          warning = ticks < def.startup ? 0.5 + 0.5 * Math.sin(ticks * 0.6) : 0;
        }
        if (e.armored) warning = 1;
        const target = e.enemy!.lookTarget;
        if (target) {
          lookTarget.set(target.x, target.y, 0);
          root.parent!.localToWorld(lookTarget);
          rig.root.worldToLocal(lookTarget);
        }
        rig.pose(action, seconds, clamp(health.flashTicks / TUNING.combat.hitFlashTicks, 0, 1), warning, target ? lookTarget : null);
        // 追击投弹的落点会前移，用机体蓄力灯预警；危险范围由真实载荷落地后的火区显示。
        if (thermiteStream) {
          thermiteStream.root.visible = false;
          if (e.attack && e.enemy!.skill === 1 && e.attack.elapsed >= e.attack.def.startup && e.attack.elapsed < e.attack.def.startup + e.attack.def.active) {
            const ground = terrainHeightAt(terrain, e.body.x, e.body.y, terrain.height, true);
            if (ground !== null && root.position.y > ground) {
              const elapsed = Math.max(0, e.attack.elapsed - e.attack.def.startup - 1 + alpha) * TUNING.sim.step;
              // 喷口火花只贴近机体，不能画成通往正下方地面的虚假伤害束。
              thermiteStream.sync(Math.min(.8, root.position.y - ground), elapsed, e.attack.def.active * TUNING.sim.step);
            }
          }
        }
        const share = Math.max(0, health.hp / health.maxHp);
        healthFill.scale.x = share;
        healthFill.position.x = -(1 - share) * 0.65;
        healthBack.visible = healthFill.visible = share < 1;
      },
      dispose() { rig.dispose(); thermiteStream?.dispose(); root.removeFromParent(); geometry.dispose(); backMaterial.dispose(); healthMaterial.dispose(); },
    };
  };
}
