import * as THREE from 'three';
import { hash01 } from '../core/rng.ts';
import { FORTRESS_CHASM, FORTRESS_COOLANT } from '../config/facility-structure.ts';
import { BLOCK_BACK_Z, BLOCK_FRONT_Z } from './tile-geometry.ts';
import type { FacilityKit } from './facility-kit.ts';

const SURFACE_FRAGMENT = `
uniform float uTime;
uniform vec2 uSize;
varying vec2 vUv;
void main() {
  float wave = sin(vUv.x * uSize.x * 4.6 + uTime * 1.3 + sin(vUv.y * 13.0)) * 0.5 + 0.5;
  float ripple = 0.0;
  for (int i = 0; i < 8; i++) {
    float n = float(i);
    float phase = fract(uTime * 0.19 + n * 0.27);
    vec2 p = (vUv - vec2(0.06 + n * 0.125, 0.45 + sin(n * 4.0) * 0.2)) * uSize;
    ripple += exp(-pow((length(p) - phase * 1.2) * 24.0, 2.0)) * (1.0 - phase);
  }
  vec3 color = mix(vec3(0.04, 0.23, 0.19), vec3(0.18, 0.47, 0.36), wave * 0.32);
  color += vec3(0.22, 0.4, 0.31) * ripple * 0.42;
  gl_FragColor = vec4(color, 0.85 + ripple * 0.12);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** The liquid shares the lethal area; warning posts mark the outdoor crossing. */
export function createFortressCoolant(k: FacilityKit) {
  const pool = FORTRESS_COOLANT;
  const surfaceY = pool.y + pool.h;
  const depth = BLOCK_FRONT_Z - BLOCK_BACK_Z;
  const centerZ = (BLOCK_FRONT_Z + BLOCK_BACK_Z) / 2;
  const root = new THREE.Group();
  root.name = 'fortress-coolant-pool';
  k.root.add(root);
  const time = { value: 0 };
  const liquidMaterial = new THREE.MeshStandardMaterial({
    color: 0x246658, emissive: 0x164b3b, emissiveIntensity: 0.15,
    roughness: 0.45, metalness: 0.05, transparent: true, opacity: 0.82, depthWrite: false,
  });
  const liquidGeometry = new THREE.BoxGeometry(pool.w, pool.h, depth);
  const liquid = new THREE.Mesh(liquidGeometry, liquidMaterial);
  liquid.position.set(pool.x + pool.w / 2, pool.y + pool.h / 2, centerZ);
  root.add(liquid);
  const surfaceGeometry = new THREE.PlaneGeometry(pool.w, depth);
  const surfaceMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uSize: { value: new THREE.Vector2(pool.w, depth) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: SURFACE_FRAGMENT, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
  surface.position.set(pool.x + pool.w / 2, surfaceY + 0.01, centerZ);
  surface.rotation.x = -Math.PI / 2;
  root.add(surface);

  const bubbleGeometry = new THREE.SphereGeometry(1, 12, 8);
  const bubbleMaterial = new THREE.MeshStandardMaterial({
    color: 0x6fae91, emissive: 0x235d46, emissiveIntensity: 0.35,
    roughness: 0.2, metalness: 0.12, transparent: true, opacity: 0.48, depthWrite: false,
  });
  const bubbles = new THREE.InstancedMesh(bubbleGeometry, bubbleMaterial, 96);
  bubbles.name = 'coolant-rising-bubbles';
  bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bubbles.boundingSphere = new THREE.Sphere(new THREE.Vector3(pool.x + pool.w / 2, pool.y + pool.h / 2, centerZ),
    Math.hypot(pool.w, pool.h, depth) / 2 + 1);
  // Bubbles remain visible through the translucent cutaway front of the pool.
  bubbles.renderOrder = 1;
  root.add(bubbles);
  const motion = new THREE.Object3D();
  const particles = Array.from({ length: bubbles.count }, (_, i) => ({
    x: pool.x + 0.8 + hash01(i, 1, 429) * (pool.w - 1.6),
    phase: hash01(i, 2, 429), speed: 0.055 + hash01(i, 3, 429) * 0.035,
    radius: 0.12 + hash01(i, 4, 429) * 0.16,
  }));
  for (const x of [FORTRESS_CHASM.left - 0.2, FORTRESS_CHASM.right + 0.2]) {
    k.box(x, surfaceY + 0.4, centerZ, 0.4, 1.1, depth, k.dark);
    for (let stripe = 0; stripe < 3; stripe++) {
      k.box(x, surfaceY + stripe * 0.35, BLOCK_FRONT_Z + 0.015, 0.42, 0.13, 0.03, k.yellow);
    }
  }
  k.panel('COOLANT / DANGER', pool.x + 1.1, surfaceY + 2, -0.7, 4.2, 0.65);
  for (const x of [62, 122, 182]) k.light(x, surfaceY + 0.4, 0.2, 0x78c1a0, 55, 30);

  return {
    update(value: number): void {
      time.value = value;
      particles.forEach((bubble, i) => {
        const phase = (value * bubble.speed + bubble.phase) % 1;
        const rise = Math.min(phase / 0.9, 1);
        const burst = Math.max(0, (phase - 0.9) / 0.1);
        const radius = bubble.radius * Math.min(phase * 18, 1);
        motion.position.set(bubble.x + Math.sin(value * 0.7 + i) * 0.14,
          pool.y + 0.3 + rise * (pool.h - 0.3), 0.12);
        motion.scale.set(radius * (1 + burst * 2), radius * (1 - burst), radius * (1 - burst));
        motion.updateMatrix();
        bubbles.setMatrixAt(i, motion.matrix);
      });
      bubbles.instanceMatrix.needsUpdate = true;
    },
    dispose(): void {
      root.removeFromParent();
      for (const resource of [liquidGeometry, liquidMaterial, surfaceGeometry, surfaceMaterial,
        bubbleGeometry, bubbleMaterial, bubbles]) resource.dispose();
    },
  };
}
