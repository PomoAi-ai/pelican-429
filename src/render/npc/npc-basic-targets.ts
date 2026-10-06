import * as THREE from 'three';
import { attackHitbox, startAttack } from '../../combat/attacks.ts';
import { SAM_BASIC_PULSE, samBasicPulseLaunch, tiboBasicAttack } from '../../combat/npc-basic-attack.ts';
import { npcAction, SAM_ROUTING_SOURCE } from '../../config/npc.ts';
import type { NpcKind } from '../../config/npc.ts';
import { TUNING } from '../../config/tuning.ts';
import { rectCenter, rectIntersection } from '../../core/math.ts';
import { createProjectileEntity } from '../../entities/projectile.ts';
import { createBody } from '../../physics/body.ts';
import { createParticleCloud } from '../grassy/grassy-particles.ts';
import { createImpacts } from '../grassy/grassy-projectiles.ts';
import { createProjectileViews } from '../projectile-views.ts';

const SAMPLE_STEP = 1 / 120;

function targetHeight(seconds: number, dodge: boolean): number {
  const jump = (seconds - .12) / .85;
  return dodge && jump > 0 && jump < 1 ? 2.85 * 4 * jump * (1 - jump) : 0;
}

/** 朝向与躲避改变时重算接触；暂停、倒放和重播只读取同一条确定的攻击轨迹。 */
function createStrike(kind: NpcKind, facing: -1 | 1, dodge: boolean) {
  const action = npcAction(kind, 'attack');
  const targetX = facing * (kind === 'sam' ? 4.2 : 1.8);
  const launch = samBasicPulseLaunch({ x: 0, y: 0 }, { x: targetX, y: 1.4 });
  const actor = createBody({ x: 0, y: 0, halfWidth: .5, height: 2.65 });
  const attack = startAttack(tiboBasicAttack(TUNING.sim.step));
  const life = SAM_BASIC_PULSE.lifeTicks * TUNING.sim.step;
  let hit: { time: number; x: number; y: number } | null = null;
  for (let step = 0; step * SAMPLE_STEP < (kind === 'sam' ? action.release + life : action.seconds); step++) {
    const seconds = step * SAMPLE_STEP;
    if (seconds < action.release) continue;
    const distance = (seconds - action.release) * SAM_BASIC_PULSE.speed;
    attack.elapsed = Math.floor(seconds / TUNING.sim.step);
    const radius = SAM_BASIC_PULSE.radius;
    const box = kind === 'sam'
      ? { x: launch.x + launch.dirX * distance - radius, y: launch.y + launch.dirY * distance - radius, w: radius * 2, h: radius * 2 }
      : attackHitbox(attack, actor, facing);
    if (!box) continue;
    const contact = rectIntersection(box, {
      x: targetX - TUNING.dummy.halfWidth, y: targetHeight(seconds, dodge),
      w: TUNING.dummy.halfWidth * 2, h: TUNING.dummy.height,
    });
    if (contact) {
      hit = { time: seconds, ...rectCenter(contact) };
      break;
    }
  }
  return { facing, dodge, targetX, launch, hit, life };
}

export function createNpcBasicTargets(parent: THREE.Group, kind: NpcKind) {
  const root = new THREE.Group();
  root.name = `${kind}-basic-attack-target-fx`;
  root.visible = false;
  parent.add(root);
  const impact = createImpacts(root, 1, kind === 'sam' ? '#a9f8ff' : '#8fffc1');
  const particles = createParticleCloud(24, kind === 'sam' ? '#64eaff' : '#ffd16b');
  root.add(particles.points);
  const projectileViews = kind === 'sam' ? createProjectileViews() : null;
  const pulse = createProjectileEntity(1, {
    ...samBasicPulseLaunch({ x: 0, y: 0 }, { x: 4.2, y: 1.4 }),
    ownerId: 0, team: 'enemy', def: SAM_BASIC_PULSE, level: 1, returned: false,
  });
  const pulseView = projectileViews ? projectileViews.factories.enemyShot!(pulse) : null;
  if (pulseView) root.add(pulseView.object);
  let strike = createStrike(kind, 1, false);

  return {
    root,
    sample(seconds: number, facing: -1 | 1, dodge: boolean) {
      if (strike.facing !== facing || strike.dodge !== dodge) strike = createStrike(kind, facing, dodge);
      const action = npcAction(kind, 'attack');
      const hit = strike.hit && seconds >= strike.hit.time ? strike.hit : null;
      const hitAge = hit ? seconds - hit.time : -1;
      const kick = hit ? Math.sin(Math.min(hitAge * 9, Math.PI)) * Math.exp(-hitAge * 3.5) * (kind === 'sam' ? .65 : 1) : 0;
      const distance = Math.max(0, seconds - action.release) * SAM_BASIC_PULSE.speed;
      const x = strike.launch.x + strike.launch.dirX * distance;
      const y = strike.launch.y + strike.launch.dirY * distance;
      const flying = seconds >= action.release && seconds < action.release + strike.life && !hit && y >= SAM_BASIC_PULSE.radius;
      if (pulseView) {
        pulse.body.x = pulse.body.prevX = x;
        pulse.body.y = pulse.body.prevY = y - SAM_BASIC_PULSE.radius;
        pulse.body.vx = strike.launch.dirX * SAM_BASIC_PULSE.speed;
        pulse.body.vy = strike.launch.dirY * SAM_BASIC_PULSE.speed;
        pulseView.sync(pulse, 1, 0);
        pulseView.object.position.z = SAM_ROUTING_SOURCE.z;
        pulseView.object.visible = flying;
      }
      for (let index = 0; index < particles.positions.count; index++) {
        if (kind === 'sam') {
          const back = .1 + index * .04;
          particles.positions.setXYZ(index, x - strike.launch.dirX * back, y - strike.launch.dirY * back, SAM_ROUTING_SOURCE.z);
          particles.sizes.setX(index, .14 - index * .004);
          particles.alphas.setX(index, flying && distance > back ? (1 - index / 24) * .75 : 0);
        } else {
          const age = THREE.MathUtils.clamp(hitAge / .42, 0, 1);
          const angle = index * 2.399963;
          const spread = .1 + age * (.45 + index % 4 * .13);
          particles.positions.setXYZ(index, (hit ? hit.x : 0) + Math.cos(angle) * spread,
            (hit ? hit.y : 0) + Math.sin(angle) * spread - age * age * .25, .62);
          particles.sizes.setX(index, .08 + index % 3 * .025);
          particles.alphas.setX(index, hitAge >= 0 && hitAge < .42 ? (1 - age) ** 2 : 0);
        }
      }
      particles.positions.needsUpdate = particles.sizes.needsUpdate = particles.alphas.needsUpdate = true;
      impact.set(0, hitAge / .42, hit ? hit.x : 0, hit ? hit.y : 0, .6, kind === 'sam' ? .75 : 1.1);
      impact.flush();
      return {
        x: strike.targetX + facing * kick * .3,
        y: targetHeight(seconds, dodge) + (hit ? Math.sin(Math.min(hitAge / .42, 1) * Math.PI) * .12 : 0),
        kick, flash: hit ? Math.exp(-hitAge * 18) : 0,
      };
    },
    dispose() {
      // 弹体使用游戏视图的资源池；粒子与冲击网格由 npc-targets 的遍历统一释放。
      if (pulseView) {
        pulseView.object.removeFromParent();
        pulseView.dispose();
      }
      projectileViews?.dispose();
    },
  };
}
