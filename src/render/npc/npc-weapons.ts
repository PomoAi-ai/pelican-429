import * as THREE from 'three';
import { npcAction, SAM_ROUTING_SOURCE } from '../../config/npc.ts';
import type { NpcAction, NpcKind } from '../../config/npc.ts';

const UP = new THREE.Vector3(0, 1, 0);
const UNIT = new THREE.Vector3(1, 1, 1);
const smooth = THREE.MathUtils.smoothstep;

function material(color: string, metalness: number, roughness: number, emissive = '#000000') {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity: .25 });
}

function mesh(parent: THREE.Group, geometry: THREE.BufferGeometry, surface: THREE.Material, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, surface);
  object.position.set(x, y, z);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function createRouterCore() {
  const root = new THREE.Group();
  const steel = material('#273b47', .78, .34);
  const cyan = material('#9eeeff', .25, .25, '#38d8ff');
  const gold = material('#ddb465', .72, .28, '#a46617');
  const grip = material('#17232b', .1, .8);
  mesh(root, new THREE.CylinderGeometry(.04, .05, .96, 12), steel, 0, .13);
  mesh(root, new THREE.CylinderGeometry(.062, .062, .24, 12), grip);
  for (const y of [-.13, .13, -.35]) mesh(root, new THREE.CylinderGeometry(.066, .066, .035, 12), gold, 0, y);
  const head = new THREE.Group();
  head.position.y = .64;
  head.scale.setScalar(.6);
  root.add(head);
  const crystal = mesh(head, new THREE.OctahedronGeometry(.24), cyan);
  crystal.scale.set(.8, 1.25, .8);
  const inner = mesh(head, new THREE.OctahedronGeometry(.09), material('#edffff', .1, .18, '#b6f8ff'));
  const satellites = Array.from({ length: 3 }, (_, index) => {
    const part = new THREE.Group();
    const angle = Math.PI / 2 + index * Math.PI * 2 / 3;
    const lamp = material('#ffe2a3', .25, .24, '#f6ad41');
    part.rotation.z = angle - Math.PI / 2;
    mesh(part, new THREE.BoxGeometry(.15, .28, .2), steel, 0, -.13);
    mesh(part, new THREE.BoxGeometry(.045, .25, .022), cyan, 0, -.13, .112);
    mesh(part, new THREE.BoxGeometry(.045, .25, .022), cyan, 0, -.13, -.112);
    const housing = mesh(part, new THREE.CylinderGeometry(.13, .13, .23, 12), steel);
    housing.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      const rim = mesh(part, new THREE.CylinderGeometry(.096, .096, .025, 12), gold, 0, 0, side * .13);
      rim.rotation.x = Math.PI / 2;
      const lens = mesh(part, new THREE.SphereGeometry(.065, 12, 8), lamp, 0, 0, side * .15);
      lens.scale.z = .3;
    }
    head.add(part);
    return { part, angle, lamp };
  });
  const bridgeGeometry = new THREE.CylinderGeometry(.032, .032, 1, 6);
  const bridges = satellites.map(() => mesh(head, bridgeGeometry, steel));
  const delta = new THREE.Vector3();
  return {
    root,
    sample(action: NpcAction, seconds: number) {
      const definition = npcAction('sam', action);
      const casting = action === 'attack' || action === 'skill1' || action === 'skill2' || action === 'ultimate';
      const charge = casting ? smooth(seconds, 0, definition.release) * (1 - smooth(seconds, definition.release + .04, definition.seconds)) : 0;
      const pulse = casting ? (1 - smooth(Math.abs(seconds - definition.release), 0, .13)) : 0;
      const expansion = action === 'ultimate' ? .33 : action === 'skill2' ? .2 : .08;
      crystal.rotation.set(seconds * .3, seconds * .65, .08 * Math.sin(seconds * 1.4));
      inner.rotation.set(-seconds, seconds * .5, seconds * .35);
      cyan.emissiveIntensity = .3 + charge * 1.1 + pulse * 2;
      for (let i = 0; i < satellites.length; i++) {
        const { part, angle, lamp } = satellites[i]!;
        const radius = .43 + charge * expansion;
        part.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
        // 待机低亮；三节点依次点亮后同时闪光，清楚标记发射帧。
        lamp.emissiveIntensity = .18 + (casting ? smooth(seconds, definition.release * i / 3, definition.release * (i + 1) / 3) * charge * 1.7 : 0) + pulse * 2;
        const next = satellites[(i + 1) % satellites.length]!;
        delta.set(Math.cos(next.angle) * radius, Math.sin(next.angle) * radius, 0).sub(part.position);
        const bridge = bridges[i]!;
        bridge.position.copy(part.position).addScaledVector(delta, .5);
        bridge.scale.y = delta.length();
        bridge.quaternion.setFromUnitVectors(UP, delta.normalize());
      }
    },
  };
}

function createResetMallet() {
  const root = new THREE.Group();
  const steel = material('#30413d', .68, .35);
  const grip = material('#171f21', .1, .82);
  const brass = material('#cda760', .78, .3);
  const green = material('#8ddd63', .2, .32, '#53ba3e');
  mesh(root, new THREE.CylinderGeometry(.052, .06, .64, 12), steel, 0, -.16);
  mesh(root, new THREE.CylinderGeometry(.072, .072, .25, 12), grip, 0, .025);
  for (const y of [-.115, .155]) mesh(root, new THREE.CylinderGeometry(.076, .076, .035, 12), brass, 0, y);
  for (let i = 0; i < 4; i++) mesh(root, new THREE.TorusGeometry(.073, .009, 5, 12), steel, 0, -.07 + i * .055).rotation.x = Math.PI / 2;
  const head = new THREE.Group();
  head.position.y = -.59;
  head.rotation.y = Math.PI / 4;
  root.add(head);
  const drum = mesh(head, new THREE.CylinderGeometry(.32, .32, .3, 24), steel);
  drum.rotation.x = Math.PI / 2;
  const ratchets: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const rim = mesh(head, new THREE.TorusGeometry(.293, .028, 6, 24), brass, 0, 0, side * .16);
    rim.castShadow = true;
    const face = mesh(head, new THREE.CylinderGeometry(.265, .265, .025, 24), grip, 0, 0, side * .16);
    face.rotation.x = Math.PI / 2;
    const ratchet = new THREE.Group();
    ratchet.position.z = side * .186;
    ratchet.rotation.y = side < 0 ? Math.PI : 0;
    mesh(ratchet, new THREE.TorusGeometry(.21, .029, 6, 30, Math.PI * 1.64), green);
    const angle = Math.PI * 1.64;
    const arrow = mesh(ratchet, new THREE.ConeGeometry(.069, .13, 3), green, Math.cos(angle) * .21, Math.sin(angle) * .21);
    arrow.rotation.z = angle;
    head.add(ratchet);
    ratchets.push(ratchet);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      mesh(head, new THREE.SphereGeometry(.022, 6, 4), brass, Math.cos(a) * .296, Math.sin(a) * .296, side * .19);
    }
  }
  return {
    root,
    sample(action: NpcAction, seconds: number) {
      const definition = npcAction('tibo', action);
      const active = action === 'attack' || action === 'skill2' || action === 'ultimate';
      const charge = active ? smooth(seconds, 0, definition.release) * (1 - smooth(seconds, definition.release + .04, definition.seconds)) : 0;
      green.emissiveIntensity = .22 + charge * .8;
      const rewind = active ? smooth(seconds, definition.release + .08, definition.seconds) : 0;
      for (const ratchet of ratchets) ratchet.rotation.z = -Math.PI * 2 * Math.round(rewind * 8) / 8;
    },
  };
}

/** 武器资源由实例持有；变身控制器只显示同一份武器并插值两种形态的握点。 */
export function createNpcWeapon(kind: NpcKind) {
  const root = new THREE.Group();
  root.name = `${kind}-weapon`;
  const weapon = kind === 'sam' ? createRouterCore() : createResetMallet();
  root.add(weapon.root);
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const nextPosition = new THREE.Vector3();
  const nextRotation = new THREE.Quaternion();
  const staffTilt = new THREE.Quaternion();
  const hoverRotation = new THREE.Quaternion();
  const hoverPosition = new THREE.Vector3();
  const staffAxis = new THREE.Vector3(1, 0, 0);
  const offset = new THREE.Vector3(.025, -.1, .035);
  const rotatedOffset = new THREE.Vector3();
  const inverse = new THREE.Matrix4();
  const transform = new THREE.Matrix4();

  function grip(model: THREE.Group, at: THREE.Vector3, orientation: THREE.Quaternion): void {
    const hand = model.getObjectByName('handL')!;
    hand.getWorldPosition(at);
    hand.getWorldQuaternion(orientation).normalize();
    at.add(rotatedOffset.copy(offset).applyQuaternion(orientation));
  }

  return {
    root,
    sample(action: NpcAction, seconds: number, model: THREE.Group, nextModel = model, formBlend = 0) {
      weapon.sample(action, seconds);
      model.updateWorldMatrix(true, true);
      root.parent!.updateWorldMatrix(true, false);
      grip(model, position, rotation);
      if (formBlend > 0) {
        nextModel.updateWorldMatrix(true, true);
        grip(nextModel, nextPosition, nextRotation);
        position.lerp(nextPosition, formBlend);
        rotation.slerp(nextRotation, formBlend);
      }
      if (kind === 'sam') {
        const { release, seconds: duration } = npcAction(kind, action);
        const aiming = action === 'attack' ? smooth(seconds, 0, release) * (1 - smooth(seconds, release + .08, duration)) : 0;
        // 握点跟随手掌；杖身保持竖直，跑跳的摆臂不会把水晶甩进脸里。
        model.parent!.getWorldQuaternion(rotation);
        rotation.multiply(staffTilt.setFromAxisAngle(staffAxis, .18 + aiming * .67));
        if (action === 'ultimate') {
          const lift = smooth(seconds, .18, 1.15) * (1 - smooth(seconds, duration - .95, duration - .1));
          model.parent!.getWorldPosition(hoverPosition);
          hoverPosition.x += SAM_ROUTING_SOURCE.x;
          hoverPosition.y += SAM_ROUTING_SOURCE.y;
          hoverPosition.z += SAM_ROUTING_SOURCE.z;
          position.lerp(hoverPosition, lift);
          rotation.slerp(hoverRotation, lift);
        }
      }
      // 不继承骨骼呼吸缩放，两个形态使用相同的武器世界尺寸。
      transform.compose(position, rotation, UNIT);
      inverse.copy(root.parent!.matrixWorld).invert();
      root.matrixAutoUpdate = false;
      root.matrix.copy(inverse).multiply(transform);
      root.matrixWorldNeedsUpdate = true;
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      root.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        geometries.add(node.geometry);
        for (const value of Array.isArray(node.material) ? node.material : [node.material]) materials.add(value);
      });
      for (const geometry of geometries) geometry.dispose();
      for (const surface of materials) surface.dispose();
      root.removeFromParent();
      root.clear();
    },
  };
}

export type NpcWeapon = ReturnType<typeof createNpcWeapon>;
