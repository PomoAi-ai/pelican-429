import * as THREE from 'three';
import type { LumaAction } from '../../config/luma.ts';
import { PHOTON_ULTIMATE } from '../../config/photon-ultimate.ts';
import { TUNING } from '../../config/tuning.ts';
import type { SimEvent } from '../../core/game-events.ts';
import { lerp } from '../../core/math.ts';
import type { Entity } from '../../entities/entity.ts';
import { animateLuma } from './luma-animator.ts';
import { createLumaRig } from './luma-rig.ts';
import { createLumaTrail } from './luma-trail.ts';
import { createLumaUltimate } from './luma-ultimate.ts';

export interface LumaCompanion {
  handleEvents(events: readonly SimEvent[]): void;
  update(player: Entity, alpha: number, dt: number, photonActive: boolean): void;
  dispose(): void;
}

/** 在玩家周围游弋，角色资产与展示场共用。 */
export function createLumaCompanion(scene: THREE.Scene, player: Entity): LumaCompanion {
  const chargeSeconds = PHOTON_ULTIMATE.chargeTicks * TUNING.sim.step;
  const rig = createLumaRig();
  const trail = createLumaTrail(scene);
  const ultimate = createLumaUltimate(scene);
  const emitter = new THREE.Vector3();
  const scale = 1.3;
  rig.root.scale.setScalar(scale);
  rig.root.position.set(player.body.x + player.facing * 1.7, player.body.y + player.body.height * 0.8, 0.25);
  scene.add(rig.root);
  let action: LumaAction = 'idle';
  let time = 0;
  let playerX = player.body.x;
  let playerY = player.body.y;
  let lead = player.facing * 1.7;
  let roam = 1;
  let ultimateTime = Infinity;
  let ultimateX = 0;
  let ultimateY = 0;
  animateLuma(rig, action, time);

  return {
    handleEvents(events) {
      for (const event of events) {
        if (event.type === 'photonUltimateStarted') {
          if (event.id !== player.id) continue;
          ultimate.start(event.x, event.y);
          ultimateTime = 0;
          ultimateX = event.x;
          ultimateY = event.y;
          rig.root.position.set(event.x, event.y - 0.9, rig.root.position.z);
          trail.reset();
        } else if (event.type === 'photonUltimateBurst') {
          if (event.id !== player.id) continue;
          ultimate.burst(event.x, event.y, event.radius);
          ultimateTime = chargeSeconds;
          ultimateX = event.x;
          ultimateY = event.y;
          rig.root.position.set(event.x, event.y, rig.root.position.z);
          trail.reset();
        }
      }
    },
    update(player, alpha, dt, photonActive) {
      // 死亡或传送可在动画停顿期间取消技能，以模拟状态为准及时清除旧位置的演出。
      if (!photonActive && ultimateTime !== Infinity) {
        ultimate.reset();
        ultimateTime = Infinity;
        trail.reset();
        action = 'idle';
        animateLuma(rig, action, time);
      }
      // 与实体动画使用同一时钟，设置暂停和打击停顿时连跟随位置一起冻结。
      if (dt === 0) return;
      const body = player.body;
      const human = player.pelican!.form === 'human';
      time += dt;
      ultimateTime += dt;
      const moving = Math.abs(body.vx) > 0.2 || Math.abs(body.vy) > 0.2;
      lead += ((moving ? player.facing * 1.4 : 0) - lead) * (1 - Math.exp(-dt * 4));
      roam += ((moving ? 0 : 1) - roam) * (1 - Math.exp(-dt * (moving ? 4 : 0.8)));
      // 行进时收拢到身边，停下后逐渐恢复原有游弋范围，保持轨迹连续。
      const offsetX = lead + lerp(0.35, human ? 1.8 : 5, roam) * Math.sin(time * 0.36) + lerp(0.1, human ? 0.4 : 1, roam) * Math.sin(time * 0.73);
      const offsetY = body.height + 0.6 + lerp(0.2, human ? 0.5 : 2.35, roam) * (1 + Math.sin(time * 0.49));
      if (photonActive && ultimateTime < chargeSeconds) {
        ultimateX = lerp(body.prevX, body.x, alpha);
        ultimateY = lerp(body.prevY, body.y, alpha) + body.height + 1.2;
      }
      const x = photonActive ? ultimateX : lerp(body.prevX, body.x, alpha) + offsetX;
      const rise = THREE.MathUtils.smoothstep(ultimateTime, 0, chargeSeconds);
      const y = photonActive ? ultimateY - 0.9 * (1 - rise) : lerp(body.prevY, body.y, alpha) + offsetY;
      const z = 0.7 + lerp(0.15, 0.65, roam) * Math.sin(time * 0.43);
      const dx = x - rig.root.position.x;
      const dy = y - rig.root.position.y;
      // 只用玩家自身位移识别传送，大范围游弋不能触发瞬移或清空尾迹。
      const teleported = (body.x - playerX) ** 2 + (body.y - playerY) ** 2 > 64;
      playerX = body.x;
      playerY = body.y;
      const blend = teleported || photonActive ? 1 : 1 - Math.exp(-dt * (moving ? 6 : 1.4));
      if (teleported) trail.reset();
      rig.root.position.x += dx * blend;
      // 以玩家脚下高度为下界，跳跃或抬升时不会拖到脚下。
      rig.root.position.y = photonActive ? y : Math.max(body.y + 0.85, rig.root.position.y + dy * blend);
      rig.root.position.z += (z - rig.root.position.z) * blend;
      const turn = 1 - Math.exp(-dt * 3);
      const speedX = teleported ? 0 : dx * blend / dt;
      rig.root.rotation.y += (Math.tanh(speedX * 0.25) * 0.7 + Math.sin(time * 0.43) * 0.2 - rig.root.rotation.y) * turn;
      rig.root.rotation.z += (-Math.tanh(speedX * 0.2) * 0.2 - rig.root.rotation.z) * turn;
      action = photonActive ? 'ultimate' : moving ? 'guide' : 'idle';
      animateLuma(rig, action, action === 'ultimate' ? ultimateTime : time);
      rig.motion.getWorldPosition(emitter);
      ultimate.update(dt, emitter);
      trail.update(emitter, dt);
    },
    dispose() {
      trail.dispose();
      ultimate.dispose();
      rig.dispose();
    },
  };
}
