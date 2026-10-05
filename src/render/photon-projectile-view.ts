import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EntityViewFactory } from './view-registry.ts';
import { lerp } from '../core/math.ts';
import { createParticleCloud } from './grassy/grassy-particles.ts';

export type PhotonShape = 'bug' | 'wheel';
export const PHOTON_COLORS = ['#68dfff', '#b293ff', '#ffdc80'] as const;

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const result = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  return result;
}

function sphere(x: number, y: number, z: number, sx: number, sy: number, sz: number): THREE.BufferGeometry {
  return new THREE.SphereGeometry(1, 12, 8).scale(sx, sy, sz).translate(x, y, z);
}

function rod(x: number, y: number, length: number, angle: number, radius = 0.032): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(radius, radius, length, 6).rotateZ(angle).translate(x, y, 0);
}

/** 漫游群与真实追踪弹共享同一组实体模型。 */
export function createPhotonModelKit() {
  const wheelParts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(0.49, 0.055, 8, 40), new THREE.TorusGeometry(0.42, 0.018, 5, 40), sphere(0, 0, 0, 0.11, 0.11, 0.10)];
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    wheelParts.push(rod(Math.cos(a) * 0.245, Math.sin(a) * 0.245, 0.40, a - Math.PI / 2, 0.022));
  }
  const wheel = merged(wheelParts);
  const shellParts: THREE.BufferGeometry[] = [sphere(0, 0, 0, 0.30, 0.23, 0.14)];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) shellParts.push(rod(side * (0.24 + i * 0.015), -0.14 + i * 0.13, 0.28, side * (0.7 + i * 0.3)));
    shellParts.push(rod(side * 0.17, 0.29, 0.26, -side * 0.45, 0.02), sphere(side * 0.23, 0.42, 0, 0.06, 0.06, 0.06));
  }
  const bug = merged(shellParts);
  const face = new THREE.BoxGeometry(0.33, 0.23, 0.08).translate(0, 0.02, 0.135);
  const eyes = merged([-1, 1].map(side => new THREE.BoxGeometry(0.035, 0.10, 0.035).translate(side * 0.085, 0.04, 0.19)));
  const wing = merged([-1, 1].map(side => sphere(side * 0.30, 0.10, -0.05, 0.25, 0.10, 0.018)));
  const colors = PHOTON_COLORS.map(color => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.2), toneMapped: false }));
  const white = new THREE.MeshBasicMaterial({ color: '#f4ffff', toneMapped: false });
  const dark = new THREE.MeshBasicMaterial({ color: '#233651' });
  const wingMaterial = new THREE.MeshBasicMaterial({ color: '#c9edff', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
  return {
    create(shape: PhotonShape, color: number) {
      const root = new THREE.Group();
      const spin = new THREE.Group();
      root.add(spin);
      spin.add(new THREE.Mesh(shape === 'wheel' ? wheel : bug, colors[color]!));
      if (shape === 'bug') spin.add(new THREE.Mesh(face, dark), new THREE.Mesh(eyes, white), new THREE.Mesh(wing, wingMaterial));
      return {
        root,
        animate(time: number) {
          spin.rotation.set(shape === 'wheel' ? Math.sin(time * 3.1) * 0.65 : Math.sin(time * 17) * 0.12,
            shape === 'wheel' ? Math.sin(time * 2.3) * 0.65 : Math.sin(time * 13) * 0.20,
            shape === 'wheel' ? time * 6 : Math.sin(time * 11) * 0.15);
        },
      };
    },
    dispose() {
      for (const geometry of [wheel, bug, face, eyes, wing]) geometry.dispose();
      for (const material of [...colors, white, dark, wingMaterial]) material.dispose();
    },
  };
}

/** 真实弹体的尾迹记录已走过的位置，转向时不会穿过目标或预演命中。 */
export function createPhotonProjectileViews() {
  const kit = createPhotonModelKit();
  const factory: EntityViewFactory = entity => {
    const shape = entity.kind === 'photonWheel' ? 'wheel' : 'bug';
    const color = shape === 'wheel' ? 2 : 0;
    const model = kit.create(shape, color);
    const group = new THREE.Group();
    const trail = createParticleCloud(36, PHOTON_COLORS[color]);
    const history = Array.from({ length: 36 }, () => new THREE.Vector3(entity.body.x, entity.body.y + entity.body.height / 2, 0.55));
    group.add(model.root, trail.points);
    let time = entity.id * 0.37;
    model.root.scale.setScalar(entity.projectile!.def.radius / (shape === 'wheel' ? 0.52 : 0.36));
    return {
      object: group,
      sync(e, alpha, dt) {
        const x = lerp(e.body.prevX, e.body.x, alpha);
        const y = lerp(e.body.prevY, e.body.y, alpha) + e.body.height / 2;
        model.root.position.set(x, y, 0.55);
        time += dt;
        model.animate(time);
        if (dt > 0) {
          for (let i = history.length - 1; i > 0; i--) history[i]!.copy(history[i - 1]!);
          history[0]!.set(x, y, 0.5);
        }
        for (let i = 0; i < history.length; i++) {
          const p = history[i]!;
          const fade = 1 - i / history.length;
          trail.positions.setXYZ(i, p.x, p.y, p.z);
          trail.sizes.setX(i, 0.18 * fade + 0.025);
          trail.alphas.setX(i, fade * 0.85);
        }
        trail.positions.needsUpdate = trail.sizes.needsUpdate = trail.alphas.needsUpdate = true;
      },
      dispose() {
        group.clear();
        trail.points.geometry.dispose();
        trail.points.material.dispose();
      },
    };
  };
  return { factories: { photonBug: factory, photonWheel: factory }, dispose: () => kit.dispose() };
}
