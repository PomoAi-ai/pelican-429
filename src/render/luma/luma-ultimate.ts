import * as THREE from 'three';
import { PHOTON_ULTIMATE } from '../../config/photon-ultimate.ts';
import { TUNING } from '../../config/tuning.ts';
import { createParticleCloud } from '../grassy/grassy-particles.ts';
import { createLumaBurst } from './luma-burst.ts';

const CHARGE_SECONDS = PHOTON_ULTIMATE.chargeTicks * TUNING.sim.step;
const ACTIVE_SECONDS = PHOTON_ULTIMATE.activeTicks * TUNING.sim.step;
const STAR_COUNT = 24;

export interface LumaUltimate {
  start(x: number, y: number): void;
  burst(x: number, y: number, radius: number): void;
  update(dt: number, emitter: THREE.Vector3): void;
  reset(): void;
  dispose(): void;
}

/** 保留光子本体聚光与释放闪光，虫群和光轮全部由真实弹体驱动。 */
export function createLumaUltimate(scene: THREE.Object3D): LumaUltimate {
  const root = new THREE.Group();
  root.name = 'luma-photon-burst';
  scene.add(root);
  const stars = createParticleCloud(STAR_COUNT, '#c2e9ff');
  root.add(stars.points);
  // 本体光效跟随宠物，释放星屑留在出弹点。
  const core = new THREE.Group();
  root.add(core);
  const burst = createLumaBurst();
  core.add(burst);
  let phase: 'hidden' | 'charge' | 'swarm' = 'hidden';
  let age = 0;
  let radius: number = PHOTON_ULTIMATE.radius;

  function apply(): void {
    root.visible = phase !== 'hidden';
    const swarming = phase === 'swarm';
    const fade = swarming ? 1 - THREE.MathUtils.smoothstep(age, 0.25, 1.2) : 1;
    for (let i = 0; i < STAR_COUNT; i++) {
      const a = i * 2.399963 + age * 0.4;
      const reach = swarming ? Math.min(radius * 0.18, 0.4 + age * 2) * ((i % 13) / 13) : (1 - Math.min(1, age / CHARGE_SECONDS)) * (1 + i % 5 * 0.35);
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
      stars.points.geometry.dispose(); stars.points.material.dispose();
      burst.geometry.dispose(); burst.material.dispose();
    },
  };
}
