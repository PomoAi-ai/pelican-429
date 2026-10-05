import * as THREE from 'three';
import { PHOTON_ULTIMATE } from '../../config/photon-ultimate.ts';
import { TUNING } from '../../config/tuning.ts';
import { createParticleCloud } from '../grassy/grassy-particles.ts';
import { createPhotonModelKit, PHOTON_COLORS } from '../photon-projectile-view.ts';
import { createLumaBurst } from './luma-burst.ts';

const CHARGE_SECONDS = PHOTON_ULTIMATE.chargeTicks * TUNING.sim.step;
const ACTIVE_SECONDS = PHOTON_ULTIMATE.activeTicks * TUNING.sim.step;
const SWARM_COUNT = 42;
const TAIL_POINTS = 32;
const STAR_COUNT = 48;

export interface LumaUltimate {
  start(x: number, y: number): void;
  burst(x: number, y: number, radius: number): void;
  update(dt: number, emitter: THREE.Vector3): void;
  reset(): void;
  dispose(): void;
}

/** 漫游群只负责空中演出，真正追击目标的同型弹体由模拟实体驱动。 */
export function createLumaUltimate(scene: THREE.Scene): LumaUltimate {
  const root = new THREE.Group();
  root.name = 'luma-photon-swarm';
  scene.add(root);
  const kit = createPhotonModelKit();
  const models = Array.from({ length: SWARM_COUNT }, (_, i) => {
    const model = kit.create(i % 2 ? 'wheel' : 'bug', i % 3);
    root.add(model.root);
    return model;
  });
  const trails = PHOTON_COLORS.map(color => createParticleCloud(SWARM_COUNT / 3 * TAIL_POINTS, color));
  for (const trail of trails) root.add(trail.points);
  const stars = createParticleCloud(STAR_COUNT, '#c2e9ff');
  root.add(stars.points);
  // 本体光效跟随宠物；漫游群仍以技能释放点为原点，避免跟随位移拖动整个攻击画面。
  const core = new THREE.Group();
  root.add(core);
  const burst = createLumaBurst();
  core.add(burst);
  const point = new THREE.Vector3();
  let phase: 'hidden' | 'charge' | 'swarm' = 'hidden';
  let age = 0;
  let radius: number = PHOTON_ULTIMATE.radius;

  function path(index: number, time: number, out: THREE.Vector3): void {
    const seed = index * 2.399963;
    const release = (index % 7) * 0.035;
    const grow = THREE.MathUtils.smoothstep(time - release, 0, 0.62);
    const angle = seed + time * (index % 2 ? 0.82 : -0.67);
    const reach = radius * (0.32 + (index % 9) / 13);
    out.set(
      (Math.sin(angle) * reach + Math.sin(time * 2.6 + seed) * 0.8) * grow,
      (1.6 + Math.cos(angle * 0.77) * 2.6 + Math.sin(time * 1.8 + seed) * 1.2) * grow,
      0.55 + Math.sin(angle) * 0.5,
    );
  }

  function apply(): void {
    root.visible = phase !== 'hidden';
    const swarming = phase === 'swarm';
    const fade = swarming ? 1 - THREE.MathUtils.smoothstep(age, ACTIVE_SECONDS - 0.5, ACTIVE_SECONDS) : 1;
    for (let i = 0; i < models.length; i++) {
      const model = models[i]!;
      model.root.visible = swarming;
      if (!swarming) continue;
      path(i, age, model.root.position);
      const size = (i % 7 === 0 ? 1.45 : 0.65 + i % 4 * 0.13) * fade * THREE.MathUtils.smoothstep(age - i % 7 * 0.035, 0, 0.25);
      model.root.scale.setScalar(size);
      model.animate(age + i * 0.43);
      const trail = trails[i % 3]!;
      for (let j = 0; j < TAIL_POINTS; j++) {
        const id = Math.floor(i / 3) * TAIL_POINTS + j;
        const lag = j / (TAIL_POINTS - 1);
        path(i, Math.max(0, age - lag * 0.48), point);
        trail.positions.setXYZ(id, point.x, point.y, point.z - 0.05);
        trail.sizes.setX(id, (0.16 - lag * 0.12) * size);
        trail.alphas.setX(id, (1 - lag) * 0.7 * fade);
      }
    }
    for (const trail of trails) {
      trail.points.visible = swarming;
      trail.positions.needsUpdate = trail.sizes.needsUpdate = trail.alphas.needsUpdate = true;
    }
    for (let i = 0; i < STAR_COUNT; i++) {
      const a = i * 2.399963 + age * 0.4;
      const reach = swarming ? radius * ((i % 13) / 13) : (1 - Math.min(1, age / CHARGE_SECONDS)) * (1 + i % 5 * 0.35);
      stars.positions.setXYZ(i, Math.cos(a) * reach, Math.sin(a * 1.3) * reach * 0.45 + (swarming ? 1.2 : 0), 0.6);
      stars.sizes.setX(i, i % 9 === 0 ? 0.13 : 0.045);
      stars.alphas.setX(i, (0.12 + 0.3 * Math.sin(age * 5 + i) ** 2) * fade);
    }
    stars.positions.needsUpdate = stars.sizes.needsUpdate = stars.alphas.needsUpdate = true;
    burst.visible = !swarming || age < 0.6;
    burst.material.uniforms.time!.value = age;
    burst.material.uniforms.charge!.value = Math.min(1, age / CHARGE_SECONDS);
    burst.material.uniforms.released!.value = swarming;
  }
  apply();
  return {
    start(x, y) { phase = 'charge'; age = 0; root.position.set(x, y, 0); apply(); },
    burst(x, y, attackRadius) { phase = 'swarm'; age = 0; radius = attackRadius; root.position.set(x, y, 0); apply(); },
    update(dt, emitter) {
      if (phase === 'hidden' || dt === 0) return;
      if (phase === 'charge') root.position.set(emitter.x, emitter.y, 0);
      core.position.copy(emitter).sub(root.position);
      age += dt;
      if (phase === 'charge' && age >= CHARGE_SECONDS + 0.35) phase = 'hidden';
      if (phase === 'swarm' && age >= ACTIVE_SECONDS) phase = 'hidden';
      apply();
    },
    reset() { phase = 'hidden'; age = 0; apply(); },
    dispose() {
      root.removeFromParent();
      kit.dispose();
      for (const cloud of [...trails, stars]) { cloud.points.geometry.dispose(); cloud.points.material.dispose(); }
      burst.geometry.dispose(); burst.material.dispose();
    },
  };
}
