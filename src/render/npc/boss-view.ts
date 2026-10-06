import * as THREE from 'three';
import { BOSS_REBATE, BOSS_RULES } from '../../config/boss-rules.ts';
import { npcAction } from '../../config/npc.ts';
import { TUNING } from '../../config/tuning.ts';
import { lerp } from '../../core/math.ts';
import type { Entity } from '../../entities/entity.ts';
import type { EntityView } from '../view-registry.ts';
import { animateNpc } from './npc-animator.ts';
import { createNpcRig } from './npc-rig.ts';
import { createTeleportEffect } from '../teleport-effect.ts';

/** Boss 与展示场共享模型和动作；实战时间倍率同时驱动姿态与原动作特效。 */
export function createBossView(entity: Entity, windAt: (x: number, y: number) => number): EntityView {
  const rig = createNpcRig(entity.boss!.kind, 'monster');
  const root = new THREE.Group();
  root.add(rig.root);
  const teleport = createTeleportEffect([rig.root]);
  const object = new THREE.Group();
  object.add(root, teleport.root);
  const color = entity.boss!.kind === 'tibo' ? '#7fffb6' : '#67e7ff';
  const warningGeometry = new THREE.PlaneGeometry(1, 1);
  const warningMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .2, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const warning = new THREE.Mesh(warningGeometry, warningMaterial);
  const outlineGeometry = new THREE.EdgesGeometry(warningGeometry);
  const outlineMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: .9, depthWrite: false, toneMapped: false });
  warning.add(new THREE.LineSegments(outlineGeometry, outlineMaterial));
  root.add(warning);
  const armorGeometry = new THREE.TorusGeometry(1, .035, 6, 32);
  const armorMaterial = new THREE.MeshBasicMaterial({ color: '#ffc45a', transparent: true, opacity: .85, depthWrite: false, toneMapped: false });
  const armor = new THREE.Mesh(armorGeometry, armorMaterial);
  armor.position.set(0, entity.body.height / 2, .6);
  armor.scale.set(.9, entity.body.height * .55, 1);
  root.add(armor);
  return {
    object,
    sync(e, alpha, frameDt) {
      const boss = e.boss!;
      root.position.set(lerp(e.body.prevX, e.body.x, alpha), lerp(e.body.prevY, e.body.y, alpha), 0);
      const seconds = Math.max(0, boss.actionTicks - 1 + alpha) * TUNING.sim.step * boss.actionRate;
      animateNpc(rig, boss.action, seconds, frameDt, e.facing, { flying: boss.flying && !e.body.onGround, vx: e.body.vx, vy: e.body.vy }, e.facing, windAt(e.body.x, e.body.y + e.body.height));
      rig.effects.root.rotation.y = -rig.root.rotation.y;
      const blink = boss.blink;
      teleport.update(e.teleport, alpha, TUNING.sim.step, e.body.height, e.body.halfWidth);
      const hit = e.health!.flashTicks > 0;
      armor.visible = hit || (e.teleport === undefined && (e.armored === true || boss.healing));
      armorMaterial.color.set(hit ? '#ffffff' : blink !== null ? color : boss.healing ? '#78ffc9' : '#ffc45a');
      armorMaterial.opacity = hit ? 1 : .55 + .3 * Math.sin(blink !== null ? blink.ticks * .6 : seconds * 14);
      warning.visible = false;
      if (boss.action === 'ultimate' || (boss.kind === 'tibo' && boss.action === 'skill2')) {
        const rules = BOSS_RULES[boss.kind];
        const release = npcAction(boss.kind, boss.action).release;
        const impactDuration = 5 * TUNING.sim.step * boss.actionRate;
        const waves = boss.action === 'ultimate' ? rules.ultimateWaves : [{ ...BOSS_REBATE, delay: 0 }];
        const wave = waves.find((item) => seconds < release + item.delay + impactDuration) ?? waves[waves.length - 1]!;
        const age = seconds - release - wave.delay;
        const height = boss.action === 'ultimate' ? rules.ultimateHeight : BOSS_REBATE.height;
        warning.visible = age < impactDuration;
        warning.position.set(0, height / 2 + .04, .65);
        warning.scale.set(wave.halfWidth * 2, height, 1);
        warningMaterial.opacity = age < 0 ? .1 + .07 * (1 + Math.sin(seconds * 16)) : .55;
      }
    },
    dispose() {
      teleport.dispose(); rig.dispose(); object.removeFromParent();
      warningGeometry.dispose(); outlineGeometry.dispose(); warningMaterial.dispose(); outlineMaterial.dispose();
      armorGeometry.dispose(); armorMaterial.dispose();
    },
  };
}
