import * as THREE from 'three';
import { createModelRoutingVolley, MODEL_ROUTING_MODELS, sampleModelRoutingVolley } from '../../combat/model-routing.ts';
import { npcAction } from '../../config/npc.ts';
import type { NpcAction, NpcKind } from '../../config/npc.ts';
import { TUNING } from '../../config/tuning.ts';
import { createDummyEntity } from '../../entities/entity.ts';
import { createDummyViewFactory } from '../entity-views.ts';
import { createParticleCloud } from '../grassy/grassy-particles.ts';
import { createImpacts } from '../grassy/grassy-projectiles.ts';
import { caption } from './npc-effects.ts';
import { createTokenMissiles } from './npc-token-missiles.ts';
import { createNpcBasicTargets } from './npc-basic-targets.ts';
import { createNpcUltimateTargets } from './npc-ultimate-targets.ts';

const HIT_OFFSETS = {
  skill1: [.28, .48, .68],
  skill2: [.32],
} as const;
const TRAIL_PARTICLES = 24;
const FLIGHT_SECONDS = .28;

function createRoutingBeams(parent: THREE.Group) {
  const beamGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
  beamGeometry.rotateZ(Math.PI / 2);
  const tipGeometry = new THREE.SphereGeometry(.065, 10, 8);
  const coreMaterial = new THREE.MeshBasicMaterial({ color: '#efffff', transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const beams = Array.from({ length: 6 }, (_, index) => {
    const model = MODEL_ROUTING_MODELS[index % MODEL_ROUTING_MODELS.length]!;
    const root = new THREE.Group();
    const core = new THREE.Mesh(beamGeometry, coreMaterial);
    core.scale.set(1.2, .025, .025);
    core.position.x = -.1;
    const sheath = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({ color: model.color, transparent: true, opacity: .5, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    sheath.scale.set(1.2, .065, .065);
    sheath.position.x = -.1;
    const halo = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({ color: model.color, transparent: true, opacity: .18, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(1.35, .13, .13);
    halo.position.x = -.175;
    const tip = new THREE.Mesh(tipGeometry, coreMaterial);
    tip.position.x = .435;
    root.add(core, sheath, halo, tip);
    parent.add(root);
    return { root, halo };
  });
  const modelLabels = MODEL_ROUTING_MODELS.map(model => caption(model.name, model.color, 3.5));
  parent.add(...modelLabels);
  const hide = (): void => {
    for (const beam of beams) beam.root.visible = false;
    for (const label of modelLabels) label.visible = false;
  };
  hide();
  return {
    hide,
    sample(state: ReturnType<typeof sampleModelRoutingVolley>, seconds: number, _facing: -1 | 1, trails: ReturnType<typeof createParticleCloud>[], impacts: ReturnType<typeof createImpacts>) {
      hide();
      const duration = npcAction('sam', 'skill1').seconds;
      const latestHits: Array<(typeof state.missiles)[number] | null> = [null, null];
      for (let index = 0; index < state.missiles.length; index++) {
        const missile = state.missiles[index]!;
        const visual = beams[index]!;
        visual.root.visible = missile.active;
        visual.root.position.set(missile.x, missile.y, missile.z);
        visual.root.rotation.set(0, 0, Math.atan2(missile.dirY, missile.dirX));
        visual.root.scale.x = THREE.MathUtils.clamp(missile.distance / .85, 0, 1);
        visual.halo.scale.y = visual.halo.scale.z = .13 + Math.sin(seconds * 40 + index) * .015;
        const trail = trails[missile.model]!;
        trail.points.material.uniforms.color!.value.set(MODEL_ROUTING_MODELS[missile.model]!.color);
        for (let particle = 0; particle < TRAIL_PARTICLES; particle++) {
          const slot = Math.floor(index / 2) * TRAIL_PARTICLES + particle;
          const distance = .55 + particle * .037;
          const jitter = Math.sin(seconds * 22 + particle) * particle * .002;
          trail.positions.setXYZ(slot, missile.x - missile.dirX * distance - missile.dirY * jitter, missile.y - missile.dirY * distance + missile.dirX * jitter, missile.z);
          trail.sizes.setX(slot, .15 - particle * .004);
          trail.alphas.setX(slot, missile.active && missile.distance > distance ? (1 - particle / TRAIL_PARTICLES) * .8 : 0);
        }
        const hit = missile.hit;
        impacts.set(index, hit ? hit.age / Math.min(.45, duration - hit.time) : -1, hit ? hit.x : missile.x, hit ? hit.y : missile.y, .65, 1.1);
        const latest = latestHits[missile.model];
        if (hit && hit.age < .9 && (!latest || hit.age < latest.hit!.age)) latestHits[missile.model] = missile;
      }
      for (let model = 0; model < latestHits.length; model++) {
        const latest = latestHits[model];
        if (!latest) continue;
        const hit = latest.hit!;
        const target = state.targets[hit.target]!;
        const label = modelLabels[model]!;
        label.visible = true;
        label.material.opacity = Math.min(1, (.9 - hit.age) / .25, THREE.MathUtils.clamp((duration - seconds) / .2, 0, 1));
        // 型号贴在受击目标胸腹，按型号分行，连续命中不闪换或飘离身体。
        label.position.set(target.x, target.y + 1.55 - model * .76, .8);
      }
      for (const trail of trails) trail.positions.needsUpdate = trail.sizes.needsUpdate = trail.alphas.needsUpdate = true;
      impacts.flush();
    },
  };
}

function routingVolley(facing: -1 | 1, targetDodge: boolean) {
  return createModelRoutingVolley(facing, [4.2, 6.2].map((distance, index) => ({
    box: { x: facing * distance - TUNING.dummy.halfWidth, y: 0, w: TUNING.dummy.halfWidth * 2, h: TUNING.dummy.height },
    dodge: index === 0 && targetDodge,
  })));
}

/** 复用游戏假人；所有击退与粒子按绝对时间取样，暂停和重播不会残留上一轮状态。 */
export function createNpcTargets(kind: NpcKind, showTargets: boolean) {
  const root = new THREE.Group();
  root.name = `${kind}-skill-targets`;
  const fx = new THREE.Group();
  const color = kind === 'sam' ? '#64eaff' : '#ffc96d';
  const trails = [0, 1].map(() => createParticleCloud(3 * TRAIL_PARTICLES, color));
  const impacts = createImpacts(fx, 6, color);
  fx.add(...trails.map(trail => trail.points));
  const routingFx = kind === 'sam' ? createRoutingBeams(fx) : null;
  const tokenFx = kind === 'sam' ? createTokenMissiles(fx) : null;
  const basicFx = createNpcBasicTargets(fx, kind);
  let ultimateFx: ReturnType<typeof createNpcUltimateTargets> | null = null;
  let volley = routingVolley(1, false);
  let previousFacing: -1 | 1 = 1;
  let previousDodge = false;
  root.add(fx);
  const makeDummy = createDummyViewFactory({ tuning: TUNING });
  const targets = [-1, 1].map((side, index) => {
    const entity = createDummyEntity(index + 1, { x: 0, y: 0 }, TUNING);
    const view = makeDummy(entity);
    const anchor = new THREE.Group();
    anchor.visible = showTargets;
    anchor.position.x = side * 2.9;
    anchor.add(view.object);
    root.add(anchor);
    return { side, entity, view, anchor };
  });
  root.visible = false;

  return {
    root,
    sample(action: NpcAction, seconds: number, facing: -1 | 1, targetDodge: boolean) {
      const skill = action === 'skill1' || action === 'skill2' || action === 'ultimate';
      root.visible = skill || action === 'attack';
      if (ultimateFx) ultimateFx.root.visible = action === 'ultimate';
      if (action === 'ultimate') {
        if (!ultimateFx) {
          ultimateFx = createNpcUltimateTargets(kind, showTargets);
          root.add(ultimateFx.root);
        }
        fx.visible = false;
        for (const target of targets) target.anchor.visible = false;
        ultimateFx.sample(seconds, facing, targetDodge);
        return;
      }
      basicFx.root.visible = action === 'attack';
      targets.forEach((target, index) => { target.anchor.visible = action === 'attack' ? index === 0 : showTargets; });
      if (action === 'attack') {
        fx.visible = true;
        routingFx?.hide();
        tokenFx?.hide();
        for (const trail of trails) trail.points.visible = false;
        for (let index = 0; index < 6; index++) impacts.set(index, -1, 0, 0, 0, 0);
        impacts.flush();
        const pose = basicFx.sample(seconds, facing, targetDodge);
        const target = targets[0]!;
        target.entity.health!.flashTicks = pose.flash * TUNING.combat.hitFlashTicks;
        target.view.sync(target.entity, 0, 0);
        target.anchor.position.set(pose.x, pose.y, 0);
        target.anchor.rotation.z = -facing * pose.kick * .24;
        return;
      }
      if (!skill) return;
      const definition = npcAction(kind, action);
      const active = seconds > 0 && seconds < definition.seconds;
      const offsets = HIT_OFFSETS[action];
      const strength = action === 'skill2' ? 1.15 : .75;
      const life = .42;
      const tokenAttack = kind === 'sam' && action === 'skill2';
      fx.visible = active;
      routingFx?.hide();
      tokenFx?.hide();
      for (const trail of trails) trail.points.visible = !tokenAttack;
      if (action === 'skill1' && routingFx) {
        if (previousFacing !== facing || previousDodge !== targetDodge) {
          volley = routingVolley(facing, targetDodge);
          previousFacing = facing;
          previousDodge = targetDodge;
        }
        const state = sampleModelRoutingVolley(volley, seconds);
        targets.forEach((target, index) => {
          let kick = 0, flash = 0;
          for (const missile of state.missiles) {
            if (!missile.hit || missile.hit.target !== index) continue;
            const age = missile.hit.age;
            kick += Math.sin(Math.min(age * 9, Math.PI)) * Math.exp(-age * 3.5) * .75;
            flash = Math.max(flash, Math.exp(-age * 18));
          }
          const pose = state.targets[index]!;
          target.entity.health!.flashTicks = flash * TUNING.combat.hitFlashTicks;
          target.view.sync(target.entity, 0, 0);
          target.anchor.position.set(pose.x, pose.y, 0);
          target.anchor.rotation.z = -facing * kick * .2;
        });
        routingFx.sample(state, seconds, facing, trails, impacts);
        return;
      }
      const hitColor = kind === 'tibo' && action !== 'skill1' ? '#8fffc1' : color;

      for (let sideIndex = 0; sideIndex < targets.length; sideIndex++) {
        const target = targets[sideIndex]!;
        const trail = trails[sideIndex]!;
        trail.points.material.uniforms.color!.value.set(hitColor);
        const direction = facing;
        const distance = 3.2 + sideIndex * 2;
        const hits = (tokenAttack ? [0, 1, 2] : offsets).map((offset, round) => {
          const slot = sideIndex * 3 + round;
          return definition.release + (tokenAttack
            ? slot * .18 + .6 + slot % 3 * .05
            : offset + (action === 'skill1' ? sideIndex * .08 : 0));
        });
        let kick = 0, hop = 0, flash = 0;
        for (const hit of hits) {
          const age = seconds - hit;
          if (!active || age < 0) continue;
          kick += Math.sin(Math.min(age * 9, Math.PI)) * Math.exp(-age * 3.5) * strength;
          hop += Math.sin(Math.min(age / .48, 1) * Math.PI) * .07;
          flash = Math.max(flash, Math.exp(-age * 18));
        }
        // 闪白交给共享视图；父节点承接确定性的受击姿态，不累计视图内部的阻尼。
        target.entity.health!.flashTicks = flash * TUNING.combat.hitFlashTicks;
        target.view.sync(target.entity, 0, 0);
        target.anchor.position.set(direction * (distance + kick * .3), hop, 0);
        target.anchor.rotation.z = -direction * kick * .26;

        for (let round = 0; round < 3; round++) {
          const slot = sideIndex * 3 + round;
          const used = active && round < hits.length;
          const hit = round < hits.length ? hits[round]! : definition.seconds;
          const hitAge = seconds - hit;
          const hitHeight = TUNING.dummy.height * .63;
          const targetX = tokenAttack ? direction * distance : target.anchor.position.x - Math.sin(target.anchor.rotation.z) * hitHeight;
          const targetY = tokenAttack ? hitHeight : target.anchor.position.y + Math.cos(target.anchor.rotation.z) * hitHeight;
          const targetZ = TUNING.dummy.halfWidth + .12;
          impacts.set(slot, used ? hitAge / life : -1, targetX, targetY, targetZ, strength * 1.3);
          if (tokenAttack && tokenFx) {
            const flight = .6 + slot % 3 * .05;
            tokenFx.sample(slot, { x: direction * .42, y: 1.65, z: .35 }, { x: targetX, y: targetY, z: targetZ }, (seconds - hit + flight) / flight, facing, hitAge);
            continue;
          }
          for (let particle = 0; particle < TRAIL_PARTICLES; particle++) {
            const index = round * TRAIL_PARTICLES + particle;
            const age = (seconds - hit + FLIGHT_SECONDS - particle * .004) / FLIGHT_SECONDS;
            const progress = THREE.MathUtils.clamp(age, 0, 1);
            trail.positions.setXYZ(index,
              THREE.MathUtils.lerp(direction * .42, targetX, progress),
              THREE.MathUtils.lerp(1.65, targetY, progress) + Math.sin(progress * Math.PI) * .23,
              THREE.MathUtils.lerp(.35, targetZ, progress) + Math.sin(progress * Math.PI) * .28);
            trail.sizes.setX(index, (particle === 0 ? .3 : .13 - particle * .003) * strength);
            trail.alphas.setX(index, used && age >= 0 && age < 1 ? 1 - particle / TRAIL_PARTICLES : 0);
          }
        }
        trail.positions.needsUpdate = trail.sizes.needsUpdate = trail.alphas.needsUpdate = true;
      }
      impacts.flush();
    },
    dispose() {
      ultimateFx?.dispose();
      basicFx.dispose();
      for (const target of targets) target.view.dispose();
      // 这里只释放本模块创建的效果资源，假人的几何与材质由其共享视图管理。
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      fx.traverse(node => {
        if (node instanceof THREE.InstancedMesh) node.dispose();
        if (node instanceof THREE.Mesh || node instanceof THREE.Points || node instanceof THREE.Sprite) {
          if (!(node instanceof THREE.Sprite)) geometries.add(node.geometry);
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        material.dispose();
      }
      for (const texture of textures) texture.dispose();
      root.removeFromParent();
      root.clear();
    },
  };
}
