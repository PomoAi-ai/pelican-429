import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash01 } from '../../core/rng.ts';
import { createParticleCloud } from './grassy-particles.ts';

const clamp = THREE.MathUtils.clamp;
const ease = (value: number) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const up = new THREE.Vector3(0, 1, 0);

function luminous(color: THREE.ColorRepresentation, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity === 1, toneMapped: false });
}

function instances(parent: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, count: number) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  parent.add(mesh);
  return mesh;
}

function flushCloud(cloud: ReturnType<typeof createParticleCloud>) {
  cloud.positions.needsUpdate = cloud.sizes.needsUpdate = cloud.alphas.needsUpdate = true;
}

/** 远端爆发独立于装备挂点；瞬间白核、实体碎片与外圈粒子分别保留轮廓。 */
export function createImpacts(parent: THREE.Group, count: number, color: THREE.ColorRepresentation) {
  const cloud = createParticleCloud(count * 48, color);
  parent.add(cloud.points);
  const cores = instances(parent, new THREE.IcosahedronGeometry(1, 1), luminous('#ecffff'), count);
  const fragments = instances(parent, new THREE.OctahedronGeometry(1), luminous(color), count * 12);
  const transform = new THREE.Object3D();
  return {
    set(index: number, age: number, x: number, y: number, z: number, radius: number) {
      const active = age >= 0 && age < 1;
      const t = clamp(age, 0, 1);
      transform.position.set(x, y, z);
      transform.rotation.set(0, 0, 0);
      transform.scale.setScalar(active ? (1 - t) ** 2 * radius * 0.33 : 0);
      transform.updateMatrix();
      cores.setMatrixAt(index, transform.matrix);
      for (let j = 0; j < 48; j++) {
        const id = index * 48 + j;
        const angle = j * 2.399963;
        const vertical = 1 - 2 * (j + 0.5) / 48;
        const planar = Math.sqrt(1 - vertical * vertical);
        const distance = radius * (0.12 + t * (0.5 + j % 5 * 0.14));
        cloud.positions.setXYZ(id, x + Math.cos(angle) * planar * distance, y + vertical * distance, z + Math.sin(angle) * planar * distance);
        cloud.sizes.setX(id, (0.09 + j % 4 * 0.035) * (1 - t * 0.6));
        cloud.alphas.setX(id, active ? (1 - t) ** 2 : 0);
        if (j < 12) {
          transform.position.set(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, z + Math.sin(j * 4.2) * distance * 0.65);
          transform.rotation.set(angle + t * 7, t * 11, angle);
          transform.scale.set(active ? 0.04 * (1 - t) : 0, active ? 0.04 * (1 - t) : 0, active ? 0.14 * (1 - t) : 0);
          transform.updateMatrix();
          fragments.setMatrixAt(index * 12 + j, transform.matrix);
        }
      }
    },
    flush() {
      cores.instanceMatrix.needsUpdate = fragments.instanceMatrix.needsUpdate = true;
      flushCloud(cloud);
    },
  };
}

function codePath(index: number, t: number, point: THREE.Vector3) {
  const fan = Math.sin(t * Math.PI);
  return point.set(Math.sin(index * 2.4) * fan * 0.65, 1.65 + (index - 3) / 3 * fan * 1.25 - t * 0.12, 0.58 + t * 9);
}

function createAttackBursts(parent: THREE.Group, count: number, color: THREE.ColorRepresentation, accent: THREE.ColorRepresentation) {
  const impact = createImpacts(parent, count, color);
  const sparks = createParticleCloud(count * 32, color);
  parent.add(sparks.points);
  const shards = instances(parent, new THREE.OctahedronGeometry(1), luminous(accent), count * 16);
  const rings = instances(parent, new THREE.TorusGeometry(1, 0.018, 5, 48), luminous(color), count);
  const transform = new THREE.Object3D();
  return {
    set(index: number, age: number, x: number, y: number, z: number, radius: number) {
      const t = clamp(age, 0, 1);
      const fade = age >= 0 && age < 1 ? 1 - ease(t) : 0;
      impact.set(index, age, x, y, z, radius);
      transform.position.set(x, y, z);
      transform.rotation.set(0, 0, 0);
      const ringRadius = radius * (0.15 + t * 0.9) * fade ** 0.25;
      transform.scale.set(ringRadius, ringRadius, fade);
      transform.updateMatrix();
      rings.setMatrixAt(index, transform.matrix);
      for (let j = 0; j < 32; j++) {
        const id = index * 32 + j;
        const angle = j * 2.399963;
        const spread = radius * (0.12 + (1 - (1 - t) ** 2) * (0.40 + j % 5 * 0.12));
        const px = x + Math.cos(angle) * spread;
        const py = y + Math.sin(angle) * spread - t * t * 0.22;
        const pz = z + Math.sin(j * 1.71) * spread * 0.65;
        sparks.positions.setXYZ(id, px, py, pz);
        sparks.sizes.setX(id, (0.19 + j % 4 * 0.065) * (1 - t * 0.45));
        sparks.alphas.setX(id, fade * (0.6 + j % 3 * 0.2));
        if (j < 16) {
          transform.position.set(px, py, pz);
          transform.rotation.set(angle + t * 4, t * 7, angle);
          transform.scale.set(0.055 * fade, 0.07 * fade, (0.13 + j % 3 * 0.035) * fade);
          transform.updateMatrix();
          shards.setMatrixAt(index * 16 + j, transform.matrix);
        }
      }
    },
    flush() {
      impact.flush();
      flushCloud(sparks);
      shards.instanceMatrix.needsUpdate = rings.instanceMatrix.needsUpdate = true;
    },
  };
}

function createCodeGlyph() {
  const bar = new THREE.BoxGeometry(0.13, 0.62, 0.09).translate(-0.24, 0, 0);
  const upper = new THREE.BoxGeometry(0.4, 0.12, 0.09).translate(-0.1, 0.28, 0);
  const lower = new THREE.BoxGeometry(0.4, 0.12, 0.09).translate(-0.1, -0.28, 0);
  return mergeGeometries([bar, upper, lower])!;
}

/** 字形朝向相机，避免横版朝左或飞行转向时把代码反过来、转成一条细线。 */
function faceCamera(mesh: THREE.Mesh) {
  const rotation = new THREE.Quaternion();
  const cameraRotation = new THREE.Quaternion();
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    mesh.parent!.getWorldQuaternion(rotation);
    camera.getWorldQuaternion(cameraRotation);
    mesh.quaternion.copy(rotation.invert()).multiply(cameraRotation);
    mesh.updateMatrixWorld(true);
  };
}

function flyingCode(text: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 384; canvas.height = 144;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Codex 代码弹无法创建 Canvas 2D context');
  context.font = '900 96px Menlo, Consolas, monospace';
  context.textAlign = 'center'; context.textBaseline = 'middle';
  context.lineJoin = 'round'; context.lineWidth = 13;
  context.strokeStyle = '#063655'; context.strokeText(text, 192, 72, 352);
  context.shadowColor = '#21b9ff'; context.shadowBlur = 8;
  context.fillStyle = '#5de0ff'; context.fillText(text, 192, 72, 352);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  material.userData.noLightMap = true;
  material.addEventListener('dispose', () => texture.dispose());
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.80, 0.30), material);
  faceCamera(mesh);
  return mesh;
}

export function createCodeBolt() {
  const body = new THREE.Group();
  const strokes = [
    [-0.29, 0.23, -0.51, 0], [-0.51, 0, -0.29, -0.23],
    [0.08, 0.28, -0.08, -0.28],
    [0.29, 0.23, 0.51, 0], [0.51, 0, 0.29, -0.23],
  ] as const;
  const parts = strokes.map(([x1, y1, x2, y2]) => new THREE.BoxGeometry(Math.hypot(x2 - x1, y2 - y1), 0.085, 0.13)
    .rotateZ(Math.atan2(y2 - y1, x2 - x1)).translate((x1 + x2) / 2, (y1 + y2) / 2, 0));
  const geometry = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  const head = new THREE.Mesh(geometry, luminous('#d5fcff'));
  head.material.userData.noLightMap = true;
  head.name = 'solid-code-projectile';
  head.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: '#1b92d4', toneMapped: false })));
  faceCamera(head);
  const code = ['{}', '=>', 'if()'].map(flyingCode);
  const sparks = createParticleCloud(32, '#46caff');
  body.add(head, ...code, sparks.points);
  return {
    body,
    update(time: number, length: number) {
      for (let i = 0; i < code.length; i++) {
        const age = (time * 1.6 + i / code.length) % 1;
        const glyph = code[i]!;
        // 字符留在弹头两侧，长拖尾只留细粒子，避免连射时文字盖住前一发弹头。
        glyph.position.set(Math.sin(i * 2.4) * age * 0.15,
          (i === 0 ? 0.44 : i === 1 ? -0.48 : 0.82) + Math.sin(time * 2 + i) * 0.03,
          -0.16 - age * Math.min(0.65, length));
        glyph.scale.setScalar(0.8 - age * 0.06);
        glyph.material.opacity = (1 - age * 0.55) * ease(length / 0.5);
      }
      for (let i = 0; i < sparks.positions.count; i++) {
        const age = (time * 2 + i / sparks.positions.count) % 1;
        const angle = i * 2.39996;
        const spread = 0.055 + age * 0.20;
        sparks.positions.setXYZ(i, Math.cos(angle) * spread, Math.sin(angle) * spread, -0.12 - age * length);
        sparks.sizes.setX(i, 0.045 + i % 3 * 0.014);
        sparks.alphas.setX(i, (1 - age) * 0.75 * ease(length / 0.5));
      }
      flushCloud(sparks);
    },
  };
}

export function createCodeBolts(parent: THREE.Group) {
  const root = new THREE.Group();
  root.name = 'grassy-codex-barrage';
  parent.add(root);
  const bolts = Array.from({ length: 7 }, (_, i) => {
    const bolt = createCodeBolt();
    root.add(bolt.body);
    return { ...bolt, release: 0.35 + i * 0.032 };
  });
  const trail = createParticleCloud(7 * 84, '#208cfb');
  const sparks = createParticleCloud(7 * 32, '#8aeaff');
  root.add(trail.points, sparks.points);
  const fragments = instances(root, new THREE.OctahedronGeometry(1), luminous('#49c9ff'), 7 * 20);
  const transform = new THREE.Object3D();
  const point = new THREE.Vector3();
  const impacts = createAttackBursts(root, 7, '#42c8ff', '#b7faff');
  return {
    root,
    update(progress: number) {
      root.visible = progress >= 0.35 && progress < 1;
      for (let i = 0; i < bolts.length; i++) {
        const bolt = bolts[i]!;
        const age = (progress - bolt.release) / 0.27;
        const t = clamp(age, 0, 1);
        const residual = Math.max(0, age - 1);
        const fade = age >= 0 ? 1 - ease(residual / 0.65) : 0;
        const launch = ease(t / 0.065);
        bolt.body.visible = age >= 0 && age < 1;
        codePath(i, t, bolt.body.position);
        bolt.body.rotation.set(-Math.atan(((i - 3) / 3 * Math.cos(t * Math.PI) * Math.PI * 1.25 - 0.12) / 9), Math.atan(Math.sin(i * 2.4) * Math.cos(t * Math.PI) * Math.PI * 0.65 / 9), 0);
        bolt.body.scale.setScalar(launch * (i === 3 ? 1.22 : 1));
        bolt.update(progress * 1.8 + i * 0.09, Math.min(2.8, t * 9));
        // 残留由发射后的绝对时间计算，弹体消失后仍向外漂移；拖动时间轴也可重建同一帧。
        for (let j = 0; j < 84; j++) {
          const id = i * 84 + j;
          const tail = hash01(i, j, 11);
          const past = Math.max(0, t - tail * 0.30);
          codePath(i, past, point);
          const scatter = hash01(i, j, 12);
          const spread = 0.035 + tail * (0.08 + scatter * 0.22) + residual * 0.18;
          trail.positions.setXYZ(id, point.x + (hash01(i, j, 13) * 2 - 1) * spread,
            point.y + (hash01(i, j, 14) * 2 - 1) * spread * 0.8 - residual * residual * 0.10,
            point.z - 0.38 + (scatter - 0.5) * 0.2 + residual * 0.32);
          trail.sizes.setX(id, scatter > 0.94 ? 0.14 : 0.055 + hash01(i, j, 15) * 0.06);
          trail.alphas.setX(id, fade * launch * (1 - tail * 0.88) * (0.15 + hash01(i, j, 16) * 0.30));
        }
        for (let j = 0; j < 32; j++) {
          const id = i * 32 + j;
          const tail = hash01(i, j, 31);
          const past = Math.max(0, t - tail * 0.36);
          const angle = hash01(i, j, 32) * Math.PI * 2;
          codePath(i, past, point);
          const spread = 0.07 + tail * (0.12 + hash01(i, j, 33) * 0.24) + residual * 0.22;
          point.x += Math.cos(angle) * spread;
          point.y += Math.sin(angle) * spread * 0.8 - residual * residual * 0.12;
          point.z -= 0.22 + hash01(i, j, 34) * 0.2 - residual * 0.48;
          sparks.positions.setXYZ(id, point.x, point.y, point.z);
          sparks.sizes.setX(id, 0.055 + hash01(i, j, 35) * 0.075);
          sparks.alphas.setX(id, fade * launch * (1 - tail * 0.65) * (0.25 + hash01(i, j, 36) * 0.35));
          transform.position.copy(point);
          transform.rotation.set(angle * 0.22, progress * 5 + i, angle + residual * 3);
          const size = (0.06 + hash01(i, j, 37) ** 2 * 0.10) * fade * launch * (1 - tail * 0.5);
          if (j >= 12) {
            transform.scale.set(size * 0.65, size, size * 0.4);
            transform.updateMatrix();
            fragments.setMatrixAt(i * 20 + j - 12, transform.matrix);
          }
        }
        impacts.set(i, (progress - bolt.release - 0.27) / 0.21, 0, 1.53, 9.58, 0.95);
      }
      fragments.instanceMatrix.needsUpdate = true;
      flushCloud(trail);
      flushCloud(sparks);
      impacts.flush();
    },
  };
}

function ellipsoid(x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  return new THREE.SphereGeometry(1, 12, 8).scale(sx, sy, sz).translate(x, y, z);
}

function limb(from: THREE.Vector3, to: THREE.Vector3, radius: number) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const geometry = new THREE.CylinderGeometry(radius * 0.7, radius, direction.length(), 7);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()));
  return geometry.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
}

export function createMechanicalBugs(parent: THREE.Group, count = 17) {
  const armorParts: THREE.BufferGeometry[] = [ellipsoid(0, 0, -0.035, 0.18, 0.12, 0.28), ellipsoid(0, -0.005, 0.24, 0.145, 0.12, 0.16)];
  const shellParts: THREE.BufferGeometry[] = [];
  const trimParts: THREE.BufferGeometry[] = [];
  const coreParts = [ellipsoid(0, 0.137, -0.04, 0.023, 0.018, 0.24)];
  for (const side of [-1, 1]) {
    trimParts.push(ellipsoid(side * 0.095, 0.06, -0.055, 0.12, 0.102, 0.255));
    shellParts.push(ellipsoid(side * 0.095, 0.073, -0.052, 0.108, 0.10, 0.245));
    coreParts.push(ellipsoid(side * 0.085, 0.045, 0.36, 0.048, 0.052, 0.036));
    for (let rib = 0; rib < 5; rib++) coreParts.push(ellipsoid(side * 0.182, -0.015, -0.21 + rib * 0.058, 0.017, 0.061, 0.014));
    armorParts.push(limb(new THREE.Vector3(side * 0.065, -0.06, 0.33), new THREE.Vector3(side * 0.11, -0.14, 0.44), 0.033));
    trimParts.push(limb(new THREE.Vector3(side * 0.11, -0.14, 0.44), new THREE.Vector3(side * 0.035, -0.16, 0.49), 0.021));
    for (let leg = 0; leg < 3; leg++) {
      const z = -0.19 + leg * 0.17;
      const start = new THREE.Vector3(side * 0.13, -0.025, z);
      const knee = new THREE.Vector3(side * 0.29, -0.055, z + 0.035);
      const foot = new THREE.Vector3(side * 0.34, -0.22, z + 0.12);
      armorParts.push(limb(start, knee, 0.035), limb(knee, foot, 0.027));
      trimParts.push(ellipsoid(knee.x, knee.y, knee.z, 0.039, 0.039, 0.039));
      coreParts.push(ellipsoid(side * 0.16, 0.01, z, 0.027, 0.028, 0.028));
    }
  }
  const armor = instances(parent, mergeGeometries(armorParts)!, new THREE.MeshStandardMaterial({ color: '#21172f', metalness: 0.65, roughness: 0.30, emissive: '#35134d', emissiveIntensity: 0.25 }), count);
  const shells = instances(parent, mergeGeometries(shellParts)!, new THREE.MeshStandardMaterial({ color: '#512579', metalness: 0.62, roughness: 0.24, emissive: '#64109b', emissiveIntensity: 0.22 }), count);
  const trim = instances(parent, mergeGeometries(trimParts)!, new THREE.MeshStandardMaterial({ color: '#c9b6e1', metalness: 0.7, roughness: 0.27 }), count);
  const cores = instances(parent, mergeGeometries(coreParts)!, luminous('#b9ff43'), count);
  const outline = [[0, 0], [0.19, -0.10], [0.58, -0.04], [0.44, 0.13], [0.12, 0.15]] as const;
  const wingShape = new THREE.Shape();
  outline.forEach(([x, z], i) => i === 0 ? wingShape.moveTo(x, z) : wingShape.lineTo(x, z));
  wingShape.closePath();
  const wingGeometry = new THREE.ShapeGeometry(wingShape);
  wingGeometry.rotateX(Math.PI / 2);
  const wingMaterial = new THREE.MeshBasicMaterial({ color: '#a74de9', side: THREE.DoubleSide, transparent: true, opacity: 0.67, depthWrite: false, toneMapped: false });
  const wings = instances(parent, wingGeometry, wingMaterial, count * 4);
  const veinParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    veinParts.push(limb(new THREE.Vector3(a[0], 0, a[1]), new THREE.Vector3(b[0], 0, b[1]), 0.006));
  }
  for (let i = 0; i < 4; i++) {
    const x = 0.10 + i * 0.10;
    veinParts.push(limb(new THREE.Vector3(x, 0, -0.06), new THREE.Vector3(x + 0.12, 0, 0.10), 0.004));
  }
  veinParts.push(limb(new THREE.Vector3(0.04, 0, 0.01), new THREE.Vector3(0.53, 0, -0.03), 0.005));
  const veins = instances(parent, mergeGeometries(veinParts)!, luminous('#ecb6ff'), count * 4);
  const bodyTransform = new THREE.Object3D();
  const wingTransform = new THREE.Object3D();
  const wingMatrix = new THREE.Matrix4();
  return {
    set(index: number, point: THREE.Vector3, age: number, progress: number, size: number) {
      const active = age >= 0 && age < 1;
      const t = clamp(age, 0, 1);
      const lane = Math.sin(index * 2.4);
      bodyTransform.position.copy(point);
      bodyTransform.rotation.set(-Math.atan((Math.cos(t * Math.PI) * Math.PI * (0.20 + Math.cos(index * 1.8) * 0.95) - 0.2) / 7.2), Math.atan(lane * Math.cos(t * Math.PI) * Math.PI / 7.2), Math.sin(t * 13 + index) * 0.20);
      bodyTransform.scale.setScalar(active ? size * ease(t / 0.07) : 0);
      bodyTransform.updateMatrix();
      for (const mesh of [armor, shells, trim, cores]) mesh.setMatrixAt(index, bodyTransform.matrix);
      for (let wing = 0; wing < 4; wing++) {
        const side = wing < 2 ? -1 : 1;
        wingTransform.position.set(side * 0.10, 0.115, wing % 2 ? 0.10 : -0.085);
        wingTransform.rotation.set(0, side < 0 ? Math.PI + 0.28 : -0.28, side * (0.40 + Math.sin(progress * 245 + index * 0.7 + wing % 2 * 0.8) * 0.35));
        wingTransform.scale.setScalar(wing % 2 ? 0.76 : 1);
        wingTransform.updateMatrix();
        wingMatrix.multiplyMatrices(bodyTransform.matrix, wingTransform.matrix);
        wings.setMatrixAt(index * 4 + wing, wingMatrix);
        veins.setMatrixAt(index * 4 + wing, wingMatrix);
      }
    },
    flush() {
      for (const mesh of [armor, shells, trim, cores, wings, veins]) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

function bugPath(index: number, t: number, point: THREE.Vector3) {
  const fan = Math.sin(t * Math.PI);
  const braid = Math.sin(t * Math.PI * 5 + index) * fan * 0.12;
  return point.set(Math.sin(index * 2.4) * fan * (index < 5 ? 0.90 : 1.15) + braid,
    1.70 + fan * (0.20 + Math.cos(index * 1.8) * 0.95) - t * 0.2 + Math.cos(t * Math.PI * 5 + index) * fan * 0.10,
    0.58 + t * 7.2);
}

export function createBugSwarm(parent: THREE.Group) {
  const root = new THREE.Group();
  root.name = 'grassy-mechanical-bug-swarm';
  parent.add(root);
  const bugs = createMechanicalBugs(root);
  const greenTrail = createParticleCloud(17 * 36, '#a0f82f');
  const purpleTrail = createParticleCloud(17 * 36, '#a14bf5');
  root.add(greenTrail.points, purpleTrail.points);
  const flecks = instances(root, new THREE.OctahedronGeometry(1), luminous('#bcff59'), 17 * 12);
  const glyphs = instances(root, createCodeGlyph(), luminous('#d891ff'), 17 * 6);
  const transform = new THREE.Object3D();
  const point = new THREE.Vector3();
  const impacts = createAttackBursts(root, 17, '#acfa41', '#cf83ff');
  return {
    root,
    update(progress: number) {
      root.visible = progress >= 0.37 && progress < 1;
      for (let i = 0; i < 17; i++) {
        const release = 0.37 + i * 0.0105;
        const age = (progress - release) / 0.30;
        const t = clamp(age, 0, 1);
        const residual = Math.max(0, age - 1);
        const fade = age >= 0 ? 1 - ease(residual / 0.58) : 0;
        const launch = ease(t / 0.06);
        bugPath(i, t, point);
        bugs.set(i, point, age, progress, i < 5 ? 1.23 : 0.64);
        for (let j = 0; j < 36; j++) {
          const id = i * 36 + j;
          const tail = hash01(i, j, 51);
          const past = Math.max(0, t - tail * 0.30);
          bugPath(i, past, point);
          const angle = hash01(i, j, 52) * Math.PI * 2 + residual * 0.6;
          const purpleAngle = hash01(i, j, 53) * Math.PI * 2 - residual * 0.8;
          const radius = (0.04 + tail * 0.22 + residual * 0.19) * (0.35 + hash01(i, j, 54) * 0.65);
          const drift = residual * residual * 0.14;
          greenTrail.positions.setXYZ(id, point.x + Math.sin(angle) * radius, point.y + Math.cos(angle) * radius - drift, point.z - 0.24 + residual * 0.24);
          purpleTrail.positions.setXYZ(id, point.x + Math.sin(purpleAngle) * radius, point.y + Math.cos(purpleAngle) * radius - drift,
            point.z - 0.24 + (hash01(i, j, 55) - 0.5) * 0.24 + residual * 0.24);
          const size = (i < 5 ? 0.14 : 0.11) + hash01(i, j, 56) ** 2 * 0.11;
          greenTrail.sizes.setX(id, size);
          purpleTrail.sizes.setX(id, 0.12 + hash01(i, j, 57) ** 2 * 0.13);
          const alpha = fade * launch * (1 - tail * 0.8);
          greenTrail.alphas.setX(id, alpha * (0.25 + hash01(i, j, 58) * 0.75));
          purpleTrail.alphas.setX(id, alpha * (0.20 + hash01(i, j, 59) * 0.65));
        }
        for (let j = 0; j < 18; j++) {
          const tail = hash01(i, j, 71);
          const angle = hash01(i, j, 72) * Math.PI * 2;
          bugPath(i, Math.max(0, t - tail * 0.38), point);
          const spread = 0.12 + tail * (0.12 + hash01(i, j, 73) * 0.18) + residual * 0.30;
          transform.position.set(point.x + Math.cos(angle) * spread, point.y + Math.sin(angle) * spread - residual * residual * 0.19, point.z - 0.25 + residual * 0.3);
          transform.rotation.set(angle * 0.35, progress * 8 + i, angle + residual * 4);
          const size = (i < 5 ? 0.07 : 0.05) * (0.6 + hash01(i, j, 74)) * fade * launch * (1 - tail * 0.55);
          if (j < 12) {
            transform.scale.set(size, size, size * 0.6);
            transform.updateMatrix();
            flecks.setMatrixAt(i * 12 + j, transform.matrix);
          } else {
            transform.scale.setScalar(size * 2.6);
            transform.updateMatrix();
            glyphs.setMatrixAt(i * 6 + j - 12, transform.matrix);
          }
        }
        impacts.set(i, (progress - release - 0.30) / 0.19, 0, 1.50, 7.78, i < 5 ? 1.05 : 0.65);
      }
      bugs.flush();
      flecks.instanceMatrix.needsUpdate = glyphs.instanceMatrix.needsUpdate = true;
      flushCloud(greenTrail);
      flushCloud(purpleTrail);
      impacts.flush();
    },
  };
}
