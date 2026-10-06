import * as THREE from 'three';
import { DRONE_PAYLOADS } from '../config/enemy-rules.ts';

/** 火雨跟随真实技能时间；伤害继续由落地载荷处理。 */
export function createThermiteStream() {
  const root = new THREE.Group();
  root.name = 'drone-thermite-stream';
  root.visible = false;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const coreMaterial = new THREE.MeshBasicMaterial({ color: '#fff4d2', side: THREE.DoubleSide, transparent: true, depthWrite: false, toneMapped: false });
  const haloMaterial = new THREE.MeshBasicMaterial({ color: '#ff961f', side: THREE.DoubleSide, transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const count = 96;
  const cores = new THREE.InstancedMesh(geometry, coreMaterial, count);
  const halos = new THREE.InstancedMesh(geometry, haloMaterial, count);
  for (const particles of [cores, halos]) {
    particles.frustumCulled = false;
    particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(particles);
  }
  const particle = new THREE.Object3D();
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) cores.setColorAt(i, tint.set(i % 4 === 0 ? '#ffab38' : '#fff4d2'));
  return {
    root,
    sync(height: number, elapsed: number, duration: number) {
      root.visible = true;
      const { gravity, speed } = DRONE_PAYLOADS.thermite;
      const fallTime = (Math.sqrt(speed * speed + 2 * gravity * height) - speed) / gravity;
      const fade = Math.min(1, (duration - elapsed) / .18);
      coreMaterial.opacity = fade;
      haloMaterial.opacity = fade * .3;
      for (let i = 0; i < count; i++) {
        const delay = i / count * fallTime;
        const age = (elapsed - delay) % fallTime;
        const distance = speed * age + gravity * age * age / 2;
        const spread = ((i * .61803398875) % 1) * 2 - 1;
        particle.position.set(spread * (.025 + distance * .11), -distance, .35 + (i % 5) * .008);
        particle.rotation.z = spread * .14;
        const length = .05 + .07 * age + (i % 4) * .018;
        particle.scale.set(elapsed < delay ? 0 : .012 + (i % 3) * .004, length, 1);
        particle.updateMatrix();
        cores.setMatrixAt(i, particle.matrix);
        particle.scale.x *= 4;
        particle.scale.y *= 1.3;
        particle.updateMatrix();
        halos.setMatrixAt(i, particle.matrix);
      }
      cores.instanceMatrix.needsUpdate = halos.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      root.removeFromParent();
      cores.dispose(); halos.dispose();
      geometry.dispose(); coreMaterial.dispose(); haloMaterial.dispose();
    },
  };
}
