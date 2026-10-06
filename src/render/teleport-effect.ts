import * as THREE from 'three';
import { TELEPORT_TAIL_TICKS, type TeleportState } from '../entities/teleport.ts';

const PARTICLES = 64;
const smooth = THREE.MathUtils.smoothstep;

/** Keep animation-owned uniforms live while isolating the teleport shader from cached materials. */
function fadeMaterials(models: THREE.Object3D[], amount: { value: number }) {
  const copies = new Map<THREE.Material, THREE.Material>();
  const entries: Array<{ mesh: THREE.Mesh; material: THREE.Material | THREE.Material[]; depth: THREE.Material | undefined; distance: THREE.Material | undefined }> = [];
  const owned: THREE.Material[] = [];
  function copy(original: THREE.Material): THREE.Material {
    const existing = copies.get(original);
    if (existing) return existing;
    const material = original.clone();
    if (material instanceof THREE.ShaderMaterial && original instanceof THREE.ShaderMaterial) material.uniforms = original.uniforms;
    const key = original.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      original.onBeforeCompile.call(material, shader, renderer);
      shader.uniforms.teleportDissolve = amount;
      shader.fragmentShader = `uniform float teleportDissolve;\n${shader.fragmentShader}`.replace(/void\s+main\s*\(\s*\)\s*\{/, `void main() {
        float teleportCell = fract(sin(dot(floor(gl_FragCoord.xy / 4.0), vec2(12.9898, 78.233))) * 43758.5453);
        if (teleportDissolve > teleportCell) discard;
      `).replace('#include <colorspace_fragment>', `
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.25, 1.25, 1.65), teleportDissolve * 0.45);
        #include <colorspace_fragment>
      `);
    };
    material.customProgramCacheKey = () => `${key}|teleport-block-dissolve`;
    copies.set(original, material);
    owned.push(material);
    return material;
  }
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  const distance = new THREE.MeshDistanceMaterial();
  owned.push(depth, distance);
  for (const model of models) model.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    entries.push({ mesh: node, material: node.material, depth: node.customDepthMaterial, distance: node.customDistanceMaterial });
    node.material = Array.isArray(node.material) ? node.material.map(copy) : copy(node.material);
    node.customDepthMaterial = copy(node.customDepthMaterial ?? depth);
    node.customDistanceMaterial = copy(node.customDistanceMaterial ?? distance);
  });
  return {
    sync() {
      // Weapon lights and thrusters keep updating their original materials during the short dissolve.
      for (const [original, material] of copies) {
        material.opacity = original.opacity;
        if ('color' in original && original.color instanceof THREE.Color && 'color' in material && material.color instanceof THREE.Color) material.color.copy(original.color);
        if ('emissive' in original && original.emissive instanceof THREE.Color && 'emissive' in material && material.emissive instanceof THREE.Color) material.emissive.copy(original.emissive);
      }
    },
    dispose() {
      for (const entry of entries) {
        entry.mesh.material = entry.material;
        entry.mesh.customDepthMaterial = entry.depth;
        entry.mesh.customDistanceMaterial = entry.distance;
      }
      for (const material of owned) material.dispose();
    },
  };
}

/** Bake once: the departing silhouette must not follow the live skeleton to its destination. */
function capturePose(models: THREE.Object3D[], ghost: THREE.Group, material: THREE.Material, state: TeleportState): THREE.Vector3[] {
  const point = new THREE.Vector3();
  const offset = new THREE.Vector3(state.moved ? state.from.x - state.target.x : 0, state.moved ? state.from.y - state.target.y : 0, 0);
  for (const model of models) {
    model.updateWorldMatrix(true, true);
    model.traverseVisible(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      if (materials.every(item => item instanceof THREE.ShaderMaterial || !item.visible || item.opacity === 0)) return;
      if (node instanceof THREE.SkinnedMesh) node.skeleton.update();
      const positions = node.geometry.getAttribute('position');
      const frozen = new Float32Array(positions.count * 3);
      for (let i = 0; i < positions.count; i++) {
        node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld).add(offset);
        point.toArray(frozen, i * 3);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(frozen, 3));
      if (node.geometry.index) geometry.setIndex(node.geometry.index.clone());
      geometry.setDrawRange(node.geometry.drawRange.start, node.geometry.drawRange.count);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      ghost.add(mesh);
    });
  }
  const geometries = ghost.children.map(node => (node as THREE.Mesh).geometry.getAttribute('position'));
  const count = geometries.reduce((sum, attribute) => sum + attribute.count, 0);
  return Array.from({ length: PARTICLES }, (_, index) => {
    let vertex = Math.floor((index + 0.5) / PARTICLES * count);
    let meshIndex = 0;
    while (vertex >= geometries[meshIndex]!.count) vertex -= geometries[meshIndex++]!.count;
    return new THREE.Vector3().fromBufferAttribute(geometries[meshIndex]!, vertex).sub(new THREE.Vector3(state.from.x, state.from.y, 0));
  });
}

function createEndpoint() {
  const root = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: '#91efff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending });
  const ringGeometry = new THREE.RingGeometry(.96, 1, 72);
  const ground = new THREE.Mesh(ringGeometry, material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = .035;
  const arcGeometry = new THREE.RingGeometry(.982, 1, 40, 1, 0, Math.PI * 1.35);
  const arcs = [new THREE.Mesh(arcGeometry, material), new THREE.Mesh(arcGeometry, material)];
  root.add(ground, ...arcs);
  return {
    root, material,
    update(height: number, width: number, time: number, charge: number, arrival: number) {
      ground.scale.setScalar(width * (1.35 + arrival * 1.6));
      for (let i = 0; i < arcs.length; i++) {
        const arc = arcs[i]!;
        arc.position.set(0, height * .52, i * .025 + .08);
        arc.scale.set(width * (1.15 + i * .22), height * (.55 + i * .025), 1);
        arc.rotation.z = time * (i === 0 ? 3 : -2) + i * Math.PI;
        arc.visible = charge > .15;
      }
    },
    dispose() { ringGeometry.dispose(); arcGeometry.dispose(); material.dispose(); },
  };
}

/** Shared by player forms and bosses. Attach root at world origin, outside the moving model. */
export function createTeleportEffect(models: THREE.Object3D[]) {
  const root = new THREE.Group();
  root.name = 'teleport-effect';
  root.visible = false;
  const source = createEndpoint(), destination = createEndpoint();
  const ghost = new THREE.Group();
  const ghostMaterial = new THREE.MeshBasicMaterial({ color: '#6bdeff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const particleMaterial = new THREE.MeshBasicMaterial({ color: '#8ceaff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const particles = new THREE.InstancedMesh(geometry, particleMaterial, PARTICLES * 2);
  particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particles.frustumCulled = false;
  const dummy = new THREE.Object3D();
  root.add(source.root, destination.root, ghost, particles);
  const dissolve = { value: 0 };
  let active: TeleportState | undefined;
  let fade: ReturnType<typeof fadeMaterials> | undefined;
  let samples: THREE.Vector3[] = [];
  function clear() {
    dissolve.value = 0;
    fade?.dispose();
    fade = undefined;
    for (const node of ghost.children) (node as THREE.Mesh).geometry.dispose();
    ghost.clear();
    root.visible = false;
    active = undefined;
  }
  return {
    root,
    update(state: TeleportState | undefined, alpha: number, step: number, height: number, halfWidth: number) {
      if (state === undefined) { if (active !== undefined) clear(); return; }
      if (active !== state) {
        clear();
        active = state;
        samples = capturePose(models, ghost, ghostMaterial, state);
        fade = fadeMaterials(models, dissolve);
        root.visible = true;
      }
      const ticks = state.ticks + alpha;
      const before = Math.min(1, ticks / state.moveTicks);
      const after = Math.max(0, (ticks - state.moveTicks) / TELEPORT_TAIL_TICKS);
      const departure = smooth(before, .5, 1);
      const recovery = smooth(after, 0, .65);
      const remaining = 1 - smooth(after, .2, 1);
      dissolve.value = state.moved ? 1 - recovery : departure;
      fade!.sync();
      source.root.position.set(state.from.x, state.from.y, 0);
      destination.root.position.set(state.target.x, state.target.y, 0);
      const width = Math.max(halfWidth, height * .2);
      source.update(height, width, ticks * step, before, 0);
      destination.update(height, width, ticks * step, before, state.moved ? after : 0);
      source.material.opacity = (state.moved ? remaining * .45 : .2 + before * .55);
      destination.material.opacity = state.moved ? remaining * .85 : .1 + before * .3;
      destination.root.visible = ticks < state.moveTicks || state.moved;
      ghostMaterial.opacity = state.moved ? remaining * .14 : departure * .13;
      particleMaterial.opacity = state.moved ? remaining * .85 : departure * .85;
      for (let endpoint = 0; endpoint < 2; endpoint++) for (let i = 0; i < PARTICLES; i++) {
        const sample = samples[i]!;
        const angle = i * 2.399963;
        const spread = endpoint === 0 ? departure * .45 + after * .55 : (1 - recovery) * .5;
        const anchor = endpoint === 0 ? state.from : state.target;
        dummy.position.set(anchor.x + sample.x + Math.cos(angle) * spread, anchor.y + sample.y + Math.sin(angle * 1.7) * spread, sample.z + .1 + Math.sin(angle) * spread);
        dummy.rotation.set(angle + ticks * step, angle * .7, ticks * step * 3);
        const visible = endpoint === 0 || state.moved;
        dummy.scale.setScalar(visible ? height * (.012 + i % 3 * .003) * (endpoint === 0 ? 1 : 1 - recovery * .7) : 0);
        dummy.updateMatrix();
        particles.setMatrixAt(endpoint * PARTICLES + i, dummy.matrix);
      }
      particles.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      clear();
      source.dispose(); destination.dispose();
      particles.dispose();
      ghostMaterial.dispose(); geometry.dispose(); particleMaterial.dispose();
      root.removeFromParent(); root.clear();
    },
  };
}
