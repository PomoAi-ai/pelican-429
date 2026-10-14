import * as THREE from 'three';
import { createD1OutlineMaterial } from './d1-anime-material.ts';
import { createAuthoredHairLocks, type HairLock } from './d1-authored-hair-recipe.ts';
import { createSculptedHairLocks } from './d1-sculpted-hair-recipe.ts';
import type { D1LabHairMotionVersion } from './d1-lab-hair-motion.ts';

const HEAD_CENTER = new THREE.Vector3(.000230005, 2.54403139, -.006884412);
const CROSS_STEPS = 12;
const RING_SIZE = CROSS_STEPS * 2;
const HAIR_COLOR = new THREE.Color('#ffffff');

type Row = { start: number; center: THREE.Vector3; tangent: THREE.Vector3; t: number };
type Section = { row: Row; normal: THREE.Vector3; side: THREE.Vector3; width: number; depth: number; scale: number };
type Strand = { recipe: HairLock; rows: Row[]; length: number; offset: THREE.Vector3; displacement: THREE.Vector3; velocity: THREE.Vector3; frequency: number };
type Surface = ReturnType<typeof scalpSurface>;
type MeshData = { position: number[]; uv: number[]; color: number[]; flow: number[]; ids: number[]; progress: number[]; indices: number[] };
type Appearance = 'early' | 'sculpted';

function strandTexture(appearance: Appearance): THREE.DataTexture {
  const width = 128, height = 256, pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / (width - 1), t = y / (height - 1);
    const index = (y * width + x) * 4;
    if (appearance === 'sculpted') {
      const dome = Math.pow(Math.sin(Math.PI * u), .8);
      const cream = Math.exp(-Math.pow((u - .43) / .32, 2)) * (.24 + .24 * Math.sin(Math.PI * t));
      const fibers = Math.sin(u * Math.PI * 72 + Math.sin(t * 7) * .3) * .003
        + Math.sin(u * Math.PI * 5 + Math.sin(t * 3) * .26) * .010
        + Math.sin(u * Math.PI * 9 + t * .35) * .004;
      const shade = .96 + dome * .04 + fibers;
      pixels[index] = Math.min(255, (242 + cream * 20) * shade);
      pixels[index + 1] = Math.min(255, (162 + cream * 83) * shade);
      pixels[index + 2] = Math.min(255, (78 + cream * 106) * shade);
    } else {
      const dome = Math.pow(Math.sin(Math.PI * u), .65);
      const highlight = Math.exp(-Math.pow((t - .31 - .035 * Math.sin(u * 8)) / .115, 2)) * dome * .52;
      const fibers = Math.sin(u * Math.PI * 56 + .6 * Math.sin(t * 8)) * .009 + Math.sin(u * Math.PI * 14 + t * 2) * .012;
      const shade = .89 + dome * .11 + fibers;
      pixels[index] = Math.min(255, (248 + highlight * 7) * shade);
      pixels[index + 1] = Math.min(255, (158 + highlight * 65) * shade);
      pixels[index + 2] = Math.min(255, (74 + highlight * 89) * shade);
    }
    pixels[index + 3] = 255;
  }
  // 同一根梢 UV 让细丝与淡色笔触跟随发束变形，不投射在世界坐标上。
  const texture = new THREE.DataTexture(pixels, width, height);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

function scalpSurface(head: THREE.SkinnedMesh, hair: THREE.SkinnedMesh) {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(head.geometry, material);
  head.updateWorldMatrix(true, false);
  hair.updateWorldMatrix(true, false);
  mesh.matrixWorld.copy(hair.matrixWorld).invert().multiply(head.matrixWorld);
  const ray = new THREE.Raycaster();
  const direction = new THREE.Vector3();
  const origin = new THREE.Vector3();
  return {
    sample(point: THREE.Vector3): THREE.Vector3 {
      direction.copy(point).sub(HEAD_CENTER).normalize();
      origin.copy(HEAD_CENTER).addScaledVector(direction, 2);
      ray.set(origin, direction.clone().negate());
      const hit = ray.intersectObject(mesh, false)[0];
      if (!hit) throw new Error(`D1 新发型未命中头皮：${point.toArray().join(', ')}`);
      return hit.point;
    },
    dispose() { material.dispose(); },
  };
}

function pushVertex(data: MeshData, point: THREE.Vector3, flow: THREE.Vector3, u: number, t: number, id: number, shade: number): void {
  data.position.push(point.x, point.y, point.z);
  data.flow.push(flow.x, flow.y, flow.z);
  data.uv.push(u, t);
  data.ids.push(id);
  data.progress.push(t);
  data.color.push(HAIR_COLOR.r * shade, HAIR_COLOR.g * shade, HAIR_COLOR.b * shade);
}

function interpolateWidth(lock: HairLock, t: number): number {
  const step = t * (lock.widths.length - 1);
  const index = Math.min(Math.floor(step), lock.widths.length - 2);
  return THREE.MathUtils.lerp(lock.widths[index]!, lock.widths[index + 1]!, THREE.MathUtils.smoothstep(step - index, 0, 1));
}

function strandRows(lock: HairLock, surface: Surface, appearance: Appearance): { rows: Row[]; length: number } {
  const curve = new THREE.CatmullRomCurve3(lock.points.map(point => new THREE.Vector3(...point)), false, 'centripetal');
  const braid = lock.braidCenters ? new THREE.CatmullRomCurve3(lock.braidCenters.map(point => new THREE.Vector3(...point)), false, 'centripetal') : null;
  const length = curve.getLength();
  const segments = Math.max(12, Math.ceil(length * (appearance === 'sculpted' ? 64 : 44)), (lock.points.length - 1) * 2);
  const centers: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const center = curve.getPoint(t);
    // 整个截面一起贴合，不能把单个内侧顶点压到头皮而挤薄发束。
    if (braid) {
      const core = braid.getPoint(t);
      const direction = core.clone().sub(HEAD_CENTER).normalize();
      const offset = center.clone().sub(core);
      // 三股使用同一条贴头辫芯，只搬动辫芯，保留各股原有的上下交织量。
      const attachment = THREE.MathUtils.lerp(.62, 1, THREE.MathUtils.smoothstep(t, 0, .08));
      center.copy(surface.sample(core)).addScaledVector(direction, lock.scalpOffset * attachment).add(offset);
    } else if (center.y > 2.53) {
      const scalp = surface.sample(center);
      const direction = center.clone().sub(HEAD_CENTER).normalize();
      const rootBlend = THREE.MathUtils.lerp(.6, 1, THREE.MathUtils.smoothstep(t, 0, .12));
      const layerOffset = lock.scalpOffset * rootBlend;
      const clearance = appearance === 'sculpted' ? lock.depth * .7 + .01 : lock.depth * .42 + .008;
      const distance = scalp.distanceTo(HEAD_CENTER) + Math.max(clearance, layerOffset * .75);
      const current = center.distanceTo(HEAD_CENTER);
      const releaseStart = lock.region === 'crown' ? .18 : lock.region === 'back' ? .5 : .55;
      const releaseEnd = lock.region === 'crown' ? .4 : .8;
      const attachment = lock.region === 'braid' ? 0 : 1 - THREE.MathUtils.smoothstep(t, releaseStart, releaseEnd);
      const fitted = THREE.MathUtils.lerp(current, scalp.distanceTo(HEAD_CENTER) + layerOffset, attachment);
      const heightRelease = THREE.MathUtils.smoothstep(center.y, 2.53, 2.64);
      center.copy(HEAD_CENTER).addScaledVector(direction, THREE.MathUtils.lerp(current, Math.max(distance, fitted), heightRelease));
    }
    centers.push(center);
  }
  const rows = centers.map((center, i): Row => ({
    start: 0, center, t: i / segments,
    tangent: centers[Math.min(i + 1, segments)]!.clone().sub(centers[Math.max(0, i - 1)]!).normalize(),
  }));
  return { rows, length };
}

function appendStrand(data: MeshData, lock: HairLock, id: number, surface: Surface, appearance: Appearance): Strand {
  const { rows, length } = strandRows(lock, surface, appearance);
  const normal = new THREE.Vector3();
  const side = new THREE.Vector3();
  const point = new THREE.Vector3();
  const transported = new THREE.Vector3();
  const curvature = new THREE.Vector3();
  const previousTangent = rows[0]!.tangent.clone();
  const turn = new THREE.Quaternion();
  const maxWidth = Math.max(...lock.widths);
  const sections: Section[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]!;
    normal.copy(row.center).sub(HEAD_CENTER);
    normal.addScaledVector(row.tangent, -normal.dot(row.tangent)).normalize();
    if (row.t > 0) {
      turn.setFromUnitVectors(previousTangent, row.tangent);
      transported.applyQuaternion(turn);
      if (transported.dot(normal) < 0) normal.negate();
      normal.lerp(transported, appearance === 'sculpted' ? 1 : .72).normalize();
    }
    transported.copy(normal);
    previousTangent.copy(row.tangent);
    side.crossVectors(row.tangent, normal).normalize();
    const width = interpolateWidth(lock, row.t);
    let depth = lock.depth * Math.sqrt(width / maxWidth);
    if (appearance === 'sculpted') depth = Math.min(depth, width * 1.2);
    const before = rows[Math.max(0, rowIndex - 1)]!, after = rows[Math.min(rows.length - 1, rowIndex + 1)]!;
    curvature.copy(after.tangent).sub(before.tangent).divideScalar(after.center.distanceTo(before.center));
    // 急弯内侧不能越过曲率中心；缩放完整截面，保持厚度比例和交织位置。
    let scale = Math.min(1, (appearance === 'sculpted' ? .55 : .8) / Math.hypot(curvature.dot(side) * width, curvature.dot(normal) * depth));
    if (appearance === 'sculpted') for (const neighbor of [before, after]) {
      if (neighbor === row) continue;
      curvature.copy(neighbor.tangent).sub(row.tangent).divideScalar(neighbor.center.distanceTo(row.center));
      scale = Math.min(scale, .55 / Math.hypot(curvature.dot(side) * width, curvature.dot(normal) * depth));
    }
    sections.push({ row, normal: normal.clone(), side: side.clone(), width, depth, scale });
  }
  if (appearance === 'sculpted') {
    // 急弯的收窄沿两侧弧长渐变，不能只在一个截面突然勒出接缝。
    for (const direction of [1, -1]) {
      const start = direction === 1 ? 1 : sections.length - 2;
      for (let i = start; i >= 0 && i < sections.length; i += direction) {
        const section = sections[i]!, neighbor = sections[i - direction]!;
        section.scale = Math.min(section.scale, neighbor.scale + section.row.center.distanceTo(neighbor.row.center) / .07);
      }
    }
  }
  for (const section of sections) {
    const { row, normal, side } = section;
    const width = section.width * section.scale, depth = section.depth * section.scale;
    row.start = data.position.length / 3;
    for (let j = 0; j < RING_SIZE; j++) {
      const outer = j <= CROSS_STEPS;
      const angle = j / RING_SIZE * Math.PI * 2;
      const u = appearance === 'sculpted' ? -Math.cos(angle) : outer ? -1 + j / CROSS_STEPS * 2 : 1 - (j - CROSS_STEPS) / CROSS_STEPS * 2;
      const arch = appearance === 'sculpted' ? Math.abs(Math.sin(angle)) : Math.sqrt(Math.max(0, 1 - u * u));
      const groove = appearance === 'sculpted'
        ? Math.exp(-Math.pow((u + .39 + .035 * Math.sin(row.t * 4 + id)) / .16, 2)) + .5 * Math.exp(-Math.pow((u - .28 - .035 * Math.sin(row.t * 3 + id * .7)) / .11, 2))
        : Math.exp(-Math.pow((u + .43) / .105, 2)) + .7 * Math.exp(-Math.pow((u - .30) / .085, 2));
      const height = appearance === 'sculpted'
        ? depth * arch * (outer ? 1 - .04 * groove : -.68)
        : outer ? depth * arch * (1 - .13 * groove) : -.36 * depth * arch;
      point.copy(row.center).addScaledVector(side, u * width).addScaledVector(normal, height);
      const rootShade = THREE.MathUtils.lerp(appearance === 'sculpted' ? .97 : .88, 1, THREE.MathUtils.smoothstep(row.t, 0, .25));
      const surfaceShade = appearance === 'sculpted' ? outer ? 1 - .02 * groove : .94 : outer ? 1 - .08 * groove : .80;
      const shade = lock.shade * rootShade * surfaceShade;
      pushVertex(data, point, row.tangent, (u + 1) * .5, row.t, id, shade);
      if (row.t > 0) {
        const a = row.start - RING_SIZE + j, b = row.start + j;
        const c = row.start - RING_SIZE + (j + 1) % RING_SIZE, d = row.start + (j + 1) % RING_SIZE;
        data.indices.push(a, c, b, c, d, b);
      }
    }
  }
  // 窄端闭合，截面和纵向的面共用顶点，保持根梢法线连续。
  for (let j = 1; j < RING_SIZE - 1; j++) {
    const first = rows[0]!.start, last = rows[rows.length - 1]!.start;
    data.indices.push(first, first + j + 1, first + j, last, last + j, last + j + 1);
  }
  return {
    recipe: lock, rows, length, offset: rows[Math.floor(rows.length * .7)]!.center.clone().sub(HEAD_CENTER),
    displacement: new THREE.Vector3(), velocity: new THREE.Vector3(), frequency: 11 + lock.stiffness * 15 + id % 5 * .55,
  };
}

function capAngle(azimuth: number, appearance: Appearance): number {
  const degrees = Math.abs(THREE.MathUtils.radToDeg(azimuth));
  if (degrees < 75) return THREE.MathUtils.lerp(appearance === 'sculpted' ? 48 : 62, 79, THREE.MathUtils.smoothstep(degrees, 25, 75));
  if (degrees < 120) return 79;
  return THREE.MathUtils.lerp(79, 120, THREE.MathUtils.smoothstep(degrees, 120, 170));
}

function appendScalpCap(data: MeshData, surface: Surface, appearance: Appearance): void {
  const segments = 64, rows = 14;
  const start = data.position.length / 3;
  const direction = new THREE.Vector3();
  const point = new THREE.Vector3();
  const flow = new THREE.Vector3();
  // 冠部与后脑的深色底层只盖细缝，前缘明显高于眉眼，侧缘停在耳朵上方。
  for (let row = 0; row <= rows; row++) for (let i = 0; i <= segments; i++) {
    const azimuth = -Math.PI + i / segments * Math.PI * 2;
    const polar = THREE.MathUtils.degToRad(.5 + (capAngle(azimuth, appearance) - .5) * row / rows);
    direction.set(Math.sin(azimuth) * Math.sin(polar), Math.cos(polar), Math.cos(azimuth) * Math.sin(polar));
    point.copy(HEAD_CENTER).add(direction);
    const offset = appearance === 'sculpted' ? .018 + .011 * Math.sin(polar) * Math.sin(polar) : .009;
    point.copy(surface.sample(point)).addScaledVector(direction, offset);
    flow.set(Math.sin(azimuth) * Math.cos(polar), -Math.sin(polar), Math.cos(azimuth) * Math.cos(polar));
    pushVertex(data, point, flow, i / segments, row / rows, -1, appearance === 'sculpted' ? .93 : .87);
    if (row > 0 && i > 0) {
      const d = start + row * (segments + 1) + i, c = d - 1, b = d - segments - 1, a = b - 1;
      data.indices.push(a, c, b, b, c, d);
    }
  }
}

function appendBobShell(data: MeshData): void {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(.06, 3.027, .15), new THREE.Vector3(.25, 2.93, .26),
    new THREE.Vector3(.375, 2.80, .40), new THREE.Vector3(.46, 2.63, .464),
    new THREE.Vector3(.52, 2.40, .49), new THREE.Vector3(.516, 2.27, .452),
    new THREE.Vector3(.47, 2.21, .41),
  ], false, 'centripetal');
  const columns = 64, rows = 40, start = data.position.length / 3;
  const point = new THREE.Vector3(), flow = new THREE.Vector3();
  for (let row = 0; row <= rows; row++) {
    const t = row / rows, profile = curve.getPoint(t), tangent = curve.getTangent(t);
    for (let column = 0; column <= columns; column++) {
      const u = column / columns, azimuth = THREE.MathUtils.degToRad(110 + u * 140);
      const edge = 1 - THREE.MathUtils.smoothstep(Math.min(u, 1 - u), 0, .1);
      const variation = .003 * Math.sin(azimuth * 9 + t * 3) * Math.sin(Math.PI * t);
      const rx = profile.x - edge * .025 + variation, rz = profile.z - edge * .022 + variation;
      const hem = .014 * (.5 + .5 * Math.sin(azimuth * 11)) * THREE.MathUtils.smoothstep(t, .82, 1);
      point.set(Math.sin(azimuth) * rx, profile.y + hem, Math.cos(azimuth) * rz - .015);
      flow.set(Math.sin(azimuth) * tangent.x, tangent.y, Math.cos(azimuth) * tangent.z).normalize();
      pushVertex(data, point, flow, u, t, -2, 1);
      if (row > 0 && column > 0) {
        const d = start + row * (columns + 1) + column, c = d - 1, b = d - columns - 1, a = b - 1;
        data.indices.push(a, c, b, b, c, d);
      }
    }
  }
}

function createGeometry(head: THREE.SkinnedMesh, hair: THREE.SkinnedMesh, headIndex: number, appearance: Appearance) {
  const data: MeshData = { position: [], uv: [], color: [], flow: [], ids: [], progress: [], indices: [] };
  const surface = scalpSurface(head, hair);
  let strands: Strand[];
  try {
    appendScalpCap(data, surface, appearance);
    if (appearance === 'sculpted') appendBobShell(data);
    const locks = appearance === 'sculpted' ? createSculptedHairLocks() : createAuthoredHairLocks();
    strands = locks.map((lock, id) => appendStrand(data, lock, id, surface, appearance));
  } finally { surface.dispose(); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(data.color, 3));
  geometry.setAttribute('d1HairFlow', new THREE.Float32BufferAttribute(data.flow, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('d1StrandId', new THREE.Float32BufferAttribute(data.ids, 1));
  geometry.setAttribute('d1StrandT', new THREE.Float32BufferAttribute(data.progress, 1));
  const indices = new Uint16Array(data.ids.length * 4), weights = new Float32Array(data.ids.length * 4);
  for (let i = 0; i < data.ids.length; i++) { indices[i * 4] = headIndex; weights[i * 4] = 1; }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  geometry.setIndex(data.indices);
  geometry.computeVertexNormals();
  (geometry.getAttribute('normal') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('d1OutlineNormal', geometry.getAttribute('normal').clone());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.boundingBox!.expandByScalar(.04);
  geometry.boundingSphere!.radius += .04;
  geometry.userData.authoredHairLocks = strands.map((strand, id) => ({
    id, name: strand.recipe.name, region: strand.recipe.region, stiffness: strand.recipe.stiffness,
    root: strand.rows[0]!.center.toArray(), tip: strand.rows[strand.rows.length - 1]!.center.toArray(),
    vertexStart: strand.rows[0]!.start, vertexCount: strand.rows.length * RING_SIZE,
  }));
  return { geometry, strands };
}

function strandDeformer(geometry: THREE.BufferGeometry, strands: Strand[]) {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const outline = geometry.getAttribute('d1OutlineNormal');
  const flow = geometry.getAttribute('d1HairFlow');
  const restPosition = position.array.slice(), restNormal = normal.array.slice(), restFlow = flow.array.slice();
  const point = new THREE.Vector3(), n = new THREE.Vector3(), tangent = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const mark = (): void => { for (const attribute of [position, normal, outline, flow]) attribute.needsUpdate = true; };
  return {
    reset() {
      position.array.set(restPosition); normal.array.set(restNormal); outline.array.set(restNormal); flow.array.set(restFlow);
      mark();
    },
    update() {
      for (const strand of strands) {
        if (strand.recipe.stiffness >= .98) continue;
        for (const row of strand.rows) {
          // 根部前三成固定；二阶连续的弯曲权重让发束从固定点平顺接出。
          const s = THREE.MathUtils.clamp((row.t - .3) / .7, 0, 1);
          const weight = s * s * s * (s * (s * 6 - 15) + 10);
          const derivative = 30 * s * s * (s - 1) * (s - 1) / (.7 * strand.length);
          tangent.copy(row.tangent).addScaledVector(strand.displacement, derivative).normalize();
          turn.setFromUnitVectors(row.tangent, tangent);
          for (let i = row.start; i < row.start + RING_SIZE; i++) {
            point.fromArray(restPosition, i * 3).sub(row.center).applyQuaternion(turn).add(row.center).addScaledVector(strand.displacement, weight);
            n.fromArray(restNormal, i * 3).applyQuaternion(turn).normalize();
            position.setXYZ(i, point.x, point.y, point.z);
            normal.setXYZ(i, n.x, n.y, n.z); outline.setXYZ(i, n.x, n.y, n.z);
            flow.setXYZ(i, tangent.x, tangent.y, tangent.z);
          }
        }
      }
      mark();
    },
  };
}

function strandDynamics(strands: Strand[]) {
  const previousPosition = new THREE.Vector3(), position = new THREE.Vector3();
  const previousRotation = new THREE.Quaternion(), rotation = new THREE.Quaternion(), delta = new THREE.Quaternion();
  const scale = new THREE.Vector3(), translation = new THREE.Vector3();
  const previousVelocity = new THREE.Vector3(), velocity = new THREE.Vector3(), acceleration = new THREE.Vector3();
  const previousAngularVelocity = new THREE.Vector3(), angularVelocity = new THREE.Vector3(), angularAcceleration = new THREE.Vector3();
  const localAcceleration = new THREE.Vector3(), localVelocity = new THREE.Vector3(), localAngular = new THREE.Vector3(), localAngularAcceleration = new THREE.Vector3();
  const inverseBasis = new THREE.Matrix3(), inverseRotation = new THREE.Quaternion();
  const force = new THREE.Vector3(), cross = new THREE.Vector3(), target = new THREE.Vector3(), gravity = new THREE.Vector3();
  let hasVelocity = false;
  const capture = (pose: THREE.Matrix4): void => { position.copy(HEAD_CENTER).applyMatrix4(pose); pose.decompose(translation, rotation, scale); };
  return {
    reset(pose: THREE.Matrix4) {
      capture(pose);
      previousPosition.copy(position); previousRotation.copy(rotation);
      previousVelocity.set(0, 0, 0); previousAngularVelocity.set(0, 0, 0);
      acceleration.set(0, 0, 0); angularAcceleration.set(0, 0, 0); hasVelocity = false;
      for (const strand of strands) { strand.displacement.set(0, 0, 0); strand.velocity.set(0, 0, 0); }
    },
    update(pose: THREE.Matrix4, dt: number) {
      capture(pose);
      velocity.copy(position).sub(previousPosition).divideScalar(dt);
      delta.copy(previousRotation).invert().premultiply(rotation);
      if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
      const sine = Math.hypot(delta.x, delta.y, delta.z);
      angularVelocity.set(delta.x, delta.y, delta.z);
      if (sine > 1e-8) angularVelocity.multiplyScalar(2 * Math.atan2(sine, delta.w) / (sine * dt));
      else angularVelocity.set(0, 0, 0);
      if (hasVelocity) {
        const blend = 1 - Math.exp(-30 * dt);
        acceleration.lerp(force.copy(velocity).sub(previousVelocity).divideScalar(dt), blend);
        angularAcceleration.lerp(force.copy(angularVelocity).sub(previousAngularVelocity).divideScalar(dt), blend);
      }
      previousPosition.copy(position); previousRotation.copy(rotation);
      previousVelocity.copy(velocity); previousAngularVelocity.copy(angularVelocity); hasVelocity = true;
      // 模型绑定空间 → 当前 head 蒙皮 → 世界，惯性再沿逆变换回到发束所在空间。
      inverseBasis.setFromMatrix4(pose).invert(); inverseRotation.copy(rotation).invert();
      localAcceleration.copy(acceleration).applyMatrix3(inverseBasis); localVelocity.copy(velocity).applyMatrix3(inverseBasis);
      localAngular.copy(angularVelocity).applyQuaternion(inverseRotation); localAngularAcceleration.copy(angularAcceleration).applyQuaternion(inverseRotation);
      gravity.set(0, -9.81, 0).applyQuaternion(inverseRotation); gravity.y += 9.81;
      for (const strand of strands) {
        if (strand.recipe.stiffness >= .98) continue;
        force.copy(gravity).sub(localAcceleration).addScaledVector(localVelocity, -1.3);
        force.sub(cross.copy(localAngularAcceleration).cross(strand.offset));
        cross.copy(localAngular).cross(strand.offset); force.addScaledVector(cross, -1.3);
        force.sub(cross.crossVectors(localAngular, cross));
        const travel = .05 * (1 - strand.recipe.stiffness);
        target.copy(force).divideScalar(strand.frequency * strand.frequency).clampLength(0, travel);
        const decay = Math.exp(-strand.frequency * dt);
        for (const axis of ['x', 'y', 'z'] as const) {
          const offset = strand.displacement[axis] - target[axis];
          const step = (strand.velocity[axis] + strand.frequency * offset) * dt;
          strand.displacement[axis] = target[axis] + (offset + step) * decay;
          strand.velocity[axis] = (strand.velocity[axis] - strand.frequency * step) * decay;
        }
      }
    },
  };
}

/** 原资源只提供头部与骨架；每一束的位置、UV、截面和运动都由独立配方生成。 */
export function createD1AuthoredHair(root: THREE.Object3D, appearance: Appearance) {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse(node => { if (node instanceof THREE.SkinnedMesh) meshes.push(node); });
  const source = meshes.find(mesh => mesh.userData.characterPart === 'hair');
  const head = meshes.find(mesh => !Array.isArray(mesh.material) && mesh.material.name === 'model');
  if (!source || !head) throw new Error('D1 新发型需要 Hair 与 model 头部蒙皮网格，请在材质装饰前创建');
  const headIndex = source.skeleton.bones.findIndex(bone => bone.name === 'head');
  if (headIndex < 0) throw new Error('D1 新发型缺少 head 骨骼');
  const bone = source.skeleton.bones[headIndex]!;
  const snapshots = [source, ...source.children.filter((node): node is THREE.SkinnedMesh => node instanceof THREE.SkinnedMesh && node.geometry === source.geometry)].map(mesh => ({
    mesh, geometry: mesh.geometry, material: mesh.material, influences: mesh.morphTargetInfluences, dictionary: mesh.morphTargetDictionary,
  }));
  const { geometry, strands } = createGeometry(head, source, headIndex, appearance);
  const texture = strandTexture(appearance);
  const material = new THREE.MeshToonMaterial({ name: 'model.001', color: 0xffffff, map: texture, vertexColors: true });
  material.normalMap = null;
  const outlineSource = new THREE.MeshStandardMaterial({ name: 'model.001', color: 0xffffff, map: texture, vertexColors: true });
  const outline = createD1OutlineMaterial(outlineSource, geometry, 'anime');
  outlineSource.dispose();
  for (const snapshot of snapshots) {
    snapshot.mesh.geometry = geometry;
    snapshot.mesh.material = snapshot.mesh === source ? material : outline;
    snapshot.mesh.morphTargetInfluences = undefined; snapshot.mesh.morphTargetDictionary = undefined;
  }
  const deformer = strandDeformer(geometry, strands), dynamics = strandDynamics(strands);
  const pose = new THREE.Matrix4();
  const capturePose = (): THREE.Matrix4 => {
    source.updateWorldMatrix(true, false); bone.updateWorldMatrix(true, false);
    return pose.copy(source.matrixWorld).multiply(source.bindMatrixInverse).multiply(bone.matrixWorld)
      .multiply(source.skeleton.boneInverses[headIndex]!).multiply(source.bindMatrix);
  };
  const reset = (): void => { dynamics.reset(capturePose()); deformer.reset(); };
  let motionVersion: D1LabHairMotionVersion = 'refined', motionEnabled = true;
  reset();
  return {
    geometry,
    // 九个光照版本共享新发型，切材质不改变几何或动画时钟。
    setEnabled(_enabled: boolean) { for (const snapshot of snapshots) snapshot.mesh.geometry = geometry; },
    setMotionVersion(version: D1LabHairMotionVersion) { if (version !== motionVersion) { motionVersion = version; reset(); } },
    setMotionEnabled(enabled: boolean) { if (enabled !== motionEnabled) { motionEnabled = enabled; reset(); } },
    reset,
    update(dt: number) {
      if (dt === 0 || !motionEnabled || motionVersion === 'original') return;
      dynamics.update(capturePose(), dt); deformer.update();
    },
    dispose() {
      for (const snapshot of snapshots) {
        snapshot.mesh.geometry = snapshot.geometry; snapshot.mesh.material = snapshot.material;
        snapshot.mesh.morphTargetInfluences = snapshot.influences; snapshot.mesh.morphTargetDictionary = snapshot.dictionary;
      }
      geometry.dispose(); material.dispose(); outline.dispose(); texture.dispose();
    },
  };
}
