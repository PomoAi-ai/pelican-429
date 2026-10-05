import * as THREE from 'three';
import type { Entity } from '../entities/entity.ts';
import { lerp } from '../core/math.ts';

/** 突进风刃跟随真实角色；羽毛残迹保留在角色走过的位置。 */
export function createWingDashFx(parent: THREE.Group) {
  const root = new THREE.Group();
  parent.add(root);
  const arc = new THREE.Group();
  root.add(arc);
  const vertices: number[] = [];
  for (let i = 0; i < 48; i++) {
    const a = -1.3 + i / 48 * 2.6;
    const b = -1.3 + (i + 1) / 48 * 2.6;
    const widthA = 0.23 * Math.sin((i + 1) / 50 * Math.PI);
    const widthB = 0.23 * Math.sin((i + 2) / 50 * Math.PI);
    const ax = Math.cos(a), ay = Math.sin(a), bx = Math.cos(b), by = Math.sin(b);
    vertices.push(ax * 1.65, ay * 1.65, 0, bx * 1.65, by * 1.65, 0, ax * (1.65 - widthA), ay * (1.65 - widthA), 0,
      ax * (1.65 - widthA), ay * (1.65 - widthA), 0, bx * 1.65, by * 1.65, 0, bx * (1.65 - widthB), by * (1.65 - widthB), 0);
  }
  const arcGeometry = new THREE.BufferGeometry();
  arcGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const arcMaterials = ['#ddffff', '#75edff', '#3dc4ee'].map((color, i) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 - i * 0.22, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const arcs = arcMaterials.map((material, i) => {
    const mesh = new THREE.Mesh(arcGeometry, material);
    mesh.scale.setScalar(1 + i * 0.17);
    mesh.position.x = -i * 0.4;
    arc.add(mesh);
    return mesh;
  });
  const featherShape = new THREE.Shape().moveTo(0, -0.35).quadraticCurveTo(0.22, -0.05, 0, 0.4).quadraticCurveTo(-0.17, 0.05, 0, -0.35);
  const featherGeometry = new THREE.ShapeGeometry(featherShape);
  const featherMaterial = new THREE.MeshBasicMaterial({ color: '#f0ffff', side: THREE.DoubleSide, transparent: true, opacity: 0.86, depthWrite: false, toneMapped: false });
  const feathers = new THREE.InstancedMesh(featherGeometry, featherMaterial, 36);
  feathers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  feathers.frustumCulled = false;
  root.add(feathers);
  const slots = Array.from({ length: 36 }, () => ({ age: 2, x: 0, y: 0, angle: 0, side: 1 }));
  const transform = new THREE.Object3D();
  let cursor = 0;
  let clock = 0;
  let emit = 0;
  return {
    update(entities: readonly Entity[], alpha: number, dt: number) {
      clock += dt;
      const player = entities.find(e => e.pelican && e.pelican.weapon.dashTicks > 0 && !e.removed);
      arc.visible = player !== undefined;
      if (player) {
        const side = player.pelican!.weapon.dashSide;
        const x = lerp(player.body.prevX, player.body.x, alpha);
        const y = lerp(player.body.prevY, player.body.y, alpha) + player.body.height * 0.55;
        arc.position.set(x + side * 0.3, y, 0.7);
        arc.scale.x = side;
        for (let i = 0; i < arcs.length; i++) arcs[i]!.rotation.z = Math.sin(clock * 32 + i) * 0.10;
        emit += dt * 85;
        while (emit >= 1) {
          emit--;
          const feather = slots[cursor % slots.length]!;
          feather.age = 0;
          feather.x = x - side * 0.6;
          feather.y = y + Math.sin(cursor * 2.4) * 1.1;
          feather.angle = cursor * 2.4;
          feather.side = side;
          cursor++;
        }
      } else emit = 0;
      for (let i = 0; i < slots.length; i++) {
        const feather = slots[i]!;
        feather.age += dt;
        const t = feather.age / 0.65;
        transform.position.set(feather.x - feather.side * feather.age * 1.6, feather.y + Math.sin(t * 3 + i) * 0.18 - t * 0.25, 0.45);
        transform.rotation.set(0, Math.sin(clock * 5 + i) * 0.5, feather.angle + feather.age * 4);
        transform.scale.setScalar(t < 1 ? 0.65 * (1 - t) : 0);
        transform.updateMatrix();
        feathers.setMatrixAt(i, transform.matrix);
      }
      feathers.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      root.removeFromParent(); arcGeometry.dispose(); featherGeometry.dispose(); featherMaterial.dispose();
      for (const material of arcMaterials) material.dispose();
    },
  };
}
