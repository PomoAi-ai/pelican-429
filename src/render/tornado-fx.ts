import * as THREE from 'three';
import { TORNADO_RULES, tornadoSize } from '../world/tornado.ts';
import type { TornadoState } from '../world/tornado.ts';

/** 漏斗和碎叶只读取模拟时间，暂停时旋转与上升也一起停住。 */
export function createTornadoFx() {
  const root = new THREE.Group();
  root.name = 'tornado';
  root.visible = false;
  const { height, radius } = TORNADO_RULES;
  const funnelGeometry = new THREE.CylinderGeometry(radius, radius * 0.1, height, 32, 1, true);
  funnelGeometry.translate(0, height / 2, 0);
  const funnelMaterial = new THREE.MeshBasicMaterial({ color: '#667f90', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  root.add(new THREE.Mesh(funnelGeometry, funnelMaterial));

  const ribbons = new THREE.Group();
  root.add(ribbons);
  const ribbonMaterial = new THREE.MeshBasicMaterial({ color: '#bfd5df', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
  const ribbonGeometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  const segments = 144;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = t * Math.PI * 7;
    const r = radius * (0.1 + t * 0.9);
    const width = 0.06 + t * 0.26;
    for (const edge of [-1, 1]) positions.push(Math.cos(angle) * r, t * height + edge * width, Math.sin(angle) * r);
    if (i < segments) {
      const j = i * 2;
      indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
  }
  ribbonGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  ribbonGeometry.setIndex(indices);
  for (let i = 0; i < 3; i++) {
    const ribbon = new THREE.Mesh(ribbonGeometry, ribbonMaterial);
    ribbon.rotation.y = i * Math.PI * 2 / 3;
    ribbons.add(ribbon);
  }

  const debrisGeometry = new THREE.PlaneGeometry(1, 1);
  const debrisMaterial = new THREE.MeshBasicMaterial({ color: '#9aa570', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const debris = new THREE.InstancedMesh(debrisGeometry, debrisMaterial, 512);
  debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  debris.frustumCulled = false;
  root.add(debris);
  const transform = new THREE.Object3D();

  return {
    root,
    update(state: Readonly<TornadoState> | null) {
      root.visible = state !== null && state.power > 0;
      if (state === null) return;
      root.position.set(state.x, state.y, 0);
      root.scale.setScalar(tornadoSize(state.power));
      const spin = state.age * (0.65 + state.power * 0.65) + state.phase;
      ribbons.rotation.y = -spin * 5;
      debris.count = Math.round(64 + 88 * state.power);
      funnelMaterial.opacity = state.strength * (0.14 + state.power * 0.035);
      ribbonMaterial.opacity = state.strength * 0.5;
      debrisMaterial.opacity = state.strength * 0.9;
      for (let i = 0; i < debris.count; i++) {
        const t = (i * 0.61803398875 + spin * 0.19) % 1;
        const angle = i * 2.39996 - spin * (4 + (i % 5) * 0.3);
        // 近地碎叶从完整受力半径吸入，提示细漏斗之外同样有危险。
        const groundDebris = i % 4 === 0;
        const r = groundDebris ? radius * (1 - t * 0.9) : radius * (0.1 + t * 0.9) * (0.7 + (i % 4) * 0.1);
        transform.position.set(Math.cos(angle) * r, groundDebris ? 0.2 + t * 1.2 : t * height, Math.sin(angle) * r);
        transform.rotation.set(angle, angle * 0.7, angle * 1.3);
        transform.scale.set(0.12 + (i % 3) * 0.07, 0.08 + (i % 4) * 0.03, 1);
        transform.updateMatrix();
        debris.setMatrixAt(i, transform.matrix);
      }
      debris.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      root.removeFromParent();
      funnelGeometry.dispose();
      funnelMaterial.dispose();
      ribbonGeometry.dispose();
      ribbonMaterial.dispose();
      debrisGeometry.dispose();
      debrisMaterial.dispose();
      debris.dispose();
    },
  };
}
