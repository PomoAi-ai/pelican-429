import * as THREE from 'three';
import { lerp } from '../../core/math.ts';
import type { EntityViewFactory } from '../view-registry.ts';
import { PROJECTILE_Z } from '../projectile-views.ts';
import { createCodeBolt, createMechanicalBugs } from './grassy-projectiles.ts';

/** 实体生命周期与弹道属于模拟；这里只复用角色资料中的代码弹与机械虫造型。 */
export function createGrassyProjectileViews() {
  const slots: Array<{ kind: string; root: THREE.Group; active: boolean; update(time: number): void }> = [];
  const origin = new THREE.Vector3();
  const forward = new THREE.Vector3(0, 0, 1);
  const direction = new THREE.Vector3();
  const factory: EntityViewFactory = (entity) => {
    let slot = slots.find((item) => !item.active && item.kind === entity.kind);
    if (!slot) {
      const root = new THREE.Group();
      root.name = `grassy-${entity.kind}`;
      if (entity.kind === 'codexShot') {
        const bolt = createCodeBolt();
        root.add(bolt.body);
        slot = { kind: entity.kind, root, active: false, update(time) { bolt.update(time, Math.min(2.8, time * 20)); } };
      } else {
        const bugs = createMechanicalBugs(root, 1);
        const exhaust = new THREE.Group();
        exhaust.name = 'bug-missile-exhaust';
        exhaust.position.z = -0.28;
        const sheath = new THREE.Mesh(
          new THREE.ConeGeometry(0.14, 0.90, 12).rotateX(-Math.PI / 2).translate(0, 0, -0.45),
          new THREE.MeshBasicMaterial({ color: '#a3ed44', transparent: true, opacity: 0.48, depthWrite: false, toneMapped: false }),
        );
        const core = new THREE.Mesh(
          new THREE.ConeGeometry(0.065, 0.56, 10).rotateX(-Math.PI / 2).translate(0, 0, -0.28),
          new THREE.MeshBasicMaterial({ color: '#efffd2', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
        );
        exhaust.add(sheath, core);
        root.add(exhaust);
        slot = { kind: entity.kind, root, active: false, update(time) {
          bugs.set(0, origin, 0.5, time, 0.85);
          bugs.flush();
          exhaust.scale.set(1, 1, 0.9 + Math.sin(time * 47) * 0.12);
        } };
      }
      slots.push(slot);
    }
    const current = slot;
    current.active = true;
    let time = 0;
    return {
      object: current.root,
      sync(e, alpha, dt) {
        time += dt;
        const b = e.body;
        current.root.position.set(lerp(b.prevX, b.x, alpha), lerp(b.prevY, b.y, alpha) + b.height / 2, PROJECTILE_Z + 0.25);
        direction.set(b.vx, b.vy, 0).normalize();
        current.root.quaternion.setFromUnitVectors(forward, direction);
        current.update(time);
      },
      dispose() { current.active = false; },
    };
  };
  return {
    factory,
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      for (const { root } of slots) root.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Points) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        }
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      slots.length = 0;
    },
  };
}
