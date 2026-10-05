import * as THREE from 'three';
import type { PlayerForm } from '../config/player-form.ts';

const ease = THREE.MathUtils.smoothstep;
const HEAD_HANDOFF = 0.526;

/** Curved asymmetrical vanes meet a narrow raised shaft; the base remains fixed as length grows. */
function featherGeometry(): THREE.BufferGeometry {
  const vertices: number[] = [], colors: number[] = [];
  const cross = [-1, -0.1, 0, 0.1, 1];
  const segments = 22;
  const vertex = (t: number, edge: number) => {
    const envelope = Math.sin(t * Math.PI) ** 0.76;
    const fringe = 1 - Math.abs(edge) * 0.045 * (0.5 + 0.5 * Math.cos(t * Math.PI * 34));
    const width = envelope * (edge < 0 ? 0.125 : 0.155) * fringe;
    const shaft = Math.exp(-Math.abs(edge) * 22);
    vertices.push(t * t * 0.045 + edge * (width + (1 - t) * 0.008), t,
      t * t * 0.12 + envelope * (shaft * 0.035 - Math.abs(edge) ** 1.5 * 0.052));
    const barbs = 0.018 * Math.cos(t * 100 + Math.abs(edge) * 5);
    const shade = shaft > 0.2 ? 0.89 : 0.965 + barbs - Math.abs(edge) * 0.025;
    colors.push(shade, shade * 0.994, shade * 0.956);
  };
  for (let i = 0; i < segments; i++) for (let j = 0; j < cross.length - 1; j++) {
    const a = i / segments, b = (i + 1) / segments, left = cross[j]!, right = cross[j + 1]!;
    for (const [t, edge] of [[a, left], [a, right], [b, right], [a, left], [b, right], [b, left]]) vertex(t!, edge!);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function birdRegion(name: string, y: number): number {
  if (/wing/.test(name)) return 0.34 + ease(2.55 - y, 0, 1.15) * 0.08;
  if (/standing-white-body|body-contour-neck/.test(name)) {
    if (y > 3.85) return HEAD_HANDOFF;
    if (y > 3.05) return 0.455 + ease(y, 3.05, 3.85) * 0.058;
    return 0.42 + (1 - ease(y, 0.9, 3.05)) * 0.085;
  }
  if (/pouch|bill|mouth|eye|cheek|cap|forehead|pelican-jaw$/.test(name)) return HEAD_HANDOFF;
  if (/scarf/.test(name)) return 0.516;
  return 0.48 + (1 - ease(y, 0, 3)) * 0.055;
}

function humanRegion(mesh: THREE.Mesh, i: number): number {
  if (!(mesh instanceof THREE.SkinnedMesh)) return 0.25;
  const indices = mesh.geometry.getAttribute('skinIndex');
  const weights = mesh.geometry.getAttribute('skinWeight');
  const y = mesh.geometry.getAttribute('position').getY(i);
  // Face and hair cross together; skin-weight interpolation must not scan a horizontal cut through the head.
  if (y >= 2.06) return HEAD_HANDOFF;
  let phase = 0;
  for (let component = 0; component < 4; component++) {
    const name = mesh.skeleton.bones[indices.getComponent(i, component)]!.name;
    const stage = /head|neck/.test(name) ? 0.518 + ease(y, 1.94, 3.1) * 0.012
      : /arm|hand|clavicle/.test(name) ? 0.34 + ease(1.94 - y, 0, 0.8) * 0.08
      : y > 1.45 ? 0.455 + ease(y, 1.45, 1.95) * 0.061
      : 0.455 + (1 - ease(y, 0, 1.45)) * 0.08;
    phase += stage * weights.getComponent(i, component);
  }
  return phase;
}

/** A continuous boundary replaces each part; no full-body transparency or screen-space dust. */
function createSurfaceHandoff(human: THREE.Object3D, bird: THREE.Object3D) {
  const phase = { value: 0 }, active = { value: 0 };
  const entries: Array<{ mesh: THREE.Mesh; geometry: THREE.BufferGeometry; shadow: boolean; isBird: boolean }> = [];
  const geometries: THREE.BufferGeometry[] = [];
  const attributes = new Map<THREE.BufferGeometry, { stage: ReturnType<THREE.BufferGeometry['getAttribute']>; bill: ReturnType<THREE.BufferGeometry['getAttribute']> }>();
  const materials = new Map<THREE.Material, { hook: THREE.Material['onBeforeCompile']; key: THREE.Material['customProgramCacheKey'] }>();
  for (const [model, isBird] of [[human, false], [bird, true]] as const) model.traverse(node => {
    if (!(node instanceof THREE.Mesh) || Array.isArray(node.material)) return;
    if (!isBird && (!(node.material instanceof THREE.MeshStandardMaterial) || node.material.transparent)) return;
    // Attack effects and the live mouth contents keep their own geometry and material update closures.
    for (let parent: THREE.Object3D | null = node; parent !== null; parent = parent.parent) {
      if (/^pelican-pouch-|^pelican-mouth-fish$|^grassy-attack-effects$|^grassy-bicycle$|^pelican-bike-tilt$/.test(parent.name)) return;
    }
    entries.push({ mesh: node, geometry: node.geometry, shadow: node.castShadow, isBird });
    const stages = new Float32Array(node.geometry.getAttribute('position').count);
    const positions = node.geometry.getAttribute('position');
    for (let i = 0; i < stages.length; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const stage = isBird ? birdRegion(node.name, y) : humanRegion(node, i);
      // Small coherent scallops follow the feather rows without turning the surface into disconnected dust.
      const featherEdge = Math.sin(x * 29 + Math.sin(z * 19)) * Math.sin(y * 24 + z * 11) * 0.0025;
      stages[i] = stage + (stage < 0.515 ? featherEdge : 0);
    }
    // The bird's bent legs mutate their original position attribute each frame. Only GLTF resources are shared.
    const geometry = isBird ? node.geometry : node.geometry.clone();
    if (!isBird) { geometries.push(geometry); node.geometry = geometry; }
    else if (!attributes.has(geometry)) attributes.set(geometry, { stage: geometry.getAttribute('aFeatherStage'), bill: geometry.getAttribute('aFeatherBill') });
    geometry.setAttribute('aFeatherStage', new THREE.BufferAttribute(stages, 1));
    geometry.setAttribute('aFeatherBill', new THREE.BufferAttribute(new Float32Array(stages.length).fill(isBird && /pouch|bill|mouth|pelican-jaw$/.test(node.name) ? 1 : 0), 1));
    const material: THREE.Material = node.material;
    if (materials.has(material)) return;
    const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey;
    const key = previousKey.call(material);
    materials.set(material, { hook: previous, key: previousKey });
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      shader.uniforms.uFeatherPhase = phase; shader.uniforms.uFeatherActive = active;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFeatherStage;\nattribute float aFeatherBill;\nuniform float uFeatherPhase;\nuniform float uFeatherActive;\nvarying float vFeatherStage;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFeatherStage = aFeatherStage;')
        .replace('#include <skinning_vertex>', '#include <skinning_vertex>\nif (uFeatherActive > 0.5 && aFeatherBill > 0.5) transformed.x = mix(0.3, transformed.x, smoothstep(0.47, 0.8, uFeatherPhase));');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uFeatherPhase;\nuniform float uFeatherActive;\nvarying float vFeatherStage;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if (uFeatherActive > 0.5 && ${isBird ? 'uFeatherPhase < vFeatherStage' : 'uFeatherPhase >= vFeatherStage'}) discard;`);
    };
    material.customProgramCacheKey = () => `${key}|feather-surface-growth-${isBird}`;
    material.needsUpdate = true;
  });
  return {
    update(birdness: number, transforming: boolean) {
      phase.value = birdness; active.value = transforming ? 1 : 0;
      for (const entry of entries) entry.mesh.castShadow = entry.shadow && (!transforming || (birdness >= 0.5) === entry.isBird);
    },
    dispose() {
      for (const entry of entries) { entry.mesh.geometry = entry.geometry; entry.mesh.castShadow = entry.shadow; }
      for (const [geometry, saved] of attributes) {
        // Release attached GPU attributes before detaching them; the shared rig uploads again on replay.
        geometry.dispose();
        if (saved.stage) geometry.setAttribute('aFeatherStage', saved.stage); else geometry.deleteAttribute('aFeatherStage');
        if (saved.bill) geometry.setAttribute('aFeatherBill', saved.bill); else geometry.deleteAttribute('aFeatherBill');
      }
      for (const [material, saved] of materials) {
        material.onBeforeCompile = saved.hook; material.customProgramCacheKey = saved.key; material.needsUpdate = true;
      }
      for (const geometry of geometries) geometry.dispose();
    },
  };
}

function createPoseLayer(human: THREE.Object3D, bird: THREE.Object3D) {
  const names = ['hips', 'spine', 'chest', 'head', 'upper_armL', 'upper_armR', 'forearmL', 'forearmR', 'handL', 'handR', 'KeyboardWeapon', 'FlightHarness', 'FlightCuff_L', 'FlightCuff_R'];
  const nodes = [...names.map(name => human.getObjectByName(name)!),
    bird.getObjectByName('pelican-head-bone')!, bird.getObjectByName('pelican-wing-pivot-1')!, bird.getObjectByName('pelican-wing-pivot--1')!];
  const saved = nodes.map(node => ({ node, position: node.position.clone(), rotation: node.quaternion.clone(), scale: node.scale.clone() }));
  const humanScale = human.scale.clone(), birdScale = bird.scale.clone();
  human.updateWorldMatrix(true, true);
  const equipment = ['KeyboardWeapon', 'FlightHarness', 'FlightCuff_L', 'FlightCuff_R'].map(name => {
    const node = human.getObjectByName(name)!;
    const inverse = node.matrixWorld.clone().invert(), bounds = new THREE.Box3(), part = new THREE.Box3(), matrix = new THREE.Matrix4();
    node.traverse(child => {
      if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) return;
      child.geometry.computeBoundingBox();
      part.copy(child.geometry.boundingBox!).applyMatrix4(matrix.multiplyMatrices(inverse, child.matrixWorld));
      bounds.union(part);
    });
    return { node, center: bounds.getCenter(new THREE.Vector3()) };
  });
  const retract = new THREE.Vector3();
  const world = new THREE.Quaternion(), parent = new THREE.Quaternion(), rotation = new THREE.Quaternion(), identity = new THREE.Quaternion();
  const from = new THREE.Vector3(), to = new THREE.Vector3(), position = new THREE.Vector3();
  let applied = false;
  function turnArm(name: string, childName: string, direction: THREE.Vector3, amount: number) {
    const bone = human.getObjectByName(name)!;
    const child = human.getObjectByName(childName)!;
    bone.getWorldPosition(position);
    child.getWorldPosition(from).sub(position).normalize();
    human.getWorldQuaternion(world);
    to.copy(direction).normalize().applyQuaternion(world);
    rotation.setFromUnitVectors(from, to);
    rotation.slerp(identity, 1 - amount);
    bone.getWorldQuaternion(world);
    bone.parent!.getWorldQuaternion(parent).invert();
    bone.quaternion.copy(parent.multiply(rotation).multiply(world));
    bone.updateWorldMatrix(false, true);
  }
  return {
    restore() {
      if (!applied) return;
      for (const state of saved) {
        state.node.position.copy(state.position); state.node.quaternion.copy(state.rotation); state.node.scale.copy(state.scale);
      }
      human.scale.copy(humanScale); bird.scale.copy(birdScale);
      applied = false;
    },
    apply(q: number) {
      for (const state of saved) {
        state.position.copy(state.node.position); state.rotation.copy(state.node.quaternion); state.scale.copy(state.node.scale);
      }
      applied = true;
      const body = ease(q, 0.13, 0.55);
      human.scale.set(humanScale.x * (1 - body * 0.13), humanScale.y * (1 - body * 0.16), humanScale.z * (1 + body * 0.32));
      bird.scale.set(birdScale.x, birdScale.y * (1 + (1 - ease(q, 0.35, 0.8)) * 0.06), birdScale.z);
      const chest = human.getObjectByName('chest')!;
      chest.rotation.x -= Math.sin(q * Math.PI) * 0.14;
      const head = human.getObjectByName('head')!;
      head.scale.multiplyScalar(1 - ease(q, 0.32, 0.525) * 0.12);
      const birdHead = bird.getObjectByName('pelican-head-bone')!;
      birdHead.scale.setScalar(1 + (1 - ease(q, 0.53, 0.75)) * 0.12);
      for (const { node, center } of equipment) {
        const shrink = ease(q, 0.035, 0.17);
        // Exported harness roots sit at the model origin; retract around the visible equipment instead.
        node.position.add(retract.copy(center).multiply(node.scale).applyQuaternion(node.quaternion).multiplyScalar(shrink));
        node.scale.multiplyScalar(1 - shrink);
      }
      for (const name of ['handL', 'handR']) human.getObjectByName(name)!.scale.multiplyScalar(1 - ease(q, 0.27, 0.42) * 0.45);
      human.updateWorldMatrix(true, true);
      const arm = ease(q, 0.09, 0.5);
      for (const [side, sign] of [['L', 1], ['R', -1]] as const) {
        turnArm(`upper_arm${side}`, `forearm${side}`, new THREE.Vector3(sign * 0.45, -0.28, -0.65), arm);
        turnArm(`forearm${side}`, `hand${side}`, new THREE.Vector3(sign * 0.12, -0.2, -1), arm);
      }
      for (const side of [1, -1]) {
        const wing = bird.getObjectByName(`pelican-wing-pivot-${side}`)!;
        wing.rotation.y += side * (1 - ease(q, 0.43, 0.94)) * 0.24;
        wing.scale.setScalar(0.72 + ease(q, 0.26, 0.8) * 0.28);
      }
      bird.updateWorldMatrix(true, true);
    },
  };
}

interface FeatherAnchor {
  humanIndex: number;
  humanNormal: THREE.Vector3;
  bird: THREE.Object3D;
  birdPoint: THREE.Vector3;
  birdTip: THREE.Vector3;
  birdNormal: THREE.Vector3;
  start: number;
  length: number;
}

function featherAnchors(human: THREE.SkinnedMesh, bird: THREE.Object3D): FeatherAnchor[] {
  const anchors: FeatherAnchor[] = [];
  const positions = human.geometry.getAttribute('position'), normals = human.geometry.getAttribute('normal');
  const vertex = new THREE.Vector3();
  const add = (target: THREE.Vector3, anchor: Omit<FeatherAnchor, 'humanIndex' | 'humanNormal'>) => {
    let nearest = 0, distance = Infinity;
    for (let i = 0; i < positions.count; i++) {
      const d = vertex.fromBufferAttribute(positions, i).distanceToSquared(target);
      if (d < distance) { distance = d; nearest = i; }
    }
    anchors.push({ ...anchor, humanIndex: nearest, humanNormal: new THREE.Vector3().fromBufferAttribute(normals, nearest) });
  };
  for (const sign of [1, -1]) {
    const wing = bird.getObjectByName(`pelican-wing-inner-${-sign}`)!;
    for (let i = 0; i < 18; i++) {
      const u = i / 17;
      const bp = new THREE.Vector3(0.05 - u * 1.8, 2.45 - u * 0.88, -sign * (0.79 + Math.sin(u * Math.PI) * 0.12));
      add(new THREE.Vector3(sign * (0.46 + u * 0.2), 1.93 - u * 0.76, i % 2 ? -0.07 : 0.13), {
        bird: wing, birdPoint: bp, birdTip: bp.clone().add(new THREE.Vector3(-0.8, -0.48, -sign * 0.12)), birdNormal: new THREE.Vector3(0.08, 0.15, -sign),
        start: u * 0.065, length: i % 3 === 0 ? 0.26 : 0.44 + u * 0.12,
      });
    }
    for (let i = 0; i < 8; i++) {
      const u = i / 7;
      const bp = new THREE.Vector3(0.1 - u * 0.45, 2.58 - u * 0.35, -sign * 0.76);
      add(new THREE.Vector3(sign * (0.28 + u * 0.16), 2.015 - u * 0.18, i % 2 ? -0.12 : 0.16), {
        bird: wing, birdPoint: bp, birdTip: bp.clone().add(new THREE.Vector3(-0.5, -0.65, -sign * 0.12)), birdNormal: new THREE.Vector3(0.12, 0.2, -sign),
        start: 0.015 + u * 0.035, length: 0.19 + u * 0.08,
      });
    }
  }
  const torso = bird.getObjectByName('pelican-upper-inner')!;
  for (let i = 0; i < 30; i++) {
    const back = i < 18, column = (i % 6) / 5, row = Math.floor((i % 18) / 6) / 2;
    const bp = new THREE.Vector3(back ? -1.45 : 0.62, 2.7 - row * 0.85, (column - 0.5) * 1.05);
    add(new THREE.Vector3((column - 0.5) * 0.72, 1.91 - row * 0.54, back ? -0.34 : 0.33), {
      bird: torso, birdPoint: bp, birdTip: bp.clone().add(new THREE.Vector3(-0.45, -0.8, 0)), birdNormal: new THREE.Vector3(back ? -1 : 1, 0.12, (column - 0.5) * 1.2),
      start: (back ? 0 : 0.055) + row * 0.025, length: back ? 0.33 : 0.25,
    });
  }
  for (const sign of [1, -1]) for (let i = 0; i < 6; i++) {
    const u = i / 5;
    const bp = new THREE.Vector3(-0.2 + u * 0.42, 3.16 + u * 0.4, sign * 0.285);
    add(new THREE.Vector3(sign * (0.2 - u * 0.045), 1.99 + u * 0.19, -0.045), {
      bird: torso, birdPoint: bp, birdTip: bp.clone().add(new THREE.Vector3(-0.15, -0.55, sign * 0.1)),
      birdNormal: new THREE.Vector3(-0.1, 0, sign), start: 0.045 + u * 0.045, length: 0.13 + u * 0.05,
    });
  }
  return anchors;
}

/** Feather growth follows both production skeletons while their body regions change in sequence. */
export function createPlayerTransformation(human: THREE.Object3D, bird: THREE.Object3D) {
  const root = new THREE.Group();
  root.name = 'player-feather-growth';
  root.visible = false;
  const surfaces = createSurfaceHandoff(human, bird);
  const pose = createPoseLayer(human, bird);
  const skin = human.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh;
  const anchors = featherAnchors(skin, bird);
  const geometry = featherGeometry();
  const material = new THREE.MeshStandardMaterial({ color: '#fffced', roughness: 0.7, vertexColors: true, side: THREE.DoubleSide });
  const feathers = new THREE.InstancedMesh(geometry, material, anchors.length);
  feathers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  feathers.frustumCulled = false;
  root.add(feathers);
  const transform = new THREE.Object3D();
  const featherFall = new THREE.Vector3(0, -0.65, -0.42);
  const inverse = new THREE.Matrix4();
  const hp = new THREE.Vector3(), bp = new THREE.Vector3(), ht = new THREE.Vector3(), bt = new THREE.Vector3(), direction = new THREE.Vector3();
  const hn = new THREE.Vector3(), bn = new THREE.Vector3(), normal = new THREE.Vector3(), side = new THREE.Vector3();
  const basis = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3(), roll = new THREE.Quaternion();
  const featherAxis = new THREE.Vector3(0, 1, 0);
  return {
    root,
    restore: pose.restore,
    update(progress: number, from: PlayerForm): void {
      const changing = progress >= 0 && progress < 1;
      root.visible = changing;
      if (!changing) { surfaces.update(0, false); return; }
      const q = from === 'human' ? progress : 1 - progress;
      human.visible = bird.visible = true;
      pose.apply(q);
      surfaces.update(q, true);
      root.updateWorldMatrix(true, false);
      inverse.copy(root.matrixWorld).invert();
      const transfer = ease(q, 0.32, 0.57);
      skin.skeleton.update();
      for (const [i, anchor] of anchors.entries()) {
        hp.fromBufferAttribute(skin.geometry.getAttribute('position'), anchor.humanIndex).addScaledVector(anchor.humanNormal, 0.025);
        skin.applyBoneTransform(anchor.humanIndex, hp); skin.localToWorld(hp); hp.applyMatrix4(inverse);
        bp.copy(anchor.birdPoint); anchor.bird.localToWorld(bp); bp.applyMatrix4(inverse);
        ht.fromBufferAttribute(skin.geometry.getAttribute('position'), anchor.humanIndex).addScaledVector(anchor.humanNormal, 0.52).add(featherFall);
        skin.applyBoneTransform(anchor.humanIndex, ht); skin.localToWorld(ht); ht.applyMatrix4(inverse);
        bt.copy(anchor.birdTip); anchor.bird.localToWorld(bt); bt.applyMatrix4(inverse);
        hn.fromBufferAttribute(skin.geometry.getAttribute('position'), anchor.humanIndex).add(anchor.humanNormal);
        skin.applyBoneTransform(anchor.humanIndex, hn); skin.localToWorld(hn); hn.applyMatrix4(inverse).sub(hp).normalize();
        bn.copy(anchor.birdNormal).applyNormalMatrix(normalMatrix.getNormalMatrix(anchor.bird.matrixWorld)).transformDirection(inverse);
        normal.copy(hn).lerp(bn, transfer).normalize();
        transform.position.copy(hp).lerp(bp, transfer);
        direction.copy(ht).lerp(bt, transfer).sub(transform.position);
        direction.addScaledVector(normal, -direction.dot(normal)).normalize();
        side.crossVectors(direction, normal).normalize();
        normal.crossVectors(side, direction).normalize();
        transform.quaternion.setFromRotationMatrix(basis.makeBasis(side, direction, normal));
        transform.quaternion.multiply(roll.setFromAxisAngle(featherAxis, Math.sin(i * 2.4) * 0.12));
        const short = anchor.length < 0.32;
        const emergence = ease(q, anchor.start, anchor.start + 0.15);
        const extension = short ? 1 : 0.4 + ease(q, anchor.start + 0.1, anchor.start + 0.39) * 0.6;
        const settle = ease(q, 0.68, 0.98);
        const growth = emergence * extension * (1 - settle);
        transform.position.addScaledVector(normal, -0.035 * settle);
        transform.scale.set(anchor.length * (0.62 + emergence * 0.45) * (1 - settle * 0.5), anchor.length * growth, anchor.length * growth);
        transform.updateMatrix(); feathers.setMatrixAt(i, transform.matrix);
      }
      feathers.instanceMatrix.needsUpdate = true;
    },
    dispose(): void {
      pose.restore(); surfaces.dispose(); root.removeFromParent(); feathers.dispose(); geometry.dispose(); material.dispose();
    },
  };
}
