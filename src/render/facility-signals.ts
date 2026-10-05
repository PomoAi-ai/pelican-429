import * as THREE from 'three';
import type { FacilityLamp } from './facility-lighting.ts';

export type FacilitySignalKind = 'power' | 'nvlink' | 'network';
export type FacilitySignalPoint = readonly [number, number, number];

export interface FacilitySignalRoute {
  readonly points: readonly FacilitySignalPoint[];
  readonly kind: FacilitySignalKind;
}

interface Segment {
  readonly from: THREE.Vector3;
  readonly direction: THREE.Vector3;
  readonly start: number;
  readonly end: number;
}

interface Path {
  readonly segments: readonly Segment[];
  readonly length: number;
  readonly bounds: THREE.Sphere;
  visible: boolean;
}

interface SignalParticle {
  readonly path: Path;
  readonly distance: number;
  readonly speed: number;
  readonly lane: number;
}

type Glyph = 0 | 1 | 2 | 3;

interface SignalBatch {
  readonly mesh: THREE.InstancedMesh;
  readonly kind: FacilitySignalKind;
  readonly glyph: Glyph;
  readonly particles: readonly SignalParticle[];
}

const STYLES = {
  power: { color: 0xc4c1ad, lanes: 1, spacing: 7, laneGap: 0, speed: 8 },
  nvlink: { color: 0x65b5a4, lanes: 1, spacing: 1.15, laneGap: 0, speed: 4 },
  network: { color: 0x859fb8, lanes: 2, spacing: 1.65, laneGap: 0.24, speed: 7 },
} as const;

function flowingRibbon(routes: readonly FacilitySignalRoute[], kind: FacilitySignalKind) {
  const positions: number[] = [], uv: number[] = [];
  const width = kind === 'nvlink' ? 0.14 : kind === 'power' ? 0.28 : 0.38;
  for (const route of routes) {
    if (route.kind !== kind) continue;
    let distance = 0;
    for (let index = 1; index < route.points.length; index++) {
      const a = new THREE.Vector3(...route.points[index - 1]!);
      const b = new THREE.Vector3(...route.points[index]!);
      const direction = b.clone().sub(a);
      const length = direction.length();
      const normal = new THREE.Vector3(-direction.y, direction.x, 0).normalize().multiplyScalar(width / 2);
      const corners = [a.clone().sub(normal), a.clone().add(normal), b.clone().sub(normal), b.clone().add(normal)];
      for (const vertex of [0, 2, 1, 1, 2, 3]) {
        const point = corners[vertex]!;
        positions.push(point.x, point.y, point.z + 0.21);
        uv.push(distance + (vertex >= 2 ? length : 0), vertex % 2);
      }
      distance += length;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, speed: { value: STYLES[kind].speed },
      period: { value: kind === 'nvlink' ? 3 : 9 }, color: { value: new THREE.Color(STYLES[kind].color) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv;
      uniform float time; uniform float speed; uniform float period; uniform vec3 color;
      void main() {
        float behind = fract((time * speed - vUv.x) / period);
        float trail = exp(-behind * 10.0);
        float edge = 1.0 - smoothstep(0.05, 0.5, abs(vUv.y - 0.5));
        float core = pow(edge, 5.0);
        float energy = 0.06 * core + trail * (0.32 * edge + 0.5 * core);
        gl_FragColor = vec4(color, energy);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  return mesh;
}

function signalAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Facility signals require a canvas 2D context');
  context.fillStyle = '#ffffff';
  context.strokeStyle = '#ffffff';
  context.shadowColor = '#ffffff';
  context.shadowBlur = 3;
  context.font = 'bold 104px ui-monospace, monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('0', 64, 66);
  context.fillText('1', 192, 66);
  context.lineWidth = 6;
  context.lineJoin = 'round';
  context.strokeRect(275, 34, 88, 60);
  context.fillRect(287, 47, 12, 34);
  context.fillRect(307, 47, 12, 34);
  context.fillRect(327, 47, 23, 12);
  context.fillRect(327, 69, 23, 12);
  context.lineWidth = 8;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(399, 81);
  context.lineTo(431, 41);
  context.lineTo(425, 74);
  context.lineTo(453, 51);
  context.lineTo(469, 77);
  context.lineTo(497, 39);
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function glyphGeometry(glyph: Glyph) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const uv = geometry.getAttribute('uv');
  for (let vertex = 0; vertex < uv.count; vertex++) uv.setX(vertex, (uv.getX(vertex) + glyph) / 4);
  return geometry;
}

function cablePath(points: readonly FacilitySignalPoint[]): Path {
  const segments: Segment[] = [];
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    const from = new THREE.Vector3(...points[index - 1]!);
    const direction = new THREE.Vector3(...points[index]!).sub(from);
    const start = length;
    length += direction.length();
    segments.push({ from, direction: direction.normalize(), start, end: length });
  }
  const bounds = new THREE.Box3().setFromPoints(points.map((point) => new THREE.Vector3(...point)))
    .expandByScalar(1).getBoundingSphere(new THREE.Sphere());
  return { segments, length, bounds, visible: true };
}

function samplePath(path: Path, distance: number, position: THREE.Vector3) {
  let index = 0;
  while (distance > path.segments[index]!.end) index++;
  const segment = path.segments[index]!;
  position.copy(segment.from).addScaledVector(segment.direction, distance - segment.start);
  return segment.direction;
}

function signalBatches(routes: readonly FacilitySignalRoute[], geometries: readonly THREE.PlaneGeometry[], materials: Record<FacilitySignalKind, THREE.MeshBasicMaterial>) {
  const recipes = new Map<string, { kind: FacilitySignalKind; glyph: Glyph; particles: SignalParticle[] }>();
  const paths: Path[] = [];
  for (const [routeIndex, route] of routes.entries()) {
    const path = cablePath(route.points);
    paths.push(path);
    const style = STYLES[route.kind];
    const count = Math.ceil(path.length / style.spacing);
    for (let lane = 0; lane < style.lanes; lane++) for (let index = 0; index < count; index++) {
      const glyph: Glyph = route.kind === 'power' ? 3 : route.kind === 'network' && index % 4 === 0 ? 2
        : (((index * 7 + lane * 3 + routeIndex) % 13) % 2) as 0 | 1;
      const key = `${route.kind}:${glyph}`;
      let recipe = recipes.get(key);
      if (!recipe) {
        recipe = { kind: route.kind, glyph, particles: [] };
        recipes.set(key, recipe);
      }
      recipe.particles.push({ path, distance: (index + lane * 0.27 + routeIndex * 0.11) * path.length / count,
        speed: style.speed * (lane === 1 ? -0.84 : 1), lane: (lane - (style.lanes - 1) / 2) * style.laneGap });
    }
  }
  const batches: SignalBatch[] = [];
  for (const recipe of recipes.values()) {
    const mesh = new THREE.InstancedMesh(geometries[recipe.glyph], materials[recipe.kind], recipe.particles.length);
    mesh.name = `facility-signal-${recipe.kind}-${recipe.glyph}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Visibility is handled per path and glyph; hide until the first camera update.
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    batches.push({ mesh, ...recipe });
  }
  return { batches, paths };
}

export function createFacilitySignals(parent: THREE.Object3D, routes: readonly FacilitySignalRoute[]) {
  const root = new THREE.Group();
  root.name = 'facility-signals';
  const atlas = signalAtlas();
  const geometries = ([0, 1, 2, 3] as const).map(glyphGeometry);
  const material = (kind: FacilitySignalKind) => new THREE.MeshBasicMaterial({
    map: atlas, color: STYLES[kind].color, opacity: kind === 'power' ? 0.5 : 0.65, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false,
  });
  const materials = { power: material('power'), nvlink: material('nvlink'), network: material('network') };
  const { batches, paths } = signalBatches(routes, geometries, materials);
  for (const batch of batches) root.add(batch.mesh);
  const ribbons = (['power', 'nvlink', 'network'] as const).map((kind) => flowingRibbon(routes, kind));
  root.add(...ribbons);
  const pulses = routes.filter((route) => route.kind !== 'nvlink').map((route) => ({
    path: cablePath(route.points), speed: STYLES[route.kind].speed,
    lamp: { position: new THREE.Vector3(), color: new THREE.Color(STYLES[route.kind].color),
      intensity: route.kind === 'power' ? 45 : 55, distance: 12 } satisfies FacilityLamp,
  }));
  const motion = new THREE.Object3D();
  const frustum = new THREE.Frustum();
  const projection = new THREE.Matrix4();
  const glyphBounds = new THREE.Sphere(motion.position, 0.85);
  const update = (time: number, camera: THREE.Camera): void => {
    frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (const path of paths) path.visible = frustum.intersectsSphere(path.bounds);
    for (const ribbon of ribbons) ribbon.material.uniforms.time!.value = time;
    for (const pulse of pulses) {
      samplePath(pulse.path, (time * pulse.speed) % pulse.path.length, pulse.lamp.position);
      pulse.lamp.position.z += 1.3;
    }
    for (const batch of batches) {
      const binary = batch.glyph < 2;
      const size = batch.kind === 'nvlink' ? 0.3 : 0.56;
      motion.scale.set(binary ? size * 0.7 : batch.glyph === 2 ? 0.7 : 0.85, binary ? size : 0.42, 1);
      let count = 0;
      for (const particle of batch.particles) {
        if (!particle.path.visible) continue;
        const distance = ((particle.distance + time * particle.speed) % particle.path.length + particle.path.length) % particle.path.length;
        const direction = samplePath(particle.path, distance, motion.position);
        const offset = particle.lane;
        motion.position.x -= direction.y * offset;
        motion.position.y += direction.x * offset;
        motion.position.z += 0.24;
        if (!frustum.intersectsSphere(glyphBounds)) continue;
        const angle = Math.atan2(direction.y, direction.x);
        motion.rotation.z = binary ? angle + (direction.x < 0 ? Math.PI : 0) : angle;
        motion.updateMatrix();
        batch.mesh.setMatrixAt(count++, motion.matrix);
      }
      batch.mesh.count = count;
      batch.mesh.instanceMatrix.clearUpdateRanges();
      if (count > 0) {
        batch.mesh.instanceMatrix.addUpdateRange(0, count * 16);
        batch.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  };
  parent.add(root);
  return {
    lamps: pulses.map((pulse) => pulse.lamp),
    update,
    dispose() {
      root.removeFromParent();
      for (const batch of batches) batch.mesh.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const item of Object.values(materials)) item.dispose();
      for (const ribbon of ribbons) { ribbon.geometry.dispose(); ribbon.material.dispose(); }
      atlas.dispose();
      root.clear();
    },
  };
}
